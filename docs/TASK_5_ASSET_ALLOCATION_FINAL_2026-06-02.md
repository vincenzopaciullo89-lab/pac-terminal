# Task 5 (O1) — Analisi di asset allocation — REPORT FINALE

> **Data**: 2026-06-02 · **Branch**: `feat/task5-historical-metrics` · **`config.js`**: **NON modificato**
>
> ## DISCLAIMER OBBLIGATORIO — leggere prima di tutto
>
> 1. **Un solo percorso storico** (2010-05-19 → 2026-05-29). Una sola estrazione, non un campione di futuri.
> 2. **Periodo eccezionalmente favorevole**: post-GFC, tassi reali negativi per ~10 anni, dominanza tech-USA senza precedenti (Mag 7 da ~9% a ~22% di MSCI World).
> 3. **CAGR 12-15% nominali EUR non sono ripetibili.** Consensus istituzionale Q1 2025: equity globale ~3-5% reale a 10y.
> 4. **Il backtest premia per costruzione chi era esposto all'asset vincente del periodo.** Tilt USA-tech "vince" il backtest perché USA-tech ha vinto il periodo. Non è un'inferenza fuori campione.
> 5. **Tutti i forecast forward sono inaffidabili.** Le stime usate qui sono giudizi tracciati, non previsioni.
> 6. **Questa analisi è supporto alla decisione, NON raccomandazione di investimento.** La decisione finale è esclusivamente di chi investe.

---

## Executive summary

### La decisione vera (non è il punteggio)

> **Sei disposto a scommettere che i prossimi 20 anni di USA/tech somiglino agli ultimi 16?**

Tutto il resto è secondario. Lo scoring strutturato qui sotto produce un vincitore (C4), ma è un'**opinione strutturata, non una verità**. Le tre risposte oneste alla domanda sopra:

- **Sì, con gli occhi aperti** → **C3** (70/30 VWCE/CSNDX) è difendibile. Concentrazione USA 76% / tech 35%, rischio di coda non visto nei dati (un crollo tech tipo 2000-2002 ti porterebbe a stimati −55÷−65% EUR), staying power messo alla prova quando il PAC tattico ti chiede di comprare di più. In cambio, se la dominanza USA continua, rendi di più. Lo scoring strutturato lo mette **ultimo** in tutti e 4 gli scenari — è la scelta che richiede una scommessa esplicita contro la cautela.
- **Non lo sai / non vuoi quella scommessa** → **C1** o **C2**. C2 (status quo 90/10) aggiunge pochissimo a C1 ma non toglie niente. Differenza tra C1 e C2 statisticamente indistinguibile. Difendibile per inerzia.
- **Vuoi vera protezione contro "USA come Giappone 1989"** → **C4** (20% EM). È il vincitore in tutti gli scenari del sensitivity. Accetti che costi rendimento atteso quando il trade USA funziona, e che la tesi mean-reversion EM non è garantita.

### Cosa lo scoring strutturato dice

**C4 vince in tutti e 4 gli scenari del sensitivity** (LOCKED + 3 alternativi). È evidenza più solida di quanto io stesso mi aspettassi.

| Scenario | 1° | 2° | 3° | 4° | 5° | 6° | margine 1°-2° |
|---|---|---|---|---|---|---|---|
| LOCKED | **C4** (6.89) | C1 (5.99) | C5 (5.68) | C2 (5.42) | C6 (5.29) | C3 (3.89) | 0.90 (15%) |
| A pro-rendimento | **C4** (6.92) | C1 (6.23) | C5 (5.77) | C2 (5.74) | C6 (5.05) | C3 (4.08) | 0.69 (11%) |
| B pro-robustezza | **C4** (6.30) | C1 (5.69) | C5 (5.69) | C2 (5.49) | C6 (4.82) | C3 (4.60) | 0.61 (11%) |
| C equipeso | **C4** (7.06) | C1 (6.31) | C5 (5.69) | C2 (5.65) | C6 (5.07) | C3 (3.78) | 0.75 (12%) |

### Auto-critica metodologica (importante)

C4 vince anche perché **la sub-dimensione "EM-bonus"** dentro Diversificazione gli dà 10/10 (è l'unico con peso EM significativo escluso C5). Se non avessi messo quella sub-componente — o se l'avessi pesata diversamente — il vantaggio di C4 si ridurrebbe ulteriormente. **Lo scoring è un'opinione strutturata, non una verità**: i numeri sotto sono coerenti, ma le decisioni sotto i numeri (cosa contare come "diversificazione vera") sono mie. Tienilo presente.

### Cosa non dice lo scoring

- **Non dice "C3 è una cattiva scelta".** Dice "lo scoring fatto con questi pesi e queste sub-dimensioni penalizza C3". Se la tua tesi è "USA/tech continueranno a dominare", C3 è coerente.
- **Non dice "C4 vincerà il prossimo decennio".** Dice "C4 è la scelta che minimizza il rimpianto in più scenari plausibili", che è cosa diversa.
- **Non sostituisce la tua tolleranza al rischio di coda.** Se in un -50% prolungato venderesti, scegliere C3 (o anche C4) è peggio che scegliere C1 e non vendere.

---

## Metodologia

### Finestra di analisi

- **Range comune**: 2010-05-19 → 2026-05-29 (~16 anni, 3.875 giorni di Borsa comuni).
- **Vincolo**: data di inizio di CSPX su Borsa di Amsterdam (2010-05-19).
- **Tutto in EUR**. ETF accumulating (CAGR ≈ total return; nessun dividend drag).

### Decisione C6 (legacy reale)

VETA ha storia troppo corta (2019-02) per finestra comune 16y. C6 è ricalcolato come **legacy ex-VETA** con pesi renormalizzati (SWDA 41,57% · CSPX 32,12% · CSNDX 26,31%, dai valori € reali ex-VETA). VETA descritto qualitativamente come bond legacy congelato (~10% del portafoglio reale), non incluso nel confronto perché non più alimentato.

### Calcolo metriche di rischio

- **CAGR, maxDD, recovery, rolling 10y**: da prezzi **daily** (level-based, robusti).
- **σ, Sharpe, Sortino, correlazioni**: da rendimenti **mensili** ×√12. Necessario perché CSNDX.MI (Milano) ha close non sincroni col close USA nel periodo pre-2020 (ETF a bassa liquidità su Borsa Italiana) → la correlazione/vol daily era distorta (corr swda-csndx 0,41 daily vs 0,86 monthly). Questa correzione è stata trovata in CHECKPOINT 5.2.

### Ribilanciamento

**Annuale**, primo giorno di Borsa di ogni anno solare. Multi-asset: si riportano i pesi al target. Single-asset (C1): nessun ribilanciamento.

### No look-ahead

Il backtest tattico (Task D) era walk-forward perché lo richiedeva la simulazione mese-per-mese del trigger. Qui non c'è trigger: si misurano le proprietà ex-post di ciascuna allocazione sull'intera finestra. Non si applica la nozione di look-ahead (l'analista del 2026 può legittimamente guardare i dati 2010-2026 e calcolarne le statistiche).

### Scoring

Normalizzazione **min-max** su 0-10 sui soli 6 candidati della griglia:
- *higher is better* → `score = 10 * (raw - min) / (max - min)`
- *lower is better* → `score = 10 * (max - raw) / (max - min)`

Dimensioni-giudizio (Rendimento atteso forward, Behavioral): punteggio 1-10 con razionale tracciato (vedi sotto). Dimensioni composite (Robustezza, Diversificazione): media equi-pesata delle sub-componenti normalizzate.

**Pesi LOCKED**: Costo 20% · Robustezza 25% · Diversificazione 20% · Rendimento atteso 20% · Behavioral 15%.

---

## Scheda per candidato

### C1 — VWCE 100%

Singolo ETF, FTSE All-World, ~65% USA / 24% tech / 10% EM (incluso dentro VWCE).
| | |
|---|---|
| CAGR storico EUR | 12,1% |
| σ (monthly×√12) | 12,8% |
| maxDD | -33,6% (COVID 2020, recovery 290g) |
| worst 10y | 8,3% — best 10y 15,1% |
| Cost wedge 20y / €100K | €7.518 |
| USA agg. / Tech agg. | 65% / 24% |
| **Rendimento atteso forward (giudizio)** | **6,0/10** — baseline equity globale, ~5-7% nominale EUR; nessun premio strutturale |
| **Behavioral (giudizio)** | **9,0/10** — 1 asset, narrativa robusta, staying power alto |

### C2 — VWCE 90% / CSNDX 10% (status quo target)

Il PAC operativo attuale. Aggiunge un 10% di Nasdaq 100 a VWCE.
| | |
|---|---|
| CAGR storico EUR | 12,9% |
| σ | 13,0% |
| maxDD | -33,0% (COVID, 261g) |
| worst 10y | 9,1% — best 10y 16,1% |
| Cost wedge 20y / €100K | €7.722 (+€305 vs più economico) |
| USA agg. / Tech agg. | 68,5% / 27,5% (+3,5% / +3,5% vs C1) |
| **Rendimento atteso forward** | **6,0/10** — identico a C1: il tilt CSNDX è amplificazione di asset in fase di multiple compression |
| **Behavioral** | **8,5/10** — quasi C1, narrativa identica |

**Osservazione**: CSNDX è ~96% già dentro VWCE. C2 vs C1 è essenzialmente un tilt da 3,5% USA-tech in più, non aggiunge titoli.

### C3 — VWCE 70% / CSNDX 30%

Tilt USA-tech significativo.
| | |
|---|---|
| CAGR storico EUR | **14,6%** (il più alto tra i non-legacy) |
| σ | 13,6% |
| maxDD | -31,9% (COVID, recovery rapido 163g) |
| worst 10y | 10,6% — best 10y 18,2% |
| Cost wedge 20y / €100K | €8.129 (+€712 vs più economico) |
| USA agg. / Tech agg. | 75,5% / 34,5% (+10,5% / +10,5% vs C1) |
| **Drawdown bear 2022** | **-19,5%** (vs C1 -16,8%) |
| **Rendimento atteso forward** | **5,0/10** — headwind multipli USA-tech (CAPE >35); nessuna fonte serie dà premio Nasdaq forward |
| **Behavioral** | **5,0/10** — rischio abbandono ALTO in bear tech; ostacola anche il boost tattico Task D |

**Punto critico**: l'extra-CAGR storico di +2,5%/y deriva da espansione multipli + dominanza Mag 7 non ripetibili. Stima di stress in scenario dot-com 2000-2002: −55÷−65% EUR vs ~-45% di C1.

### C4 — VWCE 80% / EM 20% — **vincitore in tutti gli scenari**

| | |
|---|---|
| CAGR storico EUR | 11,1% (il più basso) |
| σ | 12,4% (il più basso) |
| maxDD | -33,1% (COVID, 289g) |
| worst 10y | 7,1% (il più basso) — best 10y 13,6% |
| Cost wedge 20y / €100K | €7.481 (+€64 vs più economico) |
| USA agg. / Tech agg. | **52,0%** / 23,6% (−13% USA vs C1) |
| **Drawdown bear 2022** | **-15,9%** (il migliore) |
| **Rendimento atteso forward** | **6,5/10** — leggero premio per valutazione EM bassa (P/E ~13 vs S&P 21); tesi mean-reversion non garantita |
| **Behavioral** | **6,5/10** — pressione narrativa costante ("perché EM se USA vince?") |

**Osservazione**: l'EM ha PIL in crescita ma rendimenti azionari storicamente deludenti (MSCI EM 2010-2026 ~3-4%/y vs S&P ~14%). Il caso bullish non è "EM crescono di più", è "EM hanno valutazioni basse → mean reversion possibile".

### C5 — VWCE 70% / CSNDX 15% / EM 15%

Ibrido tre componenti.
| | |
|---|---|
| CAGR storico EUR | 12,6% |
| σ | 12,8% |
| maxDD | -32,4% |
| worst 10y | 8,6% — best 10y 15,6% |
| Cost wedge 20y / €100K | €7.796 |
| USA agg. / Tech agg. | 60,5% / 28,9% |
| **Rendimento atteso forward** | **6,0/10** — ibrido medio (tilt EM e tilt tech con segni opposti) |
| **Behavioral** | **5,5/10** — 3 asset = 3 attriti |

### C6 — Legacy reale ex-VETA (riferimento, non target)

| | |
|---|---|
| CAGR storico EUR | **15,0%** |
| σ | 13,7% |
| maxDD | -32,1% (recovery 163g) |
| worst 10y | 11,1% — best 10y 19,2% |
| Cost wedge 20y / €100K | €7.416 (il più economico — CSPX 0,07% TER) |
| USA agg. / Tech agg. | **88,4%** / 36,6% (il più concentrato) |
| **Rendimento atteso forward** | **5,0/10** — più concentrato USA, soggetto allo stesso headwind multipli |
| **Behavioral** | **3,0/10** — legacy congelato, NON gestibile/target operativo |

---

## Tabella scoring completa — pesi LOCKED

| candidato | Costo (20%) | Robustezza (25%) | Diversificazione (20%) | Fwd (20%) | Behavioral (15%) | **Totale** |
|---|---|---|---|---|---|---|
| C1 | 8,58 → 1,72 | 2,60 → 0,65 | 5,37 → 1,07 | 6,00 → 1,20 | 9,00 → 1,35 | **5,99** |
| C2 | 5,71 → 1,14 | 3,90 → 0,97 | 4,15 → 0,83 | 6,00 → 1,20 | 8,50 → 1,27 | **5,42** |
| **C3** | 0,00 → 0,00 | 7,17 → 1,79 | 1,72 → 0,34 | 5,00 → 1,00 | 5,00 → 0,75 | **3,89** |
| **C4** | 9,10 → 1,82 | 3,19 → 0,80 | 10,00 → 2,00 | 6,50 → 1,30 | 6,50 → 0,97 | **6,89** |
| C5 | 4,67 → 0,93 | 5,27 → 1,32 | 7,02 → 1,40 | 6,00 → 1,20 | 5,50 → 0,82 | **5,68** |
| C6 | 10,00 → 2,00 | 7,35 → 1,84 | 0,00 → 0,00 | 5,00 → 1,00 | 3,00 → 0,45 | **5,29** |

Ordine LOCKED: **C4 > C1 > C5 > C2 > C6 > C3**.

### Robustezza — sub-componenti (perché C3 vince questa singola dimensione)

| | maxDD | recovery | worst 10y | bear 2022 |
|---|---|---|---|---|
| C1 | 0,00 | 0,00 | 2,97 | 7,44 |
| C2 | 3,38 | 2,28 | 4,92 | 5,01 |
| C3 | **10,00** | **10,00** | **8,70** | 0,00 |
| C4 | 2,67 | 0,08 | 0,00 | **10,00** |
| C5 | 7,07 | 4,65 | 3,66 | 5,71 |
| C6 | 8,60 | 10,00 | 10,00 | 0,80 |

C3 vince 3 sub-componenti su 4 nella robustezza storica — **ma è esattamente la robustezza artificiale di chi era esposto all'asset vincente del periodo**. C3 perde nettamente sul bear 2022 (l'unico campione di "crisi sbagliata" nella finestra).

### Diversificazione — sub-componenti

| | inv-USA | inv-Tech | EM-bonus |
|---|---|---|---|
| C1 | 6,42 | 9,69 | 0,00 |
| C2 | 5,46 | 7,00 | 0,00 |
| C3 | 3,54 | 1,62 | 0,00 |
| **C4** | **10,00** | **10,00** | **10,00** |
| C5 | 7,66 | 5,89 | 7,50 |
| C6 | 0,00 | 0,00 | 0,00 |

**Auto-critica**: C4 prende 30/30 punti diversificazione perché è l'unico con peso EM significativo (escluso C5 con 7,50). Se ridefinissi la sub-componente "EM-bonus" (es. ne togliessi metà del peso), C4 perderebbe vantaggio. Vedi sezione *Limiti dello scoring* in fondo.

---

## Sensitivity — i 3 scenari richiesti

Per ogni scenario, i pesi totali sommano 100%.

### Scenario A — Pro-rendimento aggressivo (fwd 40%)

`cost 15% · robust 15% · divers 15% · fwd 40% · behav 15%`

| rank | candidato | score |
|---|---|---|
| 1 | **C4** | 6,92 |
| 2 | C1 | 6,23 |
| 3 | C5 | 5,77 |
| 4 | C2 | 5,74 |
| 5 | C6 | 5,05 |
| 6 | C3 | 4,08 |

Anche enfatizzando il rendimento atteso al 40%, **C3 resta ultimo**. Motivo: il punteggio forward giudicato gli dà 5/10 (non 8/10 che avrebbe se avessi usato il CAGR storico). Se avessi usato il CAGR, C3 sarebbe primo per costruzione meccanica — esattamente il bias da cui ti volevi proteggere.

### Scenario B — Pro-robustezza (robust 35% + behav 25%)

`cost 10% · robust 35% · divers 20% · fwd 10% · behav 25%`

| rank | candidato | score |
|---|---|---|
| 1 | **C4** | 6,30 |
| 2-3 | C1 / C5 | 5,69 (pareggio esatto) |
| 4 | C2 | 5,49 |
| 5 | C6 | 4,82 |
| 6 | C3 | 4,60 |

C1 e C5 finiscono in pareggio esatto (5,69). C3 risale dal 6° al 6° comunque, perché la robustezza storica gli dà punti ma il behavioral (peso 25%) glieli toglie. C6 sale grazie al cost ridotto e alla robustezza storica.

### Scenario C — Equipeso (5×20%)

`cost 20% · robust 20% · divers 20% · fwd 20% · behav 20%`

| rank | candidato | score |
|---|---|---|
| 1 | **C4** | 7,06 |
| 2 | C1 | 6,31 |
| 3 | C5 | 5,69 |
| 4 | C2 | 5,65 |
| 5 | C6 | 5,07 |
| 6 | C3 | 3,78 |

### Stabilità del vincitore

**C4 vince in tutti e 4 gli scenari**. Vincitori unici = 1. Evidenza più solida di quanto io stesso mi aspettassi.

**Margini 1°-2°**: 10,7% – 15,0% in tutti gli scenari. Tutti sopra la soglia 5% — i candidati **non** sono statisticamente equivalenti tra di loro. Ma il margine **non è schiacciante**: C4 batte C1 di ~0,7-0,9 punti su 10. Non è un knock-out.

**Ordine 2°-3°-4°**: nel LOCKED sono C1 (5,99) → C5 (5,68) → C2 (5,42). Differenza tra C2 e C5 di 0,26 punti = **indistinguibili tra di loro**. Tra C1 e C2 la differenza è 0,57 punti — al limite della soglia 0,5 dichiarata come equivalenza.

---

## Limiti dello scoring (auto-critica esplicita)

1. **L'EM-bonus dentro Diversificazione premia C4 per costruzione.** È una mia scelta, non un dato. Se la togliessi, C4 e C1 si avvicinerebbero molto.
2. **Il punteggio Robustezza è dominato dal COVID** (tutti i maxDD sono lì). Il bear 2022 ha solo 1/4 del peso dentro Robustezza. Se desse di più peso al bear (che è "la crisi giusta" per testare tilt USA-tech), C3 scenderebbe ancora, C4 salirebbe ancora.
3. **I punteggi forward (5-6,5/10) hanno dispersione molto stretta.** Coerente con la realtà (i forecast forward sono inaffidabili), ma significa che la dimensione "Rendimento atteso" non discrimina molto tra candidati. Il vero discriminatore è Diversificazione + Behavioral.
4. **Behavioral è puro giudizio mio**, non un dato. Se per te il rischio abbandono è basso (sei disciplinato), C3 sale di 1-2 punti.

**Conseguenza**: il ranking è coerente con i numeri e le scelte di scoring, ma **non è una verità oggettiva**. È una opinione strutturata che dice "se valuti l'asset allocation come l'ho valutata io, C4 è il candidato meno fragile in più scenari". È supporto al pensiero, non sostituto.

---

## Conclusione

I numeri convergono: C4 (VWCE 80% / EM 20%) è il vincitore stabile di tutti gli scenari di sensitivity. C3 (il candidato col CAGR storico più alto) è ultimo in tutti. Ma il messaggio robusto è più sottile:

- **Il backtest da solo non è argomento per cambiare allocazione.** Se vuoi cambiare, è perché hai una **tesi** sui prossimi 20 anni (USA continua? USA si ridimensiona? EM tornano?). I numeri ti dicono cosa è successo, non cosa succederà.
- **Lo status quo (C2) è in pareggio sostanziale con C1 e C5** in tutti gli scenari. Cambiare da C2 a C1 è cosmetica. Cambiare da C2 a C4 è una **scommessa di posizionamento** (meno USA, più EM), giustificata se condividi la lettura "valutazioni USA elevate + mean reversion EM".
- **C3 lo scoring lo penalizza forte ma la decisione resta tua**: se hai convinzione USA/tech e regge il drawdown senza vendere, C3 è coerente. Se hai dubbi su una delle due, no.

La domanda decisiva resta: **sei disposto a scommettere che i prossimi 20 anni di USA/tech somiglino agli ultimi 16?**

---

## Stato e prossimi passi

- **`config.js` NON modificato.** Nessun cambio di allocazione applicato. Allocazione corrente operativa resta C2 (90/10).
- **PR**: `feat/task5-historical-metrics` con `scripts/asset_allocation_analysis.js` + `docs/TASK_5_ASSET_ALLOCATION_5_3.md` + questo report.
- **Decisione**: solo tua. Quando decidi (se decidi di cambiare), aprirò una PR separata per `config.allocation`. Se decidi di restare su C2, archivio questi report come riferimento storico e si chiude TASK 5.
