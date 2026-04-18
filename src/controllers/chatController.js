import { callGemini } from '../utils/geminiManager.js';
import Transaction from '../models/Transaction.js';
import Portfolio from '../models/Portfolio.js';
import User from '../models/User.js';
import { getBtcPriceINR } from '../services/priceService.js';
import { calculateTaxReport } from '../services/taxService.js';
import { getDecryptedPortfolio } from '../utils/portfolioHelper.js';
import axios from 'axios';

const FALLBACK_INR = 8500000;

// Fetch 7-day BTC price history
const getPriceHistory = async () => {
  try {
    const { data } = await axios.get(
      'https://api.coingecko.com/api/v3/coins/bitcoin/market_chart',
      { params: { vs_currency: 'inr', days: 7, interval: 'daily' }, timeout: 8000 }
    );
    return data.prices.map(([ts, price]) => ({
      date: new Date(ts).toISOString().split('T')[0],
      price: Math.round(price)
    }));
  } catch { return []; }
};

// Fetch latest BTC news headlines
const getBtcNews = async () => {
  try {
    const { data } = await axios.get(
      'https://cryptopanic.com/api/v1/posts/',
      { params: { auth_token: 'pub_free', currencies: 'BTC', kind: 'news', public: true }, timeout: 6000 }
    );
    return (data.results || []).slice(0, 5).map(n => `• ${n.title}`);
  } catch {
    try {
      // Fallback: CoinGecko trending news
      const { data } = await axios.get('https://api.coingecko.com/api/v3/news', { timeout: 6000 });
      return (data.data || []).slice(0, 5).map(n => `• ${n.title}`);
    } catch { return []; }
  }
};

// POST /api/chat
export const chat = async (req, res) => {
  const { userId, message, history = [] } = req.body;
  if (!userId || !message) return res.status(400).json({ error: 'userId and message required' });

  try {
    const [user, decPortfolio, priceData, priceHistory, newsHeadlines] = await Promise.all([
      User.findById(userId),
      getDecryptedPortfolio(userId),
      getBtcPriceINR(),
      getPriceHistory(),
      getBtcNews()
    ]);

    const currentPrice  = priceData?.inr || FALLBACK_INR;
    const transactions  = decPortfolio?.transactions || [];
    const taxReport     = calculateTaxReport(transactions, currentPrice);

    const currentValue  = (decPortfolio?.totalBtc || 0) * currentPrice;
    const pnl           = currentValue - (decPortfolio?.totalInvested || 0);
    const pnlPct        = decPortfolio?.totalInvested > 0
      ? ((pnl / decPortfolio.totalInvested) * 100).toFixed(2) : '0.00';

    const avg7d = priceHistory.length
      ? Math.round(priceHistory.reduce((s, p) => s + p.price, 0) / priceHistory.length)
      : currentPrice;
    const priceTrend = currentPrice < avg7d * 0.97 ? 'DOWNTREND (dip)'
      : currentPrice > avg7d * 1.03 ? 'UPTREND (elevated)' : 'SIDEWAYS';

    // Per-lot detail for tax/HIFO questions
    const lotsSummary = transactions.map((tx, i) =>
      `Lot ${i + 1}: Bought ₹${Math.round(tx.amountINR).toLocaleString('en-IN')} | ` +
      `₿${tx.btcAmount?.toFixed(6)} @ ₹${Math.round(tx.pricePerBtc).toLocaleString('en-IN')} | ` +
      `Date: ${new Date(tx.date).toLocaleDateString('en-IN')} | ` +
      `P&L: ₹${Math.round(tx.btcAmount * currentPrice - tx.amountINR).toLocaleString('en-IN')}`
    ).join('\n');

    const systemPrompt = `You are BitGuard AI — a smart, friendly Bitcoin DCA and Tax advisor for Indian investors.
You have FULL real-time access to the user's portfolio, tax data, live BTC price, price history, and latest news.
Always answer using their ACTUAL numbers. Be concise (3-5 sentences), direct, and helpful.
Respond in plain text — no markdown, no asterisks, no bullet symbols unless listing items.
Respond in the same language the user writes in (Hindi or English).

=== USER PROFILE ===
Name: ${user?.name}
Monthly DCA: ₹${user?.monthlyAmount?.toLocaleString('en-IN')} | Frequency: ${user?.frequency} | Duration: ${user?.durationMonths} months | Risk: ${user?.riskMode}

=== LIVE PORTFOLIO ===
Total Invested: ₹${Math.round(decPortfolio?.totalInvested || 0).toLocaleString('en-IN')}
Total BTC: ₿${(decPortfolio?.totalBtc || 0).toFixed(6)}
Avg Buy Price: ₹${Math.round(decPortfolio?.averageCost || 0).toLocaleString('en-IN')}
Current BTC Price: ₹${currentPrice.toLocaleString('en-IN')}
Portfolio Value: ₹${Math.round(currentValue).toLocaleString('en-IN')}
Unrealized P&L: ₹${Math.round(pnl).toLocaleString('en-IN')} (${pnlPct}%)
Total Transactions: ${transactions.length}

=== ALL TRANSACTION LOTS ===
${lotsSummary || 'No transactions yet.'}

=== TAX REPORT (FY 2025-26) ===
Total Tax Due: ₹${taxReport.taxDue.toLocaleString('en-IN')}
Total Profit: ₹${taxReport.totalProfit.toLocaleString('en-IN')}
Effective Tax Rate: ${taxReport.effectiveTaxRate}%
Loss Lots: ${taxReport.lots.filter(l => l.isLoss).length}
${taxReport.harvestingSuggestion ? 'Harvest Opportunity: ' + taxReport.harvestingSuggestion.message : 'No harvest opportunity currently.'}

=== INDIA VDA TAX RULES ===
30% flat tax on profit per lot. No loss offset. No indexation. HIFO minimizes tax.

=== LIVE BTC MARKET ===
Current: ₹${currentPrice.toLocaleString('en-IN')} | 7-Day Avg: ₹${avg7d.toLocaleString('en-IN')} | Trend: ${priceTrend}
7-Day History: ${priceHistory.map(p => `${p.date}: ₹${p.price.toLocaleString('en-IN')}`).join(' | ') || 'Unavailable'}

=== LATEST BTC NEWS ===
${newsHeadlines.length ? newsHeadlines.join('\n') : 'News unavailable right now.'}`;

    const conversationHistory = history
      .map(m => `${m.role === 'ai' ? 'Assistant' : 'User'}: ${m.text}`).join('\n');

    const fullPrompt = `${systemPrompt}\n\n=== CONVERSATION ===\n${conversationHistory}\n\nUser: ${message}\nAssistant:`;

    const reply = await callGemini(fullPrompt, 'chat');
    res.json({ reply });
  } catch (err) {
    console.error('Chat error:', err.message);
    res.json({ reply: getFallbackReply(message), fallback: true });
  }
};

const getFallbackReply = (msg) => {
  const m = msg.toLowerCase();
  if (m.includes('portfolio') || m.includes('value'))
    return 'Your portfolio data is loaded. Please check the Dashboard for live values.';
  if (m.includes('tax'))
    return 'India VDA tax is 30% flat on profits. Visit the Tax Optimizer page for your detailed report.';
  if (m.includes('buy') || m.includes('dca'))
    return 'Your DCA agent is active. Click "Simulate Next Buy" on the DCA Agent page to get an AI recommendation.';
  if (m.includes('harvest'))
    return 'Tax loss harvesting means selling loss-making lots to reduce your taxable profit. Check the Tax Optimizer page for your harvest opportunities.';
  return "I'm having trouble connecting to AI right now. Please try again in a moment.";
};
