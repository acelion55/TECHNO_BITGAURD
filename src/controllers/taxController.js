import Transaction from '../models/Transaction.js';
import { getBtcPriceINR } from '../services/priceService.js';
import { calculateTaxReport, simulateSell } from '../services/taxService.js';

const FALLBACK_INR = 8500000;

// GET /api/tax/report
export const getTaxReport = async (req, res) => {
  try {
    const userId       = req.userId;
    const priceData    = await getBtcPriceINR();
    const currentPrice = priceData?.inr || FALLBACK_INR;
    const transactions = await Transaction.find({ userId }).sort({ date: 1 });
    // Decrypt before tax calculation
    const decrypted    = Transaction.decryptAll(transactions);
    const report       = calculateTaxReport(decrypted, currentPrice);
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/tax/simulate-sell
export const simulateSellTax = async (req, res) => {
  try {
    const userId        = req.userId;
    const { btcToSell } = req.body;
    if (!btcToSell) return res.status(400).json({ error: 'btcToSell required' });

    const priceData    = await getBtcPriceINR();
    const currentPrice = priceData?.inr || FALLBACK_INR;
    const transactions = await Transaction.find({ userId }).sort({ date: 1 });
    // Decrypt before simulation
    const decrypted    = Transaction.decryptAll(transactions);
    const result       = simulateSell(decrypted, parseFloat(btcToSell), currentPrice);

    if (result?.error) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
