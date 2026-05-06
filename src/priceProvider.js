// =============================================================================
// PRICE PROVIDER — FINAL
// =============================================================================
// Strategia 3-livelli (in ordine di priorità):
//   1. Manual override (sempre vince - utente conosce meglio)
//   2. Cache localStorage (fresca <24h)
//   3. Stooq best-effort (può fallire per CORS, gestito gracefully)
//   4. Fallback statico in config.initialHoldings.currentPriceFallback
//
// NB: Twelve Data rimosso definitivamente perché non supporta UCITS .MI tickers.
// NB: Tutti gli accessi localStorage protetti da try/catch (Safari Private Mode).
// =============================================================================

import { config } from './config.js';

const CACHE_KEY = 'pd_prices_v2';
const CACHE_TIMESTAMP_KEY = 'pd_prices_ts_v2';
const MANUAL_OVERRIDE_KEY = 'pd_manual_prices_v2';

// Storage helpers (defensive: Safari Private Mode rifiuta localStorage)
const safeStorage = {
  get(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key, val) {
    try { localStorage.setItem(key, val); return true; } catch { return false; }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch {}
  },
};

// Mapping ticker config → ticker Stooq (best-effort)
const STOOQ_MAP = {
  'VWCE.MI':  'vwce.it',
  'CSNDX.MI': 'csndx.it',
  'CSPX.MI':  'cspx.it',
  'SWDA.MI':  'swda.it',
  'VETA.MI':  'veta.it',
};

// -------------------------------------------------------------------------
// CACHE
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

function setCachedPrices(prices) {
  safeStorage.set(CACHE_KEY, JSON.stringify(prices));
  safeStorage.set(CACHE_TIMESTAMP_KEY, String(Date.now()));
}

export function getCacheAgeHours() {
  const ts = parseInt(safeStorage.get(CACHE_TIMESTAMP_KEY) || '0', 10);
  if (!ts) return null;
  return ((Date.now() - ts) / 3600000).toFixed(1);
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

// Restituisce true se ALMENO UN ticker delle allocation ha un manual price valido
export function hasFreshManualPrices() {
  const manuals = getManualPrices();
  const tickers = config.allocation.map(a => a.ticker);
  return tickers.some(t => manuals[t]?.price > 0);
}

// -------------------------------------------------------------------------
// STOOQ FETCH (best-effort, gracefully fails on CORS)
// -------------------------------------------------------------------------
async function fetchFromStooq(ticker) {
  const stooqTicker = STOOQ_MAP[ticker] || ticker.toLowerCase().replace('.mi', '.it');
  const url = `https://stooq.com/q/l/?s=${stooqTicker}&f=sd2t2ohlc&h&e=csv`;
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`Stooq HTTP ${res.status}`);
  const csv = await res.text();
  const lines = csv.trim().split('\n');
  if (lines.length < 2) throw new Error('Stooq: empty response');
  const headers = lines[0].split(',');
  const values = lines[1].split(',');
  const closeIdx = headers.indexOf('Close');
  const close = parseFloat(values[closeIdx]);
  if (isNaN(close) || close <= 0) throw new Error(`Stooq: ticker ${stooqTicker} N/D`);
  return { price: close, timestamp: Date.now() };
}

// -------------------------------------------------------------------------
// API PUBBLICA
// -------------------------------------------------------------------------
export async function getPriceFor(ticker, opts = {}) {
  const { forceRefresh = false, useCache = true } = opts;

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

  // 2. Cache
  if (useCache && !forceRefresh) {
    const cache = getCachedPrices();
    if (cache?.[ticker]) {
      return { ticker, ...cache[ticker], source: 'cache' };
    }
  }

  // 3. Stooq best-effort
  try {
    const live = await fetchFromStooq(ticker);
    const cache = getCachedPrices() || {};
    cache[ticker] = live;
    setCachedPrices(cache);
    return { ticker, ...live, source: 'live-stooq' };
  } catch (err) {
    // 4. Fallback statico (currentPriceFallback) gestito dal portfolioEngine
    return { ticker, price: null, source: 'fallback', error: err.message };
  }
}

export async function getAllPrices(forceRefresh = false) {
  const tickers = config.allocation.map(a => a.ticker);
  const results = await Promise.all(tickers.map(t => getPriceFor(t, { forceRefresh })));
  return results.reduce((acc, r) => { acc[r.ticker] = r; return acc; }, {});
}

export async function getHistoricalPrices(ticker, daysBack = 252) {
  const stooqTicker = STOOQ_MAP[ticker] || ticker.toLowerCase().replace('.mi', '.it');
  const url = `https://stooq.com/q/d/l/?s=${stooqTicker}&i=d`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const csv = await res.text();
    const lines = csv.trim().split('\n');
    if (lines.length < 50) throw new Error('Insufficient history');
    const headers = lines[0].split(',');
    const dateIdx = headers.indexOf('Date');
    const closeIdx = headers.indexOf('Close');
    const data = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',');
      const close = parseFloat(parts[closeIdx]);
      if (!isNaN(close) && close > 0) data.push({ date: parts[dateIdx], close });
    }
    return { ticker, data: data.slice(-daysBack), source: 'live-stooq' };
  } catch (err) {
    return { ticker, data: null, source: 'error', error: err.message };
  }
}

export function clearAllCache() {
  safeStorage.remove(CACHE_KEY);
  safeStorage.remove(CACHE_TIMESTAMP_KEY);
}

// Compat stubs (non usati dopo rimozione Twelve Data, mantenuti per import safety)
export function setApiKey() {}
export function getApiKey() { return ''; }
