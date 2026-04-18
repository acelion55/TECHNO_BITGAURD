import express from 'express';
import rateLimit from 'express-rate-limit';
import { signup, login, refresh, logout, forgotPassword, resetPassword, getMe } from '../controllers/authController.js';
import { saveGoal, getUser } from '../controllers/userController.js';
import { simulateBuy, getPortfolio } from '../controllers/dcaController.js';
import { getTaxReport, simulateSellTax } from '../controllers/taxController.js';
import { getBtcPrice } from '../controllers/priceController.js';
import { chat } from '../controllers/chatController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Rate limiters
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 10,
  message: { error: 'Too many login attempts. Try again after 15 minutes.' }
});

const otpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 hour
  max: 5,
  message: { error: 'Too many OTP requests. Try again after 1 hour.' }
});

// ── Auth (public) ──────────────────────────────────────────────────────────────
router.post('/auth/signup',          signup);
router.post('/auth/login',           loginLimiter, login);
router.post('/auth/refresh',         refresh);
router.post('/auth/logout',          protect, logout);
router.post('/auth/forgot-password', otpLimiter, forgotPassword);
router.post('/auth/reset-password',  resetPassword);
router.get('/auth/me',               protect, getMe);

// ── User (protected) ──────────────────────────────────────────────────────────
router.post('/user/goal',            protect, saveGoal);
router.get('/user/:email',           protect, getUser);

// ── Portfolio & DCA (protected) ───────────────────────────────────────────────
router.get('/portfolio/:userId',     protect, getPortfolio);
router.post('/dca/simulate-buy',     protect, simulateBuy);

// ── Tax (protected) ───────────────────────────────────────────────────────────
router.get('/tax/report/:userId',    protect, getTaxReport);
router.post('/tax/simulate-sell',    protect, simulateSellTax);

// ── Chat (protected) ──────────────────────────────────────────────────────────
router.post('/chat',                 protect, chat);

// ── Price (public) ────────────────────────────────────────────────────────────
router.get('/price/btc',             getBtcPrice);

export default router;
