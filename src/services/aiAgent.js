import { callGemini } from '../utils/geminiManager.js';
import axios from 'axios';



// Fetch last 7 days BTC price history from CoinGecko
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
  } catch {
    return []; // fallback: no history
  }
};

export const runAIAgent = async (userGoal, portfolioData, currentPrice) => {
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your-gemini-key-here') {
    return mockAgentResponse(userGoal, portfolioData, currentPrice);
  }

  const priceHistory = await getPriceHistory();
  const recentPrices = priceHistory.map(p => `${p.date}: ₹${p.price.toLocaleString('en-IN')}`).join('\n');

  // Calculate 7-day avg for trend detection
  const avgPrice7d = priceHistory.length > 0
    ? Math.round(priceHistory.reduce((s, p) => s + p.price, 0) / priceHistory.length)
    : currentPrice;

  const priceTrend = currentPrice < avgPrice7d * 0.97
    ? 'DOWNTREND (price is 3%+ below 7-day average — dip opportunity)'
    : currentPrice > avgPrice7d * 1.03
    ? 'UPTREND (price is 3%+ above 7-day average — caution)'
    : 'SIDEWAYS (price near 7-day average)';

  const prompt = `
You are BitGuard AI — an autonomous Bitcoin DCA and Tax Optimization agent for Indian investors.

=== INDIA VDA TAX RULES ===
- 30% flat tax on every profitable crypto lot
- No loss offset between lots, no indexation

=== USER GOAL ===
${JSON.stringify(userGoal)}

=== CURRENT PORTFOLIO ===
${JSON.stringify(portfolioData)}

=== LIVE BTC PRICE ===
Current: ₹${currentPrice.toLocaleString('en-IN')}
7-Day Average: ₹${avgPrice7d.toLocaleString('en-IN')}
Trend: ${priceTrend}

=== LAST 7 DAYS PRICE HISTORY ===
${recentPrices || 'Not available'}

=== DECISION RULES ===
- DOWNTREND + riskMode="smart" → buy 1.5x monthly amount (dip accumulation)
- UPTREND → buy 0.75x monthly amount (reduce exposure at high prices)
- SIDEWAYS → buy 1x monthly amount (regular DCA)
- Always suggest tax loss harvesting if portfolio has loss lots
- nextDcaDate = exactly 1 month from today

Return ONLY valid JSON:
{
  "reasoning": "2-3 sentences explaining decision based on price trend and portfolio",
  "action": "buy",
  "amountToInvest": number,
  "priceSignal": "DIP" or "HIGH" or "NEUTRAL",
  "taxSavingsSuggestion": "string or null",
  "nextDcaDate": "YYYY-MM-DD"
}`;

  try {
    const parsed = await callGemini(prompt, 'ai_agent');
    if (!parsed.action || !parsed.amountToInvest) throw new Error('Invalid response shape');
    console.log(`Gemini AI: ${parsed.action} ₹${parsed.amountToInvest} | Signal: ${parsed.priceSignal}`);
    return parsed;
  } catch (err) {
    console.error('Gemini failed:', err.message, '— using mock');
    return mockAgentResponse(userGoal, portfolioData, currentPrice, avgPrice7d);
  }
};

const mockAgentResponse = (userGoal, portfolioData, currentPrice, avgPrice7d) => {
  const avg     = avgPrice7d || portfolioData?.averageCost || currentPrice;
  const isDip   = currentPrice < avg * 0.97;
  const isHigh  = currentPrice > avg * 1.03;
  const amount  = isDip && userGoal.riskMode === 'smart'
    ? userGoal.monthlyAmount * 1.5
    : isHigh ? userGoal.monthlyAmount * 0.75
    : userGoal.monthlyAmount;

  const nextDate = new Date();
  nextDate.setMonth(nextDate.getMonth() + 1);

  return {
    reasoning: isDip
      ? `BTC is ₹${Math.round(avg - currentPrice).toLocaleString('en-IN')} below the 7-day average. Smart mode triggers a 1.5x buy to maximize accumulation on this dip.`
      : isHigh
      ? `BTC is trading above the 7-day average. Reducing buy to 0.75x to avoid buying at elevated prices.`
      : `BTC is near the 7-day average of ₹${Math.round(avg).toLocaleString('en-IN')}. Executing regular DCA buy.`,
    action: 'buy',
    amountToInvest: Math.round(amount),
    priceSignal: isDip ? 'DIP' : isHigh ? 'HIGH' : 'NEUTRAL',
    taxSavingsSuggestion: portfolioData?.totalBtc > 0
      ? `Review loss lots for tax harvesting. Potential saving: ₹${Math.round(amount * 0.3).toLocaleString('en-IN')}`
      : null,
    nextDcaDate: nextDate.toISOString().split('T')[0]
  };
};
