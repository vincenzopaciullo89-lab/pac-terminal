// =============================================================================
// PORTFOLIO DASHBOARD — CONFIG (FINAL)
// =============================================================================
// Configurazione personalizzata per Vincenzo M. P.
// Stato al 6 maggio 2026: 4 posizioni esistenti dai vecchi PAC.
// Da giugno 2026: nuovo PAC 90% VWCE + 10% CSNDX.
//
// ⚠️ MANUTENZIONE MENSILE:
// Le posizioni vengono aggiornate ad ogni esecuzione PAC modificando
// initialHoldings (campo "units"). Il PMC si ricalcola con la formula:
//   nuovo_PMC = ((unitsOld * pmcOld) + (unitsNew * priceAcquisto)) / unitsTot
// =============================================================================

export const config = {
  investor: {
    name: 'Vincenzo M. P.',
    baseCurrency: 'EUR',
    fiscalResidency: 'IT',
    horizonYears: 20,
    riskProfile: 'aggressive',
  },

  pac: {
    baseMonthlyAmount: 500,
    transferDayOfMonth: 29,
    investmentDayOfMonth: 2,
    broker: 'Trade Republic',
    capBoostMonthsPerYear: 6,
  },

  // -------------------------------------------------------------------------
  // ALLOCAZIONE TARGET (per i nuovi PAC dal mese prossimo)
  // -------------------------------------------------------------------------
  allocation: [
    {
      id: 'global',
      name: 'Vanguard FTSE All-World UCITS ETF Acc',
      ticker: 'VWCE.MI',
      isin: 'IE00BK5BQT80',
      weight: 0.90,
      role: 'core',
      ter: 0.0019,
      replication: 'physical-sampling',
      distribution: 'accumulating',
      domicile: 'IE',
      assumedReturnAnnual: 0.074,
      assumedVolAnnual: 0.142,
    },
    {
      id: 'tech',
      name: 'iShares Nasdaq 100 UCITS ETF Acc',
      ticker: 'CSNDX.MI',
      isin: 'IE00B53SZB19',
      weight: 0.10,
      role: 'satellite-tech',
      ter: 0.0030,
      replication: 'physical',
      distribution: 'accumulating',
      domicile: 'IE',
      assumedReturnAnnual: 0.095,
      assumedVolAnnual: 0.220,
    },
  ],

  // -------------------------------------------------------------------------
  // POSIZIONI ATTUALI (dai vecchi PAC, da CSV transazioni TR)
  // -------------------------------------------------------------------------
  // Le posizioni CSPX, SWDA, VETA sono ferme (PAC interrotti):
  // restano in portafoglio e si diluiranno nel tempo con i nuovi PAC.
  // CSNDX riprende a crescere come satellite del nuovo target 10%.
  // -------------------------------------------------------------------------
  initialHoldings: [
    {
      isin: 'IE00BK5BQT80',
      units: 0,
      averageCost: 0,
      currentPriceFallback: 131.50,
      _note: 'VWCE: PAC parte da giugno 2026 con 90% del versamento',
    },
    {
      isin: 'IE00B53SZB19',
      units: 0.527961,
      averageCost: 1259.57,
      currentPriceFallback: 1356.59,
      _note: 'CSNDX: posizione esistente, riprende col 10% dei nuovi PAC',
    },
    {
      isin: 'IE00B5BMR087',
      units: 1.322009,
      averageCost: 631.61,
      currentPriceFallback: 661.36,
      _note: 'CSPX: PAC interrotto, posizione ferma (legacy)',
    },
    {
      isin: 'IE00B4L5Y983',
      units: 9.645653,
      averageCost: 113.00,
      currentPriceFallback: 117.34,
      _note: 'SWDA: PAC interrotto, posizione ferma (legacy)',
    },
    {
      isin: 'IE00BH04GL39',
      units: 12.894304,
      averageCost: 24.04,
      currentPriceFallback: 23.71,
      _note: 'VETA: PAC interrotto, posizione ferma (legacy)',
    },
  ],

  liquidity: {
    emergencyFund: 6000,
    operationalCash: 2000,
    realEstateReserve: 0,
  },

  // -------------------------------------------------------------------------
  // STRATEGY ENGINE — Drawdown-Responsive Contribution
  // -------------------------------------------------------------------------
  // Sistema tattico — regola minima 2-soglie (Task D, vedi docs/TASK_D_BACKTEST.md).
  // Il backtest 2009-2026 su SWDA (proxy MSCI World EUR) ha mostrato che il
  // sistema a 5 tier con composite era sovra-ingegnerizzato: il filtro B
  // (dd252D declassamento) era dead code, e la 2-soglie cattura più timing
  // alpha (+€1.153 vs +€603) con 1/3 dei parametri.
  //
  // Trigger: ddATH_real walk-forward (peak della history disponibile fino al
  // mese corrente — vedi metricsEngine.computePriceMetrics).
  //
  // Allocazione del boost: 100% VWCE in entrambi i tier. Durante un drawdown
  // di mercato ampio si compra esposizione world diversificata, non si
  // aumenta il tilt Nasdaq (più volatile). Il 10% CSNDX resta solo sul
  // PAC base €500.
  //
  // ONESTÀ: questo sistema è progettato per disciplinare il comportamento
  // (versare di più nei drawdown aiuta a non vendere nel panico), NON per
  // battere il mercato. Sul backtest 2009-2026 ha aggiunto ~€1.150 di timing
  // alpha in 16 anni = 0,36% del totale fisso. Il valore reale del PAC è la
  // costanza dei versamenti, non il timing dei boost.
  strategyTiers: [
    { tier: 0, ddATHMax:  0.99, totalAmount:  500, boostAmount:   0, allocationBoost: null,   label: 'Normal',          description: 'Mercato vicino al trend' },
    { tier: 1, ddATHMax: -0.10, totalAmount:  750, boostAmount: 250, allocationBoost: 'VWCE', label: 'Boost +50%',      description: 'Drawdown ≥10% dal peak storico' },
    { tier: 2, ddATHMax: -0.20, totalAmount: 1000, boostAmount: 500, allocationBoost: 'VWCE', label: 'Boost +100%',     description: 'Drawdown ≥20% dal peak storico' },
  ],

  // -------------------------------------------------------------------------
  // ALERT DRAWDOWN — consumer di config.strategyTiers (Task F)
  // -------------------------------------------------------------------------
  // Il workflow .github/workflows/drawdown-alert.yml gira scripts/drawdown_alert.js
  // ogni mattina (06:30 UTC, prima dell'apertura europea → close del giorno
  // prima consolidato). Lo script:
  //   • Legge data/history.json (VWCE da CSNDX-style payload o dedicato).
  //   • Riusa src/metricsEngine.computePriceMetrics (B.5): stesso numero del
  //     sito per costruzione, niente duplicazione di calcoli.
  //   • Determina il tier da ddATH SOLO usando config.strategyTiers — niente
  //     soglie hardcoded nello script.
  //   • Manda email via Resend solo su CROSSING di tier (G2), con isteresi
  //     (G3) per evitare flicker, e con stato persistente in data/alert_state.json.
  //   • De-escalation: email informativa neutra quando si torna a un tier
  //     più basso (niente linguaggio market-timing).
  //
  // Soglie operative: NON sono qui — vivono in `strategyTiers` (T1 ddATHMax
  // -10%, T2 -20%). Questo blocco contiene solo i PARAMETRI DELL'ALERT, non
  // del sistema tattico.
  alerts: {
    // Banda di isteresi (sui ddATH negativi): per uscire da un tier serve
    // un recupero di `hysteresisBand` rispetto alla soglia di ingresso.
    // Esempio: T1 entra a ddATH ≤ -10%; esce solo quando ddATH > -8%.
    // T2 entra a -20%; esce quando ddATH > -18%. Evita flicker su rumore.
    hysteresisBand: 0.02,
    // Modalità test: se true, lo script stampa il payload Resend invece di
    // inviare. Override via env ALERT_DRY_RUN=1.
    dryRun: false,
    // Hard cap difensivo: max email/giorno per singolo run, anche se per bug
    // si producessero più transizioni. Il run normale ne manda 0 o 1.
    maxEmailsPerRun: 3,
    // Failsafe: se l'ultimo close di history.json è più vecchio di questo,
    // si manda un'email "stale data" invece di processare metriche stantie.
    staleHistoryHours: 36,
    // Ticker su cui valutare l'alert. La storia in data/history.json è in
    // EUR e accumulating: il ddATH calcolato coincide col trigger sito/Task D.
    triggerTicker: 'VWCE',
  },

  tax: {
    capitalGainsRate: 0.26,
    stampDutyAnnual: 0.002,
    regime: 'amministrato',
  },

  monteCarlo: {
    nSimulations: 50000,
    horizons: [12, 36, 60, 120, 240, 360],
    distribution: 'lognormal',
    inflation: 0.025,
    riskFreeRate: 0.02,
  },

  priceProvider: {
    primary: 'manual',  // manual | stooq
    cacheHours: 24,
  },

  ui: {
    locale: 'it-IT',
    currency: 'EUR',
    theme: 'terminal-dark',
    showAdvancedMetrics: true,
  },
};

export function getConfig(path, fallback = null) {
  return path.split('.').reduce((obj, key) => (obj?.[key] !== undefined ? obj[key] : fallback), config);
}

export function validateConfig() {
  const totalWeight = config.allocation.reduce((sum, a) => sum + a.weight, 0);
  if (Math.abs(totalWeight - 1.0) > 0.001) {
    console.warn(`⚠️ Pesi allocation non sommano a 1.0: ${totalWeight.toFixed(4)}`);
  }
  return Math.abs(totalWeight - 1.0) <= 0.001;
}
