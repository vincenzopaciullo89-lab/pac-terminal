// =============================================================================
// drawdown_alert.test.js — Task F (T1 del test plan): unit con mock Resend
// =============================================================================
// Verifica le 4 guardie anti-rumore (G1 close confermato, G2 crossing-not-level,
// G3 isteresi, G4 stale-data), le transizioni di tier (escalation /
// de-escalation / no-change), l'aggiornamento dello stato, e il dry-run.
// =============================================================================

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Stub localStorage per importare strategyEngine→config.
globalThis.localStorage = {
  getItem: () => null, setItem: () => {}, removeItem: () => {},
};

const { runAlert, tierWithHysteresis } = await import('../scripts/drawdown_alert.js');
const { config } = await import('../src/config.js');

// Generatore di history sintetica: serie costante a `peak`, poi un singolo
// close finale a `last` (drawdown lineare). 252 close è abbastanza per
// ddATH/dd252D, sotto i 200 minimi per MA200 (volutamente, così MA200/madMA200
// saranno null e non interferiscono).
function makeHistory(peak, last, n = 252) {
  const arr = [];
  for (let i = 0; i < n - 1; i++) {
    const d = new Date(2026, 0, 1);
    d.setDate(d.getDate() + i);
    arr.push({ date: d.toISOString().slice(0, 10), close: peak });
  }
  // Ultima riga: data "ieri" rispetto a `now` di default.
  const lastDate = new Date(2026, 5, 1); // 2026-06-01 (la chiamiamo "today's history")
  arr.push({ date: lastDate.toISOString().slice(0, 10), close: last });
  return arr;
}

// Mock send: registra (subject, body, dryRun) invece di chiamare la rete.
function mockSender() {
  const calls = [];
  return {
    calls,
    fn: async (subject, body, opts = {}) => { calls.push({ subject, body, opts }); return { dryRun: !!opts.dryRun }; },
  };
}

const NOW = new Date('2026-06-02T06:30:00Z'); // mattina dopo l'ultimo close

describe('tierWithHysteresis: regole entry/exit', () => {
  const tiers = config.strategyTiers; // T0/T1/T2
  const band = 0.02;

  test('Entry: ddATH 0% → T0', () => {
    assert.equal(tierWithHysteresis(0.0, 0, tiers, band), 0);
  });
  test('Entry: ddATH -10% → T1 (al limite)', () => {
    assert.equal(tierWithHysteresis(-0.10, 0, tiers, band), 1);
  });
  test('Entry: ddATH -20% → T2 (al limite)', () => {
    assert.equal(tierWithHysteresis(-0.20, 0, tiers, band), 2);
  });
  test('Sticky T1: ddATH risale a -9% ma sotto banda (-8%) → resta T1', () => {
    assert.equal(tierWithHysteresis(-0.09, 1, tiers, band), 1);
  });
  test('Exit T1: ddATH risale a -7% (sopra -8%) → T0', () => {
    assert.equal(tierWithHysteresis(-0.07, 1, tiers, band), 0);
  });
  test('Sticky T2: ddATH risale a -19% ma sotto banda (-18%) → resta T2', () => {
    assert.equal(tierWithHysteresis(-0.19, 2, tiers, band), 2);
  });
  test('Exit T2: ddATH risale a -15% (sopra -18%) → T1, non T0 (passo di 1)', () => {
    assert.equal(tierWithHysteresis(-0.15, 2, tiers, band), 1);
  });
  test('Exit T2 → T0: ddATH risale a -5% (sopra entrambe le bande) → T0 diretto', () => {
    assert.equal(tierWithHysteresis(-0.05, 2, tiers, band), 0);
  });
  test('Escalation T1→T2 ignora isteresi (peggioramento)', () => {
    assert.equal(tierWithHysteresis(-0.22, 1, tiers, band), 2);
  });
});

describe('runAlert: transizioni di stato e mock Resend', () => {
  test('T0→T0 (ddATH -4%): nessuna email, stato invariato', async () => {
    const m = mockSender();
    const hist = makeHistory(100, 96);
    const r = await runAlert({ now: NOW, history: hist, state: { last_tier: 0 }, sendFn: m.fn });
    assert.equal(r.result, 'no_change');
    assert.equal(r.emailsSent, 0);
    assert.equal(m.calls.length, 0);
    assert.equal(r.state.last_tier, 0);
  });

  test('T0→T1 (ddATH -12%): email escalation, nuovo stato T1', async () => {
    const m = mockSender();
    const hist = makeHistory(100, 88);
    const r = await runAlert({ now: NOW, history: hist, state: { last_tier: 0 }, sendFn: m.fn });
    assert.equal(r.result, 'escalation');
    assert.equal(r.newTier, 1);
    assert.equal(m.calls.length, 1);
    assert.match(m.calls[0].subject, /T1 attivato/);
    assert.match(m.calls[0].body, /€750/);
    assert.match(m.calls[0].body, /100% VWCE/);
    assert.match(m.calls[0].body, /disciplina comportamentale/); // caveat onesto
    assert.equal(r.state.last_tier, 1);
  });

  test('T0→T2 (ddATH -25%): email escalation diretta a T2', async () => {
    const m = mockSender();
    const hist = makeHistory(100, 75);
    const r = await runAlert({ now: NOW, history: hist, state: { last_tier: 0 }, sendFn: m.fn });
    assert.equal(r.newTier, 2);
    assert.match(m.calls[0].subject, /T2 attivato/);
    assert.match(m.calls[0].body, /€1\.000|€1000/);
  });

  test('T1→T1 sticky (ddATH risale a -9%, sotto banda): nessuna email', async () => {
    const m = mockSender();
    const hist = makeHistory(100, 91);
    const r = await runAlert({ now: NOW, history: hist, state: { last_tier: 1 }, sendFn: m.fn });
    assert.equal(r.result, 'no_change');
    assert.equal(m.calls.length, 0);
    assert.equal(r.state.last_tier, 1);
  });

  test('T1→T0 de-escalation (ddATH risale a -5%): email informativa neutra', async () => {
    const m = mockSender();
    const hist = makeHistory(100, 95);
    const r = await runAlert({ now: NOW, history: hist, state: { last_tier: 1 }, sendFn: m.fn });
    assert.equal(r.result, 'deescalation');
    assert.equal(r.newTier, 0);
    assert.equal(m.calls.length, 1);
    assert.match(m.calls[0].subject, /torna a €500/);
    // Linguaggio neutro: niente market-timing.
    assert.match(m.calls[0].body, /conseguenza meccanica/);
    assert.doesNotMatch(m.calls[0].body, /pericolo finito|è passata|opportunità storica/i);
    assert.match(m.calls[0].body, /disciplina comportamentale/); // caveat anche in de-escalation
  });

  test('T2→T1 step (ddATH risale a -15%): scende di un livello, non a T0', async () => {
    const m = mockSender();
    const hist = makeHistory(100, 85);
    const r = await runAlert({ now: NOW, history: hist, state: { last_tier: 2 }, sendFn: m.fn });
    assert.equal(r.newTier, 1);
    assert.equal(r.result, 'deescalation');
    assert.match(m.calls[0].subject, /torna a €750/);
  });
});

describe('runAlert: G4 stale-data failsafe', () => {
  test('history > staleHistoryHours → email "stale", niente decisioni tattiche', async () => {
    const m = mockSender();
    // Ultimo close 5 giorni prima del `now` simulato → stale.
    const hist = makeHistory(100, 90);
    hist[hist.length - 1].date = '2026-05-25';
    const r = await runAlert({
      now: new Date('2026-06-02T06:30:00Z'),
      history: hist, state: { last_tier: 0 }, sendFn: m.fn,
    });
    assert.equal(r.result, 'stale');
    assert.equal(m.calls.length, 1);
    assert.match(m.calls[0].subject, /stantii/);
    assert.match(m.calls[0].body, /update-prices/);
  });
});

describe('runAlert: dry-run flag', () => {
  test('dryRun=true → il sendFn riceve opts.dryRun=true', async () => {
    const m = mockSender();
    const hist = makeHistory(100, 88);
    await runAlert({ now: NOW, history: hist, state: { last_tier: 0 }, sendFn: m.fn, dryRun: true });
    assert.equal(m.calls.length, 1);
    assert.equal(m.calls[0].opts.dryRun, true);
  });
});
