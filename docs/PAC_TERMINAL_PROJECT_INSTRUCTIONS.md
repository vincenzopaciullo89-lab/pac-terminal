# PAC Terminal — Project Instructions

> **Scope**: questo documento è il riferimento normativo del progetto `pac-terminal`. Va consultato all'inizio di ogni sessione di lavoro (sia con Claude.ai sia con Claude Code) e aggiornato quando una decisione strutturale cambia.
>
> Le guidelines generiche di rigore intellettuale (anti-hallucination, expert pool, struttura risposte, ecc.) sono già nelle userPreferences globali di Vincenzo. Questo file è **progetto-specifico**: non ripete quelle regole, ma le applica al dominio.

---

## 1. Cos'è PAC Terminal

Sito personale di monitoraggio di un Piano di Accumulo Capitale ETF su Trade Republic. Vive nel repo `vincenzopaciullo89-lab/pac-terminal`. JavaScript vanilla modularizzato in `src/`, deploy su GitHub Pages.

**Valore del progetto** (in ordine di importanza):
1. Disciplina comportamentale — visualizzare il PAC, ricevere alert in drawdown, evitare market timing emotivo
2. Trasparenza fiscale — capire le tasse italiane sui propri ETF UCITS (asimmetria minus, bollo, magazzino)
3. Educazione finanziaria personale — capire drawdown, percentili, Monte Carlo

## 2. Cosa NON è (anti-drift)

Quando una proposta drifta verso uno di questi, fermare e ricondurre al framing:

- **Non è un sistema per battere il mercato.** Niente predizione, niente AI/ML per trading, niente "ottimizzazione di rendimento attivo".
- **Non è un consulente finanziario.** Le analisi che produce sono educative e personali, non advice professionale.
- **Non è un tool istituzionale.** Capitale corrente ~€3.500, target a 10-20 anni ~€100-300k. Tutto va dimensionato a questa realtà, non a un fondo hedge.
- **Non è un progetto open-source per altri utenti.** È uno strumento personale di Vincenzo. Decisioni di prodotto rispondono solo alle sue esigenze.

## 3. Decisioni locked-in (non rinegoziabili senza motivazione nuova)

Queste sono state prese in conversazione precedente e fissate. Non riaprirle ogni sessione.

| # | Decisione | Valore |
|---|---|---|
| L1 | PAC mensile base | €500 — €450 VWCE + €50 CSNDX |
| L2 | Boost tattico mensile | range €0-€1.000 (cap stretto) |
| L3 | Modalità versamento boost | bonifico manuale da conto bancario verso Trade Republic |
| L4 | Approccio algoritmico tattico | rule-based deterministico, no scoring multi-fattore |
| L5 | Posizioni legacy | CSPX, SWDA, VETA — congelate. No nuovi acquisti, no rebalance forzato |
| L6 | Architettura prezzi | GitHub Actions cron → JSON nel repo → sito legge JSON (no Google Sheets diretto nel sito) |
| L7 | Fonte prezzi primaria | yfinance (Python in GH Actions) |
| L8 | Fonte prezzi fallback | Google Sheets (CSV pubblico, ultima ridondanza). Stooq FUORI (richiede API key con CAPTCHA dal 2025). |
| L9 | Canale alert | GitHub Actions + email via Resend (free tier) |
| L10 | Regime fiscale utente | amministrato, Trade Republic sostituto d'imposta IT |
| L11 | Ticker mapping su yfinance | VWCE.MI, CSNDX.MI, **CSPX.AS** (Amsterdam, NON .MI che ritorna empty), SWDA.MI, VETA.L (in GBP, FX via EURGBP=X) |
| L12 | VETA price source | `history.last_close` (yfinance `fast_info.last_price` ritorna None per VETA) |
| L13 | Multipliers tier | T0=1.0x, T1=1.1x, T2=1.3x, T3=1.6x, T4=2.0x (cap €1.000 rispettato) |
| L14 | Allocazione boost | tier ≥ 2 → 100% VWCE; tier 1 → 90/10 (status quo invariato) |
| L15 | Trigger benchmark | solo VWCE (no aggregato VWCE+CSNDX) |
| L16 | Cap boost mesi/anno | 6 |

## 4. Decisioni ancora aperte

Da risolvere quando saranno rilevanti. Non assumerle come prese.

| # | Decisione aperta | Quando si sblocca |
|---|---|---|
| O1 | Asset allocation strategica (90/10 VWCE/CSNDX è giustificato?) | richiede analisi quantitativa dedicata — vedi sezione 6 |
| O2 | Single-trigger dd12M vs composite (dd12M+madMA200) | a valle del backtest Task Group D |
| O3 | Calibrazione finale soglie tier | a valle del backtest Task Group D |
| O4 | Soglia "stale alert" prima di warning UI | quando si implementa B.4 |
| O5 | CSV transazioni Trade Republic come prerequisito di TWR/MWR | a valle di verifica disponibilità export TR (G.3) |
| O6 | Liquidazione/consolidamento legacy in VWCE | decisione strategica futura, non operativa adesso |

## 5. Stato corrente dei Task Group

> **Da aggiornare a ogni avanzamento.** L'ultimo update va riportato in commit message dedicato.

**Ultimo update memoria conversazione**: il primo run reale di `update-prices.yml` è stato verde (sources_used: tutti yfinance, VETA FX corretta a €23.75, 5/5 ticker fetchati).

| Task Group | Stato | Note |
|---|---|---|
| A — Bug fix immediati | ✅ Completato | PR #14 merged. 5 commit: tier multipliers fix, ddATH→dd252D rename, MA200 guard ≥200, TER CSNDX 0.30%. 15 test verdi. |
| B.1-B.3 — GitHub Actions + script Python | ✅ Completato | PR #18 merged. update-prices.yml, fetch_prices.py, requirements.txt, data/README.md. Primo run reale verde. |
| B.4 — Refactor priceProvider.js per leggere JSON | ⚠️ Stato da verificare | Istruzioni date a Code dopo il primo run verde, non ho conferma di esecuzione |
| B.5 — Refactor computePriceMetrics Node-compat | ⚠️ Stato da verificare | Istruzioni date a Code, non ho conferma |
| docs/PAC_TERMINAL_PROMPT.md nel repo | ⚠️ Stato da verificare | Istruzioni date a Code, non ho conferma |
| Node24 forcing PR separata | ⚠️ Stato da verificare | Deadline 2 giugno 2026 |
| C — Coerenza MC ↔ Dashboard | 🔜 Da iniziare | Bug dd su PV vs prezzo, TER misalignment, seed/PRNG/N |
| D — Backtest documentato | 🔜 Da iniziare | Dipende da B completo |
| E — Migliorie grafici | 🔜 Da iniziare | P25/P75 fan chart, MC box plot completo, confronto PAC puro |
| F — Sistema alert via Resend | 🔜 Da iniziare | Richiede account Resend + API key + Node24 fix |
| G.1-G.6 — Migliorie strutturali | 🔜 Da iniziare | Bollo, magazzino minus, TWR/MWR, look-through, snapshot, attivi/frozen |
| **O1 — Analisi asset allocation** | 🔜 **Da iniziare (NUOVO)** | Vedi sezione 6 |

## 6. Policy per decisioni di asset allocation

Questa sezione è nuova. Esiste perché l'allocazione 90/10 VWCE/CSNDX è stata **assunta come input**, non analizzata.

### 6.1 — Onestà sul punto di partenza

Lo split €450 VWCE / €50 CSNDX è una **scelta dell'utente non validata quantitativamente**. Tutte le decisioni successive (regola tattica, backtest, Monte Carlo) hanno usato questa allocazione come vincolo. Se l'analisi sotto mostra che lo split va modificato, **molte cose a valle vanno ricalibrate** (target del PAC, parametri MC, soglie tier).

### 6.2 — Cosa l'analisi DEVE produrre

Non un "portafoglio ottimo". Deve produrre:

1. **Misura del bias attuale del 90/10**: quale rischio si sta prendendo rispetto a un benchmark di confronto (es. VWCE 100%, VWCE+EM, VWCE+factor tilts).
2. **Overlap reale tra VWCE e CSNDX**: le top holdings condivise (Magnificent 7), peso aggregato. Decide se il 10% CSNDX è realmente un'aggiunta di diversificazione o solo un raddoppio dell'esposizione tech US.
3. **Concentrazione geografica e settoriale aggregata**: il portafoglio incluso legacy è probabilmente >70% US e >30% tech. Misurare esattamente.
4. **Analisi storica del 90/10 vs alternative su 20-30 anni**: μ, σ, max drawdown, Sharpe (con caveat sui limiti dello Sharpe), peggior periodo 10y, miglior periodo 10y.
5. **Tax efficiency** per utente fiscale italiano: confronto accumulating vs eventuali alternative.
6. **Behavioral fit**: quanto un PAC su 2 asset con regola tattica unica è gestibile vs alternative più complesse (3-4 asset, ribilanciamento periodico).

### 6.3 — Cosa l'analisi NON deve produrre

- Previsioni di rendimento futuro per asset class.
- "Frontiera efficiente" presentata come oggettiva (i suoi input sono opinioni).
- Confronto contro decine di portafogli ("Permanent Portfolio", "All Weather Bridgewater", ecc.) per il gusto della varietà.
- Suggerimenti di derivati, leveraged ETF, crypto, sector ETF specifici, single stocks.
- Allocazioni temporanee tattiche oltre alla regola tattica già definita (L13).

### 6.4 — Workflow dell'analisi

L'analisi va condotta come progetto a sé, non infilata dentro un Task Group del sito. Sequenza proposta:

1. **Definizione scope** (Claude.ai con utente): cosa chiediamo precisamente, su quali alternative.
2. **Reperimento dati** (Claude Code): scaricare serie storiche degli asset candidati. Output: CSV statici in `/data/analysis_<assetclass>.csv`.
3. **Calcolo metriche** (Claude Code): script Python che produce le statistiche.
4. **Interpretazione** (Claude.ai con utente): cosa significano i numeri, dove sono i bias, cosa cambierebbe il quadro.
5. **Decisione utente**: l'allocazione resta 90/10 confermata, o si modifica.
6. **Aggiornamento sito** (Claude Code): se l'allocazione cambia, aggiornare `config.allocation` e tutti i parametri dipendenti.

### 6.5 — Asset candidati per il confronto (proposta iniziale)

Non significa "vanno adottati", significa "andrebbero confrontati con 90/10":

- VWCE 100% (baseline semplice)
- VWCE 90% + iShares MSCI EM (IEMA) 10% (aggiunta diversificazione emergenti)
- VWCE 80% + IEMA 10% + iShares Small Cap (IUSN) 10% (size factor)
- VWCE 90% + CSNDX 10% (status quo)
- VWCE 70% + CSNDX 30% (aggressivo tech US)
- VWCE 100% + 6 mesi obbligazioni governative EU brevi come buffer cassa boost tattico

L'utente può aggiungere/togliere dalla lista prima dello step 2.

## 7. Workflow Claude.ai ↔ Claude Code

Questo è il punto operativo più importante per non sprecare tempo.

### 7.1 — Dove vive cosa

| Cosa | Dove farla |
|---|---|
| Decisioni di prodotto, scope, priorità | Claude.ai (qui) |
| Strategia di analisi, framework | Claude.ai |
| Interpretazione di risultati numerici | Claude.ai |
| Lettura del codice esistente | Claude Code (ha accesso al repo) |
| Esecuzione di script, fetch dati, calcoli | Claude Code |
| Scrittura di codice di produzione | Claude Code |
| Test e PR | Claude Code |
| Pressure test reciproco | entrambi — uno propone, l'altro contesta |

### 7.2 — Inizio di ogni nuova sessione Claude.ai

Apertura standard del messaggio iniziale: *"Apri il progetto pac-terminal. Recupera lo stato corrente da `docs/PAC_TERMINAL_PROMPT.md` se esiste, altrimenti chiedimelo. Continua dalle decisioni locked-in."*

### 7.3 — Inizio di ogni nuova sessione Claude Code

Apertura standard: incollare il prompt operativo già esistente (versione v3 + decisioni post-smoke test), in cima al primo messaggio. Aspettare audit del codice rilevante prima di autorizzare modifiche.

### 7.4 — Cosa Claude.ai NON deve fare

- Inventare lo stato del repo se non è certo. Chiedere all'utente di verificarlo con Claude Code.
- Dare il via a modifiche di codice direttamente (Claude.ai non scrive nel repo).
- Approvare PR senza che l'utente le abbia revisionate (Claude.ai non vede i diff a meno che non glieli incolli).
- Affermare che una funzionalità è "completata" se non c'è evidenza (commit hash, screenshot, output di run).

### 7.5 — Cosa Claude Code NON deve fare

- Mergeare PR sostanziali senza approvazione esplicita dell'utente.
- Aggiungere dipendenze (npm package, pip package) senza giustificazione.
- Includere AI/ML, "ottimizzazioni di rendimento", o sofisticazioni quant che vanno contro la sezione 2.
- Proporre refactor estetici di file funzionanti (es. split di `ui.js` "perché 872 righe sono troppe").
- Skippare la scrittura di test prima di toccare logica core (`strategyEngine.js`, `taxEngine.js`, `monteCarloWorker.js`, `portfolioEngine.js`).

## 8. Anti-pattern conversazionali da evitare

Errori commessi in conversazioni precedenti, da non ripetere:

1. **Confidence senza verifica.** "Sicurissimo che Stooq funziona da browser" → si è scoperto che no. Sempre verificare prima di consigliare, soprattutto su API/data source.
2. **PR-bomb.** Fare 5 cose in una PR rende impossibile il rollback. Una PR per concern.
3. **Skippare test su logica core.** Già stato detto, va ricordato.
4. **Trattare assunzioni come fatti.** Lo split 90/10 era assunzione, è stato trattato come fatto fino a quando l'utente non ha chiesto se era giustificato. Etichettare esplicitamente.
5. **Confondere "il codice esegue" con "il codice è corretto".** Test verdi non sono garanzia di correttezza semantica. Sanity check manuale dei numeri prodotti.
6. **Dimenticare il framing.** Pac-terminal è disciplina personale, non sistema istituzionale. Quando una proposta inizia a sembrare istituzionale, è probabile sia drift.

## 9. Pressure test ricorrente

Domande da fare a sé stessi (Claude.ai e Claude Code) prima di ogni proposta sostanziale:

- Questa modifica risolve un problema reale dell'utente, o sta gold-plating?
- Quanto costa mantenerla nel tempo?
- Si può disattivare in 1 commit se rivela bug?
- Quale evidenza la giustifica?
- Sto trattando un'assunzione come fatto?
- Sto inventando precisione che i dati non supportano?

## 10. Update log

Tracciare qui le modifiche strutturali a queste guidelines.

- **2026-05-19** — Creazione iniziale del documento. Recap stato Task Group A completato + B parziale. Aggiunta sezione 6 (Asset allocation policy) come decisione aperta O1.
