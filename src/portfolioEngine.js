// =============================================================================
// PORTFOLIO ENGINE v2 — FIX LEGACY PRICE LOOKUP
// =============================================================================
// FIX vs v1:
//   - Anche le posizioni LEGACY (CSPX, SWDA, VETA non in allocation target)
//     ricevono i prezzi correnti dal Sheet via mapping ISIN→ticker.
//   - Importa getTickerForISIN da priceProvider per coerenza.
// =============================================================================

import { config } from './config.js';
import { getTickerForISIN } from './priceProvider.js';

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
    weight: allocItem.weight || 0,
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
 * Stato completo del portafoglio.
 * Include TUTTE le posizioni in initialHoldings, anche quelle legacy.
 *
 * BUG FIX v2: per i legacy, ora cerchiamo i prezzi nel `prices` dict
 * usando il ticker ricavato da ISIN (es. IE00B5BMR087 → CSPX.MI).
 */
export function computePortfolio(prices) {
  const allocByISIN = new Map();
  config.allocation.forEach(a => allocByISIN.set(a.isin, a));

  const holdings = (config.initialHoldings || []).map((holding) => {
    const alloc = allocByISIN.get(holding.isin);
    const isLegacy = !alloc;

    let allocItem;
    if (alloc) {
      allocItem = alloc;
    } else {
      // Legacy: costruiamo metadata e mappiamo ISIN al ticker .MI
      let derivedName = `Legacy ${holding.isin.slice(-6)}`;
      if (holding._note) {
        const colonIdx = holding._note.indexOf(':');
        if (colonIdx > 0) derivedName = holding._note.slice(0, colonIdx).trim();
      }
      const legacyTicker = getTickerForISIN(holding.isin) || holding.isin;
      allocItem = {
        id: 'legacy-' + holding.isin.slice(-4).toLowerCase(),
        name: derivedName,
        ticker: legacyTicker,
        isin: holding.isin,
        weight: 0,
        role: 'legacy',
        ter: 0,
      };
    }

    // FIX v2: cerchiamo il prezzo SEMPRE in `prices`, sia per allocation che per legacy
    // Il ticker corretto è in allocItem.ticker (mappato per i legacy)
    const priceData = prices[allocItem.ticker] || null;
    const price = priceData?.price ?? holding?.currentPriceFallback ?? 0;

    const computed = computeHolding(allocItem, holding, price);
    computed.isLegacy = isLegacy;
    computed.note = holding._note || '';
    computed.priceSource = priceData?.source || 'fallback';
    return computed;
  });

  const totalValue = holdings.reduce((s, h) => s + h.currentValue, 0);
  const totalInvested = holdings.reduce((s, h) => s + h.investedAmount, 0);
  const totalPnL = totalValue - totalInvested;
  const totalPnLPct = totalInvested > 0 ? (totalPnL / totalInvested) : 0;

  const effectiveAllocation = holdings.map(h => ({
    ...h,
    effectiveWeight: totalValue > 0 ? h.currentValue / totalValue : 0,
    deviationFromTarget: (totalValue > 0 ? h.currentValue / totalValue : 0) - h.weight,
  }));

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

export function computeDrawdown(historicalValues, currentValue) {
  if (!Array.isArray(historicalValues) || historicalValues.length === 0) {
    return { ddCurrent: null, ddMax: null, peak: null };
  }
  const allValues = [...historicalValues, currentValue];
  const peak = Math.max(...allValues);
  const ddCurrent = peak > 0 ? (currentValue / peak) - 1 : 0;
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
 * Metriche di prezzo: drawdown, MA, volatilità, z-score.
 */
export function computePriceMetrics(historicalPrices, currentPrice) {
  if (!Array.isArray(historicalPrices) || historicalPrices.length < 2) return null;
  const closes = historicalPrices.map(d => d.close);

  // Drawdown da massimo rolling 252 giorni. Esposto come `dd252D`
  // (non `ddATH`): la finestra di history disponibile dal provider corrente
  // è ~1 anno, quindi un vero ATH non è calcolabile. Quando il Task Group B
  // introdurrà storico esteso, si potrà reintrodurre un `ddATH` autentico
  // sulla serie completa.
  const last252 = closes.slice(-252);
  const high252D = Math.max(...last252, currentPrice);
  const dd252D = high252D > 0 ? (currentPrice / high252D) - 1 : 0;

  // Alias: in questa fase `dd12M` coincide con `dd252D` (stessa finestra).
  const high12M = high252D;
  const dd12M = dd252D;

  const last200 = closes.slice(-200);
  const ma200 = last200.length >= 50
    ? last200.reduce((a, b) => a + b, 0) / last200.length
    : null;
  const madMA200 = ma200 ? (currentPrice / ma200) - 1 : null;

  const last60 = closes.slice(-60);
  let volRolling = null;
  if (last60.length >= 30) {
    const returns = [];
    for (let i = 1; i < last60.length; i++) {
      returns.push(Math.log(last60[i] / last60[i-1]));
    }
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / returns.length;
    volRolling = Math.sqrt(variance) * Math.sqrt(252);
  }

  let zScore = null;
  if (closes.length >= 80) {
    const last21Return = (currentPrice / closes[closes.length - 22]) - 1;
    const rollingReturns = [];
    for (let i = 21; i < closes.length; i++) {
      rollingReturns.push((closes[i] / closes[i - 21]) - 1);
    }
    const m = rollingReturns.reduce((a, b) => a + b, 0) / rollingReturns.length;
    const s = Math.sqrt(rollingReturns.reduce((a, r) => a + (r - m) ** 2, 0) / rollingReturns.length);
    zScore = s > 0 ? (last21Return - m) / s : null;
  }

  let regime = 'normal';
  if (volRolling && volRolling > 0.25) regime = 'stressed';
  else if (volRolling && volRolling > 0.18) regime = 'elevated';

  return { high252D, high12M, dd252D, dd12M, ma200, ma10m: ma200, madMA200, volRolling, zScore, regime };
}

/**
 * Prossimi eventi automatici (bonifico + acquisto)
 */
export function getNextScheduledEvents(today = new Date()) {
  const events = [];
  const yyyy = today.getFullYear();
  const mm = today.getMonth();
  const dd = today.getDate();

  const transferDay = config.pac.transferDayOfMonth;
  const transferDate = new Date(yyyy, mm, transferDay);
  if (dd > transferDay) transferDate.setMonth(mm + 1);
  events.push({
    type: 'transfer',
    date: transferDate,
    description: `Bonifico €${config.pac.baseMonthlyAmount} verso ${config.pac.broker}`,
  });

  const investDay = config.pac.investmentDayOfMonth;
  const investDate = new Date(yyyy, mm, investDay);
  if (dd > investDay) investDate.setMonth(mm + 1);
  events.push({
    type: 'investment',
    date: investDate,
    description: `Esecuzione PAC ${config.allocation.map(a => a.name.split(' ').slice(0, 3).join(' ')).join(' + ')}`,
  });

  return events.sort((a, b) => a.date - b.date);
}
