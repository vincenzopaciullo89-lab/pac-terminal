// =============================================================================
// MONTE CARLO ENGINE v3 — supporto schedule + horizon variabile + inflation
// =============================================================================
// Modifiche v3:
//   - Accetta pacSchedule da UI (PAC variabile nel tempo)
//   - Accetta horizonMonths (5, 10, 20 anni)
//   - generateTrendPaths supporta schedule e ritorna anche valori reali (deflated)
// =============================================================================

import { config } from './config.js';

const MC_CACHE_KEY = 'pd_mc_results_v3';
const MC_CACHE_TS_KEY = 'pd_mc_results_ts_v3';
const MC_CACHE_HOURS = 24;

const safeStorage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, val) { try { localStorage.setItem(key, val); } catch {} },
  remove(key) { try { localStorage.removeItem(key); } catch {} },
};

function configHash(params) {
  const str = JSON.stringify({
    months: params.months, nSim: params.nSim,
    mu: params.mu, sigma: params.sigma, pv0: params.pv0,
    tiers: params.tiers, pacSchedule: params.pacSchedule,
  });
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(36);
}

function getCachedMC(key) {
  try {
    const ts = parseInt(safeStorage.get(MC_CACHE_TS_KEY) || '0', 10);
    const ageH = (Date.now() - ts) / 3600000;
    if (ageH > MC_CACHE_HOURS) return null;
    const stored = JSON.parse(safeStorage.get(MC_CACHE_KEY) || '{}');
    return stored[key] || null;
  } catch { return null; }
}

function setCachedMC(key, results) {
  try {
    const stored = JSON.parse(safeStorage.get(MC_CACHE_KEY) || '{}');
    stored[key] = results;
    safeStorage.set(MC_CACHE_KEY, JSON.stringify(stored));
    safeStorage.set(MC_CACHE_TS_KEY, String(Date.now()));
  } catch {}
}

/**
 * Esegue Monte Carlo. Accetta pacSchedule per PAC variabile.
 * Esempi:
 *   pacSchedule = null → usa monthlyPAC (default 500)
 *   pacSchedule = [{startMonth: 0, amount: 500}] → costante €500
 *   pacSchedule = [{startMonth: 0, amount: 500}, {startMonth: 60, amount: 300}]
 *     → €500 per primi 5 anni, €300 dopo
 */
export function runMonteCarlo(options = {}) {
  const {
    onProgress = () => {},
    forceRefresh = false,
    horizonMonths = 240,
    currentValue = 0,
    nSim = config.monteCarlo.nSimulations,
    pacSchedule = null,
    monthlyPAC = 500,
  } = options;

  const muBlended = config.allocation.reduce((s, a) => s + a.weight * a.assumedReturnAnnual, 0);
  const sigmas = config.allocation.map(a => a.assumedVolAnnual);
  const weights = config.allocation.map(a => a.weight);
  let varBlended = 0;
  const rho = 0.85;
  for (let i = 0; i < weights.length; i++) {
    for (let j = 0; j < weights.length; j++) {
      const corr = i === j ? 1 : rho;
      varBlended += weights[i] * weights[j] * sigmas[i] * sigmas[j] * corr;
    }
  }
  const sigmaBlended = Math.sqrt(varBlended);
  const terBlended = config.allocation.reduce((s, a) => s + a.weight * a.ter, 0);

  // Normalizza schedule
  const schedule = (Array.isArray(pacSchedule) && pacSchedule.length > 0)
    ? pacSchedule.filter(s => s.amount > 0).sort((a, b) => a.startMonth - b.startMonth)
    : [{ startMonth: 0, amount: monthlyPAC }];

  const params = {
    nSim,
    months: horizonMonths,
    mu: muBlended,
    sigma: sigmaBlended,
    ter: terBlended,
    pv0: typeof currentValue === 'number' && !isNaN(currentValue) ? currentValue : 0,
    tiers: config.strategyTiers,
    capPerYear: config.pac.capBoostMonthsPerYear,
    pacSchedule: schedule,
    monthlyPAC,
  };

  const cacheKey = configHash(params);
  if (!forceRefresh) {
    const cached = getCachedMC(cacheKey);
    if (cached) return Promise.resolve(cached);
  }

  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(new URL('./monteCarloWorker.js', import.meta.url), { type: 'module' });
    } catch (err) {
      reject(new Error('Web Worker non supportato: ' + err.message));
      return;
    }
    worker.onmessage = function (e) {
      const { status, results, current, total, label, error } = e.data;
      if (status === 'progress') {
        onProgress(current, total, label);
      } else if (status === 'done') {
        results._cachedAt = Date.now();
        results._params = { mu: muBlended, sigma: sigmaBlended, terBlended };
        setCachedMC(cacheKey, results);
        worker.terminate();
        resolve(results);
      } else if (status === 'error') {
        worker.terminate();
        reject(new Error(error));
      }
    };
    worker.onerror = function (err) {
      worker.terminate();
      reject(err);
    };
    worker.postMessage({ params });
  });
}

/**
 * Genera percorsi P5/P25/P50/P75/P95 per il grafico trend.
 * Supporta pacSchedule per coerenza con MC.
 */
export function generateTrendPaths(options = {}) {
  const {
    horizonMonths = 60,
    currentValue = 0,
    monthlyPAC = 500,
    pacSchedule = null,
  } = options;
  const safePV0 = typeof currentValue === 'number' && !isNaN(currentValue) ? currentValue : 0;

  const schedule = (Array.isArray(pacSchedule) && pacSchedule.length > 0)
    ? pacSchedule.filter(s => s.amount > 0).sort((a, b) => a.startMonth - b.startMonth)
    : [{ startMonth: 0, amount: monthlyPAC }];

  const pacAt = (m) => {
    let amount = schedule[0].amount;
    for (const seg of schedule) {
      if (m >= seg.startMonth) amount = seg.amount;
      else break;
    }
    return amount;
  };

  const muBlended = config.allocation.reduce((s, a) => s + a.weight * a.assumedReturnAnnual, 0);
  const sigmas = config.allocation.map(a => a.assumedVolAnnual);
  const weights = config.allocation.map(a => a.weight);
  let varBlended = 0;
  const rho = 0.85;
  for (let i = 0; i < weights.length; i++) {
    for (let j = 0; j < weights.length; j++) {
      const corr = i === j ? 1 : rho;
      varBlended += weights[i] * weights[j] * sigmas[i] * sigmas[j] * corr;
    }
  }
  const sigmaBlended = Math.sqrt(varBlended);
  const muLog = Math.log(1 + muBlended) / 12 - 0.5 * Math.pow(sigmaBlended / Math.sqrt(12), 2);
  const sigmaM = sigmaBlended / Math.sqrt(12);

  const N = 5000;
  const paths = [];

  for (let s = 0; s < N; s++) {
    const path = [safePV0];
    let v = safePV0;
    for (let m = 1; m <= horizonMonths; m++) {
      let u = Math.random(), w = Math.random();
      while (u === 0) u = Math.random();
      const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * w);
      const r = Math.exp(muLog + sigmaM * z) - 1;
      v = (v + pacAt(m - 1)) * (1 + r);
      path.push(v);
    }
    paths.push(path);
  }

  const result = [];
  let cumContrib = safePV0;
  for (let m = 0; m <= horizonMonths; m++) {
    const valuesAtM = paths.map(p => p[m]).sort((a, b) => a - b);
    if (m > 0) cumContrib += pacAt(m - 1);
    result.push({
      month: m,
      p5: valuesAtM[Math.floor(0.05 * N)],
      p25: valuesAtM[Math.floor(0.25 * N)],
      p50: valuesAtM[Math.floor(0.50 * N)],
      p75: valuesAtM[Math.floor(0.75 * N)],
      p95: valuesAtM[Math.floor(0.95 * N)],
      contributed: cumContrib,
    });
  }
  return result;
}

/**
 * Applica deflazione (inflation) a un dataset trend.
 * Restituisce nuovo array con valori in potere d'acquisto reale.
 */
export function deflateTrend(trendData, inflationAnnual = 0.02) {
  const monthlyDefl = Math.pow(1 + inflationAnnual, 1 / 12);
  return trendData.map(d => {
    const factor = Math.pow(monthlyDefl, d.month);
    return {
      month: d.month,
      p5: d.p5 / factor,
      p25: d.p25 / factor,
      p50: d.p50 / factor,
      p75: d.p75 / factor,
      p95: d.p95 / factor,
      contributed: d.contributed / factor,
    };
  });
}

export function clearMCCache() {
  safeStorage.remove(MC_CACHE_KEY);
  safeStorage.remove(MC_CACHE_TS_KEY);
}
