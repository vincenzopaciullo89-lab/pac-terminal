#!/usr/bin/env node
// =============================================================================
// backtest.js — Task D: backtest del sistema tattico di boost del PAC
// =============================================================================
// Calibra le soglie del trigger tattico su SWDA (iShares Core MSCI World, EUR,
// 2009→2026), proxy storia lunga di VWCE. Confronta, sullo STESSO percorso di
// prezzi, due strategie:
//   (a) PAC FISSO   — €500/mese, mai boost.
//   (b) PAC TATTICO — €500 base + boost secondo la regola ibrida A+B+C.
//
// Metrica primaria (D3): € extra finali per ogni € di boost versato.
// Metrica secondaria  : rendimento finale assoluto.
//
// -----------------------------------------------------------------------------
// WALK-FORWARD / NO LOOK-AHEAD  (vincolo critico)
// -----------------------------------------------------------------------------
// A ogni mese simulato, le metriche del trigger (ddATH_real, dd252D, z21D) sono
// calcolate ESCLUSIVAMENTE sui close fino a quel mese incluso — mai con prezzi
// futuri. Vedi buildMonthlySchedule(): per ogni data di acquisto si fa
//   slice = closes con date <= dataAcquisto
// e tutte le metriche derivano da `slice`. Il peak di ddATH_real è il massimo
// di `slice`, quindi è il "massimo storico ad oggi", non il massimo assoluto
// della serie completa. Un assert runtime (assertNoLookAhead) verifica che
// l'ultima data usata per le metriche di un mese non superi la data di acquisto.
//
// Riusa src/metricsEngine.js (modulo Node-compatibile, B.5) per dd252D e z21D.
// =============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computePriceMetrics } from '../src/metricsEngine.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(HERE, '..');

// -----------------------------------------------------------------------------
// Parametri fissi del PAC (locked-in: L1, L13, L16, D4)
// -----------------------------------------------------------------------------
const BASE_MONTHLY = 500;          // L1: PAC base €500/mese
const MONTHLY_CAP = 1000;          // L2: cap stretto €1.000/mese totale
const MULTIPLIERS = [1.0, 1.1, 1.3, 1.6, 2.0]; // L13: T0..T4 (NON calibrati)
const MAX_BOOST_MONTHS_PER_YEAR = 6;           // L16
const CASH_WINDOW_MONTHS = 18;     // D4: finestra "stress prolungato" (-50% × 18m)
const CASH_BUDGET_MAX = 9000;      // D4: cassa cumulata disponibile €6-9K

// -----------------------------------------------------------------------------
// Griglia di calibrazione (set ragionevoli, no over-fitting — da spec D.2)
// -----------------------------------------------------------------------------
// Ogni set = 4 soglie di ENTRY su ddATH_real per T1,T2,T3,T4 (in frazione).
const TIER_THRESHOLD_SETS = {
  'A {-5/-10/-15/-25}':  [-0.05, -0.10, -0.15, -0.25],
  'B {-7/-13/-20/-30}':  [-0.07, -0.13, -0.20, -0.30],
  'C {-10/-15/-22/-35}': [-0.10, -0.15, -0.22, -0.35],
};
// Filtro B: declassa di 1 tier se dd252D > -X% (drawdown recente rientrato).
const FILTER_B_X = [0.03, 0.05, 0.08];

// -----------------------------------------------------------------------------
// Caricamento dati
// -----------------------------------------------------------------------------
function loadSwda() {
  const p = path.join(REPO_ROOT, 'data', 'analysis', 'swda.json');
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  const data = raw.data.filter(r => Number.isFinite(r.close) && r.close > 0);
  data.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { meta: raw, data };
}

// -----------------------------------------------------------------------------
// Costruzione schedule mensile WALK-FORWARD
// -----------------------------------------------------------------------------
// Per ogni mese di calendario presente nella serie, si prende il PRIMO giorno
// di Borsa del mese come data di acquisto del PAC. Le metriche del trigger sono
// calcolate sui soli close fino a quella data.
function assertNoLookAhead(buyDate, sliceLastDate) {
  if (sliceLastDate > buyDate) {
    throw new Error(
      `LOOK-AHEAD DETECTED: metriche calcolate con data ${sliceLastDate} > ` +
      `data acquisto ${buyDate}`,
    );
  }
}

function buildMonthlySchedule(data) {
  // Primo giorno di Borsa per ciascun (anno-mese).
  const firstOfMonth = new Map();
  for (const row of data) {
    const ym = row.date.slice(0, 7); // YYYY-MM
    if (!firstOfMonth.has(ym)) firstOfMonth.set(ym, row);
  }

  const schedule = [];
  for (const [ym, buyRow] of firstOfMonth) {
    const buyDate = buyRow.date;
    // WALK-FORWARD: solo close con date <= data di acquisto.
    const slice = data.filter(r => r.date <= buyDate);
    assertNoLookAhead(buyDate, slice[slice.length - 1].date);

    const price = buyRow.close;
    const closes = slice.map(r => r.close);

    // A — ddATH_real: drawdown dal massimo storico DISPONIBILE AD OGGI.
    const peakToDate = Math.max(...closes);
    const ddATH = price / peakToDate - 1;

    // B + C — riuso metricsEngine (dd252D rolling, zScore=z21D). Walk-forward
    // perché `slice` contiene solo passato.
    const m = computePriceMetrics(slice, price);
    const dd252D = m ? m.dd252D : 0;
    const z21D = m ? m.zScore : null;

    schedule.push({ ym, date: buyDate, price, ddATH, dd252D, z21D });
  }
  return schedule;
}

// -----------------------------------------------------------------------------
// Regola tattica: ddATH → tier, poi filtro B di declassamento
// -----------------------------------------------------------------------------
function tierFromDdATH(ddATH, thresholds) {
  // thresholds = [t1,t2,t3,t4] (negativi). ddATH negativo = drawdown.
  if (ddATH <= thresholds[3]) return 4;
  if (ddATH <= thresholds[2]) return 3;
  if (ddATH <= thresholds[1]) return 2;
  if (ddATH <= thresholds[0]) return 1;
  return 0;
}

function applyFilterB(tier, dd252D, filterX) {
  // Declassa di 1 se il drawdown ROLLING 252g è rientrato (dd252D > -X%):
  // il ddATH può essere profondo per un crollo vecchio già recuperato.
  if (tier > 0 && dd252D > -filterX) return tier - 1;
  return tier;
}

// -----------------------------------------------------------------------------
// Simulazione di UNA combinazione di soglie sullo schedule
// -----------------------------------------------------------------------------
function simulate(schedule, thresholds, filterX, finalPrice) {
  let sharesFixed = 0, investedFixed = 0;
  let sharesTact = 0, investedTact = 0, boostTotal = 0;
  let sharesDumb = 0; // benchmark "boost cieco": stessa cassa, timing piatto
  let boostMonths = 0;
  const boostByYear = new Map();
  const monthlyBoosts = []; // per cassa rolling
  const tierCounts = [0, 0, 0, 0, 0];

  for (const s of schedule) {
    // (a) FISSO
    sharesFixed += BASE_MONTHLY / s.price;
    investedFixed += BASE_MONTHLY;

    // (b) TATTICO
    const year = s.date.slice(0, 4);
    const usedThisYear = boostByYear.get(year) || 0;
    let tier = tierFromDdATH(s.ddATH, thresholds);
    tier = applyFilterB(tier, s.dd252D, filterX);
    // Cap L16: max 6 mesi di boost/anno (greedy primi 6).
    if (tier > 0 && usedThisYear >= MAX_BOOST_MONTHS_PER_YEAR) tier = 0;

    let total = BASE_MONTHLY * MULTIPLIERS[tier];
    if (total > MONTHLY_CAP) total = MONTHLY_CAP;
    const boost = total - BASE_MONTHLY;

    if (boost > 0) {
      boostByYear.set(year, usedThisYear + 1);
      boostMonths += 1;
    }
    tierCounts[tier] += 1;
    sharesTact += total / s.price;
    investedTact += total;
    boostTotal += boost;
    monthlyBoosts.push({ date: s.date, boost });
  }

  // Benchmark "boost cieco": ridistribuisce boostTotal in modo uniforme su
  // TUTTI i mesi (timing nullo). Isola l'effetto del timing dall'effetto
  // "ho semplicemente investito di più".
  const nMonths = schedule.length;
  const flatBoost = boostTotal / nMonths;
  for (const s of schedule) sharesDumb += flatBoost / s.price;

  const finalFixed = sharesFixed * finalPrice;
  const finalTact = sharesTact * finalPrice;
  const finalDumb = (sharesFixed + sharesDumb) * finalPrice; // base + boost cieco
  const extraWealth = finalTact - finalFixed;

  // Cassa: max boost cumulato su finestra rolling di 18 mesi (D4).
  let maxCash = 0;
  for (let i = 0; i < monthlyBoosts.length; i++) {
    let sum = 0;
    for (let j = i; j < Math.min(i + CASH_WINDOW_MONTHS, monthlyBoosts.length); j++) {
      sum += monthlyBoosts[j].boost;
    }
    if (sum > maxCash) maxCash = sum;
  }

  const years = nMonths / 12;
  return {
    thresholds, filterX,
    finalFixed, finalTact, finalDumb,
    investedFixed, investedTact, boostTotal,
    extraWealth,
    // D3: € extra finali per € di boost.
    efficiency: boostTotal > 0 ? extraWealth / boostTotal : 0,
    // Quanto di quell'efficienza è TIMING (oltre al "ho investito di più"):
    timingAlpha: finalTact - finalDumb,
    boostMonths,
    avgBoostsPerYear: boostMonths / years,
    maxCash,
    cashOk: maxCash <= CASH_BUDGET_MAX,
    tierCounts,
    // ritorni money-weighted semplici (final/invested - 1)
    retFixed: finalFixed / investedFixed - 1,
    retTact: finalTact / investedTact - 1,
  };
}

// -----------------------------------------------------------------------------
// Grid search su un dato schedule
// -----------------------------------------------------------------------------
function gridSearch(schedule, finalPrice) {
  const results = [];
  for (const [label, thr] of Object.entries(TIER_THRESHOLD_SETS)) {
    for (const x of FILTER_B_X) {
      const r = simulate(schedule, thr, x, finalPrice);
      results.push({ label, ...r });
    }
  }
  // Ordina per metrica D3 (efficienza) decrescente.
  results.sort((a, b) => b.efficiency - a.efficiency);
  return results;
}

// -----------------------------------------------------------------------------
// Output helpers
// -----------------------------------------------------------------------------
const eur = n => '€' + Math.round(n).toLocaleString('it-IT');
const pct = n => (n * 100).toFixed(1) + '%';

function printTable(results) {
  console.log(
    'rank | soglie tier         | Bx  | eff D3 | extra €   | boost €  | timingα € | boost/anno | maxCassa | cassaOK',
  );
  results.forEach((r, i) => {
    console.log(
      `${String(i + 1).padStart(2)}   | ${r.label.padEnd(19)} | ${(r.filterX * 100).toFixed(0).padStart(2)}% | ` +
      `${r.efficiency.toFixed(2).padStart(5)}x | ${eur(r.extraWealth).padStart(8)} | ${eur(r.boostTotal).padStart(7)} | ` +
      `${eur(r.timingAlpha).padStart(8)} | ${r.avgBoostsPerYear.toFixed(1).padStart(8)}  | ${eur(r.maxCash).padStart(7)} | ${r.cashOk ? 'OK' : 'SFORA'}`,
    );
  });
}

function dateFilterSchedule(schedule, start, end) {
  return schedule.filter(s => s.date >= start && s.date <= end);
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------
function main() {
  const { meta, data } = loadSwda();
  const finalPrice = data[data.length - 1].close;
  const schedule = buildMonthlySchedule(data);

  console.log('='.repeat(78));
  console.log('TASK D — BACKTEST SISTEMA TATTICO (SWDA proxy MSCI World, EUR)');
  console.log('='.repeat(78));
  console.log(`Serie: ${meta.date_start} → ${meta.date_end} (${data.length} close, ${schedule.length} mesi)`);
  console.log(`Prezzo finale: ${finalPrice} EUR  |  Multipliers L13 (fissi): ${MULTIPLIERS.join('/')}`);
  console.log(`Cap: €${MONTHLY_CAP}/mese, ${MAX_BOOST_MONTHS_PER_YEAR} boost/anno; cassa budget ≤ €${CASH_BUDGET_MAX} (rolling ${CASH_WINDOW_MONTHS}m)`);
  console.log('No look-ahead: verificato per costruzione (assert runtime su ogni mese).');

  // --- Benchmark nullo: PAC fisso puro (uguale in ogni combinazione) ---
  const ref = simulate(schedule, TIER_THRESHOLD_SETS['A {-5/-10/-15/-25}'], 0.05, finalPrice);
  console.log('\n--- BENCHMARK NULLO: PAC FISSO PURO (zero boost) ---');
  console.log(`Investito: ${eur(ref.investedFixed)}  |  Valore finale: ${eur(ref.finalFixed)}  |  Ritorno MW: ${pct(ref.retFixed)}`);

  // --- Grid search intero periodo ---
  console.log('\n--- CALIBRAZIONE: intero periodo 2009-2026 (ordinato per efficienza D3) ---');
  const full = gridSearch(schedule, finalPrice);
  printTable(full);

  const win = full[0], second = full[1];
  console.log('\n--- VINCITORE (D3) vs SECONDO ---');
  console.log(`1°: ${win.label} | B=${pct(win.filterX)} → eff ${win.efficiency.toFixed(2)}x, extra ${eur(win.extraWealth)}, boost ${eur(win.boostTotal)}`);
  console.log(`2°: ${second.label} | B=${pct(second.filterX)} → eff ${second.efficiency.toFixed(2)}x, extra ${eur(second.extraWealth)}, boost ${eur(second.boostTotal)}`);
  const effGap = (win.efficiency - second.efficiency) / second.efficiency;
  console.log(`Distacco efficienza 1°-2°: ${pct(effGap)} (se piccolo → scelta robusta, non netta)`);

  // --- Confronto onesto: miglior tattico (per extra assoluto) vs fisso ---
  const byAbs = [...full].sort((a, b) => b.extraWealth - a.extraWealth);
  const bestAbs = byAbs[0];
  console.log('\n--- VALORE AGGIUNTO ASSOLUTO (vs benchmark nullo) ---');
  console.log(`Miglior tattico per extra assoluto: ${bestAbs.label} B=${pct(bestAbs.filterX)}`);
  console.log(`  Valore finale fisso : ${eur(bestAbs.finalFixed)}`);
  console.log(`  Valore finale tattico: ${eur(bestAbs.finalTact)}`);
  console.log(`  Delta assoluto      : ${eur(bestAbs.extraWealth)} (= ${pct(bestAbs.extraWealth / bestAbs.finalFixed)} sul fisso)`);
  console.log(`  di cui TIMING alpha  : ${eur(bestAbs.timingAlpha)} (resto = solo "investito di più")`);
  console.log(`  Boost totale versato : ${eur(bestAbs.boostTotal)} su ${bestAbs.boostMonths} mesi`);

  // --- Sub-periodi: stabilità soglie ---
  console.log('\n--- ROBUSTEZZA: sub-periodi (best per efficienza D3) ---');
  for (const [label, [s, e]] of Object.entries({
    '2009-2017': ['2009-01-01', '2017-12-31'],
    '2018-2026': ['2018-01-01', '2026-12-31'],
  })) {
    const sub = dateFilterSchedule(schedule, s, e);
    const fp = sub[sub.length - 1].price;
    const g = gridSearch(sub, fp);
    const w = g[0];
    console.log(`${label} (${sub.length} mesi): best = ${w.label} | B=${pct(w.filterX)} | eff ${w.efficiency.toFixed(2)}x | extra ${eur(w.extraWealth)} | boost ${eur(w.boostTotal)}`);
  }
  console.log('\nNOTA: i sub-periodi usano il proprio prezzo finale (non quello del 2026):');
  console.log('servono a vedere se la combinazione OTTIMA cambia tra regimi, non a confrontare i livelli.');

  // export risultati per il report
  return { meta, schedule, full, ref, bestAbs };
}

main();
