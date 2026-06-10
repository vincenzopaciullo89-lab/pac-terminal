# SWDA vs VWCE — analisi comparativa completa (6 parti)

> **Data**: 2026-06-10 · **Finestra dati**: 2009-09-25 → 2026-06-02 (~16.7 anni, EUR)
> **Nessuna raccomandazione. Nessuna modifica a `config.js`.** La decisione è dell'utente.

## Disclaimer

1. **Un solo percorso storico post-GFC, eccezionalmente pro-USA.** Il vantaggio
   storico di SWDA è in larga parte funzione del periodo, non una proprietà
   strutturale. Nessuna predizione.
2. **VWCE sintetico** = 90% SWDA + 10% EM (IEMA), ribilanciato annualmente.
   Ricostruzione: VWCE reale esiste solo dal 2019. Il peso EM reale di VWCE
   oscilla tra ~10 e ~11%.
3. **TER**: i prezzi ETF incorporano già il TER (il NAV è netto). Sottrarlo di
   nuovo sarebbe double-counting. Il sintetico B incorpora ~0,198% (0,9×0,20 +
   0,1×0,18) vs 0,19% del VWCE reale → B sottostima VWCE di ~0,008 pp/anno
   (trascurabile). Il **bollo 0,2%/anno** non è nei prezzi: applicato nel PAC
   (Parte 2) su entrambi, pro-rata mensile.
4. **Il Monte Carlo restituisce le assunzioni che riceve** (vedi Parte 3).
5. Rischio da rendimenti mensili ×√12; livelli (CAGR/maxDD/rolling) daily.
   Risk-free 0.0% dichiarato. Ribilanciamento annuale.

---

## PARTE 1 — Statistiche storiche

| metrica | SWDA 100% | VWCE sintetico |
|---|---|---|
| CAGR | **12.1%** | **11.5%** |
| σ annualizzata | 12.4% | 12.2% |
| Sharpe (rf=0) | 0.97 | 0.94 |
| Sortino | 1.62 | 1.55 |
| Max drawdown | -33.6% | -33.3% |
| Picco → fondo | 2020-02-19 → 2020-03-23 | 2020-02-19 → 2020-03-23 |
| Recovery (gg dal fondo) | 2021-01-07 (290) | 2021-01-06 (289) |
| Rolling 10y worst | 7.2% | 6.6% |
| Rolling 10y best | 15.2% | 14.4% |
| # drawdown ≥10% | 7 | 7 |

### Tutti i drawdown ≥10% — SWDA (7 episodi)

| # | picco | fondo | depth | recovery | picco→fondo | underwater tot |
|---|---|---|---|---|---|---|
| 1 | 2010-04-26 | 2010-07-05 | -10.3% | 2010-11-25 | 70 gg | 213 gg |
| 2 | 2011-02-14 | 2011-08-09 | -20.7% | 2012-02-21 | 176 gg | 372 gg |
| 3 | 2015-04-15 | 2016-02-11 | -22.4% | 2016-11-30 | 302 gg | 595 gg |
| 4 | 2018-10-03 | 2018-12-27 | -15.1% | 2019-04-01 | 85 gg | 180 gg |
| 5 | 2020-02-19 | 2020-03-23 | -33.6% | 2021-01-07 | 33 gg | 323 gg |
| 6 | 2022-01-04 | 2022-06-16 | -16.8% | 2023-09-14 | 163 gg | 618 gg |
| 7 | 2025-02-19 | 2025-04-09 | -21.6% | 2025-10-03 | 49 gg | 226 gg |

### Tutti i drawdown ≥10% — VWCE sintetico (7 episodi)

| # | picco | fondo | depth | recovery | picco→fondo | underwater tot |
|---|---|---|---|---|---|---|
| 1 | 2011-01-12 | 2011-08-09 | -20.4% | 2012-02-21 | 209 gg | 405 gg |
| 2 | 2013-05-22 | 2013-06-24 | -10.5% | 2013-10-22 | 33 gg | 153 gg |
| 3 | 2015-04-15 | 2016-02-11 | -23.7% | 2016-12-08 | 302 gg | 603 gg |
| 4 | 2018-10-03 | 2018-12-27 | -14.3% | 2019-03-19 | 85 gg | 167 gg |
| 5 | 2020-02-19 | 2020-03-23 | -33.3% | 2021-01-06 | 33 gg | 322 gg |
| 6 | 2022-01-04 | 2022-06-16 | -16.3% | 2023-12-08 | 163 gg | 703 gg |
| 7 | 2025-02-19 | 2025-04-09 | -21.3% | 2025-10-01 | 49 gg | 224 gg |

### Rendimenti anno per anno (Δ = SWDA − VWCE-syn, in punti percentuali)

| anno | SWDA | VWCE-syn | Δ (pp) |
|---|---|---|---|
| 2009* | 0.0% | -2.4% | 2.4 |
| 2010 | 17.6% | 18.5% | -1.0 |
| 2011 | -4.8% | -5.9% | 1.2 |
| 2012 | 13.7% | 13.8% | -0.1 |
| 2013 | 21.7% | 18.8% | 2.9 |
| 2014 | 20.1% | 19.0% | 1.0 |
| 2015 | 11.3% | 9.6% | 1.7 |
| 2016 | 10.2% | 10.6% | -0.4 |
| 2017 | 7.8% | 9.0% | -1.3 |
| 2018 | -5.0% | -5.5% | 0.5 |
| 2019 | 30.8% | 29.7% | 1.1 |
| 2020 | 6.2% | 6.3% | -0.2 |
| 2021 | 32.9% | 30.2% | 2.7 |
| 2022 | -13.9% | -14.1% | 0.2 |
| 2023 | 19.8% | 18.5% | 1.4 |
| 2024 | 27.0% | 25.7% | 1.3 |
| 2025 | 7.6% | 8.7% | -1.2 |
| 2026 | 10.8% | 12.7% | -1.9 |

*\* = anno parziale.* SWDA sovraperforma in **11/18 anni**.
Il vantaggio non è un evento singolo ma la somma di piccoli scarti annui,
concentrati negli anni di dominanza USA (in particolare 2013-2015 e 2024-2025);
negli anni in cui EM ha retto (2010, 2012, 2016-2017, 2020, 2022) il segno
si inverte o si annulla.

### Sottoperiodi

| periodo | CAGR SWDA | CAGR VWCE-syn | vincitore | margine |
|---|---|---|---|---|
| 2009-2017 | 11.5% | 10.7% | SWDA | 0.81% |
| 2018-2026 | 12.8% | 12.3% | SWDA | 0.41% |

---

## PARTE 2 — PAC €450/mese (netto bollo 0,2%/anno; TER già nei prezzi)

| | SWDA | VWCE-syn |
|---|---|---|
| Capitale versato | €90.900 | €90.900 |
| **Finale netto bollo** | **€286.046** | **€275.603** |
| Finale lordo (riferimento) | €292.369 | €281.625 |
| Costo bollo cumulato | €6322 | €6022 |

**Δ SWDA − VWCE-syn = €10.444** (3.8% del finale VWCE-syn).

### PAC sui sottoperiodi

| periodo | finale SWDA | finale VWCE-syn | Δ |
|---|---|---|---|
| 2009-2017 | €75.049 | €73.451 | €1598 |
| 2018-2026 | €83.927 | €83.551 | €376 |

### Verdetto numerico secco

> Su questo percorso storico, il 10% di EM dentro VWCE è costato
> **€10.444** su un PAC di €90.900 in ~17 anni
> (3.8% del montante). Non una rovina, non un dettaglio:
> un costo-opportunità reale ma di second'ordine rispetto al rischio di
> percorso (vedi Parte 3).

---

## PARTE 3 — Monte Carlo (50k path × 20y × €450/mese)

### ⚠️ CAVEAT OBBLIGATORIO

> Il MC usa μ e σ stimati dalle serie della Parte 1. SWDA ha μ storico più
> alto **in questo campione** → il MC lo proietta più alto **per costruzione**.
> Non è una scoperta: è l'assunzione in input restituita in output. Il MC
> NON sa quale dei due renderà di più nei prossimi 20 anni. La Parte 1-2
> (storia reale) è più informativa del MC per questa decisione.

Versato in 20 anni: €108.000.

| metrica | SWDA | VWCE-syn |
|---|---|---|
| μ input | 12.1% | 11.5% |
| σ input | 12.4% | 12.2% |
| P10 | €233.411 | €220.606 |
| P25 | €294.295 | €276.585 |
| **P50** | **€384.928** | **€359.381** |
| P75 | €505.243 | €468.690 |
| P90 | €652.016 | €601.108 |
| Prob(< versato) | 0.0% | 0.1% |
| MaxDD path mediano | -16.0% | -15.9% |
| MaxDD path peggior 10% | -23.3% | -23.1% |

### Overlap delle distribuzioni

**OVL = 92.7%** — **sopra l'80%: in proiezione i due profili sono statisticamente quasi indistinguibili.** La dispersione del percorso domina la differenza tra i due asset.

---

## PARTE 4 — Interazione col portafoglio reale

Posizioni attuali (prezzi correnti): SWDA + CSPX + CSNDX + VETA ≈ €3183.
Esposizione equity attuale: USA ~88.5% (stima da composizioni
indice, coerente con TASK 5: SWDA 72% USA, CSPX/CSNDX 100%, VWCE 65% USA / 10% EM).

**Assunzione dichiarata**: crescita nominale **uguale per tutti gli asset (7%/anno)**
per isolare l'**effetto-flusso**. Flussi: S = €450/mese SWDA + €50 CSNDX;
V = €450/mese VWCE + €50 CSNDX. Boost tattici esclusi. VETA esclusa dal
calcolo geografico (bond legacy, quota mostrata a parte).

| orizzonte | USA% equity (S) | EM% (S) | USA% equity (V) | EM% (V) | VETA% sul totale |
|---|---|---|---|---|---|
| oggi | 88.5% | 0.0% | 88.5% | 0.0% | 9.7% |
| 5 anni | 76.2% | 0.0% | 70.5% | 8.1% | 1.1% |
| 10 anni | 75.6% | 0.0% | 69.7% | 8.4% | 0.7% |
| 20 anni | 75.4% | 0.0% | 69.3% | 8.6% | 0.4% |

**Lettura fattuale**: con S il portafoglio resta a **0% emergenti per sempre**
e converge verso ~75.4% USA (il flusso SWDA al 72% USA + il
€50 CSNDX al 100% USA). Con V l'EM entra gradualmente fino a ~8.6%
dell'equity, e l'esposizione USA scende verso ~69.3%.
Nota: se gli asset USA crescessero più degli altri (come nel periodo storico),
le percentuali USA sarebbero **più alte** di queste in entrambi gli scenari.

---

## PARTE 5 — Scenari avversi simmetrici (stesse unità: euro su PAC 20y)

**Assunzione dichiarata (debole)**: μ forward DM = 6.5% nominale EUR
(consenso istituzionale ~5-7%). Scenari EM costruiti simmetrici a ±3pp attorno a DM.

FV del PAC scenario S (100% DM): **€216.967** su €108.000 versati.

| scenario per EM | rendimento blended V | FV (V) | Δ V−S in euro |
|---|---|---|---|
| EM continua a deludere (DM−3pp = 3,5%) | 6.2% | €209.720 | **€-7247** |
| EM = DM (neutro) | 6.5% | €216.967 | **€0** |
| EM mean-reversion (DM+3pp = 9,5%) | 6.8% | €224.499 | **€7531** |

**Lettura simmetrica**:
- **Contro V** (EM continua a deludere come 2010-2026): il 10% EM costa
  **~€7247** in 20 anni.
- **Contro S** (EM mean-reversion +3pp): si lasciano sul tavolo
  **~€7531** in 20 anni.
- I due rischi sono **della stessa grandezza** per costruzione (±3pp).
  L'asimmetria, se c'è, non è nei numeri ma nel punto di partenza
  valutativo: con S si sarebbe ~75.4% su sviluppati/USA
  mentre le valutazioni relative USA sono al massimo storico
  (CAPE >35 vs EM P/E ~13). Questo è un FATTO sulle valutazioni di oggi,
  non una previsione sui rendimenti di domani.

---

## Sintesi fattuale (nessuna raccomandazione)

1. Storicamente (2009-2026): SWDA +0.60% CAGR,
   **+€10.444** su un PAC reale di €90.900 netto bollo.
   Vantaggio distribuito su 11/18 anni, stabile nei due
   sottoperiodi, interamente attribuibile alla sotto-performance EM del periodo.
2. Drawdown: **stessi 7 episodi ≥10%, stesse date, profondità quasi
   identiche**. Sul rischio di percorso i due sono gemelli.
3. In proiezione (MC): overlap 92.7% — la fortuna del ventennio conta
   molto più della scelta tra i due.
4. Sul portafoglio reale: S consolida ~75.4% USA e 0% EM
   permanente; V porta gradualmente a ~8.6% EM e
   ~69.3% USA.
5. I due rischi simmetrici (EM continua a deludere vs mean-reversion) valgono
   entrambi ~€9-10k su 20 anni. La scelta è una presa di posizione su EM,
   che il backtest non può fare al posto dell'utente.
