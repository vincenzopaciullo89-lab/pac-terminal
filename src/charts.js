// =============================================================================
// CHARTS — FINAL
// =============================================================================
// Trend chart (P5/P25/P50/P75/P95) + MC distribution chart.
// Chart.js caricato via CDN nell'index.html.
// =============================================================================

const chartInstances = new Map();

const COLORS = {
  bg: '#0A1A20',
  grid: '#1A3A47',
  text: '#7C9AA7',
  textBright: '#C7DDE5',
  positive: '#2DD4BF',
  positiveSoft: 'rgba(45, 212, 191, 0.15)',
  positiveBand: 'rgba(45, 212, 191, 0.08)',
  warning: '#FBBF24',
  negative: '#F87171',
  info: '#60A5FA',
};

function commonOptionsTrend() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' },
    plugins: {
      legend: { display: false },
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
          title: function (ctx) {
            const m = ctx[0]?.parsed?.x ?? 0;
            const years = (m / 12).toFixed(1);
            return `Mese ${m} (${years}y)`;
          },
          label: function (ctx) {
            const v = ctx.parsed.y;
            const formatted = new Intl.NumberFormat('it-IT', {
              style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
            }).format(v);
            return `${ctx.dataset.label}: ${formatted}`;
          },
        },
      },
    },
    scales: {
      x: {
        type: 'linear',
        grid: { color: COLORS.grid, drawBorder: false },
        ticks: {
          color: COLORS.text,
          font: { family: 'JetBrains Mono', size: 10 },
          stepSize: 12,
          callback: (v) => {
            const years = v / 12;
            return Number.isInteger(years) ? `${years}y` : '';
          },
        },
      },
      y: {
        grid: { color: COLORS.grid, drawBorder: false },
        ticks: {
          color: COLORS.text,
          font: { family: 'JetBrains Mono', size: 10 },
          callback: (v) => {
            if (v >= 1000) return `€${(v / 1000).toFixed(0)}k`;
            return `€${v}`;
          },
        },
      },
    },
  };
}

export function destroyAllCharts() {
  chartInstances.forEach(c => c.destroy());
  chartInstances.clear();
}

/**
 * Trend chart con bande probabilistiche.
 */
export function renderTrendChart(selector, trendData) {
  if (!window.Chart || !trendData) return;
  const canvas = document.querySelector(selector);
  if (!canvas) return;
  if (chartInstances.has(selector)) chartInstances.get(selector).destroy();

  const points = trendData.map(d => ({ x: d.month }));

  const chart = new Chart(canvas, {
    type: 'line',
    data: {
      datasets: [
        {
          label: 'P95 (best 5%)',
          data: trendData.map(d => ({ x: d.month, y: d.p95 })),
          borderColor: 'rgba(45, 212, 191, 0.25)',
          borderWidth: 1,
          borderDash: [3, 3],
          backgroundColor: 'transparent',
          pointRadius: 0,
          fill: false,
          tension: 0.3,
        },
        {
          label: 'P75',
          data: trendData.map(d => ({ x: d.month, y: d.p75 })),
          borderColor: 'rgba(45, 212, 191, 0.45)',
          borderWidth: 1,
          backgroundColor: COLORS.positiveBand,
          pointRadius: 0,
          fill: '+1',
          tension: 0.3,
        },
        {
          label: 'P25',
          data: trendData.map(d => ({ x: d.month, y: d.p25 })),
          borderColor: 'rgba(45, 212, 191, 0.45)',
          borderWidth: 1,
          backgroundColor: 'transparent',
          pointRadius: 0,
          fill: false,
          tension: 0.3,
        },
        {
          label: 'P50 atteso',
          data: trendData.map(d => ({ x: d.month, y: d.p50 })),
          borderColor: COLORS.positive,
          borderWidth: 2,
          backgroundColor: 'transparent',
          pointRadius: 0,
          fill: false,
          tension: 0.3,
        },
        {
          label: 'P5 (worst 5%)',
          data: trendData.map(d => ({ x: d.month, y: d.p5 })),
          borderColor: 'rgba(248, 113, 113, 0.4)',
          borderWidth: 1,
          borderDash: [3, 3],
          backgroundColor: 'transparent',
          pointRadius: 0,
          fill: false,
          tension: 0.3,
        },
        {
          label: 'Versato cumulato',
          data: trendData.map(d => ({ x: d.month, y: d.contributed })),
          borderColor: COLORS.warning,
          borderWidth: 1.5,
          borderDash: [6, 4],
          backgroundColor: 'transparent',
          pointRadius: 0,
          fill: false,
        },
      ],
    },
    options: commonOptionsTrend(),
  });
  chartInstances.set(selector, chart);
}

/**
 * MC Distribution: barre orizzontali stacked.
 * NB: usiamo dati assoluti (P5, P50, P95) ma li renderizziamo come delta
 * per ottenere effetto "stacked bar" che rappresenta P5→P50→P95.
 */
export function renderMCDistributionChart(selector, mcResults) {
  if (!window.Chart || !mcResults) return;
  const canvas = document.querySelector(selector);
  if (!canvas) return;
  if (chartInstances.has(selector)) chartInstances.get(selector).destroy();

  const labels = mcResults.strategies.map(s => s.label);
  const p5 = mcResults.strategies.map(s => Math.max(0, s.gross.p5));   // protezione: clamp a 0
  const p50 = mcResults.strategies.map(s => Math.max(0, s.gross.p50));
  const p95 = mcResults.strategies.map(s => Math.max(0, s.gross.p95));

  const chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'P5 (worst)',
          data: p5,
          backgroundColor: 'rgba(248, 113, 113, 0.6)',
          borderRadius: 2,
        },
        {
          label: 'Mediana',
          data: p50.map((v, i) => Math.max(0, v - p5[i])),
          backgroundColor: 'rgba(45, 212, 191, 0.7)',
          borderRadius: 2,
        },
        {
          label: 'P95 (best)',
          data: p95.map((v, i) => Math.max(0, v - p50[i])),
          backgroundColor: 'rgba(45, 212, 191, 0.3)',
          borderRadius: 2,
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
          labels: { color: COLORS.text, font: { family: 'JetBrains Mono', size: 11 } },
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
            label: function (ctx) {
              const idx = ctx.dataIndex;
              const datasetIdx = ctx.datasetIndex;
              let val;
              if (datasetIdx === 0) val = p5[idx];
              else if (datasetIdx === 1) val = p50[idx];
              else val = p95[idx];
              return `${ctx.dataset.label}: ${new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val)}`;
            },
          },
        },
      },
      scales: {
        x: {
          stacked: true,
          grid: { color: COLORS.grid },
          ticks: {
            color: COLORS.text,
            font: { family: 'JetBrains Mono', size: 10 },
            callback: (v) => `€${(v / 1000).toFixed(0)}k`,
          },
        },
        y: {
          stacked: true,
          grid: { display: false },
          ticks: { color: COLORS.text, font: { family: 'JetBrains Mono', size: 11 } },
        },
      },
    },
  });
  chartInstances.set(selector, chart);
}
