// =============================================================================
// MONTE CARLO ENGINE — Wrapper for Worker
// =============================================================================
// Lancia il Worker con 50.000 sim e ritorna una Promise con i risultati.
// Cache locale 24h per evitare ricomputazione inutile.
// =============================================================================

import { config } from './config.js';

const MC_CACHE_KEY = 'pd_mc_results_v1';
const MC_CACHE_TS_KEY = 'pd_mc_results_ts_v1';
const MC_CACHE_HOURS = 24;

function configHash(params) {
  // Hash semplice della config che varia i risultati
  const str = JSON.stringify({
    months: params.months,
    nSim: params.nSim,
    mu: params.mu,
    sigma: params.sigma,
    pv0: params.pv0,
    tiers: params.tiers,
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
    const ts = parseInt(localStorage.getItem(MC_CACHE_TS_KEY) || '0', 10);
    const ageH = (Date.now() - ts) / 3600000;
    if (ageH > MC_CACHE_HOURS) return null;
    const stored = JSON.parse(localStorage.getItem(MC_CACHE_KEY) || '{}');
    return stored[key] || null;
  } catch (e) {
    return null;
  }
}

function setCachedMC(key, results) {
  try {
    const stored = JSON.parse(localStorage.getItem(MC_CACHE_KEY) || '{}');
    stored[key] = results;
    localStorage.setItem(MC_CACHE_KEY, JSON.stringify(stored));
    localStorage.setItem(MC_CACHE_TS_KEY, String(Date.now()));
  } catch (e) {
    console.warn('Cannot cache MC results:', e);
  }
}

/**
 * Esegue Monte Carlo, ritorna Promise<results>
 *
 * @param {Object} options
 * @param {Function} options.onProgress - callback con (current, total, label)
 * @param {boolean} options.forceRefresh - bypassa cache
 * @param {number} options.horizonMonths - default 240 (20 anni)
 * @param {number} options.currentValue - valore portafoglio iniziale
 */
export function runMonteCarlo(options = {}) {
  const {
    onProgress = () => {},
    forceRefresh = false,
    horizonMonths = 240,
    currentValue = null,
    nSim = config.monteCarlo.nSimulations,
  } = options;

  // Calcola mu/sigma blended dell'allocazione
  const totalWeight = config.allocation.reduce((s, a) => s + a.weight, 0);
  const muBlended = config.allocation.reduce((s, a) => s + a.weight * a.assumedReturnAnnual, 0) / totalWeight;
  // Volatilità blended (semplificato: assume correlazione 1, conservativo)
  // Più rigoroso: sigma^2 = sum(w_i^2 * sigma_i^2) + 2*sum(w_i*w_j*rho*sigma_i*sigma_j)
  // Per global+tech assumiamo rho=0.85
  const sigmas = config.allocation.map(a => a.assumedVolAnnual);
  const weights = config.allocation.map(a => a.weight);
  let varBlended = 0;
  const rho = 0.85; // correlazione global vs tech (ragionevole)
  for (let i = 0; i < weights.length; i++) {
    for (let j = 0; j < weights.length; j++) {
      const corr = i === j ? 1 : rho;
      varBlended += weights[i] * weights[j] * sigmas[i] * sigmas[j] * corr;
    }
  }
  const sigmaBlended = Math.sqrt(varBlended);
  const terBlended = config.allocation.reduce((s, a) => s + a.weight * a.ter, 0);

  const params = {
    nSim,
    months: horizonMonths,
    mu: muBlended,
    sigma: sigmaBlended,
    ter: terBlended,
    pv0: currentValue ?? 0,
    tiers: config.strategyTiers,
    capPerYear: config.pac.capBoostMonthsPerYear,
  };

  const cacheKey = configHash(params);
  if (!forceRefresh) {
    const cached = getCachedMC(cacheKey);
    if (cached) {
      console.log('[MC] Using cached results, age', Date.now() - cached._cachedAt);
      return Promise.resolve(cached);
    }
  }

  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./monteCarloWorker.js', import.meta.url), { type: 'module' });
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
 * Genera i percorsi P25/P50/P75 per il grafico trend
 * Output: array of {month, p5, p25, p50, p75, p95, contributed}
 */
export function generateTrendPaths(options = {}) {
  const { horizonMonths = 60, currentValue = 0, monthlyPAC = 500 } = options;

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

  // Esegui 5000 sim solo per generare bande (più veloce di 50k)
  const N = 5000;
  const paths = []; // 2D array [sim][month] = value

  for (let s = 0; s < N; s++) {
    const path = [currentValue];
    let v = currentValue;
    for (let m = 1; m <= horizonMonths; m++) {
      // Box-Muller
      let u = Math.random(), w = Math.random();
      while (u === 0) u = Math.random();
      const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * w);
      const r = Math.exp(muLog + sigmaM * z) - 1;
      v = (v + monthlyPAC) * (1 + r);
      path.push(v);
    }
    paths.push(path);
  }

  // Per ogni mese, calcola percentili
  const result = [];
  for (let m = 0; m <= horizonMonths; m++) {
    const valuesAtM = paths.map(p => p[m]).sort((a, b) => a - b);
    const contributed = currentValue + monthlyPAC * m;
    result.push({
      month: m,
      p5: valuesAtM[Math.floor(0.05 * N)],
      p25: valuesAtM[Math.floor(0.25 * N)],
      p50: valuesAtM[Math.floor(0.50 * N)],
      p75: valuesAtM[Math.floor(0.75 * N)],
      p95: valuesAtM[Math.floor(0.95 * N)],
      contributed,
    });
  }
  return result;
}

export function clearMCCache() {
  localStorage.removeItem(MC_CACHE_KEY);
  localStorage.removeItem(MC_CACHE_TS_KEY);
}
