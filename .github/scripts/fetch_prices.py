#!/usr/bin/env python3
"""
PAC Terminal — daily price fetcher (produzione).

Eseguito da .github/workflows/update-prices.yml due volte al giorno
(07:30 e 18:30 UTC) + on-demand via workflow_dispatch.

Fallback chain (per ticker):
  1. yfinance (primario)
  2. Google Sheets CSV pubblico (secondario, legacy)
  Niente Stooq: la diagnostica (PR #15/#16) ha confermato HTML/CAPTCHA
  sistematici, non automatizzabile.

Output (scritti in /data del repo):
  - prices.json    prezzi correnti in EUR per i 5 ETF + tasso FX EURGBP
  - history.json   closes giornalieri EUR per VWCE + CSNDX (~380 giorni)
  - health.json    per-ticker: fonte usata, last_success, consecutive_failures,
                   alert_needed (≥3 fallimenti consecutivi → flag per Task F)

Failure policy:
  Se un ticker fallisce sia su yfinance sia su Sheets, si incrementa
  consecutive_failures in health.json. A ≥3 si setta alert_needed=true:
  l'hook di invio email (via Resend) sarà aggiunto dal Task Group F.
"""

import csv
import json
import math
import re
import sys
import warnings
from datetime import datetime, timedelta, timezone
from pathlib import Path

warnings.filterwarnings("ignore")

import requests
import yfinance as yf

UTC = timezone.utc
REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "data"

# -----------------------------------------------------------------------------
# Configurazione ticker
# -----------------------------------------------------------------------------
# CSPX risolto a CSPX.AS (Amsterdam, EUR) perché CSPX.MI ritorna empty_history
# su yfinance — vedi diagnostica PR #16. Stesso ETF, valuta nativa EUR,
# nessuna conversione FX richiesta.
#
# VETA.L resta come ticker yfinance ma richiede conversione GBP→EUR via
# EURGBP=X. Il deep dive ha confermato che yfinance ritorna pound (non pence):
# 20.57 GBP × ~1.16 EUR/GBP ≈ 23.86 EUR ≈ currentPriceFallback 23.71 in config.
TICKERS = {
    "VWCE":  {"yf": "VWCE.MI",  "sheets": "VWCE.MI",  "currency": "EUR"},
    "CSNDX": {"yf": "CSNDX.MI", "sheets": "CSNDX.MI", "currency": "EUR"},
    "CSPX":  {"yf": "CSPX.AS",  "sheets": "CSPX.MI",  "currency": "EUR"},
    "SWDA":  {"yf": "SWDA.MI",  "sheets": "SWDA.MI",  "currency": "EUR"},
    "VETA":  {"yf": "VETA.L",   "sheets": "VETA.MI",  "currency": "GBP",
              "needs_fx": True, "fx_pair": "EURGBP=X"},
}

TICKERS_WITH_HISTORY = ["VWCE", "CSNDX"]
HISTORY_DAYS = 380

# Soglia per alert (Task F): N fallimenti consecutivi del ticker prima di
# triggerare email al maintainer.
FAILURE_THRESHOLD_FOR_ALERT = 3

# -----------------------------------------------------------------------------
# Endpoint Google Sheets (fallback). Stessi URL usati oggi da priceProvider.js.
# -----------------------------------------------------------------------------
SHEET_ID = "1ohNhmE4UUXVmVycuFn2sMcAvpk0ZkwfleHP8fgaxemY"
PUBLISH_ID = ("2PACX-1vSA078B6Q5XKyReR0tAjNT5hDEuE4RQSoAdEsa3t9KWSzjfYE2S4"
              "OtJ3wazmvU7gMnYveo2OIB0wAFs")
SHEETS_CURRENT_URLS = [
    f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq?tqx=out:csv&gid=0",
    f"https://docs.google.com/spreadsheets/d/e/{PUBLISH_ID}/pub?gid=0&single=true&output=csv",
]
SHEETS_HISTORY_URLS = [
    f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq?tqx=out:csv&gid=1714634805",
    f"https://docs.google.com/spreadsheets/d/e/{PUBLISH_ID}/pub?gid=1714634805&single=true&output=csv",
]
SHEETS_TIMEOUT_S = 15


# -----------------------------------------------------------------------------
# yfinance fetchers
# -----------------------------------------------------------------------------
def fetch_yf_price(yf_ticker):
    """Restituisce (price, currency_string_or_None). Solleva su fallimento.

    NOTA IMPLEMENTATIVA: si usa history(period='5d').Close invece di
    fast_info.last_price perché su ticker a basso volume (es. VETA.L)
    fast_info ritorna None. Verificato nel deep-dive smoke-test v2 (PR #16):
    fast_info.last_price = None mentre history.last_close = 20.5653 GBP.

    Sui ticker europei (.MI, .AS, .L) yfinance può restituire una riga
    finale per la sessione corrente non ancora consolidata con Close=NaN.
    Selezioniamo l'ultimo close *finito e positivo* (TASK 0 — fix bug NaN).
    """
    t = yf.Ticker(yf_ticker)
    hist = t.history(period="5d", auto_adjust=False)
    if hist is None or hist.empty:
        raise RuntimeError("empty_history")
    closes = hist["Close"].dropna()
    closes = closes[closes > 0]
    if closes.empty:
        raise RuntimeError("no_finite_close")
    dropped = len(hist) - len(closes)
    if dropped > 0:
        print(f"[yf:{yf_ticker}] dropped {dropped} non-finite close row(s)",
              file=sys.stderr)
    price = float(closes.iloc[-1])
    if not math.isfinite(price) or price <= 0:
        raise RuntimeError("no_finite_close")
    currency = None
    try:
        info = t.info or {}
        currency = info.get("currency") or info.get("financialCurrency")
    except Exception:
        pass  # currency rimane None — useremo quella dichiarata in TICKERS
    return price, currency


def fetch_yf_history(yf_ticker, days):
    """Lista di dict {date: YYYY-MM-DD, close: float}. Solleva su fallimento."""
    t = yf.Ticker(yf_ticker)
    hist = t.history(period=f"{days}d", auto_adjust=False)
    if hist is None or hist.empty:
        raise RuntimeError("empty_history")
    out = []
    dropped = 0
    for date, row in hist.iterrows():
        close = row.get("Close")
        is_finite = close is not None and math.isfinite(close) and close > 0
        if is_finite:
            out.append({
                "date": date.strftime("%Y-%m-%d"),
                "close": round(float(close), 4),
            })
        else:
            dropped += 1
    if dropped > 0:
        print(f"[hist:{yf_ticker}] dropped {dropped} non-finite close row(s)",
              file=sys.stderr)
    return out


def fetch_fx_rate(pair):
    """e.g. 'EURGBP=X' → float: how many GBP for 1 EUR."""
    price, _ = fetch_yf_price(pair)
    return price


# -----------------------------------------------------------------------------
# Sheets fallback — parser compatibile con priceProvider.js (gviz/tq endpoint)
# -----------------------------------------------------------------------------
def _it_number(s):
    if not s:
        return None
    s = s.strip().replace("€", "").replace(" ", "").replace(" ", "")
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except (ValueError, TypeError):
        return None


def _it_date(s):
    m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{4})", (s or "").strip())
    if not m:
        return None
    dd, mm, yyyy = m.groups()
    return f"{yyyy}-{int(mm):02d}-{int(dd):02d}"


def _fetch_sheet_csv(urls):
    """Restituisce il testo della prima URL che risponde 200; None altrimenti."""
    for url in urls:
        try:
            r = requests.get(url, timeout=SHEETS_TIMEOUT_S)
            if r.status_code == 200 and r.text:
                return r.text
        except requests.RequestException as e:
            print(f"[sheets] {url[:60]}…: {type(e).__name__}", file=sys.stderr)
    return None


def fetch_sheets_current(ticker_sheets_id):
    """Cerca il ticker in gid=0 e ritorna (price_eur, currency_str)."""
    text = _fetch_sheet_csv(SHEETS_CURRENT_URLS)
    if not text:
        raise RuntimeError("sheets_unreachable")
    for row in csv.reader(text.splitlines()):
        if len(row) < 6:
            continue
        if (row[1] or "").strip() == ticker_sheets_id:
            price_eur = _it_number(row[5])
            currency = (row[4] or "").strip()
            if price_eur and price_eur > 0:
                return price_eur, currency
    raise RuntimeError("ticker_not_in_sheet")


def fetch_sheets_history(ticker_id, days):
    """Schema del foglio history (vedi priceProvider.parseHistorySheet):
       col 0=date VWCE, col 1=close VWCE EUR,
       col 3=date CNDX, col 6=close CNDX EUR (col 4=USD raw fallback).
    """
    cols_map = {
        "VWCE.MI":  (0, 1),
        "CSNDX.MI": (3, 6),
    }
    if ticker_id not in cols_map:
        raise RuntimeError("history_not_in_sheet")
    date_col, close_col = cols_map[ticker_id]
    text = _fetch_sheet_csv(SHEETS_HISTORY_URLS)
    if not text:
        raise RuntimeError("sheets_unreachable")
    out = []
    for row in csv.reader(text.splitlines()):
        if len(row) <= close_col:
            continue
        d = _it_date(row[date_col])
        c = _it_number(row[close_col])
        if d and c and c > 0:
            out.append({"date": d, "close": round(c, 4)})
    if not out:
        raise RuntimeError("empty_history")
    out.sort(key=lambda x: x["date"])
    return out[-days:]


# -----------------------------------------------------------------------------
# Health state persistente
# -----------------------------------------------------------------------------
def load_health():
    path = DATA_DIR / "health.json"
    if path.exists():
        try:
            return json.loads(path.read_text())
        except json.JSONDecodeError:
            print("[health] file corrotto, reinizializzo", file=sys.stderr)
    return {"tickers": {}}


def _ticker_record(health, name):
    rec = health["tickers"].get(name) or {
        "consecutive_failures": 0,
        "last_success": None,
        "last_source": None,
        "alert_needed": False,
    }
    health["tickers"][name] = rec
    return rec


def _record_success(rec, source):
    rec["consecutive_failures"] = 0
    rec["last_success"] = datetime.now(UTC).isoformat()
    rec["last_source"] = source
    rec["alert_needed"] = False


def _record_failure(rec):
    rec["consecutive_failures"] = (rec.get("consecutive_failures") or 0) + 1
    rec["last_failure"] = datetime.now(UTC).isoformat()
    rec["alert_needed"] = rec["consecutive_failures"] >= FAILURE_THRESHOLD_FOR_ALERT


# -----------------------------------------------------------------------------
# Pipeline principale
# -----------------------------------------------------------------------------
def fetch_current_for_ticker(name, info, fx_eur_to_gbp):
    """Ritorna (record_dict_or_None, source_used_str)."""
    price_native = None
    source = None

    # 1) yfinance
    try:
        price_native, ccy_from_yf = fetch_yf_price(info["yf"])
        source = "yfinance"
        if ccy_from_yf and ccy_from_yf.upper() != info["currency"].upper():
            print(
                f"[WARN] {name}: yfinance currency '{ccy_from_yf}' differs "
                f"from configured '{info['currency']}' — using configured",
                file=sys.stderr,
            )
    except Exception as e:
        print(f"[{name}] yfinance failed: {type(e).__name__}: {e}", file=sys.stderr)

    # 2) Sheets fallback (price restituito è già in EUR)
    if price_native is None:
        try:
            price_eur_from_sheet, _ = fetch_sheets_current(info["sheets"])
            return (
                {
                    "price_native": price_eur_from_sheet,
                    "price_eur": round(price_eur_from_sheet, 4),
                    "currency": "EUR",
                    "needs_fx": False,
                    "source": "google_sheets",
                },
                "google_sheets",
            )
        except Exception as e:
            print(f"[{name}] sheets failed: {type(e).__name__}: {e}", file=sys.stderr)
            return None, "FAILED"

    # Conversione in EUR
    currency = info["currency"]
    if currency == "EUR":
        price_eur = price_native
    elif currency == "GBP":
        if (fx_eur_to_gbp is None
                or not math.isfinite(fx_eur_to_gbp)
                or fx_eur_to_gbp <= 0):
            print(f"[{name}] FX rate non disponibile, conversione GBP→EUR impossibile", file=sys.stderr)
            return None, "FX_FAILED"
        # EURGBP=X = GBP per 1 EUR. Per ottenere EUR: price_gbp / EURGBP.
        price_eur = price_native / fx_eur_to_gbp
    else:
        print(f"[{name}] currency {currency} non gestita", file=sys.stderr)
        return None, "UNHANDLED_CURRENCY"

    return (
        {
            "price_native": round(price_native, 4),
            "price_eur": round(price_eur, 4),
            "currency": currency,
            "needs_fx": info.get("needs_fx", False),
            "source": source,
        },
        source,
    )


def fetch_history_for_ticker(name, info):
    """Ritorna (data_list, source_str). Lista vuota se entrambi falliscono."""
    try:
        data = fetch_yf_history(info["yf"], HISTORY_DAYS)
        return data, "yfinance"
    except Exception as e:
        print(f"[hist:{name}] yfinance failed: {type(e).__name__}: {e}", file=sys.stderr)
    try:
        data = fetch_sheets_history(info["sheets"], HISTORY_DAYS)
        return data, "google_sheets"
    except Exception as e:
        print(f"[hist:{name}] sheets failed: {type(e).__name__}: {e}", file=sys.stderr)
    return [], None


def main():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    health = load_health()
    health.setdefault("tickers", {})

    now_iso = datetime.now(UTC).isoformat()

    # FX rate (necessario per VETA)
    fx_eur_to_gbp = None
    if any(t.get("needs_fx") for t in TICKERS.values()):
        try:
            fx_eur_to_gbp = fetch_fx_rate("EURGBP=X")
            print(f"[FX] EURGBP=X → {fx_eur_to_gbp} (GBP per 1 EUR)", file=sys.stderr)
        except Exception as e:
            print(f"[FX] failed: {type(e).__name__}: {e}", file=sys.stderr)

    # Prezzi correnti
    out_current = {
        "updated_at": now_iso,
        "fx_rates": {"EURGBP": fx_eur_to_gbp},
        "current": {},
        "sources_used": {},
    }

    for name, info in TICKERS.items():
        rec = _ticker_record(health, name)
        ticker_record, source = fetch_current_for_ticker(name, info, fx_eur_to_gbp)
        out_current["sources_used"][name] = source
        if ticker_record is not None:
            out_current["current"][name] = ticker_record
            _record_success(rec, source)
        else:
            _record_failure(rec)

    # History (solo VWCE + CSNDX)
    out_history = {"updated_at": now_iso, "tickers": {}}
    for name in TICKERS_WITH_HISTORY:
        info = TICKERS[name]
        data, source = fetch_history_for_ticker(name, info)
        out_history["tickers"][name] = {"source": source, "data": data}

    health["updated_at"] = now_iso

    # Scrivi i 3 file. allow_nan=False: se un NaN raggiungesse comunque
    # l'output, fallisce qui (fail-loud) invece di produrre token "NaN"
    # non-standard che farebbero crashare JSON.parse a valle.
    (DATA_DIR / "prices.json").write_text(
        json.dumps(out_current, indent=2, ensure_ascii=False, allow_nan=False) + "\n"
    )
    (DATA_DIR / "history.json").write_text(
        json.dumps(out_history, indent=2, ensure_ascii=False, allow_nan=False) + "\n"
    )
    (DATA_DIR / "health.json").write_text(
        json.dumps(health, indent=2, ensure_ascii=False, allow_nan=False) + "\n"
    )

    # Summary stdout
    print("\n=== SUMMARY ===")
    print(f"FX EUR/GBP: {fx_eur_to_gbp}")
    for name in TICKERS:
        rec = out_current["current"].get(name)
        src = out_current["sources_used"].get(name)
        if rec:
            print(f"  {name:6s} {src:14s} price_eur={rec['price_eur']}")
        else:
            failures = health["tickers"][name]["consecutive_failures"]
            print(f"  {name:6s} {src:14s} FAILED (streak={failures})")

    # Alert flags (consumer futuro: Task F via Resend)
    alerts = [n for n, r in health["tickers"].items() if r.get("alert_needed")]
    if alerts:
        print(f"\n[ALERT] consecutive failures ≥{FAILURE_THRESHOLD_FOR_ALERT} on: {', '.join(alerts)}")
        # Non lanciamo eccezione: il workflow deve completare e committare
        # comunque gli output parziali. L'alert verrà inviato dal Task F.


if __name__ == "__main__":
    main()
