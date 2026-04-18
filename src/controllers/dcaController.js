import User from '../models/User.js';
import Portfolio from '../models/Portfolio.js';
import Transaction from '../models/Transaction.js';
import { getBtcPriceINR } from '../services/priceService.js';
import { runAIAgent } from '../services/aiAgent.js';
import { encrypt, decrypt } from '../utils/encryption.js';
import { log, ACTIONS } from '../services/auditService.js';
import { sendAiBuyEmail } from '../services/emailService.js';

const FALLBACK_INR = 8500000;

// POST /api/dca/simulate-buy
export const simulateBuy = async (req, res) => {
  try {
    const userId = req.userId;

    const user      = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const portfolio    = await Portfolio.findOne({ userId }).populate('transactions');
    const priceData    = await getBtcPriceINR();
    const currentPrice = priceData?.inr || FALLBACK_INR;

    // Decrypt transactions for AI analysis
    const decryptedTxs = (portfolio?.transactions || []).map(tx => {
      try { return tx.encryptedData ? decrypt(tx.encryptedData) : tx.toObject(); }
      catch { return tx.toObject(); }
    });

    const aiDecision = await runAIAgent(
      { monthlyAmount: user.monthlyAmount, frequency: user.frequency, riskMode: user.riskMode },
      {
        totalBtc: portfolio?.totalBtc,
        averageCost: portfolio?.averageCost,
        totalInvested: portfolio?.totalInvested,
        recentTransactions: decryptedTxs.slice(-5) // last 5 for context
      },
      currentPrice
    );

    if (aiDecision.action !== 'buy') {
      await log(userId, ACTIONS.AI_BUY_DECISION, { action: 'hold', reason: aiDecision.reasoning }, req);
      return res.json({ aiDecision, transaction: null, portfolio });
    }

    const amountINR = aiDecision.amountToInvest;
    const btcAmount = amountINR / currentPrice;

    // Encrypt transaction data before saving
    const txPayload = { userId: userId.toString(), type: 'buy', amountINR, btcAmount, pricePerBtc: currentPrice, date: new Date().toISOString(), costBasis: amountINR };

    const tx = await Transaction.create({
      userId,
      type: 'buy',
      amountINR,
      btcAmount,
      pricePerBtc: currentPrice,
      date: new Date(),
      costBasis: amountINR,
      encryptedData: encrypt(txPayload)  // encrypted copy
    });

    // Update portfolio
    const updatedPortfolio = await Portfolio.findOneAndUpdate(
      { userId },
      { $inc: { totalInvested: amountINR, totalBtc: btcAmount }, $push: { transactions: tx._id } },
      { new: true }
    ).populate('transactions');

    updatedPortfolio.averageCost  = updatedPortfolio.totalInvested / updatedPortfolio.totalBtc;
    updatedPortfolio.currentValue = updatedPortfolio.totalBtc * currentPrice;
    await updatedPortfolio.save();

    // Audit log (encrypted)
    await log(userId, ACTIONS.SIMULATE_BUY, {
      amountINR, btcAmount, pricePerBtc: currentPrice,
      priceSignal: aiDecision.priceSignal,
      reasoning: aiDecision.reasoning
    }, req);

    // Send email notification (non-blocking)
    sendAiBuyEmail(
      { email: user.email, name: user.name, avgCost: portfolio?.averageCost },
      aiDecision, tx, currentPrice
    ).catch(err => console.error('Email failed:', err.message));

    res.json({ aiDecision, transaction: tx, portfolio: updatedPortfolio });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/portfolio
export const getPortfolio = async (req, res) => {
  try {
    const userId       = req.userId;
    const priceData    = await getBtcPriceINR();
    const currentPrice = priceData?.inr || FALLBACK_INR;

    let portfolio = await Portfolio.findOne({ userId }).populate('transactions');

    if (!portfolio) {
      portfolio = await Portfolio.create({
        userId, totalInvested: 0, totalBtc: 0,
        averageCost: 0, currentValue: 0, transactions: []
      });
      portfolio = await Portfolio.findOne({ userId }).populate('transactions');
    }

    portfolio.currentValue = portfolio.totalBtc * currentPrice;
    await portfolio.save();

    res.json({ portfolio, currentPrice });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
