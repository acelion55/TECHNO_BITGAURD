import axios from 'axios';

// Binance: free, no key, no rate limit
const getBtcFromBinance = async () => {
  const [btcRes, fxRes] = await Promise.all([
    axios.get('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT', { timeout: 6000 }),
    axios.get('https://api.exchangerate-api.com/v4/latest/USD', { timeout: 6000 })
  ]);
  const usd = parseFloat(btcRes.data.price);
  const inrRate = fxRes.data.rates.INR;
  const inr = Math.round(usd * inrRate);
  return { inr, usd: Math.round(usd) };
};

// CoinGecko: fallback
const getBtcFromCoinGecko = async () => {
  const { data } = await axios.get(
    'https://api.coingecko.com/api/v3/simple/price',
    { params: { ids: 'bitcoin', vs_currencies: 'inr,usd' }, timeout: 8000 }
  );
  const inr = data?.bitcoin?.inr;
  const usd = data?.bitcoin?.usd;
  if (!inr || !usd) throw new Error('Invalid CoinGecko response');
  return { inr, usd };
};

export const getBtcPriceINR = async () => {
  // Try Binance first (most reliable, no rate limit)
  try {
    const price = await getBtcFromBinance();
    console.log(`BTC price from Binance: ₹${price.inr} / $${price.usd}`);
    return price;
  } catch (err) {
    console.warn('Binance failed:', err.message);
  }

  // Try CoinGecko as fallback
  try {
    const price = await getBtcFromCoinGecko();
    console.log(`BTC price from CoinGecko: ₹${price.inr} / $${price.usd}`);
    return price;
  } catch (err) {
    console.warn('CoinGecko failed:', err.message);
  }

  // Both failed
  console.error('All price sources failed — returning null');
  return null;
};
