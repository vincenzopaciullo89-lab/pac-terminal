#!/usr/bin/env python3
"""
PAC Terminal — analysis history fetcher (on-demand).

Materializza serie storiche complete (period="max") per asset usati nelle
ANALISI — backtest del sistema tattico (Task D) e analisi di asset allocation
(TASK 5). L'output è statico in data/analysis/<name>.json ed è SEPARATO da
data/history.json: il payload del sito non lo carica, quindi nessun bloat
client-side.

Eseguito SOLO on-demand via .github/workflows/analysis-data.yml
(workflow_dispatch, nessun cron). Da questo ambiente di sviluppo la rete
verso Yahoo è bloccata: il fetch reale avviene sui runner GitHub Actions.

Riusa la NaN-guard di TASK 0 (PR #24):
  - si scartano i close non finiti / non positivi (yfinance può restituire
    una riga finale NaN per la sessione corrente non ancora consolidata);
  - si serializza con allow_nan=False → fail-loud se un NaN sfugge, invece
    di produrre token "NaN" non-standard.

Per aggiungere ticker (TASK 5: EM, small cap, bond EU) basta estendere la
lista ANALYSIS_TICKERS qui sotto.
"""

import json
import math
import sys
import warnings
from datetime import datetime, timezone
from pathlib import Path

warnings.filterwarnings("ignore")

import yfinance as yf

UTC = timezone.utc
REPO_ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = REPO_ROOT / "data" / "analysis"

PERIOD = "max"

# -----------------------------------------------------------------------------
# Configurazione ticker per analisi.
#   name:       nome file output (data/analysis/<name>.json) + chiave logica
#   yf:         ticker yfinance
#   currency:   valuta nativa attesa della quotazione
#   fx_pair:    None se già in EUR; altrimenti coppia "EURXXX=X" (es. EURGBP=X)
#               per convertire in EUR. La conversione allinea per data e NON
#               fa forward-fill: le date senza tasso FX vengono scartate
#               (niente invenzione di prezzi).
#
# SWDA.MI = iShares Core MSCI World (Borsa Italiana, EUR): proxy storia lunga
# di VWCE per la calibrazione del Task D (VWCE.MI parte solo dal 2020).
# -----------------------------------------------------------------------------
ANALYSIS_TICKERS = [
    {"name": "swda", "yf": "SWDA.MI", "currency": "EUR", "fx_pair": None},
    # Candidati futuri (TASK 5) — abilitare quando servono:
    # {"name": "em_iema",  "yf": "IEMA.MI", "currency": "EUR", "fx_pair": None},
    # {"name": "smallcap", "yf": "IUSN.MI", "currency": "EUR", "fx_pair": None},
    # {"name": "eu_bond",  "yf": "IBGL.MI", "currency": "EUR", "fx_pair": None},
]


def fetch_history(yf_ticker, period=PERIOD):
    """Lista [{date, close}] in valuta NATIVA. Solleva su fallimento.

    NaN-guard come TASK 0: tiene solo i close finiti e positivi.
    """
    t = yf.Ticker(yf_ticker)
    hist = t.history(period=period, auto_adjust=False)
    if hist is None or hist.empty:
        raise RuntimeError("empty_history")
    out, dropped = [], 0
    for date, row in hist.iterrows():
        close = row.get("Close")
        if close is not None and math.isfinite(close) and close > 0:
            out.append({"date": date.strftime("%Y-%m-%d"),
                        "close": round(float(close), 4)})
        else:
            dropped += 1
    if dropped:
        print(f"[{yf_ticker}] dropped {dropped} non-finite close row(s)",
              file=sys.stderr)
    if not out:
        raise RuntimeError("no_finite_close")
    return out


def fetch_fx_series(fx_pair, period=PERIOD):
    """Serie FX {date: rate}. rate = unità di valuta estera per 1 EUR
    (es. EURGBP=X → GBP per 1 EUR)."""
    return {r["date"]: r["close"] for r in fetch_history(fx_pair, period)}


def to_eur(native_series, currency, fx_pair):
    """Converte una serie in EUR se serve. Ritorna (serie_eur, giorni_scartati).

    Se currency == 'EUR' o fx_pair is None → passthrough.
    Altrimenti allinea per data con la serie FX; le date senza un tasso FX
    valido vengono scartate (no forward-fill).
    """
    if currency == "EUR" or fx_pair is None:
        return native_series, 0
    fx = fetch_fx_series(fx_pair)
    out, missing = [], 0
    for r in native_series:
        rate = fx.get(r["date"])
        if rate is None or not math.isfinite(rate) or rate <= 0:
            missing += 1
            continue
        out.append({"date": r["date"], "close": round(r["close"] / rate, 4)})
    return out, missing


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    now_iso = datetime.now(UTC).isoformat()
    summary, failures = [], 0

    for cfg in ANALYSIS_TICKERS:
        name, yf_t = cfg["name"], cfg["yf"]
        try:
            native = fetch_history(yf_t)
            data, fx_missing = to_eur(native, cfg["currency"], cfg.get("fx_pair"))
            if not data:
                raise RuntimeError("empty_after_fx")
            payload = {
                "ticker": name,
                "yf_ticker": yf_t,
                "currency": "EUR",
                "native_currency": cfg["currency"],
                "period": PERIOD,
                "fetched_at": now_iso,
                "n": len(data),
                "date_start": data[0]["date"],
                "date_end": data[-1]["date"],
                "fx_missing_days": fx_missing,
                "data": data,
            }
            # allow_nan=False: fail-loud se un NaN raggiunge l'output.
            (OUT_DIR / f"{name}.json").write_text(
                json.dumps(payload, indent=2, ensure_ascii=False,
                           allow_nan=False) + "\n"
            )
            summary.append(
                f"  {name:10s} {yf_t:10s} n={len(data):5d} "
                f"{data[0]['date']} -> {data[-1]['date']} (fx_missing={fx_missing})"
            )
        except Exception as e:
            failures += 1
            summary.append(f"  {name:10s} {yf_t:10s} FAILED: "
                           f"{type(e).__name__}: {e}")

    print("=== ANALYSIS FETCH SUMMARY ===")
    print("\n".join(summary))
    if failures:
        # Fail-loud: il workflow deve fallire (niente commit di dati parziali).
        print(f"\n[ERROR] {failures} ticker falliti", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
