import { getBtcPriceINR } from '../services/priceService.js';

const FALLBACK_PRICE = { inr: 8500000, usd: 102000 };

// GET /api/price/btc
export const getBtcPrice = async (req, res) => {
  try {
    const price = await getBtcPriceINR();
    if (!price) return res.json({ ...FALLBACK_PRICE, isFallback: true });
    res.json({ ...price, isFallback: false });
  } catch (err) {
    res.json({ ...FALLBACK_PRICE, isFallback: true });
  }
};
