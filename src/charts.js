// =============================================================================
// CHARTS v3 — feedback Vincenzo
// =============================================================================
// Modifiche v3:
//   - Trend chart: solo P5, P50, P95 + Versato + OGGI (no P25-P75 esplicito)
//     Banda P5-P95 come fill tenue di sfondo.
//   - MC distribution: barra orizzontale range P25-P75 + marker mediana + versato
//   - MC probability: LINE CHART con asse X step €25k, linea per ogni strategia
// =============================================================================

const chartInstances = new Map();

const COLORS = {
  bg: '#0A1A20',
  grid: '#1A3A47',
  gridSubtle: 'rgba(26, 58, 71, 0.4)',
  text: '#7C9AA7',
  textBright: '#C7DDE5',
  // Palette percentili
  p5:   '#EF4444',
  p25:  '#F59E0B',
  p50:  '#2DD4BF',
  p75:  '#34D399',
  p95:  '#60A5FA',
  contributed: '#FBBF24',
  band5_95:  'rgba(45, 212, 191, 0.06)',
  // Generici
  positive: '#2DD4BF',
  negative: '#F87171',
  todayMarker: '#FFFFFF',
};

const fmtEur0 = (v) => new Intl.NumberFormat('it-IT', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
}).format(v);

const fmtK = (v) => v >= 1000 ? `€${(v / 1000).toFixed(0)}k` : `€${v.toFixed(0)}`;

export function destroyAllCharts() {
  chartInstances.forEach(c => c.destroy());
  chartInstances.clear();
}

// =============================================================================
// TREND CHART v3 — P5, P50, P95 + Versato + OGGI
// =============================================================================
export function renderTrendChart(selector, trendData, options = {}) {
  if (!window.Chart || !trendData || trendData.length === 0) return;
  const canvas = document.querySelector(selector);
  if (!canvas) return;
  if (chartInstances.has(selector)) chartInstances.get(selector).destroy();

  const { useLogScale = true, currentValue = trendData[0]?.p50 ?? 0 } = options;
  const horizonMonths = trendData.length - 1;

  // Sostituzione zero per scala log
  const safeY = (v) => useLogScale && v <= 1 ? 1 : v;

  const datasets = [
    // Banda P5-P95 (fill tenue tra le due linee)
    {
      label: '_p95_band',
      data: trendData.map(d => ({ x: d.month, y: safeY(d.p95) })),
      borderColor: 'transparent',
      backgroundColor: COLORS.band5_95,
      pointRadius: 0,
      fill: '+1',
      tension: 0.2,
    },
    {
      label: '_p5_band',
      data: trendData.map(d => ({ x: d.month, y: safeY(d.p5) })),
      borderColor: 'transparent',
      pointRadius: 0,
      fill: false,
      tension: 0.2,
    },
    // Linea P95 — Scenario fortunato
    {
      label: 'Scenario fortunato (P95)',
      data: trendData.map(d => ({ x: d.month, y: safeY(d.p95) })),
      borderColor: COLORS.p95,
      borderWidth: 1.5,
      borderDash: [6, 4],
      backgroundColor: 'transparent',
      pointRadius: 0,
      fill: false,
      tension: 0.2,
    },
    // Linea P50 — Scenario atteso (mediana)
    {
      label: 'Scenario atteso (P50)',
      data: trendData.map(d => ({ x: d.month, y: safeY(d.p50) })),
      borderColor: COLORS.p50,
      borderWidth: 3,
      backgroundColor: 'transparent',
      pointRadius: 0,
      fill: false,
      tension: 0.2,
    },
    // Linea P5 — Scenario sfortunato
    {
      label: 'Scenario sfortunato (P5)',
      data: trendData.map(d => ({ x: d.month, y: safeY(d.p5) })),
      borderColor: COLORS.p5,
      borderWidth: 1.5,
      borderDash: [6, 4],
      backgroundColor: 'transparent',
      pointRadius: 0,
      fill: false,
      tension: 0.2,
    },
    // Versato cumulato
    {
      label: 'Versato cumulato',
      data: trendData.map(d => ({ x: d.month, y: safeY(d.contributed) })),
      borderColor: COLORS.contributed,
      borderWidth: 2,
      borderDash: [3, 3],
      backgroundColor: 'transparent',
      pointRadius: 0,
      fill: false,
    },
    // Punto OGGI
    {
      label: 'OGGI',
      data: [{ x: 0, y: safeY(currentValue) }],
      borderColor: COLORS.todayMarker,
      backgroundColor: COLORS.todayMarker,
      pointRadius: 6,
      pointHoverRadius: 8,
      pointStyle: 'circle',
      borderWidth: 2,
      showLine: false,
    },
  ];

  const chart = new Chart(canvas, {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            color: COLORS.text,
            font: { family: 'JetBrains Mono', size: 11 },
            filter: (item) => !item.text.startsWith('_'),
            usePointStyle: true,
            boxWidth: 10,
          },
        },
        tooltip: {
          backgroundColor: '#060F13',
          borderColor: '#244F5F',
          borderWidth: 1,
          padding: 12,
          titleColor: COLORS.textBright,
          titleFont: { family: 'JetBrains Mono', size: 11, weight: 600 },
          bodyColor: COLORS.text,
          bodyFont: { family: 'JetBrains Mono', size: 11 },
          filter: (item) => !item.dataset.label.startsWith('_'),
          callbacks: {
            title: (ctx) => {
              const m = ctx[0]?.parsed?.x ?? 0;
              if (m === 0) return 'OGGI';
              const years = (m / 12).toFixed(1);
              return `${years} anni (mese ${m})`;
            },
            label: (ctx) => `${ctx.dataset.label}: ${fmtEur0(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          type: 'linear',
          min: 0,
          max: horizonMonths,
          grid: { color: COLORS.gridSubtle, drawBorder: false },
          ticks: {
            color: COLORS.text,
            font: { family: 'JetBrains Mono', size: 10 },
            stepSize: 12,
            callback: (v) => {
              const years = v / 12;
              if (v === 0) return 'OGGI';
              return Number.isInteger(years) ? `${years}a` : '';
            },
          },
          title: {
            display: true,
            text: 'Orizzonte temporale',
            color: COLORS.text,
            font: { family: 'JetBrains Mono', size: 10 },
          },
        },
        y: {
          type: useLogScale ? 'logarithmic' : 'linear',
          grid: { color: COLORS.gridSubtle, drawBorder: false },
          ticks: {
            color: COLORS.text,
            font: { family: 'JetBrains Mono', size: 10 },
            callback: (v) => {
              if (v >= 1000000) return `€${(v / 1000000).toFixed(1)}M`;
              if (v >= 1000) return `€${(v / 1000).toFixed(0)}k`;
              return `€${v}`;
            },
          },
          title: {
            display: true,
            text: useLogScale ? 'Valore (scala log)' : 'Valore (€)',
            color: COLORS.text,
            font: { family: 'JetBrains Mono', size: 10 },
          },
        },
      },
    },
  });
  chartInstances.set(selector, chart);
}

// =============================================================================
// MC DISTRIBUTION CHART v3 — barra range P25-P75 + marker mediana + versato
// =============================================================================
export function renderMCDistributionChart(selector, mcResults, filterLabels = null) {
  if (!window.Chart || !mcResults) return;
  const canvas = document.querySelector(selector);
  if (!canvas) return;
  if (chartInstances.has(selector)) chartInstances.get(selector).destroy();

  let strategies = mcResults.strategies;
  if (filterLabels && Array.isArray(filterLabels)) {
    strategies = strategies.filter(s => filterLabels.includes(s.label));
  }

  // Floating bar plugin: usiamo un trick. Chart.js bar supporta {x: [min, max]}.
  // Costruiamo dataset con barra "p25→p75", marker per mediana e versato.

  const labels = strategies.map(s => s.label);
  // Banda P25-P75 (range)
  const rangeData = strategies.map(s => [s.gross.p25, s.gross.p75]);
  // Mediana come scatter sopra la barra
  const medianData = strategies.map((s, i) => ({ x: s.gross.p50, y: i }));
  // Versato come scatter
  const contribData = strategies.map((s, i) => ({ x: s.contributedMedian, y: i }));

  const chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Banda P25–P75 (50% probabile)',
          data: rangeData,
          backgroundColor: 'rgba(45, 212, 191, 0.4)',
          borderColor: COLORS.p50,
          borderWidth: 1,
          borderRadius: 3,
          borderSkipped: false,
        },
        {
          label: 'Mediana attesa (P50)',
          data: medianData,
          type: 'scatter',
          backgroundColor: COLORS.textBright,
          borderColor: COLORS.textBright,
          pointStyle: 'rectRounded',
          pointRadius: 8,
          pointHoverRadius: 10,
        },
        {
          label: 'Versato cumulato',
          data: contribData,
          type: 'scatter',
          backgroundColor: COLORS.contributed,
          borderColor: COLORS.contributed,
          pointStyle: 'triangle',
          pointRadius: 7,
          pointHoverRadius: 9,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            color: COLORS.text,
            font: { family: 'JetBrains Mono', size: 11 },
            usePointStyle: true,
            boxWidth: 10,
          },
        },
        tooltip: {
          backgroundColor: '#060F13',
          borderColor: '#244F5F',
          borderWidth: 1,
          padding: 12,
          titleColor: COLORS.textBright,
          titleFont: { family: 'JetBrains Mono', size: 11, weight: 600 },
          bodyColor: COLORS.text,
          bodyFont: { family: 'JetBrains Mono', size: 11 },
          callbacks: {
            label: (ctx) => {
              const ds = ctx.dataset.label;
              if (ds.startsWith('Banda')) {
                const arr = ctx.raw;
                return `P25: ${fmtEur0(arr[0])} → P75: ${fmtEur0(arr[1])}`;
              }
              if (ds.startsWith('Mediana')) return `Mediana: ${fmtEur0(ctx.parsed.x)}`;
              if (ds.startsWith('Versato')) return `Versato: ${fmtEur0(ctx.parsed.x)}`;
              return `${ds}: ${fmtEur0(ctx.parsed.x)}`;
            },
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: COLORS.grid },
          ticks: {
            color: COLORS.text,
            font: { family: 'JetBrains Mono', size: 10 },
            callback: (v) => fmtK(v),
          },
        },
        y: {
          grid: { display: false },
          ticks: { color: COLORS.text, font: { family: 'JetBrains Mono', size: 11 } },
        },
      },
    },
  });
  chartInstances.set(selector, chart);
}

// =============================================================================
// MC PROBABILITY CHART v3 — LINE CHART con asse X step €25k
// =============================================================================
export function renderMCProbabilityChart(selector, mcResults, filterLabels = null) {
  if (!window.Chart || !mcResults) return;
  const canvas = document.querySelector(selector);
  if (!canvas) return;
  if (chartInstances.has(selector)) chartInstances.get(selector).destroy();

  let strategies = mcResults.strategies;
  if (filterLabels && Array.isArray(filterLabels)) {
    strategies = strategies.filter(s => filterLabels.includes(s.label));
  }

  // Palette per strategie multiple (oggi è una sola, ma robusto)
  const STRAT_COLORS = [COLORS.p50, COLORS.p95, COLORS.contributed, COLORS.p25];

  const datasets = strategies.map((s, idx) => {
    const color = STRAT_COLORS[idx % STRAT_COLORS.length];
    const curve = Array.isArray(s.probCurve) ? s.probCurve : [];
    return {
      label: s.label,
      data: curve.map(p => ({ x: p.threshold, y: p.prob * 100 })),
      borderColor: color,
      backgroundColor: color + '33',
      borderWidth: 2.5,
      pointRadius: 4,
      pointHoverRadius: 6,
      tension: 0.2,
      fill: idx === 0,  // riempi sotto la prima curva per enfasi
    };
  });

  const chart = new Chart(canvas, {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            color: COLORS.text,
            font: { family: 'JetBrains Mono', size: 11 },
            usePointStyle: true,
            boxWidth: 10,
          },
        },
        title: {
          display: true,
          text: 'Probabilità di superare ciascuna soglia',
          color: COLORS.textBright,
          font: { family: 'JetBrains Mono', size: 12, weight: 600 },
          padding: { bottom: 12 },
        },
        tooltip: {
          backgroundColor: '#060F13',
          borderColor: '#244F5F',
          borderWidth: 1,
          padding: 12,
          titleColor: COLORS.textBright,
          titleFont: { family: 'JetBrains Mono', size: 11, weight: 600 },
          bodyColor: COLORS.text,
          bodyFont: { family: 'JetBrains Mono', size: 11 },
          callbacks: {
            title: (ctx) => `Soglia: ${fmtK(ctx[0]?.parsed?.x ?? 0)}`,
            label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}%`,
          },
        },
      },
      scales: {
        x: {
          type: 'linear',
          min: 100000,
          max: 600000,
          grid: { color: COLORS.gridSubtle, drawBorder: false },
          ticks: {
            color: COLORS.text,
            font: { family: 'JetBrains Mono', size: 10 },
            stepSize: 25000,
            callback: (v) => fmtK(v),
          },
          title: {
            display: true,
            text: 'Soglia di patrimonio (€)',
            color: COLORS.text,
            font: { family: 'JetBrains Mono', size: 10 },
          },
        },
        y: {
          beginAtZero: true,
          max: 100,
          grid: { color: COLORS.gridSubtle, drawBorder: false },
          ticks: {
            color: COLORS.text,
            font: { family: 'JetBrains Mono', size: 10 },
            callback: (v) => `${v}%`,
          },
          title: {
            display: true,
            text: 'Probabilità di raggiungere o superare',
            color: COLORS.text,
            font: { family: 'JetBrains Mono', size: 10 },
          },
        },
      },
    },
  });
  chartInstances.set(selector, chart);
}
