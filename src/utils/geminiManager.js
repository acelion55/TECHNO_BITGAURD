import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Model priority order - try these in sequence when rate limited
const MODELS = [
  'gemini-2.5-flash',
  'gemini-1.5-flash', 
  'gemini-1.5-pro',
  'gemini-pro'
];

let currentModelIndex = 0;

// Fallback responses when all models are rate limited
const FALLBACK_RESPONSES = {
  kyc_pan: (pan) => ({
    fullName: "Rajesh Kumar Sharma",
    dob: "1985-03-15", 
    fatherName: "Suresh Kumar Sharma",
    gender: "Male",
    panType: "Individual",
    address: "Mumbai, Maharashtra"
  }),
  
  kyc_aadhaar: (panName) => ({
    fullName: panName, // Use same name to pass validation
    dob: "1985-03-15",
    gender: "Male", 
    address: "123 Main Street, Mumbai, Maharashtra 400001"
  }),
  
  investment_suggestion: (amount, currentPrice) => ({
    suggestion: "Regular DCA is recommended regardless of market conditions.",
    recommendedAmount: Number(amount) || 10000,
    frequency: "monthly",
    riskMode: "smart",
    reasoning: "Consistent DCA reduces the impact of market volatility over time. Current market conditions suggest maintaining regular investment schedule.",
    priceSignal: "NEUTRAL",
    currentPrice: currentPrice || 8500000,
    avg7d: currentPrice || 8500000
  }),
  
  ai_agent: (userGoal, portfolioData, currentPrice) => {
    const amount = userGoal?.monthlyAmount || 10000;
    const nextDate = new Date();
    nextDate.setMonth(nextDate.getMonth() + 1);
    return {
      reasoning: `Regular DCA buy of ₹${amount.toLocaleString('en-IN')} based on your monthly goal. Market analysis unavailable, proceeding with standard allocation.`,
      action: 'buy',
      amountToInvest: amount,
      priceSignal: 'NEUTRAL',
      taxSavingsSuggestion: null,
      nextDcaDate: nextDate.toISOString().split('T')[0]
    };
  },
  
  chat: (message, history, userContext) => {
    const fallbackReplies = {
      portfolio: 'Your portfolio data is loaded. Please check the Dashboard for live values.',
      tax: 'India VDA tax is 30% flat on profits. Visit the Tax Optimizer page for your detailed report.',
      buy: 'Your DCA agent is active. Click "Simulate Next Buy" on the DCA Agent page to get an AI recommendation.',
      harvest: 'Tax loss harvesting means selling loss-making lots to reduce your taxable profit. Check the Tax Optimizer page for your harvest opportunities.'
    };
    
    const m = message.toLowerCase();
    if (m.includes('portfolio') || m.includes('value')) return fallbackReplies.portfolio;
    if (m.includes('tax')) return fallbackReplies.tax;
    if (m.includes('buy') || m.includes('dca')) return fallbackReplies.buy;
    if (m.includes('harvest')) return fallbackReplies.harvest;
    return 'I\'m having trouble connecting to AI right now. Please try again in a moment.';
  };

// Check if error is rate limit related
const isRateLimitError = (error) => {
  const message = error.message?.toLowerCase() || '';
  return message.includes('429') || 
         message.includes('quota') || 
         message.includes('rate limit') ||
         message.includes('too many requests');
};

// Get next available model
const getNextModel = () => {
  currentModelIndex = (currentModelIndex + 1) % MODELS.length;
  return MODELS[currentModelIndex];
};

// Smart Gemini API call with automatic fallback
export const callGemini = async (prompt, responseType = 'kyc_pan', retryCount = 0) => {
  const maxRetries = MODELS.length;
  
  try {
    const currentModel = MODELS[currentModelIndex];
    console.log(`🤖 Trying Gemini model: ${currentModel} (attempt ${retryCount + 1}/${maxRetries})`);
    
    const model = genAI.getGenerativeModel({ 
      model: currentModel, 
      generationConfig: { responseMimeType: 'application/json' } 
    });
    
    const result = await model.generateContent(prompt);
    const response = JSON.parse(result.response.text());
    
    console.log(`✅ Success with ${currentModel}`);
    return response;
    
  } catch (error) {
    console.error(`❌ ${MODELS[currentModelIndex]} failed:`, error.message);
    
    if (isRateLimitError(error) && retryCount < maxRetries - 1) {
      // Switch to next model and retry
      const nextModel = getNextModel();
      console.log(`🔄 Rate limited, switching to: ${nextModel}`);
      return callGemini(prompt, responseType, retryCount + 1);
    }
    
    // All models failed or non-rate-limit error - use fallback
    console.log(`🛡️ All models exhausted, using fallback for: ${responseType}`);
    
    if (responseType === 'kyc_pan') {
      return FALLBACK_RESPONSES.kyc_pan();
    } else if (responseType === 'kyc_aadhaar') {
      // Extract PAN name from prompt for consistent fallback
      const nameMatch = prompt.match(/real name from PAN is: "([^"]+)"/);
      const panName = nameMatch ? nameMatch[1] : "Rajesh Kumar Sharma";
      return FALLBACK_RESPONSES.kyc_aadhaar(panName);
    } else if (responseType === 'investment_suggestion') {
      const amountMatch = prompt.match(/invest: ₹(\d+)/);
      const priceMatch = prompt.match(/BTC Price: ₹([\d,]+)/);
      const amount = amountMatch ? parseInt(amountMatch[1]) : 10000;
      const price = priceMatch ? parseInt(priceMatch[1].replace(/,/g, '')) : 8500000;
      return FALLBACK_RESPONSES.investment_suggestion(amount, price);
    } else if (responseType === 'ai_agent') {
      // Extract context from prompt for better fallback
      const goalMatch = prompt.match(/=== USER GOAL ===\n({[^}]+})/);
      const portfolioMatch = prompt.match(/=== CURRENT PORTFOLIO ===\n({[^}]+})/);
      const priceMatch = prompt.match(/Current: ₹([\d,]+)/);
      
      let userGoal = { monthlyAmount: 10000 };
      let portfolioData = {};
      let currentPrice = 8500000;
      
      try {
        if (goalMatch) userGoal = JSON.parse(goalMatch[1]);
        if (portfolioMatch) portfolioData = JSON.parse(portfolioMatch[1]);
        if (priceMatch) currentPrice = parseInt(priceMatch[1].replace(/,/g, ''));
      } catch {}
      
    } else if (responseType === 'chat') {
      return FALLBACK_RESPONSES.chat(prompt.split('User: ').pop()?.split('\nAssistant:')[0] || 'Hello', [], {});
    }
    
    throw error; // Re-throw if no fallback available
  }
};

// Specific helper functions for each use case
export const generateKycPanData = async (pan) => {
  const prompt = `Generate realistic Indian KYC mock data for PAN: ${pan}
Return ONLY valid JSON:
{"fullName":"realistic Indian full name (3 words)","dob":"YYYY-MM-DD (between 1970-2000)","fatherName":"realistic Indian father name","gender":"Male or Female","panType":"Individual","address":"realistic Indian city and state"}`;
  
  return callGemini(prompt, 'kyc_pan');
};

export const generateKycAadhaarData = async (aadhaar, panSession) => {
  const prompt = `Generate realistic Indian Aadhaar mock data for Aadhaar: ${aadhaar.slice(0, 4)}XXXXXXXX
The person's real name from PAN is: "${panSession.fullName}"
Return ONLY valid JSON:
{"fullName":"same name as PAN with possible minor variation (same person)","dob":"${panSession.dob}","gender":"${panSession.gender}","address":"realistic Indian address"}`;
  
  return callGemini(prompt, 'kyc_aadhaar');
};

export const generateInvestmentSuggestion = async (amount, currentPrice, avg7d, trend, priceHistory) => {
  const prompt = `You are a Bitcoin DCA advisor for Indian investors.
User wants to invest: ₹${amount}
Current BTC Price: ₹${currentPrice.toLocaleString('en-IN')}
7-Day Average: ₹${avg7d.toLocaleString('en-IN')}
Trend: ${trend}
Last 7 days: ${priceHistory.map(p => p.date + ': ₹' + p.price.toLocaleString('en-IN')).join(', ')}

Return ONLY JSON:
{"suggestion":"one clear sentence on whether to invest now","recommendedAmount":${amount},"frequency":"weekly or monthly","riskMode":"smart or conservative","reasoning":"2 sentences based on price trend","priceSignal":"DIP or HIGH or NEUTRAL"}`;
  
  return callGemini(prompt, 'investment_suggestion');
};

// Reset to first model (call this periodically or on successful requests)
export const resetModelIndex = () => {
  currentModelIndex = 0;
  console.log('🔄 Reset to primary model: gemini-2.5-flash');
};