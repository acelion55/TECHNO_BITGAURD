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
    
    console.log(`Tax Report Debug - User: ${userId}`);
    console.log(`Transactions found: ${transactions.length}`);
    console.log(`Current BTC price: ₹${currentPrice.toLocaleString('en-IN')}`);
    
    if (transactions.length > 0) {
      console.log('Sample raw transaction:', {
        amountINR: transactions[0].amountINR,
        btcAmount: transactions[0].btcAmount,
        hasEnc: !!transactions[0].enc
      });
    }
    
    // Decrypt before tax calculation
    const decrypted = Transaction.decryptAll(transactions);
    
    if (decrypted.length > 0) {
      console.log('Sample decrypted transaction:', {
        amountINR: decrypted[0].amountINR,
        btcAmount: decrypted[0].btcAmount,
        pricePerBtc: decrypted[0].pricePerBtc,
        costBasis: decrypted[0].costBasis
      });
    }
    
    const report = calculateTaxReport(decrypted, currentPrice);
    console.log('Tax report summary:', {
      totalInvested: report.totalInvested,
      currentValue: report.currentValue,
      totalProfit: report.totalProfit,
      lotsCount: report.lots?.length
    });
    
    res.json(report);
  } catch (err) {
    console.error('Tax report error:', err);
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
