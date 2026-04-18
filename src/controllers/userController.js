import User from '../models/User.js';
import Portfolio from '../models/Portfolio.js';
import Transaction from '../models/Transaction.js';
import { getBtcPriceINR } from '../services/priceService.js';

// POST /api/user/goal
export const saveGoal = async (req, res) => {
  try {
    const { name, email, monthlyAmount, frequency, durationMonths, riskMode } = req.body;

    let user = await User.findOne({ email });
    if (user) {
      Object.assign(user, { name, monthlyAmount, frequency, durationMonths, riskMode });
      await user.save();
    } else {
      user = await User.create({ name, email, monthlyAmount, frequency, durationMonths, riskMode });
      // Seed mock transactions for demo
      await seedMockData(user._id, monthlyAmount);
    }

    const portfolio = await Portfolio.findOne({ userId: user._id }).populate('transactions');
    res.json({ user, portfolio });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/user/:email
export const getUser = async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const portfolio = await Portfolio.findOne({ userId: user._id }).populate('transactions');
    res.json({ user, portfolio });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const seedMockData = async (userId, monthlyAmount) => {
  const priceData = await getBtcPriceINR();
  const currentPrice = priceData?.inr || 8500000;
  // 8 mock buys at varying prices over past 8 months
  const priceVariations = [0.85, 0.92, 1.05, 0.78, 1.12, 0.95, 1.08, 0.88];
  const transactions = [];

  for (let i = 0; i < 8; i++) {
    const pricePerBtc = Math.round(currentPrice * priceVariations[i]);
    const btcAmount = monthlyAmount / pricePerBtc;
    const date = new Date();
    date.setMonth(date.getMonth() - (8 - i));

    const tx = await Transaction.create({
      userId,
      type: 'buy',
      amountINR: monthlyAmount,
      btcAmount,
      pricePerBtc,
      date,
      costBasis: monthlyAmount
    });
    transactions.push(tx._id);
  }

  const totalBtc = transactions.reduce ? 0 : 0; // recalculate below
  const allTx = await Transaction.find({ userId });
  const totalInvested = allTx.reduce((s, t) => s + t.amountINR, 0);
  const totalBtcCalc = allTx.reduce((s, t) => s + t.btcAmount, 0);

  await Portfolio.create({
    userId,
    totalInvested,
    totalBtc: totalBtcCalc,
    averageCost: totalInvested / totalBtcCalc,
    currentValue: totalBtcCalc * currentPrice,
    transactions: allTx.map((t) => t._id)
  });
};
