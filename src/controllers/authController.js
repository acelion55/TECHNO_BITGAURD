import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Portfolio from '../models/Portfolio.js';
import Transaction from '../models/Transaction.js';
import { getBtcPriceINR } from '../services/priceService.js';
import { sendOtpEmail, sendWelcomeEmail } from '../services/emailService.js';
import { log, ACTIONS } from '../services/auditService.js';
import { encrypt } from '../utils/encryption.js';
import {
  generateAccessToken, generateRefreshToken,
  verifyRefreshToken, hashToken, compareToken,
  setAuthCookies, clearAuthCookies
} from '../utils/jwt.js';

// ── POST /api/auth/signup ──────────────────────────────────────────────────────
export const signup = async (req, res) => {
  try {
    const { name, email, phone, mpin, pan, aadhaar, bankAccount, ifsc,
            monthlyAmount, frequency, durationMonths, riskMode } = req.body;

    if (!name || !email || !phone || !mpin)
      return res.status(400).json({ error: 'name, email, phone and mpin are required' });

    if (mpin.length !== 6 || !/^\d{6}$/.test(mpin))
      return res.status(400).json({ error: 'MPIN must be exactly 6 digits' });

    const exists = await User.findOne({ $or: [{ email }, { phone }] });
    if (exists) return res.status(409).json({ error: 'Email or phone already registered' });

    const user = await User.create({
      name, email, phone, mpin,
      pan: pan || null,
      aadhaar: aadhaar ? aadhaar.slice(-4).padStart(12, '*') : null,
      bankAccount: bankAccount || null,
      ifsc: ifsc || null,
      monthlyAmount: monthlyAmount || 10000,
      frequency: frequency || 'monthly',
      durationMonths: durationMonths || 12,
      riskMode: riskMode || 'smart',
      isVerified: true
    });

    await seedMockData(user._id, user.monthlyAmount);

    const accessToken  = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);
    user.refreshToken  = await hashToken(refreshToken);
    await user.save();

    setAuthCookies(res, accessToken, refreshToken);

    // Non-blocking: welcome email + audit log
    sendWelcomeEmail(user).catch(e => console.error('Welcome email failed:', e.message));
    log(user._id, ACTIONS.SIGNUP, { email, name, riskMode: user.riskMode }, req);

    const portfolio = await Portfolio.findOne({ userId: user._id }).populate('transactions');
    res.status(201).json({ message: 'Account created successfully', user: sanitizeUser(user), portfolio });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── POST /api/auth/login ───────────────────────────────────────────────────────
export const login = async (req, res) => {
  try {
    const { email, mpin } = req.body;
    if (!email || !mpin) return res.status(400).json({ error: 'Email and MPIN required' });

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: 'Invalid email or MPIN' });

    const valid = await user.compareMpin(mpin);
    if (!valid) {
      log(user._id, ACTIONS.LOGIN, { success: false, reason: 'wrong_mpin' }, req);
      return res.status(401).json({ error: 'Invalid email or MPIN' });
    }

    const accessToken  = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);
    user.refreshToken  = await hashToken(refreshToken);
    await user.save();

    setAuthCookies(res, accessToken, refreshToken);
    log(user._id, ACTIONS.LOGIN, { success: true, email }, req);

    const portfolio = await Portfolio.findOne({ userId: user._id }).populate('transactions');
    res.json({ message: 'Login successful', user: sanitizeUser(user), portfolio });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── POST /api/auth/refresh ─────────────────────────────────────────────────────
export const refresh = async (req, res) => {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) return res.status(401).json({ error: 'No refresh token' });

    const decoded = verifyRefreshToken(token);
    const user    = await User.findById(decoded.userId);
    if (!user || !user.refreshToken)
      return res.status(401).json({ error: 'Invalid session' });

    const valid = await compareToken(token, user.refreshToken);
    if (!valid) {
      user.refreshToken = null;
      await user.save();
      clearAuthCookies(res);
      return res.status(401).json({ error: 'Token reuse detected. Please login again.' });
    }

    const newAccessToken  = generateAccessToken(user._id);
    const newRefreshToken = generateRefreshToken(user._id);
    user.refreshToken     = await hashToken(newRefreshToken);
    await user.save();

    setAuthCookies(res, newAccessToken, newRefreshToken);
    res.json({ message: 'Token refreshed' });
  } catch (err) {
    clearAuthCookies(res);
    res.status(401).json({ error: 'Session expired. Please login again.' });
  }
};

// ── POST /api/auth/logout ──────────────────────────────────────────────────────
export const logout = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (user) {
      log(user._id, ACTIONS.LOGOUT, {}, req);
      user.refreshToken = null;
      await user.save();
    }
    clearAuthCookies(res);
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── POST /api/auth/forgot-password ────────────────────────────────────────────
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const user = await User.findOne({ email });
    if (!user) return res.json({ message: 'If this email exists, an OTP has been sent.' });

    const otp      = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp       = await bcrypt.hash(otp, 10);
    user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    await sendOtpEmail(email, otp, user.name);
    log(user._id, ACTIONS.FORGOT_PASSWORD, { email }, req);
    res.json({ message: 'OTP sent to your email.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── POST /api/auth/reset-password ─────────────────────────────────────────────
export const resetPassword = async (req, res) => {
  try {
    const { email, otp, newMpin } = req.body;
    if (!email || !otp || !newMpin)
      return res.status(400).json({ error: 'email, otp and newMpin required' });

    if (!/^\d{6}$/.test(newMpin))
      return res.status(400).json({ error: 'New MPIN must be 6 digits' });

    const user = await User.findOne({ email });
    if (!user || !user.otp || !user.otpExpiry)
      return res.status(400).json({ error: 'Invalid or expired OTP' });

    if (new Date() > user.otpExpiry)
      return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });

    const validOtp = await bcrypt.compare(otp, user.otp);
    if (!validOtp) return res.status(400).json({ error: 'Invalid OTP' });

    user.mpin         = newMpin;
    user.otp          = null;
    user.otpExpiry    = null;
    user.refreshToken = null;
    await user.save();

    log(user._id, ACTIONS.RESET_PASSWORD, { email }, req);
    clearAuthCookies(res);
    res.json({ message: 'MPIN reset successfully. Please login again.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── GET /api/auth/me ───────────────────────────────────────────────────────────
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const portfolio = await Portfolio.findOne({ userId: user._id }).populate('transactions');
    res.json({ user: sanitizeUser(user), portfolio });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Helpers ────────────────────────────────────────────────────────────────────
const sanitizeUser = (user) => ({
  _id: user._id, name: user.name, email: user.email, phone: user.phone,
  pan: user.pan, aadhaar: user.aadhaar, monthlyAmount: user.monthlyAmount,
  frequency: user.frequency, durationMonths: user.durationMonths,
  riskMode: user.riskMode, isVerified: user.isVerified, createdAt: user.createdAt
});

const seedMockData = async (userId, monthlyAmount) => {
  const priceData    = await getBtcPriceINR();
  const currentPrice = priceData?.inr || 8500000;
  const variations   = [0.85, 0.92, 1.05, 0.78, 1.12, 0.95, 1.08, 0.88];

  for (let i = 0; i < 8; i++) {
    const pricePerBtc = Math.round(currentPrice * variations[i]);
    const btcAmount   = monthlyAmount / pricePerBtc;
    const date        = new Date();
    date.setMonth(date.getMonth() - (8 - i));
    const txPayload = { userId: userId.toString(), type: 'buy', amountINR: monthlyAmount, btcAmount, pricePerBtc, date: date.toISOString(), costBasis: monthlyAmount };
    await Transaction.create({
      userId, type: 'buy', amountINR: monthlyAmount, btcAmount,
      pricePerBtc, date, costBasis: monthlyAmount,
      encryptedData: encrypt(txPayload)
    });
  }

  const allTx         = await Transaction.find({ userId });
  const totalInvested = allTx.reduce((s, t) => s + t.amountINR, 0);
  const totalBtc      = allTx.reduce((s, t) => s + t.btcAmount, 0);

  await Portfolio.create({
    userId, totalInvested, totalBtc,
    averageCost: totalInvested / totalBtc,
    currentValue: totalBtc * currentPrice,
    transactions: allTx.map((t) => t._id)
  });
};
