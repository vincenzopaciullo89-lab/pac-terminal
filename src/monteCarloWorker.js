// =============================================================================
// MONTE CARLO WORKER v3 — feedback Vincenzo
// =============================================================================
// Modifiche v3:
//   - SOLO strategia "PAC tactical" (utente non userà costanti come confronto)
//   - pacSchedule: array [{startMonth, amount}] per cambi nel tempo
//   - horizonMonths variabile (5/10/20 anni)
//   - probCurve a step €25k per line chart probabilità
// =============================================================================

self.onmessage = function (e) {
  const { params } = e.data;
  try {
    const results = runAllStrategies(params);
    self.postMessage({ status: 'done', results });
  } catch (err) {
    self.postMessage({ status: 'error', error: err.message });
  }
};

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function pacAt(month, schedule) {
  let amount = schedule[0].amount;
  for (const seg of schedule) {
    if (month >= seg.startMonth) amount = seg.amount;
    else break;
  }
  return amount;
}

function simulateTacticalPAC(params, pacSchedule, seed) {
  const { nSim, months, mu, sigma, ter, pv0, capPerYear, tiers } = params;
  const muLog = Math.log(1 + mu) / 12 - 0.5 * Math.pow(sigma / Math.sqrt(12), 2);
  const sigmaM = sigma / Math.sqrt(12);
  const terM = ter / 12;

  const finalValues = new Float64Array(nSim);
  const finalDDs = new Float64Array(nSim);
  const totalContributedArr = new Float64Array(nSim);

  const rng = mulberry32(seed);
  const buffer = new Float64Array(12);

  for (let s = 0; s < nSim; s++) {
    let v = pv0;
    let peak = pv0;
    let ddMin = 0;
    let totalC = pv0;
    let boostThisYear = 0;
    let lastYearTracked = 0;

    for (let i = 0; i < 12; i++) buffer[i] = pv0;

    for (let m = 0; m < months; m++) {
      const yearIdx = Math.floor(m / 12);
      if (yearIdx !== lastYearTracked) {
        boostThisYear = 0;
        lastYearTracked = yearIdx;
      }

      let peak12m = -Infinity;
      for (let i = 0; i < 12; i++) if (buffer[i] > peak12m) peak12m = buffer[i];
      const dd12m = peak12m > 0 ? (v / peak12m) - 1 : 0;

      let multiplier = 1.0;
      if (boostThisYear < capPerYear) {
        for (const t of tiers) {
          if (dd12m <= t.ddMax && dd12m > t.ddMin) {
            multiplier = t.multiplier;
            break;
          }
        }
        if (multiplier > 1.0) boostThisYear++;
      }

      const monthlyPACAtM = pacAt(m, pacSchedule);
      const contrib = monthlyPACAtM * multiplier;
      totalC += contrib;

      const z = gaussian(rng);
      const r = Math.exp(muLog + sigmaM * z - terM) - 1;
      v = (v + contrib) * (1 + r);

      if (v > peak) peak = v;
      const ddTrue = peak > 0 ? (v / peak) - 1 : 0;
      if (ddTrue < ddMin) ddMin = ddTrue;

      buffer[m % 12] = v;
    }
    finalValues[s] = v;
    finalDDs[s] = ddMin;
    totalContributedArr[s] = totalC;
  }

  return {
    finalValues: Array.from(finalValues),
    finalDDs: Array.from(finalDDs),
    totalContributedArr: Array.from(totalContributedArr),
  };
}

function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor((p / 100) * (sorted.length - 1));
  return sorted[idx];
}

function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function computeStats(values, contributed) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p5: sorted[Math.floor(0.05 * sorted.length)],
    p25: sorted[Math.floor(0.25 * sorted.length)],
    p50: sorted[Math.floor(0.50 * sorted.length)],
    p75: sorted[Math.floor(0.75 * sorted.length)],
    p95: sorted[Math.floor(0.95 * sorted.length)],
    mean: mean(values),
    contributed: typeof contributed === 'number' ? contributed : mean(contributed),
  };
}

function probAbove(values, threshold) {
  return values.filter(v => v >= threshold).length / values.length;
}

function probDDBelow(dds, threshold) {
  return dds.filter(d => d <= threshold).length / dds.length;
}

// Curva probabilità a step €25k tra €100k e €600k → per line chart
function buildProbabilityCurve(values, minTh, maxTh, step) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const curve = [];
  for (let th = minTh; th <= maxTh; th += step) {
    let count = 0;
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (sorted[i] >= th) count++;
      else break;
    }
    curve.push({ threshold: th, prob: count / n });
  }
  return curve;
}

function runAllStrategies(params) {
  const { months, nSim, pacSchedule } = params;
  const startTime = Date.now();

  const schedule = (Array.isArray(pacSchedule) && pacSchedule.length > 0)
    ? [...pacSchedule].sort((a, b) => a.startMonth - b.startMonth)
    : [{ startMonth: 0, amount: params.monthlyPAC || 500 }];

  const basePAC = schedule[0].amount;

  let labelTactical = `PAC €${basePAC} + tactical`;
  if (schedule.length > 1) {
    const segLabels = schedule.map(s => {
      const yr = (s.startMonth / 12).toFixed(0);
      return s.startMonth === 0 ? `€${s.amount}` : `${yr}a→€${s.amount}`;
    });
    labelTactical = `PAC ${segLabels.join(' / ')} + tactical`;
  }

  // SOLO strategia tactical (utente ha rifiutato il confronto con costante)
  const strategies = [
    { id: 'pac_tactical', label: labelTactical, fn: () => simulateTacticalPAC(params, schedule, 45) },
  ];

  const results = strategies.map((strat, i) => {
    self.postMessage({ status: 'progress', current: i, total: strategies.length, label: strat.label });
    const sim = strat.fn();
    const stats = computeStats(sim.finalValues, sim.totalContributedArr);
    const taxRate = 0.26;
    const grossPlus = sim.finalValues.map((v, j) => {
      const c = sim.totalContributedArr[j];
      return Math.max(0, v - c);
    });
    const netValues = sim.finalValues.map((v, j) => v - grossPlus[j] * taxRate);

    return {
      id: strat.id,
      label: strat.label,
      gross: stats,
      net: computeStats(netValues, stats.contributed),
      probabilities: {
        above_125k: probAbove(sim.finalValues, 125000),
        above_250k: probAbove(sim.finalValues, 250000),
        above_400k: probAbove(sim.finalValues, 400000),
        above_600k: probAbove(sim.finalValues, 600000),
        above_1m: probAbove(sim.finalValues, 1000000),
      },
      probCurve: buildProbabilityCurve(sim.finalValues, 100000, 600000, 25000),
      drawdown: {
        median: percentile(sim.finalDDs, 50),
        prob_below_20: probDDBelow(sim.finalDDs, -0.20),
        prob_below_30: probDDBelow(sim.finalDDs, -0.30),
        prob_below_40: probDDBelow(sim.finalDDs, -0.40),
      },
      contributedMedian: percentile(sim.totalContributedArr, 50),
      pacSchedule: schedule,
    };
  });

  return {
    elapsedMs: Date.now() - startTime,
    horizonMonths: months,
    nSim,
    strategies: results,
    horizonYears: months / 12,
    pacSchedule: schedule,
  };
}
