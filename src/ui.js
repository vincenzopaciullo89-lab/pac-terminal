// =============================================================================
// UI — FINAL (defensive null checks + legacy badge + clean settings)
// =============================================================================

import { config } from './config.js';
import {
  computePortfolio,
  computePriceMetrics,
  getNextScheduledEvents,
} from './portfolioEngine.js';
import {
  getStrategyOfTheMonth,
  recordBoostUsedThisMonth,
} from './strategyEngine.js';
import {
  getAllPrices,
  getHistoricalPrices,
  setManualPrice,
  getCacheAgeHours,
  clearAllCache,
  hasFreshManualPrices,
  getManualPrices,
  getManualPriceAge,
  clearManualPrices,
} from './priceProvider.js';
import { runMonteCarlo as _MC, generateTrendPaths as _TP, deflateTrend, clearMCCache as _CMC } from './monteCarloEngine.js';
import { renderTrendChart, renderMCDistributionChart, renderMCProbabilityChart, destroyAllCharts } from './charts.js';
import { getBoostStats } from './strategyEngine.js';

// -------------------------------------------------------------------------
// FORMATTING
// -------------------------------------------------------------------------
const fmt = {
  eur(n, dp = 0) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return new Intl.NumberFormat('it-IT', {
      style: 'currency', currency: 'EUR',
      minimumFractionDigits: dp, maximumFractionDigits: dp,
    }).format(n);
  },
  num(n, dp = 2) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return new Intl.NumberFormat('it-IT', {
      minimumFractionDigits: dp, maximumFractionDigits: dp,
    }).format(n);
  },
  pct(n, dp = 1) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    const sign = n > 0 ? '+' : '';
    return `${sign}${(n * 100).toFixed(dp)}%`;
  },
  date(d) {
    return new Intl.DateTimeFormat('it-IT', {
      day: 'numeric', month: 'short', year: 'numeric',
    }).format(d);
  },
  monthShort(d) {
    return new Intl.DateTimeFormat('it-IT', { month: 'short' }).format(d);
  },
};

const isNum = (v) => typeof v === 'number' && !isNaN(v);
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// -------------------------------------------------------------------------
// STATE
// -------------------------------------------------------------------------

// -------------------------------------------------------------------------
// PAC SCHEDULE HELPERS — gestione schedule variabile salvata in localStorage
// -------------------------------------------------------------------------
const PAC_SCHEDULE_KEY = 'pd_pac_schedule_v3';

function getPacSchedule() {
  try {
    const saved = JSON.parse(localStorage.getItem(PAC_SCHEDULE_KEY) || 'null');
    if (Array.isArray(saved) && saved.length > 0) return saved;
  } catch {}
  // Default: PAC base costante
  return [{ startMonth: 0, amount: config.pac.baseMonthlyAmount }];
}

function savePacSchedule(schedule) {
  try {
    localStorage.setItem(PAC_SCHEDULE_KEY, JSON.stringify(schedule));
  } catch {}
}

function resetPacSchedule() {
  try { localStorage.removeItem(PAC_SCHEDULE_KEY); } catch {}
}

// -------------------------------------------------------------------------
// HORIZON STATE (5/10/20 anni per trend e MC)
// -------------------------------------------------------------------------
const horizonState = {
  trend: 120,  // default 10 anni
  mc: 240,     // default 20 anni
};

// -------------------------------------------------------------------------
// INFLATION TOGGLE STATE
// -------------------------------------------------------------------------
let inflationActive = false;

const state = {
  prices: {},
  portfolio: null,
  metrics: {},
  strategy: null,
  mcResults: null,
  trendData: null,
};

// -------------------------------------------------------------------------
// HEADER STATUS — verde se c'è almeno una fonte fresca (manual o cache)
// -------------------------------------------------------------------------

// -------------------------------------------------------------------------
// TERMINAL BAR (Bloomberg-style) — sticky in alto
// -------------------------------------------------------------------------
function renderTerminalBar() {
  const m = state.metrics.global;
  const strat = state.strategy;
  const portfolio = state.portfolio;

  // VWCE prezzo (cerca da prices o da portfolio holdings)
  let vwcePrice = null;
  if (state.prices['VWCE.MI']?.price) {
    vwcePrice = state.prices['VWCE.MI'].price;
  } else if (portfolio?.holdings) {
    const vwceH = portfolio.holdings.find(h => h.ticker === 'VWCE.MI');
    if (vwceH) vwcePrice = vwceH.currentPrice;
  }

  setBar('#tb-vwce', vwcePrice ? fmt.eur(vwcePrice, 2) : '—');

  setBarPct('#tb-dd12m', m?.dd12M, true);
  setBarPct('#tb-ddath', m?.ddATH, true);
  setBarPct('#tb-ma200', m?.madMA200, false);
  setBarPct('#tb-vol', m?.volRolling, false, false, 1);

  if (m && isNum(m.zScore)) {
    const zEl = $('#tb-zscore');
    if (zEl) {
      zEl.textContent = m.zScore.toFixed(2);
      zEl.className = 't-value ' + (Math.abs(m.zScore) > 2 ? 'warning' : '');
    }
  } else setBar('#tb-zscore', '—');

  setBar('#tb-regime', (m?.regime || '—').toUpperCase());
  if (strat) {
    const tierEl = $('#tb-tier');
    if (tierEl) {
      tierEl.textContent = `T${strat.tier ?? 0}`;
      tierEl.className = 't-value ' + (strat.tier > 0 ? 'warning' : 'positive');
    }
  }

  // PAC schedule corrente
  const sched = getPacSchedule();
  const pacEl = $('#tb-pac');
  if (pacEl) {
    if (sched.length === 1) {
      pacEl.textContent = `€${sched[0].amount}`;
    } else {
      pacEl.textContent = sched.map(s =>
        s.startMonth === 0 ? `€${s.amount}` : `${(s.startMonth/12).toFixed(0)}a→€${s.amount}`
      ).join('/');
    }
  }
}

function setBar(sel, value) {
  const el = $(sel);
  if (el) {
    el.textContent = value;
    el.className = 't-value';
  }
}

function setBarPct(sel, value, negativeIsBad = false, positiveIsBad = false, dp = 1) {
  const el = $(sel);
  if (!el) return;
  if (!isNum(value)) {
    el.textContent = '—';
    el.className = 't-value';
    return;
  }
  el.textContent = fmt.pct(value, dp);
  let cls = 't-value';
  if (value < -0.05 && negativeIsBad) cls += ' negative';
  else if (value > 0.05 && !positiveIsBad) cls += ' positive';
  else if (value > 0.10 && negativeIsBad) cls += ' positive';
  el.className = cls;
}


// Helper null-safe per setText e setClass
function safeSetText(sel, text) {
  const el = $(sel); if (el) el.textContent = text;
}
function safeSetClass(sel, className) {
  const el = $(sel); if (el) el.className = className;
}
function safeSetHTML(sel, html) {
  const el = $(sel); if (el) el.innerHTML = html;
}

function renderHeaderStatus() {
  const apiStatus = $('#api-status');
  if (!apiStatus) return;
  const dot = apiStatus.querySelector('.status-dot');
  const text = apiStatus.querySelector('.status-text');

  const hasManual = hasFreshManualPrices();
  const cacheAge = getCacheAgeHours();
  const hasCache = cacheAge !== null && parseFloat(cacheAge) < 24;

  if (hasManual) {
    dot.className = 'status-dot';
    text.textContent = 'Prezzi manuali · attivi';
  } else if (hasCache) {
    dot.className = 'status-dot';
    text.textContent = `Aggiornato ${cacheAge}h fa`;
  } else {
    dot.className = 'status-dot warning';
    text.textContent = 'Prezzi fallback (statici)';
  }

  const dateEl = $('#date-status');
  if (dateEl) dateEl.textContent = fmt.date(new Date());
}

// -------------------------------------------------------------------------
// HERO: STRATEGY OF THE MONTH
// -------------------------------------------------------------------------
function renderHero(strategy) {
  const card = $('#hero-card');
  if (!card || !strategy) return;

  card.className = `hero-card tier-${strategy.tier}`;

  safeSetText('#hero-eyebrow-tier', strategy.tierLabel || '—');
  const eyebrowBadge = $('#hero-eyebrow-tier');
  if (eyebrowBadge) eyebrowBadge.className = `tier-badge tier-${strategy.tier}`;
  safeSetText('#hero-eyebrow-date', fmt.date(new Date()).toUpperCase());

  let headline;
  if (strategy.tier === 0) {
    headline = `Mercato a regime <em>normale</em>. Mantieni la disciplina.`;
  } else if (strategy.capReached) {
    headline = `Drawdown rilevato, ma <em>cap annuale raggiunto</em>.`;
  } else if (strategy.tier === 1) {
    headline = `Drawdown <em>moderato</em>. Boost lieve consigliato.`;
  } else if (strategy.tier === 2) {
    headline = `Drawdown <em>significativo</em>. Boost pianificato.`;
  } else if (strategy.tier === 3) {
    headline = `Drawdown <em>severo</em>. Opportunità di accumulo.`;
  } else {
    headline = `Drawdown <em>estremo</em>. Massima opportunità.`;
  }
  $('#hero-headline').innerHTML = headline;
  $('#hero-rationale').textContent = strategy.rationale || '';

  $('#amount-base').textContent = fmt.eur(strategy.baseAmount);
  $('#amount-extra').textContent = fmt.eur(strategy.extraAmount);
  $('#amount-extra').className = `amount-value ${strategy.extraAmount > 0 ? 'positive' : ''}`;
  $('#amount-total').textContent = fmt.eur(strategy.totalAmount);
  $('#amount-total').className = `amount-value ${strategy.tier > 0 && !strategy.capReached ? 'positive' : ''}`;

  // Stats — TUTTI con isNum check defensivo
  safeSetText('#stat-dd12m', isNum(strategy.drawdown) ? fmt.pct(strategy.drawdown) : '—');
  safeSetClass('#stat-dd12m', `stat-value ${isNum(strategy.drawdown) && strategy.drawdown < -0.05 ? 'negative' : 'positive'}`);

  safeSetText('#stat-ddath', isNum(strategy.drawdownATH) ? fmt.pct(strategy.drawdownATH) : '—');
  safeSetClass('#stat-ddath', `stat-value ${isNum(strategy.drawdownATH) && strategy.drawdownATH < -0.05 ? 'negative' : 'positive'}`);

  safeSetText('#stat-mad', isNum(strategy.madMA200) ? fmt.pct(strategy.madMA200) : '—');
  safeSetClass('#stat-mad', `stat-value ${isNum(strategy.madMA200) && strategy.madMA200 < 0 ? 'negative' : 'positive'}`);

  safeSetText('#stat-zscore', isNum(strategy.zScore) ? strategy.zScore.toFixed(2) : '—');

  const regime = strategy.regime || 'normal';
  safeSetHTML('#stat-regime', `<span class="regime-pill ${regime}">${regime}</span>`);

  safeSetText('#stat-vol', isNum(strategy.volRolling) ? fmt.pct(strategy.volRolling, 1) : '—');

  safeSetText('#stat-confidence', (strategy.confidence || 'low').toUpperCase());
  safeSetText('#stat-boosts', `${strategy.monthsUsed ?? 0}/${config.pac.capBoostMonthsPerYear}`);

  // Action items (defensive)
  const ul = $('#action-list');
  if (ul) {
    ul.innerHTML = '';
    (strategy.actionItems || []).forEach(item => {
      const li = document.createElement('li');
      li.textContent = item;
      ul.appendChild(li);
    });
  }

  // Warnings (defensive)
  const wDiv = $('#warnings-list');
  if (wDiv) {
    wDiv.innerHTML = '';
    const warnsArr = Array.isArray(strategy.warnings) ? strategy.warnings : [];
    if (warnsArr.length === 0) {
      wDiv.innerHTML = '<div class="warning-item">— Nessun warning attivo</div>';
    } else {
      warnsArr.forEach(w => {
        const d = document.createElement('div');
        d.className = 'warning-item';
        d.textContent = w;
        wDiv.appendChild(d);
      });
    }
  }

  safeSetText('#allocation-note', strategy.allocationNote || '');
}

// -------------------------------------------------------------------------
// PORTFOLIO TRACKER
// -------------------------------------------------------------------------
function renderTracker(portfolio) {
  if (!portfolio) return;

  $('#tot-value').textContent = fmt.eur(portfolio.totalValue);
  $('#tot-invested').textContent = fmt.eur(portfolio.totalInvested);
  $('#tot-pnl').textContent = `${portfolio.totalPnL >= 0 ? '+' : ''}${fmt.eur(portfolio.totalPnL)}`;
  $('#tot-pnl').className = `delta ${portfolio.totalPnL >= 0 ? 'positive' : 'negative'}`;
  $('#tot-pnlpct').textContent = fmt.pct(portfolio.totalPnLPct);
  $('#tot-pnlpct').className = `delta ${portfolio.totalPnLPct >= 0 ? 'positive' : 'negative'}`;
  $('#tot-latent-tax').textContent = fmt.eur(portfolio.latentTax);
  $('#tot-net').textContent = fmt.eur(portfolio.netIfLiquidated);

  const tbody = $('#holdings-tbody');
  if (tbody) {
    tbody.innerHTML = '';
    for (const h of portfolio.holdings) {
      const tr = document.createElement('tr');
      const legacyBadge = h.isLegacy
        ? ' <span class="badge-legacy">LEGACY</span>'
        : '';
      tr.innerHTML = `
        <td class="label">
          ${h.name.split(' ').slice(0, 4).join(' ')}${legacyBadge}
          <small>${h.ticker} · ${h.isin}</small>
        </td>
        <td class="num">${fmt.num(h.units, 4)}</td>
        <td class="num">${fmt.eur(h.avgCost, 2)}</td>
        <td class="num">${fmt.eur(h.currentPrice, 2)}</td>
        <td class="num">${fmt.eur(h.currentValue)}</td>
        <td class="num"><span class="delta ${h.pnlPct >= 0 ? 'positive' : 'negative'}">${fmt.pct(h.pnlPct)}</span></td>
        <td class="num">${(h.effectiveWeight * 100).toFixed(1)}%</td>
      `;
      tbody.appendChild(tr);
    }
  }

  // Risk metrics rimossi dal tracker (ora solo nella terminal-bar in alto, no ridondanza)
  // Ledger fiscalità latente in evidenza
  const totalPlus = portfolio.totalPnL > 0 ? portfolio.totalPnL : 0;
  const latentTaxEl = $('#tot-latent-plus');
  if (latentTaxEl) {
    latentTaxEl.textContent = portfolio.totalPnL >= 0
      ? '+' + fmt.eur(totalPlus)
      : fmt.eur(portfolio.totalPnL);
    latentTaxEl.className = portfolio.totalPnL >= 0 ? 'positive' : 'negative';
  }

  const events = getNextScheduledEvents();
  const evBox = $('#calendar-events');
  if (evBox) {
    evBox.innerHTML = '';
    events.slice(0, 2).forEach(ev => {
      const d = document.createElement('div');
      d.className = 'calendar-event';
      d.innerHTML = `
        <div class="calendar-day">${ev.date.getDate()}</div>
        <div class="calendar-info">
          <div class="month">${fmt.monthShort(ev.date)} ${ev.date.getFullYear()}</div>
          <div class="desc">${ev.description}</div>
        </div>
      `;
      evBox.appendChild(d);
    });
  }
}

// -------------------------------------------------------------------------
// MONTE CARLO TABLE
// -------------------------------------------------------------------------
function renderMCResults(results) {
  if (!results) return;
  const tbody = $('#mc-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  // v3: il worker ora ritorna UNA SOLA strategia "PAC tactical"
  // (l'utente non vuole confronti con costante)
  const strategies = results.strategies;

  for (const s of strategies) {
    const tr = document.createElement('tr');
    tr.classList.add('highlight');
    tr.innerHTML = `
      <td>${s.label}</td>
      <td>${fmt.eur(s.contributedMedian)}</td>
      <td>${fmt.eur(s.gross.p5)}</td>
      <td>${fmt.eur(s.gross.p50)}</td>
      <td>${fmt.eur(s.gross.p95)}</td>
      <td>${fmt.eur(s.net.p50)}</td>
      <td>${(s.probabilities.above_250k * 100).toFixed(1)}%</td>
      <td>${(s.probabilities.above_400k * 100).toFixed(1)}%</td>
      <td>${(s.drawdown.median * 100).toFixed(1)}%</td>
    `;
    tbody.appendChild(tr);
  }

  $('#mc-meta').textContent = `${results.nSim.toLocaleString('it-IT')} simulazioni \u00b7 ${results.horizonYears} anni \u00b7 ${(results.elapsedMs / 1000).toFixed(1)}s`;
  $('#mc-status').classList.add('hidden');
  $('#mc-table-wrap').classList.remove('hidden');

  // Render dei due grafici (no filtro: una sola strategia)
  renderMCDistributionChart('#mc-chart', results);
  renderMCProbabilityChart('#mc-prob-chart', results);
}

// Helper rimosso: grafici hanno gi\u00e0 canvas in HTML
function _ensureProbCanvasUnused() {
  if ($('#mc-prob-chart')) return;
  const mcChart = $('#mc-chart');
  if (!mcChart) return;
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'margin-top:24px;padding-top:24px;border-top:1px solid var(--border-subtle);height:320px;position:relative;';
  const canvas = document.createElement('canvas');
  canvas.id = 'mc-prob-chart';
  wrapper.appendChild(canvas);
  mcChart.parentElement.parentElement.appendChild(wrapper);
}

// -------------------------------------------------------------------------
// SETTINGS MODAL
// -------------------------------------------------------------------------
function setupSettings() {
  const modal = $('#settings-modal');
  if (!modal) return;
  const open = () => {
    modal.classList.add('show');
    populateManualPrices();
  };
  const close = () => modal.classList.remove('show');

  $('#btn-settings')?.addEventListener('click', open);
  $('#settings-close')?.addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('show')) close();
  });

  function populateManualPrices() {
    const wrap = $('#manual-prices');
    if (!wrap) return;
    wrap.innerHTML = '';
    const manuals = getManualPrices();
    config.allocation.forEach((alloc) => {
      const existing = manuals[alloc.ticker];
      const age = getManualPriceAge(alloc.ticker);
      const ageNote = age !== null ? ` <span class="muted">· aggiornato ${age}h fa</span>` : '';
      const div = document.createElement('div');
      div.className = 'field';
      div.innerHTML = `
        <label>${alloc.name}${ageNote}</label>
        <input type="number" step="0.01" id="manual-${alloc.id}" placeholder="es. 131.50" value="${existing?.price ?? ''}" aria-label="Prezzo manuale ${alloc.ticker}">
        <div class="field-help">Ticker: ${alloc.ticker} · Trova il prezzo attuale su <a href="https://www.justetf.com/it/etf-profile.html?isin=${alloc.isin}" target="_blank" rel="noopener">justETF</a></div>
      `;
      wrap.appendChild(div);
    });
  }

  $('#settings-save')?.addEventListener('click', () => {
    config.allocation.forEach(alloc => {
      const el = document.getElementById(`manual-${alloc.id}`);
      if (!el) return;
      const v = parseFloat(el.value);
      if (v > 0) setManualPrice(alloc.ticker, v);
    });
    close();
    refresh(true);
  });

  $('#settings-clear-manual')?.addEventListener('click', () => {
    if (confirm('Cancellare tutti i prezzi manuali? Tornerà ai fallback statici.')) {
      clearManualPrices();
      populateManualPrices();
      refresh(true);
    }
  });

  $('#settings-clear')?.addEventListener('click', () => {
    if (confirm('Cancellare cache prezzi e Monte Carlo? (i prezzi manuali restano)')) {
      clearAllCache();
      _CMC();
      location.reload();
    }
  });
}

// -------------------------------------------------------------------------
// TAX SIMULATOR
// -------------------------------------------------------------------------
function setupBoostButton() {
  const btn = $('#btn-record-boost');
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (!state.strategy || state.strategy.tier === 0) {
      alert('Nessun boost da registrare questo mese.');
      return;
    }
    if (state.strategy.capReached) {
      alert('Cap annuale raggiunto. Nessun boost da registrare.');
      return;
    }
    if (confirm(`Confermi di aver investito €${state.strategy.totalAmount} questo mese (€${state.strategy.extraAmount} extra)?`)) {
      recordBoostUsedThisMonth(state.strategy.extraAmount, state.strategy.tier);
      refresh();
    }
  });
}

// -------------------------------------------------------------------------
// MAIN REFRESH
// -------------------------------------------------------------------------

function ensureTrendSummary() {
  const trendCanvas = $('#trend-chart');
  if (!trendCanvas) return;
  const id = 'trend-chart-summary';
  if (document.getElementById(id)) return;
  const div = document.createElement('div');
  div.id = id;
  trendCanvas.parentElement.parentElement.appendChild(div);
}


// -------------------------------------------------------------------------
// CHANGE PAC MODAL — modifica schedule strutturale
// -------------------------------------------------------------------------
function setupChangePAC() {
  const btn = $('#btn-change-pac');
  const modal = $('#changepac-modal');
  const closeBtn = $('#changepac-close');
  const saveBtn = $('#cp-save');
  const resetBtn = $('#cp-reset');

  if (!btn || !modal) return;

  btn.addEventListener('click', () => {
    renderCurrentSchedule();
    const current = getPacSchedule();
    const last = current[current.length - 1];
    if ($('#cp-new-amount')) $('#cp-new-amount').value = last.amount;
    if ($('#cp-start-month')) $('#cp-start-month').value = '0';
    modal.classList.add('open');
  });

  if (closeBtn) closeBtn.addEventListener('click', () => modal.classList.remove('open'));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('open');
  });

  if (saveBtn) saveBtn.addEventListener('click', () => {
    const amount = parseFloat($('#cp-new-amount').value);
    const startMonth = parseInt($('#cp-start-month').value) || 0;

    if (!amount || amount <= 0) {
      alert('Inserisci un importo PAC valido (>€0)');
      return;
    }

    const current = getPacSchedule();
    let newSchedule;

    if (startMonth === 0) {
      // Reset totale: solo questo importo da subito
      newSchedule = [{ startMonth: 0, amount }];
    } else {
      // Aggiungi segmento dopo i primi N mesi
      const baseAmount = current[0].amount;
      newSchedule = [
        { startMonth: 0, amount: baseAmount },
        { startMonth, amount },
      ];
    }

    savePacSchedule(newSchedule);
    modal.classList.remove('open');

    // Forzo ricalcolo trend + MC
    refresh(true);
  });

  if (resetBtn) resetBtn.addEventListener('click', () => {
    if (!confirm('Reset PAC a €500 costante? Lo schedule attuale verrà perso.')) return;
    resetPacSchedule();
    modal.classList.remove('open');
    refresh(true);
  });
}

function renderCurrentSchedule() {
  const box = $('#cp-current-schedule');
  if (!box) return;
  const schedule = getPacSchedule();
  let html = '<span class="label">Schedule attuale</span>';
  schedule.forEach((seg, i) => {
    const yr = (seg.startMonth / 12).toFixed(1);
    const next = schedule[i + 1];
    const until = next ? `(fino a ${(next.startMonth / 12).toFixed(0)}a)` : '(in poi)';
    const startStr = seg.startMonth === 0 ? 'Oggi' : `Dal mese ${seg.startMonth} (${yr}a)`;
    html += `<div class="segment"><span>${startStr}</span><strong>€${seg.amount}/mese ${until}</strong></div>`;
  });
  box.innerHTML = html;
}

// -------------------------------------------------------------------------
// INFLATION TOGGLE
// -------------------------------------------------------------------------
function setupInflationToggle() {
  const toggle = $('#toggle-inflation');
  if (!toggle) return;

  // Restore preference
  const saved = localStorage.getItem('pd_inflation_active') === 'true';
  toggle.checked = saved;
  inflationActive = saved;

  toggle.addEventListener('change', () => {
    inflationActive = toggle.checked;
    localStorage.setItem('pd_inflation_active', inflationActive ? 'true' : 'false');
    // Re-render trend (no need to re-run MC)
    if (state.trendData) renderTrendSection();
  });
}

// -------------------------------------------------------------------------
// HORIZON TOGGLE (5/10/20 anni)
// -------------------------------------------------------------------------
function setupHorizonToggle() {
  $$('.horizon-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const horizon = parseInt(btn.dataset.horizon);
      const target = btn.dataset.target;
      if (!horizon || !target) return;

      // Update active state
      $$(`.horizon-btn[data-target="${target}"]`).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      horizonState[target] = horizon;

      if (target === 'trend') {
        // Ricalcola trend (veloce, no worker)
        recomputeTrend();
      } else if (target === 'mc') {
        // Ricalcola MC (richiede worker)
        recomputeMC();
      }
    });
  });
}

// -------------------------------------------------------------------------
// RECOMPUTE TREND (veloce)
// -------------------------------------------------------------------------
function recomputeTrend() {
  if (!state.portfolio) return;
  const schedule = getPacSchedule();
  state.trendData = _TP({
    horizonMonths: horizonState.trend,
    currentValue: state.portfolio.totalValue,
    pacSchedule: schedule,
  });
  renderTrendSection();
}

function renderTrendSection() {
  if (!state.trendData) return;
  const dataToShow = inflationActive ? deflateTrend(state.trendData, 0.02) : state.trendData;
  renderTrendChart('#trend-chart', dataToShow, {
    useLogScale: true,
    currentValue: state.portfolio?.totalValue ?? 0,
  });
  renderTrendSummary(dataToShow);

  // Update meta
  const yrs = (horizonState.trend / 12).toFixed(0);
  const metaEl = $('#trend-meta');
  if (metaEl) {
    metaEl.textContent = `${yrs} anni · ${inflationActive ? 'valori reali (defl. 2%/anno)' : 'valori nominali'}`;
  }
}

function renderTrendSummary(data) {
  const box = $('#trend-summary');
  if (!box || !data || data.length === 0) return;
  const last = data[data.length - 1];
  const current = state.portfolio?.totalValue ?? data[0].p50;
  const yrs = ((data.length - 1) / 12).toFixed(0);
  const fmtK = (v) => v >= 1000 ? `€${(v/1000).toFixed(0)}k` : `€${v.toFixed(0)}`;

  box.innerHTML = `
    <div class="trend-summary-item"><span class="label">Oggi</span><span class="value">${fmtK(current)}</span></div>
    <div class="trend-summary-item"><span class="label">${yrs}a — P50 atteso</span><span class="value p50">${fmtK(last.p50)}</span></div>
    <div class="trend-summary-item"><span class="label">${yrs}a — range probabile</span><span class="value">${fmtK(last.p5)} – ${fmtK(last.p95)}</span></div>
    <div class="trend-summary-item"><span class="label">${yrs}a — versato</span><span class="value contributed">${fmtK(last.contributed)}</span></div>
  `;
}

// -------------------------------------------------------------------------
// RECOMPUTE MC (con worker)
// -------------------------------------------------------------------------
async function recomputeMC() {
  $('#mc-status').classList.remove('hidden');
  $('#mc-table-wrap').classList.add('hidden');
  $('#mc-progress').textContent = 'Ricalcolo Monte Carlo in corso...';

  try {
    const schedule = getPacSchedule();
    const mc = await _MC({
      onProgress: (cur, tot, label) => {
        $('#mc-progress').textContent = `Strategia ${cur + 1}/${tot}: ${label}`;
      },
      forceRefresh: false,
      currentValue: state.portfolio?.totalValue ?? 0,
      horizonMonths: horizonState.mc,
      pacSchedule: schedule,
    });
    state.mcResults = mc;
    renderMCResults(mc);
  } catch (err) {
    $('#mc-status').innerHTML = `<div style="color:var(--accent-negative);padding:24px;text-align:center;">Errore: ${err.message}</div>`;
  }
}

async function refresh(forceReload = false) {
  renderHeaderStatus();
  destroyAllCharts();

  // 1. Prices (con timeout per non bloccare se Stooq non risponde)
  try {
    state.prices = await getAllPrices(forceReload);
  } catch (err) {
    console.warn('Price fetch failed:', err);
    state.prices = {};
  }

  // 2. Portfolio (sempre calcolabile, anche con prezzi fallback)
  state.portfolio = computePortfolio(state.prices);

  // 3. Historical metrics (best-effort, può fallire silenziosamente)
  const globalAlloc = config.allocation.find(a => a.role === 'core');
  state.metrics.global = null;
  if (globalAlloc) {
    try {
      const hist = await getHistoricalPrices(globalAlloc.ticker, 252);
      if (hist.data && hist.data.length > 0) {
        const currentPrice = state.prices[globalAlloc.ticker]?.price || 0;
        if (currentPrice > 0) {
          state.metrics.global = computePriceMetrics(hist.data, currentPrice);
        }
      }
    } catch (err) {
      console.warn('Historical fetch failed:', err);
    }
  }

  // 4. Strategy
  state.strategy = getStrategyOfTheMonth(state.metrics.global, state.portfolio);

  // 5. Render
  renderHero(state.strategy);
  renderTracker(state.portfolio);
  renderTerminalBar();
  renderBoostHistory();

  // Aggiorna dropdown tax simulator quando cambiano i prezzi
  if (window._taxSimRefresh) window._taxSimRefresh();

  // Aggiorna header status di nuovo (potrebbe essere cambiato dopo i fetch)
  renderHeaderStatus();

  // 6. Trend chart
  // Trend con horizon variabile e schedule da localStorage
  recomputeTrend();

  // 7. Monte Carlo (async)
  $('#mc-status').classList.remove('hidden');
  $('#mc-table-wrap').classList.add('hidden');
  $('#mc-progress').textContent = 'Inizializzazione Web Worker...';

  try {
    const schedule = getPacSchedule();
    const mc = await _MC({
      onProgress: (current, total, label) => {
        $('#mc-progress').textContent = `Strategia ${current + 1}/${total}: ${label}`;
      },
      forceRefresh: forceReload,
      currentValue: state.portfolio.totalValue,
      horizonMonths: horizonState.mc,
      pacSchedule: schedule,
    });
    state.mcResults = mc;
    renderMCResults(mc);
  } catch (err) {
    $('#mc-status').innerHTML = `<div style="color:var(--accent-negative);padding:24px;text-align:center;">Errore Monte Carlo: ${err.message}</div>`;
  }

  // Re-applica tooltip dopo render (gli elementi possono essere ricreati)
  setupTooltips();
}

// -------------------------------------------------------------------------
// INIT
// -------------------------------------------------------------------------

// -------------------------------------------------------------------------
// TOOLTIPS — spiegazioni visibili al hover su metriche complesse
// -------------------------------------------------------------------------
function setupTooltips() {
  // Mappa: selettore elemento da arricchire \u2192 testo del tooltip
  const TOOLTIPS = {
    // Hero card metrics
    '[data-metric="zscore"]': 'Z-score 21d: di quanto il rendimento del mese si discosta dalla media storica, in deviazioni standard. |z|<1 normale, |z|>2 inusuale, |z|>3 eccezionale.',
    '[data-metric="ma200dev"]': 'Deviazione dalla media mobile 200 giorni. >+10% trend rialzista esteso, <-5% inizio drawdown significativo.',
    '[data-metric="vol60d"]': 'Volatilit\u00e0 annualizzata sugli ultimi 60 giorni. <15% calmo, 15-20% normale, >25% stress.',
    '[data-metric="dd12m"]': 'Drawdown 12 mesi: scostamento percentuale dal massimo recente. \u00c8 il trigger primario per attivare il boost del PAC.',
    '[data-metric="ddath"]': 'Drawdown dal massimo storico (all-time-high) del periodo disponibile.',
    '[data-metric="boostytd"]': 'Numero di mesi in cui hai gi\u00e0 fatto un boost quest\'anno. Cap massimo: 6/anno per evitare over-trading.',
    // Bottone boost
    '#btn-record-boost': 'Click solo quando hai effettivamente fatto un bonifico extra rispetto al PAC base. Aggiorna il contatore BOOST YTD.',
  };

  for (const [selector, text] of Object.entries(TOOLTIPS)) {
    document.querySelectorAll(selector).forEach(el => {
      if (!el.dataset.tooltipAttached) {
        el.title = text;  // fallback nativo
        el.dataset.tooltipAttached = '1';
        el.style.cursor = 'help';
      }
    });
  }
}

export async function initApp() {
  setupSettings();
  setupBoostButton();
  setupChangePAC();
  setupInflationToggle();
  setupHorizonToggle();
  setupTooltips();

  $('#btn-refresh')?.addEventListener('click', () => refresh(true));

  $('#footer-date').textContent = new Date().getFullYear();

  await refresh();
}
