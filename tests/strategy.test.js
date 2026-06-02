// =============================================================================
// strategy.test.js — pin del comportamento di determineTier (Task D)
// =============================================================================
// Eseguibile con `npm test` (node --test).
//
// Scopo: bloccare la mappatura ddATH → tier e gli importi configurati in
// `config.strategyTiers`, così che ogni modifica ai numeri richieda
// l'aggiornamento esplicito di questo file.
//
// Regola minima 2-soglie (Task D, vedi docs/TASK_D_BACKTEST.md):
//   ddATH > -10%        → T0 (Normal)   → €500
//   ddATH ∈ [-20%, -10%] → T1 (Boost +50%) → €750  (boost 100% VWCE)
//   ddATH ≤ -20%        → T2 (Boost +100%) → €1.000 (boost 100% VWCE)
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

describe('determineTier: mappatura ddATH → tier', () => {
  test('ddATH > -10% → T0 (Normal)', () => {
    assert.equal(determineTier(0.10).tier, 0);
    assert.equal(determineTier(-0.02).tier, 0);
    assert.equal(determineTier(-0.0999).tier, 0);
  });

  test('ddATH ∈ [-20%, -10%] → T1 (Boost +50%)', () => {
    assert.equal(determineTier(-0.10).tier, 1);
    assert.equal(determineTier(-0.15).tier, 1);
    assert.equal(determineTier(-0.1999).tier, 1);
  });

  test('ddATH ≤ -20% → T2 (Boost +100%)', () => {
    assert.equal(determineTier(-0.20).tier, 2);
    assert.equal(determineTier(-0.30).tier, 2);
    assert.equal(determineTier(-0.50).tier, 2);
  });

  test('ddATH null/NaN → T0 (fail-safe)', () => {
    assert.equal(determineTier(null).tier, 0);
    assert.equal(determineTier(undefined).tier, 0);
    assert.equal(determineTier(NaN).tier, 0);
  });
});

describe('determineTier: importi e allocazione boost (Task D)', () => {
  test('T0 → €500 totale, no boost, allocationBoost null', () => {
    const t = determineTier(-0.02);
    assert.equal(t.totalAmount, 500);
    assert.equal(t.boostAmount, 0);
    assert.equal(t.allocationBoost, null);
  });

  test('T1 → €750 totale, +€250 boost, 100% VWCE', () => {
    const t = determineTier(-0.12);
    assert.equal(t.totalAmount, 750);
    assert.equal(t.boostAmount, 250);
    assert.equal(t.allocationBoost, 'VWCE');
  });

  test('T2 → €1.000 totale, +€500 boost, 100% VWCE', () => {
    const t = determineTier(-0.25);
    assert.equal(t.totalAmount, 1000);
    assert.equal(t.boostAmount, 500);
    assert.equal(t.allocationBoost, 'VWCE');
  });
});

describe('Cap operativo €1.000/mese (L2 — test strutturale)', () => {
  test('Nessun tier configurato supera €1.000 totali', () => {
    const base = config.pac.baseMonthlyAmount;
    for (const t of config.strategyTiers) {
      assert.ok(
        t.totalAmount <= 1000,
        `Tier ${t.tier} (${t.label}): totalAmount €${t.totalAmount} > cap €1.000`,
      );
      // Coerenza interna: boost = total - base.
      assert.equal(
        t.boostAmount, t.totalAmount - base,
        `Tier ${t.tier}: boostAmount (${t.boostAmount}) != totalAmount - base (${t.totalAmount - base})`,
      );
    }
  });

  test('Allocazione boost: T0 null, T≥1 sempre VWCE (no tilt Nasdaq nei drawdown)', () => {
    for (const t of config.strategyTiers) {
      if (t.tier === 0) {
        assert.equal(t.allocationBoost, null,
          `T0 non deve avere allocazione boost`);
      } else {
        assert.equal(t.allocationBoost, 'VWCE',
          `T${t.tier} deve allocare boost 100% VWCE, trovato: ${t.allocationBoost}`);
      }
    }
  });
});
