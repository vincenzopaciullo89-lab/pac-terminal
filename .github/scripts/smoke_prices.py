#!/usr/bin/env python3
"""
Smoke test multi-source per i 5 ticker PAC Terminal.

Verifica yfinance e Stooq (CSV diretto) per:
  (a) prezzo corrente disponibile
  (b) history ultimi 30 giorni disponibile
  (c) valuta restituita

Output: tabella Markdown su stdout. Il workflow la copia anche in
$GITHUB_STEP_SUMMARY così appare renderizzata nella pagina del run.

DIAGNOSTIC ONLY — rimuovere insieme al workflow dopo l'uso (Task B preflight).
"""

import sys
import time
import warnings
from datetime import datetime, timedelta

warnings.filterwarnings("ignore")

import requests
import yfinance as yf

TICKERS = {
    "VWCE":  {"yf": "VWCE.MI",  "stooq": "vwce.it"},
    "CSNDX": {"yf": "CSNDX.MI", "stooq": "csndx.it"},
    "CSPX":  {"yf": "CSPX.MI",  "stooq": "cspx.it"},
    "SWDA":  {"yf": "SWDA.MI",  "stooq": "swda.it"},
    "VETA":  {"yf": "VETA.L",   "stooq": "veta.uk"},
}

STOOQ_URL = "https://stooq.com/q/d/l/?s={s}&i=d"


def test_yfinance(yf_ticker):
    """Restituisce dict {price, currency, hist_days, error}."""
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
    """Restituisce dict {price, currency, hist_days, error}."""
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
        # Stooq non restituisce valuta nel CSV: inferenza dal suffix.
        # .it = quoted EUR su Borsa Italiana; .uk = quoted GBp (pence!) su LSE.
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


def main():
    print("# Smoke test prezzi — yfinance vs Stooq")
    print()
    print(f"Eseguito: {datetime.utcnow().isoformat()}Z")
    print(f"yfinance: {yf.__version__}")
    print()
    print("| Ticker | yfinance | Stooq |")
    print("|---|---|---|")
    for name, info in TICKERS.items():
        sys.stderr.write(f"Testing {name}...\n")
        sys.stderr.flush()
        yf_res = test_yfinance(info["yf"])
        time.sleep(0.5)
        st_res = test_stooq(info["stooq"])
        print(
            f"| **{name}** ({info['yf']} / {info['stooq']}) "
            f"| {cell(yf_res)} | {cell(st_res)} |"
        )


if __name__ == "__main__":
    main()
