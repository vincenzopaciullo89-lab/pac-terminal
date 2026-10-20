#!/usr/bin/env node
// =============================================================================
// drawdown_alert.js — Task F: alert email su crossing di tier (post Task D)
// =============================================================================
// Eseguito dal workflow .github/workflows/drawdown-alert.yml ogni mattina
// (06:30 UTC = ~07:30/08:30 IT, prima dell'apertura europea → l'ultimo close
// in data/history.json è quello del giorno di Borsa precedente, consolidato).
//
// Pipeline:
//   1. Carica data/history.json (VWCE) e data/alert_state.json (last_tier).
//   2. Failsafe G4: se l'ultimo close è > config.alerts.staleHistoryHours
//      vecchio → emette alert "stale data" e termina (niente decisioni su
//      dati stantii).
//   3. Riusa src/metricsEngine.computePriceMetrics → ddATH walk-forward.
//      Stesso identico numero del sito (B.5 → metricsEngine è il single
//      source of truth dei calcoli).
//   4. Determina tier corrente da config.strategyTiers (G2: niente soglie
//      hardcoded nello script, leggi dal config).
//   5. Applica isteresi (G3): per uscire da un tier serve recupero di
//      `hysteresisBand` rispetto al ddATHMax del tier.
//   6. Confronta con last_tier:
//        new > last  → email di ESCALATION (entry T1/T2, o salto)
//        new < last  → email di DE-ESCALATION (informativa, neutra)
//        new == last → silenzio
//   7. Aggiorna data/alert_state.json. Il workflow committa con [skip ci].
//
// Vincoli (cf. piano Task F):
//   • G1 close confermato: garantito dall'orario del workflow.
//   • G2 crossing-not-level: stato persistente in alert_state.json.
//   • G3 isteresi 2pp (configurabile): determineTier qui sotto.
//   • G4 stale-data: emette alert separato, esce.
//
// Modalità test:
//   ALERT_DRY_RUN=1 (o config.alerts.dryRun=true) → stampa il payload Resend
//                                                   invece di inviare.
//   ALERT_FORCE_TIER=0|1|2 → forza il tier corrente per smoke test e2e (T3).
//
// Secret env attesi:
//   RESEND_API_KEY      — API key Resend (Sending access only)
//   ALERT_EMAIL_TO      — destinatario
//   ALERT_EMAIL_FROM    — mittente (dominio verificato Resend)
// =============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../src/config.js';
import { computePriceMetrics } from '../src/metricsEngine.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

const HISTORY_PATH = path.join(ROOT, 'data', 'history.json');
const STATE_PATH   = path.join(ROOT, 'data', 'alert_state.json');

const ALERTS = config.alerts;
const TICKER = ALERTS.triggerTicker;

// -----------------------------------------------------------------------------
// I/O
// -----------------------------------------------------------------------------
function loadHistory() {
  const h = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
  return h.tickers?.[TICKER]?.data || [];
}

function loadState() {
  if (!fs.existsSync(STATE_PATH)) return { last_tier: 0, last_check_date: null, last_check_iso: null };
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); }
  catch { return { last_tier: 0, last_check_date: null, last_check_iso: null }; }
}

function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n');
}

// -----------------------------------------------------------------------------
// Tier con isteresi
// -----------------------------------------------------------------------------
// Entry: ddATH ≤ ddATHMax (come strategyEngine).
// Exit:  ddATH > ddATHMax + hysteresisBand (es. T1 esce > -8%, T2 > -18%).
// "Sticky": se lastTier=2 e ddATH è in [-18%, -10%], NON si scende a T1
// finché non si supera la banda di T2; allora si scende a T1 (non a T0).
// -----------------------------------------------------------------------------
export function tierWithHysteresis(ddATH, lastTier, tiers, band) {
  // Tier di ENTRATA "naturale" senza memoria.
  let entryTier = 0;
  for (let i = tiers.length - 1; i >= 1; i--) {
    if (ddATH <= tiers[i].ddATHMax) { entryTier = tiers[i].tier; break; }
  }
  if (entryTier >= lastTier) return entryTier;  // escalation o stesso: nessun problema
  // De-escalation: si esce dal lastTier solo se ddATH supera la sua banda.
  const lastTierObj = tiers.find(t => t.tier === lastTier);
  if (lastTierObj && ddATH <= lastTierObj.ddATHMax + band) return lastTier; // sticky: resta
  // Sopra la banda del lastTier: si scende, ma di QUANTO? Calcolo l'entry
  // naturale senza memoria → quello è il nuovo tier.
  return entryTier;
}

// -----------------------------------------------------------------------------
// Email rendering (fattuale, no panico, caveat onesto Task D)
// -----------------------------------------------------------------------------
const fmtPct = x => (x * 100).toFixed(1) + '%';
const fmtEur = x => '€' + x.toLocaleString('it-IT');

function tierLine(t) {
  if (!t || t.tier === 0) return 'T0 Normal — PAC base €500, nessun boost';
  const allocNote = t.allocationBoost ? `, ${t.allocationBoost} 100%` : '';
  return `${t.label} — ${fmtEur(t.totalAmount)}/mese (boost +${fmtEur(t.boostAmount)}${allocNote})`;
}

function caveatBlock() {
  return [
    '',
    'Onestà sul sistema: questo alert è disciplina comportamentale, non un',
    'segnale predittivo. Backtest 2009-2026 (Task D): timing alpha del sistema',
    '~€1.150 in 16 anni (0,36% del totale). Il valore vero del PAC è la',
    'costanza dei versamenti, non il timing dei boost.',
  ].join('\n');
}

function buildEscalationEmail(ctx) {
  const { newTier, lastTier, metrics, lastClose, lastDate, tiers } = ctx;
  const newT = tiers.find(t => t.tier === newTier);
  const oldT = tiers.find(t => t.tier === lastTier);
  const subject = `[PAC Terminal] T${newTier} attivato — ddATH ${fmtPct(metrics.ddATH)} su ${TICKER}`;
  const body = [
    `Soglia raggiunta: ddATH = ${fmtPct(metrics.ddATH)} su ${TICKER}.`,
    `Ultimo close usato: ${lastClose} EUR @ ${lastDate}.`,
    '',
    `Stato precedente: ${tierLine(oldT)}`,
    `Nuovo stato:      ${tierLine(newT)}`,
    '',
    'Azione suggerita questo mese:',
    `  • PAC totale: ${fmtEur(newT.totalAmount)} (${fmtEur(config.pac.baseMonthlyAmount)} base + ${fmtEur(newT.boostAmount)} boost).`,
    newT.boostAmount > 0
      ? `  • Allocazione boost: 100% ${newT.allocationBoost}. Il 10% CSNDX resta solo sul base.`
      : '  • Allocazione standard 90/10.',
    `  • Bonifico entro il ${config.pac.transferDayOfMonth} del mese.`,
    newT.boostAmount > 0
      ? `  • Acquisto manuale extra: ${fmtEur(newT.boostAmount)} sul giorno PAC (${config.pac.investmentDayOfMonth}).`
      : '',
    '',
    `Contesto (riuso metricsEngine, stesso numero del sito):`,
    `  • dd252D:  ${metrics.dd252D != null ? fmtPct(metrics.dd252D) : 'n/d'}`,
    `  • MA200 dev: ${metrics.madMA200 != null ? fmtPct(metrics.madMA200) : 'n/d'}`,
    `  • Regime: ${metrics.regime || 'n/d'}`,
    `  • Cap boost: massimo ${config.pac.capBoostMonthsPerYear} mesi/anno.`,
    caveatBlock(),
    '',
    '—',
    `PAC Terminal · alert automatico · ${new Date().toISOString()}`,
  ].filter(Boolean).join('\n');
  return { subject, body };
}

function buildDeescalationEmail(ctx) {
  const { newTier, lastTier, metrics, lastClose, lastDate, tiers } = ctx;
  const newT = tiers.find(t => t.tier === newTier);
  const oldT = tiers.find(t => t.tier === lastTier);
  // Tono fattuale, neutro. Niente "pericolo finito" / "è passata".
  const subject = `[PAC Terminal] Versamento torna a ${fmtEur(newT.totalAmount)} — ddATH ${fmtPct(metrics.ddATH)}`;
  const body = [
    `Informativo: ddATH risalito a ${fmtPct(metrics.ddATH)} su ${TICKER}.`,
    `Ultimo close usato: ${lastClose} EUR @ ${lastDate}.`,
    '',
    `Stato precedente: ${tierLine(oldT)}`,
    `Nuovo stato:      ${tierLine(newT)}`,
    '',
    newTier === 0
      ? `Da questo mese il versamento torna al PAC base ${fmtEur(config.pac.baseMonthlyAmount)} (allocazione standard 90/10). Niente boost.`
      : `Da questo mese il versamento è ${fmtEur(newT.totalAmount)} (boost ridotto rispetto al tier precedente).`,
    '',
    `Nota: "interrompere il boost" significa SOLO tornare al versamento base.`,
    `Non è un segnale di nulla — è la conseguenza meccanica del rientro del`,
    `drawdown sopra la soglia di uscita (con isteresi di ${fmtPct(ALERTS.hysteresisBand)}).`,
    caveatBlock(),
    '',
    '—',
    `PAC Terminal · alert automatico · ${new Date().toISOString()}`,
  ].join('\n');
  return { subject, body };
}

function buildStaleEmail(lastDate, ageHours) {
  const subject = `[PAC Terminal] Dati storici stantii (${ageHours.toFixed(1)}h) — alert non valutato`;
  const body = [
    `data/history.json risulta non aggiornato:`,
    `  • Ultimo close ${TICKER}: ${lastDate}`,
    `  • Età: ${ageHours.toFixed(1)} ore (soglia ${ALERTS.staleHistoryHours}h)`,
    '',
    `La pipeline update-prices.yml potrebbe essere bloccata. Verifica i run`,
    `recenti su GitHub Actions. Nessun alert tattico è stato valutato oggi.`,
    '',
    '—',
    `PAC Terminal · alert automatico · ${new Date().toISOString()}`,
  ].join('\n');
  return { subject, body };
}

// -----------------------------------------------------------------------------
// Resend send (con dry-run)
// -----------------------------------------------------------------------------
async function sendEmail(subject, body, opts = {}) {
  const dryRun = opts.dryRun || ALERTS.dryRun || process.env.ALERT_DRY_RUN === '1';
  const to = process.env.ALERT_EMAIL_TO;
  const from = process.env.ALERT_EMAIL_FROM;
  const apiKey = process.env.RESEND_API_KEY;

  if (dryRun) {
    console.log('=== DRY RUN — payload Resend (non inviato) ===');
    console.log(`FROM:    ${from || '<ALERT_EMAIL_FROM missing>'}`);
    console.log(`TO:      ${to || '<ALERT_EMAIL_TO missing>'}`);
    console.log(`SUBJECT: ${subject}`);
    console.log('---');
    console.log(body);
    console.log('=== END DRY RUN ===');
    return { dryRun: true };
  }
  if (!apiKey || !to || !from) {
    throw new Error(`Resend env mancante: RESEND_API_KEY=${!!apiKey}, ALERT_EMAIL_TO=${!!to}, ALERT_EMAIL_FROM=${!!from}`);
  }
  // Resend HTTP API: niente SDK, una sola dipendenza in meno.
  const res = await (opts.fetch || globalThis.fetch)('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, text: body }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Resend HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return { dryRun: false, status: res.status };
}

// -----------------------------------------------------------------------------
// Main pipeline (esportato per test)
// -----------------------------------------------------------------------------
export async function runAlert({ now = new Date(), history, state, sendFn, dryRun = false } = {}) {
  const hist = history || loadHistory();
  if (!hist.length) {
    console.error('history vuota — niente da valutare');
    return { result: 'no_history' };
  }
  const last = hist[hist.length - 1];
  const ageHours = (now.getTime() - Date.parse(last.date + 'T18:00:00Z')) / 3600000;

  // G4: failsafe stale-data
  if (ageHours > ALERTS.staleHistoryHours) {
    const { subject, body } = buildStaleEmail(last.date, ageHours);
    await (sendFn || sendEmail)(subject, body, { dryRun });
    return { result: 'stale', ageHours };
  }

  const currentState = state || loadState();
  const lastTier = currentState.last_tier ?? 0;
  const tiers = config.strategyTiers;

  // Metriche dal SINGLE SOURCE OF TRUTH (metricsEngine, B.5).
  const metrics = computePriceMetrics(hist, last.close);
  if (!metrics || !Number.isFinite(metrics.ddATH)) {
    console.error('ddATH non calcolabile — niente alert');
    return { result: 'no_metrics' };
  }

  // Override per test e2e (T3): forza un tier specifico.
  let newTier;
  const forced = process.env.ALERT_FORCE_TIER;
  if (forced != null && forced !== '') {
    newTier = parseInt(forced, 10);
    if (!Number.isInteger(newTier) || newTier < 0 || newTier >= tiers.length) {
      throw new Error(`ALERT_FORCE_TIER non valido: ${forced}`);
    }
    console.log(`[force] ALERT_FORCE_TIER=${newTier} (override per smoke test)`);
  } else {
    newTier = tierWithHysteresis(metrics.ddATH, lastTier, tiers, ALERTS.hysteresisBand);
  }

  const ctx = { newTier, lastTier, metrics, lastClose: last.close, lastDate: last.date, tiers };

  let emailsSent = 0;
  let result = 'no_change';

  if (newTier > lastTier) {
    const { subject, body } = buildEscalationEmail(ctx);
    await (sendFn || sendEmail)(subject, body, { dryRun });
    emailsSent++;
    result = 'escalation';
  } else if (newTier < lastTier) {
    const { subject, body } = buildDeescalationEmail(ctx);
    await (sendFn || sendEmail)(subject, body, { dryRun });
    emailsSent++;
    result = 'deescalation';
  } else {
    console.log(`Stato invariato (T${newTier}, ddATH ${fmtPct(metrics.ddATH)}). Nessuna email.`);
  }

  // Rate limit difensivo (questo run non ne invierà mai >1 nella logica, ma
  // se in futuro si estendesse il fan-out, il guard è qui).
  if (emailsSent > ALERTS.maxEmailsPerRun) {
    throw new Error(`Rate limit superato: ${emailsSent} > ${ALERTS.maxEmailsPerRun}`);
  }

  // Aggiorna stato persistente.
  const newState = {
    last_tier: newTier,
    last_check_date: last.date,
    last_check_iso: now.toISOString(),
    ddATH_at_check: metrics.ddATH,
  };
  if (!state) saveState(newState);

  return { result, newTier, lastTier, ddATH: metrics.ddATH, emailsSent, state: newState };
}

// CLI entry (skip durante test import).
const isCli = import.meta.url === `file://${process.argv[1]}`;
if (isCli) {
  runAlert().then(r => {
    console.log(`[alert] result=${r.result} ${r.newTier != null ? `newTier=${r.newTier} lastTier=${r.lastTier}` : ''} emailsSent=${r.emailsSent ?? 0}`);
    process.exit(0);
  }).catch(err => {
    console.error('[alert] FAILED:', err.message);
    process.exit(1);
  });
}
