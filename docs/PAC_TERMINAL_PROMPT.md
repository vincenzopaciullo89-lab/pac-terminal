# PAC Terminal — Documento di riferimento

> **Nota.** Questo documento è la versione di riferimento dello stato del
> progetto a maggio 2026, post-completamento del Task Group B (architettura
> prezzi). Sostituisce qualunque documento esterno con nomi tipo
> `PROMPT_V3.md`. Va aggiornato a ogni decisione strutturale (NON a ogni
> modifica numerica di parametri).

---

## 1. Cos'è PAC Terminal

Sito personale di monitoraggio di un Piano di Accumulo Capitale ETF su Trade
Republic. JavaScript vanilla modularizzato in `src/`. Repo:
`vincenzopaciullo89-lab/pac-terminal`.

**Vincoli utente** (non rinegoziabili):

| Vincolo | Valore |
|---|---|
| PAC mensile base | €500, split €450 VWCE + €50 CSNDX |
| Boost tattico mensile | range €0 – €1.000 (cap STRETTO) |
| Modalità versamento boost | bonifico manuale on-demand dal conto bancario verso Trade Republic |
| Canale alert | GitHub Actions + email via Resend (free tier) — Task F |
| Approccio algoritmico tattico | rule-based deterministico (no scoring complesso) |
| Posizioni legacy | CSPX, SWDA, VETA congelate (no nuovi acquisti, no rebalance) |
| Asset attivi PAC | VWCE (90% del flusso) + CSNDX (10%) |
| Regime fiscale | amministrato (Trade Republic sostituto d'imposta) |
| Domicilio fiscale | Italia |
| Obiettivo asset allocation (L17) | "alto rendimento atteso" — non income, non capital preservation |
| Cassa boost cumulata disponibile | €6–9K (per scenari -50% × 18 mesi senza vendere ETF) |

---

## 2. Architettura dati (post-Task B)

```
[1] GitHub Actions — .github/workflows/update-prices.yml
    Cron: 07:30 + 18:30 UTC daily + workflow_dispatch
    └─ .github/scripts/fetch_prices.py
       ├─ yfinance (primario) per i 5 ETF + EURGBP=X (FX)
       ├─ Google Sheets CSV (fallback secondario)
       │   • mantenuto come ultima ridondanza per resilienza
       │   • NESSUN fallback live dal browser
       ├─ FX EUR→GBP per VETA (vedi §4)
       └─ commit /data/{prices,history,health}.json [skip ci]

[2] Sito client-side — src/priceProvider.js
    Stato attuale (main): v3.1 — legge live da Google Sheets CSV.
    Stato target (post-B.4, PR #20 aperta non mergeata):
    └─ fetch('data/prices.json')   (same-origin, no CORS)
    └─ fetch('data/history.json')
    └─ badge "Dati obsoleti · Nh fa" se >24h dall'ultimo cron
    └─ NO fallback live Google Sheets dal browser
    └─ cache localStorage TTL 1h
    └─ NESSUNA chiamata diretta a docs.google.com né a yfinance

[3] Calcolo metriche — src/metricsEngine.js (post-B.5)
    └─ funzione pura, importabile da Node (per Task F)
    └─ re-exportata da src/portfolioEngine.js per backward-compat
```

### File `/data/` mantenuti dal cron

| File | Contenuto | Ritmo |
|---|---|---|
| `prices.json` | prezzi correnti EUR + FX EURGBP | 2× day cron |
| `history.json` | closes EUR per VWCE + CSNDX (~380 giorni) | 2× day cron |
| `health.json` | stato per-ticker, consecutive_failures, alert_needed | 2× day cron |
| `portfolio.example.json` | esempio non collegato | manuale |

---

## 3. Logica tattica (post-Task A)

### Macchina degli stati

**Stato corrente (main, post-Task A)**:
- Trigger value: `min(dd12M, composite)` dove `composite = 0.6·dd12M + 0.4·madMA200`.
- Indicatore primario: `dd252D` su VWCE. In `portfolioEngine.computePriceMetrics` (o `metricsEngine` post-B.5). Calcolato sul prezzo del solo VWCE (asset di riferimento, 90% del flusso).
- **Cap operativo**: 6 mesi/anno di boost (`config.pac.capBoostMonthsPerYear`).

**Direzione futura — Trigger ibrido A+B+C (TASK 3.5, da implementare DOPO il backtest Task D)**:
- **A** = `ddATH_real` — drawdown da peak della history disponibile (idealmente dal lancio VWCE.MI in settembre 2019, ~7 anni di daily). → Trigger primario.
- **B** = `dd252D` — finestra rolling 252 giorni. → Filtro di declassamento (impedisce di rimanere in tier alto a recupero avvenuto).
- **C** = `z21D` — z-score del rendimento 21d corrente vs distribuzione storica. → SOLO contesto visivo nella UI, NESSUN ruolo nel trigger.
- Composite 0.6/0.4 viene rimosso; `weightDD12M`/`weightMA200` in `config.triggerComposite` diventano dead code da eliminare.
- **Vincolo**: le soglie (tier + soglia di declassamento di B) NON si inventano a tavolino — escono dal backtest Task D. La history estesa è il prerequisito condiviso.

### Tabella tier (post-A.1, multiplier rivisti per rispettare cap €1.000)

| Tier | Drawdown | Multiplier | Totale | Extra |
|---|---|---|---|---|
| T0 NORMAL | dd > -5% | 1.0x | €500 | €0 |
| T1 ELEVATED | [-10%, -5%) | 1.1x | €550 | €50 |
| T2 STRESSED | [-15%, -10%) | 1.3x | €650 | €150 |
| T3 SEVERE | [-25%, -15%) | 1.6x | €800 | €300 |
| T4 EXTREME | dd ≤ -25% | 2.0x | €1.000 | €500 |

**Calibrazione**: i numeri sono "di lavoro". La calibrazione finale uscirà
dal **backtest del Task Group D** (su dati MSCI World TR EUR + Nasdaq 100
TR, periodo 2000–2026). Test strutturale in `tests/strategy.test.js`
blocca qualunque modifica che violi il cap €1.000.

---

## 4. Mappatura ticker e FX

| Name | Ticker yfinance | Ticker .MI (canonico) | Valuta nativa | FX |
|---|---|---|---|---|
| VWCE | VWCE.MI | VWCE.MI | EUR | — |
| CSNDX | CSNDX.MI | CSNDX.MI | EUR | — |
| **CSPX** | **CSPX.AS** | CSPX.MI | EUR | — |
| SWDA | SWDA.MI | SWDA.MI | EUR | — |
| **VETA** | **VETA.L** | VETA.MI | **GBP** | **EURGBP=X** |

**Note**:

- **CSPX**: yfinance ritornava `empty_history` per `CSPX.MI` durante la
  diagnostica preflight (PR #16). Risolto usando `CSPX.AS` (Amsterdam,
  Euronext, EUR). Stesso ETF iShares Core S&P 500, ISIN IE00B5BMR087.
- **VETA**: yfinance fornisce dati solo per `VETA.L` (Londra, GBP).
  Conversione FX: `price_eur = price_native / EURGBP=X` (formula
  documentata in `.github/scripts/fetch_prices.py:299`).
  Verifica aritmetica: 20.57 GBP / 0.866 ≈ 23.75 EUR.
- **VETA — prezzo da `history.last_close`**, non da `fast_info.last_price`:
  per ticker a basso volume come VETA.L, `fast_info.last_price` ritorna
  `None` (verificato nel deep-dive smoke test v2). Commento dedicato in
  `.github/scripts/fetch_prices.py:88-97`.

---

## 5. Fonti dati e policy di fallback

### Cron Python (server-side)

| Priorità | Fonte | Note |
|---|---|---|
| 1 | yfinance | scraping non ufficiale Yahoo Finance. Pinned `yfinance==1.3.0`. |
| 2 | Google Sheets CSV pubblico | foglio originale del sito (gid=0 + gid=1714634805). Backup di ultima istanza. |

### Browser (client-side)

| Priorità | Fonte | Note |
|---|---|---|
| 1 | Manual override (`localStorage`) | utente forza prezzi specifici |
| 2 | Cache `localStorage` v33 | TTL 1h |
| 3 | `/data/prices.json` same-origin | popolato dal cron |
| 4 | `currentPriceFallback` da `config.js` | solo se i JSON sono inaccessibili |

### Fonti escluse

**Stooq** è stato escluso dall'architettura. Durante la diagnostica
preflight, sia `https://stooq.com/q/d/l/` sia gli endpoint alternativi
hanno restituito HTML/CAPTCHA dai runner GitHub Actions per tutti e 5 i
ticker. Conferma in [PR #15](https://github.com/vincenzopaciullo89-lab/pac-terminal/pull/15)
e [PR #16](https://github.com/vincenzopaciullo89-lab/pac-terminal/pull/16). Non
ritentare di reintrodurlo senza un nuovo smoke test.

---

## 6. Note operative GitHub Actions

### Node.js 20 deprecation (deadline ~2 giugno 2026)

Le JavaScript actions `actions/checkout@v4` e `actions/setup-python@v5`
girano su Node 20, in deprecation. Mitigazione applicata via env var a
livello workflow:

```yaml
env:
  FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: "true"
```

**Stato per workflow**:

| Workflow | Env var presente | Note |
|---|---|---|
| `update-prices.yml` | ✅ | PR #18 |
| `drawdown-alert.yml` | ✅ | PR #22 (merged), in tempo per deadline 2 giugno 2026 |

Quando una versione `@v5+` di tutte le action JS sarà disponibile e
stabile, si potrà rimuovere l'env var bumpando le versioni.

### Permission e secret

`update-prices.yml` richiede `permissions: contents: write` per
commit/push automatici. `[skip ci]` nel commit del bot previene loop di
workflow ricorsivi. Nessun secret usato.

---

## 7. Decisioni post-smoke (tracking)

Sezione che traccia il **perché** delle scelte architetturali
prese a valle dei due round di diagnostica preflight (PR #15-#16).

| Decisione | Motivazione |
|---|---|
| Stooq fuori | HTTPS request → 403 / HTML CAPTCHA su tutti i ticker dai runner GHA. Non automatizzabile. |
| CSPX.AS sostituisce CSPX.MI | CSPX.MI ritorna `empty_history` su yfinance (lookup ok, ma serie vuota). CSPX.AS quotato su Amsterdam in EUR, stesso ETF, history popolata. |
| VETA via VETA.L con FX | VETA.MI restituiva valori non affidabili. VETA.L (LSE) ha history valida. La valuta è **GBP** (pound), non GBp (pence): smoke test deep-dive ha confrontato il prezzo 20.5653 con `currentPriceFallback` 23.71 EUR in config.js → fattore di conversione 1.16 ≈ EUR/GBP corrente, coerente con pound. |
| Prezzo VETA da `history.last_close` | `fast_info.last_price` ritorna `None` per VETA.L. `t.history(period='5d').Close.iloc[-1]` è affidabile. |
| Fallback chain 2 livelli (no Sheets nel browser) | Onestà: se il cron è rotto, lo è. Niente fallback opaco runtime. |
| Cache lato browser TTL 1h | Bilancia freschezza vs traffico. Il cron pusha 2x/day → max 13h di lag dal cron al browser nel caso peggiore. |
| dd252D rinominato da ddATH | Il calcolo usa una finestra rolling 252 giorni, non un vero ATH. Quando lo storico sarà esteso (>5 anni), si potrà reintrodurre un `ddATH` autentico. |
| MA200 richiede ≥200 close | Una "MA200" su 50-100 punti è rumorosa; preferiamo `null` (UI "—") a pseudo-precisione. |
| Multiplier tier ridistribuiti a 1.0/1.1/1.3/1.6/2.0 | T4 era 2.5x = €1.250, violava cap €1.000. Test strutturale in `tests/strategy.test.js` blocca regressioni future. |
| **TASK 0 — fix bug NaN nei prezzi correnti (PR #24)** | yfinance restituisce trailing-NaN per la sessione corrente non chiusa sui ticker .MI/.AS. `fetch_yf_price` ora droppa NaN e usa l'ultimo close finito; `allow_nan=False` su tutti i JSON output (fail-loud); 9 test Python con CI gating. Diagnosticato sul commit 22:53 del 26/05/2026, bug presente dal 19/05 (primissimo run serale). |
| **L17 — Obiettivo asset allocation: "alto rendimento atteso"** | Vincolo strategico per le valutazioni della Task O1/TASK 5: la candidate list di portafogli alternativi va pesata in funzione di rendimento atteso a 10–20 anni, non di volatilità minima o income. |
| **Trigger ibrido A+B+C (TASK 3.5)** | Sostituisce composite 0.6/0.4. `ddATH_real` trigger primario su history estesa, `dd252D` filtro di declassamento, `z21D` solo contesto visivo. Prerequisito: history estesa (period="max"). Soglie calibrate dal backtest Task D, NON a tavolino. |
| TER CSNDX 0.30% (era 0.33%) | Valore ufficiale iShares verificato. Onestà parametri. |
| `metricsEngine` separato da `portfolioEngine` | `computePriceMetrics` deve essere importabile da Node (Task F alert daily server-side). `portfolioEngine` mantiene re-export per back-compat. |

---

## 8. Stato Task Groups

| Group | Descrizione | Stato |
|---|---|---|
| A | Bug fix immediati (tier cap, ddATH, MA200, TER CSNDX) | ✅ #14 |
| B | Architettura prezzi (yfinance + Sheets fallback) | ✅ #18 |
| TASK 0 | Fix bug NaN trailing-row nei prezzi correnti | ✅ #24 |
| chore | Force Node 24 su drawdown-alert.yml | ✅ #22 |
| B.4 | Refactor priceProvider per leggere /data/*.json | ⏳ #20 |
| B.5 | Estrazione metricsEngine per Node-compat | ⏳ #19 |
| 3.5 | Trigger ibrido A+B+C (sostituisce composite) | ⏳ Dopo Task D; richiede history estesa |
| C | Coerenza Monte Carlo ↔ Dashboard | ⏳ |
| D | Backtest documentato | ⏳ |
| E | Migliorie grafici (fan chart, box plot, etichette) | ⏳ |
| F | Sistema alert via Resend (consumer di health.json) | ⏳ |
| G | Migliorie strutturali (bollo, magazzino minus, TWR/MWR, snapshot) | ⏳ |

---

## 9. Glossario rapido

- **Versato**: capitale conferito al PAC (contributi cumulati).
- **PMC**: Prezzo Medio di Carico (weighted average cost basis).
- **Plus latente**: plusvalenza non realizzata.
- **Regime amministrato**: il broker (Trade Republic IT) agisce da sostituto d'imposta.
- **TWR / MWR**: Time-Weighted Return / Money-Weighted Return (IRR). Vedi Task G.3.
- **Tier**: stato della macchina tattica (T0..T4) che determina il moltiplicatore del PAC mensile.
