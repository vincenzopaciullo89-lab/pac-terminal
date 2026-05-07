// =============================================================================
// PRICE PROVIDER v3 — Google Sheets CSV (FINAL)
// =============================================================================
// Strategia 4-livelli (in ordine di priorità):
//   1. Manual override (l'utente ha l'ultima parola)
//   2. Google Sheets CSV pubblicato (fonte automatica primaria)
//   3. Cache localStorage (offline fallback, valida 24h)
//   4. Fallback statico (currentPriceFallback in config.js)
//
// I CSV vengono pubblicati da un Google Sheet con formule GOOGLEFINANCE().
// Locale italiano: separatore decimale = "," | separatore colonne = ","
// Conflitto risolto da Google Sheets quotando i numeri con virgola: "158,64"
// =============================================================================

import { config } from './config.js';

// -------------------------------------------------------------------------
// CONFIGURAZIONE FONTI
// -------------------------------------------------------------------------
const SHEETS_URLS = {
  current: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSA078B6Q5XKyReR0tAjNT5hDEuE4RQSoAdEsa3t9KWSzjfYE2S4OtJ3wazmvU7gMnYveo2OIB0wAFs/pub?gid=0&single=true&output=csv',
  history: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSA078B6Q5XKyReR0tAjNT5hDEuE4RQSoAdEsa3t9KWSzjfYE2S4OtJ3wazmvU7gMnYveo2OIB0wAFs/pub?gid=1714634805&single=true&output=csv',
};

const CACHE_KEY = 'pd_prices_v3';
const CACHE_TIMESTAMP_KEY = 'pd_prices_ts_v3';
const HISTORY_CACHE_KEY = 'pd_history_v3';
const HISTORY_CACHE_TS_KEY = 'pd_history_ts_v3';
const MANUAL_OVERRIDE_KEY = 'pd_manual_prices_v2';

const CACHE_HOURS = 6;          // refresh ogni 6h
const FETCH_TIMEOUT_MS = 10000; // 10s timeout per CSV fetch

// -------------------------------------------------------------------------
// SAFE STORAGE (Safari Private Mode-safe)
// -------------------------------------------------------------------------
const safeStorage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, val) { try { localStorage.setItem(key, val); return true; } catch { return false; } },
  remove(key) { try { localStorage.removeItem(key); } catch {} },
};

// -------------------------------------------------------------------------
// CSV PARSER
// -------------------------------------------------------------------------
/**
 * Parser CSV robusto con supporto a quote escapate.
 * Gestisce: separatore virgola, valori quotati con virgolette, \r\n e \n.
 */
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuote = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQuote) {
      if (c === '"') {
        // Quote escape: ""
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuote = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuote = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; } // ignora CR, gestiamo solo LF
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

/**
 * Converte stringa numerica italiana → numero JS.
 *   "158,64"        → 158.64
 *   "1.398,42"      → 1398.42
 *   "€ 158,64"      → 158.64
 *   "€ 1.398,42"    → 1398.42
 *   "10363,9"       → 10363.9
 *   ""              → null
 */
function parseItalianNumber(s) {
  if (!s || typeof s !== 'string') return null;
  let cleaned = s.trim();
  if (!cleaned) return null;

  // Rimuove simbolo €, spazi, NBSP
  cleaned = cleaned.replace(/[€\s\u00A0]/g, '');

  // Se contiene virgola: probabile decimale italiano
  // Punti = separatori migliaia → da rimuovere
  // Virgola = separatore decimale → da convertire in punto
  if (cleaned.includes(',')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  }
  // Se non contiene virgola ma contiene punto, è già decimale stile inglese
  // o numero senza decimali con separatore migliaia (raro qui)

  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

/**
 * Parser data italiana → ISO yyyy-mm-dd
 *   "22/04/2025 17.26.00" → "2025-04-22"
 *   "07/05/2026 10.14.36" → "2026-05-07"
 */
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
async function fetchCSV(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
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
/**
 * Foglio "current" — struttura attesa:
 *   col 0: # (numero riga)
 *   col 1: ETF (es. "VWCE.MI")
 *   col 2: P in valuta originale (raw price)
 *   col 3: Date (timestamp)
 *   col 4: Currency (EUR/USD/GBP/GBp)
 *   col 5: P in EUR (prezzo convertito)
 *
 * Ritorna: { "VWCE.MI": {price, currency, timestamp}, ... }
 */
function parseCurrentSheet(csvText) {
  const rows = parseCSV(csvText);
  const result = {};
  // Riga 0 = header. Inizio da riga 1.
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
/**
 * Foglio "history" — struttura attesa:
 *   col 0: Date VWCE       col 1: Close VWCE (EUR)
 *   col 2: vuota (buffer)
 *   col 3: Date CNDX       col 4: Close CNDX (USD raw)
 *   col 5: Currency (USD)  col 6: EUR (close convertito a tasso fisso)
 *
 * Ritorna: { "VWCE.MI": [{date, close}, ...], "CSNDX.MI": [{date, close}, ...] }
 */
function parseHistorySheet(csvText) {
  const rows = parseCSV(csvText);
  const vwce = [];
  const cndx = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;

    // VWCE: col 0 = data, col 1 = close in EUR
    const dV = parseItalianDate(r[0]);
    const cV = parseItalianNumber(r[1]);
    if (dV && cV && cV > 0) vwce.push({ date: dV, close: cV });

    // CNDX: col 3 = data, col 6 = close in EUR (già convertito da formula sheet)
    const dC = parseItalianDate(r[3]);
    const cC = parseItalianNumber(r[6]);
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
let _currentCache = null;
let _historyCache = null;
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
// FETCH PRINCIPALE (deduplicato)
// -------------------------------------------------------------------------
async function fetchAllSheets(forceRefresh = false) {
  // Cache hit?
  if (!forceRefresh) {
    const cached = getCachedPrices();
    const cachedHist = getCachedHistory();
    if (cached && cachedHist) {
      _currentCache = cached;
      _historyCache = cachedHist;
      return { current: cached, history: cachedHist };
    }
  }

  // Dedupe richieste concorrenti
  if (_fetchPromise) return _fetchPromise;

  _fetchPromise = (async () => {
    const result = { current: {}, history: { 'VWCE.MI': [], 'CSNDX.MI': [] } };
    try {
      const [currentText, historyText] = await Promise.all([
        fetchCSV(SHEETS_URLS.current),
        fetchCSV(SHEETS_URLS.history),
      ]);
      result.current = parseCurrentSheet(currentText);
      result.history = parseHistorySheet(historyText);

      // Salva in cache solo se almeno un ticker è presente
      if (Object.keys(result.current).length > 0) {
        safeStorage.set(CACHE_KEY, JSON.stringify(result.current));
        safeStorage.set(CACHE_TIMESTAMP_KEY, String(Date.now()));
      }
      if ((result.history['VWCE.MI']?.length || 0) > 0) {
        safeStorage.set(HISTORY_CACHE_KEY, JSON.stringify(result.history));
        safeStorage.set(HISTORY_CACHE_TS_KEY, String(Date.now()));
      }

      _currentCache = result.current;
      _historyCache = result.history;
    } catch (err) {
      console.warn('[priceProvider] Sheets fetch failed:', err.message);
      // Fallback su cache anche scaduta
      const oldCached = (() => { try { return JSON.parse(safeStorage.get(CACHE_KEY) || '{}'); } catch { return {}; } })();
      const oldHist = (() => { try { return JSON.parse(safeStorage.get(HISTORY_CACHE_KEY) || '{}'); } catch { return {}; } })();
      result.current = oldCached;
      result.history = oldHist || { 'VWCE.MI': [], 'CSNDX.MI': [] };
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
  const tickers = config.allocation.map(a => a.ticker);
  return tickers.some(t => manuals[t]?.price > 0);
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

export async function getAllPrices(forceRefresh = false) {
  await fetchAllSheets(forceRefresh);
  const tickers = config.allocation.map(a => a.ticker);
  // Includi anche tutti gli ISIN delle posizioni legacy
  const legacyTickers = (config.initialHoldings || [])
    .map(h => h.isin)
    .filter(isin => !config.allocation.find(a => a.isin === isin));
  // Per le legacy, costruisci un mapping ISIN→ticker (es. IE00B5BMR087 → CSPX.MI)
  // Qui usiamo direttamente i ticker dal Sheet che usa il formato "XXXX.MI"
  const allTickers = [...tickers];
  // Tickers legacy attesi nel Sheet (devono corrispondere ai ticker del config foglio current)
  const legacyTickerMap = {
    'IE00B5BMR087': 'CSPX.MI',
    'IE00B4L5Y983': 'SWDA.MI',
    'IE00BH04GL39': 'VETA.MI',
  };
  for (const isin of legacyTickers) {
    const t = legacyTickerMap[isin];
    if (t && !allTickers.includes(t)) allTickers.push(t);
  }

  const results = await Promise.all(allTickers.map(t => getPriceFor(t, { forceRefresh })));
  return results.reduce((acc, r) => { acc[r.ticker] = r; return acc; }, {});
}

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
  _currentCache = null;
  _historyCache = null;
}

// Compat stubs (ex Twelve Data, mantenuti per import safety)
export function setApiKey() {}
export function getApiKey() { return ''; }
