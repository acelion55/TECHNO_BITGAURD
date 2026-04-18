import Transaction from '../models/Transaction.js';
import { getBtcPriceINR } from '../services/priceService.js';
import { calculateTaxReport, simulateSell } from '../services/taxService.js';

const FALLBACK_INR = 8500000;

// GET /api/tax/report/:userId
export const getTaxReport = async (req, res) => {
  try {
    const userId       = req.userId; // from JWT middleware
    const priceData    = await getBtcPriceINR();
    const currentPrice = priceData?.inr || FALLBACK_INR;
    const transactions = await Transaction.find({ userId }).sort({ date: 1 });
    const report       = calculateTaxReport(transactions, currentPrice);
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/tax/simulate-sell
export const simulateSellTax = async (req, res) => {
  try {
    const userId       = req.userId; // from JWT middleware
    const { btcToSell } = req.body;
    if (!btcToSell) return res.status(400).json({ error: 'btcToSell required' });

    const priceData    = await getBtcPriceINR();
    const currentPrice = priceData?.inr || FALLBACK_INR;
    const transactions = await Transaction.find({ userId }).sort({ date: 1 });
    const result       = simulateSell(transactions, parseFloat(btcToSell), currentPrice);

    if (result?.error) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
