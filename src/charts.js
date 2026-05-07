// =============================================================================
// CHARTS v2 — Trend redesign + MC probability chart
// =============================================================================
// Modifiche vs v1:
//   - Trend chart: scala logaritmica, colori distinti per ogni banda,
//     punto "OGGI" come marker, label P50 finale, legenda in italiano chiaro
//   - Nuovo: MC probability chart (barre orizzontali colorate per soglia)
//   - MC distribution chart semplificato (mostra solo strategie selezionate)
// =============================================================================

const chartInstances = new Map();

const COLORS = {
  bg: '#0A1A20',
  grid: '#1A3A47',
  gridSubtle: 'rgba(26, 58, 71, 0.4)',
  text: '#7C9AA7',
  textBright: '#C7DDE5',
  // Palette percentili — ognuno distinguibile
  p5:   '#EF4444',     // rosso (worst)
  p25:  '#F59E0B',     // arancione
  p50:  '#2DD4BF',     // verde acqua (mediana)
  p75:  '#34D399',     // verde
  p95:  '#60A5FA',     // blu (best)
  contributed: '#FBBF24',
  band25_75: 'rgba(45, 212, 191, 0.10)',  // banda 50% probabile
  band5_95:  'rgba(45, 212, 191, 0.04)',  // banda 90% probabile
  // Generici
  positive: '#2DD4BF',
  warning: '#FBBF24',
  negative: '#F87171',
  info: '#60A5FA',
  todayMarker: '#FFFFFF',
};

export function destroyAllCharts() {
  chartInstances.forEach(c => c.destroy());
  chartInstances.clear();
}

// =============================================================================
// TREND CHART REDESIGN — scala log + colori distinti + marker "OGGI" + label finale
// =============================================================================
export function renderTrendChart(selector, trendData, options = {}) {
  if (!window.Chart || !trendData || trendData.length === 0) return;
  const canvas = document.querySelector(selector);
  if (!canvas) return;
  if (chartInstances.has(selector)) chartInstances.get(selector).destroy();

  const { useLogScale = true, currentValue = trendData[0]?.p50 ?? 0 } = options;
  const horizonMonths = trendData.length - 1;
  const finalP50 = trendData[trendData.length - 1].p50;
  const finalP5 = trendData[trendData.length - 1].p5;
  const finalP95 = trendData[trendData.length - 1].p95;
  const finalContrib = trendData[trendData.length - 1].contributed;

  // Sostituisci eventuali zeri/negativi per scala log (Chart.js log non gestisce <=0)
  const safeY = (v) => useLogScale && v <= 1 ? 1 : v;

  const datasets = [
    // P95 — best 5% (linea tratteggiata azzurra in alto)
    {
      label: 'Scenario fortunato (5%)',
      data: trendData.map(d => ({ x: d.month, y: safeY(d.p95) })),
      borderColor: COLORS.p95,
      borderWidth: 1.5,
      borderDash: [6, 4],
      backgroundColor: 'transparent',
      pointRadius: 0,
      fill: false,
      tension: 0.2,
    },
    // Banda P25-P75 (riempita: 50% probabilità)
    {
      label: 'Banda probabile (50%)',
      data: trendData.map(d => ({ x: d.month, y: safeY(d.p75) })),
      borderColor: 'rgba(52, 211, 153, 0.6)',
      borderWidth: 1,
      backgroundColor: COLORS.band25_75,
      pointRadius: 0,
      fill: '+1',  // riempi fino al dataset successivo (P25)
      tension: 0.2,
    },
    {
      label: '_p25_hidden',  // dataset di base per il fill, nascondiamo dalla legenda
      data: trendData.map(d => ({ x: d.month, y: safeY(d.p25) })),
      borderColor: 'rgba(245, 158, 11, 0.6)',
      borderWidth: 1,
      backgroundColor: 'transparent',
      pointRadius: 0,
      fill: false,
      tension: 0.2,
    },
    // P50 — mediana (linea spessa verde brillante)
    {
      label: 'Mediana attesa (P50)',
      data: trendData.map(d => ({ x: d.month, y: safeY(d.p50) })),
      borderColor: COLORS.p50,
      borderWidth: 3,
      backgroundColor: 'transparent',
      pointRadius: 0,
      fill: false,
      tension: 0.2,
    },
    // P5 — worst 5% (linea tratteggiata rossa in basso)
    {
      label: 'Scenario sfortunato (5%)',
      data: trendData.map(d => ({ x: d.month, y: safeY(d.p5) })),
      borderColor: COLORS.p5,
      borderWidth: 1.5,
      borderDash: [6, 4],
      backgroundColor: 'transparent',
      pointRadius: 0,
      fill: false,
      tension: 0.2,
    },
    // Versato cumulato (riferimento giallo)
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
    // Punto "OGGI" — marker singolo a x=0
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

  const fmtEur = (v) => new Intl.NumberFormat('it-IT', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(v);

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
            filter: (item) => !item.text.startsWith('_'),  // nascondi dataset _p25_hidden
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
            label: (ctx) => `${ctx.dataset.label}: ${fmtEur(ctx.parsed.y)}`,
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
            text: useLogScale ? 'Valore portafoglio (scala log)' : 'Valore portafoglio (€)',
            color: COLORS.text,
            font: { family: 'JetBrains Mono', size: 10 },
          },
        },
      },
    },
  });
  chartInstances.set(selector, chart);

  // Annotation overlay: label "P50 finale" sull'estremo destro
  // Lo aggiungiamo come elemento custom nel canvas dopo il render
  drawFinalLabels(canvas, chart, finalP50, finalP5, finalP95, finalContrib, currentValue, horizonMonths);
}

// Disegna etichette finali a fine grafico (mediana + range)
function drawFinalLabels(canvas, chart, p50, p5, p95, contrib, current, months) {
  const fmtK = (v) => v >= 1000 ? `€${(v / 1000).toFixed(0)}k` : `€${v.toFixed(0)}`;
  const summary = document.getElementById(canvas.id + '-summary');
  if (!summary) {
    // Cerca un container immediatamente dopo il canvas (creato dall'ui.js)
    return;
  }
  const yearsAhead = (months / 12).toFixed(0);
  summary.innerHTML = `
    <div style="display:flex;gap:24px;flex-wrap:wrap;font-size:11px;padding:12px 0;">
      <div><span style="color:${COLORS.text}">OGGI:</span> <strong style="color:${COLORS.textBright}">${fmtK(current)}</strong></div>
      <div><span style="color:${COLORS.text}">${yearsAhead}a → mediana:</span> <strong style="color:${COLORS.p50}">${fmtK(p50)}</strong></div>
      <div><span style="color:${COLORS.text}">range probabile:</span> <strong>${fmtK(p5)} – ${fmtK(p95)}</strong></div>
      <div><span style="color:${COLORS.text}">versato in ${yearsAhead}a:</span> <strong style="color:${COLORS.contributed}">${fmtK(contrib)}</strong></div>
    </div>
  `;
}

// =============================================================================
// MC DISTRIBUTION CHART — invariato (stacked bars)
// Filtraggio strategie avviene a livello UI, qui mostra ciò che riceve
// =============================================================================
export function renderMCDistributionChart(selector, mcResults, filterLabels = null) {
  if (!window.Chart || !mcResults) return;
  const canvas = document.querySelector(selector);
  if (!canvas) return;
  if (chartInstances.has(selector)) chartInstances.get(selector).destroy();

  // Filtra strategie se richiesto
  let strategies = mcResults.strategies;
  if (filterLabels && Array.isArray(filterLabels)) {
    strategies = strategies.filter(s => filterLabels.includes(s.label));
  }

  const labels = strategies.map(s => s.label);
  const p5 = strategies.map(s => Math.max(0, s.gross.p5));
  const p50 = strategies.map(s => Math.max(0, s.gross.p50));
  const p95 = strategies.map(s => Math.max(0, s.gross.p95));

  const chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'P5 (worst 5%)',
          data: p5,
          backgroundColor: 'rgba(248, 113, 113, 0.6)',
          borderRadius: 2,
        },
        {
          label: 'Mediana → P5',
          data: p50.map((v, i) => Math.max(0, v - p5[i])),
          backgroundColor: 'rgba(45, 212, 191, 0.7)',
          borderRadius: 2,
        },
        {
          label: 'P95 → Mediana',
          data: p95.map((v, i) => Math.max(0, v - p50[i])),
          backgroundColor: 'rgba(96, 165, 250, 0.4)',
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
              let val, label;
              if (datasetIdx === 0) { val = p5[idx]; label = 'P5 (worst)'; }
              else if (datasetIdx === 1) { val = p50[idx]; label = 'Mediana (P50)'; }
              else { val = p95[idx]; label = 'P95 (best)'; }
              return `${label}: ${new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val)}`;
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

// =============================================================================
// NUOVO: MC PROBABILITY CHART — barre raggruppate per soglia
// Mostra P(≥X €) per ogni strategia su soglie significative
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

  // Soglie a cui calcolare la probabilità
  const thresholds = [
    { label: '≥ 125k', key: 'above_125k', color: 'rgba(96, 165, 250, 0.85)' },
    { label: '≥ 250k', key: 'above_250k', color: 'rgba(45, 212, 191, 0.85)' },
    { label: '≥ 400k', key: 'above_400k', color: 'rgba(52, 211, 153, 0.7)' },
    { label: '≥ 600k', key: 'above_600k', color: 'rgba(251, 191, 36, 0.7)' },
  ];

  const datasets = thresholds.map(t => ({
    label: t.label,
    data: strategies.map(s => (s.probabilities?.[t.key] ?? 0) * 100),
    backgroundColor: t.color,
    borderRadius: 2,
  }));

  const chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: strategies.map(s => s.label),
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: { color: COLORS.text, font: { family: 'JetBrains Mono', size: 11 }, boxWidth: 12 },
        },
        title: {
          display: true,
          text: 'Probabilità di superare ciascuna soglia (%)',
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
            label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}%`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: COLORS.text, font: { family: 'JetBrains Mono', size: 10 } },
        },
        y: {
          beginAtZero: true,
          max: 100,
          grid: { color: COLORS.gridSubtle },
          ticks: {
            color: COLORS.text,
            font: { family: 'JetBrains Mono', size: 10 },
            callback: (v) => `${v}%`,
          },
        },
      },
    },
  });
  chartInstances.set(selector, chart);
}
