import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const runAIAgent = async (userGoal, portfolioData, currentPrice) => {
  // If no Gemini key, use smart mock
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your-gemini-key-here') {
    return mockAgentResponse(userGoal, portfolioData, currentPrice);
  }

  const prompt = `
You are BitGuard AI — an autonomous Bitcoin DCA and Tax Optimization agent for Indian investors.

Indian VDA Tax Rules:
- 30% flat tax on every profitable crypto lot
- No loss offset between different lots
- No indexation benefit
- FIFO cost basis method

User Goal: ${JSON.stringify(userGoal)}
Current Portfolio: ${JSON.stringify(portfolioData)}
Current BTC Price (INR): ₹${currentPrice.toLocaleString('en-IN')}

Instructions:
- If price is below average cost by more than 3% AND riskMode is "smart", recommend buying 1.5x the monthly amount (dip buying)
- If price is near or above average cost, recommend regular monthly amount
- Always suggest tax loss harvesting if any lots are at a loss
- Keep reasoning short and clear (2-3 sentences max)
- nextDcaDate should be exactly 1 month from today

Return ONLY valid JSON, no markdown, no explanation outside JSON:
{
  "reasoning": "short explanation in simple words",
  "action": "buy",
  "amountToInvest": number,
  "taxSavingsSuggestion": "string or null",
  "nextDcaDate": "YYYY-MM-DD"
}`;

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { responseMimeType: 'application/json' }
    });

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const parsed = JSON.parse(text);

    // Validate required fields
    if (!parsed.action || !parsed.amountToInvest) throw new Error('Invalid Gemini response shape');

    console.log('Gemini AI decision:', parsed.action, '₹' + parsed.amountToInvest);
    return parsed;
  } catch (err) {
    console.error('Gemini AI failed:', err.message, '— using mock fallback');
    return mockAgentResponse(userGoal, portfolioData, currentPrice);
  }
};

const mockAgentResponse = (userGoal, portfolioData, currentPrice) => {
  const avgCost = portfolioData?.averageCost || currentPrice;
  const isDip = currentPrice < avgCost * 0.97;
  const amount = isDip && userGoal.riskMode === 'smart'
    ? userGoal.monthlyAmount * 1.5
    : userGoal.monthlyAmount;

  const nextDate = new Date();
  nextDate.setMonth(nextDate.getMonth() + 1);

  return {
    reasoning: isDip
      ? `BTC is trading ₹${Math.round(avgCost - currentPrice).toLocaleString('en-IN')} below your average cost. Smart mode triggers a 1.5x buy to maximize accumulation on this dip.`
      : `BTC price is near your average cost basis of ₹${Math.round(avgCost).toLocaleString('en-IN')}. Executing regular DCA buy for steady accumulation.`,
    action: 'buy',
    amountToInvest: amount,
    taxSavingsSuggestion: portfolioData?.totalBtc > 0
      ? `Review lots bought above ₹${currentPrice.toLocaleString('en-IN')} for tax loss harvesting. Potential saving: ₹${Math.round(amount * 0.3).toLocaleString('en-IN')}`
      : null,
    nextDcaDate: nextDate.toISOString().split('T')[0]
  };
};
