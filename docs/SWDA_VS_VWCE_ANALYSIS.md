# SWDA puro vs VWCE sintetico — confronto fattuale

> **Stato**: analisi storica + Monte Carlo su serie reali. **Nessuna modifica
> a `config.js` o all'allocazione**. Questo documento è il dato grezzo per
> una decisione che resta **esclusivamente dell'utente**.

## Disclaimer

1. **VWCE sintetico** è una ricostruzione (90% SWDA + 10% EM rebalance annuale).
   VWCE reale esiste solo dal 2019; per coprire 2009-2018 si usa il proxy.
   I pesi EM reali di VWCE oscillano ~10-11%.
2. **Una sola estrazione storica** (2009-2026, ~16,7 anni). Il periodo è stato
   eccezionalmente pro-USA/dev-markets e deludente per EM. **Non predice il futuro.**
3. **Il Monte Carlo restituisce in output l'assunzione in input.** Siccome SWDA
   ha μ_storico più alto in questo campione, il MC gli darà proiezioni più
   alte per costruzione. Non è una scoperta sul futuro: è quello che hai
   messo dentro. Vedi caveat dettagliato in PARTE 2.
4. Tutto in EUR. ETF accumulating: close incorpora i dividendi reinvestiti.
5. Rendimenti sono **lordi** (TER non sottratto qui — i TER ufficiali sono
   ~0,19% per VWCE e ~0,20% per SWDA, sostanzialmente identici e neutrali al
   confronto).

## Finestra e metodologia

- **Finestra comune**: 2009-09-25 → 2026-06-02 (4233 giorni di Borsa, ~16.7 anni).
- **σ, Sharpe, Sortino**: da rendimenti **mensili** ×√12 (TASK 5: i daily
  desincronizzano su ETF con close di Borsa Italiana / Amsterdam non
  perfettamente allineati).
- **CAGR, max drawdown, recovery, rolling 10y**: level-based daily (robusti
  al desync).
- **Risk-free**: 0.0% dichiarato. Sharpe e Sortino con rf=0 sono
  confrontabili in modo coerente sui due candidati.
- **Ribilanciamento**: annuale, primo giorno di Borsa di ogni anno solare.

---

## PARTE 1 — Statistiche storiche

| metrica | SWDA 100% | VWCE sintetico (90/10) |
|---|---|---|
| CAGR | **12.1%** | **11.5%** |
| σ annualizzata | 12.4% | 12.2% |
| Sharpe | 0.97 | 0.94 |
| Sortino | 1.62 | 1.55 |
| Max drawdown | **-33.6%** | **-33.3%** |
| Picco → fondo | 2020-02-19 → 2020-03-23 | 2020-02-19 → 2020-03-23 |
| Recovery | 2021-01-07 | 2021-01-06 |
| Giorni picco→fondo | 33 | 33 |
| Giorni fondo→recovery | 290 | 289 |
| Rolling 10y worst | 7.2% (start 2010-04-20) | 6.6% (start 2010-04-20) |
| Rolling 10y best | 15.2% (start 2011-11-28) | 14.4% (start 2011-11-28) |

### Tutti i drawdown ≥10% (non solo il massimo)

**SERIE A — SWDA 100% — 7 episodi**:

| # | picco | fondo | depth | recovery | picco→fondo | underwater tot |
|---|---|---|---|---|---|---|
| 1 | 2010-04-26 | 2010-07-05 | -10.3% | 2010-11-25 | 70 gg | 213 gg |
| 2 | 2011-02-14 | 2011-08-09 | -20.7% | 2012-02-21 | 176 gg | 372 gg |
| 3 | 2015-04-15 | 2016-02-11 | -22.4% | 2016-11-30 | 302 gg | 595 gg |
| 4 | 2018-10-03 | 2018-12-27 | -15.1% | 2019-04-01 | 85 gg | 180 gg |
| 5 | 2020-02-19 | 2020-03-23 | -33.6% | 2021-01-07 | 33 gg | 323 gg |
| 6 | 2022-01-04 | 2022-06-16 | -16.8% | 2023-09-14 | 163 gg | 618 gg |
| 7 | 2025-02-19 | 2025-04-09 | -21.6% | 2025-10-03 | 49 gg | 226 gg |

**SERIE B — VWCE sintetico — 7 episodi**:

| # | picco | fondo | depth | recovery | picco→fondo | underwater tot |
|---|---|---|---|---|---|---|
| 1 | 2011-01-12 | 2011-08-09 | -20.4% | 2012-02-21 | 209 gg | 405 gg |
| 2 | 2013-05-22 | 2013-06-24 | -10.5% | 2013-10-22 | 33 gg | 153 gg |
| 3 | 2015-04-15 | 2016-02-11 | -23.7% | 2016-12-08 | 302 gg | 603 gg |
| 4 | 2018-10-03 | 2018-12-27 | -14.3% | 2019-03-19 | 85 gg | 167 gg |
| 5 | 2020-02-19 | 2020-03-23 | -33.3% | 2021-01-06 | 33 gg | 322 gg |
| 6 | 2022-01-04 | 2022-06-16 | -16.3% | 2023-12-08 | 163 gg | 703 gg |
| 7 | 2025-02-19 | 2025-04-09 | -21.3% | 2025-10-01 | 49 gg | 224 gg |

### PAC simulato €450/mese sull'intera finestra

| | SWDA 100% | VWCE sintetico |
|---|---|---|
| Mesi simulati | 202 | 202 |
| Capitale versato | €90.900 | €90.900 |
| Valore finale | **€292.369** | **€281.625** |
| Total return PAC | 221.6% | 209.8% |
| Δ assoluto A−B | €10.744 | — |
| Δ % vs B | 3.81% | — |

### Lettura onesta della Parte 1

Su questa finestra **SWDA puro ha reso un filo di più** del VWCE sintetico:
0.60% di CAGR in più, €10.744 di valore finale
PAC in più (3.8% su ~€281.625 di valore B).

**Perché**: il 10% di EM dentro VWCE ha **deluso** in questo periodo. Gli
EM (proxy IEMA dal 2009) hanno avuto una mediocre performance assoluta e
ancora più mediocre relativa ai mercati sviluppati, mentre SWDA era esposto
al 60-70% USA in un periodo di dominanza USA senza precedenti.

**Cosa NON dice questo**: che SWDA "è meglio". Dice che **chi era meno
diversificato fuori dagli USA ha vinto nel periodo 2009-2026**, che è
osservazione, non legge. La domanda strategica (Parte 3) è se quella
osservazione continuerà.

---

## PARTE 2 — Monte Carlo (50k path × 20y × €450/mese)

### ⚠️ CAVEAT OBBLIGATORIO

> Il Monte Carlo qui sotto usa come input μ e σ **stimati dalle serie reali
> della Parte 1**. SWDA ha μ_storico più alto in questo campione, quindi
> il MC gli darà mediane e percentili più alti **per costruzione, non
> perché sappia qualcosa sul futuro**.
>
> **Il MC NON è in grado di rispondere alla domanda "quale renderà di più
> nei prossimi 20 anni".** Restituisce in output l'assunzione che hai messo
> in input.
>
> Il MC è utile per **mostrare la dispersione degli esiti** dato un set di
> assunzioni — non per scegliere tra due asset. **La Parte 1 è più
> informativa della Parte 2 per questa decisione.**

### Risultati

Capitale versato in 20 anni: **€108.000** (€450 × 240 mesi).

| metrica | SWDA 100% | VWCE sintetico |
|---|---|---|
| μ_annual (input dalla Parte 1) | 12.1% | 11.5% |
| σ_annual (input dalla Parte 1) | 12.4% | 12.2% |
| Valore finale P10 (sfortuna) | €233.411 | €220.606 |
| Valore finale P25 | €294.295 | €276.585 |
| **Valore finale P50 (mediana)** | **€384.928** | **€359.381** |
| Valore finale P75 | €505.243 | €468.690 |
| Valore finale P90 (fortuna) | €652.016 | €601.108 |
| Valore finale medio | €420.527 | €391.073 |
| Prob(finale < versato) | 0.0% | 0.1% |
| MaxDD lungo il path — mediano | -16.0% | -15.9% |
| MaxDD lungo il path — peggior 10% | -23.3% | -23.1% |

### Lettura onesta della Parte 2

La mediana SWDA è ~7.1%
sopra quella VWCE — esattamente il risultato di mettere un μ più alto in
ingresso. Non è una "predizione". Il MC qui serve solo a mostrare:
- L'**ampiezza** dell'intervallo P10-P90 (è gigantesca: €418.605 di range su SWDA).
  Significa che la differenza tra "fortunato" e "sfortunato" supera di gran
  lunga la differenza tra SWDA e VWCE.
- Il **maxDD atteso lungo il percorso**: ~-16.0% mediano, e
  ~-23.3% nel peggior decile. Significa che durante 20 anni
  vedrai *con alta probabilità* uno o più drawdown grossi — devi reggerli
  senza vendere.

---

## PARTE 3 — La domanda che il backtest NON può rispondere

La differenza vera tra SWDA e VWCE è il ~10% di emergenti. Quel 10% nei
prossimi 20 anni può:
- **continuare a deludere** (gli EM hanno avuto 15+ anni di sotto-performance):
  in quel caso SWDA continua a battere VWCE leggermente. Lo scenario di
  inerzia della dominanza USA.
- **fare mean reversion**: oggi gli EM quotano a multipli molto più bassi
  (P/E ~13 vs S&P 21, P/B ~1,6 vs ~4). Storicamente valutazioni basse hanno
  predetto rendimenti più alti **a lungo termine**. Se mean reversion si
  realizza, VWCE batte SWDA.
- **non cambiare** nessuno dei due scenari in modo deciso: SWDA e VWCE
  restano sostanzialmente equivalenti, e l'effetto del 10% EM nel rumore.

**Nessun backtest può dire quale di questi tre scenari accadrà.** Il
backtest dice cosa è successo nei 16 anni passati, non cosa succederà nei
20 prossimi.

### Cosa puoi dire onestamente con questi numeri

- **Se la tua tesi è "USA continuerà a dominare"** → SWDA è coerente con la
  tesi, è meno diversificato e ha avuto rendimenti più alti.
- **Se la tua tesi è "non lo so / non voglio quella scommessa"** → VWCE è
  la scelta che non la richiede. Costa un filo in CAGR storico, ma quel
  filo (~0.60%) è dentro il rumore del Monte Carlo (range
  P10-P90 è > €419k).
- **Se la tua tesi è "EM è value play, mean revertirà"** → VWCE è il modo
  poco invasivo per esprimerla; il VWCE 90/10 NON è una scommessa
  aggressiva su EM. Se vuoi davvero scommettere su EM, ci vorrebbe un
  candidato tipo "80% VWCE + 20% EM" (= il C4 di Task 5).

### Cosa non puoi dire

- "Il backtest dice che SWDA è meglio." → No. Dice che SWDA ha reso di più
  *in questo periodo*. È un fatto storico, non una proprietà strutturale.
- "Il Monte Carlo dice che SWDA renderà di più nei prossimi 20 anni." → No.
  Il MC restituisce l'assunzione in input.

---

## Sintesi a una riga

SWDA ha battuto VWCE di 0.60% CAGR (€10.744 su un
PAC reale di €90.900) **perché EM ha deluso in questo periodo**.
La decisione sui prossimi 20 anni dipende da una tesi su EM che il backtest
non può fornire.
