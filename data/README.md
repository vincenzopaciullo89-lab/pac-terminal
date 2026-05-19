# /data — stato del portafoglio e prezzi

Questa cartella contiene **stato persistente** alimentato da:

- la GitHub Action `update-prices` (cron 07:30 e 18:30 UTC) per i prezzi
- il sito (browser) per altre tipologie di snapshot — vedi Task Group G.5

I file di prezzo sono **artefatti generati**: non modificarli a mano.
Vengono ricommittati dal bot ogni esecuzione del workflow se ci sono
cambiamenti rispetto al commit precedente.

---

## prices.json

Prezzi correnti dei 5 ETF + tasso FX EUR/GBP (necessario per VETA).

```json
{
  "updated_at": "2026-05-19T07:30:12+00:00",
  "fx_rates": { "EURGBP": 0.8602 },
  "current": {
    "VWCE":  { "price_native": 158.18, "price_eur": 158.18, "currency": "EUR", "needs_fx": false, "source": "yfinance" },
    "CSNDX": { "price_native": 1419.7, "price_eur": 1419.7, "currency": "EUR", "needs_fx": false, "source": "yfinance" },
    "CSPX":  { "price_native": 612.45, "price_eur": 612.45, "currency": "EUR", "needs_fx": false, "source": "yfinance" },
    "SWDA":  { "price_native": 120.33, "price_eur": 120.33, "currency": "EUR", "needs_fx": false, "source": "yfinance" },
    "VETA":  { "price_native": 20.5653, "price_eur": 23.91, "currency": "GBP", "needs_fx": true, "source": "yfinance" }
  },
  "sources_used": {
    "VWCE": "yfinance", "CSNDX": "yfinance", "CSPX": "yfinance",
    "SWDA": "yfinance", "VETA": "yfinance"
  }
}
```

**Campi**:
- `price_native`: prezzo nella valuta di quotazione del ticker yfinance.
- `price_eur`: convertito in EUR (per VETA: `price_native / EURGBP=X`).
- `source`: stringa `"yfinance"` | `"google_sheets"` | `"FAILED"` | `"FX_FAILED"`.

**Mapping ticker yfinance** (decisione di prodotto):
- `CSPX.AS` (Amsterdam, EUR) invece di `CSPX.MI` che ritorna empty_history.
- `VETA.L` (Londra, GBP) con conversione FX EUR/GBP.
- Tutti gli altri restano sui ticker MI/EUR.

---

## history.json

Closes giornalieri EUR per VWCE e CSNDX (~380 trading days). Necessari al
calcolo di `computePriceMetrics` (drawdown, MA200, vol, z-score).

```json
{
  "updated_at": "2026-05-19T07:30:12+00:00",
  "tickers": {
    "VWCE":  { "source": "yfinance", "data": [{ "date": "2024-05-20", "close": 130.45 }, ...] },
    "CSNDX": { "source": "yfinance", "data": [{ "date": "2024-05-20", "close": 1180.34 }, ...] }
  }
}
```

Gli altri ETF (CSPX, SWDA, VETA) sono legacy — il loro storico non è
necessario per la logica tattica e non viene aggiornato.

---

## health.json

Stato per-ticker della pipeline. Usato sia per debug sia come trigger
dell'alert email (Task Group F).

```json
{
  "updated_at": "2026-05-19T07:30:12+00:00",
  "tickers": {
    "VWCE": {
      "consecutive_failures": 0,
      "last_success": "2026-05-19T07:30:12+00:00",
      "last_source": "yfinance",
      "alert_needed": false
    }
  }
}
```

**`alert_needed`**: settato a `true` quando `consecutive_failures ≥ 3`.
L'invio email via Resend è demandato al Task Group F (non ancora cablato).

---

## Fonti dati e policy di fallback

| Ordine | Fonte | Note |
|---|---|---|
| 1 | **yfinance** | scraping non ufficiale di Yahoo Finance. Versione pinnata in `.github/scripts/requirements.txt`. Può rompersi senza preavviso. |
| 2 | **Google Sheets CSV** pubblico | foglio originale del sito (gid=0 e gid=1714634805). Aggiornamento manuale del foglio: oggi è il backup di ultima istanza. |

Stooq è stato **escluso** dalla pipeline: la diagnostica preflight
(PR #15/#16) ha confermato risposta HTML/CAPTCHA sistematica dai runner
GitHub Actions, non automatizzabile.

---

## File ausiliari

- `portfolio.example.json` — file di esempio non collegato alla pipeline.
- (futuro) `snapshots.json` — snapshot mensile del portafoglio (Task G.5).
- (futuro) `backtest_msci_world_eur.csv` — storico esteso per backtest (Task D).
