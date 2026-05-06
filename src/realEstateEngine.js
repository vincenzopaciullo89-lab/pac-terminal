// =============================================================================
// REAL ESTATE ENGINE — FINAL
// =============================================================================
// Calcoli specifici per operazioni immobiliari Italia, con costi reali.
//
// FIX vs versione precedente:
//   - Imposta registro calcolata sul VALORE CATASTALE (non sul prezzo pieno)
//     per acquisto da privato. Riduce drasticamente la stima delle imposte.
//     Per prima casa: VC = rendita × 115,5
//     Per seconda casa: VC = rendita × 126
//   - Se l'utente non fornisce il valore catastale, lo stima al 60% del prezzo
//     (assunzione conservativa basata su mercato italiano medio).
// =============================================================================

import { config } from './config.js';

const ITALY_COSTS = {
  registroPrimaCasa: 0.02,      // 2% su valore catastale
  registroSecondaCasa: 0.09,    // 9% su valore catastale
  ipotecCatPrimaCasa: 100,      // 50 + 50 fissi
  ipotecCatSecondaCasa: 100,    // 50 + 50 fissi (sempre fissi se acquisto da privato)
  ivaCostruttoreNuovaPrima: 0.04,    // IVA 4% su prezzo se prima casa da costruttore
  ivaCostruttoreNuovaSeconda: 0.10,  // IVA 10% su prezzo seconda casa da costruttore
  registroFissoCostruttore: 200,
  ipotecCatCostruttore: 400,    // 200 + 200 fissi
  agenziaCompra: 0.03,          // 3% + IVA 22%
  agenziaVende: 0.03,           // 3% + IVA 22%
  notaioCompra: 0.015,          // ~1,5% del prezzo (parcella + tasse atto)
  plusvalenza: 0.26,            // 26% se vendita entro 5 anni (sostitutiva)
};

/**
 * Stima del valore catastale se non fornito esplicitamente.
 * Heuristica: in Italia il valore catastale è tipicamente 50-70% del prezzo
 * di mercato per immobili residenziali. Usiamo 60% come stima conservativa.
 */
function estimateCadastralValue(purchasePrice) {
  return purchasePrice * 0.60;
}

/**
 * Calcola il flip immobiliare con tutti i costi.
 *
 * @param {Object} input
 * @param {number} input.purchasePrice - prezzo acquisto
 * @param {number} input.salePrice - prezzo vendita atteso
 * @param {number} input.durationMonths - durata operazione (mesi)
 * @param {number} input.renovation - costi ristrutturazione
 * @param {boolean} input.isNewBuilding - immobile da costruttore (IVA)
 * @param {boolean} input.isFirstHome - prima casa
 * @param {number} input.holdingCostsMonthly - spese mensili durante hold
 * @param {number} [input.cadastralValue] - valore catastale (se omesso, stimato 60%)
 */
export function computeFlip(input) {
  const {
    purchasePrice = 0,
    salePrice = 0,
    durationMonths = 6,
    renovation = 0,
    isNewBuilding = false,
    isFirstHome = false,
    holdingCostsMonthly = 0,
    cadastralValue: cvInput,
  } = input;

  // Valore catastale: input utente o stima al 60% del prezzo
  const cadastralValue = cvInput && cvInput > 0 ? cvInput : estimateCadastralValue(purchasePrice);

  // ----- COSTI ACQUISTO -----
  let registro, iva, ipotec;
  if (isNewBuilding) {
    iva = purchasePrice * (isFirstHome ? ITALY_COSTS.ivaCostruttoreNuovaPrima : ITALY_COSTS.ivaCostruttoreNuovaSeconda);
    registro = ITALY_COSTS.registroFissoCostruttore;
    ipotec = ITALY_COSTS.ipotecCatCostruttore;
  } else {
    iva = 0;
    // FIX CRITICO: registro calcolato sul VALORE CATASTALE (non sul prezzo pieno)
    registro = isFirstHome
      ? cadastralValue * ITALY_COSTS.registroPrimaCasa
      : cadastralValue * ITALY_COSTS.registroSecondaCasa;
    ipotec = isFirstHome ? ITALY_COSTS.ipotecCatPrimaCasa : ITALY_COSTS.ipotecCatSecondaCasa;
  }
  const notaioAcq = Math.max(2500, purchasePrice * ITALY_COSTS.notaioCompra);
  const agenziaAcq = purchasePrice * ITALY_COSTS.agenziaCompra * 1.22;

  const holdingTot = holdingCostsMonthly * durationMonths;

  const capitalEmployed =
    purchasePrice + iva + registro + ipotec + notaioAcq + agenziaAcq +
    renovation + holdingTot;

  // ----- COSTI VENDITA -----
  const agenziaVend = salePrice * ITALY_COSTS.agenziaVende * 1.22;

  // ----- PLUSVALENZA TASSATA SE < 5 ANNI -----
  const taxBasis = purchasePrice + iva + registro + notaioAcq + renovation + agenziaAcq;
  const grossPlus = Math.max(0, salePrice - taxBasis);
  const plusTax = grossPlus * ITALY_COSTS.plusvalenza;

  const netProfit = salePrice - agenziaVend - plusTax - capitalEmployed;
  const roc = capitalEmployed > 0 ? netProfit / capitalEmployed : 0;
  const irrAnnualized = capitalEmployed > 0 && netProfit > -capitalEmployed
    ? Math.pow(1 + roc, 12 / durationMonths) - 1
    : -1;

  // Break-even
  const breakEven = (capitalEmployed - 0.26 * taxBasis) / (1 - 0.0366 - 0.26);

  const cashOnCash = roc;

  const vwceExpected = capitalEmployed * (Math.pow(1.074, durationMonths / 12) - 1);
  const advantageVsVWCE = netProfit - vwceExpected;

  let verdict, verdictClass;
  if (irrAnnualized >= 0.30) {
    verdict = 'OPERAZIONE ECCELLENTE — verifica realismo del prezzo di vendita';
    verdictClass = 'critical-positive';
  } else if (irrAnnualized >= 0.12) {
    verdict = 'OPERAZIONE INTERESSANTE — sopra soglia 12% (premio rischio operativo). Procedi con due diligence.';
    verdictClass = 'positive';
  } else if (irrAnnualized >= 0.074) {
    verdict = 'MARGINALE — batte VWCE ma sotto soglia 12%. Valuta attentamente il rischio operativo.';
    verdictClass = 'warning';
  } else if (irrAnnualized >= 0) {
    verdict = 'NON CONVENIENTE — rendimento sotto VWCE. ETF è alternativa migliore.';
    verdictClass = 'negative';
  } else {
    verdict = 'OPERAZIONE IN PERDITA — non procedere';
    verdictClass = 'critical-negative';
  }

  return {
    purchasePrice, salePrice, durationMonths,
    cadastralValue,
    cadastralValueEstimated: !cvInput || cvInput <= 0,
    capitalEmployed,
    breakdown: {
      iva, registro, ipotec, notaioAcq, agenziaAcq, renovation, holdingTot,
      agenziaVend, taxBasis, grossPlus, plusTax,
    },
    netProfit, roc, irrAnnualized, cashOnCash, breakEven,
    vwceExpected, advantageVsVWCE,
    verdict, verdictClass,
  };
}

export function stressTest(input) {
  const scenarios = [
    { name: 'Baseline', input: input },
    { name: 'Durata x2', input: { ...input, durationMonths: input.durationMonths * 2 } },
    { name: 'Vendita -10%', input: { ...input, salePrice: input.salePrice * 0.9 } },
    { name: 'Vendita -15%', input: { ...input, salePrice: input.salePrice * 0.85 } },
    { name: 'Durata x2 + vendita -10%', input: { ...input, durationMonths: input.durationMonths * 2, salePrice: input.salePrice * 0.9 } },
  ];
  return scenarios.map(s => ({ name: s.name, ...computeFlip(s.input) }));
}
