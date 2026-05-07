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
import { runMonteCarlo, generateTrendPaths, clearMCCache } from './monteCarloEngine.js';
import { simulateSale } from './taxEngine.js';
import { computeFlip, stressTest } from './realEstateEngine.js';
import { renderTrendChart, renderMCDistributionChart, destroyAllCharts } from './charts.js';

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

  $('#hero-eyebrow-tier').textContent = strategy.tierLabel || '—';
  const eyebrowBadge = $('#hero-eyebrow-tier');
  if (eyebrowBadge) eyebrowBadge.className = `tier-badge tier-${strategy.tier}`;
  $('#hero-eyebrow-date').textContent = fmt.date(new Date()).toUpperCase();

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
  $('#stat-dd12m').textContent = isNum(strategy.drawdown) ? fmt.pct(strategy.drawdown) : '—';
  $('#stat-dd12m').className = `stat-value ${isNum(strategy.drawdown) && strategy.drawdown < -0.05 ? 'negative' : 'positive'}`;

  $('#stat-ddath').textContent = isNum(strategy.drawdownATH) ? fmt.pct(strategy.drawdownATH) : '—';
  $('#stat-ddath').className = `stat-value ${isNum(strategy.drawdownATH) && strategy.drawdownATH < -0.05 ? 'negative' : 'positive'}`;

  $('#stat-mad').textContent = isNum(strategy.madMA200) ? fmt.pct(strategy.madMA200) : '—';
  $('#stat-mad').className = `stat-value ${isNum(strategy.madMA200) && strategy.madMA200 < 0 ? 'negative' : 'positive'}`;

  $('#stat-zscore').textContent = isNum(strategy.zScore) ? strategy.zScore.toFixed(2) : '—';

  const regime = strategy.regime || 'normal';
  $('#stat-regime').innerHTML = `<span class="regime-pill ${regime}">${regime}</span>`;

  $('#stat-vol').textContent = isNum(strategy.volRolling) ? fmt.pct(strategy.volRolling, 1) : '—';

  $('#stat-confidence').textContent = (strategy.confidence || 'low').toUpperCase();
  $('#stat-boosts').textContent = `${strategy.monthsUsed ?? 0}/${config.pac.capBoostMonthsPerYear}`;

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

  $('#allocation-note').textContent = strategy.allocationNote || '';
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

  const globalMetrics = state.metrics.global;
  if (globalMetrics) {
    $('#metric-dd-ath').textContent = isNum(globalMetrics.ddATH) ? fmt.pct(globalMetrics.ddATH) : '—';
    $('#metric-dd-ath').className = `metric-value ${isNum(globalMetrics.ddATH) && globalMetrics.ddATH < -0.05 ? 'negative' : 'positive'}`;
    $('#metric-dd-12m').textContent = isNum(globalMetrics.dd12M) ? fmt.pct(globalMetrics.dd12M) : '—';
    $('#metric-dd-12m').className = `metric-value ${isNum(globalMetrics.dd12M) && globalMetrics.dd12M < -0.05 ? 'negative' : 'positive'}`;
    $('#metric-mad').textContent = isNum(globalMetrics.madMA200) ? fmt.pct(globalMetrics.madMA200) : '—';
    $('#metric-mad').className = `metric-value ${isNum(globalMetrics.madMA200) && globalMetrics.madMA200 < 0 ? 'negative' : 'positive'}`;
    $('#metric-vol').textContent = isNum(globalMetrics.volRolling) ? fmt.pct(globalMetrics.volRolling, 1) : '—';
    $('#metric-z').textContent = isNum(globalMetrics.zScore) ? globalMetrics.zScore.toFixed(2) : '—';
  } else {
    ['#metric-dd-ath', '#metric-dd-12m', '#metric-mad', '#metric-vol', '#metric-z'].forEach(s => {
      const el = $(s);
      if (el) el.textContent = '—';
    });
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

  for (const s of results.strategies) {
    const tr = document.createElement('tr');
    if (s.id === 'pac500_tactical') tr.classList.add('highlight');
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

  $('#mc-meta').textContent = `${results.nSim.toLocaleString('it-IT')} simulazioni · ${results.horizonYears} anni · ${(results.elapsedMs / 1000).toFixed(1)}s`;
  $('#mc-status').classList.add('hidden');
  $('#mc-table-wrap').classList.remove('hidden');

  renderMCDistributionChart('#mc-chart', results);
}

// -------------------------------------------------------------------------
// TAX SIMULATOR
// -------------------------------------------------------------------------
function setupTaxSim() {
  // Popola dropdown con ETF dal portafoglio
  function populateETFSelect() {
    const select = $('#tax-etf-select');
    if (!select || !state.portfolio?.holdings) return;

    // Mantieni la prima opzione (placeholder)
    const placeholder = select.querySelector('option[value=""]');
    select.innerHTML = '';
    if (placeholder) select.appendChild(placeholder);

    // Aggiungi un'opzione per ogni ETF con quote > 0
    state.portfolio.holdings.forEach(h => {
      if (h.units <= 0) return;  // skip ETF a 0 quote (es. VWCE prima del primo PAC)
      const opt = document.createElement('option');
      opt.value = h.isin;
      const shortName = h.name.split(' ').slice(0, 4).join(' ');
      const legacyTag = h.isLegacy ? ' [legacy]' : '';
      opt.textContent = `${shortName}${legacyTag} — PMC €${h.avgCost.toFixed(2)} · Prezzo €${h.currentPrice.toFixed(2)}`;
      opt.dataset.pmc = h.avgCost;
      opt.dataset.price = h.currentPrice;
      opt.dataset.units = h.units;
      opt.dataset.value = h.currentValue;
      opt.dataset.pnl = h.pnlAbs;
      select.appendChild(opt);
    });
  }

  // Handler quando l'utente seleziona un ETF
  function onETFSelect() {
    const select = $('#tax-etf-select');
    const opt = select?.selectedOptions?.[0];
    if (!opt || !opt.value) return;

    const pmc = parseFloat(opt.dataset.pmc);
    const price = parseFloat(opt.dataset.price);

    // Precompila PMC e prezzo
    if (!isNaN(pmc)) $('#tax-cost').value = pmc.toFixed(2);
    if (!isNaN(price)) $('#tax-price').value = price.toFixed(2);

    // Trigger ricalcolo
    calc();
  }

  const calc = () => {
    const amt = parseFloat($('#tax-amount').value);
    const cost = parseFloat($('#tax-cost').value);
    const price = parseFloat($('#tax-price').value);
    const out = $('#tax-result');
    if (!out) return;

    if (!amt || amt <= 0) {
      out.className = 'result-box';
      // Se ho un ETF selezionato, mostra info utili anche senza importo
      const select = $('#tax-etf-select');
      const opt = select?.selectedOptions?.[0];
      if (opt && opt.value) {
        const value = parseFloat(opt.dataset.value);
        const pnl = parseFloat(opt.dataset.pnl);
        const taxIfFull = pnl > 0 ? pnl * 0.26 : 0;
        out.innerHTML = `
          <div class="muted" style="margin-bottom:12px;">Inserisci un importo per simulare la vendita parziale.</div>
          <div style="display:grid;grid-template-columns:1fr auto;gap:6px 16px;font-size:12px;">
            <span class="muted">Posizione attuale</span><span class="text-right">${fmt.eur(value)}</span>
            <span class="muted">Plus/minus latente</span>
            <span class="text-right ${pnl >= 0 ? 'positive' : 'negative'}">${fmt.eur(pnl)}</span>
            <span class="muted">Se vendessi TUTTO oggi, tassa</span>
            <span class="text-right negative">${fmt.eur(taxIfFull)}</span>
          </div>
        `;
      } else {
        out.innerHTML = '<div class="muted">Seleziona un ETF dal menu e inserisci un importo per simulare la vendita.</div>';
      }
      return;
    }

    const r = simulateSale(amt, cost || 0, price || 1);
    if (!r) return;

    let cls = 'result-box';
    if (r.realizedGain < 0) cls += ' positive';
    else if (r.effectiveRate > 0.10) cls += ' warning';

    out.className = cls;
    out.innerHTML = `
      <div class="result-verdict">${
        r.realizedGain > 0
          ? `Vendita con plusvalenza · netto disponibile <strong>${fmt.eur(r.netProceeds)}</strong>`
          : `Vendita con minusvalenza · nessuna tassa, accumuli credito`
      }</div>
      <div style="display:grid;grid-template-columns:1fr auto;gap:8px 16px;">
        <span class="muted">Importo lordo</span><span class="text-right">${fmt.eur(r.saleAmount)}</span>
        <span class="muted">Quote da vendere</span><span class="text-right">${fmt.num(r.unitsToSell, 4)}</span>
        <span class="muted">Costo basis</span><span class="text-right">${fmt.eur(r.costBasisSold)}</span>
        <span class="muted">${r.realizedGain >= 0 ? 'Plusvalenza' : 'Minusvalenza'}</span>
        <span class="text-right ${r.realizedGain >= 0 ? 'positive' : 'negative'}">${fmt.eur(r.realizedGain)}</span>
        <span class="muted">Tassa 26%</span><span class="text-right negative">${fmt.eur(r.taxDue)}</span>
        <span class="bright"><strong>Netto disponibile</strong></span>
        <span class="text-right bright"><strong>${fmt.eur(r.netProceeds)}</strong></span>
        <span class="muted" style="margin-top:8px">Aliquota effettiva</span>
        <span class="text-right" style="margin-top:8px">${fmt.pct(r.effectiveRate, 2)}</span>
      </div>
      <div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border-subtle);font-size:11px;">
        <strong style="color:var(--text-bright)">Costo opportunità del prelievo:</strong><br>
        <span class="muted">5 anni:</span> ${fmt.eur(r.oppCost5y)}<br>
        <span class="muted">10 anni:</span> ${fmt.eur(r.oppCost10y)}<br>
        <span class="muted">20 anni:</span> ${fmt.eur(r.oppCost20y)}
      </div>
      ${r.warnings.length ? `<div style="margin-top:16px;font-size:11px;color:var(--accent-warning)">${r.warnings.map(w => '⚠️ ' + w).join('<br>')}</div>` : ''}
    `;
  };

  // Bind input listeners
  ['#tax-amount', '#tax-cost', '#tax-price'].forEach(id => {
    $(id)?.addEventListener('input', calc);
  });
  $('#tax-etf-select')?.addEventListener('change', onETFSelect);

  // Popola il select al primo render
  populateETFSelect();

  // Esponi funzione di refresh per chiamarla quando cambiano i prezzi
  window._taxSimRefresh = populateETFSelect;

  calc();
}


// -------------------------------------------------------------------------
// REAL ESTATE
// -------------------------------------------------------------------------
function setupRealEstate() {
  const calc = () => {
    const input = {
      purchasePrice: parseFloat($('#re-purchase').value) || 0,
      salePrice: parseFloat($('#re-sale').value) || 0,
      durationMonths: parseFloat($('#re-duration').value) || 6,
      renovation: parseFloat($('#re-renovation').value) || 0,
      isFirstHome: $('#re-firsthome')?.checked || false,
      isNewBuilding: $('#re-newbuilding')?.checked || false,
      holdingCostsMonthly: parseFloat($('#re-holding').value) || 0,
      cadastralValue: parseFloat($('#re-cadastral')?.value) || 0,
    };
    const out = $('#re-result');
    if (!out) return;

    if (input.purchasePrice <= 0 || input.salePrice <= 0) {
      out.className = 'result-box';
      out.innerHTML = '<div class="muted">Inserisci prezzo acquisto e vendita per calcolare l\'IRR.</div>';
      const stressBox = $('#re-stress');
      if (stressBox) stressBox.innerHTML = '';
      return;
    }

    const r = computeFlip(input);
    out.className = `result-box ${r.verdictClass}`;

    const cvNote = r.cadastralValueEstimated
      ? ` <span class="muted">(stimato 60% del prezzo)</span>`
      : '';

    out.innerHTML = `
      <div class="result-verdict">${r.verdict}</div>
      <div style="display:grid;grid-template-columns:1fr auto;gap:8px 16px;font-size:13px;">
        <span class="muted">Valore catastale</span><span class="text-right">${fmt.eur(r.cadastralValue)}${cvNote}</span>
        <span class="muted">Capitale impiegato</span><span class="text-right">${fmt.eur(r.capitalEmployed)}</span>
        <span class="muted">Profitto netto</span>
        <span class="text-right ${r.netProfit >= 0 ? 'positive' : 'negative'}"><strong>${fmt.eur(r.netProfit)}</strong></span>
        <span class="muted">RoC</span>
        <span class="text-right ${r.roc >= 0 ? 'positive' : 'negative'}">${fmt.pct(r.roc)}</span>
        <span class="muted bright"><strong>IRR annualizzato</strong></span>
        <span class="text-right ${r.irrAnnualized >= 0.12 ? 'positive' : r.irrAnnualized >= 0 ? 'warning' : 'negative'}">
          <strong>${fmt.pct(r.irrAnnualized, 1)}</strong>
        </span>
        <span class="muted">VWCE atteso stesso periodo</span><span class="text-right">${fmt.eur(r.vwceExpected)}</span>
        <span class="muted">Vantaggio vs VWCE</span>
        <span class="text-right ${r.advantageVsVWCE >= 0 ? 'positive' : 'negative'}">${fmt.eur(r.advantageVsVWCE)}</span>
        <span class="muted">Break-even prezzo vendita</span><span class="text-right">${fmt.eur(r.breakEven)}</span>
      </div>
      <div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border-subtle);">
        <details>
          <summary style="cursor:pointer;font-size:11px;color:var(--accent-info);text-transform:uppercase;letter-spacing:0.08em;font-weight:600">Breakdown dei costi</summary>
          <div style="margin-top:8px;display:grid;grid-template-columns:1fr auto;gap:6px 16px;font-size:11px;">
            <span class="muted">Imposta registro / IVA</span><span class="text-right">${fmt.eur(r.breakdown.registro + r.breakdown.iva)}</span>
            <span class="muted">Imposte ipotec/catastali</span><span class="text-right">${fmt.eur(r.breakdown.ipotec)}</span>
            <span class="muted">Notaio acquisto</span><span class="text-right">${fmt.eur(r.breakdown.notaioAcq)}</span>
            <span class="muted">Agenzia acquisto (+IVA)</span><span class="text-right">${fmt.eur(r.breakdown.agenziaAcq)}</span>
            <span class="muted">Ristrutturazione</span><span class="text-right">${fmt.eur(r.breakdown.renovation)}</span>
            <span class="muted">Holding costs (${input.durationMonths}m)</span><span class="text-right">${fmt.eur(r.breakdown.holdingTot)}</span>
            <span class="muted">Agenzia vendita (+IVA)</span><span class="text-right">${fmt.eur(r.breakdown.agenziaVend)}</span>
            <span class="muted">Plusvalenza tassata</span><span class="text-right">${fmt.eur(r.breakdown.plusTax)}</span>
          </div>
        </details>
      </div>
    `;

    const stressRows = stressTest(input);
    const stressBox = $('#re-stress');
    if (stressBox) {
      stressBox.innerHTML = `
        <div class="card-meta" style="margin-bottom:12px">Stress Test</div>
        <table class="mc-table" style="font-size:11px">
          <thead><tr><th>Scenario</th><th>IRR</th><th>Profitto</th></tr></thead>
          <tbody>
            ${stressRows.map(s => `<tr>
              <td>${s.name}</td>
              <td class="${s.irrAnnualized >= 0.12 ? 'positive' : s.irrAnnualized >= 0 ? '' : 'negative'}">${fmt.pct(s.irrAnnualized, 1)}</td>
              <td class="${s.netProfit >= 0 ? '' : 'negative'}">${fmt.eur(s.netProfit)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      `;
    }
  };

  $$('#re-form input, #re-form select').forEach(el => {
    el.addEventListener('input', calc);
    el.addEventListener('change', calc);
  });
  calc();
}

// -------------------------------------------------------------------------
// SETTINGS MODAL — solo manual prices, no più Twelve Data
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

  // A11y: chiusura con Esc
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
      clearMCCache();
      location.reload();
    }
  });
}

// -------------------------------------------------------------------------
// BOOST RECORDING
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

  // Aggiorna dropdown tax simulator quando cambiano i prezzi
  if (window._taxSimRefresh) window._taxSimRefresh();

  // Aggiorna header status di nuovo (potrebbe essere cambiato dopo i fetch)
  renderHeaderStatus();

  // 6. Trend chart
  state.trendData = generateTrendPaths({
    horizonMonths: 60,
    currentValue: state.portfolio.totalValue,
    monthlyPAC: config.pac.baseMonthlyAmount,
  });
  renderTrendChart('#trend-chart', state.trendData);

  // 7. Monte Carlo (async)
  $('#mc-status').classList.remove('hidden');
  $('#mc-table-wrap').classList.add('hidden');
  $('#mc-progress').textContent = 'Inizializzazione Web Worker...';

  try {
    const mc = await runMonteCarlo({
      onProgress: (current, total, label) => {
        $('#mc-progress').textContent = `Strategia ${current + 1}/${total}: ${label}`;
      },
      forceRefresh: forceReload,
      currentValue: state.portfolio.totalValue,
    });
    state.mcResults = mc;
    renderMCResults(mc);
  } catch (err) {
    $('#mc-status').innerHTML = `<div style="color:var(--accent-negative);padding:24px;text-align:center;">Errore Monte Carlo: ${err.message}</div>`;
  }
}

// -------------------------------------------------------------------------
// INIT
// -------------------------------------------------------------------------
export async function initApp() {
  setupSettings();
  setupTaxSim();
  setupRealEstate();
  setupBoostButton();

  $('#btn-refresh')?.addEventListener('click', () => refresh(true));

  $('#footer-date').textContent = new Date().getFullYear();

  await refresh();
}
