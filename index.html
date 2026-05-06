<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5">
<meta name="theme-color" content="#0A1A20">
<meta name="description" content="Dashboard PAC ETF — strategia drawdown-responsive, Monte Carlo 50k, IRR immobiliare. Browser-only, zero cloud.">
<title>PAC Terminal · Strategia ETF</title>
<link rel="stylesheet" href="styles/styles.css">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%230A1A20'/%3E%3Ccircle cx='16' cy='16' r='5' fill='%232DD4BF'/%3E%3C/svg%3E">

<!-- Chart.js da CDN (zero installation) -->
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
</head>

<body>
<div class="app">

<!-- =================================================================== -->
<!-- HEADER                                                                -->
<!-- =================================================================== -->
<header class="app-header">
  <div class="container header-inner">
    <div class="brand">
      <span class="brand-mark">PAC <em>Terminal</em></span>
      <span class="brand-tagline">·  Personal Investment Intelligence</span>
    </div>
    <div class="header-status">
      <div class="status-item" id="api-status">
        <span class="status-dot"></span>
        <span class="status-text">Inizializzazione…</span>
      </div>
      <div class="status-item" id="date-status">—</div>
      <button class="btn" id="btn-refresh" title="Aggiorna prezzi e ricalcola">↻ Refresh</button>
      <button class="btn" id="btn-settings" title="Configura API key e prezzi manuali">⚙︎ Settings</button>
    </div>
  </div>
</header>

<!-- =================================================================== -->
<!-- MAIN                                                                  -->
<!-- =================================================================== -->
<main class="app-main">
<div class="container">

<!-- ─────────────────────────────────────────────────────────────────── -->
<!-- SECTION 1 — STRATEGY OF THE MONTH (HERO)                              -->
<!-- ─────────────────────────────────────────────────────────────────── -->
<section class="section">
  <div class="section-header">
    <div>
      <span class="section-num">01 · Strategy</span>
      <h2 class="section-title">Cosa fare <em>questo mese</em></h2>
    </div>
    <span class="section-meta">aggiornato in tempo reale</span>
  </div>

  <div class="hero-card tier-0" id="hero-card">
    <div class="hero-grid">

      <!-- LEFT: Headline + razionale + amounts -->
      <div>
        <div class="hero-eyebrow">
          <span class="tier-badge tier-0" id="hero-eyebrow-tier">NORMAL</span>
          <span id="hero-eyebrow-date">—</span>
        </div>

        <div class="hero-headline">
          <h1 id="hero-headline">Caricamento strategia in corso…</h1>
        </div>

        <p class="hero-rationale" id="hero-rationale">
          In attesa di dati di prezzo storici. Inserisci una API key Twelve Data nelle Settings per attivare l'engine.
        </p>

        <div class="hero-amounts">
          <div class="amount-block">
            <span class="amount-label">PAC base</span>
            <span class="amount-value" id="amount-base">€500</span>
            <span class="amount-sub">automatico</span>
          </div>
          <div class="amount-block">
            <span class="amount-label">Extra consigliato</span>
            <span class="amount-value" id="amount-extra">€0</span>
            <span class="amount-sub">tactical boost</span>
          </div>
          <div class="amount-block">
            <span class="amount-label">Totale del mese</span>
            <span class="amount-value" id="amount-total">€500</span>
            <span class="amount-sub" id="allocation-note">90% Global · 10% Nasdaq</span>
          </div>
        </div>

        <ul class="action-list" id="action-list"></ul>
        <div class="warnings-list" id="warnings-list"></div>

        <button class="btn btn-primary" id="btn-record-boost" style="margin-top:24px;">
          ✓ Registra boost del mese
        </button>
      </div>

      <!-- RIGHT: Stats grid -->
      <div class="hero-stats">
        <div class="stat-block">
          <div class="stat-label">Drawdown 12M <span class="muted">global</span></div>
          <div class="stat-value" id="stat-dd12m">—</div>
          <div class="stat-trend">trigger primario</div>
        </div>
        <div class="stat-block">
          <div class="stat-label">Drawdown ATH</div>
          <div class="stat-value" id="stat-ddath">—</div>
          <div class="stat-trend">all-time peak</div>
        </div>
        <div class="stat-block">
          <div class="stat-label">vs MA 200d</div>
          <div class="stat-value" id="stat-mad">—</div>
          <div class="stat-trend">trend deviation</div>
        </div>
        <div class="stat-block">
          <div class="stat-label">Z-score 21d</div>
          <div class="stat-value" id="stat-zscore">—</div>
          <div class="stat-trend">return distribution</div>
        </div>
        <div class="stat-block">
          <div class="stat-label">Regime</div>
          <div class="stat-value" id="stat-regime">—</div>
          <div class="stat-trend">vol classification</div>
        </div>
        <div class="stat-block">
          <div class="stat-label">Volatilità rolling</div>
          <div class="stat-value" id="stat-vol">—</div>
          <div class="stat-trend">60d annualizzata</div>
        </div>
        <div class="stat-block">
          <div class="stat-label">Confidence</div>
          <div class="stat-value" id="stat-confidence">—</div>
          <div class="stat-trend">indicator agreement</div>
        </div>
        <div class="stat-block">
          <div class="stat-label">Boost YTD</div>
          <div class="stat-value" id="stat-boosts">0/6</div>
          <div class="stat-trend">cap annuale</div>
        </div>
      </div>

    </div>
  </div>
</section>

<!-- ─────────────────────────────────────────────────────────────────── -->
<!-- SECTION 2 — PORTFOLIO TRACKER                                         -->
<!-- ─────────────────────────────────────────────────────────────────── -->
<section class="section">
  <div class="section-header">
    <div>
      <span class="section-num">02 · Tracker</span>
      <h2 class="section-title">Portafoglio <em>live</em></h2>
    </div>
    <span class="section-meta">drawdown integrato</span>
  </div>

  <div class="tracker-grid">

    <!-- Main: holdings + total -->
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Posizioni attuali</h3>
        <span class="card-meta">Trade Republic</span>
      </div>

      <div class="stat-hero">
        <div class="stat-hero-value" id="tot-value">—</div>
        <div class="stat-hero-meta">
          <span>versato: <strong class="bright" id="tot-invested">—</strong></span>
          <span>P/L: <span class="delta" id="tot-pnl">—</span></span>
          <span class="delta" id="tot-pnlpct">—</span>
        </div>
        <div class="stat-hero-meta" style="margin-top:8px;">
          <span>tasse latenti: <span id="tot-latent-tax">—</span></span>
          <span>netto: <strong class="bright" id="tot-net">—</strong></span>
        </div>
      </div>

      <table class="holdings-table">
        <thead>
          <tr>
            <th>ETF</th>
            <th class="num">Quote</th>
            <th class="num">PMC</th>
            <th class="num">Prezzo</th>
            <th class="num">Valore</th>
            <th class="num">P/L %</th>
            <th class="num">Peso</th>
          </tr>
        </thead>
        <tbody id="holdings-tbody"></tbody>
      </table>
    </div>

    <!-- Side: drawdown integrato + calendario -->
    <div class="side-panel">

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Risk metrics</h3>
          <span class="card-meta">global ETF</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">DD da ATH</span>
          <span class="metric-value" id="metric-dd-ath">—</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">DD 12 mesi</span>
          <span class="metric-value" id="metric-dd-12m">—</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">vs MA200</span>
          <span class="metric-value" id="metric-mad">—</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Vol 60d</span>
          <span class="metric-value" id="metric-vol">—</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Z-score 21d</span>
          <span class="metric-value" id="metric-z">—</span>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Prossimi eventi</h3>
          <span class="card-meta">automatici</span>
        </div>
        <div id="calendar-events"></div>
      </div>

    </div>
  </div>
</section>

<!-- ─────────────────────────────────────────────────────────────────── -->
<!-- SECTION 3 — TREND CHART                                               -->
<!-- ─────────────────────────────────────────────────────────────────── -->
<section class="section">
  <div class="section-header">
    <div>
      <span class="section-num">03 · Projection</span>
      <h2 class="section-title">Trend <em>atteso</em> 5 anni</h2>
    </div>
    <span class="section-meta">log-normal · n=5.000</span>
  </div>

  <div class="card">
    <div class="card-header">
      <h3 class="card-title">Bande probabilistiche P5–P95</h3>
      <span class="card-meta">PAC continuo €500/mese</span>
    </div>

    <div class="chart-wrap">
      <canvas id="trend-chart"></canvas>
    </div>

    <div class="chart-legend">
      <div class="legend-item">
        <span class="legend-swatch" style="background:#2DD4BF"></span>
        Mediana attesa (P50)
      </div>
      <div class="legend-item">
        <span class="legend-swatch" style="background:rgba(45,212,191,0.15)"></span>
        Banda P25–P75 (50% probabile)
      </div>
      <div class="legend-item">
        <span class="legend-swatch" style="background:rgba(45,212,191,0.5);border:1px dashed #2DD4BF"></span>
        P95 (best 5%)
      </div>
      <div class="legend-item">
        <span class="legend-swatch" style="background:rgba(248,113,113,0.5);border:1px dashed #F87171"></span>
        P5 (worst 5%)
      </div>
      <div class="legend-item">
        <span class="legend-swatch" style="background:#FBBF24"></span>
        Versato cumulato
      </div>
    </div>
  </div>
</section>

<!-- ─────────────────────────────────────────────────────────────────── -->
<!-- SECTION 4 — MONTE CARLO                                               -->
<!-- ─────────────────────────────────────────────────────────────────── -->
<section class="section">
  <div class="section-header">
    <div>
      <span class="section-num">04 · Monte Carlo</span>
      <h2 class="section-title">50.000 simulazioni a <em>20 anni</em></h2>
    </div>
    <span class="section-meta" id="mc-meta">computing…</span>
  </div>

  <div class="card">
    <div id="mc-status" class="mc-status">
      <div class="mc-spinner"></div>
      <div id="mc-progress">In attesa di avvio…</div>
      <div class="muted" style="font-size:11px;">Web Worker: ~3-8 secondi a strategia</div>
    </div>

    <div id="mc-table-wrap" class="hidden">
      <div style="overflow-x:auto;">
        <table class="mc-table">
          <thead>
            <tr>
              <th>Strategia</th>
              <th>Versato</th>
              <th>P5</th>
              <th>Mediana</th>
              <th>P95</th>
              <th>Netto P50</th>
              <th>P(≥250k)</th>
              <th>P(≥400k)</th>
              <th>DD mediano</th>
            </tr>
          </thead>
          <tbody id="mc-tbody"></tbody>
        </table>
      </div>

      <div class="chart-wrap" style="margin-top:32px; height:320px;">
        <canvas id="mc-chart"></canvas>
      </div>
    </div>
  </div>
</section>

<!-- ─────────────────────────────────────────────────────────────────── -->
<!-- SECTION 5 — TOOLS (Tax + Real Estate)                                 -->
<!-- ─────────────────────────────────────────────────────────────────── -->
<section class="section">
  <div class="section-header">
    <div>
      <span class="section-num">05 · Tools</span>
      <h2 class="section-title">Decision <em>support</em></h2>
    </div>
    <span class="section-meta">tax · real estate IRR</span>
  </div>

  <div class="tools-grid">

    <!-- TAX SIMULATOR -->
    <div class="tool-card">
      <div class="card-header">
        <h3 class="card-title">Simula vendita ETF</h3>
        <span class="card-meta">regime amministrato · 26%</span>
      </div>

      <div class="field">
        <label>Importo da vendere (€)</label>
        <input type="number" id="tax-amount" step="100" placeholder="es. 25000">
      </div>
      <div class="field-row">
        <div class="field">
          <label>PMC (€/quota)</label>
          <input type="number" id="tax-cost" step="0.01" placeholder="es. 110.50">
        </div>
        <div class="field">
          <label>Prezzo oggi (€/quota)</label>
          <input type="number" id="tax-price" step="0.01" placeholder="es. 124.50">
        </div>
      </div>

      <div id="tax-result" class="result-box">
        <div class="muted">Inserisci un importo per simulare la vendita.</div>
      </div>
    </div>

    <!-- REAL ESTATE -->
    <div class="tool-card">
      <div class="card-header">
        <h3 class="card-title">IRR Operazione immobiliare</h3>
        <span class="card-meta">costi Italia · plus 26%</span>
      </div>

      <form id="re-form">
        <div class="field-row">
          <div class="field">
            <label>Prezzo acquisto (€)</label>
            <input type="number" id="re-purchase" step="1000" value="100000">
          </div>
          <div class="field">
            <label>Prezzo vendita (€)</label>
            <input type="number" id="re-sale" step="1000" value="150000">
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Durata (mesi)</label>
            <input type="number" id="re-duration" min="1" max="60" value="6">
          </div>
          <div class="field">
            <label>Ristrutturazione (€)</label>
            <input type="number" id="re-renovation" step="500" value="0">
          </div>
        </div>
        <div class="field">
          <label>Holding cost mensile (€/mese)</label>
          <input type="number" id="re-holding" step="50" value="200">
          <div class="field-help">IMU, utenze base, condominio, assicurazione</div>
        </div>
        <div class="field-row">
          <div class="field">
            <label style="display:flex;align-items:center;gap:8px;">
              <input type="checkbox" id="re-firsthome" style="width:auto"> Prima casa (registro 2%)
            </label>
          </div>
          <div class="field">
            <label style="display:flex;align-items:center;gap:8px;">
              <input type="checkbox" id="re-newbuilding" style="width:auto"> Da costruttore (IVA 10%)
            </label>
          </div>
        </div>
      </form>

      <div id="re-result" class="result-box">
        <div class="muted">Compila il form per calcolare l'IRR.</div>
      </div>

      <div id="re-stress" style="margin-top:16px;"></div>
    </div>

  </div>
</section>

</div>
</main>

<!-- =================================================================== -->
<!-- FOOTER                                                                -->
<!-- =================================================================== -->
<footer class="app-footer">
  <div class="container footer-inner">
    <div>© <span id="footer-date">2026</span> · PAC Terminal · Personal use only</div>
    <div>Browser-only · No cloud · No tracking</div>
    <div>Not financial advice</div>
  </div>
</footer>

</div> <!-- /app -->

<!-- =================================================================== -->
<!-- SETTINGS MODAL                                                        -->
<!-- =================================================================== -->
<div class="modal-backdrop" id="settings-modal">
  <div class="modal">
    <div class="modal-header">
      <h2 class="modal-title">Settings</h2>
      <button class="modal-close" id="settings-close">×</button>
    </div>

    <div class="field">
      <label>Twelve Data API key (free tier)</label>
      <input type="text" id="api-key-input" placeholder="il tuo API key…">
      <div class="field-help">
        Registrati gratis su <a href="https://twelvedata.com/pricing" target="_blank" rel="noopener">twelvedata.com</a>.
        Free tier: 800 richieste/giorno · 8/min. Sufficiente per uso personale.
      </div>
    </div>

    <div class="spacer-2"></div>

    <h3 style="font-family:var(--font-display);font-size:16px;color:var(--text-bright);margin-bottom:8px;">
      Override prezzi manuali
    </h3>
    <p style="font-size:11px;color:var(--text-muted);margin-bottom:16px;">
      Se l'API non risponde o un ticker non è supportato, inserisci il prezzo manualmente.
      Cancella il valore per tornare alla fonte automatica.
    </p>
    <div id="manual-prices"></div>

    <div class="spacer-2"></div>

    <div style="display:flex;gap:12px;justify-content:flex-end;border-top:1px solid var(--border-subtle);padding-top:24px;margin-top:16px;">
      <button class="btn" id="settings-clear">Cancella tutta la cache</button>
      <button class="btn btn-primary" id="settings-save">Salva</button>
    </div>
  </div>
</div>

<!-- ENTRY POINT (ES module) -->
<script type="module" src="src/main.js"></script>

</body>
</html>
