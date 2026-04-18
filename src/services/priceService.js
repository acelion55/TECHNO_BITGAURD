import axios from 'axios';

// Source 1: Binance (no key, no rate limit)
const getBtcFromBinance = async () => {
  const [btcRes, fxRes] = await Promise.all([
    axios.get('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT', { timeout: 8000 }),
    axios.get('https://api.exchangerate-api.com/v4/latest/USD', { timeout: 8000 })
  ]);
  const usd     = parseFloat(btcRes.data.price);
  const inrRate = fxRes.data.rates.INR;
  if (!usd || !inrRate) throw new Error('Invalid Binance/FX data');
  return { inr: Math.round(usd * inrRate), usd: Math.round(usd) };
};

// Source 2: CoinGecko (free tier)
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

// Source 3: Coinbase (no key needed)
const getBtcFromCoinbase = async () => {
  const [usdRes, inrRes] = await Promise.all([
    axios.get('https://api.coinbase.com/v2/prices/BTC-USD/spot', { timeout: 8000 }),
    axios.get('https://api.coinbase.com/v2/prices/BTC-INR/spot', { timeout: 8000 })
  ]);
  const usd = Math.round(parseFloat(usdRes.data.data.amount));
  const inr = Math.round(parseFloat(inrRes.data.data.amount));
  if (!usd || !inr) throw new Error('Invalid Coinbase response');
  return { inr, usd };
};

// Source 4: Kraken (no key needed)
const getBtcFromKraken = async () => {
  const [tickerRes, fxRes] = await Promise.all([
    axios.get('https://api.kraken.com/0/public/Ticker?pair=XBTUSD', { timeout: 8000 }),
    axios.get('https://api.exchangerate-api.com/v4/latest/USD', { timeout: 8000 })
  ]);
  const usd     = Math.round(parseFloat(tickerRes.data.result.XXBTZUSD.c[0]));
  const inrRate = fxRes.data.rates.INR;
  if (!usd || !inrRate) throw new Error('Invalid Kraken data');
  return { inr: Math.round(usd * inrRate), usd };
};

export const getBtcPriceINR = async () => {
  const sources = [
    { name: 'Binance',   fn: getBtcFromBinance },
    { name: 'Coinbase',  fn: getBtcFromCoinbase },
    { name: 'Kraken',    fn: getBtcFromKraken },
    { name: 'CoinGecko', fn: getBtcFromCoinGecko },
  ];

  for (const source of sources) {
    try {
      const price = await source.fn();
      console.log(`BTC price from ${source.name}: ₹${price.inr} / $${price.usd}`);
      return price;
    } catch (err) {
      console.warn(`${source.name} failed: ${err.message}`);
    }
  }

  console.error('All price sources failed — returning null');
  return null;
};
