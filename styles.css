// =============================================================================
// STRATEGY ENGINE — Drawdown-Responsive Contribution
// =============================================================================
// Genera la "Strategy of the Month": PAC base + extra raccomandato.
// Input: metriche di prezzo (drawdown, MA, vol, z-score)
// Output: tier raccomandato + importo + razionale + warning
// =============================================================================

import { config } from './config.js';

/**
 * Calcola il tier di drawdown
 */
function determineTier(drawdown) {
  for (const tier of config.strategyTiers) {
    if (drawdown <= tier.ddMax && drawdown > tier.ddMin) {
      return tier;
    }
  }
  // Tier 0 default
  return config.strategyTiers[0];
}

/**
 * Composite trigger score (combina DD12M e MA200 deviation)
 */
function compositeScore(metrics) {
  const w = config.triggerComposite;
  const dd = metrics.dd12M ?? 0;
  const mad = metrics.madMA200 ?? 0;
  return w.weightDD12M * dd + w.weightMA200 * mad;
}

/**
 * Determina se boost è già esaurito (cap annuale)
 * Usa localStorage per tracking storico
 */
function getBoostHistoryThisYear() {
  const year = new Date().getFullYear();
  const key = `pd_boost_${year}`;
  try {
    const stored = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

export function recordBoostUsedThisMonth(amount, tier) {
  const year = new Date().getFullYear();
  const month = new Date().getMonth();
  const key = `pd_boost_${year}`;
  const history = getBoostHistoryThisYear();
  // Evita doppio inserimento per lo stesso mese
  const existing = history.findIndex(h => h.month === month);
  const entry = { month, amount, tier, date: Date.now() };
  if (existing >= 0) history[existing] = entry;
  else history.push(entry);
  localStorage.setItem(key, JSON.stringify(history));
}

export function getBoostStats() {
  const history = getBoostHistoryThisYear();
  const monthsUsed = history.length;
  const totalExtra = history.reduce((s, h) => s + (h.amount || 0), 0);
  const remaining = Math.max(0, config.pac.capBoostMonthsPerYear - monthsUsed);
  return { monthsUsed, totalExtra, remaining };
}

/**
 * Genera la raccomandazione del mese
 *
 * @param {Object} metrics - output di computePriceMetrics
 * @param {Object} portfolio - output di computePortfolio
 * @returns {Object} la "Strategy of the Month"
 */
export function getStrategyOfTheMonth(metrics, portfolio) {
  const baseAmount = config.pac.baseMonthlyAmount;

  // Caso: niente metriche disponibili
  if (!metrics || metrics.dd12M === null || metrics.dd12M === undefined) {
    return {
      tier: 0,
      tierLabel: 'No Data',
      multiplier: 1.0,
      baseAmount,
      extraAmount: 0,
      totalAmount: baseAmount,
      drawdown: null,
      composite: null,
      rationale: 'Dati di prezzo storico non disponibili. Inserisci la API key Twelve Data o aggiorna i prezzi manualmente per attivare l\'engine.',
      urgency: 'info',
      warnings: [],
      capReached: false,
      remainingBoosts: config.pac.capBoostMonthsPerYear,
    };
  }

  const composite = compositeScore(metrics);
  const triggerValue = Math.min(metrics.dd12M, composite); // più conservativo dei due
  const tier = determineTier(triggerValue);

  // Cap annuale
  const stats = getBoostStats();
  const capReached = stats.monthsUsed >= config.pac.capBoostMonthsPerYear && tier.tier > 0;

  let multiplier = capReached ? 1.0 : tier.multiplier;
  const totalAmount = Math.round(baseAmount * multiplier);
  const extraAmount = totalAmount - baseAmount;

  // Razionale
  const ddPct = (metrics.dd12M * 100).toFixed(1);
  const madPct = metrics.madMA200 ? (metrics.madMA200 * 100).toFixed(1) : 'N/D';

  let rationale, urgency;
  if (tier.tier === 0) {
    rationale = `Mercato vicino al trend atteso. Drawdown 12M: ${ddPct}%, MA200 deviation: ${madPct}%. Mantieni PAC base €${baseAmount}.`;
    urgency = 'normal';
  } else if (capReached) {
    rationale = `Drawdown ${ddPct}% rilevato (${tier.label}), MA cap annuale raggiunto: ${stats.monthsUsed}/${config.pac.capBoostMonthsPerYear} mesi di boost già usati. Nessun extra autorizzato. Riprendi dal nuovo anno solare.`;
    urgency = 'warning';
  } else {
    rationale = `${tier.description} rilevato: drawdown 12M ${ddPct}%, MA200 dev ${madPct}%. Multiplier ${tier.multiplier}x consigliato. Extra +€${extraAmount}. Totale del mese: €${totalAmount}.`;
    urgency = tier.tier >= 3 ? 'critical' : tier.tier >= 2 ? 'alert' : 'warning';
  }

  // Warnings
  const warnings = [];
  if (metrics.regime === 'stressed') {
    warnings.push('⚠️ Regime di volatilità elevata. Verifica che il boost sia compatibile con la tua tolleranza al rischio.');
  }
  if (metrics.zScore !== null && metrics.zScore < -2) {
    warnings.push('⚠️ Z-score < -2: rendimento mensile estremo. Possibile event-driven, non solo volatilità di mercato.');
  }
  if (extraAmount > 0) {
    warnings.push('💡 Verifica che l\'extra non comprometta spese ordinarie e fondo emergenza.');
  }
  if (tier.tier >= 3 && !capReached) {
    warnings.push('🎯 Drawdown severo: opportunità statisticamente rara (storica frequenza ~10% degli anni). Mantieni disciplina.');
  }
  if (capReached) {
    warnings.push('📊 Cap annuale raggiunto. Anche se il mercato continua a scendere, NON aumentare il PAC oltre la base. Disciplina > FOMO.');
  }

  // Allocazione: in fase di drawdown su Nasdaq, NON sovrappesare ulteriormente
  const allocationNote = generateAllocationNote(metrics, tier);

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
    regime: metrics.regime,
    volRolling: metrics.volRolling,
    rationale,
    urgency,
    warnings,
    capReached,
    monthsUsed: stats.monthsUsed,
    remainingBoosts: stats.remaining,
    allocationNote,
    confidence: getConfidence(metrics, tier),
    actionItems: getActionItems(tier, capReached, totalAmount),
  };
}

/**
 * Nota sull'allocazione: se il drawdown è guidato da tech, NON sovrappesare Nasdaq
 */
function generateAllocationNote(metrics, tier) {
  if (tier.tier === 0) {
    return `Allocazione raccomandata: ${(config.allocation[0].weight * 100).toFixed(0)}% ${config.allocation[0].name}, ${(config.allocation[1].weight * 100).toFixed(0)}% ${config.allocation[1].name} (target standard).`;
  }

  // In drawdown, l'extra va prima al global ETF (che è meno volatile e include comunque tech)
  if (tier.tier >= 2) {
    return `Allocazione del boost: 100% al global ETF (${config.allocation[0].name}). NON sovrappesare il satellite Nasdaq durante il drawdown — la sua volatilità è già più alta del global, e potrebbe creare concentrazione tech eccessiva proprio quando rischio è massimo.`;
  }

  return `Allocazione del boost: 90/10 come target. Il drawdown è ancora moderato.`;
}

/**
 * Confidence del segnale (basata su quanti indicatori convergono)
 */
function getConfidence(metrics, tier) {
  if (tier.tier === 0) return 'high';
  let agreement = 0;
  let checks = 0;
  if (metrics.dd12M !== null) {
    checks++;
    if (metrics.dd12M <= -0.05) agreement++;
  }
  if (metrics.madMA200 !== null) {
    checks++;
    if (metrics.madMA200 <= -0.03) agreement++;
  }
  if (metrics.zScore !== null) {
    checks++;
    if (metrics.zScore <= -1) agreement++;
  }
  if (checks === 0) return 'low';
  const ratio = agreement / checks;
  if (ratio >= 0.66) return 'high';
  if (ratio >= 0.33) return 'medium';
  return 'low';
}

/**
 * Action items concreti per il mese
 */
function getActionItems(tier, capReached, totalAmount) {
  const items = [];
  const investDay = config.pac.investmentDayOfMonth;
  const transferDay = config.pac.transferDayOfMonth;

  if (tier.tier === 0) {
    items.push(`Il ${transferDay}: bonifico standard €${config.pac.baseMonthlyAmount}.`);
    items.push(`Il ${investDay}: PAC esegue automaticamente. Niente da fare.`);
  } else if (capReached) {
    items.push(`Il ${transferDay}: bonifico standard €${config.pac.baseMonthlyAmount} (NO boost).`);
    items.push(`Il ${investDay}: PAC esegue automaticamente.`);
    items.push(`💡 Se hai bonus/liquidità extra disponibile e il drawdown è severo: valuta acquisto manuale UNA TANTUM (non sistematico).`);
  } else {
    items.push(`Entro il ${transferDay}: bonifico €${totalAmount} verso il broker (€${config.pac.baseMonthlyAmount} base + €${totalAmount - config.pac.baseMonthlyAmount} extra).`);
    items.push(`Il ${investDay}: PAC base €${config.pac.baseMonthlyAmount} esegue automaticamente.`);
    items.push(`Il ${investDay} o subito dopo: acquisto manuale €${totalAmount - config.pac.baseMonthlyAmount} extra sul global ETF.`);
    items.push(`Aggiorna il contatore "boost usati" cliccando sul pulsante in dashboard.`);
  }
  return items;
}
