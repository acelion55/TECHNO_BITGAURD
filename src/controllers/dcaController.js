import User from '../models/User.js';
import Portfolio from '../models/Portfolio.js';
import Transaction from '../models/Transaction.js';
import { getBtcPriceINR } from '../services/priceService.js';
import { runAIAgent } from '../services/aiAgent.js';

const FALLBACK_INR = 8500000;

// POST /api/dca/simulate-buy
export const simulateBuy = async (req, res) => {
  try {
    const { userId } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const portfolio = await Portfolio.findOne({ userId }).populate('transactions');
    const priceData = await getBtcPriceINR();
    const currentPrice = priceData?.inr || FALLBACK_INR;

    // Run AI agent
    const aiDecision = await runAIAgent(
      { monthlyAmount: user.monthlyAmount, frequency: user.frequency, riskMode: user.riskMode },
      { totalBtc: portfolio?.totalBtc, averageCost: portfolio?.averageCost, totalInvested: portfolio?.totalInvested },
      currentPrice
    );

    if (aiDecision.action !== 'buy') {
      return res.json({ aiDecision, transaction: null, portfolio });
    }

    const amountINR = aiDecision.amountToInvest;
    const btcAmount = amountINR / currentPrice;

    const tx = await Transaction.create({
      userId,
      type: 'buy',
      amountINR,
      btcAmount,
      pricePerBtc: currentPrice,
      date: new Date(),
      costBasis: amountINR
    });

    // Update portfolio
    const updatedPortfolio = await Portfolio.findOneAndUpdate(
      { userId },
      {
        $inc: { totalInvested: amountINR, totalBtc: btcAmount },
        $push: { transactions: tx._id }
      },
      { new: true }
    ).populate('transactions');

    const newAvgCost = updatedPortfolio.totalInvested / updatedPortfolio.totalBtc;
    updatedPortfolio.averageCost = newAvgCost;
    updatedPortfolio.currentValue = updatedPortfolio.totalBtc * currentPrice;
    await updatedPortfolio.save();

    res.json({ aiDecision, transaction: tx, portfolio: updatedPortfolio });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/portfolio/:userId
export const getPortfolio = async (req, res) => {
  try {
    const priceData = await getBtcPriceINR();
    const currentPrice = priceData?.inr || FALLBACK_INR;
    const portfolio = await Portfolio.findOne({ userId: req.params.userId }).populate('transactions');
    if (!portfolio) return res.status(404).json({ error: 'Portfolio not found' });

    portfolio.currentValue = portfolio.totalBtc * currentPrice;
    await portfolio.save();

    res.json({ portfolio, currentPrice });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
