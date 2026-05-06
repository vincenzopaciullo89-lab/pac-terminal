// =============================================================================
// PORTFOLIO ENGINE
// =============================================================================
// Calcola lo stato corrente del portafoglio: valore, P/L, allocazioni effettive.
// Lavora con holdings fornite dall'utente + prezzi correnti dal priceProvider.
// =============================================================================

import { config } from './config.js';

/**
 * Calcola le metriche di un singolo holding
 */
export function computeHolding(allocItem, holding, currentPrice) {
  const units = holding?.units || 0;
  const avgCost = holding?.averageCost || 0;
  const price = currentPrice || holding?.currentPriceFallback || 0;

  const currentValue = units * price;
  const investedAmount = units * avgCost;
  const pnlAbs = currentValue - investedAmount;
  const pnlPct = investedAmount > 0 ? (pnlAbs / investedAmount) : 0;

  return {
    isin: allocItem.isin,
    ticker: allocItem.ticker,
    name: allocItem.name,
    weight: allocItem.weight,
    units,
    avgCost,
    currentPrice: price,
    currentValue,
    investedAmount,
    pnlAbs,
    pnlPct,
    role: allocItem.role,
  };
}

/**
 * Stato completo del portafoglio
 */
export function computePortfolio(prices) {
  const holdings = config.allocation.map((alloc) => {
    const holding = config.initialHoldings.find(h => h.isin === alloc.isin);
    const priceData = prices[alloc.ticker];
    const price = priceData?.price ?? holding?.currentPriceFallback ?? 0;
    return computeHolding(alloc, holding, price);
  });

  const totalValue = holdings.reduce((s, h) => s + h.currentValue, 0);
  const totalInvested = holdings.reduce((s, h) => s + h.investedAmount, 0);
  const totalPnL = totalValue - totalInvested;
  const totalPnLPct = totalInvested > 0 ? (totalPnL / totalInvested) : 0;

  // Allocation effettiva vs target
  const effectiveAllocation = holdings.map(h => ({
    ...h,
    effectiveWeight: totalValue > 0 ? h.currentValue / totalValue : 0,
    deviationFromTarget: (totalValue > 0 ? h.currentValue / totalValue : 0) - h.weight,
  }));

  // Stima tasse latenti (in caso di liquidazione totale)
  const latentTax = totalPnL > 0 ? totalPnL * config.tax.capitalGainsRate : 0;

  return {
    holdings: effectiveAllocation,
    totalValue,
    totalInvested,
    totalPnL,
    totalPnLPct,
    latentTax,
    netIfLiquidated: totalValue - latentTax,
    timestamp: Date.now(),
  };
}

/**
 * Drawdown corrente del portafoglio
 * Richiede storico valori. Se non disponibile, restituisce null.
 */
export function computeDrawdown(historicalValues, currentValue) {
  if (!Array.isArray(historicalValues) || historicalValues.length === 0) {
    return { ddCurrent: null, ddMax: null, peak: null };
  }
  const allValues = [...historicalValues, currentValue];
  const peak = Math.max(...allValues);
  const ddCurrent = peak > 0 ? (currentValue / peak) - 1 : 0;
  // Max drawdown storico
  let runningPeak = -Infinity;
  let maxDD = 0;
  for (const v of allValues) {
    if (v > runningPeak) runningPeak = v;
    const dd = runningPeak > 0 ? (v / runningPeak) - 1 : 0;
    if (dd < maxDD) maxDD = dd;
  }
  return { ddCurrent, ddMax: maxDD, peak };
}

/**
 * Calcola metriche di drawdown su una serie di prezzi (per uno specifico ETF)
 */
export function computePriceMetrics(historicalPrices, currentPrice) {
  if (!Array.isArray(historicalPrices) || historicalPrices.length < 2) {
    return null;
  }
  const closes = historicalPrices.map(d => d.close);
  // ATH high
  const ath = Math.max(...closes, currentPrice);
  const ddATH = ath > 0 ? (currentPrice / ath) - 1 : 0;

  // 12-month high (se < 252 giorni, usa quanto disponibile)
  const last252 = closes.slice(-252);
  const high12M = Math.max(...last252, currentPrice);
  const dd12M = high12M > 0 ? (currentPrice / high12M) - 1 : 0;

  // Moving Average 200 giorni
  const last200 = closes.slice(-200);
  const ma200 = last200.length >= 50
    ? last200.reduce((a, b) => a + b, 0) / last200.length
    : null;
  const madMA200 = ma200 ? (currentPrice / ma200) - 1 : null;

  // MA10 (mensile = 10 mesi ≈ 200 giorni; uso 200 giorni come proxy del MA10 mensile)
  // Più rigoroso: estrai 1 valore al mese, ma per semplicità uso MA200 daily
  const ma10m = ma200; // alias per semplicità

  // Volatilità rolling 60 giorni (annualizzata)
  const last60 = closes.slice(-60);
  let volRolling = null;
  if (last60.length >= 30) {
    const returns = [];
    for (let i = 1; i < last60.length; i++) {
      returns.push(Math.log(last60[i] / last60[i-1]));
    }
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / returns.length;
    volRolling = Math.sqrt(variance) * Math.sqrt(252); // annualizzata
  }

  // Z-score sul rendimento dell'ultimo mese (ultimi ~21 giorni)
  let zScore = null;
  if (closes.length >= 80) {
    const last21Return = (currentPrice / closes[closes.length - 22]) - 1;
    // distribuzione storica dei rendimenti rolling 21d
    const rollingReturns = [];
    for (let i = 21; i < closes.length; i++) {
      rollingReturns.push((closes[i] / closes[i - 21]) - 1);
    }
    const m = rollingReturns.reduce((a, b) => a + b, 0) / rollingReturns.length;
    const s = Math.sqrt(rollingReturns.reduce((a, r) => a + (r - m) ** 2, 0) / rollingReturns.length);
    zScore = s > 0 ? (last21Return - m) / s : null;
  }

  // Regime risk
  let regime = 'normal';
  if (volRolling && volRolling > 0.25) regime = 'stressed';
  else if (volRolling && volRolling > 0.18) regime = 'elevated';

  return {
    ath,
    high12M,
    ddATH,
    dd12M,
    ma200,
    ma10m,
    madMA200,
    volRolling,
    zScore,
    regime,
  };
}

/**
 * Calcola il prossimo "evento" automatico basato sulla data
 */
export function getNextScheduledEvents(today = new Date()) {
  const events = [];
  const yyyy = today.getFullYear();
  const mm = today.getMonth();
  const dd = today.getDate();

  // Bonifico
  const transferDay = config.pac.transferDayOfMonth;
  const transferDate = new Date(yyyy, mm, transferDay);
  if (dd > transferDay) transferDate.setMonth(mm + 1);
  events.push({
    type: 'transfer',
    date: transferDate,
    description: `Bonifico €${config.pac.baseMonthlyAmount} verso ${config.pac.broker}`,
  });

  // Acquisto
  const investDay = config.pac.investmentDayOfMonth;
  const investDate = new Date(yyyy, mm, investDay);
  if (dd > investDay) investDate.setMonth(mm + 1);
  events.push({
    type: 'investment',
    date: investDate,
    description: `Esecuzione PAC ${config.allocation.map(a => a.name).join(' + ')}`,
  });

  return events.sort((a, b) => a.date - b.date);
}
