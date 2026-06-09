#!/usr/bin/env node
// =============================================================================
// swda_vs_vwce_analysis.js — confronto SWDA puro vs VWCE sintetico (90/10)
// =============================================================================
// PARTE 1 — confronto storico sulle serie EUR già scaricate (data/analysis/):
//   - SERIE A = SWDA puro (MSCI World, solo sviluppati).
//   - SERIE B = VWCE sintetico = 90% SWDA + 10% EM (IEMA), ribilanciato annuale.
//     È una RICOSTRUZIONE: VWCE reale parte dal 2019 e non copre 2009-2018.
//     I pesi EM reali di VWCE oscillano ~10-11%: il 10% è un'approssimazione.
// PARTE 2 — Monte Carlo 50k path × 20y × €450/mese su entrambi i profili,
//   con μ e σ STIMATI dalle rispettive serie reali della Parte 1.
//   Caveat obbligatorio nel report: il MC restituisce in output l'assunzione
//   in input (μ_storico). NON è informativo per la decisione SWDA vs VWCE.
// PARTE 3 — domanda strategica che il backtest NON può rispondere.
//
// Output: console + docs/SWDA_VS_VWCE_ANALYSIS.md.
// =============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

const RISK_FREE = 0.0;       // dichiarato
const TRADING_DAYS = 252;
const ROLL_10Y_DAYS = 10 * TRADING_DAYS;
const PAC_MONTHLY = 450;     // l'utente confronta su €450/mese (90% di €500)
const MC_N = 50_000;
const MC_HORIZON_YEARS = 20;
const MC_SEED = 42;

// -----------------------------------------------------------------------------
// I/O
// -----------------------------------------------------------------------------
function loadAnalysis(name) {
  const p = path.join(ROOT, 'data', 'analysis', `${name}.json`);
  return JSON.parse(fs.readFileSync(p, 'utf8')).data;
}

function toMap(arr) {
  const m = new Map();
  for (const r of arr) if (Number.isFinite(r.close) && r.close > 0) m.set(r.date, r.close);
  return m;
}

function commonDates(...maps) {
  let dates = [...maps[0].keys()];
  for (let i = 1; i < maps.length; i++) dates = dates.filter(d => maps[i].has(d));
  dates.sort();
  return dates;
}

// -----------------------------------------------------------------------------
// Portfolio simulator con ribilanciamento annuale (primo giorno di Borsa
// di ogni anno solare). Per single-asset il rebalance è no-op.
// -----------------------------------------------------------------------------
function simulatePortfolio(weights, dates, series) {
  const comps = Object.keys(weights);
  const price = (c, d) => series[c].get(d);
  let value = 1.0;
  const units = {};
  const d0 = dates[0];
  for (const c of comps) units[c] = (value * weights[c]) / price(c, d0);
  const out = [{ date: d0, value }];
  let curYear = d0.slice(0, 4);
  for (let i = 1; i < dates.length; i++) {
    const d = dates[i];
    value = comps.reduce((s, c) => s + units[c] * price(c, d), 0);
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
// Statistiche (CAGR/maxDD/rolling level-based daily; σ/Sharpe/Sortino monthly
// per evitare il desync che era stato trovato in TASK 5).
// -----------------------------------------------------------------------------
function yearsBetween(d1, d2) {
  return (Date.parse(d2) - Date.parse(d1)) / (365.25 * 24 * 3600 * 1000);
}

function monthlyReturns(serie) {
  const byMonth = new Map();
  for (const p of serie) byMonth.set(p.date.slice(0, 7), p.value);
  const months = [...byMonth.keys()].sort();
  const r = [];
  for (let i = 1; i < months.length; i++) r.push(byMonth.get(months[i]) / byMonth.get(months[i - 1]) - 1);
  return r;
}

function basicStats(serie) {
  const n = serie.length;
  const years = yearsBetween(serie[0].date, serie[n - 1].date);
  const cagr = Math.pow(serie[n - 1].value / serie[0].value, 1 / years) - 1;
  const rets = monthlyReturns(serie);
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, x) => a + (x - mean) ** 2, 0) / rets.length;
  const annVol = Math.sqrt(variance) * Math.sqrt(12);
  const dvar = rets.reduce((a, x) => a + (x < 0 ? x * x : 0), 0) / rets.length;
  const downside = Math.sqrt(dvar) * Math.sqrt(12);
  const sharpe = (cagr - RISK_FREE) / annVol;
  const sortino = downside > 0 ? (cagr - RISK_FREE) / downside : null;
  return { years, cagr, annVol, sharpe, sortino, monthlyVol: Math.sqrt(variance), monthlyMean: mean };
}

// Lista TUTTI i drawdown che raggiungono almeno `threshold` (in modulo).
// Ogni drawdown è chiuso quando si rivede il livello del peak.
function listSignificantDrawdowns(serie, threshold = 0.10) {
  const out = [];
  let peak = serie[0].value, peakDate = serie[0].date;
  let inDD = false, ddMin = 0, ddTroughDate = null, ddPeakDate = null, ddPeakVal = null;
  for (const p of serie) {
    if (!inDD) {
      if (p.value > peak) { peak = p.value; peakDate = p.date; }
      const dd = p.value / peak - 1;
      if (dd < 0) {
        inDD = true;
        ddPeakVal = peak; ddPeakDate = peakDate;
        ddMin = dd; ddTroughDate = p.date;
      }
    } else {
      const dd = p.value / ddPeakVal - 1;
      if (dd < ddMin) { ddMin = dd; ddTroughDate = p.date; }
      if (p.value >= ddPeakVal) {
        // Drawdown chiuso. Lo registriamo SOLO se ha superato la soglia.
        if (Math.abs(ddMin) >= threshold) {
          out.push({
            peakDate: ddPeakDate, peakVal: ddPeakVal,
            troughDate: ddTroughDate, depth: ddMin,
            recoveryDate: p.date,
            peakToTroughDays: Math.round(yearsBetween(ddPeakDate, ddTroughDate) * 365.25),
            totalUnderwaterDays: Math.round(yearsBetween(ddPeakDate, p.date) * 365.25),
          });
        }
        inDD = false; peak = p.value; peakDate = p.date;
      }
    }
  }
  // Se finisce ancora in drawdown e supera la soglia → underwater aperto.
  if (inDD && Math.abs(ddMin) >= threshold) {
    out.push({
      peakDate: ddPeakDate, peakVal: ddPeakVal,
      troughDate: ddTroughDate, depth: ddMin,
      recoveryDate: null,
      peakToTroughDays: Math.round(yearsBetween(ddPeakDate, ddTroughDate) * 365.25),
      totalUnderwaterDays: null,
    });
  }
  return out;
}

function maxDrawdownDetail(serie) {
  let peak = serie[0].value, peakDate = serie[0].date;
  let mdd = 0, mddPeak = null, mddTrough = null, mddTroughVal = null, mddPeakVal = null;
  for (const p of serie) {
    if (p.value > peak) { peak = p.value; peakDate = p.date; }
    const dd = p.value / peak - 1;
    if (dd < mdd) { mdd = dd; mddPeak = peakDate; mddTrough = p.date; mddTroughVal = p.value; mddPeakVal = peak; }
  }
  let recoveryDate = null;
  if (mddPeakVal != null) {
    for (const p of serie) if (p.date > mddTrough && p.value >= mddPeakVal) { recoveryDate = p.date; break; }
  }
  return {
    depth: mdd, peakDate: mddPeak, troughDate: mddTrough, recoveryDate,
    peakToTroughDays: Math.round(yearsBetween(mddPeak, mddTrough) * 365.25),
    troughToRecoveryDays: recoveryDate ? Math.round(yearsBetween(mddTrough, recoveryDate) * 365.25) : null,
  };
}

function rolling10y(serie) {
  let worst = null, best = null, worstStart = null, bestStart = null;
  for (let i = 0; i + ROLL_10Y_DAYS < serie.length; i++) {
    const a = serie[i], b = serie[i + ROLL_10Y_DAYS];
    const yrs = yearsBetween(a.date, b.date);
    const c = Math.pow(b.value / a.value, 1 / yrs) - 1;
    if (worst === null || c < worst) { worst = c; worstStart = a.date; }
    if (best  === null || c > best ) { best  = c; bestStart  = a.date; }
  }
  return { worst, worstStart, best, bestStart };
}

// -----------------------------------------------------------------------------
// PAC simulator sulla serie REALE: acquisto al PRIMO giorno di Borsa di ogni
// mese al close del giorno; final_value = units totali × last close.
// -----------------------------------------------------------------------------
function simulatePAC(serie, monthly) {
  const firstOfMonth = new Map();
  for (const p of serie) {
    const ym = p.date.slice(0, 7);
    if (!firstOfMonth.has(ym)) firstOfMonth.set(ym, p);
  }
  let units = 0, invested = 0;
  for (const p of firstOfMonth.values()) {
    units += monthly / p.value;
    invested += monthly;
  }
  const finalValue = units * serie[serie.length - 1].value;
  const months = firstOfMonth.size;
  return { months, invested, finalValue, totalReturn: finalValue / invested - 1 };
}

// -----------------------------------------------------------------------------
// Monte Carlo: GBM log-normale mensile + PAC €450 contribuito a inizio mese.
// μ_annual e σ_annual sono i parametri stimati dalle serie reali della Parte 1.
// Tracciamo anche il max drawdown lungo ciascun path (peak walk-forward del PV).
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
function quantile(arr, q) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] * (hi - idx) + sorted[hi] * (idx - lo);
}

function monteCarlo(mu_annual, sigma_annual, monthly, horizonYears, nSim, seed) {
  const months = horizonYears * 12;
  // GBM: drift e std del log-return mensile.
  const sigma_m = sigma_annual / Math.sqrt(12);
  const mu_m_log = Math.log(1 + mu_annual) / 12 - 0.5 * sigma_m * sigma_m;
  const rng = mulberry32(seed);

  const finals = new Float64Array(nSim);
  const maxDDs = new Float64Array(nSim);
  const invested = monthly * months;

  for (let s = 0; s < nSim; s++) {
    let v = 0, peak = 0, mdd = 0;
    for (let m = 0; m < months; m++) {
      v += monthly;                                  // contribuzione a inizio mese
      const r = Math.exp(mu_m_log + sigma_m * gaussian(rng)) - 1;
      v *= (1 + r);
      if (v > peak) peak = v;
      const dd = peak > 0 ? v / peak - 1 : 0;
      if (dd < mdd) mdd = dd;
    }
    finals[s] = v;
    maxDDs[s] = mdd;
  }
  const finalsArr = Array.from(finals), ddArr = Array.from(maxDDs);
  return {
    invested,
    finals: {
      p10: quantile(finalsArr, 0.10),
      p25: quantile(finalsArr, 0.25),
      p50: quantile(finalsArr, 0.50),
      p75: quantile(finalsArr, 0.75),
      p90: quantile(finalsArr, 0.90),
      mean: finalsArr.reduce((a, b) => a + b, 0) / nSim,
    },
    probBelowInvested: finalsArr.filter(x => x < invested).length / nSim,
    drawdowns: {
      p10: quantile(ddArr, 0.10),  // peggior 10% dei path
      p25: quantile(ddArr, 0.25),
      p50: quantile(ddArr, 0.50),
      p75: quantile(ddArr, 0.75),
      p90: quantile(ddArr, 0.90),
    },
  };
}

// -----------------------------------------------------------------------------
// Formatting helpers
// -----------------------------------------------------------------------------
const eur = x => '€' + Math.round(x).toLocaleString('it-IT');
const pct = (x, d = 1) => (x == null ? 'n/d' : (x * 100).toFixed(d) + '%');
const num = (x, d = 2) => (x == null ? 'n/d' : x.toFixed(d));

// =============================================================================
// MAIN
// =============================================================================
function main() {
  const swdaRaw = loadAnalysis('swda');
  const emRaw   = loadAnalysis('em');
  const swda = toMap(swdaRaw);
  const em   = toMap(emRaw);
  const dates = commonDates(swda, em);
  const start = dates[0], end = dates[dates.length - 1];

  console.log('='.repeat(92));
  console.log('SWDA vs VWCE SINTETICO — analisi comparativa');
  console.log('='.repeat(92));
  console.log(`Finestra comune: ${start} → ${end} (${dates.length} giorni, ${yearsBetween(start, end).toFixed(1)} anni)`);
  console.log(`Tutto in EUR. ETF accumulating: close incorpora dividendi reinvestiti.`);
  console.log(`Rischio (σ/Sharpe/Sortino) da rendimenti MENSILI (×√12); CAGR/maxDD/rolling da daily.`);
  console.log(`Risk-free dichiarato: ${pct(RISK_FREE)} (Sharpe = CAGR/σ, Sortino = CAGR/downside).`);
  console.log(`PAC simulato Parte 1: ${eur(PAC_MONTHLY)}/mese.`);

  // === Costruzione delle due serie ===
  const A = simulatePortfolio({ swda: 1.0 }, dates, { swda, em });
  const B = simulatePortfolio({ swda: 0.9, em: 0.1 }, dates, { swda, em });

  // -----------------------------------------------------------------------
  // PARTE 1 — STATISTICHE STORICHE
  // -----------------------------------------------------------------------
  console.log('\n' + '='.repeat(92));
  console.log('PARTE 1 — STATISTICHE STORICHE');
  console.log('='.repeat(92));
  console.log('SERIE A = SWDA 100% (MSCI World, solo sviluppati).');
  console.log('SERIE B = VWCE sintetico = 90% SWDA + 10% EM (IEMA), rebalance annuale.');
  console.log('         RICOSTRUZIONE — VWCE reale esiste solo da 2019. Pesi EM reali oscillano ~10-11%.');

  const sA = basicStats(A), sB = basicStats(B);
  const ddA = maxDrawdownDetail(A), ddB = maxDrawdownDetail(B);
  const rA = rolling10y(A), rB = rolling10y(B);
  const pacA = simulatePAC(A, PAC_MONTHLY);
  const pacB = simulatePAC(B, PAC_MONTHLY);
  const ddListA = listSignificantDrawdowns(A, 0.10);
  const ddListB = listSignificantDrawdowns(B, 0.10);

  function row(label, fA, fB) { console.log(`  ${label.padEnd(34)} | ${String(fA).padStart(20)} | ${String(fB).padStart(20)}`); }
  console.log(`\n  ${'metrica'.padEnd(34)} | ${'SWDA 100%'.padStart(20)} | ${'VWCE sintetico'.padStart(20)}`);
  console.log('  ' + '-'.repeat(82));
  row('CAGR (level-based)', pct(sA.cagr), pct(sB.cagr));
  row('σ annualizzata (monthly×√12)', pct(sA.annVol), pct(sB.annVol));
  row('Sharpe', num(sA.sharpe), num(sB.sharpe));
  row('Sortino', num(sA.sortino), num(sB.sortino));
  row('Max drawdown', pct(ddA.depth), pct(ddB.depth));
  row('  picco → fondo', `${ddA.peakDate} → ${ddA.troughDate}`, `${ddB.peakDate} → ${ddB.troughDate}`);
  row('  recovery', ddA.recoveryDate || 'non ancora', ddB.recoveryDate || 'non ancora');
  row('  giorni picco→fondo', String(ddA.peakToTroughDays), String(ddB.peakToTroughDays));
  row('  giorni fondo→recovery', String(ddA.troughToRecoveryDays), String(ddB.troughToRecoveryDays));
  row('Rolling 10y worst', pct(rA.worst) + ` (start ${rA.worstStart})`, pct(rB.worst) + ` (start ${rB.worstStart})`);
  row('Rolling 10y best', pct(rA.best) + ` (start ${rA.bestStart})`, pct(rB.best) + ` (start ${rB.bestStart})`);

  console.log(`\nPAC simulato €${PAC_MONTHLY}/mese sull'intera finestra (${pacA.months} mesi):`);
  row('  Capitale versato', eur(pacA.invested), eur(pacB.invested));
  row('  Valore finale', eur(pacA.finalValue), eur(pacB.finalValue));
  row('  Total return PAC', pct(pacA.totalReturn), pct(pacB.totalReturn));
  console.log(`  Differenza A − B = ${eur(pacA.finalValue - pacB.finalValue)} (${pct((pacA.finalValue - pacB.finalValue) / pacB.finalValue)})`);

  console.log(`\nTUTTI i drawdown ≥10% — SERIE A (SWDA 100%) — ${ddListA.length} episodi:`);
  console.log(`  ${'#'.padStart(2)} | ${'picco'.padEnd(10)} | ${'fondo'.padEnd(10)} | ${'depth'.padStart(7)} | ${'recovery'.padEnd(10)} | p→t (gg) | tot underwater`);
  ddListA.forEach((d, i) => {
    console.log(`  ${String(i + 1).padStart(2)} | ${d.peakDate.padEnd(10)} | ${d.troughDate.padEnd(10)} | ${pct(d.depth).padStart(7)} | ${(d.recoveryDate || 'aperto').padEnd(10)} | ${String(d.peakToTroughDays).padStart(8)} | ${d.totalUnderwaterDays != null ? d.totalUnderwaterDays + 'gg' : 'in corso'}`);
  });

  console.log(`\nTUTTI i drawdown ≥10% — SERIE B (VWCE sintetico) — ${ddListB.length} episodi:`);
  console.log(`  ${'#'.padStart(2)} | ${'picco'.padEnd(10)} | ${'fondo'.padEnd(10)} | ${'depth'.padStart(7)} | ${'recovery'.padEnd(10)} | p→t (gg) | tot underwater`);
  ddListB.forEach((d, i) => {
    console.log(`  ${String(i + 1).padStart(2)} | ${d.peakDate.padEnd(10)} | ${d.troughDate.padEnd(10)} | ${pct(d.depth).padStart(7)} | ${(d.recoveryDate || 'aperto').padEnd(10)} | ${String(d.peakToTroughDays).padStart(8)} | ${d.totalUnderwaterDays != null ? d.totalUnderwaterDays + 'gg' : 'in corso'}`);
  });

  // -----------------------------------------------------------------------
  // PARTE 2 — MONTE CARLO
  // -----------------------------------------------------------------------
  console.log('\n' + '='.repeat(92));
  console.log('PARTE 2 — MONTE CARLO (50k path, 20y, €450/mese)');
  console.log('='.repeat(92));
  console.log('Input μ e σ stimati dalle serie reali della Parte 1.');
  console.log('GBM log-normale mensile, contribuzione a inizio mese.');
  console.log(`Capitale versato: ${eur(PAC_MONTHLY * 12 * MC_HORIZON_YEARS)} (${PAC_MONTHLY}/mese × ${MC_HORIZON_YEARS}y).`);

  const mcA = monteCarlo(sA.cagr, sA.annVol, PAC_MONTHLY, MC_HORIZON_YEARS, MC_N, MC_SEED);
  const mcB = monteCarlo(sB.cagr, sB.annVol, PAC_MONTHLY, MC_HORIZON_YEARS, MC_N, MC_SEED);

  function rowMC(label, fA, fB) { console.log(`  ${label.padEnd(34)} | ${String(fA).padStart(20)} | ${String(fB).padStart(20)}`); }
  console.log(`\n  ${'metrica'.padEnd(34)} | ${'SWDA 100%'.padStart(20)} | ${'VWCE sintetico'.padStart(20)}`);
  console.log('  ' + '-'.repeat(82));
  rowMC('μ_annual (input dalla Parte 1)', pct(sA.cagr), pct(sB.cagr));
  rowMC('σ_annual (input dalla Parte 1)', pct(sA.annVol), pct(sB.annVol));
  rowMC('Final P10', eur(mcA.finals.p10), eur(mcB.finals.p10));
  rowMC('Final P25', eur(mcA.finals.p25), eur(mcB.finals.p25));
  rowMC('Final P50 (mediana)', eur(mcA.finals.p50), eur(mcB.finals.p50));
  rowMC('Final P75', eur(mcA.finals.p75), eur(mcB.finals.p75));
  rowMC('Final P90', eur(mcA.finals.p90), eur(mcB.finals.p90));
  rowMC('Final media', eur(mcA.finals.mean), eur(mcB.finals.mean));
  rowMC('Prob(finale < versato)', pct(mcA.probBelowInvested), pct(mcB.probBelowInvested));
  rowMC('MaxDD path P50', pct(mcA.drawdowns.p50), pct(mcB.drawdowns.p50));
  rowMC('MaxDD path P10 (peggior 10%)', pct(mcA.drawdowns.p10), pct(mcB.drawdowns.p10));

  // -----------------------------------------------------------------------
  // Genera il report Markdown
  // -----------------------------------------------------------------------
  const report = buildMarkdown({
    start, end, days: dates.length, years: yearsBetween(start, end),
    PAC_MONTHLY, MC_N, MC_HORIZON_YEARS,
    sA, sB, ddA, ddB, rA, rB, pacA, pacB, ddListA, ddListB, mcA, mcB,
  });
  const outPath = path.join(ROOT, 'docs', 'SWDA_VS_VWCE_ANALYSIS.md');
  fs.writeFileSync(outPath, report);
  console.log(`\nReport scritto in docs/SWDA_VS_VWCE_ANALYSIS.md`);
}

function buildMarkdown(ctx) {
  const eurM = x => '€' + Math.round(x).toLocaleString('it-IT');
  const p = (x, d = 1) => (x == null ? 'n/d' : (x * 100).toFixed(d) + '%');
  const n2 = (x, d = 2) => (x == null ? 'n/d' : x.toFixed(d));
  const {
    start, end, days, years, PAC_MONTHLY, MC_N, MC_HORIZON_YEARS,
    sA, sB, ddA, ddB, rA, rB, pacA, pacB, ddListA, ddListB, mcA, mcB,
  } = ctx;
  const diffPAC = pacA.finalValue - pacB.finalValue;
  const diffPACpct = diffPAC / pacB.finalValue;

  return `# SWDA puro vs VWCE sintetico — confronto fattuale

> **Stato**: analisi storica + Monte Carlo su serie reali. **Nessuna modifica
> a \`config.js\` o all'allocazione**. Questo documento è il dato grezzo per
> una decisione che resta **esclusivamente dell'utente**.

## Disclaimer

1. **VWCE sintetico** è una ricostruzione (90% SWDA + 10% EM rebalance annuale).
   VWCE reale esiste solo dal 2019; per coprire 2009-2018 si usa il proxy.
   I pesi EM reali di VWCE oscillano ~10-11%.
2. **Una sola estrazione storica** (2009-2026, ~16,7 anni). Il periodo è stato
   eccezionalmente pro-USA/dev-markets e deludente per EM. **Non predice il futuro.**
3. **Il Monte Carlo restituisce in output l'assunzione in input.** Siccome SWDA
   ha μ_storico più alto in questo campione, il MC gli darà proiezioni più
   alte per costruzione. Non è una scoperta sul futuro: è quello che hai
   messo dentro. Vedi caveat dettagliato in PARTE 2.
4. Tutto in EUR. ETF accumulating: close incorpora i dividendi reinvestiti.
5. Rendimenti sono **lordi** (TER non sottratto qui — i TER ufficiali sono
   ~0,19% per VWCE e ~0,20% per SWDA, sostanzialmente identici e neutrali al
   confronto).

## Finestra e metodologia

- **Finestra comune**: ${start} → ${end} (${days} giorni di Borsa, ~${years.toFixed(1)} anni).
- **σ, Sharpe, Sortino**: da rendimenti **mensili** ×√12 (TASK 5: i daily
  desincronizzano su ETF con close di Borsa Italiana / Amsterdam non
  perfettamente allineati).
- **CAGR, max drawdown, recovery, rolling 10y**: level-based daily (robusti
  al desync).
- **Risk-free**: ${p(RISK_FREE)} dichiarato. Sharpe e Sortino con rf=0 sono
  confrontabili in modo coerente sui due candidati.
- **Ribilanciamento**: annuale, primo giorno di Borsa di ogni anno solare.

---

## PARTE 1 — Statistiche storiche

| metrica | SWDA 100% | VWCE sintetico (90/10) |
|---|---|---|
| CAGR | **${p(sA.cagr)}** | **${p(sB.cagr)}** |
| σ annualizzata | ${p(sA.annVol)} | ${p(sB.annVol)} |
| Sharpe | ${n2(sA.sharpe)} | ${n2(sB.sharpe)} |
| Sortino | ${n2(sA.sortino)} | ${n2(sB.sortino)} |
| Max drawdown | **${p(ddA.depth)}** | **${p(ddB.depth)}** |
| Picco → fondo | ${ddA.peakDate} → ${ddA.troughDate} | ${ddB.peakDate} → ${ddB.troughDate} |
| Recovery | ${ddA.recoveryDate || 'non ancora'} | ${ddB.recoveryDate || 'non ancora'} |
| Giorni picco→fondo | ${ddA.peakToTroughDays} | ${ddB.peakToTroughDays} |
| Giorni fondo→recovery | ${ddA.troughToRecoveryDays} | ${ddB.troughToRecoveryDays} |
| Rolling 10y worst | ${p(rA.worst)} (start ${rA.worstStart}) | ${p(rB.worst)} (start ${rB.worstStart}) |
| Rolling 10y best | ${p(rA.best)} (start ${rA.bestStart}) | ${p(rB.best)} (start ${rB.bestStart}) |

### Tutti i drawdown ≥10% (non solo il massimo)

**SERIE A — SWDA 100% — ${ddListA.length} episodi**:

| # | picco | fondo | depth | recovery | picco→fondo | underwater tot |
|---|---|---|---|---|---|---|
${ddListA.map((d, i) => `| ${i + 1} | ${d.peakDate} | ${d.troughDate} | ${p(d.depth)} | ${d.recoveryDate || '*aperto*'} | ${d.peakToTroughDays} gg | ${d.totalUnderwaterDays != null ? d.totalUnderwaterDays + ' gg' : '*in corso*'} |`).join('\n')}

**SERIE B — VWCE sintetico — ${ddListB.length} episodi**:

| # | picco | fondo | depth | recovery | picco→fondo | underwater tot |
|---|---|---|---|---|---|---|
${ddListB.map((d, i) => `| ${i + 1} | ${d.peakDate} | ${d.troughDate} | ${p(d.depth)} | ${d.recoveryDate || '*aperto*'} | ${d.peakToTroughDays} gg | ${d.totalUnderwaterDays != null ? d.totalUnderwaterDays + ' gg' : '*in corso*'} |`).join('\n')}

### PAC simulato €${PAC_MONTHLY}/mese sull'intera finestra

| | SWDA 100% | VWCE sintetico |
|---|---|---|
| Mesi simulati | ${pacA.months} | ${pacB.months} |
| Capitale versato | ${eurM(pacA.invested)} | ${eurM(pacB.invested)} |
| Valore finale | **${eurM(pacA.finalValue)}** | **${eurM(pacB.finalValue)}** |
| Total return PAC | ${p(pacA.totalReturn)} | ${p(pacB.totalReturn)} |
| Δ assoluto A−B | ${eurM(diffPAC)} | — |
| Δ % vs B | ${p(diffPACpct, 2)} | — |

### Lettura onesta della Parte 1

Su questa finestra **SWDA puro ha reso un filo di più** del VWCE sintetico:
${p(sA.cagr - sB.cagr, 2)} di CAGR in più, ${eurM(diffPAC)} di valore finale
PAC in più (${p(diffPACpct)} su ~${eurM(pacB.finalValue)} di valore B).

**Perché**: il 10% di EM dentro VWCE ha **deluso** in questo periodo. Gli
EM (proxy IEMA dal 2009) hanno avuto una mediocre performance assoluta e
ancora più mediocre relativa ai mercati sviluppati, mentre SWDA era esposto
al 60-70% USA in un periodo di dominanza USA senza precedenti.

**Cosa NON dice questo**: che SWDA "è meglio". Dice che **chi era meno
diversificato fuori dagli USA ha vinto nel periodo 2009-2026**, che è
osservazione, non legge. La domanda strategica (Parte 3) è se quella
osservazione continuerà.

---

## PARTE 2 — Monte Carlo (50k path × 20y × €${PAC_MONTHLY}/mese)

### ⚠️ CAVEAT OBBLIGATORIO

> Il Monte Carlo qui sotto usa come input μ e σ **stimati dalle serie reali
> della Parte 1**. SWDA ha μ_storico più alto in questo campione, quindi
> il MC gli darà mediane e percentili più alti **per costruzione, non
> perché sappia qualcosa sul futuro**.
>
> **Il MC NON è in grado di rispondere alla domanda "quale renderà di più
> nei prossimi 20 anni".** Restituisce in output l'assunzione che hai messo
> in input.
>
> Il MC è utile per **mostrare la dispersione degli esiti** dato un set di
> assunzioni — non per scegliere tra due asset. **La Parte 1 è più
> informativa della Parte 2 per questa decisione.**

### Risultati

Capitale versato in 20 anni: **${eurM(PAC_MONTHLY * 12 * MC_HORIZON_YEARS)}** (€${PAC_MONTHLY} × 240 mesi).

| metrica | SWDA 100% | VWCE sintetico |
|---|---|---|
| μ_annual (input dalla Parte 1) | ${p(sA.cagr)} | ${p(sB.cagr)} |
| σ_annual (input dalla Parte 1) | ${p(sA.annVol)} | ${p(sB.annVol)} |
| Valore finale P10 (sfortuna) | ${eurM(mcA.finals.p10)} | ${eurM(mcB.finals.p10)} |
| Valore finale P25 | ${eurM(mcA.finals.p25)} | ${eurM(mcB.finals.p25)} |
| **Valore finale P50 (mediana)** | **${eurM(mcA.finals.p50)}** | **${eurM(mcB.finals.p50)}** |
| Valore finale P75 | ${eurM(mcA.finals.p75)} | ${eurM(mcB.finals.p75)} |
| Valore finale P90 (fortuna) | ${eurM(mcA.finals.p90)} | ${eurM(mcB.finals.p90)} |
| Valore finale medio | ${eurM(mcA.finals.mean)} | ${eurM(mcB.finals.mean)} |
| Prob(finale < versato) | ${p(mcA.probBelowInvested)} | ${p(mcB.probBelowInvested)} |
| MaxDD lungo il path — mediano | ${p(mcA.drawdowns.p50)} | ${p(mcB.drawdowns.p50)} |
| MaxDD lungo il path — peggior 10% | ${p(mcA.drawdowns.p10)} | ${p(mcB.drawdowns.p10)} |

### Lettura onesta della Parte 2

La mediana SWDA è ~${p((mcA.finals.p50 - mcB.finals.p50) / mcB.finals.p50)}
sopra quella VWCE — esattamente il risultato di mettere un μ più alto in
ingresso. Non è una "predizione". Il MC qui serve solo a mostrare:
- L'**ampiezza** dell'intervallo P10-P90 (è gigantesca: ${eurM(mcA.finals.p90 - mcA.finals.p10)} di range su SWDA).
  Significa che la differenza tra "fortunato" e "sfortunato" supera di gran
  lunga la differenza tra SWDA e VWCE.
- Il **maxDD atteso lungo il percorso**: ~${p(mcA.drawdowns.p50)} mediano, e
  ~${p(mcA.drawdowns.p10)} nel peggior decile. Significa che durante 20 anni
  vedrai *con alta probabilità* uno o più drawdown grossi — devi reggerli
  senza vendere.

---

## PARTE 3 — La domanda che il backtest NON può rispondere

La differenza vera tra SWDA e VWCE è il ~10% di emergenti. Quel 10% nei
prossimi 20 anni può:
- **continuare a deludere** (gli EM hanno avuto 15+ anni di sotto-performance):
  in quel caso SWDA continua a battere VWCE leggermente. Lo scenario di
  inerzia della dominanza USA.
- **fare mean reversion**: oggi gli EM quotano a multipli molto più bassi
  (P/E ~13 vs S&P 21, P/B ~1,6 vs ~4). Storicamente valutazioni basse hanno
  predetto rendimenti più alti **a lungo termine**. Se mean reversion si
  realizza, VWCE batte SWDA.
- **non cambiare** nessuno dei due scenari in modo deciso: SWDA e VWCE
  restano sostanzialmente equivalenti, e l'effetto del 10% EM nel rumore.

**Nessun backtest può dire quale di questi tre scenari accadrà.** Il
backtest dice cosa è successo nei 16 anni passati, non cosa succederà nei
20 prossimi.

### Cosa puoi dire onestamente con questi numeri

- **Se la tua tesi è "USA continuerà a dominare"** → SWDA è coerente con la
  tesi, è meno diversificato e ha avuto rendimenti più alti.
- **Se la tua tesi è "non lo so / non voglio quella scommessa"** → VWCE è
  la scelta che non la richiede. Costa un filo in CAGR storico, ma quel
  filo (~${p(sA.cagr - sB.cagr, 2)}) è dentro il rumore del Monte Carlo (range
  P10-P90 è > €${Math.round((mcA.finals.p90 - mcA.finals.p10) / 1000)}k).
- **Se la tua tesi è "EM è value play, mean revertirà"** → VWCE è il modo
  poco invasivo per esprimerla; il VWCE 90/10 NON è una scommessa
  aggressiva su EM. Se vuoi davvero scommettere su EM, ci vorrebbe un
  candidato tipo "80% VWCE + 20% EM" (= il C4 di Task 5).

### Cosa non puoi dire

- "Il backtest dice che SWDA è meglio." → No. Dice che SWDA ha reso di più
  *in questo periodo*. È un fatto storico, non una proprietà strutturale.
- "Il Monte Carlo dice che SWDA renderà di più nei prossimi 20 anni." → No.
  Il MC restituisce l'assunzione in input.

---

## Sintesi a una riga

SWDA ha battuto VWCE di ${p(sA.cagr - sB.cagr, 2)} CAGR (${eurM(diffPAC)} su un
PAC reale di ${eurM(pacA.invested)}) **perché EM ha deluso in questo periodo**.
La decisione sui prossimi 20 anni dipende da una tesi su EM che il backtest
non può fornire.
`;
}

main();
