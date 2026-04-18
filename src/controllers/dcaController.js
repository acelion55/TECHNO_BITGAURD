import User from '../models/User.js';
import Portfolio from '../models/Portfolio.js';
import Transaction from '../models/Transaction.js';
import WalletTx from '../models/WalletTx.js';
import { getBtcPriceINR } from '../services/priceService.js';
import { runAIAgent } from '../services/aiAgent.js';
import { log, ACTIONS } from '../services/auditService.js';
import { sendAiBuyEmail } from '../services/emailService.js';
import { getDecryptedPortfolio } from '../utils/portfolioHelper.js';

const FALLBACK_INR = 8500000;

// POST /api/dca/simulate-buy
export const simulateBuy = async (req, res) => {
  try {
    const userId = req.userId;

    const user         = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const portfolio    = await Portfolio.findOne({ userId }).populate('transactions');
    const priceData    = await getBtcPriceINR();
    const currentPrice = priceData?.inr || FALLBACK_INR;

    const decryptedTxs = Transaction.decryptAll(portfolio?.transactions || []);

    const aiDecision = await runAIAgent(
      { monthlyAmount: user.monthlyAmount, frequency: user.frequency, riskMode: user.riskMode },
      { totalBtc: portfolio?.totalBtc, averageCost: portfolio?.averageCost, totalInvested: portfolio?.totalInvested, recentTransactions: decryptedTxs.slice(-5) },
      currentPrice
    );

    if (aiDecision.action !== 'buy') {
      await log(userId, ACTIONS.AI_BUY_DECISION, { action: 'hold', reason: aiDecision.reasoning }, req);
      const decPortfolio = await getDecryptedPortfolio(userId);
      return res.json({ aiDecision, transaction: null, portfolio: decPortfolio, walletBalance: user.walletBalance });
    }

    const amountINR = aiDecision.amountToInvest;

    // ── Check sufficient wallet balance ───────────────────────────────────────
    if (user.walletBalance < amountINR) {
      return res.status(400).json({
        error: `Insufficient wallet balance. Need ₹${amountINR.toLocaleString('en-IN')} but have ₹${user.walletBalance.toLocaleString('en-IN')}.`
      });
    }

    const btcAmount = amountINR / currentPrice;

    // ── Deduct from wallet ────────────────────────────────────────────────────
    user.walletBalance -= amountINR;
    await user.save();

    // ── Record wallet debit ───────────────────────────────────────────────────
    await WalletTx.create({
      userId, type: 'debit', amount: amountINR,
      method: 'DCA_BUY', status: 'success',
      reference: `DCA_${Date.now()}`
    });

    const tx = await Transaction.create({
      userId, type: 'buy', amountINR, btcAmount,
      pricePerBtc: currentPrice, date: new Date(), costBasis: amountINR
    });

    const updated = await Portfolio.findOneAndUpdate(
      { userId },
      { $inc: { totalInvested: amountINR, totalBtc: btcAmount }, $push: { transactions: tx._id } },
      { new: true }
    );
    updated.averageCost  = updated.totalBtc > 0 ? updated.totalInvested / updated.totalBtc : 0;
    updated.currentValue = updated.totalBtc * currentPrice;
    await updated.save();

    await log(userId, ACTIONS.SIMULATE_BUY, { amountINR, btcAmount, pricePerBtc: currentPrice, priceSignal: aiDecision.priceSignal, reasoning: aiDecision.reasoning }, req);

    sendAiBuyEmail(
      { email: user.email, name: user.name, avgCost: portfolio?.averageCost },
      aiDecision, { btcAmount, amountINR }, currentPrice
    ).catch(err => console.error('Email failed:', err.message));

    const decPortfolio = await getDecryptedPortfolio(userId);
    const decryptedTx  = tx.decryptFields();
    res.json({ aiDecision, transaction: decryptedTx, portfolio: decPortfolio, walletBalance: user.walletBalance });
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

    let portfolio = await Portfolio.findOne({ userId });
    if (!portfolio) {
      portfolio = await Portfolio.create({ userId, totalInvested: 0, totalBtc: 0, averageCost: 0, currentValue: 0, transactions: [] });
    }

    portfolio.currentValue = portfolio.totalBtc * currentPrice;
    await portfolio.save();

    const decPortfolio = await getDecryptedPortfolio(userId);
    res.json({ portfolio: decPortfolio, currentPrice });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
