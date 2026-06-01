// =============================================================================
// priceProvider.test.js — refactor B.4 (JSON statici)
// =============================================================================
// Verifica che la trasformazione dello schema /data/prices.json prodotto dal
// cron arrivi al resto del codice nel formato canonico (dict ticker→prezzo EUR).
// Le funzioni di rete (fetchJson) sono stubbate via globalThis.fetch.
// =============================================================================

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Stub di ambiente browser (localStorage minimale + fetch in-memory)
globalThis.localStorage = (() => {
  const store = {};
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
})();

let _fetchMocks = {};
globalThis.fetch = async (url) => {
  const mock = _fetchMocks[url];
  if (!mock) return { ok: false, status: 404, async json() { return {}; } };
  if (mock.throw) throw mock.throw;
  return { ok: true, status: 200, async json() { return mock.body; } };
};

function setFetchMock(url, body) {
  _fetchMocks[url] = { body };
}

const pp = await import('../src/priceProvider.js');

// -----------------------------------------------------------------------------
// transform helpers (puri, indipendenti da fetch/localStorage)
// -----------------------------------------------------------------------------
describe('transformPricesJson', () => {
  test('shape canonica: byTicker keyed by ticker .MI, prezzo in EUR', () => {
    const raw = {
      updated_at: '2026-05-19T07:30:00+00:00',
      fx_rates: { EURGBP: 0.8657 },
      current: {
        VWCE:  { price_native: 158.18, price_eur: 158.18, currency: 'EUR', source: 'yfinance' },
        VETA:  { price_native: 20.5653, price_eur: 23.75, currency: 'GBP', source: 'yfinance', needs_fx: true },
      },
      sources_used: { VWCE: 'yfinance', VETA: 'yfinance' },
    };
    const out = pp.transformPricesJson(raw);
    assert.ok(out.byTicker['VWCE.MI'], 'VWCE.MI presente');
    assert.equal(out.byTicker['VWCE.MI'].price, 158.18);
    assert.equal(out.byTicker['VWCE.MI'].currency, 'EUR');
    assert.equal(out.byTicker['VWCE.MI'].source, 'data-json');
    assert.equal(out.byTicker['VWCE.MI'].sourceUpstream, 'yfinance');

    assert.ok(out.byTicker['VETA.MI'], 'VETA mappato a VETA.MI');
    assert.equal(out.byTicker['VETA.MI'].price, 23.75, 'price = price_eur (canonico EUR)');
    assert.equal(out.byTicker['VETA.MI'].priceRaw, 20.5653);
    assert.equal(out.byTicker['VETA.MI'].currency, 'GBP');

    assert.equal(out._meta.fx_rates.EURGBP, 0.8657);
    assert.ok(out._meta.updated_ms > 0);
  });

  test('scarta entries senza price_eur valido', () => {
    const raw = { current: { VWCE: { price_eur: 0, source: 'yfinance' } } };
    const out = pp.transformPricesJson(raw);
    assert.equal(out.byTicker['VWCE.MI'], undefined);
  });

  test('ignora nomi non mappati', () => {
    const raw = { current: { UNKNOWN: { price_eur: 100, source: 'yfinance' } } };
    const out = pp.transformPricesJson(raw);
    assert.deepEqual(Object.keys(out.byTicker), []);
  });
});

describe('transformHistoryJson', () => {
  test('mappa NAME → ticker .MI e preserva la serie', () => {
    const raw = {
      updated_at: '2026-05-19T07:30:00+00:00',
      tickers: {
        VWCE:  { source: 'yfinance', data: [{ date: '2025-01-01', close: 130 }, { date: '2025-01-02', close: 131 }] },
        CSNDX: { source: 'yfinance', data: [] },
      },
    };
    const out = pp.transformHistoryJson(raw);
    assert.equal(out.byTicker['VWCE.MI'].length, 2);
    assert.equal(out.byTicker['VWCE.MI'][1].close, 131);
    assert.deepEqual(out.byTicker['CSNDX.MI'], []);
  });
});

// -----------------------------------------------------------------------------
// API pubblica end-to-end (con fetch stubbato)
// -----------------------------------------------------------------------------
describe('getAllPrices con /data/prices.json stubbato', () => {
  test('ritorna dict per ticker .MI con price EUR', async () => {
    pp.clearAllCache();
    setFetchMock('data/prices.json', {
      updated_at: new Date().toISOString(),
      fx_rates: { EURGBP: 0.86 },
      current: {
        VWCE:  { price_native: 158, price_eur: 158, currency: 'EUR', source: 'yfinance' },
        CSNDX: { price_native: 1420, price_eur: 1420, currency: 'EUR', source: 'yfinance' },
        CSPX:  { price_native: 612, price_eur: 612, currency: 'EUR', source: 'yfinance' },
        SWDA:  { price_native: 120, price_eur: 120, currency: 'EUR', source: 'yfinance' },
        VETA:  { price_native: 20.5, price_eur: 23.84, currency: 'GBP', source: 'yfinance' },
      },
      sources_used: {},
    });
    const prices = await pp.getAllPrices(true);
    assert.equal(prices['VWCE.MI'].price, 158);
    assert.equal(prices['VETA.MI'].price, 23.84);
    assert.equal(prices['CSPX.MI'].price, 612);
  });
});

describe('isDataStale', () => {
  test('età ≤24h → non stantio', async () => {
    pp.clearAllCache();
    setFetchMock('data/prices.json', {
      updated_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
      current: { VWCE: { price_eur: 158, currency: 'EUR', source: 'yfinance' } },
    });
    await pp.getAllPrices(true);
    assert.equal(pp.isDataStale(), false);
  });

  test('età >24h → stantio', async () => {
    pp.clearAllCache();
    setFetchMock('data/prices.json', {
      updated_at: new Date(Date.now() - 30 * 3600 * 1000).toISOString(),
      current: { VWCE: { price_eur: 158, currency: 'EUR', source: 'yfinance' } },
    });
    await pp.getAllPrices(true);
    assert.equal(pp.isDataStale(), true);
  });

  test('nessun dato → stantio (true)', () => {
    pp.clearAllCache();
    assert.equal(pp.isDataStale(), true);
  });
});

describe('Fallback quando /data/prices.json non disponibile', () => {
  test('getAllPrices con fetch 404 → prezzi null, source=fallback', async () => {
    pp.clearAllCache();
    _fetchMocks = {};  // tutti i fetch falliscono
    const prices = await pp.getAllPrices(true);
    // Tutti i ticker ritornano price=null, source='fallback' (no sheets nel browser)
    for (const ticker of Object.keys(prices)) {
      assert.equal(prices[ticker].source, 'fallback', `${ticker}: source corretto`);
      assert.equal(prices[ticker].price, null, `${ticker}: price null`);
    }
  });
});

describe('Manual override ha priorità su /data/prices.json', () => {
  test('setManualPrice → getPriceFor ritorna override', async () => {
    pp.clearAllCache();
    pp.clearManualPrices();
    setFetchMock('data/prices.json', {
      updated_at: new Date().toISOString(),
      current: { VWCE: { price_eur: 158, currency: 'EUR', source: 'yfinance' } },
    });
    pp.setManualPrice('VWCE.MI', 200);
    const result = await pp.getPriceFor('VWCE.MI');
    assert.equal(result.source, 'manual');
    assert.equal(result.price, 200);
    pp.clearManualPrices();
  });
});

describe('getTickerForISIN / getISINForTicker (invariate)', () => {
  test('VWCE: ISIN ↔ ticker', () => {
    assert.equal(pp.getTickerForISIN('IE00BK5BQT80'), 'VWCE.MI');
    assert.equal(pp.getISINForTicker('VWCE.MI'), 'IE00BK5BQT80');
  });
  test('Ticker ignoto → null', () => {
    assert.equal(pp.getTickerForISIN('NOPE'), null);
    assert.equal(pp.getISINForTicker('NOPE'), null);
  });
});
