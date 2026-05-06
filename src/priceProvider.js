// =============================================================================
// PRICE PROVIDER — v3 (con auto-fetch da data/prices.json)
// =============================================================================
// Strategia 4-livelli (in ordine di priorità):
//   1. Manual override (sempre vince - utente ha l'ultima parola)
//   2. data/prices.json (aggiornato da GitHub Actions ogni notte)
//   3. Cache localStorage (fresca <24h, dal precedente caricamento json)
//   4. Fallback statico (currentPriceFallback in config.js)
//
// data/prices.json è servito dal medesimo dominio di GitHub Pages:
// nessun problema CORS, fetch sempre funziona.
// =============================================================================

import { config } from './config.js';

const CACHE_KEY = 'pd_prices_v3';
const CACHE_TIMESTAMP_KEY = 'pd_prices_ts_v3';
const MANUAL_OVERRIDE_KEY = 'pd_manual_prices_v2';
const HISTORY_CACHE_KEY = 'pd_history_v3';

const safeStorage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, val) { try { localStorage.setItem(key, val); return true; } catch { return false; } },
  remove(key) { try { localStorage.removeItem(key); } catch {} },
};

// -------------------------------------------------------------------------
// FETCH FROM data/prices.json (la fonte primaria nuova)
// -------------------------------------------------------------------------
let _jsonCache = null;
let _jsonFetchPromise = null;

async function fetchPricesJson(forceRefresh = false) {
  if (_jsonCache && !forceRefresh) return _jsonCache;
  if (_jsonFetchPromise) return _jsonFetchPromise;

  _jsonFetchPromise = (async () => {
    try {
      // Cache buster solo su force refresh, altrimenti il browser può cachare
      const url = forceRefresh
        ? `data/prices.json?t=${Date.now()}`
        : 'data/prices.json';
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`prices.json HTTP ${res.status}`);
      const data = await res.json();
      _jsonCache = data;

      // Salva anche in localStorage per offline fallback
      safeStorage.set(CACHE_KEY, JSON.stringify(data.prices || {}));
      safeStorage.set(CACHE_TIMESTAMP_KEY, String(Date.now()));
      if (data.history) {
        safeStorage.set(HISTORY_CACHE_KEY, JSON.stringify(data.history));
      }

      return data;
    } catch (err) {
      console.warn('[priceProvider] data/prices.json non disponibile:', err.message);
      _jsonCache = null;
      return null;
    } finally {
      _jsonFetchPromise = null;
    }
  })();

  return _jsonFetchPromise;
}

// -------------------------------------------------------------------------
// CACHE LOCAL (fallback offline)
// -------------------------------------------------------------------------
function getCachedPrices() {
  try {
    const ts = parseInt(safeStorage.get(CACHE_TIMESTAMP_KEY) || '0', 10);
    const ageMs = Date.now() - ts;
    const maxAgeMs = (config.priceProvider.cacheHours || 24) * 3600 * 1000;
    if (ageMs > maxAgeMs) return null;
    const data = safeStorage.get(CACHE_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export function getCacheAgeHours() {
  const ts = parseInt(safeStorage.get(CACHE_TIMESTAMP_KEY) || '0', 10);
  if (!ts) return null;
  return ((Date.now() - ts) / 3600000).toFixed(1);
}

export function getDataJsonAge() {
  if (!_jsonCache?.generated_at) return null;
  const generated = new Date(_jsonCache.generated_at).getTime();
  return ((Date.now() - generated) / 3600000).toFixed(1);
}

// -------------------------------------------------------------------------
// MANUAL OVERRIDES
// -------------------------------------------------------------------------
export function setManualPrice(ticker, price) {
  try {
    const overrides = JSON.parse(safeStorage.get(MANUAL_OVERRIDE_KEY) || '{}');
    overrides[ticker] = { price: parseFloat(price), ts: Date.now() };
    return safeStorage.set(MANUAL_OVERRIDE_KEY, JSON.stringify(overrides));
  } catch {
    return false;
  }
}

export function getManualPrices() {
  try { return JSON.parse(safeStorage.get(MANUAL_OVERRIDE_KEY) || '{}'); }
  catch { return {}; }
}

export function clearManualPrices() {
  safeStorage.remove(MANUAL_OVERRIDE_KEY);
}

export function getManualPriceAge(ticker) {
  const m = getManualPrices()[ticker];
  if (!m?.ts) return null;
  return ((Date.now() - m.ts) / 3600000).toFixed(1);
}

export function hasFreshManualPrices() {
  const manuals = getManualPrices();
  const tickers = config.allocation.map(a => a.ticker);
  return tickers.some(t => manuals[t]?.price > 0);
}

// -------------------------------------------------------------------------
// API PUBBLICA
// -------------------------------------------------------------------------
export async function getPriceFor(ticker, opts = {}) {
  const { forceRefresh = false } = opts;

  // 1. Manual override (priorità massima)
  const manuals = getManualPrices();
  if (manuals[ticker]?.price > 0) {
    return {
      ticker,
      price: manuals[ticker].price,
      source: 'manual',
      timestamp: manuals[ticker].ts,
    };
  }

  // 2. data/prices.json (la fonte automatica nuova)
  const json = await fetchPricesJson(forceRefresh);
  if (json?.prices?.[ticker]?.price > 0) {
    const p = json.prices[ticker];
    return {
      ticker,
      price: p.price,
      source: 'auto-yahoo',
      timestamp: p.timestamp || new Date(json.generated_at).getTime(),
    };
  }

  // 3. Cache locale (offline fallback)
  const cached = getCachedPrices();
  if (cached?.[ticker]?.price > 0) {
    return { ticker, ...cached[ticker], source: 'cache' };
  }

  // 4. Nessuna fonte → portfolioEngine userà currentPriceFallback dal config
  return { ticker, price: null, source: 'fallback' };
}

export async function getAllPrices(forceRefresh = false) {
  // Pre-fetch del json (una sola chiamata di rete per tutti i ticker)
  await fetchPricesJson(forceRefresh);

  const tickers = config.allocation.map(a => a.ticker);
  const results = await Promise.all(tickers.map(t => getPriceFor(t, { forceRefresh })));
  return results.reduce((acc, r) => { acc[r.ticker] = r; return acc; }, {});
}

export async function getHistoricalPrices(ticker, daysBack = 252) {
  // Tenta dal data/prices.json (popolato dallo script Python)
  const json = await fetchPricesJson(false);
  if (json?.history?.[ticker]?.length > 0) {
    return {
      ticker,
      data: json.history[ticker].slice(-daysBack),
      source: 'auto-yahoo',
    };
  }

  // Fallback su cache localStorage (storico salvato dal precedente fetch)
  try {
    const histCache = JSON.parse(safeStorage.get(HISTORY_CACHE_KEY) || '{}');
    if (histCache[ticker]?.length > 0) {
      return { ticker, data: histCache[ticker].slice(-daysBack), source: 'cache' };
    }
  } catch {}

  return { ticker, data: null, source: 'unavailable' };
}

export function clearAllCache() {
  safeStorage.remove(CACHE_KEY);
  safeStorage.remove(CACHE_TIMESTAMP_KEY);
  safeStorage.remove(HISTORY_CACHE_KEY);
  _jsonCache = null;
}

// Compat stubs (non usati, mantenuti per import safety)
export function setApiKey() {}
export function getApiKey() { return ''; }
