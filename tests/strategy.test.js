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

describe('determineTier: moltiplicatori post-A.1 (cap €1.000 rispettato)', () => {
  // Ridistribuzione introdotta dal fix A.1: T4 portato da 2.5x a 2.0x per
  // rispettare il cap stretto €1.000/mese. Numeri di lavoro: ulteriori
  // calibrazioni arriveranno dal backtest (Task Group D).
  test('T0 multiplier = 1.0', () => assert.equal(determineTier(-0.02).multiplier, 1.0));
  test('T1 multiplier = 1.1', () => assert.equal(determineTier(-0.07).multiplier, 1.1));
  test('T2 multiplier = 1.3', () => assert.equal(determineTier(-0.12).multiplier, 1.3));
  test('T3 multiplier = 1.6', () => assert.equal(determineTier(-0.20).multiplier, 1.6));
  test('T4 multiplier = 2.0', () => assert.equal(determineTier(-0.30).multiplier, 2.0));
});

describe('Cap operativo €1.000/mese', () => {
  test('Nessun tier configurato supera €1.000 totali', () => {
    const base = config.pac.baseMonthlyAmount;
    for (const t of config.strategyTiers) {
      const totale = t.multiplier * base;
      assert.ok(
        totale <= 1000,
        `Tier ${t.tier} (${t.label}): ${t.multiplier}x × €${base} = €${totale} > cap €1.000`,
      );
    }
  });
});
