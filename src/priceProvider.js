// =============================================================================
// PRICE PROVIDER — Stooq (gratis, no API key, supporta ETF UCITS .MI)
// =============================================================================
// Strategia 3-livelli:
//   1. Manual override (sempre vince - utente conosce meglio)
//   2. Cache localStorage (24h)
//   3. Stooq CSV fetch (free, no key, supporta Borsa Italiana)
//
// Stooq URL pattern: https://stooq.com/q/l/?s=TICKER&f=sd2t2ohlcv&h&e=csv
// Per Borsa Italiana il ticker su Stooq è in lowercase con .it suffix
// Es: VWCE.MI → vwce.it ; CSNDX.MI → csndx.it
// =============================================================================

import { config } from './config.js';

const CACHE_KEY = 'pd_prices_v1';
const CACHE_TIMESTAMP_KEY = 'pd_prices_ts_v1';
const MANUAL_OVERRIDE_KEY = 'pd_manual_prices_v1';

// Mapping ticker config → ticker Stooq
const STOOQ_MAP = {
  'VWCE.MI': 'vwce.it',
  'CSNDX.MI': 'csndx.it',
  'CSPX.MI': 'cspx.it',
  'SWDA.MI': 'swda.it',
  'VETA.MI': 'veta.it',
};

// -------------------------------------------------------------------------
// CACHE
// -------------------------------------------------------------------------
function getCachedPrices() {
  try {
    const ts = parseInt(localStorage.getItem(CACHE_TIMESTAMP_KEY) || '0', 10);
    const ageMs = Date.now() - ts;
    const maxAgeMs = (config.priceProvider.cacheHours || 24) * 3600 * 1000;
    if (ageMs > maxAgeMs) return null;
    const data = localStorage.getItem(CACHE_KEY);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    return null;
  }
}

function setCachedPrices(prices) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(prices));
    localStorage.setItem(CACHE_TIMESTAMP_KEY, String(Date.now()));
  } catch (e) {}
}

export function getCacheAgeHours() {
  const ts = parseInt(localStorage.getItem(CACHE_TIMESTAMP_KEY) || '0', 10);
  if (!ts) return null;
  return ((Date.now() - ts) / 3600000).toFixed(1);
}

// -------------------------------------------------------------------------
// MANUAL OVERRIDES
// -------------------------------------------------------------------------
export function setManualPrice(ticker, price) {
  try {
    const overrides = JSON.parse(localStorage.getItem(MANUAL_OVERRIDE_KEY) || '{}');
    overrides[ticker] = { price: parseFloat(price), ts: Date.now() };
    localStorage.setItem(MANUAL_OVERRIDE_KEY, JSON.stringify(overrides));
    return true;
  } catch (e) { return false; }
}

export function getManualPrices() {
  try { return JSON.parse(localStorage.getItem(MANUAL_OVERRIDE_KEY) || '{}'); }
  catch (e) { return {}; }
}

export function clearManualPrices() {
  localStorage.removeItem(MANUAL_OVERRIDE_KEY);
}

// -------------------------------------------------------------------------
// STOOQ FETCH
// -------------------------------------------------------------------------
async function fetchFromStooq(ticker) {
  const stooqTicker = STOOQ_MAP[ticker] || ticker.toLowerCase().replace('.mi', '.it');
  const url = `https://stooq.com/q/l/?s=${stooqTicker}&f=sd2t2ohlcv&h&e=csv`;
  
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Stooq HTTP ${res.status}`);
  
  const csv = await res.text();
  const lines = csv.trim().split('\n');
  if (lines.length < 2) throw new Error('Stooq: risposta vuota');
  
  // Header: Symbol,Date,Time,Open,High,Low,Close,Volume
  const headers = lines[0].split(',');
  const values = lines[1].split(',');
  const closeIdx = headers.indexOf('Close');
  const openIdx = headers.indexOf('Open');
  const highIdx = headers.indexOf('High');
  const lowIdx = headers.indexOf('Low');
  
  const close = parseFloat(values[closeIdx]);
  if (isNaN(close) || close <= 0) {
    throw new Error(`Stooq: ticker ${stooqTicker} non disponibile (forse N/D oggi)`);
  }
  
  const open = parseFloat(values[openIdx]);
  const changePct = open > 0 ? ((close - open) / open) * 100 : 0;
  
  return {
    price: close,
    previousClose: open,
    changePct,
    high52w: parseFloat(values[highIdx]) || close,
    low52w: parseFloat(values[lowIdx]) || close,
    timestamp: Date.now(),
  };
}

// Storico prezzi (per drawdown 12M, MA200 ecc.)
async function fetchHistoricalFromStooq(ticker) {
  const stooqTicker = STOOQ_MAP[ticker] || ticker.toLowerCase().replace('.mi', '.it');
  // i=d daily, ottiene fino a ~5 anni di storico
  const url = `https://stooq.com/q/d/l/?s=${stooqTicker}&i=d`;
  
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Stooq history HTTP ${res.status}`);
  
  const csv = await res.text();
  const lines = csv.trim().split('\n');
  if (lines.length < 50) throw new Error('Stooq: storico insufficiente');
  
  const headers = lines[0].split(',');
  const dateIdx = headers.indexOf('Date');
  const closeIdx = headers.indexOf('Close');
  
  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    const close = parseFloat(parts[closeIdx]);
    if (!isNaN(close) && close > 0) {
      data.push({ date: parts[dateIdx], close });
    }
  }
  
  // Stooq restituisce dal più vecchio al più recente, già OK
  return data;
}

// -------------------------------------------------------------------------
// API PUBBLICA
// -------------------------------------------------------------------------
export async function getPriceFor(ticker, opts = {}) {
  const { forceRefresh = false, useCache = true } = opts;

  // 1. Manual override
  const manuals = getManualPrices();
  if (manuals[ticker]) {
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

  // 3. Stooq live
  try {
    const live = await fetchFromStooq(ticker);
    const cache = getCachedPrices() || {};
    cache[ticker] = live;
    setCachedPrices(cache);
    return { ticker, ...live, source: 'live-stooq' };
  } catch (err) {
    console.warn(`[Stooq] ${ticker}: ${err.message}`);
    return { ticker, price: null, source: 'error', error: err.message };
  }
}

export async function getAllPrices(forceRefresh = false) {
  const tickers = config.allocation.map(a => a.ticker);
  const results = await Promise.all(tickers.map(t => getPriceFor(t, { forceRefresh })));
  return results.reduce((acc, r) => {
    acc[r.ticker] = r;
    return acc;
  }, {});
}

export async function getHistoricalPrices(ticker, daysBack = 252) {
  try {
    const fullData = await fetchHistoricalFromStooq(ticker);
    // Restituisce solo gli ultimi N giorni
    return { ticker, data: fullData.slice(-daysBack), source: 'live-stooq' };
  } catch (err) {
    console.warn(`[Stooq history] ${ticker}: ${err.message}`);
    return { ticker, data: null, source: 'error', error: err.message };
  }
}

// Stub functions per compatibilità con UI vecchia (non usate ma evitano import errors)
export function setApiKey(key) {
  localStorage.setItem('twelvedata_apikey', key.trim());
}
export function getApiKey() {
  return localStorage.getItem('twelvedata_apikey') || '';
}
export function clearAllCache() {
  localStorage.removeItem(CACHE_KEY);
  localStorage.removeItem(CACHE_TIMESTAMP_KEY);
}
