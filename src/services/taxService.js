// India VDA Tax Rules:
// - 30% flat tax on profit per lot
// - No loss offset between lots
// - No indexation
// - FIFO = default, HIFO = AI optimized (highest cost basis first)

// ─── Current Holdings Report (FIFO) ───────────────────────────────────────────
export const calculateTaxReport = (transactions, currentBtcPrice) => {
  if (!transactions || transactions.length === 0) {
    return { totalInvested: 0, currentValue: 0, totalProfit: 0, taxDue: 0, lots: [], harvestingSuggestion: null };
  }

  const lots = transactions.map((tx) => {
    const currentLotValue = tx.btcAmount * currentBtcPrice;
    const profit = currentLotValue - tx.costBasis;
    const taxOnLot = profit > 0 ? profit * 0.30 : 0;
    return {
      _id: tx._id,
      date: tx.date,
      amountINR: tx.amountINR,
      btcAmount: tx.btcAmount,
      buyPrice: tx.pricePerBtc,
      costBasis: tx.costBasis,
      currentValue: currentLotValue,
      profit,
      taxOnLot,
      isLoss: profit < 0
    };
  });

  const totalInvested = lots.reduce((s, l) => s + l.costBasis, 0);
  const currentValue  = lots.reduce((s, l) => s + l.currentValue, 0);
  const totalProfit   = currentValue - totalInvested;
  const taxDue        = lots.reduce((s, l) => s + l.taxOnLot, 0);

  const lossLots = lots.filter((l) => l.isLoss);
  const potentialSavings = lossLots.reduce((s, l) => s + Math.abs(l.profit) * 0.30, 0);

  return {
    fy: '2025-26',
    totalInvested: Math.round(totalInvested),
    currentValue:  Math.round(currentValue),
    totalProfit:   Math.round(totalProfit),
    taxDue:        Math.round(taxDue),
    effectiveTaxRate: totalProfit > 0 ? ((taxDue / totalProfit) * 100).toFixed(1) : 0,
    lots,
    harvestingSuggestion: lossLots.length > 0
      ? {
          message: `You have ${lossLots.length} lot(s) with unrealized losses. Harvesting them can save ₹${Math.round(potentialSavings).toLocaleString('en-IN')} in taxes.`,
          potentialSavings: Math.round(potentialSavings),
          lossLots: lossLots.length
        }
      : null
  };
};

// ─── HIFO Sell Simulation ──────────────────────────────────────────────────────
// User wants to sell X BTC → AI picks highest cost basis lots first
// → minimizes profit → minimizes tax
export const simulateSell = (transactions, btcToSell, currentBtcPrice) => {
  if (!transactions || transactions.length === 0 || btcToSell <= 0) return null;

  const totalBtc = transactions.reduce((s, t) => s + t.btcAmount, 0);
  if (btcToSell > totalBtc) return { error: `You only have ₿${totalBtc.toFixed(6)} BTC` };

  // ── FIFO: sell oldest lots first ──────────────────────────────────────────
  const fifoLots  = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));
  const fifoResult = pickLots(fifoLots, btcToSell, currentBtcPrice);

  // ── HIFO: sell highest cost basis lots first (AI optimized) ───────────────
  const hifoLots  = [...transactions].sort((a, b) => b.pricePerBtc - a.pricePerBtc);
  const hifoResult = pickLots(hifoLots, btcToSell, currentBtcPrice);

  const taxSaved = fifoResult.taxDue - hifoResult.taxDue;

  return {
    btcToSell,
    currentBtcPrice,
    fifo: fifoResult,
    hifo: hifoResult,
    taxSaved:    Math.round(taxSaved),
    recommendation: hifoResult.selectedLots,
    reasoning: `By selling highest cost basis lots first (HIFO), your taxable profit reduces from ₹${fifoResult.totalProfit.toLocaleString('en-IN')} to ₹${hifoResult.totalProfit.toLocaleString('en-IN')}, saving ₹${Math.round(taxSaved).toLocaleString('en-IN')} in taxes.`
  };
};

// Helper: pick lots greedily until btcToSell is fulfilled
const pickLots = (sortedLots, btcToSell, currentBtcPrice) => {
  let remaining = btcToSell;
  let totalProfit = 0;
  let totalProceeds = 0;
  const selectedLots = [];

  for (const lot of sortedLots) {
    if (remaining <= 0) break;
    const btcFromLot = Math.min(lot.btcAmount, remaining);
    const costPerBtc = lot.pricePerBtc;
    const proceeds   = btcFromLot * currentBtcPrice;
    const cost       = btcFromLot * costPerBtc;
    const profit     = proceeds - cost;

    selectedLots.push({
      date:       lot.date,
      buyPrice:   lot.pricePerBtc,
      btcSold:    btcFromLot,
      costBasis:  Math.round(cost),
      proceeds:   Math.round(proceeds),
      profit:     Math.round(profit),
      tax:        profit > 0 ? Math.round(profit * 0.30) : 0
    });

    totalProfit   += profit;
    totalProceeds += proceeds;
    remaining     -= btcFromLot;
  }

  const taxDue = selectedLots.reduce((s, l) => s + l.tax, 0);

  return {
    selectedLots,
    totalProceeds: Math.round(totalProceeds),
    totalProfit:   Math.round(totalProfit),
    taxDue:        Math.round(taxDue)
  };
};
