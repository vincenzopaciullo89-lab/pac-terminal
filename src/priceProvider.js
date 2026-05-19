// =============================================================================
// PRICE PROVIDER v4 — JSON statici da GitHub Actions (Task B.4)
// =============================================================================
// La pipeline GitHub Actions (cron 07:30 + 18:30 UTC) committa /data/prices.json
// e /data/history.json nel repo. Il sito legge questi due file da same-origin
// senza CORS né dipendenze da provider esterni a runtime.
//
// Strategia di priorità (in ordine):
//   1. Manual override (l'utente forza prezzi specifici dalla dashboard)
//   2. Cache localStorage (TTL 1h, evita fetch ripetuti)
//   3. Fetch /data/prices.json + /data/history.json (same-origin)
//   4. Fallback statico (currentPriceFallback dal config) — solo se tutto il
//      resto è inaccessibile (es. sviluppo offline)
//
// VINCOLO POST-PR#18: nessun fallback live a Google Sheets nel browser.
// Se il JSON è mancante o obsoleto, l'UI mostra avviso ma NON ritenta fonti
// esterne — la responsabilità è del cron lato server-side.
// =============================================================================

import { config } from './config.js';

// -------------------------------------------------------------------------
// CONFIGURAZIONE FONTI
// -------------------------------------------------------------------------
const DATA_URLS = {
  prices: 'data/prices.json',
  history: 'data/history.json',
};

// Mappa ISIN → ticker .MI (formato canonico interno usato in tutto il codice).
// Necessaria perché initialHoldings ha solo ISIN.
const ISIN_TO_TICKER = {
  'IE00BK5BQT80': 'VWCE.MI',
  'IE00B53SZB19': 'CSNDX.MI',
  'IE00B5BMR087': 'CSPX.MI',
  'IE00B4L5Y983': 'SWDA.MI',
  'IE00BH04GL39': 'VETA.MI',
};
const TICKER_TO_ISIN = Object.fromEntries(
  Object.entries(ISIN_TO_TICKER).map(([isin, t]) => [t, isin]),
);

// Mappa NAME (chiave in /data/prices.json) → ticker .MI canonico.
// Il fetcher Python usa nomi corti (VWCE), il resto del codice usa il
// ticker .MI: questo è il punto di traduzione.
const NAME_TO_TICKER = {
  VWCE:  'VWCE.MI',
  CSNDX: 'CSNDX.MI',
  CSPX:  'CSPX.MI',
  SWDA:  'SWDA.MI',
  VETA:  'VETA.MI',
};

// Bump cache keys da v32 a v33: invalida cache stantia post-refactor senza
// richiedere clear browser all'utente.
const CACHE_KEY = 'pd_prices_v33';
const CACHE_TIMESTAMP_KEY = 'pd_prices_ts_v33';
const HISTORY_CACHE_KEY = 'pd_history_v33';
const HISTORY_CACHE_TS_KEY = 'pd_history_ts_v33';
const MANUAL_OVERRIDE_KEY = 'pd_manual_prices_v2';

const CACHE_HOURS = 1;
const FETCH_TIMEOUT_MS = 10000;
const STALE_THRESHOLD_HOURS = 24;

// -------------------------------------------------------------------------
// SAFE STORAGE
// -------------------------------------------------------------------------
const safeStorage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, val) { try { localStorage.setItem(key, val); return true; } catch { return false; } },
  remove(key) { try { localStorage.removeItem(key); } catch {} },
};

// -------------------------------------------------------------------------
// FETCH JSON CON TIMEOUT
// -------------------------------------------------------------------------
async function fetchJson(url) {
  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

// -------------------------------------------------------------------------
// CACHE
// -------------------------------------------------------------------------
function getCachedPrices() {
  try {
    const ts = parseInt(safeStorage.get(CACHE_TIMESTAMP_KEY) || '0', 10);
    if (Date.now() - ts > CACHE_HOURS * 3600 * 1000) return null;
    const data = safeStorage.get(CACHE_KEY);
    return data ? JSON.parse(data) : null;
  } catch { return null; }
}

function getCachedHistory() {
  try {
    const ts = parseInt(safeStorage.get(HISTORY_CACHE_TS_KEY) || '0', 10);
    if (Date.now() - ts > CACHE_HOURS * 3600 * 1000) return null;
    const data = safeStorage.get(HISTORY_CACHE_KEY);
    return data ? JSON.parse(data) : null;
  } catch { return null; }
}

// -------------------------------------------------------------------------
// TRASFORMAZIONI SCHEMA
// -------------------------------------------------------------------------
export function transformPricesJson(raw) {
  const out = {
    _meta: {
      updated_at: raw.updated_at || null,
      updated_ms: raw.updated_at ? Date.parse(raw.updated_at) : null,
      sources_used: raw.sources_used || {},
      fx_rates: raw.fx_rates || {},
    },
    byTicker: {},
  };
  for (const [name, info] of Object.entries(raw.current || {})) {
    const ticker = NAME_TO_TICKER[name];
    if (!ticker) continue;
    if (typeof info.price_eur !== 'number' || info.price_eur <= 0) continue;
    out.byTicker[ticker] = {
      ticker,
      price: info.price_eur,         // canonico: sempre EUR
      priceRaw: info.price_native,   // prezzo nella valuta nativa
      currency: info.currency,
      source: 'data-json',
      sourceUpstream: info.source,   // 'yfinance' | 'google_sheets' | ...
      timestamp: out._meta.updated_ms || Date.now(),
    };
  }
  return out;
}

export function transformHistoryJson(raw) {
  const out = {
    _meta: { updated_at: raw.updated_at || null },
    byTicker: {},
  };
  for (const [name, info] of Object.entries(raw.tickers || {})) {
    const ticker = NAME_TO_TICKER[name];
    if (!ticker) continue;
    out.byTicker[ticker] = Array.isArray(info.data) ? info.data : [];
  }
  return out;
}

// -------------------------------------------------------------------------
// FETCH DEDUPLICATO
// -------------------------------------------------------------------------
let _pricesPromise = null;
let _historyPromise = null;

async function fetchPricesJson(forceRefresh = false) {
  if (!forceRefresh) {
    const cached = getCachedPrices();
    if (cached) return cached;
  }
  if (_pricesPromise) return _pricesPromise;
  _pricesPromise = (async () => {
    try {
      const raw = await fetchJson(DATA_URLS.prices);
      const parsed = transformPricesJson(raw);
      safeStorage.set(CACHE_KEY, JSON.stringify(parsed));
      safeStorage.set(CACHE_TIMESTAMP_KEY, String(Date.now()));
      return parsed;
    } catch (err) {
      console.warn('[prices] fetch /data/prices.json failed:', err.message);
      return { _meta: {}, byTicker: {} };
    } finally {
      _pricesPromise = null;
    }
  })();
  return _pricesPromise;
}

async function fetchHistoryJson(forceRefresh = false) {
  if (!forceRefresh) {
    const cached = getCachedHistory();
    if (cached) return cached;
  }
  if (_historyPromise) return _historyPromise;
  _historyPromise = (async () => {
    try {
      const raw = await fetchJson(DATA_URLS.history);
      const parsed = transformHistoryJson(raw);
      safeStorage.set(HISTORY_CACHE_KEY, JSON.stringify(parsed));
      safeStorage.set(HISTORY_CACHE_TS_KEY, String(Date.now()));
      return parsed;
    } catch (err) {
      console.warn('[history] fetch /data/history.json failed:', err.message);
      return { _meta: {}, byTicker: {} };
    } finally {
      _historyPromise = null;
    }
  })();
  return _historyPromise;
}

// -------------------------------------------------------------------------
// MANUAL OVERRIDES (invariate da v3)
// -------------------------------------------------------------------------
export function setManualPrice(ticker, price) {
  try {
    const overrides = JSON.parse(safeStorage.get(MANUAL_OVERRIDE_KEY) || '{}');
    overrides[ticker] = { price: parseFloat(price), ts: Date.now() };
    return safeStorage.set(MANUAL_OVERRIDE_KEY, JSON.stringify(overrides));
  } catch { return false; }
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
  const allTickers = Object.values(ISIN_TO_TICKER);
  return allTickers.some(t => manuals[t]?.price > 0);
}

// -------------------------------------------------------------------------
// AGE / STALENESS
// -------------------------------------------------------------------------
// Restituisce l'età (h) del campo `updated_at` del JSON, non l'età della
// cache locale: quello che l'utente vuole sapere è quando il cron ha
// effettivamente aggiornato i dati. Numero arrotondato a 1 decimale.
export function getCacheAgeHours() {
  let payload;
  try { payload = JSON.parse(safeStorage.get(CACHE_KEY) || 'null'); }
  catch { return null; }
  const ms = payload?._meta?.updated_ms;
  if (!ms) return null;
  return ((Date.now() - ms) / 3600000).toFixed(1);
}

export function getDataJsonAge() { return getCacheAgeHours(); }

export function isDataStale() {
  const age = getCacheAgeHours();
  if (age === null) return true;
  return parseFloat(age) > STALE_THRESHOLD_HOURS;
}

// -------------------------------------------------------------------------
// API PUBBLICA
// -------------------------------------------------------------------------
export async function getPriceFor(ticker, opts = {}) {
  const { forceRefresh = false } = opts;

  // 1. Manual override
  const manuals = getManualPrices();
  if (manuals[ticker]?.price > 0) {
    return {
      ticker, price: manuals[ticker].price,
      source: 'manual', timestamp: manuals[ticker].ts,
    };
  }

  // 2. /data/prices.json (via cache or fresh fetch)
  const data = await fetchPricesJson(forceRefresh);
  const rec = data.byTicker?.[ticker];
  if (rec && rec.price > 0) {
    return { ...rec };
  }

  // 3. Fallback null → portfolioEngine userà currentPriceFallback dal config
  return { ticker, price: null, source: 'fallback' };
}

/**
 * Ritorna prezzi per TUTTI gli ETF noti (allocation + legacy).
 * Lookup avviene per ticker .MI (es. 'VWCE.MI', 'CSPX.MI').
 */
export async function getAllPrices(forceRefresh = false) {
  const allTickers = new Set();

  config.allocation.forEach(a => allTickers.add(a.ticker));
  (config.initialHoldings || []).forEach(h => {
    const ticker = ISIN_TO_TICKER[h.isin];
    if (ticker) allTickers.add(ticker);
  });

  const tickerArray = Array.from(allTickers);
  const results = await Promise.all(tickerArray.map(t => getPriceFor(t, { forceRefresh })));
  return results.reduce((acc, r) => { acc[r.ticker] = r; return acc; }, {});
}

/**
 * Storico per un ticker (VWCE.MI o CSNDX.MI supportati).
 * Per altri ticker ritorna data: null.
 */
export async function getHistoricalPrices(ticker, daysBack = 252) {
  const data = await fetchHistoryJson(false);
  const series = data.byTicker?.[ticker];
  if (series && series.length > 0) {
    return { ticker, data: series.slice(-daysBack), source: 'data-json' };
  }
  return { ticker, data: null, source: 'unavailable' };
}

export function clearAllCache() {
  safeStorage.remove(CACHE_KEY);
  safeStorage.remove(CACHE_TIMESTAMP_KEY);
  safeStorage.remove(HISTORY_CACHE_KEY);
  safeStorage.remove(HISTORY_CACHE_TS_KEY);
}

// Helper esposti per altri moduli
export function getTickerForISIN(isin) { return ISIN_TO_TICKER[isin] || null; }
export function getISINForTicker(ticker) { return TICKER_TO_ISIN[ticker] || null; }

// Vestigial: alcuni componenti legacy potrebbero ancora invocarli.
export function setApiKey() {}
export function getApiKey() { return ''; }
