// =============================================================================
// portfolio.test.js — pin di computePriceMetrics
// =============================================================================
// Concentra al momento la verifica della soglia minima per MA200 (Task A.3).
// =============================================================================

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const { computePriceMetrics } = await import('../src/portfolioEngine.js');

function syntheticHistory(n, startPrice = 100) {
  // Serie lineare crescente, deterministica.
  return Array.from({ length: n }, (_, i) => ({
    date: `2025-01-${String(i + 1).padStart(2, '0')}`,
    close: startPrice + i,
  }));
}

describe('computePriceMetrics — guardia MA200', () => {
  test('history < 200 punti → ma200 = null', () => {
    const m = computePriceMetrics(syntheticHistory(150), 250);
    assert.equal(m.ma200, null);
    assert.equal(m.madMA200, null);
  });

  test('history = 199 punti → ma200 = null (soglia esclusiva)', () => {
    const m = computePriceMetrics(syntheticHistory(199), 300);
    assert.equal(m.ma200, null);
  });

  test('history ≥ 200 punti → ma200 numerico', () => {
    const m = computePriceMetrics(syntheticHistory(252), 400);
    assert.ok(typeof m.ma200 === 'number' && m.ma200 > 0);
    assert.ok(typeof m.madMA200 === 'number');
  });
});

describe('computePriceMetrics — rinomina dd252D (Task A.2)', () => {
  test('return contiene dd252D, non più ddATH', () => {
    const m = computePriceMetrics(syntheticHistory(252), 400);
    assert.ok('dd252D' in m, 'campo dd252D mancante');
    assert.ok('high252D' in m, 'campo high252D mancante');
    assert.ok(!('ddATH' in m), 'campo ddATH non dovrebbe esistere più');
  });
});
