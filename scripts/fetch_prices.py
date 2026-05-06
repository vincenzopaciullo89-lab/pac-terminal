#!/usr/bin/env python3
"""
fetch_prices.py — Scarica prezzi correnti e storici da Yahoo Finance
                  e li salva in data/prices.json per il sito PAC Terminal.

Eseguito da GitHub Actions ogni notte. Server-side: niente CORS.

Yahoo Finance non ha API ufficiale pubblica, ma yfinance è la libreria
de-facto standard ed è stabile per cron giornalieri.
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    import yfinance as yf
except ImportError:
    print("ERROR: yfinance non installato. pip install yfinance", file=sys.stderr)
    sys.exit(1)

# Ticker map: chiave usata dal sito → ticker Yahoo
# I ticker .MI sono Borsa Italiana, supportati da Yahoo
TICKERS = {
    "VWCE.MI":  "VWCE.MI",
    "CSNDX.MI": "CSNDX.MI",
    "CSPX.MI":  "CSPX.MI",
    "SWDA.MI":  "SWDA.MI",
    "VETA.MI":  "VETA.MI",
}

# Ticker per cui vogliamo lo storico 252g (drawdown engine)
HISTORY_TICKERS = ["VWCE.MI"]
HISTORY_DAYS = 380  # ~18 mesi per coprire 252 trading day + margine


def fetch_current_price(ticker_yahoo: str) -> dict | None:
    """Fetch del prezzo corrente con fallback multipli."""
    try:
        t = yf.Ticker(ticker_yahoo)
        # 1. Tentativo: fast_info.last_price (più rapido)
        try:
            price = t.fast_info.get("last_price") or t.fast_info.get("regular_market_price")
            if price and price > 0:
                return {"price": round(float(price), 4), "source": "yahoo-fast"}
        except Exception:
            pass

        # 2. Tentativo: history 5d, prendi ultima chiusura
        hist = t.history(period="5d", auto_adjust=False)
        if not hist.empty:
            last_close = float(hist["Close"].iloc[-1])
            if last_close > 0:
                return {"price": round(last_close, 4), "source": "yahoo-history"}

        # 3. Tentativo: info dict (più lento, a volte funziona quando altri falliscono)
        info = t.info
        for key in ("regularMarketPrice", "previousClose", "navPrice"):
            v = info.get(key)
            if v and v > 0:
                return {"price": round(float(v), 4), "source": f"yahoo-{key}"}

        return None
    except Exception as e:
        print(f"  ⚠️  {ticker_yahoo}: {e}", file=sys.stderr)
        return None


def fetch_history(ticker_yahoo: str, days: int) -> list:
    """Fetch dello storico giornaliero."""
    try:
        t = yf.Ticker(ticker_yahoo)
        hist = t.history(period=f"{days}d", auto_adjust=False)
        if hist.empty:
            return []
        return [
            {
                "date": idx.strftime("%Y-%m-%d"),
                "close": round(float(row["Close"]), 4),
            }
            for idx, row in hist.iterrows()
            if row["Close"] > 0
        ]
    except Exception as e:
        print(f"  ⚠️  history {ticker_yahoo}: {e}", file=sys.stderr)
        return []


def main():
    out = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "yahoo-finance",
        "prices": {},
        "history": {},
    }

    print("=== Fetch prezzi correnti ===")
    for site_ticker, yahoo_ticker in TICKERS.items():
        print(f"  → {site_ticker} ({yahoo_ticker})...", end=" ")
        result = fetch_current_price(yahoo_ticker)
        if result:
            out["prices"][site_ticker] = {
                **result,
                "timestamp": int(datetime.now(timezone.utc).timestamp() * 1000),
            }
            print(f"€{result['price']} [{result['source']}]")
        else:
            print("❌ FAILED")

    print("\n=== Fetch storico ===")
    for site_ticker in HISTORY_TICKERS:
        yahoo_ticker = TICKERS[site_ticker]
        print(f"  → {site_ticker} ({HISTORY_DAYS}g)...", end=" ")
        hist = fetch_history(yahoo_ticker, HISTORY_DAYS)
        if hist:
            out["history"][site_ticker] = hist
            print(f"{len(hist)} punti dal {hist[0]['date']} al {hist[-1]['date']}")
        else:
            print("❌ FAILED")

    # Riepilogo
    n_prices = len(out["prices"])
    n_history = sum(len(v) for v in out["history"].values())
    print(f"\n=== Riepilogo ===")
    print(f"  Prezzi correnti: {n_prices}/{len(TICKERS)}")
    print(f"  Punti storici:   {n_history}")

    if n_prices == 0:
        print("⛔ Nessun prezzo recuperato. Non aggiorno data/prices.json.", file=sys.stderr)
        sys.exit(1)

    # Scrivi output
    out_path = Path(__file__).parent.parent / "data" / "prices.json"
    out_path.parent.mkdir(exist_ok=True, parents=True)
    out_path.write_text(json.dumps(out, indent=2, ensure_ascii=False))
    print(f"\n✅ Salvato in {out_path}")


if __name__ == "__main__":
    main()
