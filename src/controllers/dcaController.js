import User from '../models/User.js';
import Portfolio from '../models/Portfolio.js';
import Transaction from '../models/Transaction.js';
import { getBtcPriceINR } from '../services/priceService.js';
import { runAIAgent } from '../services/aiAgent.js';
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

    // Decrypt recent transactions for AI context
    const decryptedTxs = Transaction.decryptAll(portfolio?.transactions || []);

    const aiDecision = await runAIAgent(
      { monthlyAmount: user.monthlyAmount, frequency: user.frequency, riskMode: user.riskMode },
      {
        totalBtc:           portfolio?.totalBtc,
        averageCost:        portfolio?.averageCost,
        totalInvested:      portfolio?.totalInvested,
        recentTransactions: decryptedTxs.slice(-5)
      },
      currentPrice
    );

    if (aiDecision.action !== 'buy') {
      await log(userId, ACTIONS.AI_BUY_DECISION, { action: 'hold', reason: aiDecision.reasoning }, req);
      return res.json({ aiDecision, transaction: null, portfolio });
    }

    const amountINR = aiDecision.amountToInvest;
    const btcAmount = amountINR / currentPrice;

    // Save transaction — pre-save hook auto-encrypts all sensitive fields
    const tx = await Transaction.create({
      userId,
      type:       'buy',
      amountINR,          // plain number → hook encrypts before save
      btcAmount,
      pricePerBtc: currentPrice,
      date:        new Date(),
      costBasis:   amountINR
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

    // Audit log
    await log(userId, ACTIONS.SIMULATE_BUY, {
      amountINR, btcAmount, pricePerBtc: currentPrice,
      priceSignal: aiDecision.priceSignal,
      reasoning:   aiDecision.reasoning
    }, req);

    // Email notification (non-blocking)
    sendAiBuyEmail(
      { email: user.email, name: user.name, avgCost: portfolio?.averageCost },
      aiDecision, { btcAmount, amountINR }, currentPrice
    ).catch(err => console.error('Email failed:', err.message));

    // Return decrypted transaction to frontend
    const decryptedTx = tx.decryptFields();
    res.json({ aiDecision, transaction: decryptedTx, portfolio: updatedPortfolio });
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

    // Decrypt all transactions before sending to frontend
    const decryptedTransactions = Transaction.decryptAll(portfolio.transactions);
    const portfolioObj = portfolio.toObject();
    portfolioObj.transactions = decryptedTransactions;

    res.json({ portfolio: portfolioObj, currentPrice });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
