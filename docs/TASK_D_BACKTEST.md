# Task D — Backtest del sistema tattico di boost

> **Stato**: risultati di calibrazione in attesa di review (CHECKPOINT D2). Le
> soglie qui dentro **non** sono ancora state scritte in `config.js`.

## Metodologia

- **Dato**: SWDA (iShares Core MSCI World, EUR) — `data/analysis/swda.json`,
  2009-09-25 → 2026-05-29, 4.232 close giornalieri, 201 mesi. Proxy storia
  lunga di VWCE (che parte solo dal 2020); cross-validato col drawdown 2022
  quasi identico (SWDA -16.8% vs VWCE -16.0% in EUR).
- **Valuta**: EUR per tutto (i drawdown si misurano nella valuta del PAC).
- **PAC**: €500/mese, acquisto al primo giorno di Borsa di ogni mese.
- **Due strategie sullo stesso percorso prezzi**:
  - **(a) FISSO** — €500/mese, mai boost.
  - **(b) TATTICO** — €500 + boost da regola ibrida, cap €1.000/mese (L2),
    cap 6 boost/anno (L16), multipliers L13 fissi (1.0/1.1/1.3/1.6/2.0).
- **Trigger ibrido A+B+C**:
  - **A = ddATH_real** (drawdown dal massimo storico *disponibile ad oggi*) →
    determina il tier. **Primario, calibrato.**
  - **B = dd252D** (drawdown rolling 252g) → filtro: declassa di 1 tier se il
    drawdown recente è rientrato (`dd252D > -X%`). **Calibrato.**
  - **C = z21D** → solo registrato, **nessun ruolo** nel trigger.

### Walk-forward / no look-ahead (verificato)

A ogni mese le metriche usano **solo i close fino a quel mese**:
`slice = closes con date <= dataAcquisto`. Il peak di `ddATH_real` è il massimo
di `slice` (massimo storico ad oggi, non massimo assoluto della serie). Un
`assert` runtime (`assertNoLookAhead`) verifica su ogni mese che l'ultima data
usata non superi la data di acquisto. Nessun prezzo futuro entra nel calcolo.

## Benchmark nullo: PAC fisso puro (zero boost)

| | Valore |
|---|---|
| Investito (201 mesi × €500) | **€100.500** |
| Valore finale | **€323.123** |
| Ritorno money-weighted | **+221,5%** |

Questo è il riferimento. Tutto il "valore aggiunto" del tattico va misurato
contro questo.

## Calibrazione — intero periodo 2009-2026 (ordinato per efficienza D3)

`eff D3` = € extra finali per ogni € di boost versato. `timingα` = quanto di
quell'extra viene dal **timing** e non dal puro "ho investito di più"
(= tattico − "boost cieco" che spalma la stessa cassa uniformemente).

| # | soglie tier (ddATH) | B | eff D3 | extra € | boost € | timingα € | boost/anno | maxCassa |
|---|---|---|---|---|---|---|---|---|
| 1 | C {-10/-15/-22/-35} | 3% | **3,48x** | €5.919 | €1.700 | €454 | 1,4 | €650 |
| 2 | C {-10/-15/-22/-35} | 5% | 3,48x | €5.919 | €1.700 | €454 | 1,4 | €650 |
| 3 | C {-10/-15/-22/-35} | 8% | 3,48x | €5.919 | €1.700 | €454 | 1,4 | €650 |
| 4 | A {-5/-10/-15/-25} | 3% | 3,33x | €17.964 | €5.400 | €603 | 3,1 | €1.450 |
| 5 | A {-5/-10/-15/-25} | 5% | 3,33x | €17.963 | €5.400 | €601 | 3,1 | €1.450 |
| 6 | A {-5/-10/-15/-25} | 8% | 3,28x | €15.598 | €4.750 | €326 | 2,0 | €1.400 |
| 7 | B {-7/-13/-20/-30} | 3% | 3,16x | €9.945 | €3.150 | **−€183** | 2,3 | €850 |
| 8 | B {-7/-13/-20/-30} | 5% | 3,16x | €9.945 | €3.150 | −€183 | 2,3 | €850 |
| 9 | B {-7/-13/-20/-30} | 8% | 3,09x | €8.957 | €2.900 | **−€367** | 2,0 | €850 |

**Cassa**: tutte le combinazioni stanno largamente sotto il budget €6-9K
(max €1.450 su finestra rolling 18 mesi). Il vincolo D4 non è mai vincolante —
i cap L2/L16 lo rendono automaticamente rispettato.

## Le tre conclusioni oneste

### 1. Il timing tattico aggiunge quasi nulla. La disciplina del "investire di più" è tutto.

Prendi la combinazione con il maggior impatto assoluto (set A, B=3%): batte il
PAC fisso di **€17.964 (+5,6%)**. Ma di quei €18K, solo **€603 vengono dal
timing**. Gli altri ~€17.361 li avresti ottenuti **investendo gli stessi €5.400
extra alla cieca** (spalmati uniformemente, senza guardare i drawdown).

Anzi: due combinazioni (set B) hanno **timing α negativo** — la regola ha
scelto i momenti *peggio* del semplice spalmare. Sull'intera griglia il timing α
va da −€367 a +€603: **centrato sullo zero, dentro il rumore**. Su questo
singolo percorso storico, **la regola di market-timing non ha un edge
affidabile** rispetto al semplicemente investire di più nei periodi difficili.

Tradotto: il boost "funziona" perché ti **costringe a versare di più** quando
il mercato fa paura, non perché *azzecca* i minimi. Lo stesso effetto lo
otterresti alzando il PAC base.

### 2. La metrica D3 e l'impatto assoluto tirano in direzioni opposte.

L'efficienza D3 (extra per € di boost) premia chi **boosta il meno possibile**,
concentrandosi solo sui minimi più profondi. Il "vincitore D3" (set C) ha la
massima efficienza (3,48x) ma il **minimo impatto assoluto** (€5.919, boosta
solo 1,4 volte/anno). Set A ha efficienza poco più bassa (3,33x) ma **3× l'impatto
assoluto** (€17.964), perché boosta più spesso. Non esiste un "ottimo" univoco:
è un trade-off tra efficienza-per-euro e impatto totale, e **i dati non lo
risolvono** — è una scelta comportamentale.

### 3. Distacco 1°-2° nullo, filtro B quasi irrilevante.

Il distacco di efficienza tra 1° e 2° è **0,0%** (set C è identico per B=3/5/8%):
il filtro B di declassamento **non morde** quando le soglie sono profonde, perché
quei drawdown profondi sono anche recenti. Su set A il filtro B conta un po'
(€18K → €15,6K passando da 3% a 8%). Conclusione: **B è un parametro di second'ordine**,
non vale la pena ottimizzarlo finemente.

## Sensitivity

- **Efficienza**: range stretto 3,09x–3,48x sull'intera griglia (~12%). Robusta.
- **Impatto assoluto**: range 3× (€5.919 → €17.964), guidato solo da *quanto
  spesso* si boosta. Molto sensibile alla scelta del set di soglie.
- **Filtro B**: quasi ininfluente (vedi sopra).

## Robustezza — sub-periodi

| Periodo | mesi | best (efficienza D3) | eff | extra | boost |
|---|---|---|---|---|---|
| 2009-2017 | 100 | C {-10/-15/-22/-35} B=3% | 1,77x | €1.324 | €750 |
| 2018-2026 | 101 | C {-10/-15/-22/-35} B=3% | 2,25x | €2.136 | €950 |

La **combinazione ottima è stabile** tra i due sub-periodi (entrambi scelgono
set C, B=3%): buon segnale, non è un artefatto di un singolo regime. I *livelli*
di efficienza differiscono (1,77x vs 2,25x) ma l'ordinamento regge. Tuttavia,
la stabilità è anche tautologica: "boosta solo agli estremi" vince sempre
sull'efficienza-per-euro perché gli estremi (2020) sono i momenti più redditizi
per comprare, in qualunque periodo li metti.

## ⚠️ DISCLAIMER — leggere prima di usare queste soglie

1. **Un solo percorso storico.** 2009-2026 è **un** campione: post-GFC bull
   market con 3 correzioni (2018, 2020, 2022). Non è "il futuro", è "un passato".
2. **Periodo eccezionalmente favorevole all'equity.** Dal minimo della Grande
   Crisi Finanziaria, con tassi a zero per un decennio. Un periodo che inizia
   in cima a una bolla (es. 2000) darebbe numeri molto diversi.
3. **Over-fitting reale.** Le soglie "vincenti" sono ottimizzate su questo
   singolo percorso. Con timing α dentro il rumore (punto 1 delle conclusioni),
   "ottimizzare le soglie" significa in gran parte **ottimizzare il rumore**.
4. **Vanno prese come indicazione di ordine di grandezza, non come verità.**
   La lezione robusta non è "usa set C B=3%" — è "**il boost vale soprattutto
   come disciplina di extra-investimento nei drawdown; il timing fine non paga;
   non sovra-ingegnerizzare le soglie**".

## Implicazione per la decisione (da discutere — CHECKPOINT D2)

Il backtest non indica un "vincitore" che valga la pena cesellare. Indica che:

- Il sistema tattico, al meglio, aggiunge **+5,6%** sul valore finale a 16 anni,
  e quasi tutto è "ho investito di più", non timing.
- Qualsiasi set ragionevole di soglie va bene; il filtro B è di second'ordine.
- La scelta tra "boosta spesso" (set A, più impatto assoluto) e "boosta solo
  agli estremi" (set C, più efficiente, comportamentalmente più semplice) è
  **una preferenza, non un'ottimizzazione**.

Raccomandazione neutra da validare: **set C {-10/-15/-22/-35}** come default,
perché boosta raramente e solo su drawdown seri (1,4 volte/anno) — facile da
sostenere psicologicamente e con la massima efficienza per euro — accettando
consapevolmente che l'impatto assoluto è modesto e che il valore vero del
sistema è comportamentale, non predittivo.
