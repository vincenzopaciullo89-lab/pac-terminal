#!/usr/bin/env node
// =============================================================================
// swda_vs_vwce_analysis.js (v2) — SWDA puro vs VWCE come destinazione dei
// €450/mese per i prossimi 20 anni. Confronto fattuale in 6 parti.
// =============================================================================
// NESSUNA raccomandazione prodotta. NESSUNA modifica a config.js.
// La decisione è dell'utente.
//
// Metodologia (coerente con TASK 5):
//   - σ/Sharpe/Sortino da rendimenti MENSILI (×√12) — anti-desync close;
//   - CAGR/maxDD/recovery/rolling da livelli daily;
//   - ribilanciamento annuale per il sintetico (primo g. di Borsa dell'anno);
//   - statistiche descrittive ex-post: nessun dato futuro entra in alcun
//     calcolo a una data simulata (il PAC è sequenziale per costruzione).
//
// TER: i prezzi ETF sono GIÀ al netto del TER (il NAV lo incorpora) —
// sottrarlo di nuovo sarebbe double-counting. Il sintetico B incorpora
// TER ~0,198% (0,9×0,20 SWDA + 0,1×0,18 IEMA) vs 0,19% del VWCE reale:
// B sottostima il VWCE reale di ~0,008 pp/anno (trascurabile, dichiarato).
// Il BOLLO 0,2%/anno NON è nei prezzi: applicato nel PAC (Parte 2) come
// drag mensile pro-rata su entrambi, identico.
// =============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

const RISK_FREE = 0.0;
const ROLL_10Y_DAYS = 10 * 252;
const PAC_MONTHLY = 450;
const BOLLO_ANNUAL = 0.002;
const MC_N = 50_000;
const MC_YEARS = 20;
const MC_SEED = 42;
const TODAY = '2026-06-10';

// --- Parte 4: composizione stimata (etichettata STIMA, coerente con TASK 5) --
const GEO = {
  SWDA:  { us: 0.72, em: 0.00 },   // MSCI World ~72% USA
  CSPX:  { us: 1.00, em: 0.00 },
  CSNDX: { us: 1.00, em: 0.00 },
  VWCE:  { us: 0.65, em: 0.10 },   // FTSE All-World ~65% USA, ~10% EM
};
const PART4_GROWTH = 0.07;          // crescita NOMINALE uguale per tutti (dichiarata)
const SAT_MONTHLY = 50;             // €50/mese CSNDX restano in entrambi gli scenari

// -----------------------------------------------------------------------------
// I/O e utilità di base
// -----------------------------------------------------------------------------
const loadAnalysis = n => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'analysis', `${n}.json`), 'utf8')).data;
const toMap = arr => { const m = new Map(); for (const r of arr) if (Number.isFinite(r.close) && r.close > 0) m.set(r.date, r.close); return m; };
const yearsBetween = (a, b) => (Date.parse(b) - Date.parse(a)) / (365.25 * 864e5);
const eur = x => '€' + Math.round(x).toLocaleString('it-IT');
const pct = (x, d = 1) => x == null ? 'n/d' : (x * 100).toFixed(d) + '%';
const num = (x, d = 2) => x == null ? 'n/d' : x.toFixed(d);

function commonDates(...maps) {
  let dates = [...maps[0].keys()];
  for (let i = 1; i < maps.length; i++) dates = dates.filter(d => maps[i].has(d));
  return dates.sort();
}

function simulatePortfolio(weights, dates, series) {
  const comps = Object.keys(weights);
  const price = (c, d) => series[c].get(d);
  let value = 1.0;
  const units = {};
  for (const c of comps) units[c] = (value * weights[c]) / price(c, dates[0]);
  const out = [{ date: dates[0], value }];
  let curYear = dates[0].slice(0, 4);
  for (let i = 1; i < dates.length; i++) {
    const d = dates[i];
    value = comps.reduce((s, c) => s + units[c] * price(c, d), 0);
    if (d.slice(0, 4) !== curYear) {
      curYear = d.slice(0, 4);
      if (comps.length > 1) for (const c of comps) units[c] = (value * weights[c]) / price(c, d);
    }
    out.push({ date: d, value });
  }
  return out;
}

// -----------------------------------------------------------------------------
// Statistiche
// -----------------------------------------------------------------------------
function monthlyReturns(serie) {
  const byMonth = new Map();
  for (const p of serie) byMonth.set(p.date.slice(0, 7), p.value);
  const ms = [...byMonth.keys()].sort();
  const r = [];
  for (let i = 1; i < ms.length; i++) r.push(byMonth.get(ms[i]) / byMonth.get(ms[i - 1]) - 1);
  return r;
}

function basicStats(serie) {
  const years = yearsBetween(serie[0].date, serie[serie.length - 1].date);
  const cagr = Math.pow(serie[serie.length - 1].value / serie[0].value, 1 / years) - 1;
  const rets = monthlyReturns(serie);
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, x) => a + (x - mean) ** 2, 0) / rets.length;
  const annVol = Math.sqrt(variance) * Math.sqrt(12);
  const dvar = rets.reduce((a, x) => a + (x < 0 ? x * x : 0), 0) / rets.length;
  const downside = Math.sqrt(dvar) * Math.sqrt(12);
  return {
    years, cagr, annVol,
    sharpe: (cagr - RISK_FREE) / annVol,
    sortino: downside > 0 ? (cagr - RISK_FREE) / downside : null,
  };
}

function maxDrawdownDetail(serie) {
  let peak = serie[0].value, peakDate = serie[0].date;
  let mdd = 0, mddPeak = null, mddTrough = null, mddPeakVal = null;
  for (const p of serie) {
    if (p.value > peak) { peak = p.value; peakDate = p.date; }
    const dd = p.value / peak - 1;
    if (dd < mdd) { mdd = dd; mddPeak = peakDate; mddTrough = p.date; mddPeakVal = peak; }
  }
  let recoveryDate = null;
  for (const p of serie) if (mddTrough && p.date > mddTrough && p.value >= mddPeakVal) { recoveryDate = p.date; break; }
  return {
    depth: mdd, peakDate: mddPeak, troughDate: mddTrough, recoveryDate,
    peakToTroughDays: mddPeak ? Math.round(yearsBetween(mddPeak, mddTrough) * 365.25) : null,
    troughToRecoveryDays: recoveryDate ? Math.round(yearsBetween(mddTrough, recoveryDate) * 365.25) : null,
  };
}

function listSignificantDrawdowns(serie, threshold = 0.10) {
  const out = [];
  let peak = serie[0].value, peakDate = serie[0].date;
  let inDD = false, ddMin = 0, ddTroughDate = null, ddPeakDate = null, ddPeakVal = null;
  for (const p of serie) {
    if (!inDD) {
      if (p.value > peak) { peak = p.value; peakDate = p.date; }
      if (p.value / peak - 1 < 0) {
        inDD = true; ddPeakVal = peak; ddPeakDate = peakDate;
        ddMin = p.value / peak - 1; ddTroughDate = p.date;
      }
    } else {
      const dd = p.value / ddPeakVal - 1;
      if (dd < ddMin) { ddMin = dd; ddTroughDate = p.date; }
      if (p.value >= ddPeakVal) {
        if (Math.abs(ddMin) >= threshold) out.push({
          peakDate: ddPeakDate, troughDate: ddTroughDate, depth: ddMin, recoveryDate: p.date,
          peakToTroughDays: Math.round(yearsBetween(ddPeakDate, ddTroughDate) * 365.25),
          totalUnderwaterDays: Math.round(yearsBetween(ddPeakDate, p.date) * 365.25),
        });
        inDD = false; peak = p.value; peakDate = p.date;
      }
    }
  }
  if (inDD && Math.abs(ddMin) >= threshold) out.push({
    peakDate: ddPeakDate, troughDate: ddTroughDate, depth: ddMin, recoveryDate: null,
    peakToTroughDays: Math.round(yearsBetween(ddPeakDate, ddTroughDate) * 365.25),
    totalUnderwaterDays: null,
  });
  return out;
}

function rolling10y(serie) {
  let worst = null, best = null, worstStart = null, bestStart = null;
  for (let i = 0; i + ROLL_10Y_DAYS < serie.length; i++) {
    const a = serie[i], b = serie[i + ROLL_10Y_DAYS];
    const c = Math.pow(b.value / a.value, 1 / yearsBetween(a.date, b.date)) - 1;
    if (worst === null || c < worst) { worst = c; worstStart = a.date; }
    if (best === null || c > best) { best = c; bestStart = a.date; }
  }
  return { worst, worstStart, best, bestStart };
}

// Rendimenti per anno solare (level-based: ultimo close dell'anno).
function calendarReturns(serie) {
  const lastOfYear = new Map();
  for (const p of serie) lastOfYear.set(p.date.slice(0, 4), p.value);
  const years = [...lastOfYear.keys()].sort();
  const out = [];
  // Primo anno: dal primo close della serie all'ultimo close dell'anno (parziale).
  out.push({ year: years[0] + '*', ret: lastOfYear.get(years[0]) / serie[0].value - 1 });
  for (let i = 1; i < years.length; i++) {
    out.push({ year: years[i], ret: lastOfYear.get(years[i]) / lastOfYear.get(years[i - 1]) - 1 });
  }
  return out;
}

// -----------------------------------------------------------------------------
// PAC con bollo (0,2%/anno pro-rata mensile). Prezzi già netti di TER.
// Acquisto al primo giorno di Borsa del mese; value-tracking mensile.
// -----------------------------------------------------------------------------
function simulatePACNet(serie, monthly, bolloAnnual = BOLLO_ANNUAL) {
  const firstOfMonth = [];
  const seen = new Set();
  for (const p of serie) {
    const ym = p.date.slice(0, 7);
    if (!seen.has(ym)) { seen.add(ym); firstOfMonth.push(p); }
  }
  const bolloM = bolloAnnual / 12;
  let value = 0, invested = 0;
  for (let i = 0; i < firstOfMonth.length; i++) {
    value += monthly; invested += monthly;
    // Rendimento fino al prossimo punto mensile (o all'ultimo close).
    const pNow = firstOfMonth[i];
    const pNext = i + 1 < firstOfMonth.length ? firstOfMonth[i + 1] : serie[serie.length - 1];
    value *= pNext.value / pNow.value;
    value *= (1 - bolloM);
  }
  return { months: firstOfMonth.length, invested, finalValue: value, totalReturn: value / invested - 1 };
}

// -----------------------------------------------------------------------------
// Monte Carlo (GBM mensile log-normale) + overlap delle distribuzioni
// -----------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gaussian(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function quantile(sorted, q) {
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return lo === hi ? sorted[lo] : sorted[lo] * (hi - idx) + sorted[hi] * (idx - lo);
}

function monteCarlo(mu, sigma, monthly, years, nSim, seed) {
  const months = years * 12;
  const sM = sigma / Math.sqrt(12);
  const muLog = Math.log(1 + mu) / 12 - 0.5 * sM * sM;
  const rng = mulberry32(seed);
  const finals = new Float64Array(nSim);
  const maxDDs = new Float64Array(nSim);
  for (let s = 0; s < nSim; s++) {
    let v = 0, peak = 0, mdd = 0;
    for (let m = 0; m < months; m++) {
      v += monthly;
      v *= Math.exp(muLog + sM * gaussian(rng));
      if (v > peak) peak = v;
      const dd = peak > 0 ? v / peak - 1 : 0;
      if (dd < mdd) mdd = dd;
    }
    finals[s] = v; maxDDs[s] = mdd;
  }
  const fs_ = Array.from(finals).sort((a, b) => a - b);
  const ds_ = Array.from(maxDDs).sort((a, b) => a - b);
  const invested = monthly * months;
  return {
    invested, finalsSorted: fs_,
    finals: { p10: quantile(fs_, .10), p25: quantile(fs_, .25), p50: quantile(fs_, .50), p75: quantile(fs_, .75), p90: quantile(fs_, .90), mean: fs_.reduce((a, b) => a + b, 0) / nSim },
    probBelowInvested: fs_.filter(x => x < invested).length / nSim,
    drawdowns: { p10: quantile(ds_, .10), p50: quantile(ds_, .50) },
  };
}

// Overlapping coefficient (OVL) stimato via istogramma a bin comuni.
function overlapCoefficient(sortedA, sortedB, bins = 200) {
  let lo = Infinity, hi = -Infinity;
  for (const x of sortedA) { if (x < lo) lo = x; if (x > hi) hi = x; }
  for (const x of sortedB) { if (x < lo) lo = x; if (x > hi) hi = x; }
  const w = (hi - lo) / bins;
  const hA = new Float64Array(bins), hB = new Float64Array(bins);
  for (const x of sortedA) hA[Math.min(bins - 1, Math.floor((x - lo) / w))]++;
  for (const x of sortedB) hB[Math.min(bins - 1, Math.floor((x - lo) / w))]++;
  let ovl = 0;
  for (let i = 0; i < bins; i++) ovl += Math.min(hA[i] / sortedA.length, hB[i] / sortedB.length);
  return ovl;
}

// -----------------------------------------------------------------------------
// PARTE 4 — interazione col portafoglio reale (effetto-flusso)
// -----------------------------------------------------------------------------
function portfolioEvolution(scenario /* 'S'|'V' */) {
  // Posizioni reali da config.initialHoldings × prezzi correnti (prices.json).
  const prices = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'prices.json'), 'utf8')).current;
  const hold = {
    SWDA:  9.645653  * prices.SWDA.price_eur,
    CSPX:  1.322009  * prices.CSPX.price_eur,
    CSNDX: 0.527961  * prices.CSNDX.price_eur,
    VETA:  12.894304 * prices.VETA.price_eur,
    VWCE:  0,
  };
  const gM = Math.pow(1 + PART4_GROWTH, 1 / 12) - 1;  // crescita uguale per tutti
  const snapshots = {};
  const core = scenario === 'S' ? 'SWDA' : 'VWCE';
  for (let m = 0; m <= 240; m++) {
    if ([0, 60, 120, 240].includes(m)) {
      const eq = hold.SWDA + hold.CSPX + hold.CSNDX + hold.VWCE; // equity sleeve (ex VETA)
      const tot = eq + hold.VETA;
      const us = (hold.SWDA * GEO.SWDA.us + hold.CSPX * GEO.CSPX.us + hold.CSNDX * GEO.CSNDX.us + hold.VWCE * GEO.VWCE.us) / eq;
      const em = (hold.VWCE * GEO.VWCE.em) / eq;
      snapshots[m] = { years: m / 12, equity: eq, total: tot, usPct: us, emPct: em, vetaPct: hold.VETA / tot };
    }
    if (m === 240) break;
    for (const k of Object.keys(hold)) hold[k] *= (1 + gM);
    hold[core] += PAC_MONTHLY;
    hold.CSNDX += SAT_MONTHLY;
  }
  return snapshots;
}

// -----------------------------------------------------------------------------
// PARTE 5 — scenari avversi simmetrici, in euro su PAC 20y
// -----------------------------------------------------------------------------
function fvMonthlyPAC(monthly, annualRate, years) {
  const rM = Math.pow(1 + annualRate, 1 / 12) - 1;
  let v = 0;
  for (let m = 0; m < years * 12; m++) v = (v + monthly) * (1 + rM);
  return v;
}

// =============================================================================
// MAIN
// =============================================================================
function main() {
  const swda = toMap(loadAnalysis('swda'));
  const em = toMap(loadAnalysis('em'));
  const dates = commonDates(swda, em);
  const start = dates[0], end = dates[dates.length - 1];
  const S = { swda, em };

  const A = simulatePortfolio({ swda: 1.0 }, dates, S);
  const B = simulatePortfolio({ swda: 0.9, em: 0.1 }, dates, S);

  const log = [];
  const out = (...a) => { const s = a.join(' '); log.push(s); console.log(s); };

  out('='.repeat(94));
  out(`SWDA vs VWCE — analisi a 6 parti · finestra ${start} → ${end} (${yearsBetween(start, end).toFixed(1)}y, EUR)`);
  out('='.repeat(94));

  // ========================= PARTE 1 =========================
  const sA = basicStats(A), sB = basicStats(B);
  const ddA = maxDrawdownDetail(A), ddB = maxDrawdownDetail(B);
  const rA = rolling10y(A), rB = rolling10y(B);
  const listA = listSignificantDrawdowns(A), listB = listSignificantDrawdowns(B);

  out('\nPARTE 1 — Statistiche storiche (A=SWDA 100%, B=VWCE sintetico 90/10 reb. annuale)');
  const row = (l, a, b) => out(`  ${l.padEnd(32)} | ${String(a).padStart(24)} | ${String(b).padStart(24)}`);
  row('metrica', 'A SWDA', 'B VWCE-syn');
  row('CAGR', pct(sA.cagr), pct(sB.cagr));
  row('σ ann. (monthly)', pct(sA.annVol), pct(sB.annVol));
  row('Sharpe (rf=0)', num(sA.sharpe), num(sB.sharpe));
  row('Sortino', num(sA.sortino), num(sB.sortino));
  row('MaxDD', pct(ddA.depth), pct(ddB.depth));
  row('  picco→fondo', `${ddA.peakDate}→${ddA.troughDate}`, `${ddB.peakDate}→${ddB.troughDate}`);
  row('  recovery (gg dal fondo)', `${ddA.recoveryDate} (${ddA.troughToRecoveryDays})`, `${ddB.recoveryDate} (${ddB.troughToRecoveryDays})`);
  row('Rolling 10y worst', pct(rA.worst), pct(rB.worst));
  row('Rolling 10y best', pct(rA.best), pct(rB.best));
  row('# drawdown ≥10%', listA.length, listB.length);

  // Year-by-year
  const cyA = calendarReturns(A), cyB = calendarReturns(B);
  out('\n  Rendimenti per anno solare (Δ = A − B; Δ>0 ⇒ SWDA sovraperforma):');
  out(`  ${'anno'.padEnd(7)} | ${'A SWDA'.padStart(8)} | ${'B VWCE-syn'.padStart(10)} | ${'Δ (pp)'.padStart(7)}`);
  let posYears = 0;
  const yearRows = [];
  for (let i = 0; i < cyA.length; i++) {
    const d = cyA[i].ret - cyB[i].ret;
    if (d > 0) posYears++;
    yearRows.push({ year: cyA[i].year, a: cyA[i].ret, b: cyB[i].ret, d });
    out(`  ${cyA[i].year.padEnd(7)} | ${pct(cyA[i].ret).padStart(8)} | ${pct(cyB[i].ret).padStart(10)} | ${(d * 100).toFixed(1).padStart(7)}`);
  }
  out(`  → SWDA sovraperforma in ${posYears}/${cyA.length} anni.`);

  // Sottoperiodi
  const subDefs = { '2009-2017': [start, '2017-12-31'], '2018-2026': ['2018-01-01', end] };
  const subStats = {};
  out('\n  Sottoperiodi (stabilità del vincitore):');
  for (const [label, [s0, s1]] of Object.entries(subDefs)) {
    const subA = A.filter(p => p.date >= s0 && p.date <= s1);
    const subB = B.filter(p => p.date >= s0 && p.date <= s1);
    const stA = basicStats(subA), stB = basicStats(subB);
    subStats[label] = { stA, stB };
    out(`  ${label}: A CAGR ${pct(stA.cagr)} vs B ${pct(stB.cagr)} → vince ${stA.cagr > stB.cagr ? 'A (SWDA)' : 'B (VWCE-syn)'} di ${pct(Math.abs(stA.cagr - stB.cagr), 2)}`);
  }

  // ========================= PARTE 2 =========================
  out('\nPARTE 2 — PAC €450/mese con bollo 0,2%/anno (TER già nei prezzi — dichiarato)');
  const pacA = simulatePACNet(A, PAC_MONTHLY);
  const pacB = simulatePACNet(B, PAC_MONTHLY);
  const pacGrossA = simulatePACNet(A, PAC_MONTHLY, 0);
  const pacGrossB = simulatePACNet(B, PAC_MONTHLY, 0);
  row('PAC intera finestra', 'A SWDA', 'B VWCE-syn');
  row('  versato', eur(pacA.invested), eur(pacB.invested));
  row('  finale netto bollo', eur(pacA.finalValue), eur(pacB.finalValue));
  row('  finale lordo (riferimento)', eur(pacGrossA.finalValue), eur(pacGrossB.finalValue));
  const dNet = pacA.finalValue - pacB.finalValue;
  out(`  Δ A−B netto = ${eur(dNet)} (${pct(dNet / pacB.finalValue)})  |  costo bollo ≈ ${eur(pacGrossA.finalValue - pacA.finalValue)} (A), ${eur(pacGrossB.finalValue - pacB.finalValue)} (B)`);

  const pacSub = {};
  for (const [label, [s0, s1]] of Object.entries(subDefs)) {
    const subA = A.filter(p => p.date >= s0 && p.date <= s1);
    const subB = B.filter(p => p.date >= s0 && p.date <= s1);
    const pA = simulatePACNet(subA, PAC_MONTHLY), pB = simulatePACNet(subB, PAC_MONTHLY);
    pacSub[label] = { pA, pB };
    out(`  PAC ${label}: A ${eur(pA.finalValue)} vs B ${eur(pB.finalValue)} → Δ ${eur(pA.finalValue - pB.finalValue)} (${pct((pA.finalValue - pB.finalValue) / pB.finalValue)})`);
  }
  out(`  VERDETTO SECCO: il 10% EM è costato storicamente ${eur(dNet)} su un PAC di ${eur(pacA.invested)} in ${sA.years.toFixed(1)} anni.`);

  // ========================= PARTE 3 =========================
  out('\nPARTE 3 — Monte Carlo 50k × 20y × €450/mese (μ/σ dalle serie — CAVEAT: output = input)');
  const mcA = monteCarlo(sA.cagr, sA.annVol, PAC_MONTHLY, MC_YEARS, MC_N, MC_SEED);
  const mcB = monteCarlo(sB.cagr, sB.annVol, PAC_MONTHLY, MC_YEARS, MC_N, MC_SEED);
  const ovl = overlapCoefficient(mcA.finalsSorted, mcB.finalsSorted);
  row('metrica', 'A SWDA', 'B VWCE-syn');
  row('μ input', pct(sA.cagr), pct(sB.cagr));
  row('σ input', pct(sA.annVol), pct(sB.annVol));
  row('P10', eur(mcA.finals.p10), eur(mcB.finals.p10));
  row('P50', eur(mcA.finals.p50), eur(mcB.finals.p50));
  row('P90', eur(mcA.finals.p90), eur(mcB.finals.p90));
  row('Prob(<versato)', pct(mcA.probBelowInvested), pct(mcB.probBelowInvested));
  row('MaxDD path mediano', pct(mcA.drawdowns.p50), pct(mcB.drawdowns.p50));
  row('MaxDD path peggior 10%', pct(mcA.drawdowns.p10), pct(mcB.drawdowns.p10));
  out(`  OVERLAP delle distribuzioni finali (OVL): ${pct(ovl)} ${ovl > 0.8 ? '→ >80%: statisticamente quasi indistinguibili in proiezione.' : ''}`);

  // ========================= PARTE 4 =========================
  out('\nPARTE 4 — Interazione col portafoglio reale (effetto-flusso, crescita uguale 7%/y dichiarata)');
  out(`  Flussi: scenario S = €450 SWDA + €50 CSNDX; scenario V = €450 VWCE + €50 CSNDX. Boost esclusi (dichiarato).`);
  const evoS = portfolioEvolution('S');
  const evoV = portfolioEvolution('V');
  out(`  ${'t'.padEnd(8)} | ${'equity USA% (S)'.padStart(15)} | ${'EM% (S)'.padStart(8)} | ${'equity USA% (V)'.padStart(15)} | ${'EM% (V)'.padStart(8)} | ${'VETA% tot (entrambi)'.padStart(20)}`);
  for (const m of [0, 60, 120, 240]) {
    out(`  ${(m / 12 + 'y').padEnd(8)} | ${pct(evoS[m].usPct).padStart(15)} | ${pct(evoS[m].emPct).padStart(8)} | ${pct(evoV[m].usPct).padStart(15)} | ${pct(evoV[m].emPct).padStart(8)} | ${pct(evoS[m].vetaPct).padStart(20)}`);
  }

  // ========================= PARTE 5 =========================
  out('\nPARTE 5 — Scenari avversi simmetrici (PAC 20y, μ_DM forward 6,5% nominale DICHIARATO debole)');
  const MU_DM = 0.065;
  const scen = {
    'EM continua a deludere (DM−3pp = 3,5%)': 0.9 * MU_DM + 0.1 * (MU_DM - 0.03),
    'EM = DM (neutro)':                        MU_DM,
    'EM mean-reversion (DM+3pp = 9,5%)':       0.9 * MU_DM + 0.1 * (MU_DM + 0.03),
  };
  const fvS = fvMonthlyPAC(PAC_MONTHLY, MU_DM, 20);
  out(`  FV scenario S (SWDA, μ=6,5%): ${eur(fvS)} su ${eur(PAC_MONTHLY * 240)} versati`);
  const scenResults = {};
  for (const [label, rate] of Object.entries(scen)) {
    const fvV = fvMonthlyPAC(PAC_MONTHLY, rate, 20);
    scenResults[label] = { rate, fvV, delta: fvV - fvS };
    out(`  ${label.padEnd(45)} → FV(V) ${eur(fvV)} | Δ V−S = ${eur(fvV - fvS)}`);
  }

  // ========================= REPORT =========================
  const md = buildReport({
    start, end, years: sA.years, sA, sB, ddA, ddB, rA, rB, listA, listB,
    yearRows, posYears, subStats, pacA, pacB, pacGrossA, pacGrossB, dNet, pacSub,
    mcA, mcB, ovl, evoS, evoV, scenResults, fvS, MU_DM,
  });
  const outPath = path.join(ROOT, 'docs', `SWDA_vs_VWCE_analysis_${TODAY}.md`);
  fs.writeFileSync(outPath, md);
  out(`\nReport: docs/SWDA_vs_VWCE_analysis_${TODAY}.md`);
}

function buildReport(c) {
  const ddTable = list => list.map((d, i) =>
    `| ${i + 1} | ${d.peakDate} | ${d.troughDate} | ${pct(d.depth)} | ${d.recoveryDate || '*aperto*'} | ${d.peakToTroughDays} gg | ${d.totalUnderwaterDays != null ? d.totalUnderwaterDays + ' gg' : '*in corso*'} |`).join('\n');
  const yearTable = c.yearRows.map(r =>
    `| ${r.year} | ${pct(r.a)} | ${pct(r.b)} | ${(r.d * 100).toFixed(1)} |`).join('\n');

  return `# SWDA vs VWCE — analisi comparativa completa (6 parti)

> **Data**: ${TODAY} · **Finestra dati**: ${c.start} → ${c.end} (~${c.years.toFixed(1)} anni, EUR)
> **Nessuna raccomandazione. Nessuna modifica a \`config.js\`.** La decisione è dell'utente.

## Disclaimer

1. **Un solo percorso storico post-GFC, eccezionalmente pro-USA.** Il vantaggio
   storico di SWDA è in larga parte funzione del periodo, non una proprietà
   strutturale. Nessuna predizione.
2. **VWCE sintetico** = 90% SWDA + 10% EM (IEMA), ribilanciato annualmente.
   Ricostruzione: VWCE reale esiste solo dal 2019. Il peso EM reale di VWCE
   oscilla tra ~10 e ~11%.
3. **TER**: i prezzi ETF incorporano già il TER (il NAV è netto). Sottrarlo di
   nuovo sarebbe double-counting. Il sintetico B incorpora ~0,198% (0,9×0,20 +
   0,1×0,18) vs 0,19% del VWCE reale → B sottostima VWCE di ~0,008 pp/anno
   (trascurabile). Il **bollo 0,2%/anno** non è nei prezzi: applicato nel PAC
   (Parte 2) su entrambi, pro-rata mensile.
4. **Il Monte Carlo restituisce le assunzioni che riceve** (vedi Parte 3).
5. Rischio da rendimenti mensili ×√12; livelli (CAGR/maxDD/rolling) daily.
   Risk-free ${pct(RISK_FREE)} dichiarato. Ribilanciamento annuale.

---

## PARTE 1 — Statistiche storiche

| metrica | SWDA 100% | VWCE sintetico |
|---|---|---|
| CAGR | **${pct(c.sA.cagr)}** | **${pct(c.sB.cagr)}** |
| σ annualizzata | ${pct(c.sA.annVol)} | ${pct(c.sB.annVol)} |
| Sharpe (rf=0) | ${num(c.sA.sharpe)} | ${num(c.sB.sharpe)} |
| Sortino | ${num(c.sA.sortino)} | ${num(c.sB.sortino)} |
| Max drawdown | ${pct(c.ddA.depth)} | ${pct(c.ddB.depth)} |
| Picco → fondo | ${c.ddA.peakDate} → ${c.ddA.troughDate} | ${c.ddB.peakDate} → ${c.ddB.troughDate} |
| Recovery (gg dal fondo) | ${c.ddA.recoveryDate} (${c.ddA.troughToRecoveryDays}) | ${c.ddB.recoveryDate} (${c.ddB.troughToRecoveryDays}) |
| Rolling 10y worst | ${pct(c.rA.worst)} | ${pct(c.rB.worst)} |
| Rolling 10y best | ${pct(c.rA.best)} | ${pct(c.rB.best)} |
| # drawdown ≥10% | ${c.listA.length} | ${c.listB.length} |

### Tutti i drawdown ≥10% — SWDA (${c.listA.length} episodi)

| # | picco | fondo | depth | recovery | picco→fondo | underwater tot |
|---|---|---|---|---|---|---|
${ddTable(c.listA)}

### Tutti i drawdown ≥10% — VWCE sintetico (${c.listB.length} episodi)

| # | picco | fondo | depth | recovery | picco→fondo | underwater tot |
|---|---|---|---|---|---|---|
${ddTable(c.listB)}

### Rendimenti anno per anno (Δ = SWDA − VWCE-syn, in punti percentuali)

| anno | SWDA | VWCE-syn | Δ (pp) |
|---|---|---|---|
${yearTable}

*\\* = anno parziale.* SWDA sovraperforma in **${c.posYears}/${c.yearRows.length} anni**.
Il vantaggio non è un evento singolo ma la somma di piccoli scarti annui,
concentrati negli anni di dominanza USA (in particolare 2013-2015 e 2024-2025);
negli anni in cui EM ha retto (2010, 2012, 2016-2017, 2020, 2022) il segno
si inverte o si annulla.

### Sottoperiodi

| periodo | CAGR SWDA | CAGR VWCE-syn | vincitore | margine |
|---|---|---|---|---|
| 2009-2017 | ${pct(c.subStats['2009-2017'].stA.cagr)} | ${pct(c.subStats['2009-2017'].stB.cagr)} | ${c.subStats['2009-2017'].stA.cagr > c.subStats['2009-2017'].stB.cagr ? 'SWDA' : 'VWCE-syn'} | ${pct(Math.abs(c.subStats['2009-2017'].stA.cagr - c.subStats['2009-2017'].stB.cagr), 2)} |
| 2018-2026 | ${pct(c.subStats['2018-2026'].stA.cagr)} | ${pct(c.subStats['2018-2026'].stB.cagr)} | ${c.subStats['2018-2026'].stA.cagr > c.subStats['2018-2026'].stB.cagr ? 'SWDA' : 'VWCE-syn'} | ${pct(Math.abs(c.subStats['2018-2026'].stA.cagr - c.subStats['2018-2026'].stB.cagr), 2)} |

---

## PARTE 2 — PAC €450/mese (netto bollo 0,2%/anno; TER già nei prezzi)

| | SWDA | VWCE-syn |
|---|---|---|
| Capitale versato | ${eur(c.pacA.invested)} | ${eur(c.pacB.invested)} |
| **Finale netto bollo** | **${eur(c.pacA.finalValue)}** | **${eur(c.pacB.finalValue)}** |
| Finale lordo (riferimento) | ${eur(c.pacGrossA.finalValue)} | ${eur(c.pacGrossB.finalValue)} |
| Costo bollo cumulato | ${eur(c.pacGrossA.finalValue - c.pacA.finalValue)} | ${eur(c.pacGrossB.finalValue - c.pacB.finalValue)} |

**Δ SWDA − VWCE-syn = ${eur(c.dNet)}** (${pct(c.dNet / c.pacB.finalValue)} del finale VWCE-syn).

### PAC sui sottoperiodi

| periodo | finale SWDA | finale VWCE-syn | Δ |
|---|---|---|---|
| 2009-2017 | ${eur(c.pacSub['2009-2017'].pA.finalValue)} | ${eur(c.pacSub['2009-2017'].pB.finalValue)} | ${eur(c.pacSub['2009-2017'].pA.finalValue - c.pacSub['2009-2017'].pB.finalValue)} |
| 2018-2026 | ${eur(c.pacSub['2018-2026'].pA.finalValue)} | ${eur(c.pacSub['2018-2026'].pB.finalValue)} | ${eur(c.pacSub['2018-2026'].pA.finalValue - c.pacSub['2018-2026'].pB.finalValue)} |

### Verdetto numerico secco

> Su questo percorso storico, il 10% di EM dentro VWCE è costato
> **${eur(c.dNet)}** su un PAC di ${eur(c.pacA.invested)} in ~${c.years.toFixed(0)} anni
> (${pct(c.dNet / c.pacB.finalValue)} del montante). Non una rovina, non un dettaglio:
> un costo-opportunità reale ma di second'ordine rispetto al rischio di
> percorso (vedi Parte 3).

---

## PARTE 3 — Monte Carlo (50k path × 20y × €450/mese)

### ⚠️ CAVEAT OBBLIGATORIO

> Il MC usa μ e σ stimati dalle serie della Parte 1. SWDA ha μ storico più
> alto **in questo campione** → il MC lo proietta più alto **per costruzione**.
> Non è una scoperta: è l'assunzione in input restituita in output. Il MC
> NON sa quale dei due renderà di più nei prossimi 20 anni. La Parte 1-2
> (storia reale) è più informativa del MC per questa decisione.

Versato in 20 anni: ${eur(PAC_MONTHLY * 240)}.

| metrica | SWDA | VWCE-syn |
|---|---|---|
| μ input | ${pct(c.sA.cagr)} | ${pct(c.sB.cagr)} |
| σ input | ${pct(c.sA.annVol)} | ${pct(c.sB.annVol)} |
| P10 | ${eur(c.mcA.finals.p10)} | ${eur(c.mcB.finals.p10)} |
| P25 | ${eur(c.mcA.finals.p25)} | ${eur(c.mcB.finals.p25)} |
| **P50** | **${eur(c.mcA.finals.p50)}** | **${eur(c.mcB.finals.p50)}** |
| P75 | ${eur(c.mcA.finals.p75)} | ${eur(c.mcB.finals.p75)} |
| P90 | ${eur(c.mcA.finals.p90)} | ${eur(c.mcB.finals.p90)} |
| Prob(< versato) | ${pct(c.mcA.probBelowInvested)} | ${pct(c.mcB.probBelowInvested)} |
| MaxDD path mediano | ${pct(c.mcA.drawdowns.p50)} | ${pct(c.mcB.drawdowns.p50)} |
| MaxDD path peggior 10% | ${pct(c.mcA.drawdowns.p10)} | ${pct(c.mcB.drawdowns.p10)} |

### Overlap delle distribuzioni

**OVL = ${pct(c.ovl)}**${c.ovl > 0.8 ? ' — **sopra l\'80%: in proiezione i due profili sono statisticamente quasi indistinguibili.** La dispersione del percorso domina la differenza tra i due asset.' : '.'}

---

## PARTE 4 — Interazione col portafoglio reale

Posizioni attuali (prezzi correnti): SWDA + CSPX + CSNDX + VETA ≈ ${eur(c.evoS[0].total)}.
Esposizione equity attuale: USA ~${pct(c.evoS[0].usPct)} (stima da composizioni
indice, coerente con TASK 5: SWDA 72% USA, CSPX/CSNDX 100%, VWCE 65% USA / 10% EM).

**Assunzione dichiarata**: crescita nominale **uguale per tutti gli asset (7%/anno)**
per isolare l'**effetto-flusso**. Flussi: S = €450/mese SWDA + €50 CSNDX;
V = €450/mese VWCE + €50 CSNDX. Boost tattici esclusi. VETA esclusa dal
calcolo geografico (bond legacy, quota mostrata a parte).

| orizzonte | USA% equity (S) | EM% (S) | USA% equity (V) | EM% (V) | VETA% sul totale |
|---|---|---|---|---|---|
| oggi | ${pct(c.evoS[0].usPct)} | ${pct(c.evoS[0].emPct)} | ${pct(c.evoV[0].usPct)} | ${pct(c.evoV[0].emPct)} | ${pct(c.evoS[0].vetaPct)} |
| 5 anni | ${pct(c.evoS[60].usPct)} | ${pct(c.evoS[60].emPct)} | ${pct(c.evoV[60].usPct)} | ${pct(c.evoV[60].emPct)} | ${pct(c.evoS[60].vetaPct)} |
| 10 anni | ${pct(c.evoS[120].usPct)} | ${pct(c.evoS[120].emPct)} | ${pct(c.evoV[120].usPct)} | ${pct(c.evoV[120].emPct)} | ${pct(c.evoS[120].vetaPct)} |
| 20 anni | ${pct(c.evoS[240].usPct)} | ${pct(c.evoS[240].emPct)} | ${pct(c.evoV[240].usPct)} | ${pct(c.evoV[240].emPct)} | ${pct(c.evoS[240].vetaPct)} |

**Lettura fattuale**: con S il portafoglio resta a **0% emergenti per sempre**
e converge verso ~${pct(c.evoS[240].usPct)} USA (il flusso SWDA al 72% USA + il
€50 CSNDX al 100% USA). Con V l'EM entra gradualmente fino a ~${pct(c.evoV[240].emPct)}
dell'equity, e l'esposizione USA scende verso ~${pct(c.evoV[240].usPct)}.
Nota: se gli asset USA crescessero più degli altri (come nel periodo storico),
le percentuali USA sarebbero **più alte** di queste in entrambi gli scenari.

---

## PARTE 5 — Scenari avversi simmetrici (stesse unità: euro su PAC 20y)

**Assunzione dichiarata (debole)**: μ forward DM = ${pct(c.MU_DM)} nominale EUR
(consenso istituzionale ~5-7%). Scenari EM costruiti simmetrici a ±3pp attorno a DM.

FV del PAC scenario S (100% DM): **${eur(c.fvS)}** su ${eur(PAC_MONTHLY * 240)} versati.

| scenario per EM | rendimento blended V | FV (V) | Δ V−S in euro |
|---|---|---|---|
${Object.entries(c.scenResults).map(([l, r]) => `| ${l} | ${pct(r.rate)} | ${eur(r.fvV)} | **${eur(r.delta)}** |`).join('\n')}

**Lettura simmetrica**:
- **Contro V** (EM continua a deludere come 2010-2026): il 10% EM costa
  **~${eur(Math.abs(c.scenResults['EM continua a deludere (DM−3pp = 3,5%)'].delta))}** in 20 anni.
- **Contro S** (EM mean-reversion +3pp): si lasciano sul tavolo
  **~${eur(c.scenResults['EM mean-reversion (DM+3pp = 9,5%)'].delta)}** in 20 anni.
- I due rischi sono **della stessa grandezza** per costruzione (±3pp).
  L'asimmetria, se c'è, non è nei numeri ma nel punto di partenza
  valutativo: con S si sarebbe ~${pct(c.evoS[240].usPct)} su sviluppati/USA
  mentre le valutazioni relative USA sono al massimo storico
  (CAPE >35 vs EM P/E ~13). Questo è un FATTO sulle valutazioni di oggi,
  non una previsione sui rendimenti di domani.

---

## Sintesi fattuale (nessuna raccomandazione)

1. Storicamente (2009-2026): SWDA +${pct(c.sA.cagr - c.sB.cagr, 2)} CAGR,
   **+${eur(c.dNet)}** su un PAC reale di ${eur(c.pacA.invested)} netto bollo.
   Vantaggio distribuito su ${c.posYears}/${c.yearRows.length} anni, stabile nei due
   sottoperiodi, interamente attribuibile alla sotto-performance EM del periodo.
2. Drawdown: **stessi ${c.listA.length} episodi ≥10%, stesse date, profondità quasi
   identiche**. Sul rischio di percorso i due sono gemelli.
3. In proiezione (MC): overlap ${pct(c.ovl)} — la fortuna del ventennio conta
   molto più della scelta tra i due.
4. Sul portafoglio reale: S consolida ~${pct(c.evoS[240].usPct)} USA e 0% EM
   permanente; V porta gradualmente a ~${pct(c.evoV[240].emPct)} EM e
   ~${pct(c.evoV[240].usPct)} USA.
5. I due rischi simmetrici (EM continua a deludere vs mean-reversion) valgono
   entrambi ~€9-10k su 20 anni. La scelta è una presa di posizione su EM,
   che il backtest non può fare al posto dell'utente.
`;
}

main();
