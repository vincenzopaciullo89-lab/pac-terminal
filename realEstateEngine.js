// =============================================================================
// MONTE CARLO WORKER
// =============================================================================
// Esegue le 50.000 simulazioni in un Web Worker così l'UI non si freeza.
// Tutti i calcoli sono vettorizzati su Float64Array per performance.
// =============================================================================

self.onmessage = function (e) {
  const { params } = e.data;
  try {
    const results = runAllStrategies(params);
    self.postMessage({ status: 'done', results });
  } catch (err) {
    self.postMessage({ status: 'error', error: err.message });
  }
};

// -----------------------------------------------------------------------------
// Random number generation
// -----------------------------------------------------------------------------
// Mulberry32 PRNG seedabile per riproducibilità
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Box-Muller transform per gaussian
function gaussian(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// -----------------------------------------------------------------------------
// SIMULATION ENGINES
// -----------------------------------------------------------------------------

/**
 * Strategia: PAC costante mensile
 */
function simulateConstantPAC(params, monthlyPAC, seed) {
  const { nSim, months, mu, sigma, ter, pv0 } = params;
  const muLog = Math.log(1 + mu) / 12 - 0.5 * Math.pow(sigma / Math.sqrt(12), 2);
  const sigmaM = sigma / Math.sqrt(12);
  const terM = ter / 12;

  const finalValues = new Float64Array(nSim);
  const finalDDs = new Float64Array(nSim);
  let totalContributed = pv0 + monthlyPAC * months;

  const rng = mulberry32(seed);

  for (let s = 0; s < nSim; s++) {
    let v = pv0;
    let peak = pv0;
    let dd = 0;
    let ddMin = 0;
    for (let m = 0; m < months; m++) {
      const z = gaussian(rng);
      const r = Math.exp(muLog + sigmaM * z - terM) - 1;
      v = (v + monthlyPAC) * (1 + r);
      if (v > peak) peak = v;
      dd = peak > 0 ? (v / peak) - 1 : 0;
      if (dd < ddMin) ddMin = dd;
    }
    finalValues[s] = v;
    finalDDs[s] = ddMin;
  }

  return {
    finalValues: Array.from(finalValues),
    finalDDs: Array.from(finalDDs),
    totalContributed,
  };
}

/**
 * Strategia: PAC tactical con drawdown response
 */
function simulateTacticalPAC(params, monthlyPAC, seed) {
  const { nSim, months, mu, sigma, ter, pv0, capPerYear, tiers } = params;
  const muLog = Math.log(1 + mu) / 12 - 0.5 * Math.pow(sigma / Math.sqrt(12), 2);
  const sigmaM = sigma / Math.sqrt(12);
  const terM = ter / 12;

  const finalValues = new Float64Array(nSim);
  const finalDDs = new Float64Array(nSim);
  const totalContributedArr = new Float64Array(nSim);

  const rng = mulberry32(seed);
  const buffer = new Float64Array(12); // rolling 12-month for DD calc

  for (let s = 0; s < nSim; s++) {
    let v = pv0;
    let peak = pv0;
    let ddMin = 0;
    let totalC = pv0;
    let boostThisYear = 0;
    let lastYearTracked = 0;

    // Init buffer
    for (let i = 0; i < 12; i++) buffer[i] = pv0;

    for (let m = 0; m < months; m++) {
      const yearIdx = Math.floor(m / 12);
      if (yearIdx !== lastYearTracked) {
        boostThisYear = 0;
        lastYearTracked = yearIdx;
      }

      // Calcola drawdown da rolling 12M
      let peak12m = -Infinity;
      for (let i = 0; i < 12; i++) if (buffer[i] > peak12m) peak12m = buffer[i];
      const dd12m = peak12m > 0 ? (v / peak12m) - 1 : 0;

      // Determina multiplier
      let multiplier = 1.0;
      if (boostThisYear < capPerYear) {
        for (const t of tiers) {
          if (dd12m <= t.ddMax && dd12m > t.ddMin) {
            multiplier = t.multiplier;
            break;
          }
        }
        if (multiplier > 1.0) boostThisYear++;
      }

      const contrib = monthlyPAC * multiplier;
      totalC += contrib;

      const z = gaussian(rng);
      const r = Math.exp(muLog + sigmaM * z - terM) - 1;
      v = (v + contrib) * (1 + r);

      if (v > peak) peak = v;
      const ddTrue = peak > 0 ? (v / peak) - 1 : 0;
      if (ddTrue < ddMin) ddMin = ddTrue;

      // Aggiorna buffer rolling
      buffer[m % 12] = v;
    }
    finalValues[s] = v;
    finalDDs[s] = ddMin;
    totalContributedArr[s] = totalC;
  }

  return {
    finalValues: Array.from(finalValues),
    finalDDs: Array.from(finalDDs),
    totalContributedArr: Array.from(totalContributedArr),
    totalContributed: null, // varia per simulazione
  };
}

// -----------------------------------------------------------------------------
// PERCENTILE & STATS
// -----------------------------------------------------------------------------
function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor((p / 100) * (sorted.length - 1));
  return sorted[idx];
}

function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function computeStats(values, contributed) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p5: sorted[Math.floor(0.05 * sorted.length)],
    p25: sorted[Math.floor(0.25 * sorted.length)],
    p50: sorted[Math.floor(0.50 * sorted.length)],
    p75: sorted[Math.floor(0.75 * sorted.length)],
    p95: sorted[Math.floor(0.95 * sorted.length)],
    mean: mean(values),
    contributed: typeof contributed === 'number' ? contributed : mean(contributed || values.map(_ => 0)),
  };
}

// -----------------------------------------------------------------------------
// PROBABILITÀ E DRAWDOWN
// -----------------------------------------------------------------------------
function probAbove(values, threshold) {
  return values.filter(v => v >= threshold).length / values.length;
}

function probDDBelow(dds, threshold) {
  return dds.filter(d => d <= threshold).length / dds.length;
}

// -----------------------------------------------------------------------------
// MAIN: esegue tutti gli scenari
// -----------------------------------------------------------------------------
function runAllStrategies(params) {
  const { months, nSim } = params;
  const tiers = params.tiers;
  const startTime = Date.now();

  // Riduci nSim per multiple strategies se troppo lento
  // Manteniamo 50k come da requisito
  
  const strategies = [
    { id: 'pac500', label: 'PAC €500 costante', fn: () => simulateConstantPAC(params, 500, 42) },
    { id: 'pac400', label: 'PAC €400 costante', fn: () => simulateConstantPAC(params, 400, 43) },
    { id: 'pac530', label: 'PAC €530 costante', fn: () => simulateConstantPAC(params, 530, 44) },
    { id: 'pac500_tactical', label: 'PAC €500 + tactical', fn: () => simulateTacticalPAC(params, 500, 45) },
    { id: 'pac400_tactical', label: 'PAC €400 + tactical', fn: () => simulateTacticalPAC(params, 400, 46) },
  ];

  const results = strategies.map((strat, i) => {
    self.postMessage({ status: 'progress', current: i, total: strategies.length, label: strat.label });
    const sim = strat.fn();
    const stats = computeStats(sim.finalValues, sim.totalContributed ?? sim.totalContributedArr);
    const taxRate = 0.26;
    const grossPlus = sim.finalValues.map((v, j) => {
      const c = sim.totalContributed ?? (sim.totalContributedArr ? sim.totalContributedArr[j] : 0);
      return Math.max(0, v - c);
    });
    const netValues = sim.finalValues.map((v, j) => v - grossPlus[j] * taxRate);

    return {
      id: strat.id,
      label: strat.label,
      gross: stats,
      net: computeStats(netValues, stats.contributed),
      probabilities: {
        above_125k: probAbove(sim.finalValues, 125000),
        above_250k: probAbove(sim.finalValues, 250000),
        above_400k: probAbove(sim.finalValues, 400000),
        above_600k: probAbove(sim.finalValues, 600000),
        above_1m: probAbove(sim.finalValues, 1000000),
      },
      drawdown: {
        median: percentile(sim.finalDDs, 50),
        prob_below_20: probDDBelow(sim.finalDDs, -0.20),
        prob_below_30: probDDBelow(sim.finalDDs, -0.30),
        prob_below_40: probDDBelow(sim.finalDDs, -0.40),
      },
      contributedMedian: typeof sim.totalContributed === 'number'
        ? sim.totalContributed
        : percentile(sim.totalContributedArr, 50),
    };
  });

  // Confronto: probabilità che PAC tactical batta PAC base costante
  const constS = strategies.find(s => s.id === 'pac500');
  // (skip per non rilanciare, già abbiamo i risultati)

  return {
    elapsedMs: Date.now() - startTime,
    horizonMonths: months,
    nSim,
    strategies: results,
    horizonYears: months / 12,
  };
}
