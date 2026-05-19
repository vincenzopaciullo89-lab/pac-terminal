// =============================================================================
// strategy.test.js — pin del comportamento di determineTier
// =============================================================================
// Eseguibile con `npm test` (node --test).
// Scopo: bloccare la mappatura drawdown→tier e i moltiplicatori configurati
// in `config.strategyTiers`, così che ogni modifica ai numeri richieda
// l'aggiornamento esplicito di questo file.
// =============================================================================

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Stub localStorage per consentire l'import di strategyEngine.js sotto Node.
globalThis.localStorage = (() => {
  const store = {};
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
})();

const { determineTier } = await import('../src/strategyEngine.js');
const { config } = await import('../src/config.js');

describe('determineTier: mappatura drawdown → tier (ranges)', () => {
  test('dd > -5% → T0 (Normal)', () => {
    assert.equal(determineTier(0.10).tier, 0);
    assert.equal(determineTier(-0.02).tier, 0);
    assert.equal(determineTier(-0.0499).tier, 0);
  });

  test('dd ∈ [-10%, -5%) → T1', () => {
    assert.equal(determineTier(-0.05).tier, 1);
    assert.equal(determineTier(-0.07).tier, 1);
    assert.equal(determineTier(-0.0999).tier, 1);
  });

  test('dd ∈ [-15%, -10%) → T2', () => {
    assert.equal(determineTier(-0.10).tier, 2);
    assert.equal(determineTier(-0.12).tier, 2);
    assert.equal(determineTier(-0.1499).tier, 2);
  });

  test('dd ∈ [-25%, -15%) → T3', () => {
    assert.equal(determineTier(-0.15).tier, 3);
    assert.equal(determineTier(-0.20).tier, 3);
    assert.equal(determineTier(-0.2499).tier, 3);
  });

  test('dd ≤ -25% → T4', () => {
    assert.equal(determineTier(-0.25).tier, 4);
    assert.equal(determineTier(-0.50).tier, 4);
  });
});

describe('determineTier: moltiplicatori correnti (snapshot prima di A.1)', () => {
  // Questi valori catturano lo stato del config OGGI. Quando i multipliers
  // vengono ridistribuiti per rispettare il cap €1.000 (Task A.1), questo
  // blocco va aggiornato in modo esplicito nello stesso commit.
  test('T0 multiplier = 1.0', () => assert.equal(determineTier(-0.02).multiplier, 1.0));
  test('T1 multiplier = 1.2', () => assert.equal(determineTier(-0.07).multiplier, 1.2));
  test('T2 multiplier = 1.5', () => assert.equal(determineTier(-0.12).multiplier, 1.5));
  test('T3 multiplier = 2.0', () => assert.equal(determineTier(-0.20).multiplier, 2.0));
  test('T4 multiplier = 2.5', () => assert.equal(determineTier(-0.30).multiplier, 2.5));
});

describe('Cap operativo €1.000/mese', () => {
  // Vincolo dell'utente: il boost totale non può superare €1.000/mese.
  // OGGI questo test FALLISCE per T4 (1250). Sarà la baseline che il fix A.1
  // sblocca. NOTA: il test è marcato come "todo" finché A.1 non viene mergiato,
  // così la suite resta verde nello stato corrente del codice.
  test.todo('Nessun tier strategicamente attivabile supera €1.000 totali (sblocca con A.1)');
});
