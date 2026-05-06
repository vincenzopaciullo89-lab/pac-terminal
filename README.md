[README.md](https://github.com/user-attachments/files/27449241/README.md)
# PAC Terminal

> Personal Investment Intelligence — strategia ETF drawdown-responsive con Monte Carlo 50.000 simulazioni, browser-only, zero cloud.

**Live**: https://vincenzopaciullo89-lab.github.io/pac-terminal/

---

## Cos'è

Dashboard personale per il monitoraggio e l'esecuzione di un PAC ETF di lungo periodo (orizzonte 20 anni) con una logica di contributo aggiuntivo durante drawdown di mercato. Tutto gira nel browser: nessun backend, nessun account, nessun tracking. Stato persistito solo in `localStorage` del singolo browser.

## Cosa fa

- **Strategy of the month**: ogni mese rileva il drawdown sul global ETF e suggerisce se aggiungere un boost (multiplier 1.0× → 2.5×) al PAC base €500
- **Portfolio tracker**: posizioni live (target + legacy), P/L, tasse latenti regime amministrato 26%
- **Trend chart**: bande probabilistiche P5–P95 a 5 anni
- **Monte Carlo 50.000**: 5 strategie a confronto su orizzonte 20 anni (Web Worker, ~6-8s)
- **Tax simulator**: simula vendita parziale ETF con costo opportunità del prelievo
- **Real estate IRR**: calcola IRR di un'operazione immobiliare con costi Italia (registro, notaio, IVA, plus 26%) e confronta con VWCE atteso

## Struttura

```
pac-terminal/
├── index.html              # Entry point
├── styles/styles.css       # Design tokens + layout
├── src/
│   ├── main.js             # Bootstrap
│   ├── config.js           # ⚙️ DA AGGIORNARE OGNI MESE (units e PMC)
│   ├── ui.js               # Render orchestrator
│   ├── portfolioEngine.js  # Calcoli portafoglio
│   ├── strategyEngine.js   # Drawdown-responsive logic
│   ├── priceProvider.js    # Manual override + Stooq best-effort
│   ├── monteCarloEngine.js # Wrapper Web Worker
│   ├── monteCarloWorker.js # 50k sim log-normal
│   ├── taxEngine.js        # Regime amministrato Italia
│   ├── realEstateEngine.js # Costi flip Italia + IRR
│   └── charts.js           # Chart.js
└── data/
    └── portfolio.example.json
```

## Manutenzione mensile (5 minuti)

### 1. Dopo il PAC del 2 del mese, aggiorna le quote

Modifica `src/config.js` → `initialHoldings`:

```javascript
{
  isin: 'IE00BK5BQT80',
  units: 1.234567,           // ← nuovo totale dopo il PAC
  averageCost: 124.50,       // ← nuovo PMC ricalcolato
  currentPriceFallback: 131.50,
  _note: 'VWCE: target 90%',
},
```

**Formula PMC**: `nuovo_PMC = ((unitsOld × pmcOld) + (unitsNew × prezzoAcquisto)) / unitsTotali`

### 2. Aggiorna i prezzi correnti via Settings

1. Apri il sito → click **⚙ Settings** in alto a destra
2. Per ogni ETF, copia il prezzo da [justETF](https://www.justetf.com) (link diretto in modale)
3. **Salva**

I prezzi manuali hanno priorità su qualsiasi fonte automatica. Header status diventa verde "Prezzi manuali · attivi".

### 3. Se serve, registra un boost

Se il sito segnala drawdown e investi l'extra:
1. Esegui bonifico+acquisto manuale come da action items
2. Click **✓ Registra boost del mese** in dashboard
3. Il contatore "Boost YTD" si incrementa

## Provider prezzi

L'API live (Stooq) è **best-effort**. Frequentemente fallisce per CORS quando il sito gira su `github.io`. Soluzione operativa: **manual override** mensile via Settings.

Twelve Data **rimosso** perché non supporta ETF UCITS quotati su Borsa Italiana (`.MI`).

## Privacy & dati

- Tutto in `localStorage` del browser locale
- Nessun cookie, nessun analytics, nessun pixel
- Le quote/PMC reali sono nel codice sorgente del repo (privato/pubblico a tua scelta)
- Su browser diversi (Chrome desktop vs mobile) le impostazioni e prezzi manuali sono separati
- Modalità privata Safari: localStorage può rifiutare scritture (gestito gracefully con try/catch)

## Costi

| Voce | Costo |
|---|---|
| Hosting GitHub Pages | €0 |
| API prezzi | €0 (Stooq pubblico) |
| Manutenzione | €0 |
| Dipendenze (Chart.js da CDN) | €0 |

## Disclaimer

Strumento personale per uso individuale. Non costituisce consulenza finanziaria. Le proiezioni Monte Carlo sono modellazioni statistiche basate su assunzioni che potrebbero rivelarsi errate. La fiscalità italiana modellata si basa sulla normativa vigente al maggio 2026 e potrebbe variare.

---

Built with care for one investor. Browser-only. No cloud. No tracking. Not financial advice.
