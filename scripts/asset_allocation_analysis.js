#!/usr/bin/env node
// =============================================================================
// asset_allocation_analysis.js — TASK 5 (O1): metriche storiche dei candidati
// =============================================================================
// Confronta 6 candidati di asset allocation sul periodo storico comune più
// lungo possibile, TUTTO IN EUR. Output: metriche grezze (CHECKPOINT 5.2).
// Nessuno scoring qui: solo numeri.
//
// Fonti (serie EUR, accumulating → il close incorpora i dividendi reinvestiti):
//   - swda  : data/analysis/swda.json   (iShares Core MSCI World, proxy VWCE)
//   - em    : data/analysis/em.json     (iShares Core MSCI EM IMI, IEMA.AS)
//   - cspx  : data/analysis/cspx.json   (iShares Core S&P 500)
//   - csndx : data/history.json         (iShares Nasdaq 100, period=max)
//   VETA escluso (bond legacy, storia 2019, posizione congelata) — vedi report.
//
// FINESTRA: intersezione delle date comuni a tutte le serie usate. Il vincolo
// è CSPX (parte 2010-05-19), quindi ~16 anni identici per tutti i candidati.
//
// RIBILANCIAMENTO: annuale (primo giorno di Borsa di ogni anno solare) per i
// candidati multi-asset. Dichiarato. Niente pesi liberi, niente look-ahead.
//
// Riusa src/metricsEngine.js per uno snapshot per-candidato (ddATH/regime
// correnti). Le statistiche di periodo (CAGR, σ, maxDD, rolling 10y, Sharpe/
// Sortino) sono calcolate direttamente: metricsEngine è pensato per il trigger
// tattico (finestre rolling), non per l'analisi full-history di portafoglio.
// =============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computePriceMetrics } from '../src/metricsEngine.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

const RISK_FREE = 0.0;            // rf dichiarato = 0%. Vedi caveat nel report.
const REBALANCE = 'annuale (primo giorno di Borsa di ogni anno solare)';
const TRADING_DAYS = 252;
const ROLL_10Y_DAYS = 10 * TRADING_DAYS;

// -----------------------------------------------------------------------------
// Pesi candidati. C6 = legacy reale ex-VETA, renormalizzato (da valori € reali).
// -----------------------------------------------------------------------------
const CANDIDATES = {
  'C1 VWCE 100%':            { swda: 1.00 },
  'C2 VWCE 90% / CSNDX 10%': { swda: 0.90, csndx: 0.10 },
  'C3 VWCE 70% / CSNDX 30%': { swda: 0.70, csndx: 0.30 },
  'C4 VWCE 80% / EM 20%':    { swda: 0.80, em: 0.20 },
  'C5 VWCE70/CSNDX15/EM15':  { swda: 0.70, csndx: 0.15, em: 0.15 },
  'C6 legacy ex-VETA':       { swda: 0.4157, cspx: 0.3212, csndx: 0.2631 },
};

// Eventi di stress da isolare (doppia lente sul drawdown).
const EVENTS = {
  'COVID 2020':       ['2020-01-01', '2020-06-30'],
  'EM/China 2021-22': ['2021-01-01', '2022-12-31'],
  'Bear 2022 (DM)':   ['2022-01-01', '2023-01-31'],
};

// -----------------------------------------------------------------------------
// Caricamento serie → map date→close
// -----------------------------------------------------------------------------
function loadSeries() {
  const an = name => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'analysis', `${name}.json`), 'utf8')).data;
  const csndx = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'history.json'), 'utf8')).tickers.CSNDX.data;
  const toMap = arr => { const m = new Map(); for (const r of arr) if (Number.isFinite(r.close) && r.close > 0) m.set(r.date, r.close); return m; };
  return { swda: toMap(an('swda')), em: toMap(an('em')), cspx: toMap(an('cspx')), csndx: toMap(csndx) };
}

// Date comuni a tutte le serie usate (intersezione), ordinate.
function commonDates(series, names) {
  const maps = names.map(n => series[n]);
  let dates = [...maps[0].keys()];
  for (let i = 1; i < maps.length; i++) dates = dates.filter(d => maps[i].has(d));
  dates.sort();
  return dates;
}

// -----------------------------------------------------------------------------
// Simulazione portafoglio con ribilanciamento annuale (walk-forward)
// Ritorna serie {date, value} del valore del portafoglio (base 1.0).
// -----------------------------------------------------------------------------
function simulatePortfolio(weights, dates, series) {
  const comps = Object.keys(weights);
  const price = (c, d) => series[c].get(d);

  let value = 1.0;
  let units = {};
  const d0 = dates[0];
  for (const c of comps) units[c] = (value * weights[c]) / price(c, d0);

  const out = [{ date: d0, value }];
  let curYear = d0.slice(0, 4);

  for (let i = 1; i < dates.length; i++) {
    const d = dates[i];
    // Valore corrente coi prezzi di oggi.
    value = comps.reduce((s, c) => s + units[c] * price(c, d), 0);
    // Ribilanciamento annuale: al primo giorno di un nuovo anno solare.
    const y = d.slice(0, 4);
    if (y !== curYear) {
      curYear = y;
      if (comps.length > 1) {
        for (const c of comps) units[c] = (value * weights[c]) / price(c, d);
      }
    }
    out.push({ date: d, value });
  }
  return out;
}

// -----------------------------------------------------------------------------
// Statistiche su una serie {date, value}
// -----------------------------------------------------------------------------
function yearsBetween(d1, d2) {
  return (Date.parse(d2) - Date.parse(d1)) / (365.25 * 24 * 3600 * 1000);
}

// Rendimenti MENSILI da una serie daily {date, value}: ultimo valore di ogni
// mese → rendimenti month-over-month. Robusti al desync dei prezzi giornalieri
// (CSNDX.MI pre-2020 ha close di Milano non sincroni col close USA → la corr e
// la vol DAILY sono distorte; le mensili no). Vedi nota nel report.
function monthlyReturns(serie) {
  const byMonth = new Map();
  for (const p of serie) byMonth.set(p.date.slice(0, 7), p.value); // ultimo del mese
  const months = [...byMonth.keys()].sort();
  const r = [];
  for (let i = 1; i < months.length; i++) r.push(byMonth.get(months[i]) / byMonth.get(months[i - 1]) - 1);
  return r;
}

function stats(serie) {
  const n = serie.length;
  const years = yearsBetween(serie[0].date, serie[n - 1].date);
  const cagr = Math.pow(serie[n - 1].value / serie[0].value, 1 / years) - 1;

  // Rischio da rendimenti MENSILI (×√12). CAGR/maxDD/rolling restano level-based daily.
  const rets = monthlyReturns(serie);
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, x) => a + (x - mean) ** 2, 0) / rets.length;
  const annVol = Math.sqrt(variance) * Math.sqrt(12);

  // Downside deviation (semivarianza sui rendimenti negativi, MAR=0), annualizzata.
  const dvar = rets.reduce((a, x) => a + (x < 0 ? x * x : 0), 0) / rets.length;
  const downside = Math.sqrt(dvar) * Math.sqrt(12);

  const sharpe = (cagr - RISK_FREE) / annVol;
  const sortino = downside > 0 ? (cagr - RISK_FREE) / downside : null;

  // Max drawdown peak-to-trough + recovery.
  let peak = serie[0].value, peakDate = serie[0].date;
  let mdd = 0, mddPeakDate = null, mddTroughDate = null, mddTroughVal = null, mddPeakVal = null;
  for (const p of serie) {
    if (p.value > peak) { peak = p.value; peakDate = p.date; }
    const dd = p.value / peak - 1;
    if (dd < mdd) { mdd = dd; mddPeakDate = peakDate; mddTroughDate = p.date; mddTroughVal = p.value; mddPeakVal = peak; }
  }
  // Recovery: primo giorno dopo il trough in cui si rivede il livello del peak.
  let recoveryDate = null;
  if (mddPeakVal != null) {
    for (const p of serie) {
      if (p.date > mddTroughDate && p.value >= mddPeakVal) { recoveryDate = p.date; break; }
    }
  }
  const recoveryDays = recoveryDate ? Math.round(yearsBetween(mddTroughDate, recoveryDate) * 365.25) : null;
  const underwaterDays = mddPeakDate && recoveryDate ? Math.round(yearsBetween(mddPeakDate, recoveryDate) * 365.25) : null;

  // Rolling 10y CAGR (worst/best).
  let worst10 = null, best10 = null, worst10Start = null, best10Start = null;
  for (let i = 0; i + ROLL_10Y_DAYS < serie.length; i++) {
    const a = serie[i], b = serie[i + ROLL_10Y_DAYS];
    const yrs = yearsBetween(a.date, b.date);
    const c = Math.pow(b.value / a.value, 1 / yrs) - 1;
    if (worst10 === null || c < worst10) { worst10 = c; worst10Start = a.date; }
    if (best10 === null || c > best10) { best10 = c; best10Start = a.date; }
  }

  return {
    years, cagr, annVol, sharpe, sortino,
    mdd, mddPeakDate, mddTroughDate, recoveryDate, recoveryDays, underwaterDays,
    worst10, worst10Start, best10, best10Start,
  };
}

function eventDrawdown(serie, start, end) {
  const win = serie.filter(p => p.date >= start && p.date <= end);
  if (win.length < 2) return null;
  let peak = -Infinity, mdd = 0, pd = null, td = null, pk = null;
  for (const p of win) {
    if (p.value > peak) { peak = p.value; pk = p.date; }
    const dd = p.value / peak - 1;
    if (dd < mdd) { mdd = dd; pd = pk; td = p.date; }
  }
  return { mdd, peakDate: pd, troughDate: td };
}

// Correlazione di Pearson tra rendimenti MENSILI di due componenti.
// Mensile (non daily) per robustezza al desync di CSNDX.MI pre-2020.
function corr(series, a, b, from) {
  const ma = new Map(), mb = new Map();
  for (const d of [...series[a].keys()].filter(d => d >= from)) ma.set(d.slice(0, 7), series[a].get(d));
  for (const d of [...series[b].keys()].filter(d => d >= from)) mb.set(d.slice(0, 7), series[b].get(d));
  const months = [...ma.keys()].filter(m => mb.has(m)).sort();
  const ra = [], rb = [];
  for (let i = 1; i < months.length; i++) {
    ra.push(ma.get(months[i]) / ma.get(months[i - 1]) - 1);
    rb.push(mb.get(months[i]) / mb.get(months[i - 1]) - 1);
  }
  const mra = ra.reduce((s, x) => s + x, 0) / ra.length;
  const mrb = rb.reduce((s, x) => s + x, 0) / rb.length;
  let cov = 0, va = 0, vb = 0;
  for (let i = 0; i < ra.length; i++) { cov += (ra[i] - mra) * (rb[i] - mrb); va += (ra[i] - mra) ** 2; vb += (rb[i] - mrb) ** 2; }
  return cov / Math.sqrt(va * vb);
}

// -----------------------------------------------------------------------------
const pct = (x, d = 1) => x == null ? 'n/d' : (x * 100).toFixed(d) + '%';
const num = (x, d = 2) => x == null ? 'n/d' : x.toFixed(d);

function main() {
  const series = loadSeries();

  // Finestra comune a TUTTE le serie usate dai candidati (swda, em, cspx, csndx).
  const allNames = ['swda', 'em', 'cspx', 'csndx'];
  const dates = commonDates(series, allNames);
  const start = dates[0], end = dates[dates.length - 1];

  console.log('='.repeat(92));
  console.log('TASK 5 — METRICHE STORICHE CANDIDATI (EUR) — CHECKPOINT 5.2 (solo numeri)');
  console.log('='.repeat(92));
  console.log(`Finestra comune: ${start} → ${end}  (${dates.length} giorni di Borsa comuni, ${yearsBetween(start, end).toFixed(1)} anni)`);
  console.log(`Vincolo finestra: CSPX (parte ${[...series.cspx.keys()].sort()[0]}).`);
  console.log(`Ribilanciamento multi-asset: ${REBALANCE}.`);
  console.log(`Risk-free per Sharpe/Sortino: ${(RISK_FREE * 100).toFixed(1)}% (dichiarato).`);
  console.log('Rischio (σ/Sharpe/Sortino/corr) da rendimenti MENSILI; CAGR/maxDD/rolling da daily (level-based).');
  console.log('ETF accumulating: il close incorpora i dividendi reinvestiti → CAGR ≈ total return.');

  // Tabella metriche principali
  console.log('\n' + '-'.repeat(92));
  console.log('METRICHE DI PERIODO (finestra piena)');
  console.log('-'.repeat(92));
  console.log('candidato                  | CAGR  |  σ    | Sharpe | Sortino | maxDD  | recovery | worst10y | best10y');
  const results = {};
  for (const [label, w] of Object.entries(CANDIDATES)) {
    const used = Object.keys(w);
    const serie = simulatePortfolio(w, dates, series);
    const s = stats(serie);
    results[label] = { w, serie, s };
    console.log(
      `${label.padEnd(26)} | ${pct(s.cagr).padStart(5)} | ${pct(s.annVol).padStart(5)} | ` +
      `${num(s.sharpe).padStart(6)} | ${num(s.sortino).padStart(7)} | ${pct(s.mdd).padStart(6)} | ` +
      `${(s.recoveryDays != null ? s.recoveryDays + 'd' : 'n/d').padStart(8)} | ${pct(s.worst10).padStart(7)} | ${pct(s.best10).padStart(6)}`,
    );
  }

  // Dettaglio drawdown peak-to-trough + date
  console.log('\n' + '-'.repeat(92));
  console.log('MAX DRAWDOWN — dettaglio date e recovery');
  console.log('-'.repeat(92));
  for (const [label, { s }] of Object.entries(results)) {
    console.log(`${label.padEnd(26)} | maxDD ${pct(s.mdd)} (${s.mddPeakDate} → ${s.mddTroughDate}) | ` +
      `recovery ${s.recoveryDate || 'non ancora'} (${s.recoveryDays != null ? s.recoveryDays + 'd dal minimo' : 'n/d'}) | ` +
      `underwater tot ${s.underwaterDays != null ? s.underwaterDays + 'd' : 'n/d'}`);
  }

  // Rolling 10y date
  console.log('\n' + '-'.repeat(92));
  console.log('ROLLING 10Y CAGR — worst/best con data di inizio finestra');
  console.log('-'.repeat(92));
  for (const [label, { s }] of Object.entries(results)) {
    console.log(`${label.padEnd(26)} | worst 10y ${pct(s.worst10)} (start ${s.worst10Start}) | best 10y ${pct(s.best10)} (start ${s.best10Start})`);
  }

  // Doppia lente: drawdown per evento
  console.log('\n' + '-'.repeat(92));
  console.log('DRAWDOWN PER EVENTO (doppia lente)');
  console.log('-'.repeat(92));
  const evNames = Object.keys(EVENTS);
  console.log('candidato                  | ' + evNames.map(e => e.padEnd(16)).join(' | '));
  for (const [label, { serie }] of Object.entries(results)) {
    const cells = evNames.map(e => {
      const r = eventDrawdown(serie, EVENTS[e][0], EVENTS[e][1]);
      return (r ? pct(r.mdd) : 'n/d').padEnd(16);
    });
    console.log(`${label.padEnd(26)} | ${cells.join(' | ')}`);
  }

  // Correlazioni tra componenti (sulle date comuni)
  console.log('\n' + '-'.repeat(92));
  console.log('CORRELAZIONI tra componenti (rendimenti MENSILI, finestra comune)');
  console.log('-'.repeat(92));
  const pairs = [['swda', 'csndx'], ['swda', 'em'], ['swda', 'cspx'], ['csndx', 'em'], ['cspx', 'csndx'], ['cspx', 'em']];
  for (const [a, b] of pairs) {
    console.log(`  corr(${a}, ${b}) = ${num(corr(series, a, b, start), 3)}`);
  }

  // Snapshot metricsEngine per-candidato (riuso: ddATH/regime correnti del portafoglio)
  console.log('\n' + '-'.repeat(92));
  console.log('SNAPSHOT metricsEngine sul valore di portafoglio (riuso B.5; contesto, non scoring)');
  console.log('-'.repeat(92));
  for (const [label, { serie }] of Object.entries(results)) {
    const hp = serie.map(p => ({ date: p.date, close: p.value }));
    const m = computePriceMetrics(hp, serie[serie.length - 1].value);
    console.log(`${label.padEnd(26)} | ddATH ${pct(m.ddATH)} | dd252D ${pct(m.dd252D)} | volRolling ${pct(m.volRolling)} | regime ${m.regime}`);
  }

  // ===========================================================================
  // FASE 5.3 — DIMENSIONI QUALITATIVE / SEMI-QUANTITATIVE
  // ---------------------------------------------------------------------------
  // Etichetta delle fonti:
  //   [FATTO]      = numero ufficiale (TER iShares/Vanguard, bollo italiano).
  //   [STIMA]      = derivato da factsheet pubblici, valido al ~Q1 2025 (i
  //                  pesi degli indici cambiano nel tempo, niente decimali).
  //   [ASSUNZIONE] = scelta esplicita per il calcolo (capitale, finestra).
  //   [GIUDIZIO]   = valutazione qualitativa.
  // ===========================================================================
  console.log('\n' + '='.repeat(92));
  console.log('FASE 5.3 — DIMENSIONI QUALITATIVE / SEMI-QUANTITATIVE');
  console.log('='.repeat(92));

  // --- 1. COSTO: TER ponderato + bollo + cost wedge 20y ---
  // [FATTO] TER ufficiali (iShares/Vanguard factsheet, KIID).
  const TER = { swda: 0.0020, em: 0.0018, cspx: 0.0007, csndx: 0.0030, vwce: 0.0019 };
  const STAMP_DUTY = 0.0020;      // [FATTO] bollo italiano 0,2%/anno
  const HORIZON_Y = 20;           // [ASSUNZIONE] orizzonte coerente con investor.horizonYears
  const CAPITAL = 100000;         // [ASSUNZIONE] capitale di esempio €100K per leggere il drag

  // Il candidato C1 usa swda come proxy ma OPERATIVAMENTE il PAC è su VWCE
  // (0.19%). Mostro entrambi: TER del proxy (per coerenza con la finestra storica)
  // e TER operativo "in produzione" (VWCE invece di SWDA dove applicabile).
  const operativeMap = { swda: 'vwce' };  // C1-C5 operativamente usano VWCE
  console.log('\n' + '-'.repeat(92));
  console.log('1. COSTO — TER ponderato + bollo 0,2%/y + cost wedge 20y (capitale esempio €100K)');
  console.log('-'.repeat(92));
  console.log('[FATTO] TER: VWCE 0,19% · CSNDX 0,30% · EM(IEMA) 0,18% · CSPX 0,07% · SWDA 0,20%');
  console.log('[FATTO] Bollo titoli IT: 0,20%/anno sul controvalore. [ASSUNZIONE] 20 anni, €100K iniziali, no ribilanciamento per il drag.');
  console.log('candidato                  | TER pond (oper.) | drag tot/anno | wedge 20y su €100K');
  const costs = {};
  for (const [label, w] of Object.entries(CANDIDATES)) {
    // TER operativo: per C1-C5 sostituisco swda→vwce; per C6 (legacy reale) tengo swda.
    const isLegacy = label.startsWith('C6');
    let terW = 0;
    for (const [c, wt] of Object.entries(w)) {
      const eff = isLegacy ? c : (operativeMap[c] || c);
      terW += wt * TER[eff];
    }
    const dragAnnual = terW + STAMP_DUTY;
    // Wedge cumulato: 1 - (1-drag)^N, applicato al capitale.
    const wedgeFrac = 1 - Math.pow(1 - dragAnnual, HORIZON_Y);
    const wedgeEur = CAPITAL * wedgeFrac;
    costs[label] = { terW, dragAnnual, wedgeEur };
    console.log(`${label.padEnd(26)} | ${pct(terW, 3).padStart(12)} ${(isLegacy ? '(legacy)' : '(VWCE op.)').padStart(4)} | ${pct(dragAnnual, 3).padStart(11)} | ${('€' + Math.round(wedgeEur).toLocaleString('it-IT')).padStart(18)}`);
  }
  const cheapest = Object.entries(costs).reduce((a, b) => a[1].wedgeEur < b[1].wedgeEur ? a : b);
  console.log(`\nPiù economico: ${cheapest[0]} (wedge €${Math.round(cheapest[1].wedgeEur).toLocaleString('it-IT')}/20y)`);
  console.log('Delta vs più economico:');
  for (const [label, c] of Object.entries(costs)) {
    const d = c.wedgeEur - cheapest[1].wedgeEur;
    if (Math.abs(d) > 1) console.log(`  ${label.padEnd(26)} +€${Math.round(d).toLocaleString('it-IT')}`);
  }

  // --- 3. CONCENTRAZIONE AGGREGATA USA / TECH (look-through) ---
  // [STIMA] pesi USA/tech degli indici sottostanti — factsheet pubblici, ~Q1 2025.
  // Numeri arrotondati: variano nel tempo, non vanno trattati come precisi.
  const COMPOSITION = {
    //              USA    TECH   (top-10 = concentrazione interna del fondo, info collaterale)
    swda:  { us: 0.72, tech: 0.26, top10: 0.24 },  // [STIMA] MSCI World DM
    vwce:  { us: 0.65, tech: 0.24, top10: 0.22 },  // [STIMA] FTSE All-World (incl. ~10% EM)
    csndx: { us: 1.00, tech: 0.59, top10: 0.50 },  // [STIMA] Nasdaq 100
    cspx:  { us: 1.00, tech: 0.32, top10: 0.34 },  // [STIMA] S&P 500
    em:    { us: 0.00, tech: 0.22, top10: 0.20 },  // [STIMA] MSCI EM IMI (tech ≈ Taiwan/Korea semis)
  };
  console.log('\n' + '-'.repeat(92));
  console.log('3. CONCENTRAZIONE USA/TECH aggregata (look-through degli indici)');
  console.log('-'.repeat(92));
  console.log('[STIMA] composizioni da factsheet pubblici (~Q1 2025). I numeri spostano nel tempo.');
  console.log('candidato                  | USA agg. | TECH agg. | nota');
  for (const [label, w] of Object.entries(CANDIDATES)) {
    const isLegacy = label.startsWith('C6');
    let us = 0, tech = 0;
    for (const [c, wt] of Object.entries(w)) {
      const eff = isLegacy ? c : (operativeMap[c] || c);
      const k = COMPOSITION[eff];
      us += wt * k.us;
      tech += wt * k.tech;
    }
    let nota = '';
    if (label.startsWith('C1')) nota = 'baseline (operativo: VWCE → 65% USA / 24% tech)';
    if (label.startsWith('C2')) nota = '+3,5% USA, +3,5% tech vs C1 (CSNDX al 100% USA, ~96% già in VWCE)';
    if (label.startsWith('C3')) nota = '+10,5% USA, +10,5% tech vs C1 → tilt USA-tech significativo';
    if (label.startsWith('C4')) nota = '−13% USA (EM offre diversificazione vera)';
    if (label.startsWith('C5')) nota = 'compromesso: −5% USA, +5,3% tech vs C1';
    if (label.startsWith('C6')) nota = 'legacy: USA-heavy (SWDA+CSPX entrambi DM/USA)';
    console.log(`${label.padEnd(26)} | ${pct(us).padStart(8)} | ${pct(tech).padStart(9)} | ${nota}`);
  }

  // ===========================================================================
  // FASE 5.4 — SCORING NORMALIZZATO + SENSITIVITY
  // ---------------------------------------------------------------------------
  // Metodo di normalizzazione (DICHIARATO):
  //   Per ogni dimensione, si converte il valore grezzo in punteggio 0-10 con
  //   min-max sui SOLI 6 candidati della griglia:
  //     - "higher is better"  → score = 10 * (raw - worst) / (best - worst)
  //     - "lower is better"   → score = 10 * (best - raw) / (best - worst)
  //   Per dimensioni-giudizio (Rendimento atteso forward, Behavioral) si dà
  //   direttamente un punteggio 1-10 con razionale tracciato in console.
  //   Per dimensioni composite (Robustezza, Diversificazione) si fa la media
  //   delle sub-componenti normalizzate (pesi uguali, dichiarati sotto).
  //
  // RENDIMENTO ATTESO: NON usa il CAGR storico (premerebbe meccanicamente i
  // più tech). Usa stime forward giudicate basate sul consensus istituzionale
  // Q1 2025 — vedi docs/TASK_5_ASSET_ALLOCATION_5_3.md §4.
  // ===========================================================================
  console.log('\n' + '='.repeat(92));
  console.log('FASE 5.4 — SCORING NORMALIZZATO 0-10 + SENSITIVITY');
  console.log('='.repeat(92));

  const labels = Object.keys(CANDIDATES);

  // ---------- DIMENSIONE 1: COSTO (lower is better) ----------
  // Sub-input: cost wedge 20y in €. Più basso = score più alto.
  const costRaw = labels.map(l => costs[l].wedgeEur);

  // ---------- DIMENSIONE 2: ROBUSTEZZA (composito) ----------
  // Sub-componenti normalizzate, media equi-pesata:
  //   - maxDD          (lower-abs is better; raw negativo → score = 10*(maxDD - worst)/(0 - worst))
  //   - recoveryDays   (lower is better)
  //   - worst10y       (higher is better)
  //   - drawdown bear 2022 (lower-abs is better) — la "crisi sbagliata" per chi è tech-heavy
  function bearDD(label) {
    const s = results[label].serie;
    const r = eventDrawdown(s, EVENTS['Bear 2022 (DM)'][0], EVENTS['Bear 2022 (DM)'][1]);
    return r ? r.mdd : 0;
  }
  const maxDDRaw      = labels.map(l => results[l].s.mdd);          // negativo
  const recoveryRaw   = labels.map(l => results[l].s.recoveryDays); // giorni
  const worst10Raw    = labels.map(l => results[l].s.worst10);      // %
  const bear2022Raw   = labels.map(l => bearDD(l));                 // negativo

  // ---------- DIMENSIONE 3: DIVERSIFICAZIONE (composito) ----------
  // Sub-componenti, media equi-pesata:
  //   - (100% - USA agg.)  → più diversificato geograficamente
  //   - (100% - Tech agg.) → meno concentrato di settore
  //   - peso EM nel candidato (bonus per diversificazione strutturale vera)
  function aggUS(weights, isLegacy) {
    let u = 0; for (const [c, w] of Object.entries(weights)) {
      const eff = isLegacy ? c : (operativeMap[c] || c);
      u += w * COMPOSITION[eff].us;
    } return u;
  }
  function aggTech(weights, isLegacy) {
    let t = 0; for (const [c, w] of Object.entries(weights)) {
      const eff = isLegacy ? c : (operativeMap[c] || c);
      t += w * COMPOSITION[eff].tech;
    } return t;
  }
  function emWeight(weights) { return weights.em || 0; }
  const usRaw   = labels.map(l => aggUS(CANDIDATES[l], l.startsWith('C6')));
  const techRaw = labels.map(l => aggTech(CANDIDATES[l], l.startsWith('C6')));
  const emRaw   = labels.map(l => emWeight(CANDIDATES[l]));

  // ---------- DIMENSIONE 4: RENDIMENTO ATTESO FORWARD (giudizio, NON CAGR) ----------
  // Punteggi 1-10 derivati esplicitamente da §4 del CHECKPOINT 5.3.
  // Razionale dichiarato per ognuno. Coerenti col consensus istituzionale Q1 2025.
  const FWD_SCORES = {
    'C1 VWCE 100%':            { score: 6.0, why: 'baseline equity globale, ~5-7% nominale EUR atteso; nessun premio strutturale' },
    'C2 VWCE 90% / CSNDX 10%': { score: 6.0, why: 'identico a C1 forward: il tilt CSNDX è amplificazione di asset già premiati storicamente ma in fase di multiple compression' },
    'C3 VWCE 70% / CSNDX 30%': { score: 5.0, why: 'penalità per headwind multipli USA-tech: CAPE Shiller >35 → nessuna fonte serie dà premio Nasdaq forward' },
    'C4 VWCE 80% / EM 20%':    { score: 6.5, why: 'leggero premio per valutazione EM bassa (P/E ~13 vs S&P 21); tesi mean-reversion non garantita' },
    'C5 VWCE70/CSNDX15/EM15':  { score: 6.0, why: 'ibrido medio: tilt EM compensato dal tilt tech (segni opposti)' },
    'C6 legacy ex-VETA':       { score: 5.0, why: 'più concentrato USA (88%) → soggetto allo stesso headwind multipli; il vantaggio storico non è ripetibile' },
  };

  // ---------- DIMENSIONE 5: BEHAVIORAL FIT (giudizio) ----------
  // Punteggi 1-10 da §5 del CHECKPOINT 5.3.
  const BEHAV_SCORES = {
    'C1 VWCE 100%':            { score: 9.0, why: '1 asset, narrativa "mercato mondiale" robusta, staying power alto' },
    'C2 VWCE 90% / CSNDX 10%': { score: 8.5, why: 'quasi C1, narrativa identica; il 10% CSNDX è gestibile' },
    'C3 VWCE 70% / CSNDX 30%': { score: 5.0, why: 'rischio abbandono ALTO in bear tech (stima -55÷-65% in scenario dot-com); ostacola anche il boost tattico Task D' },
    'C4 VWCE 80% / EM 20%':    { score: 6.5, why: 'pressione narrativa costante ("perché EM se USA vince?"); ribilanciamento annuale necessario' },
    'C5 VWCE70/CSNDX15/EM15':  { score: 5.5, why: '3 asset = 3 attriti; ogni componente ha la sua narrativa da difendere; più complesso del beneficio incrementale' },
    'C6 legacy ex-VETA':       { score: 3.0, why: 'legacy congelato, NON gestibile/target operativo; alta concentrazione USA + 4 ETF da seguire' },
  };

  // ---------- Normalizzazione min-max su 0-10 ----------
  function norm(raw, higherBetter) {
    const min = Math.min(...raw), max = Math.max(...raw);
    if (max === min) return raw.map(() => 5.0);
    return raw.map(v => higherBetter ? (10 * (v - min) / (max - min)) : (10 * (max - v) / (max - min)));
  }
  const costScore     = norm(costRaw, /*higherBetter*/ false);         // - cost wedge
  const maxDDScore    = norm(maxDDRaw, true);  // raw negativo → "più alto" = meno male (es. -0.319 > -0.336)
  const recovScore    = norm(recoveryRaw, false);
  const worst10Score  = norm(worst10Raw, true);
  const bear22Score   = norm(bear2022Raw, true);
  const robustScore   = labels.map((_, i) => (maxDDScore[i] + recovScore[i] + worst10Score[i] + bear22Score[i]) / 4);

  const usScore       = norm(usRaw, false);   // più USA = meno diversif.
  const techScore     = norm(techRaw, false);
  const emBonusScore  = norm(emRaw, true);    // più EM = bonus diversif. strutturale
  const diversScore   = labels.map((_, i) => (usScore[i] + techScore[i] + emBonusScore[i]) / 3);

  const fwdScore   = labels.map(l => FWD_SCORES[l].score);
  const behavScore = labels.map(l => BEHAV_SCORES[l].score);

  // ---------- WEIGHTED TOTAL — scenari ----------
  const SCENARIOS = {
    'LOCKED   (cost 20 / robust 25 / divers 20 / fwd 20 / behav 15)':
      { cost: 0.20, robust: 0.25, divers: 0.20, fwd: 0.20, behav: 0.15 },
    'A pro-rendimento  (cost 15 / robust 15 / divers 15 / fwd 40 / behav 15)':
      { cost: 0.15, robust: 0.15, divers: 0.15, fwd: 0.40, behav: 0.15 },
    'B pro-robustezza  (cost 10 / robust 35 / divers 20 / fwd 10 / behav 25)':
      { cost: 0.10, robust: 0.35, divers: 0.20, fwd: 0.10, behav: 0.25 },
    'C equipeso        (cost 20 / robust 20 / divers 20 / fwd 20 / behav 20)':
      { cost: 0.20, robust: 0.20, divers: 0.20, fwd: 0.20, behav: 0.20 },
  };

  function weighted(s) {
    return labels.map((_, i) =>
      s.cost * costScore[i] + s.robust * robustScore[i] + s.divers * diversScore[i] +
      s.fwd * fwdScore[i] + s.behav * behavScore[i]
    );
  }

  // ---------- DIAGNOSTICA: punteggi per dimensione (scenario LOCKED) ----------
  console.log('\nDIMENSIONI (0-10) — input dello scoring:');
  console.log('candidato                  | costo | robust | divers | fwd  | behav');
  for (let i = 0; i < labels.length; i++) {
    console.log(`${labels[i].padEnd(26)} | ${costScore[i].toFixed(2).padStart(5)} | ${robustScore[i].toFixed(2).padStart(6)} | ${diversScore[i].toFixed(2).padStart(6)} | ${fwdScore[i].toFixed(2).padStart(4)} | ${behavScore[i].toFixed(2).padStart(5)}`);
  }
  console.log('\nROBUSTEZZA — sub-componenti (media equi-pesata):');
  console.log('candidato                  | maxDD | recov | wor10y | bear22');
  for (let i = 0; i < labels.length; i++) {
    console.log(`${labels[i].padEnd(26)} | ${maxDDScore[i].toFixed(2).padStart(5)} | ${recovScore[i].toFixed(2).padStart(5)} | ${worst10Score[i].toFixed(2).padStart(6)} | ${bear22Score[i].toFixed(2).padStart(6)}`);
  }
  console.log('\nDIVERSIFICAZIONE — sub-componenti (media equi-pesata):');
  console.log('candidato                  | inv-USA | inv-TECH | EM-bonus');
  for (let i = 0; i < labels.length; i++) {
    console.log(`${labels[i].padEnd(26)} | ${usScore[i].toFixed(2).padStart(7)} | ${techScore[i].toFixed(2).padStart(8)} | ${emBonusScore[i].toFixed(2).padStart(8)}`);
  }
  console.log('\nRENDIMENTO ATTESO FORWARD — punteggi giudicati + razionale:');
  for (const l of labels) console.log(`  ${l.padEnd(26)} ${FWD_SCORES[l].score.toFixed(1)} — ${FWD_SCORES[l].why}`);
  console.log('\nBEHAVIORAL FIT — punteggi giudicati + razionale:');
  for (const l of labels) console.log(`  ${l.padEnd(26)} ${BEHAV_SCORES[l].score.toFixed(1)} — ${BEHAV_SCORES[l].why}`);

  // ---------- TABELLA RANKING per scenario ----------
  const rankings = {};
  for (const [scName, w] of Object.entries(SCENARIOS)) {
    const scores = weighted(w);
    const order = labels.map((_, i) => i).sort((a, b) => scores[b] - scores[a]);
    rankings[scName] = { scores, order };
  }

  for (const [scName, { scores, order }] of Object.entries(rankings)) {
    console.log('\n' + '-'.repeat(92));
    console.log(`SCENARIO: ${scName}`);
    console.log('-'.repeat(92));
    console.log('rank | candidato                  | score | (cost  robust divers fwd   behav)');
    for (let r = 0; r < order.length; r++) {
      const i = order[r];
      const w = SCENARIOS[scName];
      const breakdown = `(${(w.cost * costScore[i]).toFixed(2)}  ${(w.robust * robustScore[i]).toFixed(2)}   ${(w.divers * diversScore[i]).toFixed(2)}   ${(w.fwd * fwdScore[i]).toFixed(2)}  ${(w.behav * behavScore[i]).toFixed(2)})`;
      console.log(`${String(r + 1).padStart(2)}   | ${labels[i].padEnd(26)} | ${scores[i].toFixed(2).padStart(5)} | ${breakdown}`);
    }
    const margin = scores[order[0]] - scores[order[1]];
    const marginPct = margin / scores[order[1]];
    console.log(`Margine 1°-2°: ${margin.toFixed(2)} (${(marginPct * 100).toFixed(1)}%) → ${Math.abs(margin) < 0.5 ? 'EQUIVALENTI (margine <0,5)' : 'distinti'}`);
  }

  // ---------- STABILITÀ del vincitore tra scenari ----------
  console.log('\n' + '-'.repeat(92));
  console.log('STABILITÀ VINCITORE TRA SCENARI');
  console.log('-'.repeat(92));
  const winners = Object.entries(rankings).map(([sc, { order }]) => [sc, labels[order[0]]]);
  for (const [sc, w] of winners) console.log(`  ${sc.padEnd(70)} → ${w}`);
  const winnerSet = new Set(winners.map(w => w[1]));
  console.log(`\nVincitori unici: ${[...winnerSet].length} (${[...winnerSet].join(', ')})`);
  if (winnerSet.size === 1) {
    console.log('CONCLUSIONE: vincitore stabile su tutti gli scenari → evidenza più solida.');
  } else {
    console.log('CONCLUSIONE: vincitore CAMBIA al variare dei pesi → nessuna evidenza forte. I candidati sono sostanzialmente equivalenti e la scelta dipende dalle preferenze, non dai dati. Status quo difendibile per inerzia.');
  }

  console.log('\nNB: nessuno scoring applicato a config.js. La decisione finale è dell\'utente.');
}

main();
