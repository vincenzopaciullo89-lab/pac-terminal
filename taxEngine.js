// =============================================================================
// PRICE PROVIDER
// =============================================================================
// Strategia 3-livelli per prezzi ETF UCITS:
//   1. Cache localStorage (24h)
//   2. Twelve Data API (free tier 800 req/giorno, supporta UCITS)
//   3. Fallback manuale (utente inserisce prezzo)
//
// LIMITE ONESTO: i feed API gratuiti per ETF UCITS irlandesi sono incostanti.
// Twelve Data è il più affidabile free, MA potrebbe non avere alcuni ticker.
// Per questo motivo c'è SEMPRE il fallback manuale.
// =============================================================================

import { config } from './config.js';

const CACHE_KEY = 'pd_prices_v1';
const CACHE_TIMESTAMP_KEY = 'pd_prices_ts_v1';
const MANUAL_OVERRIDE_KEY = 'pd_manual_prices_v1';

// -------------------------------------------------------------------------
// CACHE LAYER
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
    console.warn('Cache read error:', e);
    return null;
  }
}

function setCachedPrices(prices) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(prices));
    localStorage.setItem(CACHE_TIMESTAMP_KEY, String(Date.now()));
  } catch (e) {
    console.warn('Cache write error:', e);
  }
}

export function getCacheAgeHours() {
  const ts = parseInt(localStorage.getItem(CACHE_TIMESTAMP_KEY) || '0', 10);
  if (!ts) return null;
  return ((Date.now() - ts) / 3600000).toFixed(1);
}

// -------------------------------------------------------------------------
// MANUAL OVERRIDES (utente inserisce manualmente)
// -------------------------------------------------------------------------
export function setManualPrice(ticker, price) {
  try {
    const overrides = JSON.parse(localStorage.getItem(MANUAL_OVERRIDE_KEY) || '{}');
    overrides[ticker] = { price: parseFloat(price), ts: Date.now() };
    localStorage.setItem(MANUAL_OVERRIDE_KEY, JSON.stringify(overrides));
    return true;
  } catch (e) {
    console.error('Manual override error:', e);
    return false;
  }
}

export function getManualPrices() {
  try {
    return JSON.parse(localStorage.getItem(MANUAL_OVERRIDE_KEY) || '{}');
  } catch (e) {
    return {};
  }
}

export function clearManualPrices() {
  localStorage.removeItem(MANUAL_OVERRIDE_KEY);
}

// -------------------------------------------------------------------------
// TWELVE DATA API
// -------------------------------------------------------------------------
async function fetchFromTwelveData(ticker, apiKey) {
  if (!apiKey) throw new Error('API key mancante');
  const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(ticker)}&apikey=${apiKey}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.status === 'error') throw new Error(data.message || 'API error');
  if (!data.close) throw new Error('Prezzo non disponibile');
  return {
    price: parseFloat(data.close),
    previousClose: parseFloat(data.previous_close || data.close),
    changePct: parseFloat(data.percent_change || 0),
    high52w: parseFloat(data.fifty_two_week?.high || 0),
    low52w: parseFloat(data.fifty_two_week?.low || 0),
    timestamp: Date.now(),
  };
}

// Storico ultimi N giorni per calcolo MA, drawdown rolling
async function fetchHistoricalFromTwelveData(ticker, apiKey, daysBack = 252) {
  if (!apiKey) throw new Error('API key mancante');
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(ticker)}&interval=1day&outputsize=${daysBack}&apikey=${apiKey}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.status === 'error') throw new Error(data.message);
  if (!Array.isArray(data.values)) throw new Error('Dati storici malformati');
  return data.values
    .map(d => ({ date: d.datetime, close: parseFloat(d.close) }))
    .reverse(); // dal più vecchio al più recente
}

// -------------------------------------------------------------------------
// API PUBBLICA
// -------------------------------------------------------------------------
export async function getPriceFor(ticker, opts = {}) {
  const { forceRefresh = false, useCache = true } = opts;

  // 1. Manual override sempre vince (l'utente conosce meglio)
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

  // 3. Fetch live
  const apiKey = localStorage.getItem('twelvedata_apikey') || config.priceProvider.apiKey;
  try {
    const live = await fetchFromTwelveData(ticker, apiKey);
    const cache = getCachedPrices() || {};
    cache[ticker] = live;
    setCachedPrices(cache);
    return { ticker, ...live, source: 'live' };
  } catch (err) {
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
  const apiKey = localStorage.getItem('twelvedata_apikey') || config.priceProvider.apiKey;
  if (!apiKey) {
    return { ticker, data: null, source: 'no-api-key' };
  }
  try {
    const data = await fetchHistoricalFromTwelveData(ticker, apiKey, daysBack);
    return { ticker, data, source: 'live' };
  } catch (err) {
    return { ticker, data: null, source: 'error', error: err.message };
  }
}

// Setting per API key (chiamato dalla UI Settings)
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
