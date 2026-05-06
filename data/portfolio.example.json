{
  "_doc": "Esempio di stato iniziale del portafoglio. Copia questi valori dentro src/config.js → initialHoldings.",
  "_doc_units": "Quote: numero quote ETF possedute (anche frazionarie)",
  "_doc_avgCost": "PMC (€/quota): prezzo medio di carico ricavabile dal CSV transazioni TR",
  "_doc_fallbackPrice": "Prezzo da usare SE l'API Twelve Data non risponde (manual fallback)",
  "_lastUpdate": "2026-05-05",

  "holdings": [
    {
      "name": "Vanguard FTSE All-World UCITS ETF Acc",
      "isin": "IE00BK5BQT80",
      "ticker": "VWCE.MI",
      "units": 0,
      "averageCost": 0,
      "currentPriceFallback": 124.50,
      "note": "Core - 90% del PAC mensile va qui"
    },
    {
      "name": "iShares Nasdaq 100 UCITS ETF Acc",
      "isin": "IE00B53SZB19",
      "ticker": "CSNDX.MI",
      "units": 0.527961,
      "averageCost": 1259.57,
      "currentPriceFallback": 1356.59,
      "note": "Satellite tech - 10% del PAC mensile va qui"
    }
  ],

  "_legacy_positions_to_consolidate": {
    "_note": "Posizioni esistenti dei PAC precedenti su altri ETF. Si possono lasciare ferme - si diluiranno naturalmente in 5-7 anni di PAC sul nuovo target. Vendere significherebbe pagare 26% sulla plus.",
    "items": [
      {"isin": "IE00B5BMR087", "name": "iShares Core S&P 500", "units": 1.322009, "avgCost": 631.61},
      {"isin": "IE00B4L5Y983", "name": "iShares Core MSCI World", "units": 9.645653, "avgCost": 113.00},
      {"isin": "IE00BH04GL39", "name": "Lyxor Euro Gov Bond", "units": 12.894304, "avgCost": 24.04}
    ]
  },

  "liquidity": {
    "emergencyFund": 6000,
    "operationalCash": 2000,
    "realEstateReserve": 0
  }
}
