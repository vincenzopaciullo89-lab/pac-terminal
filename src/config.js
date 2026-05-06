// =============================================================================
// PORTFOLIO DASHBOARD — CONFIG
// =============================================================================
// File di configurazione principale. Modifica qui tutti i parametri della
// strategia. Cambia → ricarica pagina → tutto si aggiorna.
// =============================================================================

export const config = {
  // -------------------------------------------------------------------------
  // PROFILO INVESTITORE
  // -------------------------------------------------------------------------
  investor: {
    name: 'Vincenzo M. P.',
    baseCurrency: 'EUR',
    fiscalResidency: 'IT',
    horizonYears: 20,
    riskProfile: 'aggressive', // aggressive | balanced | conservative
  },

  // -------------------------------------------------------------------------
  // PAC AUTOMATICO
  // -------------------------------------------------------------------------
  pac: {
    baseMonthlyAmount: 500,        // PAC base €/mese
    transferDayOfMonth: 29,        // bonifico verso TR
    investmentDayOfMonth: 2,       // acquisto ETF
    broker: 'Trade Republic',
    capBoostMonthsPerYear: 6,      // cap mesi di boost per anno solare
  },

  // -------------------------------------------------------------------------
  // ALLOCAZIONE PORTAFOGLIO
  // -------------------------------------------------------------------------
  // SOSTITUISCI ISIN/TICKER con quelli che effettivamente userai sul broker.
  // I valori sotto sono SUGGERIMENTI realistici e verificabili su justETF.
  allocation: [
    {
      id: 'global',
      name: 'Vanguard FTSE All-World UCITS ETF Acc',
      ticker: 'VWCE.MI',           // Borsa Italiana (Twelve Data symbol)
      isin: 'IE00BK5BQT80',
      weight: 0.90,
      role: 'core',
      ter: 0.0019,                  // 0,19%
      replication: 'physical-sampling',
      distribution: 'accumulating',
      domicile: 'IE',
      assumedReturnAnnual: 0.074,   // mediana hybrid storico/CMA
      assumedVolAnnual: 0.142,
    },
    {
      id: 'tech',
      name: 'iShares Nasdaq 100 UCITS ETF Acc',
      ticker: 'CSNDX.MI',
      isin: 'IE00B53SZB19',
      weight: 0.10,
      role: 'satellite-tech',
      ter: 0.0033,                  // 0,33%
      replication: 'physical',
      distribution: 'accumulating',
      domicile: 'IE',
      assumedReturnAnnual: 0.095,   // più alto MA con vol più alta
      assumedVolAnnual: 0.220,
    },
  ],

  // -------------------------------------------------------------------------
  // POSIZIONI INIZIALI (compila quando entri operativo)
  // -------------------------------------------------------------------------
  // Se lasci tutto a 0, il sito assume "stai partendo da zero oggi".
  initialHoldings: [
    {
      isin: 'IE00BK5BQT80',
      units: 0,                     // quote già detenute
      averageCost: 0,               // PMC €/quota
      currentPriceFallback: 124.50, // se API non risponde, usa questo
    },
    {
      isin: 'IE00B53SZB19',
      units: 0.527961,
      averageCost: 1259.57,
      currentPriceFallback: 1356.59,
    },
  ],

  // Cash extra disponibile FUORI dal portafoglio ETF (per warning qualitativo)
  liquidity: {
    emergencyFund: 6000,
    operationalCash: 2000,
    realEstateReserve: 0,
  },

  // -------------------------------------------------------------------------
  // STRATEGY ENGINE — Drawdown-Responsive Contribution
  // -------------------------------------------------------------------------
  strategyTiers: [
    { tier: 0, ddMin: -0.05, ddMax: 0.99,  multiplier: 1.00, label: 'Normal',         description: 'Mercato vicino al trend' },
    { tier: 1, ddMin: -0.10, ddMax: -0.05, multiplier: 1.20, label: 'Tier 1 Mild',    description: 'Drawdown lieve' },
    { tier: 2, ddMin: -0.15, ddMax: -0.10, multiplier: 1.50, label: 'Tier 2 Moderate',description: 'Drawdown moderato' },
    { tier: 3, ddMin: -0.25, ddMax: -0.15, multiplier: 2.00, label: 'Tier 3 Severe',  description: 'Drawdown severo' },
    { tier: 4, ddMin: -1.00, ddMax: -0.25, multiplier: 2.50, label: 'Tier 4 Extreme', description: 'Drawdown estremo' },
  ],

  // Pesi per il composite trigger score (drawdown 12M + deviazione MA200)
  triggerComposite: {
    weightDD12M: 0.6,
    weightMA200: 0.4,
  },

  // -------------------------------------------------------------------------
  // FISCALITÀ (Italia)
  // -------------------------------------------------------------------------
  tax: {
    capitalGainsRate: 0.26,          // ETF non white-list
    stampDutyAnnual: 0.002,          // bollo 0,2% annuo
    regime: 'amministrato',          // TR Italia da gen 2025
  },

  // -------------------------------------------------------------------------
  // MONTE CARLO
  // -------------------------------------------------------------------------
  monteCarlo: {
    nSimulations: 50000,
    horizons: [12, 36, 60, 120, 240, 360], // mesi
    distribution: 'lognormal',        // lognormal | studentT | bootstrap
    inflation: 0.025,
    riskFreeRate: 0.02,
  },

  // -------------------------------------------------------------------------
  // PRICE PROVIDER
  // -------------------------------------------------------------------------
  priceProvider: {
    primary: 'twelvedata',
    apiKey: '',                       // utente inserisce dalla UI (salvato in localStorage)
    cacheHours: 24,
    fallbackToManual: true,
  },

  // -------------------------------------------------------------------------
  // DESIGN / UI
  // -------------------------------------------------------------------------
  ui: {
    locale: 'it-IT',
    currency: 'EUR',
    theme: 'terminal-dark',
    decimalPlaces: 2,
    showAdvancedMetrics: true,
  },
};

// Helper per accedere alla config in modo sicuro
export function getConfig(path, fallback = null) {
  return path.split('.').reduce((obj, key) => (obj?.[key] !== undefined ? obj[key] : fallback), config);
}

// Validazione di base
export function validateConfig() {
  const totalWeight = config.allocation.reduce((sum, a) => sum + a.weight, 0);
  if (Math.abs(totalWeight - 1.0) > 0.001) {
    console.warn(`⚠️ Pesi allocation non sommano a 1.0: ${totalWeight.toFixed(4)}`);
  }
  return Math.abs(totalWeight - 1.0) <= 0.001;
}
