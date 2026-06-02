# Task D — Backtest del sistema tattico di boost

> **Stato**: risultati definitivi della calibrazione. Raccomandazione esplicita
> per `config.js` in fondo, ma **non scritta** finché non OK utente.

## Metodologia

- **Dato**: SWDA (iShares Core MSCI World, EUR) — `data/analysis/swda.json`,
  2009-09-25 → 2026-05-29, 4.232 close giornalieri, 201 mesi.
- **Valuta**: EUR per tutto (i drawdown si misurano nella valuta del PAC).
- **PAC**: €500/mese, acquisto al primo giorno di Borsa di ogni mese.
- **Walk-forward / no look-ahead**: a ogni mese le metriche usano solo i
  close fino a quel mese. `assertNoLookAhead` runtime verifica su ogni iterazione.

## Benchmark nullo: PAC fisso puro

| | Valore |
|---|---|
| Investito (201 × €500) | **€100.500** |
| Valore finale | **€323.123** |
| Ritorno money-weighted | **+221,5%** |

Tutto va riferito a questo.

---

## Conclusione cruciale, prima dei dettagli

> **Il timing tattico aggiunge €600 in 16 anni = 0,2% del totale fisso.**
> Dentro il rumore statistico. La griglia 5-tier ha timing α nell'intervallo
> **−€367 ↔ +€603**. Tre combinazioni su nove timano *peggio* di un boost
> ridistribuito uniformemente alla cieca.
>
> Il valore reale del PAC è la **disciplina di versamento costante** e
> l'**eventuale extra-investimento** nei drawdown. NON è il market timing.
>
> Il sistema tattico viene mantenuto come **meccanismo comportamentale**
> (versare di più quando fa paura aiuta a non vendere nel panico). Per
> questo scopo serve la **massima semplicità**, non un sistema a 5 tier.

---

## I numeri (intero periodo)

### Griglia 5-tier, ordinata per efficienza D3

| # | soglie tier (ddATH) | B | eff D3 | extra € | boost € | **timingα €** | boost/anno | maxCassa |
|---|---|---|---|---|---|---|---|---|
| 1 | C {-10/-15/-22/-35} | 3% | 3,48x | €5.919 | €1.700 | +€454 | 1,4 | €650 |
| 2 | C {-10/-15/-22/-35} | 5% | 3,48x | €5.919 | €1.700 | +€454 | 1,4 | €650 |
| 3 | C {-10/-15/-22/-35} | 8% | 3,48x | €5.919 | €1.700 | +€454 | 1,4 | €650 |
| 4 | A {-5/-10/-15/-25} | 3% | 3,33x | €17.964 | €5.400 | **+€603** | 3,1 | €1.450 |
| 5 | A {-5/-10/-15/-25} | 5% | 3,33x | €17.963 | €5.400 | +€601 | 3,1 | €1.450 |
| 6 | A {-5/-10/-15/-25} | 8% | 3,28x | €15.598 | €4.750 | +€326 | 2,0 | €1.400 |
| 7 | B {-7/-13/-20/-30} | 3% | 3,16x | €9.945 | €3.150 | **−€183** | 2,3 | €850 |
| 8 | B {-7/-13/-20/-30} | 5% | 3,16x | €9.945 | €3.150 | −€183 | 2,3 | €850 |
| 9 | B {-7/-13/-20/-30} | 8% | 3,09x | €8.957 | €2.900 | **−€367** | 2,0 | €850 |

### €600 in proporzione

| Quantità | Valore | % sul fisso (€323k) |
|---|---|---|
| Timing α del miglior tattico 5-tier | €603 | **0,19%** |
| Extra assoluto miglior tattico 5-tier (set A) | €17.964 | 5,6% |
| **Differenza** (= "ho solo investito €5.400 in più") | €17.361 | **5,4%** |

→ **96,6% dell'extra del miglior tattico 5-tier è "ho versato di più", non timing.**

### Filtro B (dd252D declassamento)
Su set C non morde mai (3 righe identiche per B=3/5/8%). Su set A morde solo
ai bordi (€18k → €15,6k). **Parametro di second'ordine, candidato all'eliminazione.**

---

## Robustezza — sub-periodi (top-3 per efficienza D3)

### 2009-2017 (100 mesi)
| # | soglie tier | B | eff D3 | extra € | timing α € | boost € |
|---|---|---|---|---|---|---|
| 1 | C {-10/-15/-22/-35} | 3% | 1,77x | €1.324 | +€82 | €750 |
| 2 | C {-10/-15/-22/-35} | 5% | 1,77x | €1.324 | +€82 | €750 |
| 3 | C {-10/-15/-22/-35} | 8% | 1,77x | €1.324 | +€82 | €750 |

### 2018-2026 (101 mesi)
| # | soglie tier | B | eff D3 | extra € | timing α € | boost € |
|---|---|---|---|---|---|---|
| 1 | C {-10/-15/-22/-35} | 3% | 2,25x | €2.136 | +€466 | €950 |
| 2 | C {-10/-15/-22/-35} | 5% | 2,25x | €2.136 | +€466 | €950 |
| 3 | C {-10/-15/-22/-35} | 8% | 2,25x | €2.136 | +€466 | €950 |

**Vincitore stabile tra sub-periodi: SÌ** (entrambi set C, B irrilevante).

Buon segnale, ma con due caveat:
1. È un po' tautologico: "boosta solo agli estremi" vince sempre sull'efficienza-per-euro.
2. I livelli di efficienza differiscono (1,77x vs 2,25x) — è ancora rumore.

---

## Mini-backtest — REGOLA MINIMA (2 soglie su ddATH)

**Regola**:
- `ddATH ≤ -20%` → boost +100% → **€1.000**
- `ddATH ≤ -10%` → boost +50% → **€750**
- altrimenti → **€500**, no boost
- cap L16 (6 boost/anno) attivo

Confronto sull'intera serie 2009-2026:

| strategia | parametri | mesi boost | boost € | extra € | **timing α €** | eff D3 | finale € | maxCassa |
|---|---|---|---|---|---|---|---|---|
| PAC FISSO PURO | — | 0 | €0 | €0 | €0 | — | €323.123 | €0 |
| **MINIMA (no filtro B)** | **2 soglie** | **23 (1,4/y)** | **€6.000** | **€20.444** | **+€1.153** | **3,41x** | **€343.567** | **€1.750** |
| MINIMA + filtro B=3% | 2 + filtro | 23 (1,4/y) | €6.000 | €20.444 | +€1.153 | 3,41x | €343.567 | €1.750 |
| MINIMA + filtro B=5% | 2 + filtro | 23 (1,4/y) | €6.000 | €20.444 | +€1.153 | 3,41x | €343.567 | €1.750 |
| 5-TIER set C B=5% (best D3) | 5 tier + B | 23 (1,4/y) | €1.700 | €5.919 | +€454 | 3,48x | €329.043 | €650 |
| 5-TIER set A B=3% (max impatto) | 5 tier + B | 52 (3,1/y) | €5.400 | €17.964 | +€603 | 3,33x | €341.088 | €1.450 |

### Tre fatti che cambiano la conclusione

1. **La regola minima domina la 5-tier nel timing α.**
   Timing α minima = **+€1.153**, miglior 5-tier (set A) = +€603, miglior set C = +€454.
   La regola minima ha **+90% di timing α** rispetto al meglio della 5-tier.
   Perché? Set C scatta a -10% ma multiplica per 1,1x → boost di soli €50 al primo gradino (sotto-boost). La minima scatta a -10% con +€250 → sfrutta meglio il segnale. Set A scatta a -5% → boost sprecati su piccoli ribassi non significativi.

2. **Il filtro B è dead code in pratica.**
   Le tre varianti (no/3%/5%) danno **output identico**. Su questa serie, ogni volta che `ddATH ≤ -10%`, anche `dd252D ≤ -3%`. Il filtro non si attiva mai.
   → **Eliminarlo** per semplicità.

3. **Cassa più alta della 5-tier, ma comunque modesta.**
   Max €1.750 su 18 mesi (vs €650-1.450 della 5-tier). Largamente sotto il budget €6-9K (D4).

### Regola minima sui sub-periodi

| Periodo | mesi boost | boost € | extra € | timing α € | eff D3 |
|---|---|---|---|---|---|
| 2009-2017 | 11 | €2.750 | €4.785 | +€230 | 1,74x |
| 2018-2026 | 12 | €3.250 | €6.821 | +€1.106 | 2,10x |

Numero di boost simile tra i due periodi (11 vs 12), **timing α positivo in entrambi**. Più stabile del set C 5-tier sui sub-periodi (€82 → €466).

---

## ⚠️ DISCLAIMER

1. **Un solo percorso storico** (2009-2026). Periodo eccezionalmente favorevole all'equity (post-GFC + tassi zero).
2. **Over-fitting reale**: con timing α della 5-tier nel rumore, "ottimizzare le soglie" era ottimizzare rumore. La regola minima riduce il rischio per costruzione (2 parametri vs 5+1).
3. **+€1.153 di timing α resta modesto** in valore assoluto: 0,36% del totale fisso a 16 anni. **Anche la regola minima, da sola, non è una macchina da rendimento.** Il suo valore è comportamentale.

---

## Raccomandazione (in attesa di OK utente — `config.js` NON toccato)

**Adotta la regola minima 2-soglie, senza filtro B, su VWCE operativamente:**

```
ddATH ≤ -20%  →  €1.000/mese (+100%)
ddATH ≤ -10%  →  €750/mese  (+50%)
altrimenti    →  €500/mese  (PAC base)
+ cap L16: max 6 mesi di boost/anno
```

**Perché**:
- Cattura **più timing α** del sistema 5-tier (€1.153 vs €603) con **1/3 dei parametri**.
- Filtro B inutile su questa serie (dead code) → eliminato.
- `z21D` rimosso dal trigger, resta solo come indicatore visivo in dashboard.
- Comportamentalmente chiaro: "boosta a -10%, raddoppia a -20%". Nessun composite, niente multipliers da spiegare.

**Caveat onesto da scrivere in dashboard accanto al sistema**:

> Questo sistema di boost è progettato per disciplinare il comportamento, non
> per battere il mercato. Su un backtest 2009-2026 ha aggiunto ~€1.150 di
> timing alpha in 16 anni (0,36% del totale). Il valore reale del PAC è la
> costanza dei versamenti, non il timing dei boost.

## Cosa rimuovere da `config.js` (dopo OK)

- `config.triggerComposite` (`weightDD12M`, `weightMA200`) → **dead code**.
- `config.strategyTiers` (5 tier con `ddMin`/`ddMax`/`multiplier`) → sostituiti dalla regola 2-soglie.

## Cosa rimuovere da `src/strategyEngine.js` (dopo OK)

- `compositeScore()` → non più usata.
- `triggerValue = Math.min(metrics.dd12M, composite)` → diventa `tierFromDdATH(ddATH)`.
- `metricsEngine` va esteso con `ddATH_real` (oggi calcola solo `dd252D`).
