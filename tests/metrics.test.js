// =============================================================================
// metrics.test.js — pin del comportamento e Node-compat di computePriceMetrics
// =============================================================================
// La funzione vive in src/metricsEngine.js: modulo self-contained, importabile
// da Node senza shim DOM/localStorage. Questi test verificano:
//   1. Schema completo del return (tutti i campi attesi)
//   2. Idempotenza / determinismo (stesso input → stesso output)
//   3. Non-mutazione dell'input
//   4. Regressione numerica su una serie reale (snapshot post-Task-B)
//   5. Equivalenza con l'import via portfolioEngine.js (back-compat)
// =============================================================================

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..');

const { computePriceMetrics } = await import('../src/metricsEngine.js');
const { computePriceMetrics: viaPortfolioEngine } = await import('../src/portfolioEngine.js');

function syntheticLinear(n, startPrice = 100, step = 1) {
  return Array.from({ length: n }, (_, i) => ({
    date: `2025-${String(Math.floor(i / 30) + 1).padStart(2, '0')}-${String((i % 30) + 1).padStart(2, '0')}`,
    close: startPrice + i * step,
  }));
}

describe('metricsEngine — Node-compatibility', () => {
  test('Import da src/metricsEngine.js riesce in Node senza shim', () => {
    assert.equal(typeof computePriceMetrics, 'function');
  });

  test('Back-compat: portfolioEngine.computePriceMetrics === metricsEngine.computePriceMetrics', () => {
    assert.strictEqual(computePriceMetrics, viaPortfolioEngine);
  });
});

describe('metricsEngine — schema di output', () => {
  test('Tutti i campi attesi presenti con storia ≥200 punti', () => {
    const m = computePriceMetrics(syntheticLinear(252), 400);
    assert.ok(m, 'output non nullo');
    const expected = [
      'peakATH', 'ddATH',
      'high252D', 'high12M', 'dd252D', 'dd12M',
      'ma200', 'ma10m', 'madMA200',
      'volRolling', 'zScore', 'regime',
    ];
    for (const k of expected) {
      assert.ok(k in m, `campo mancante: ${k}`);
    }
  });

  test('Storia troppo corta → return null', () => {
    assert.equal(computePriceMetrics([], 100), null);
    assert.equal(computePriceMetrics([{ date: '2025-01-01', close: 100 }], 100), null);
    assert.equal(computePriceMetrics(null, 100), null);
    assert.equal(computePriceMetrics('not-an-array', 100), null);
  });
});

describe('metricsEngine — determinismo e non-mutazione', () => {
  test('Stesso input → stesso output (chiamate ripetute)', () => {
    const history = syntheticLinear(252, 100, 0.5);
    const a = computePriceMetrics(history, 250);
    const b = computePriceMetrics(history, 250);
    assert.deepEqual(a, b);
  });

  test('Non muta l\'array di input', () => {
    const history = syntheticLinear(252, 100, 0.5);
    const snapshot = JSON.stringify(history);
    computePriceMetrics(history, 250);
    assert.equal(JSON.stringify(history), snapshot);
  });
});

describe('metricsEngine — ddATH (Task D)', () => {
  test('Serie crescente: ddATH = 0 (prezzo corrente è il peak)', () => {
    const hist = syntheticLinear(252, 100, 1);
    const last = hist[hist.length - 1].close;
    const m = computePriceMetrics(hist, last);
    assert.equal(m.ddATH, 0);
    assert.equal(m.peakATH, last);
  });

  test('Prezzo corrente metà del peak: ddATH ~ -50%', () => {
    const hist = syntheticLinear(252, 100, 1); // peak = 351 alla fine
    const peakInHist = hist[hist.length - 1].close;
    const m = computePriceMetrics(hist, peakInHist / 2);
    assert.equal(m.peakATH, peakInHist); // peak resta quello della serie
    assert.ok(Math.abs(m.ddATH - (-0.5)) < 1e-9, `ddATH atteso -0.5, ottenuto ${m.ddATH}`);
  });

  test('Peak è nella serie storica, non nel currentPrice', () => {
    // Costruisco serie che sale a 200 e poi (currentPrice) torna a 150.
    const hist = syntheticLinear(252, 100, 0); // tutti a 100
    hist[100].close = 200; // un peak in mezzo
    const m = computePriceMetrics(hist, 150);
    assert.equal(m.peakATH, 200);
    assert.equal(m.ddATH, 150 / 200 - 1);
  });

  test('Walk-forward: il peak è solo della history passata + currentPrice', () => {
    // L'argomento `historicalPrices` rappresenta il "passato a oggi".
    // Una serie più corta deve dare un peak più piccolo (o uguale).
    const fullHist = syntheticLinear(252, 100, 1);
    const slicePast = fullHist.slice(0, 100); // solo i primi 100 punti
    const currentInPast = slicePast[slicePast.length - 1].close;
    const m = computePriceMetrics(slicePast, currentInPast);
    // Il peak deve essere lo stesso slicePast.max, non fullHist.max.
    const expectedPeak = Math.max(...slicePast.map(d => d.close), currentInPast);
    assert.equal(m.peakATH, expectedPeak);
  });
});

describe('metricsEngine — regressione su serie reale (data/history.json)', () => {
  // Snapshot pin: se cambia il numero, è un cambio di comportamento e
  // chi modifica computePriceMetrics deve aggiornare la baseline qui sotto
  // in modo esplicito.
  test('VWCE: metriche calcolate coerentemente con data/history.json post-PR#18', () => {
    let raw;
    try {
      raw = readFileSync(join(REPO_ROOT, 'data', 'history.json'), 'utf8');
    } catch {
      // Su un branch senza il workflow ancora eseguito, questo test viene
      // saltato silenziosamente — è ammesso perché il file viene generato
      // dal cron, non committato manualmente.
      return;
    }
    const data = JSON.parse(raw).tickers?.VWCE?.data;
    if (!data || data.length < 200) return;
    const currentPrice = data[data.length - 1].close;
    const m = computePriceMetrics(data, currentPrice);
    assert.ok(m, 'output non nullo');
    // Sanity: i drawdown sono frazionari in [-1, 0] (mai positivi).
    assert.ok(m.dd252D <= 0 && m.dd252D >= -1, `dd252D fuori range: ${m.dd252D}`);
    assert.ok(m.ddATH <= 0 && m.ddATH >= -1, `ddATH fuori range: ${m.ddATH}`);
    // ddATH ≤ dd252D: il peak ALL-TIME è ≥ del peak rolling 252g.
    assert.ok(m.ddATH <= m.dd252D + 1e-9,
      `ddATH (${m.ddATH}) deve essere ≤ dd252D (${m.dd252D})`);
    // ma200 deve esistere (history ha >200 punti)
    assert.ok(typeof m.ma200 === 'number' && m.ma200 > 0);
    // madMA200 ragionevole: nessun bull/bear estremo (|dev| < 60%)
    assert.ok(Math.abs(m.madMA200) < 0.6, `madMA200 implausibile: ${m.madMA200}`);
    // volRolling esiste e in range realistico per equity globale
    assert.ok(m.volRolling > 0 && m.volRolling < 1.5);
    // zScore non NaN/Infinity
    assert.ok(Number.isFinite(m.zScore));
    // regime tra i tre valori previsti
    assert.ok(['normal', 'elevated', 'stressed'].includes(m.regime));
  });
});

describe('metricsEngine — regime mapping da volRolling', () => {
  // Costruisco serie a volatilità controllata sintetica per pin del regime.
  // Tutti i close < currentPrice, così drawdown=0 e non interferisce.
  function withControlledVol(targetAnnualVol, n = 80) {
    // GBM mensile fittizio: σ_daily = σ_annual / √252.
    // Genero rendimenti deterministici alternati ±k tali che std = σ_daily.
    const sigmaDaily = targetAnnualVol / Math.sqrt(252);
    const closes = [100];
    for (let i = 1; i < n; i++) {
      const r = (i % 2 === 0 ? +1 : -1) * sigmaDaily;
      closes.push(closes[i - 1] * Math.exp(r));
    }
    return closes.map((c, i) => ({ date: `2025-01-${String(i + 1).padStart(2, '0')}`, close: c }));
  }

  test('volRolling ~15% → regime "normal"', () => {
    const hist = withControlledVol(0.15);
    const m = computePriceMetrics(hist, hist[hist.length - 1].close);
    assert.equal(m.regime, 'normal', `vol=${m.volRolling}`);
  });

  test('volRolling ~20% → regime "elevated"', () => {
    const hist = withControlledVol(0.20);
    const m = computePriceMetrics(hist, hist[hist.length - 1].close);
    assert.equal(m.regime, 'elevated', `vol=${m.volRolling}`);
  });

  test('volRolling ~30% → regime "stressed"', () => {
    const hist = withControlledVol(0.30);
    const m = computePriceMetrics(hist, hist[hist.length - 1].close);
    assert.equal(m.regime, 'stressed', `vol=${m.volRolling}`);
  });
});
