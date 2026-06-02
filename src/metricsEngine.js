// =============================================================================
// metricsEngine.js — funzioni pure per metriche di prezzo
// =============================================================================
// Estratto da portfolioEngine.js per consentire l'import sia dal browser sia
// da Node.js (necessario al Task Group F: alert giornaliero server-side).
//
// VINCOLO ARCHITETTURALE: questo modulo NON deve importare niente che usi
// DOM, window, localStorage, fetch o altre API browser-only. Le sue uniche
// dipendenze sono primitive di JavaScript (Math, Array methods). L'output
// è deterministico: stessi input → stessi output, ovunque venga eseguito.
//
// Se in futuro servono parametri di configurazione qui dentro (es. soglie
// per il regime), passarli come argomenti espliciti — non import statici
// da config.js, per non legare il modulo a uno specifico file di config.
// =============================================================================

/**
 * Calcola metriche di prezzo a partire da una serie storica daily.
 *
 * @param {Array<{date: string, close: number}>} historicalPrices  Serie ordinata
 *        cronologicamente, con `close` numerico positivo. Minimo 2 elementi.
 * @param {number} currentPrice  Prezzo corrente (può essere più recente
 *        dell'ultimo close della serie).
 * @returns {object|null}  Oggetto con le metriche, oppure `null` se l'input
 *        è invalido. Tutti i campi sono presenti anche quando non calcolabili
 *        (in tal caso valgono `null`).
 *
 * Schema di output:
 *   - peakATH           : massimo dell'intera history disponibile (incluso
 *                         currentPrice). Walk-forward: il caller passa la
 *                         serie limitata al "presente".
 *   - ddATH             : drawdown da peakATH, in frazione (es. -0.12 = -12%).
 *                         Trigger primario del sistema tattico (Task D).
 *   - high252D, high12M : massimi rolling 252 giorni (alias finché lo
 *                         storico disponibile coincide con quella finestra).
 *   - dd252D, dd12M     : drawdown corrispondenti, in frazione (es. -0.07).
 *   - ma200             : moving average 200 giorni (richiede ≥200 close).
 *                         Restituisce `null` se la storia è insufficiente.
 *   - madMA200          : deviazione % del prezzo corrente dalla MA200.
 *   - ma10m             : alias di ma200 (mantenuto per backward compat).
 *   - volRolling        : volatilità annualizzata dei log-return su 60 giorni
 *                         (richiede ≥30 close).
 *   - zScore            : z-score del rendimento 21d corrente vs distribuzione
 *                         storica dei rendimenti 21d rolling (richiede ≥80
 *                         close totali).
 *   - regime            : `'normal' | 'elevated' | 'stressed'` derivato da
 *                         volRolling: soglie 0.18 e 0.25.
 */
export function computePriceMetrics(historicalPrices, currentPrice) {
  if (!Array.isArray(historicalPrices) || historicalPrices.length < 2) return null;
  const closes = historicalPrices.map(d => d.close);

  // ddATH_real: drawdown dal massimo dell'intera history disponibile fino
  // a ORA (peak walk-forward). Trigger primario del sistema tattico — vedi
  // docs/TASK_D_BACKTEST.md.
  // NB walk-forward: il caller passa già una serie limitata al "presente"
  // (in produzione: history.json fino a oggi; nel backtest: slice fino al
  // mese simulato). Qui ci si limita a calcolare il max sui close ricevuti +
  // il prezzo corrente, senza guardare dati che il caller non ha incluso.
  const peakATH = Math.max(...closes, currentPrice);
  const ddATH = peakATH > 0 ? (currentPrice / peakATH) - 1 : 0;

  // dd252D: drawdown dal massimo rolling 252 giorni. Usato come filtro di
  // declassamento nella vecchia 5-tier; con la regola minima 2-soglie il
  // filtro è dead code (vedi Task D), ma la metrica resta esposta come
  // indicatore in dashboard.
  const last252 = closes.slice(-252);
  const high252D = Math.max(...last252, currentPrice);
  const dd252D = high252D > 0 ? (currentPrice / high252D) - 1 : 0;

  // Alias: in questa fase `dd12M` coincide con `dd252D` (stessa finestra).
  const high12M = high252D;
  const dd12M = dd252D;

  // MA200 calcolata solo con la finestra completa: una "MA200" su 50-100
  // osservazioni è rumorosa e fuorviante. Se la storia non basta, restituiamo
  // null e la UI mostra "—" (onestà > pseudo-precisione).
  const last200 = closes.slice(-200);
  const ma200 = last200.length >= 200
    ? last200.reduce((a, b) => a + b, 0) / last200.length
    : null;
  const madMA200 = ma200 ? (currentPrice / ma200) - 1 : null;

  const last60 = closes.slice(-60);
  let volRolling = null;
  if (last60.length >= 30) {
    const returns = [];
    for (let i = 1; i < last60.length; i++) {
      returns.push(Math.log(last60[i] / last60[i - 1]));
    }
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / returns.length;
    volRolling = Math.sqrt(variance) * Math.sqrt(252);
  }

  let zScore = null;
  if (closes.length >= 80) {
    const last21Return = (currentPrice / closes[closes.length - 22]) - 1;
    const rollingReturns = [];
    for (let i = 21; i < closes.length; i++) {
      rollingReturns.push((closes[i] / closes[i - 21]) - 1);
    }
    const m = rollingReturns.reduce((a, b) => a + b, 0) / rollingReturns.length;
    const s = Math.sqrt(
      rollingReturns.reduce((a, r) => a + (r - m) ** 2, 0) / rollingReturns.length,
    );
    zScore = s > 0 ? (last21Return - m) / s : null;
  }

  let regime = 'normal';
  if (volRolling && volRolling > 0.25) regime = 'stressed';
  else if (volRolling && volRolling > 0.18) regime = 'elevated';

  return {
    peakATH, ddATH,
    high252D, high12M, dd252D, dd12M,
    ma200, ma10m: ma200, madMA200,
    volRolling, zScore, regime,
  };
}
