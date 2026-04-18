import { GoogleGenerativeAI } from '@google/generative-ai';
import Transaction from '../models/Transaction.js';
import Portfolio from '../models/Portfolio.js';
import User from '../models/User.js';
import { getBtcPriceINR } from '../services/priceService.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const FALLBACK_INR = 8500000;

// POST /api/chat
export const chat = async (req, res) => {
  const { userId, message, history = [] } = req.body;
  if (!userId || !message) return res.status(400).json({ error: 'userId and message required' });

  try {
    // Load full context
    const [user, portfolio, transactions, priceData] = await Promise.all([
      User.findById(userId),
      Portfolio.findOne({ userId }),
      Transaction.find({ userId }).sort({ date: 1 }),
      getBtcPriceINR()
    ]);

    const currentPrice = priceData?.inr || FALLBACK_INR;
    const currentValue = (portfolio?.totalBtc || 0) * currentPrice;
    const pnl          = currentValue - (portfolio?.totalInvested || 0);
    const pnlPct       = portfolio?.totalInvested > 0
      ? ((pnl / portfolio.totalInvested) * 100).toFixed(2)
      : 0;

    const systemPrompt = `You are BitGuard AI — a smart, friendly Bitcoin DCA and Tax advisor for Indian investors.
You have full access to the user's real portfolio data. Always answer using their actual numbers.

=== USER PROFILE ===
Name: ${user?.name}
Monthly DCA Amount: ₹${user?.monthlyAmount?.toLocaleString('en-IN')}
Frequency: ${user?.frequency}
Duration: ${user?.durationMonths} months
Risk Mode: ${user?.riskMode}

=== LIVE PORTFOLIO ===
Total Invested: ₹${Math.round(portfolio?.totalInvested || 0).toLocaleString('en-IN')}
Total BTC Held: ₿${(portfolio?.totalBtc || 0).toFixed(6)}
Average Buy Price: ₹${Math.round(portfolio?.averageCost || 0).toLocaleString('en-IN')}
Current BTC Price: ₹${currentPrice.toLocaleString('en-IN')}
Current Portfolio Value: ₹${Math.round(currentValue).toLocaleString('en-IN')}
Unrealized P&L: ₹${Math.round(pnl).toLocaleString('en-IN')} (${pnlPct}%)
Total Transactions: ${transactions.length}

=== INDIA VDA TAX RULES ===
- 30% flat tax on crypto profits
- No loss offset between lots
- No indexation benefit
- HIFO method minimizes tax (sell highest cost basis lots first)

=== INSTRUCTIONS ===
- Answer in 2-4 sentences max. Be concise and direct.
- Always use the user's real numbers from the portfolio above.
- If asked about buying: compare current price vs average cost, mention dip buying if applicable.
- If asked about tax: calculate 30% on unrealized profit using real numbers.
- If asked about HIFO/harvesting: explain with their actual lot data.
- Respond in the same language the user writes in (Hindi or English).
- Never make up numbers. Use only the data provided above.`;

    // Use Gemini with chat history
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const chatSession = model.startChat({
      history: [
        { role: 'user', parts: [{ text: systemPrompt }] },
        { role: 'model', parts: [{ text: `Understood! I'm BitGuard AI, ready to help ${user?.name} with their Bitcoin portfolio and tax optimization.` }] },
        // inject previous messages
        ...history.map(m => ({
          role: m.role === 'ai' ? 'model' : 'user',
          parts: [{ text: m.text }]
        }))
      ]
    });

    const result = await chatSession.sendMessage(message);
    const reply  = result.response.text();

    res.json({ reply });
  } catch (err) {
    console.error('Chat error:', err.message);
    // Fallback: rule-based reply
    res.json({ reply: getFallbackReply(message), fallback: true });
  }
};

// Simple fallback if Gemini fails
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
  return 'I\'m having trouble connecting to AI right now. Please try again in a moment.';
};
