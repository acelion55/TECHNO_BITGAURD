import Portfolio from '../models/Portfolio.js';
import Transaction from '../models/Transaction.js';

// Always call this before sending portfolio to frontend
export const getDecryptedPortfolio = async (userId) => {
  const portfolio = await Portfolio.findOne({ userId }).populate('transactions');
  if (!portfolio) return null;
  const obj = portfolio.toObject();
  obj.transactions = Transaction.decryptAll(portfolio.transactions);
  return obj;
};
