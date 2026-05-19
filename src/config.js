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
  // Ridistribuzione tier per rispettare cap stretto €1.000/mese (PAC base €500).
  // Tier 4 era 2.5x = €1.250, violava il vincolo operativo.
  // Numeri di lavoro: la calibrazione finale uscirà dal backtest (Task Group D).
  strategyTiers: [
    { tier: 0, ddMin: -0.05, ddMax:  0.99, multiplier: 1.00, label: 'Normal',           description: 'Mercato vicino al trend' },
    { tier: 1, ddMin: -0.10, ddMax: -0.05, multiplier: 1.10, label: 'Tier 1 Elevated',  description: 'Drawdown lieve' },
    { tier: 2, ddMin: -0.15, ddMax: -0.10, multiplier: 1.30, label: 'Tier 2 Stressed',  description: 'Drawdown moderato' },
    { tier: 3, ddMin: -0.25, ddMax: -0.15, multiplier: 1.60, label: 'Tier 3 Severe',    description: 'Drawdown severo' },
    { tier: 4, ddMin: -1.00, ddMax: -0.25, multiplier: 2.00, label: 'Tier 4 Extreme',   description: 'Drawdown estremo' },
  ],

  triggerComposite: {
    weightDD12M: 0.6,
    weightMA200: 0.4,
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
