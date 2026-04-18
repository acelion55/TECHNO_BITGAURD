import { generateKycPanData, generateKycAadhaarData, generateInvestmentSuggestion } from '../utils/geminiManager.js';
import bcrypt from 'bcryptjs';
import axios from 'axios';
import User from '../models/User.js';
import WalletTx from '../models/WalletTx.js';
import Portfolio from '../models/Portfolio.js';
import Transaction from '../models/Transaction.js';
import { encrypt, decrypt } from '../utils/encryption.js';
import { log, ACTIONS } from '../services/auditService.js';
import { sendOtpEmail, sendWelcomeEmail } from '../services/emailService.js';
import { getBtcPriceINR } from '../services/priceService.js';
import { getDecryptedPortfolio } from '../utils/portfolioHelper.js';



const sanitizeUser = (user) => ({
  _id: user._id, name: user.name, email: user.email,
  kycStatus: user.kycStatus, hasFullAccess: user.hasFullAccess,
  walletBalance: user.walletBalance, walletFunded: user.walletFunded,
  hasBankDetails: user.hasBankDetails, monthlyAmount: user.monthlyAmount,
  frequency: user.frequency, durationMonths: user.durationMonths,
  riskMode: user.riskMode, isVerified: user.isVerified
});

// Fuzzy name match
const namesMatch = (name1, name2) => {
  const normalize = (s) => s?.toLowerCase().replace(/[^a-z\s]/g, '').trim().split(/\s+/).sort().join(' ');
  const n1 = normalize(name1);
  const n2 = normalize(name2);
  if (n1 === n2) return true;
  const words1 = n1.split(' ');
  const words2 = n2.split(' ');
  const common = words1.filter(w => words2.includes(w));
  return common.length >= Math.min(words1.length, words2.length) - 1 && common.length >= 2;
};

// ── STEP 1: POST /api/kyc/pan ──────────────────────────────────────────────────
export const verifyPan = async (req, res) => {
  try {
    const { pan } = req.body;
    if (!pan || !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan.toUpperCase()))
      return res.status(400).json({ error: 'Invalid PAN format. Example: ABCDE1234F' });

    const panUpper = pan.toUpperCase();

    const existing = await User.find({});
    for (const u of existing) {
      try { if (u.decryptKyc('pan') === panUpper) return res.status(409).json({ error: 'PAN already registered' }); }
      catch {}
    }

    const kycData = await generateKycPanData(panUpper);
    const encKyc  = encrypt({ ...kycData, pan: panUpper });

    res.json({ success: true, kycData: { fullName: kycData.fullName, dob: kycData.dob, fatherName: kycData.fatherName, gender: kycData.gender, address: kycData.address }, encryptedSession: encKyc });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── STEP 2: POST /api/kyc/aadhaar ─────────────────────────────────────────────
export const verifyAadhaar = async (req, res) => {
  try {
    const { aadhaar, encryptedSession } = req.body;
    if (!aadhaar || !/^\d{12}$/.test(aadhaar)) return res.status(400).json({ error: 'Aadhaar must be 12 digits' });
    if (!encryptedSession?.iv) return res.status(400).json({ error: 'Invalid session. Please restart KYC.' });

    const panSession = decrypt(encryptedSession);
    const aadhaarData = await generateKycAadhaarData(aadhaar, panSession);
    if (!namesMatch(panSession.fullName, aadhaarData.fullName))
      return res.status(400).json({ error: `KYC Failed: Name mismatch. PAN: "${panSession.fullName}", Aadhaar: "${aadhaarData.fullName}". Both must belong to the same person.` });

    const updatedSession = encrypt({ ...panSession, aadhaar: aadhaar.slice(-4).padStart(12, '*'), aadhaarFull: aadhaar, aadhaarName: aadhaarData.fullName, aadhaarVerified: true });
    res.json({ success: true, verifiedName: panSession.fullName, encryptedSession: updatedSession });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── STEP 3a: POST /api/kyc/send-otp ───────────────────────────────────────────
export const sendEmailOtp = async (req, res) => {
  try {
    const { email, encryptedSession } = req.body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Valid email required' });
    if (await User.findOne({ email })) return res.status(409).json({ error: 'Email already registered' });

    const session = decrypt(encryptedSession);
    const otp     = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = await bcrypt.hash(otp, 10);
    const updated = encrypt({ ...session, email, otpHash, otpExpiry: Date.now() + 10 * 60 * 1000 });

    await sendOtpEmail(email, otp, session.fullName);
    res.json({ success: true, encryptedSession: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── STEP 3b: POST /api/kyc/verify-otp ─────────────────────────────────────────
export const verifyEmailOtp = async (req, res) => {
  try {
    const { otp, mpin, encryptedSession } = req.body;
    if (!otp || !/^\d{6}$/.test(otp)) return res.status(400).json({ error: 'Invalid OTP' });
    if (!mpin || !/^\d{6}$/.test(mpin)) return res.status(400).json({ error: 'MPIN must be 6 digits' });

    const session = decrypt(encryptedSession);
    if (Date.now() > session.otpExpiry) return res.status(400).json({ error: 'OTP expired. Please request a new one.' });
    if (!await bcrypt.compare(otp, session.otpHash)) return res.status(400).json({ error: 'Invalid OTP' });

    res.json({ success: true, encryptedSession: encrypt({ ...session, mpin, emailVerified: true }) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── STEP 4: POST /api/kyc/bank (optional) ─────────────────────────────────────
export const saveBankDetails = async (req, res) => {
  try {
    const { bankAccount, ifsc, bankHolderName, encryptedSession, skip } = req.body;
    const session = decrypt(encryptedSession);
    const updated = skip
      ? encrypt({ ...session, bankSkipped: true })
      : (() => {
          if (!bankAccount || !ifsc || !bankHolderName) throw new Error('All bank fields required or skip');
          return encrypt({ ...session, bankAccount, ifsc, bankHolderName, bankSkipped: false });
        })();
    res.json({ success: true, encryptedSession: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── STEP 5: POST /api/kyc/complete — register user, NO wallet required ─────────
export const completeKyc = async (req, res) => {
  try {
    const { encryptedSession } = req.body;
    const session = decrypt(encryptedSession);

    if (!session.emailVerified || !session.aadhaarVerified)
      return res.status(400).json({ error: 'KYC incomplete. Please complete all steps.' });

    const user = new User({
      name: session.fullName, email: session.email, mpin: session.mpin,
      pan: session.pan, aadhaar: session.aadhaar,
      bankAccount:    session.bankSkipped ? null : session.bankAccount,
      ifsc:           session.bankSkipped ? null : session.ifsc,
      bankHolderName: session.bankSkipped ? null : session.bankHolderName,
      hasBankDetails: !session.bankSkipped,
      kycStatus: 'complete', isVerified: true,
      walletBalance: 0, walletFunded: false,
      hasFullAccess: false,  // unlocked after wallet deposit
      monthlyAmount: 0,      // set from Transactions page
      kycData: encrypt({ pan: session.pan, fullName: session.fullName, dob: session.dob })
    });

    await user.save();
    await log(user._id, ACTIONS.SIGNUP, { kycComplete: true }, req);
    sendWelcomeEmail(user).catch(e => console.error('Welcome email:', e.message));

    res.status(201).json({
      success: true,
      message: 'Registration complete! Add funds to your wallet to start investing.',
      user: sanitizeUser(user)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── GET /api/wallet ────────────────────────────────────────────────────────────
export const getWallet = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const txs = await WalletTx.find({ userId: req.userId }).sort({ date: -1 });
    res.json({ balance: user.walletBalance, funded: user.walletFunded, transactions: txs, user: sanitizeUser(user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── POST /api/wallet/deposit — add funds + set DCA goal + seed portfolio ────────
export const addDeposit = async (req, res) => {
  try {
    const { amount, monthlyAmount, frequency, durationMonths, riskMode } = req.body;
    if (!amount || amount < 100) return res.status(400).json({ error: 'Minimum deposit ₹100' });
    if (!monthlyAmount || monthlyAmount < 100) return res.status(400).json({ error: 'Monthly investment amount required (min ₹100)' });

    const user = await User.findById(req.userId);
    user.walletBalance  += Number(amount);
    user.walletFunded    = true;
    user.hasFullAccess   = user.kycStatus === 'complete';
    user.monthlyAmount   = Number(monthlyAmount);
    user.frequency       = frequency || 'monthly';
    user.durationMonths  = Number(durationMonths) || 12;
    user.riskMode        = riskMode || 'smart';
    await user.save();

    // Record wallet deposit
    await WalletTx.create({ userId: req.userId, type: 'deposit', amount: Number(amount), method: 'UPI', status: 'success', reference: `SIM_${Date.now()}` });

    // Seed 8 mock portfolio transactions
    const existingPortfolio = await Portfolio.findOne({ userId: req.userId });
    if (!existingPortfolio) {
      const priceData    = await getBtcPriceINR();
      const currentPrice = priceData?.inr || 8500000;
      const variations   = [0.85, 0.92, 1.05, 0.78, 1.12, 0.95, 1.08, 0.88];
      for (let i = 0; i < 8; i++) {
        const pricePerBtc = Math.round(currentPrice * variations[i]);
        const btcAmount   = Number(monthlyAmount) / pricePerBtc;
        const date        = new Date();
        date.setMonth(date.getMonth() - (8 - i));
        await Transaction.create({ userId: req.userId, type: 'buy', amountINR: Number(monthlyAmount), btcAmount, pricePerBtc, date, costBasis: Number(monthlyAmount) });
      }
      const allTx         = await Transaction.find({ userId: req.userId });
      // Decrypt before summing — fields are encrypted strings in DB
      const decrypted     = Transaction.decryptAll(allTx);
      const totalInvested = decrypted.reduce((s, t) => s + (Number(t.amountINR) || 0), 0);
      const totalBtc      = decrypted.reduce((s, t) => s + (Number(t.btcAmount)  || 0), 0);
      const averageCost   = totalBtc > 0 ? totalInvested / totalBtc : 0;
      await Portfolio.create({ userId: req.userId, totalInvested, totalBtc, averageCost, currentValue: totalBtc * currentPrice, transactions: allTx.map(t => t._id) });
    }

    await log(req.userId, 'WALLET_DEPOSIT', { amount, monthlyAmount }, req);
    const portfolio = await getDecryptedPortfolio(req.userId);
    res.json({ success: true, newBalance: user.walletBalance, hasFullAccess: user.hasFullAccess, user: sanitizeUser(user), portfolio });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── GET /api/wallet/suggest — AI investment suggestion based on market ──────────
export const getInvestmentSuggestion = async (req, res) => {
  try {
    const amount       = req.query.amount || 10000;
    const priceData    = await getBtcPriceINR();
    const currentPrice = priceData?.inr || 8500000;

    let priceHistory = [];
    try {
      const { data } = await axios.get('https://api.coingecko.com/api/v3/coins/bitcoin/market_chart',
        { params: { vs_currency: 'inr', days: 7, interval: 'daily' }, timeout: 8000 });
      priceHistory = data.prices.map(([ts, p]) => ({ date: new Date(ts).toISOString().split('T')[0], price: Math.round(p) }));
    } catch {}

    const avg7d = priceHistory.length
      ? Math.round(priceHistory.reduce((s, p) => s + p.price, 0) / priceHistory.length)
      : currentPrice;

    const trend = currentPrice < avg7d * 0.97 ? 'DOWNTREND (dip — good time to buy)' : currentPrice > avg7d * 1.03 ? 'UPTREND (price high — consider smaller buy)' : 'SIDEWAYS (neutral — regular DCA recommended)';

    const suggestion = await generateInvestmentSuggestion(amount, currentPrice, avg7d, trend, priceHistory);
    res.json({ ...suggestion, currentPrice, avg7d, priceHistory });
  } catch (err) {
    // Fallback suggestion
    const priceData    = await getBtcPriceINR().catch(() => null);
    const currentPrice = priceData?.inr || 8500000;
    res.json({ suggestion: 'Regular DCA is recommended regardless of market conditions.', recommendedAmount: Number(req.query.amount) || 10000, frequency: 'monthly', riskMode: 'smart', reasoning: 'Consistent DCA reduces the impact of market volatility over time.', priceSignal: 'NEUTRAL', currentPrice, avg7d: currentPrice, priceHistory: [] });
  }
};
