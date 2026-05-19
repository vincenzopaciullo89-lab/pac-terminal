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
 * Re-export di `computePriceMetrics` da `metricsEngine.js` per
 * preservare il vecchio import path. La funzione vive in un modulo
 * self-contained (nessuna dipendenza browser-only) così è importabile
 * anche da Node.js (Task Group F).
 */
export { computePriceMetrics } from './metricsEngine.js';

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
