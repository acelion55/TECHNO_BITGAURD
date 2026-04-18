import express from 'express';
import { saveGoal, getUser } from '../controllers/userController.js';
import { simulateBuy, getPortfolio } from '../controllers/dcaController.js';
import { getTaxReport, simulateSellTax } from '../controllers/taxController.js';
import { getBtcPrice } from '../controllers/priceController.js';
import { chat } from '../controllers/chatController.js';

const router = express.Router();

// User
router.post('/user/goal', saveGoal);
router.get('/user/:email', getUser);

// Portfolio & DCA
router.get('/portfolio/:userId', getPortfolio);
router.post('/dca/simulate-buy', simulateBuy);

// Tax
router.get('/tax/report/:userId', getTaxReport);
router.post('/tax/simulate-sell', simulateSellTax);

// Price
router.get('/price/btc', getBtcPrice);

// Chat
router.post('/chat', chat);

export default router;
