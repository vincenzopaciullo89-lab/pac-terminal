// =============================================================================
// PRICE PROVIDER v3.1 — Google Sheets CSV (FINAL)
// =============================================================================
// Strategia 4-livelli (in ordine di priorità):
//   1. Manual override (l'utente ha l'ultima parola)
//   2. Google Sheets CSV pubblicato (fonte automatica primaria)
//   3. Cache localStorage (offline fallback, valida 6h)
//   4. Fallback statico (currentPriceFallback in config.js)
//
// FIX vs v3:
//   - URL corretti (SA0/OIB invece di SAO/OlB)
//   - getAllPrices include TUTTI gli ETF (anche legacy via ISIN→ticker map)
//   - getHistoricalPrices legge dal Sheet (no più Stooq bloccato)
//   - Supporto storico per CSNDX in aggiunta a VWCE
// =============================================================================

import { config } from './config.js';

// -------------------------------------------------------------------------
// CONFIGURAZIONE FONTI — URL VERIFICATI 7 MAG 2026
// -------------------------------------------------------------------------
const SHEETS_URLS = {
  current: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSA078B6Q5XKyReR0tAjNT5hDEuE4RQSoAdEsa3t9KWSzjfYE2S4OtJ3wazmvU7gMnYveo2OIB0wAFs/pub?gid=0&single=true&output=csv',
  history: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSA078B6Q5XKyReR0tAjNT5hDEuE4RQSoAdEsa3t9KWSzjfYE2S4OtJ3wazmvU7gMnYveo2OIB0wAFs/pub?gid=1714634805&single=true&output=csv',
};

// Mappa ISIN → ticker (formato Sheet: XXXX.MI)
// Necessaria perché initialHoldings ha solo ISIN, ma il Sheet usa ticker .MI
const ISIN_TO_TICKER = {
  'IE00BK5BQT80': 'VWCE.MI',
  'IE00B53SZB19': 'CSNDX.MI',
  'IE00B5BMR087': 'CSPX.MI',
  'IE00B4L5Y983': 'SWDA.MI',
  'IE00BH04GL39': 'VETA.MI',
};

// Mappa ticker → ISIN (inversa, per reverse lookup)
const TICKER_TO_ISIN = Object.fromEntries(
  Object.entries(ISIN_TO_TICKER).map(([isin, ticker]) => [ticker, isin])
);

const CACHE_KEY = 'pd_prices_v31';
const CACHE_TIMESTAMP_KEY = 'pd_prices_ts_v31';
const HISTORY_CACHE_KEY = 'pd_history_v31';
const HISTORY_CACHE_TS_KEY = 'pd_history_ts_v31';
const MANUAL_OVERRIDE_KEY = 'pd_manual_prices_v2';

const CACHE_HOURS = 1;
const FETCH_TIMEOUT_MS = 10000;

// -------------------------------------------------------------------------
// SAFE STORAGE
// -------------------------------------------------------------------------
const safeStorage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, val) { try { localStorage.setItem(key, val); return true; } catch { return false; } },
  remove(key) { try { localStorage.removeItem(key); } catch {} },
};

// -------------------------------------------------------------------------
// CSV PARSER
// -------------------------------------------------------------------------
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuote = false, i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQuote) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuote = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuote = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

function parseItalianNumber(s) {
  if (!s || typeof s !== 'string') return null;
  let cleaned = s.trim();
  if (!cleaned) return null;
  cleaned = cleaned.replace(/[€\s\u00A0]/g, '');
  if (cleaned.includes(',')) cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function parseItalianDate(s) {
  if (!s || typeof s !== 'string') return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

// -------------------------------------------------------------------------
// FETCH CSV
// -------------------------------------------------------------------------
async function fetchCSV(url, { bust = false } = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  // Cache-buster solo su force-refresh: rende la URL unica per superare
  // eventuali cache CDN o proxy che onorano la URL come chiave.
  const finalUrl = bust ? `${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}` : url;
  try {
    // cache: 'no-store' disabilita la HTTP cache del browser (altrimenti il
    // browser può servire una risposta cached anche se forceRefresh è true).
    const res = await fetch(finalUrl, { signal: controller.signal, cache: 'no-store' });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

// -------------------------------------------------------------------------
// PARSE CURRENT SHEET
// -------------------------------------------------------------------------
// Foglio "current" — struttura attesa:
//   col 0: # | col 1: ETF | col 2: P raw | col 3: Date | col 4: Currency | col 5: P EUR
function parseCurrentSheet(csvText) {
  const rows = parseCSV(csvText);
  const result = {};
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < 6) continue;
    const ticker = (r[1] || '').trim();
    if (!ticker) continue;
    const priceEur = parseItalianNumber(r[5]);
    const priceRaw = parseItalianNumber(r[2]);
    const currency = (r[4] || '').trim();
    const dateStr = r[3];
    if (priceEur && priceEur > 0) {
      result[ticker] = {
        price: priceEur,
        priceRaw,
        currency,
        timestamp: dateStr ? Date.parse(parseItalianDate(dateStr) || '') || Date.now() : Date.now(),
      };
    }
  }
  return result;
}

// -------------------------------------------------------------------------
// PARSE HISTORY SHEET
// -------------------------------------------------------------------------
// Foglio "history" — struttura attesa:
//   col 0: Date VWCE     col 1: Close VWCE (EUR)
//   col 2: vuota
//   col 3: Date CNDX     col 4: Close CNDX (USD)
//   col 5: Currency      col 6: Close CNDX (EUR convertito)
function parseHistorySheet(csvText) {
  const rows = parseCSV(csvText);
  const vwce = [], cndx = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;

    // VWCE: col 0 = data, col 1 = close in EUR
    const dV = parseItalianDate(r[0]);
    const cV = parseItalianNumber(r[1]);
    if (dV && cV && cV > 0) vwce.push({ date: dV, close: cV });

    // CNDX: col 3 = data, col 6 = close EUR (preferito) o col 4 = USD raw
    const dC = parseItalianDate(r[3]);
    let cC = null;
    if (r.length >= 7) cC = parseItalianNumber(r[6]);
    if ((!cC || cC <= 0) && r.length >= 5) cC = parseItalianNumber(r[4]);
    if (dC && cC && cC > 0) cndx.push({ date: dC, close: cC });
  }
  return {
    'VWCE.MI': vwce,
    'CSNDX.MI': cndx,
  };
}

// -------------------------------------------------------------------------
// CACHE
// -------------------------------------------------------------------------
let _fetchPromise = null;

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

export function getCacheAgeHours() {
  const ts = parseInt(safeStorage.get(CACHE_TIMESTAMP_KEY) || '0', 10);
  if (!ts) return null;
  return ((Date.now() - ts) / 3600000).toFixed(1);
}

export function getDataJsonAge() { return getCacheAgeHours(); }

// -------------------------------------------------------------------------
// FETCH DEDUPLICATO
// -------------------------------------------------------------------------
async function fetchAllSheets(forceRefresh = false) {
  if (!forceRefresh) {
    const cached = getCachedPrices();
    const cachedHist = getCachedHistory();
    if (cached && cachedHist) return { current: cached, history: cachedHist };
  }

  if (_fetchPromise) return _fetchPromise;

  _fetchPromise = (async () => {
    let result = { current: {}, history: { 'VWCE.MI': [], 'CSNDX.MI': [] } };
    try {
      const [currentText, historyText] = await Promise.all([
        fetchCSV(SHEETS_URLS.current, { bust: forceRefresh }),
        fetchCSV(SHEETS_URLS.history, { bust: forceRefresh }),
      ]);
      result.current = parseCurrentSheet(currentText);
      result.history = parseHistorySheet(historyText);

      if (Object.keys(result.current).length > 0) {
        safeStorage.set(CACHE_KEY, JSON.stringify(result.current));
        safeStorage.set(CACHE_TIMESTAMP_KEY, String(Date.now()));
      }
      if ((result.history['VWCE.MI']?.length || 0) > 0) {
        safeStorage.set(HISTORY_CACHE_KEY, JSON.stringify(result.history));
        safeStorage.set(HISTORY_CACHE_TS_KEY, String(Date.now()));
      }
    } catch (err) {
      console.warn('[priceProvider v3.1] Sheets fetch failed:', err.message);
      // Fallback su cache anche scaduta
      try {
        const oldCached = JSON.parse(safeStorage.get(CACHE_KEY) || '{}');
        const oldHist = JSON.parse(safeStorage.get(HISTORY_CACHE_KEY) || '{"VWCE.MI":[],"CSNDX.MI":[]}');
        result.current = oldCached;
        result.history = oldHist;
      } catch {}
    } finally {
      _fetchPromise = null;
    }
    return result;
  })();

  return _fetchPromise;
}

// -------------------------------------------------------------------------
// MANUAL OVERRIDES
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
  // Considera tutti i ticker noti (allocation + legacy)
  const allTickers = Object.values(ISIN_TO_TICKER);
  return allTickers.some(t => manuals[t]?.price > 0);
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

  // 2. Google Sheets
  const sheets = await fetchAllSheets(forceRefresh);
  if (sheets.current?.[ticker]?.price > 0) {
    const p = sheets.current[ticker];
    return {
      ticker, price: p.price,
      source: 'sheets-auto', timestamp: p.timestamp,
      currency: p.currency, priceRaw: p.priceRaw,
    };
  }

  // 3. Fallback null → portfolioEngine userà currentPriceFallback dal config
  return { ticker, price: null, source: 'fallback' };
}

/**
 * Ritorna prezzi per TUTTI gli ETF noti (allocation + legacy).
 * Lookup avviene per ticker .MI (es. 'VWCE.MI', 'CSPX.MI').
 */
export async function getAllPrices(forceRefresh = false) {
  // Costruisce lista completa da TUTTI gli initialHoldings, mappando ISIN → ticker
  const allTickers = new Set();

  // Aggiungi ticker da config.allocation (target)
  config.allocation.forEach(a => allTickers.add(a.ticker));

  // Aggiungi ticker da initialHoldings (legacy + target) via ISIN map
  (config.initialHoldings || []).forEach(h => {
    const ticker = ISIN_TO_TICKER[h.isin];
    if (ticker) allTickers.add(ticker);
  });

  const tickerArray = Array.from(allTickers);
  const results = await Promise.all(tickerArray.map(t => getPriceFor(t, { forceRefresh })));
  return results.reduce((acc, r) => { acc[r.ticker] = r; return acc; }, {});
}

/**
 * Ritorna lo storico per un ticker (VWCE.MI o CSNDX.MI supportati).
 * Per altri ticker ritorna data: null.
 */
export async function getHistoricalPrices(ticker, daysBack = 252) {
  const sheets = await fetchAllSheets(false);
  const series = sheets.history?.[ticker];
  if (series && series.length > 0) {
    return { ticker, data: series.slice(-daysBack), source: 'sheets-auto' };
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

// Compat stubs
export function setApiKey() {}
export function getApiKey() { return ''; }
