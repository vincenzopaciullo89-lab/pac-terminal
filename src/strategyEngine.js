// =============================================================================
// STRATEGY ENGINE — FINAL
// =============================================================================
// Drawdown-Responsive Contribution: ogni mese determina se aumentare il PAC
// in base al drawdown da rolling 12-month high del global ETF.
//
// GARANZIA: ritorna SEMPRE oggetto completo, anche in branch "no data".
// La UI non crasha mai per campi mancanti.
// =============================================================================

import { config } from './config.js';

export function determineTier(drawdown) {
  for (const tier of config.strategyTiers) {
    if (drawdown <= tier.ddMax && drawdown > tier.ddMin) return tier;
  }
  return config.strategyTiers[0];
}

function compositeScore(metrics) {
  const w = config.triggerComposite;
  const dd = metrics?.dd12M ?? 0;
  const mad = metrics?.madMA200 ?? 0;
  return w.weightDD12M * dd + w.weightMA200 * mad;
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
  if (tier.tier >= 2) {
    return `Allocazione boost: 100% al global ETF (${aShort[0]}). Non sovrappesare il satellite Nasdaq durante drawdown.`;
  }
  return `Allocazione boost: 90/10 come target standard.`;
}

function getConfidence(metrics, tier) {
  if (!metrics || !tier || tier.tier === 0) return 'high';
  let agreement = 0, checks = 0;
  if (metrics.dd12M != null) { checks++; if (metrics.dd12M <= -0.05) agreement++; }
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
    items.push(`Il ${investDay}: PAC base €${baseAmt} esegue automaticamente.`);
    items.push(`Il ${investDay} o subito dopo: acquisto manuale €${extra} extra sul global ETF.`);
    items.push(`Aggiorna il contatore "boost usati" cliccando il pulsante in dashboard.`);
  }
  return items;
}

/**
 * Genera la "Strategy of the Month" — SEMPRE ritorna oggetto completo.
 */
export function getStrategyOfTheMonth(metrics, portfolio) {
  const baseAmount = config.pac.baseMonthlyAmount;
  const stats = getBoostStats();

  // Caso: niente metriche → ritorna oggetto COMPLETO con tier 0
  if (!metrics || metrics.dd12M == null) {
    return {
      tier: 0,
      tierLabel: 'No Data',
      tierDescription: 'Dati storici non disponibili',
      multiplier: 1.0,
      baseAmount,
      extraAmount: 0,
      totalAmount: baseAmount,
      drawdown: null,
      drawdownATH: null,
      composite: null,
      madMA200: null,
      zScore: null,
      regime: 'normal',
      volRolling: null,
      rationale: `Storico prezzi non disponibile (API offline o ticker non supportato). Il PAC base €${baseAmount} è sempre operativo. Per attivare l'engine drawdown, aggiorna i prezzi manualmente da justETF nelle Settings, oppure attendi che l'API torni disponibile.`,
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

  const composite = compositeScore(metrics);
  const triggerValue = Math.min(metrics.dd12M, composite);
  const tier = determineTier(triggerValue);

  const capReached = stats.monthsUsed >= config.pac.capBoostMonthsPerYear && tier.tier > 0;
  const multiplier = capReached ? 1.0 : tier.multiplier;
  const totalAmount = Math.round(baseAmount * multiplier);
  const extraAmount = totalAmount - baseAmount;

  const ddPct = (metrics.dd12M * 100).toFixed(1);
  const madPct = metrics.madMA200 != null ? (metrics.madMA200 * 100).toFixed(1) : 'N/D';

  let rationale, urgency;
  if (tier.tier === 0) {
    rationale = `Mercato vicino al trend atteso. Drawdown 12M: ${ddPct}%, MA200 deviation: ${madPct}%. Mantieni PAC base €${baseAmount}.`;
    urgency = 'normal';
  } else if (capReached) {
    rationale = `Drawdown ${ddPct}% rilevato (${tier.label}), ma cap annuale raggiunto: ${stats.monthsUsed}/${config.pac.capBoostMonthsPerYear} mesi di boost già usati. Nessun extra autorizzato.`;
    urgency = 'warning';
  } else {
    rationale = `${tier.description}: drawdown 12M ${ddPct}%, MA200 dev ${madPct}%. Multiplier ${tier.multiplier}x consigliato. Extra +€${extraAmount}. Totale del mese: €${totalAmount}.`;
    urgency = tier.tier >= 3 ? 'critical' : tier.tier >= 2 ? 'alert' : 'warning';
  }

  const warnings = [];
  if (metrics.regime === 'stressed') warnings.push('⚠️ Volatilità elevata. Verifica che il boost sia compatibile con la tua tolleranza al rischio.');
  if (metrics.zScore != null && metrics.zScore < -2) warnings.push('⚠️ Z-score < -2: rendimento mensile estremo. Possibile event-driven.');
  if (extraAmount > 0) warnings.push('💡 Verifica che l\'extra non comprometta spese ordinarie e fondo emergenza.');
  if (tier.tier >= 3 && !capReached) warnings.push('🎯 Drawdown severo: opportunità storicamente rara (~10% degli anni). Mantieni disciplina.');
  if (capReached) warnings.push('📊 Cap annuale raggiunto. Disciplina > FOMO.');

  return {
    tier: tier.tier,
    tierLabel: tier.label,
    tierDescription: tier.description,
    multiplier,
    baseAmount,
    extraAmount,
    totalAmount,
    drawdown: metrics.dd12M,
    drawdownATH: metrics.ddATH,
    composite,
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
    allocationNote: generateAllocationNote(tier),
    confidence: getConfidence(metrics, tier),
    actionItems: getActionItems(tier, capReached, totalAmount),
  };
}
