// =============================================================================
// STRATEGY ENGINE — regola minima 2-soglie (Task D)
// =============================================================================
// Drawdown-Responsive Contribution: ogni mese determina se aumentare il PAC
// in base al drawdown da peak storico (ddATH walk-forward).
//
// Regola operativa (config.strategyTiers, vedi docs/TASK_D_BACKTEST.md):
//   ddATH <= -20%  → €1.000/mese (+€500 boost, 100% VWCE)
//   ddATH <= -10%  → €750/mese  (+€250 boost, 100% VWCE)
//   altrimenti     → €500/mese  (PAC base, allocazione standard 90/10)
//   + cap L16: max 6 mesi di boost per anno solare.
//
// ONESTÀ: questo sistema è progettato per disciplinare il comportamento, NON
// per battere il mercato. Sul backtest 2009-2026 (SWDA, proxy MSCI World EUR)
// ha aggiunto ~€1.150 di timing alpha in 16 anni = 0,36% del totale fisso.
// Il valore reale del PAC è la costanza dei versamenti, non il timing dei
// boost. Vedi `docs/TASK_D_BACKTEST.md`.
//
// GARANZIA: ritorna SEMPRE oggetto completo, anche in branch "no data".
// La UI non crasha mai per campi mancanti.
// =============================================================================

import { config } from './config.js';

// -----------------------------------------------------------------------------
// Selezione del tier su ddATH.
// Tiers ordinati T0 → T2. Si scorre dal più severo (T2) al meno (T1) e si
// prende il PRIMO il cui `ddATHMax` è ≥ ddATH corrente (ricordando che sono
// negativi: -0.20 ≥ -0.25 → T2 entra a -25%).
// -----------------------------------------------------------------------------
export function determineTier(ddATH) {
  if (ddATH == null || !Number.isFinite(ddATH)) return config.strategyTiers[0];
  for (let i = config.strategyTiers.length - 1; i >= 1; i--) {
    const t = config.strategyTiers[i];
    if (ddATH <= t.ddATHMax) return t;
  }
  return config.strategyTiers[0];
}

function getBoostHistoryThisYear() {
  const year = new Date().getFullYear();
  const key = `pd_boost_${year}`;
  try {
    const stored = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(stored) ? stored : [];
  } catch { return []; }
}

export function recordBoostUsedThisMonth(amount, tier) {
  const year = new Date().getFullYear();
  const month = new Date().getMonth();
  const key = `pd_boost_${year}`;
  const history = getBoostHistoryThisYear();
  const existing = history.findIndex(h => h.month === month);
  const entry = { month, amount, tier, date: Date.now() };
  if (existing >= 0) history[existing] = entry;
  else history.push(entry);
  try { localStorage.setItem(key, JSON.stringify(history)); } catch {}
}

export function getBoostStats() {
  const history = getBoostHistoryThisYear();
  const monthsUsed = history.length;
  const totalExtra = history.reduce((s, h) => s + (h.amount || 0), 0);
  const remaining = Math.max(0, config.pac.capBoostMonthsPerYear - monthsUsed);
  return { monthsUsed, totalExtra, remaining };
}

function generateAllocationNote(tier) {
  const a = config.allocation;
  const aShort = a.map(x => x.name.split(' ').slice(0, 2).join(' '));
  if (!tier || tier.tier === 0) {
    return `Allocazione standard: ${(a[0].weight*100).toFixed(0)}% ${aShort[0]}, ${(a[1].weight*100).toFixed(0)}% ${aShort[1]}.`;
  }
  // T1 + T2 → 100% sul global ETF (VWCE). Razionale: durante un drawdown di
  // mercato ampio si compra esposizione world diversificata, non si aumenta
  // il tilt Nasdaq (più volatile). Il 10% CSNDX resta solo sul base €500.
  return `Allocazione boost: 100% sul global ETF (${aShort[0]}). Il 10% CSNDX resta solo sul PAC base €${config.pac.baseMonthlyAmount}.`;
}

function getConfidence(metrics, tier) {
  if (!metrics || !tier || tier.tier === 0) return 'high';
  // Cross-check del trigger primario (ddATH) con gli indicatori secondari
  // (dd252D, madMA200, zScore). Pesi tutti uguali: indicativo, non vincolante.
  let agreement = 0, checks = 0;
  if (metrics.dd252D != null) { checks++; if (metrics.dd252D <= -0.05) agreement++; }
  if (metrics.madMA200 != null) { checks++; if (metrics.madMA200 <= -0.03) agreement++; }
  if (metrics.zScore != null) { checks++; if (metrics.zScore <= -1) agreement++; }
  if (checks === 0) return 'low';
  const ratio = agreement / checks;
  if (ratio >= 0.66) return 'high';
  if (ratio >= 0.33) return 'medium';
  return 'low';
}

function getActionItems(tier, capReached, totalAmount) {
  const items = [];
  const investDay = config.pac.investmentDayOfMonth;
  const transferDay = config.pac.transferDayOfMonth;
  const baseAmt = config.pac.baseMonthlyAmount;

  if (!tier || tier.tier === 0) {
    items.push(`Il ${transferDay}: bonifico standard €${baseAmt}.`);
    items.push(`Il ${investDay}: PAC esegue automaticamente. Niente da fare.`);
  } else if (capReached) {
    items.push(`Il ${transferDay}: bonifico standard €${baseAmt} (NO boost).`);
    items.push(`Il ${investDay}: PAC esegue automaticamente.`);
    items.push(`Cap annuale raggiunto: niente boost anche se mercato in drawdown.`);
  } else {
    const extra = totalAmount - baseAmt;
    items.push(`Entro il ${transferDay}: bonifico €${totalAmount} verso il broker (€${baseAmt} base + €${extra} extra).`);
    items.push(`Il ${investDay}: PAC base €${baseAmt} esegue automaticamente (allocazione standard 90/10).`);
    items.push(`Il ${investDay} o subito dopo: acquisto manuale €${extra} extra sul global ETF (100% VWCE).`);
    items.push(`Aggiorna il contatore "boost usati" cliccando il pulsante in dashboard.`);
  }
  return items;
}

/**
 * Genera la "Strategy of the Month" — SEMPRE ritorna oggetto completo.
 *
 * Trigger primario: metrics.ddATH (Task D). Se mancante, il sistema resta
 * in T0 e la UI mostra "engine disattivato".
 */
export function getStrategyOfTheMonth(metrics, portfolio) {
  const baseAmount = config.pac.baseMonthlyAmount;
  const stats = getBoostStats();

  // Branch "no data": niente metriche o niente ddATH → tier 0
  if (!metrics || metrics.ddATH == null || !Number.isFinite(metrics.ddATH)) {
    return {
      tier: 0,
      tierLabel: 'No Data',
      tierDescription: 'Dati storici non disponibili',
      multiplier: 1.0,
      baseAmount,
      extraAmount: 0,
      totalAmount: baseAmount,
      ddATH: null,
      drawdown252D: null,
      madMA200: null,
      zScore: null,
      regime: 'normal',
      volRolling: null,
      rationale: `Storico prezzi non disponibile (history.json mancante o ddATH non calcolabile). Il PAC base €${baseAmount} è sempre operativo. Per attivare l'engine, aggiorna i prezzi manualmente da justETF nelle Settings, oppure attendi che la pipeline /data/history.json torni disponibile.`,
      urgency: 'info',
      warnings: ['ℹ️ Engine drawdown disattivato fino a quando i prezzi storici non sono disponibili.'],
      capReached: false,
      monthsUsed: stats.monthsUsed,
      remainingBoosts: stats.remaining,
      allocationNote: generateAllocationNote(null),
      confidence: 'low',
      actionItems: getActionItems(null, false, baseAmount),
    };
  }

  const tier = determineTier(metrics.ddATH);
  const capReached = stats.monthsUsed >= config.pac.capBoostMonthsPerYear && tier.tier > 0;
  // Cap annuale raggiunto → forza T0 (€500, no boost).
  const effectiveTier = capReached ? config.strategyTiers[0] : tier;
  const totalAmount = effectiveTier.totalAmount;
  const extraAmount = totalAmount - baseAmount;
  // Multiplier derivato (per UI back-compat): totalAmount / baseAmount.
  const multiplier = totalAmount / baseAmount;

  const ddPct = (metrics.ddATH * 100).toFixed(1);

  let rationale, urgency;
  if (effectiveTier.tier === 0) {
    if (capReached) {
      rationale = `${tier.description} (ddATH ${ddPct}%), ma cap annuale raggiunto: ${stats.monthsUsed}/${config.pac.capBoostMonthsPerYear} mesi di boost già usati. Nessun extra autorizzato.`;
      urgency = 'warning';
    } else {
      rationale = `Mercato vicino al peak storico. ddATH ${ddPct}%. Mantieni PAC base €${baseAmount}.`;
      urgency = 'normal';
    }
  } else {
    rationale = `${effectiveTier.description}: ddATH ${ddPct}%. ${effectiveTier.label}: extra +€${extraAmount} sul global ETF. Totale del mese: €${totalAmount}.`;
    urgency = effectiveTier.tier === 2 ? 'critical' : 'warning';
  }

  const warnings = [];
  if (metrics.regime === 'stressed') warnings.push('⚠️ Volatilità elevata. Verifica che il boost sia compatibile con la tua tolleranza al rischio.');
  if (metrics.zScore != null && metrics.zScore < -2) warnings.push('⚠️ Z-score < -2: rendimento mensile estremo. Possibile event-driven.');
  if (extraAmount > 0) warnings.push('💡 Verifica che l\'extra non comprometta spese ordinarie e fondo emergenza.');
  if (effectiveTier.tier === 2 && !capReached) warnings.push('🎯 Drawdown profondo: opportunità storicamente rara. Mantieni disciplina.');
  if (capReached) warnings.push('📊 Cap annuale raggiunto. Disciplina > FOMO.');
  // NB il "caveat onesto" del sistema (Task D) è renderizzato staticamente
  // nella card della UI (#tactical-caveat in index.html), non come warning
  // dinamico — è sempre visibile, indipendentemente dal tier.

  return {
    tier: effectiveTier.tier,
    tierLabel: effectiveTier.label,
    tierDescription: effectiveTier.description,
    multiplier,
    baseAmount,
    extraAmount,
    totalAmount,
    ddATH: metrics.ddATH,
    drawdown252D: metrics.dd252D,
    madMA200: metrics.madMA200,
    zScore: metrics.zScore,
    regime: metrics.regime || 'normal',
    volRolling: metrics.volRolling,
    rationale,
    urgency,
    warnings,
    capReached,
    monthsUsed: stats.monthsUsed,
    remainingBoosts: stats.remaining,
    allocationNote: generateAllocationNote(effectiveTier),
    confidence: getConfidence(metrics, effectiveTier),
    actionItems: getActionItems(effectiveTier, capReached, totalAmount),
  };
}
