#!/usr/bin/env python3
"""
Smoke test v2 — deep-dive su CSPX, VETA currency, Stooq raw body.

Sezioni:
  1. Probe base (5 ticker, riproducibilità del run precedente)
  2. CSPX alternative tickers (CSPX.MI, CSP1.MI, CSPX.L, CSPX.AS, CSPX.DE, CSPXEUR.MI)
  3. VETA currency deep dive (info.currency, priceHint, fast_info, exchange)
  4. Stooq raw response su vwce.it (status, content-type, primi 200 byte)

Output: Markdown su stdout. Il workflow lo copia in $GITHUB_STEP_SUMMARY.

DIAGNOSTIC ONLY — rimuovere dopo l'uso.
"""

import sys
import time
import warnings
from datetime import datetime, timedelta

warnings.filterwarnings("ignore")

import requests
import yfinance as yf

# -----------------------------------------------------------------------------
# Sezione 1: probe base (come v1)
# -----------------------------------------------------------------------------
TICKERS = {
    "VWCE":  {"yf": "VWCE.MI",  "stooq": "vwce.it"},
    "CSNDX": {"yf": "CSNDX.MI", "stooq": "csndx.it"},
    "CSPX":  {"yf": "CSPX.MI",  "stooq": "cspx.it"},
    "SWDA":  {"yf": "SWDA.MI",  "stooq": "swda.it"},
    "VETA":  {"yf": "VETA.L",   "stooq": "veta.uk"},
}

# Punto 1 dell'utente: alternative per CSPX
CSPX_ALTERNATIVES = [
    "CSPX.MI",      # baseline (fallita in v1)
    "CSP1.MI",
    "CSPX.L",
    "CSPX.AS",
    "CSPX.DE",
    "CSPXEUR.MI",
]

STOOQ_URL = "https://stooq.com/q/d/l/?s={s}&i=d"


def test_yfinance(yf_ticker):
    out = {"price": None, "currency": None, "hist_days": 0, "error": None}
    try:
        t = yf.Ticker(yf_ticker)
        info = {}
        try:
            info = t.info or {}
        except Exception:
            pass
        out["currency"] = info.get("currency") or info.get("financialCurrency")
        hist = t.history(period="35d", auto_adjust=False)
        if hist is not None and not hist.empty:
            out["hist_days"] = int(len(hist))
            out["price"] = float(hist["Close"].iloc[-1])
            if not out["currency"]:
                try:
                    fi = t.fast_info
                    out["currency"] = fi.get("currency") if hasattr(fi, "get") else None
                except Exception:
                    pass
        else:
            out["error"] = "empty_history"
    except Exception as e:
        out["error"] = f"{type(e).__name__}: {str(e)[:80]}"
    return out


def test_stooq(stooq_symbol):
    out = {"price": None, "currency": None, "hist_days": 0, "error": None}
    try:
        url = STOOQ_URL.format(s=stooq_symbol)
        r = requests.get(url, timeout=15, headers={"User-Agent": "Mozilla/5.0"})
        if r.status_code != 200:
            out["error"] = f"HTTP {r.status_code}"
            return out
        body = r.text.strip()
        if not body or body.lower().startswith("no data"):
            out["error"] = "no_data"
            return out
        lines = body.splitlines()
        if len(lines) < 2:
            out["error"] = "empty_csv"
            return out
        header = lines[0].split(",")
        if "Close" not in header:
            out["error"] = "unexpected_header"
            return out
        close_idx = header.index("Close")
        cutoff = (datetime.utcnow() - timedelta(days=45)).date()
        recent = []
        for line in lines[1:]:
            parts = line.split(",")
            if len(parts) <= close_idx:
                continue
            try:
                d = datetime.strptime(parts[0], "%Y-%m-%d").date()
                if d >= cutoff:
                    recent.append((d, float(parts[close_idx])))
            except (ValueError, IndexError):
                continue
        if not recent:
            out["error"] = "no_recent_rows"
            return out
        recent.sort()
        out["hist_days"] = len(recent)
        out["price"] = recent[-1][1]
        if stooq_symbol.endswith(".it"):
            out["currency"] = "EUR"
        elif stooq_symbol.endswith(".uk"):
            out["currency"] = "GBp(?)"
        else:
            out["currency"] = "?"
    except Exception as e:
        out["error"] = f"{type(e).__name__}: {str(e)[:80]}"
    return out


def fmt_price(p):
    if p is None:
        return "—"
    if p >= 100:
        return f"{p:.2f}"
    return f"{p:.4f}"


def cell(result):
    if result["error"]:
        return f"❌ {result['error']}"
    pieces = [
        f"price={fmt_price(result['price'])}",
        f"hist={result['hist_days']}d",
        f"ccy={result['currency'] or '?'}",
    ]
    return "✅ " + ", ".join(pieces)


def section_1_base_probe():
    print("## 1. Probe base (riproducibilità v1)")
    print()
    print("| Ticker | yfinance | Stooq |")
    print("|---|---|---|")
    for name, info in TICKERS.items():
        sys.stderr.write(f"[1] Testing {name}...\n")
        sys.stderr.flush()
        yf_res = test_yfinance(info["yf"])
        time.sleep(0.3)
        st_res = test_stooq(info["stooq"])
        print(
            f"| **{name}** ({info['yf']} / {info['stooq']}) "
            f"| {cell(yf_res)} | {cell(st_res)} |"
        )
    print()


def section_2_cspx_alternatives():
    print("## 2. CSPX — alternative tickers (yfinance)")
    print()
    print("| Ticker | Esito | Note |")
    print("|---|---|---|")
    for tk in CSPX_ALTERNATIVES:
        sys.stderr.write(f"[2] CSPX alternative: {tk}\n")
        sys.stderr.flush()
        res = test_yfinance(tk)
        # Aggiungo metadata per disambiguare lookup_fail vs empty_history
        extra = []
        try:
            t = yf.Ticker(tk)
            info = {}
            try:
                info = t.info or {}
            except Exception:
                pass
            shortname = info.get("shortName") or info.get("longName") or "?"
            exchange = info.get("exchange") or "?"
            extra.append(f"name='{shortname[:30]}'")
            extra.append(f"exch={exchange}")
        except Exception:
            extra.append("info_lookup_failed")
        print(f"| `{tk}` | {cell(res)} | {', '.join(extra)} |")
        time.sleep(0.4)
    print()


def section_3_veta_currency_deep_dive():
    print("## 3. VETA.L — currency deep dive")
    print()
    sys.stderr.write("[3] VETA.L deep dive...\n")
    sys.stderr.flush()

    fields = {}
    try:
        t = yf.Ticker("VETA.L")
        info = {}
        try:
            info = t.info or {}
        except Exception as e:
            fields["info_error"] = f"{type(e).__name__}: {e}"
        for k in ("currency", "financialCurrency", "priceHint", "exchange",
                  "quoteType", "shortName", "longName"):
            fields[k] = info.get(k, "<missing>")

        try:
            fi = t.fast_info
            for k in ("currency", "exchange", "last_price", "previous_close"):
                try:
                    fields[f"fast_info.{k}"] = getattr(fi, k, None) if not hasattr(fi, "get") else fi.get(k)
                except Exception as e:
                    fields[f"fast_info.{k}"] = f"<error: {e}>"
        except Exception as e:
            fields["fast_info_error"] = f"{type(e).__name__}: {e}"

        hist = t.history(period="5d", auto_adjust=False)
        if hist is not None and not hist.empty:
            fields["history.last_close"] = float(hist["Close"].iloc[-1])
            fields["history.rows_returned"] = int(len(hist))
        else:
            fields["history"] = "<empty>"
    except Exception as e:
        fields["fatal"] = f"{type(e).__name__}: {e}"

    print("| Campo | Valore |")
    print("|---|---|")
    for k, v in fields.items():
        v_str = str(v) if v is not None else "<None>"
        if len(v_str) > 100:
            v_str = v_str[:100] + "…"
        print(f"| `{k}` | `{v_str}` |")
    print()

    last = fields.get("history.last_close")
    if isinstance(last, (int, float)):
        print("**Interpretazione numerica:**")
        print()
        print(f"- Prezzo grezzo restituito da yfinance: `{last}`")
        print(f"- Se è in **GBP** (pound): valore per unità ≈ £{last:.4f} ≈ €{last*1.16:.2f} (a EUR/GBP ~1.16)")
        print(f"- Se è in **GBp** (pence): valore per unità ≈ £{last/100:.4f} ≈ €{last*1.16/100:.4f}")
        print(f"- Config attuale `currentPriceFallback` di VETA: 23.71 (EUR)")
        print("- Stima: confronta con il prezzo ufficiale LSE / iShares")
        print(f"  - VETA ISIN IE00BH04GL39")
    print()


def section_4_stooq_raw():
    print("## 4. Stooq — raw response (probe su `vwce.it`)")
    print()
    sys.stderr.write("[4] Stooq raw...\n")
    sys.stderr.flush()
    url = STOOQ_URL.format(s="vwce.it")
    print(f"URL: `{url}`")
    print()
    try:
        r = requests.get(url, timeout=15, headers={"User-Agent": "Mozilla/5.0"})
        print(f"- HTTP status: `{r.status_code}`")
        print(f"- Content-Type: `{r.headers.get('Content-Type', '<missing>')}`")
        print(f"- Content-Length header: `{r.headers.get('Content-Length', '<missing>')}`")
        print(f"- Body length (actual): `{len(r.content)}` bytes")
        body = r.text
        first_200 = body[:200].replace("`", "'").replace("\n", "\\n")
        print()
        print("First 200 chars of body:")
        print()
        print("```")
        print(first_200)
        print("```")
        # Detect HTML / CAPTCHA heuristic
        lower = body[:500].lower()
        if "<html" in lower or "<!doctype" in lower:
            print()
            print("**Verdict**: risposta HTML — probabilmente CAPTCHA o landing page anti-bot.")
        elif "captcha" in lower:
            print()
            print("**Verdict**: contiene la stringa 'captcha'.")
        elif body.strip().lower().startswith("no data"):
            print()
            print("**Verdict**: simbolo non riconosciuto da Stooq.")
        elif "Date,Open,High,Low,Close" in body[:200]:
            print()
            print("**Verdict**: CSV regolare. Lo script v1 ha fallito per altro motivo — investigare.")
        else:
            print()
            print("**Verdict**: payload inatteso, non CSV né HTML noto.")
    except Exception as e:
        print(f"- Eccezione: `{type(e).__name__}: {e}`")
    print()


def main():
    print("# Smoke test prezzi v2 — diagnostic deep-dive")
    print()
    print(f"Eseguito: {datetime.utcnow().isoformat()}Z")
    print(f"yfinance: {yf.__version__}")
    print()
    section_1_base_probe()
    section_2_cspx_alternatives()
    section_3_veta_currency_deep_dive()
    section_4_stooq_raw()


if __name__ == "__main__":
    main()
