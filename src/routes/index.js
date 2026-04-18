import express from 'express';
import rateLimit from 'express-rate-limit';
import { signup, login, refresh, logout, forgotPassword, resetPassword, getMe } from '../controllers/authController.js';
import { saveGoal, getUser } from '../controllers/userController.js';
import { simulateBuy, getPortfolio } from '../controllers/dcaController.js';
import { getTaxReport, simulateSellTax } from '../controllers/taxController.js';
import { getBtcPrice } from '../controllers/priceController.js';
import { chat } from '../controllers/chatController.js';
import { verifyPan, verifyAadhaar, sendEmailOtp, verifyEmailOtp, saveBankDetails, completeKyc, getWallet, addDeposit, getInvestmentSuggestion } from '../controllers/kycController.js';
import { protect } from '../middleware/auth.js';
import { requireFullAccess } from '../middleware/fullAccess.js';

const router = express.Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: 'Too many attempts. Try after 15 minutes.' } });
const otpLimiter   = rateLimit({ windowMs: 60 * 60 * 1000, max: 5,  message: { error: 'Too many OTP requests. Try after 1 hour.' } });
const kycLimiter   = rateLimit({ windowMs: 60 * 60 * 1000, max: 20, message: { error: 'Too many KYC attempts.' } });

// ── Auth (public) ──────────────────────────────────────────────────────────────
router.post('/auth/signup',          signup);
router.post('/auth/login',           loginLimiter, login);
router.post('/auth/refresh',         refresh);
router.post('/auth/logout',          protect, logout);
router.post('/auth/forgot-password', otpLimiter, forgotPassword);
router.post('/auth/reset-password',  resetPassword);
router.get('/auth/me',               protect, getMe);

// ── KYC (public — no auth needed, user doesn't exist yet) ─────────────────────
router.post('/kyc/pan',              kycLimiter, verifyPan);
router.post('/kyc/aadhaar',          kycLimiter, verifyAadhaar);
router.post('/kyc/send-otp',         otpLimiter, sendEmailOtp);
router.post('/kyc/verify-otp',       kycLimiter, verifyEmailOtp);
router.post('/kyc/bank',             kycLimiter, saveBankDetails);
router.post('/kyc/complete',         kycLimiter, completeKyc);

// Wallet (protected)
router.get('/wallet',                protect, getWallet);
router.post('/wallet/deposit',       protect, addDeposit);
router.get('/wallet/suggest',        protect, getInvestmentSuggestion);

// ── User (protected) ──────────────────────────────────────────────────────────
router.post('/user/goal',            protect, saveGoal);
router.get('/user/:email',           protect, getUser);

// ── Portfolio (protected, full access required) ───────────────────────────────
router.get('/portfolio',             protect, requireFullAccess, getPortfolio);

// ── DCA (protected + full access) ─────────────────────────────────────────────
router.post('/dca/simulate-buy',     protect, requireFullAccess, simulateBuy);

// ── Tax (protected + full access) ─────────────────────────────────────────────
router.get('/tax/report',            protect, requireFullAccess, getTaxReport);
router.post('/tax/simulate-sell',    protect, requireFullAccess, simulateSellTax);

// ── Chat (protected + full access) ────────────────────────────────────────────
router.post('/chat',                 protect, requireFullAccess, chat);

// ── Price (public) ────────────────────────────────────────────────────────────
router.get('/price/btc',             getBtcPrice);

export default router;
