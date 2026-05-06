// =============================================================================
// REAL ESTATE ENGINE — IRR / ROI immobiliare
// =============================================================================
// Calcoli specifici per operazioni immobiliari Italia, con tutti i costi reali.
// =============================================================================

import { config } from './config.js';

const ITALY_COSTS = {
  registroPrimaCasa: 0.02,        // 2% registro prima casa (su valore catastale)
  registroSecondaCasa: 0.09,      // 9% registro seconda casa
  imposteIpotec: 0.001,           // 100€ + 100€ fisse, ~0.1%
  ivaCostruttoreNuova: 0.10,      // 10% IVA su nuova costruzione (non lusso)
  agenziaCompra: 0.03,            // 3% commissione agenzia + IVA 22%
  agenziaVende: 0.03,             // 3% commissione agenzia + IVA 22%
  notaioCompra: 0.015,            // ~1,5% del prezzo (parcella + tasse atto)
  notaioVende: 0,                 // tipicamente a carico del compratore
  plusvalenza: 0.26,              // 26% se vendita entro 5 anni (sostitutiva)
};

/**
 * Calcola il flip immobiliare con tutti i costi
 *
 * @param {Object} input
 * @param {number} input.purchasePrice - prezzo acquisto
 * @param {number} input.salePrice - prezzo vendita atteso
 * @param {number} input.durationMonths - durata operazione (mesi)
 * @param {number} input.renovation - costi ristrutturazione
 * @param {boolean} input.isNewBuilding - immobile da costruttore (IVA)
 * @param {boolean} input.isFirstHome - prima casa
 * @param {number} input.holdingCostsMonthly - spese mensili durante hold (utenze, IMU, etc.)
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
  } = input;

  // ----- COSTI ACQUISTO -----
  let registro, iva;
  if (isNewBuilding) {
    iva = purchasePrice * ITALY_COSTS.ivaCostruttoreNuova;
    registro = 200; // fissa
  } else {
    iva = 0;
    registro = isFirstHome
      ? purchasePrice * ITALY_COSTS.registroPrimaCasa
      : purchasePrice * ITALY_COSTS.registroSecondaCasa;
  }
  const ipotec = isNewBuilding ? 400 : 100;
  const notaioAcq = Math.max(2500, purchasePrice * ITALY_COSTS.notaioCompra);
  const agenziaAcq = purchasePrice * ITALY_COSTS.agenziaCompra * 1.22;

  // ----- HOLDING COSTS -----
  const holdingTot = holdingCostsMonthly * durationMonths;

  // ----- CAPITALE TOTALE IMPIEGATO -----
  const capitalEmployed =
    purchasePrice + iva + registro + ipotec + notaioAcq + agenziaAcq +
    renovation + holdingTot;

  // ----- COSTI VENDITA -----
  const agenziaVend = salePrice * ITALY_COSTS.agenziaVende * 1.22;

  // ----- PLUSVALENZA TASSATA SE < 5 ANNI -----
  // Il fisco riconosce come "valore di acquisto" il prezzo + costi documentati
  const taxBasis = purchasePrice + iva + registro + notaioAcq + renovation + agenziaAcq;
  const grossPlus = Math.max(0, salePrice - taxBasis);
  const plusTax = grossPlus * ITALY_COSTS.plusvalenza;

  // ----- NETTO -----
  const netProfit = salePrice - agenziaVend - plusTax - capitalEmployed;
  const roc = capitalEmployed > 0 ? netProfit / capitalEmployed : 0;
  const irrAnnualized = capitalEmployed > 0 && netProfit > -capitalEmployed
    ? Math.pow(1 + roc, 12 / durationMonths) - 1
    : -1;

  // Break-even: prezzo vendita per profitto netto = 0
  // salePrice - agenziaVend - plusTax - capitalEmployed = 0
  // Approssimazione (se plus tassata): salePrice * (1 - 0.0366) - 0.26 * (salePrice - taxBasis) = capitalEmployed
  // salePrice * (1 - 0.0366 - 0.26) + 0.26 * taxBasis = capitalEmployed
  // salePrice = (capitalEmployed - 0.26 * taxBasis) / (1 - 0.0366 - 0.26)
  const breakEven = (capitalEmployed - 0.26 * taxBasis) / (1 - 0.0366 - 0.26);

  // Cash-on-cash: rendimento netto / cash effettivamente messo
  const cashOnCash = roc;

  // Confronto con VWCE atteso stesso periodo
  const vwceExpected = capitalEmployed * (Math.pow(1.074, durationMonths / 12) - 1);
  const advantageVsVWCE = netProfit - vwceExpected;

  // ----- VERDETTO -----
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
    purchasePrice,
    salePrice,
    durationMonths,
    capitalEmployed,
    breakdown: {
      iva, registro, ipotec, notaioAcq, agenziaAcq, renovation, holdingTot,
      agenziaVend, taxBasis, grossPlus, plusTax,
    },
    netProfit,
    roc,
    irrAnnualized,
    cashOnCash,
    breakEven,
    vwceExpected,
    advantageVsVWCE,
    verdict,
    verdictClass,
  };
}

/**
 * Stress test: variazioni durata e prezzo
 */
export function stressTest(input) {
  const baseline = computeFlip(input);
  const scenarios = [
    { name: 'Baseline', input: input },
    { name: 'Durata x2', input: { ...input, durationMonths: input.durationMonths * 2 } },
    { name: 'Vendita -10%', input: { ...input, salePrice: input.salePrice * 0.9 } },
    { name: 'Vendita -15%', input: { ...input, salePrice: input.salePrice * 0.85 } },
    { name: 'Durata x2 + vendita -10%', input: { ...input, durationMonths: input.durationMonths * 2, salePrice: input.salePrice * 0.9 } },
  ];
  return scenarios.map(s => ({
    name: s.name,
    ...computeFlip(s.input),
  }));
}
