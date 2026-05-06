// =============================================================================
// TAX ENGINE — Italia (FINAL)
// =============================================================================
// Fiscalità ETF UCITS armonizzati per residenti fiscali italiani.
// Trade Republic Italia opera in regime amministrato dal gennaio 2025:
// trattenuta automatica del 26% sulla plusvalenza al momento della vendita.
// =============================================================================

import { config } from './config.js';

export function simulateSale(saleAmount, avgCost, currentPrice) {
  if (!saleAmount || !currentPrice || saleAmount <= 0 || currentPrice <= 0) return null;

  const unitsToSell = saleAmount / currentPrice;
  const costBasisSold = unitsToSell * avgCost;
  const realizedGain = saleAmount - costBasisSold;
  const taxableGain = Math.max(0, realizedGain);
  const taxDue = taxableGain * config.tax.capitalGainsRate;
  const netProceeds = saleAmount - taxDue;

  const oppCost5y = saleAmount * (Math.pow(1.074, 5) - 1);
  const oppCost10y = saleAmount * (Math.pow(1.074, 10) - 1);
  const oppCost20y = saleAmount * (Math.pow(1.074, 20) - 1);

  const effectiveRate = saleAmount > 0 ? taxDue / saleAmount : 0;

  const warnings = [];
  if (realizedGain > 0 && costBasisSold > 0 && realizedGain / costBasisSold > 0.5) {
    warnings.push('Plusvalenza > 50% del costo: tassazione significativa. Valuta se la liquidità è davvero necessaria oggi.');
  }
  if (effectiveRate > 0.10) {
    warnings.push('Aliquota effettiva > 10% del lordo: vendita fiscalmente costosa.');
  }
  if (realizedGain < 0) {
    warnings.push('Minusvalenza: nessuna tassa, accumuli minus utilizzabili per future plus su redditi diversi (4 anni).');
  }

  return {
    saleAmount, unitsToSell, costBasisSold, realizedGain, taxableGain,
    taxDue, netProceeds, effectiveRate,
    oppCost5y, oppCost10y, oppCost20y,
    warnings,
  };
}

export function estimateLatentTax(holdings) {
  let totalGain = 0;
  let totalGross = 0;
  for (const h of holdings) {
    if (h.pnlAbs > 0) totalGain += h.pnlAbs;
    totalGross += h.currentValue;
  }
  const tax = totalGain * config.tax.capitalGainsRate;
  return {
    totalGross, totalGain,
    estimatedTax: tax,
    netIfLiquidated: totalGross - tax,
  };
}
