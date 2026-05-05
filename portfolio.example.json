# PAC Terminal · Personal Investment Intelligence

Dashboard browser-only per monitorare un PAC ETF con strategia drawdown-responsive contribution.
Zero backend. Zero cloud. Zero tracking. **Costo: €0/mese**.

![status](https://img.shields.io/badge/status-MVP-2DD4BF) ![cost](https://img.shields.io/badge/cost-€0/mo-2DD4BF) ![stack](https://img.shields.io/badge/stack-vanilla_JS-7C9AA7)

---

## Cosa fa

- **Strategy of the Month**: ti dice ogni mese se mantenere il PAC base o aumentarlo, basandosi su drawdown da rolling 12M high, deviazione da MA200 e z-score.
- **Portfolio tracker**: valore live, P/L, allocation effettiva, tasse latenti.
- **Risk metrics integrate**: drawdown ATH, drawdown 12M, MA200 deviation, vol rolling, regime classification.
- **Monte Carlo 50.000 sim**: 5 strategie a confronto, in Web Worker (UI non si freeza).
- **Trend chart**: bande probabilistiche P5/P25/P50/P75/P95 a 5 anni con percorso atteso.
- **Tax simulator**: simulazione vendita ETF con plus/minus, regime amministrato 26%, costo opportunità.
- **Real estate IRR**: calcolo con costi reali Italia (registro, agenzia, notaio, plus 26% se &lt;5 anni).

## Stack tecnico

- HTML/CSS/JS vanilla (nessun build step richiesto)
- ES modules nativi
- Chart.js 4 da CDN
- Web Worker per Monte Carlo
- localStorage per cache e configurazione utente
- Twelve Data API (free tier) per prezzi

---

## Deployment in 5 minuti

### Opzione A — GitHub Pages (consigliata)

1. **Crea un repo GitHub privato o pubblico** (esempio: `pac-terminal`).
2. Carica tutti i file di questa cartella nel repo.
3. Vai in **Settings → Pages**.
4. Source: **Deploy from a branch** → seleziona `main` (o `master`) e folder `/ (root)`.
5. Salva. Dopo ~1 minuto il sito è disponibile su `https://USERNAME.github.io/pac-terminal/`.

### Opzione B — Netlify (drag &amp; drop)

1. Vai su [app.netlify.com/drop](https://app.netlify.com/drop)
2. Trascina la cartella `portfolio-dashboard` nella pagina.
3. Sito disponibile in ~30 secondi su un URL `*.netlify.app`.
4. Optional: collega un repo GitHub per auto-deploy ad ogni commit.

### Opzione C — Vercel

1. `vercel.com` → New Project → importa repo GitHub.
2. Framework preset: **Other** → Build Command: vuoto → Output Directory: vuoto.
3. Deploy.

### Opzione D — Locale (test rapido)

Devi servire i file via HTTP per via di ES modules e Web Workers:

```bash
cd portfolio-dashboard
python3 -m http.server 8000
# Apri http://localhost:8000
```

Oppure con Node:

```bash
npx serve . -p 8000
```

---

## Setup API prezzi (Twelve Data)

Senza API key il sito funziona ma con prezzi fallback statici. Per prezzi automatici:

1. Registrati su [twelvedata.com/pricing](https://twelvedata.com/pricing) → piano **Basic free**.
   - 800 richieste/giorno · 8/minuto · gratis
2. Copia la tua API key dal dashboard.
3. Nel sito: clicca **⚙ Settings** → incolla la key → Salva.
4. La key resta in `localStorage` (mai inviata altrove).

### ETF UCITS supportati (verificare prima)

Twelve Data supporta la maggior parte degli ETF UCITS quotati su Borsa Italiana, Xetra, AMS. Esempi:

| ETF | Ticker Twelve Data | Borsa |
|---|---|---|
| Vanguard FTSE All-World Acc | `VWCE.MI` | Borsa Italiana |
| iShares Core MSCI World Acc | `SWDA.MI` | Borsa Italiana |
| iShares Core S&amp;P 500 Acc | `CSPX.MI` | Borsa Italiana |
| iShares Nasdaq 100 Acc | `CSNDX.MI` | Borsa Italiana |
| Vanguard FTSE All-World Acc (Xetra) | `VWCE.DE` | Xetra |

Se un ticker non funziona: prova con il suffisso `.DE` (Xetra) o `.AS` (Amsterdam), oppure usa il **manual override** nelle Settings.

---

## Configurazione strategia

Tutta la logica strategica è in `src/config.js`. Cambia → ricarica il sito → tutto si aggiorna.

```javascript
// PAC base
pac: {
  baseMonthlyAmount: 500,        // €/mese
  transferDayOfMonth: 29,         // bonifico verso TR
  investmentDayOfMonth: 2,        // acquisto ETF
  capBoostMonthsPerYear: 6,       // max mesi di boost
}

// Soglie drawdown
strategyTiers: [
  { tier: 1, ddMin: -0.10, ddMax: -0.05, multiplier: 1.20 },  // -5% to -10% → +20%
  { tier: 2, ddMin: -0.15, ddMax: -0.10, multiplier: 1.50 },  // -10% to -15% → +50%
  { tier: 3, ddMin: -0.25, ddMax: -0.15, multiplier: 2.00 },  // -15% to -25% → +100%
  { tier: 4, ddMin: -1.00, ddMax: -0.25, multiplier: 2.50 },  // < -25% → +150%
]
```

### Holdings iniziali

Quando inizi a usare il sito, copia da `data/portfolio.example.json` i tuoi valori reali in `src/config.js → initialHoldings`:

```javascript
initialHoldings: [
  {
    isin: 'IE00BK5BQT80',
    units: 12.450,                    // quote possedute
    averageCost: 124.30,              // PMC dal CSV transazioni TR
    currentPriceFallback: 130.00,
  },
],
```

---

## Email alerts (F2 — opzionale)

Il sito è browser-only: **NON può inviare email da solo**. Se vuoi un alert mensile via email, ecco la soluzione gratuita:

### Setup GitHub Actions + Resend (free tier 3.000 email/mese)

1. Crea account gratuito su [resend.com](https://resend.com) → ottieni API key.
2. Nel tuo repo GitHub → **Settings → Secrets** → aggiungi:
   - `RESEND_API_KEY` = la tua key Resend
   - `TWELVE_DATA_KEY` = la tua key Twelve Data
   - `EMAIL_TO` = il tuo indirizzo email
3. Crea il file `.github/workflows/monthly-alert.yml`:

```yaml
name: Monthly PAC Alert
on:
  schedule:
    - cron: '0 9 28 * *'    # ogni 28 del mese alle 09:00 UTC
  workflow_dispatch:         # permette esecuzione manuale

jobs:
  alert:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Compute &amp; send alert
        env:
          RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}
          TWELVE_DATA_KEY: ${{ secrets.TWELVE_DATA_KEY }}
          EMAIL_TO: ${{ secrets.EMAIL_TO }}
        run: |
          npm install resend node-fetch
          node scripts/send-alert.js
```

Lo script `scripts/send-alert.js` (da creare) replica la logica di `strategyEngine.js` e invia un'email. È F2: il sito MVP funziona perfettamente senza.

---

## Tabella costi

| Componente | Soluzione | Costo | Note |
|---|---|---|---|
| Hosting statico | GitHub Pages | €0/mese | illimitato per repo pubblici, 1 GB per privati |
| Hosting alt. | Netlify free | €0/mese | 100 GB bandwidth/mese, sufficiente |
| Hosting alt. | Vercel free | €0/mese | 100 GB bandwidth/mese |
| Dominio | github.io subdomain | €0 | `username.github.io/pac-terminal` |
| Dominio custom (opt.) | `.com` su Namecheap | ~€10/anno | non necessario |
| API prezzi | Twelve Data Basic | €0/mese | 800 req/giorno · sufficiente |
| Email alerts (F2) | Resend free | €0/mese | 3.000 email/mese · 1/giorno = 30 → ampio margine |
| Email alerts (F2) | GitHub Actions | €0/mese | 2000 minuti/mese gratis per repo privati |
| Storage utente | localStorage | €0 | nel browser, mai sul cloud |
| Monte Carlo | client-side | €0 | Web Worker locale, 3-8s |
| **TOTALE** | | **€0/mese** | |

---

## File structure

```
portfolio-dashboard/
├── index.html              ← entry point
├── README.md               ← questo file
├── styles/
│   └── styles.css          ← Bloomberg-inspired dark
├── src/
│   ├── main.js             ← entry point JS
│   ├── config.js           ← TUTTI i parametri editabili
│   ├── priceProvider.js    ← Twelve Data + cache + manual override
│   ├── portfolioEngine.js  ← valore, P/L, drawdown personale
│   ├── strategyEngine.js   ← drawdown trigger + tier
│   ├── monteCarloEngine.js ← wrapper Worker
│   ├── monteCarloWorker.js ← 50k sim vettorizzate
│   ├── taxEngine.js        ← simulazione vendita ETF Italia
│   ├── realEstateEngine.js ← IRR + costi Italia
│   ├── charts.js           ← Chart.js wrappers
│   └── ui.js               ← DOM rendering
└── data/
    └── portfolio.example.json
```

---

## Critical review — limiti dichiarati

**Cosa funziona davvero:**
- Tutto il calcolo locale (Monte Carlo, drawdown, IRR, tasse) — robusto, vettorizzato, testabile.
- Cache prezzi 24h con fallback manuale — nessuna dipendenza critica da API esterna.
- Strategia drawdown-responsive validata da 50k simulazioni log-normali.

**Cosa NON funziona o ha caveat:**
- **Prezzi automatici**: Twelve Data free tier è generoso ma non garantito per tutti i ticker UCITS. Verifica il tuo ticker nel loro symbol search prima del deploy.
- **CORS**: alcune API (Yahoo Finance non ufficiale) bloccano CORS in browser. Twelve Data permette CORS, ecco perché lo uso.
- **Email automatiche**: impossibili senza un componente serverless. La soluzione GitHub Actions + Resend funziona ma richiede setup ~30 minuti (F2).
- **Monte Carlo log-normale**: sotto-rappresenta i fat tails reali (eventi 1929, 2008). Probabilità di drawdown estremi underestimata di ~30-50% rispetto al bootstrap storico.
- **Trigger su singolo ETF**: il drawdown si calcola sul global ETF (core). Se hai allocazione 90/10 e il Nasdaq scende molto più del global, il trigger NON si attiva sul tech.
- **Cap annuale "anno solare"**: se un drawdown attraversa dicembre-gennaio, il cap si resetta arbitrariamente a metà evento. Non è ottimale ma è semplice.

**Rischi della strategia drawdown-responsive:**
- Sequence risk: nei tuoi ultimi 3-5 anni di PAC NON usare boost — il rischio di crollo proprio prima della liquidazione è amplificato.
- Behavioral risk: la regola dice "compra quando scende". Se vedi -30% in tempo reale è psicologicamente difficile aggiungere €750. Il cap a 6 mesi/anno aiuta ma non elimina.
- Regime structural: se il drawdown è da deterioramento strutturale (es. crisi del prodotto, fusione ETF), il boost non è razionale. Dura valutazione richiesta.

**Concentrazione tech:**
- 90/10 → ~28% effective tech (VWCE 24% + Nasdaq 4%): tilt mite.
- 80/20 → ~32% effective tech: limite massimo che consiglierei.
- 70/30 → ~35% effective tech: troppo concentrato per chi ha già stipendio in settore tech-related.

---

## Roadmap miglioramenti F2

- [ ] **Email alert via GitHub Actions + Resend**: file workflow + script Node.
- [ ] **Bootstrap storico in MC**: invece di log-normal, campiona dai rendimenti reali del FTSE All-World 1990-2025.
- [ ] **Multi-ticker drawdown**: applica trigger ponderato su tutti gli ETF in portfolio.
- [ ] **Storico personale**: persistenza in localStorage di valori mensili per XIRR cumulato.
- [ ] **Export PDF report mensile**: usa jsPDF per generare un PDF stampabile.
- [ ] **Dark/light mode toggle**: attualmente solo dark.
- [ ] **i18n**: attualmente solo IT, aggiungere EN.

---

## Disclaimer

Tool educativo personale. Non costituisce consulenza finanziaria. Le decisioni di investimento e operazioni immobiliari restano di esclusiva responsabilità dell'utente. I rendimenti simulati non sono indicativi di rendimenti futuri.

I dati di prezzo provengono da Twelve Data quando configurato; verificare sempre la correttezza presso il proprio broker prima di operare.

---

## License

Personal use. Codice open per modifica e self-hosting.
