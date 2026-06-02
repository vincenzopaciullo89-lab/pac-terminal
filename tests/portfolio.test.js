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

describe('computePriceMetrics — schema dd (Task A.2 + Task D)', () => {
  // Task A.2: il vecchio campo `ddATH` era stato rinominato in `dd252D` perché
  // la finestra disponibile era rolling 252g, non vero ATH.
  // Task D: con history estesa (period="max"), `ddATH_real` è di nuovo
  // calcolabile ed è il trigger primario del sistema tattico — esposto come
  // `ddATH` accanto a `peakATH`. dd252D resta come indicatore secondario.
  test('return contiene sia dd252D sia ddATH (Task D — history estesa)', () => {
    const m = computePriceMetrics(syntheticHistory(252), 400);
    assert.ok('dd252D' in m, 'campo dd252D mancante');
    assert.ok('high252D' in m, 'campo high252D mancante');
    assert.ok('ddATH' in m, 'campo ddATH atteso (Task D)');
    assert.ok('peakATH' in m, 'campo peakATH atteso (Task D)');
  });
});
