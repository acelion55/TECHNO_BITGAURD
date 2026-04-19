import 'dotenv/config';
import mongoose from 'mongoose';
import { ecEncrypt } from './ecEncryption.js';
import nodemailer from 'nodemailer';

const USER_ID   = '69e401df3bf7d1ed657738fe';
const USER_NAME = 'Harsh Vardhan';
const USER_EMAIL = 'harshvardhan53394@gmail.com';

// ── Raw schemas (bypass model hooks for direct insert) ─────────────────────────
const RawTx        = mongoose.model('RawTx',        new mongoose.Schema({}, { strict: false }), 'transactions');
const RawPortfolio = mongoose.model('RawPortfolio', new mongoose.Schema({}, { strict: false }), 'portfolios');
const RawUser      = mongoose.model('RawUser',      new mongoose.Schema({}, { strict: false }), 'users');

// ── Helper: get last N Mondays from today ──────────────────────────────────────
const getMondays = (count) => {
  const mondays = [];
  const d = new Date();
  // rewind to last Monday
  d.setHours(9, 0, 0, 0);
  const day = d.getDay(); // 0=Sun, 1=Mon
  d.setDate(d.getDate() - ((day === 0 ? 6 : day - 1)));
  for (let i = 0; i < count; i++) {
    mondays.unshift(new Date(d));
    d.setDate(d.getDate() - 7);
  }
  return mondays;
};

// ── Encrypt a field with ECDH ──────────────────────────────────────────────────
const encField = (val) => {
  const r = ecEncrypt(Number(val));
  return { cipher: r.data, env: { ephemeralPub: r.ephemeralPub, iv: r.iv, tag: r.tag, data: r.data } };
};

// ── Email transporter ──────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

const base = (content) => `
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#09090b;color:#f4f4f5;padding:32px;border-radius:12px;">
  <div style="margin-bottom:24px;">
    <span style="font-size:22px;font-weight:bold;color:#f97316;">₿ BitGuard AI</span>
  </div>
  ${content}
  <hr style="border-color:#27272a;margin:24px 0"/>
  <p style="color:#52525b;font-size:12px;">This is an automated notification from BitGuard AI. Do not reply.</p>
</div>`;

// ── Main ───────────────────────────────────────────────────────────────────────
const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  // 1. Clear existing transactions + portfolio for this user
  await RawTx.deleteMany({ userId: new mongoose.Types.ObjectId(USER_ID) });
  await RawPortfolio.deleteMany({ userId: new mongoose.Types.ObjectId(USER_ID) });
  console.log('🗑️  Cleared old transactions and portfolio\n');

  // 2. Get 16 Mondays (4 months × 4 weeks)
  const mondays = getMondays(16);

  /**
   * BTC price pattern — realistic variation over 4 months
   * Mix of: dip buys (profit lots), high buys (loss lots), neutral
   * This ensures tax optimizer has both profit AND loss lots to work with
   *
   * Approx current BTC ~₹70,00,000
   * Prices range from ₹58L to ₹82L to create varied P&L per lot
   */
  const pricePattern = [
    6200000,  // Month 1 Week 1 — low (big profit lot)
    6500000,  // Month 1 Week 2 — low
    6800000,  // Month 1 Week 3 — medium
    7100000,  // Month 1 Week 4 — medium
    7400000,  // Month 2 Week 1 — rising
    7800000,  // Month 2 Week 2 — high (loss lot if current < this)
    8100000,  // Month 2 Week 3 — peak (loss lot)
    8200000,  // Month 2 Week 4 — peak (loss lot)
    7900000,  // Month 3 Week 1 — pullback
    7500000,  // Month 3 Week 2 — pullback
    7000000,  // Month 3 Week 3 — dip
    6700000,  // Month 3 Week 4 — dip (profit lot)
    6900000,  // Month 4 Week 1 — recovery
    7200000,  // Month 4 Week 2 — recovery
    7400000,  // Month 4 Week 3 — medium
    7600000,  // Month 4 Week 4 — medium (most recent)
  ];

  const AMOUNT_INR = 10000; // ₹10,000 per weekly buy
  const txIds = [];
  const txDocs = [];

  console.log('📊 Inserting 16 weekly DCA transactions (every Monday):\n');

  for (let i = 0; i < 16; i++) {
    const date        = mondays[i];
    const pricePerBtc = pricePattern[i];
    const btcAmount   = AMOUNT_INR / pricePerBtc;
    const costBasis   = AMOUNT_INR;

    // ECDH encrypt each financial field
    const amountEnc   = encField(AMOUNT_INR);
    const btcEnc      = encField(btcAmount);
    const priceEnc    = encField(pricePerBtc);
    const costEnc     = encField(costBasis);

    const doc = {
      userId:      new mongoose.Types.ObjectId(USER_ID),
      type:        'buy',
      date,
      amountINR:   amountEnc.cipher,
      btcAmount:   btcEnc.cipher,
      pricePerBtc: priceEnc.cipher,
      costBasis:   costEnc.cipher,
      enc: {
        amountINR:   amountEnc.env,
        btcAmount:   btcEnc.env,
        pricePerBtc: priceEnc.env,
        costBasis:   costEnc.env,
      }
    };

    const inserted = await RawTx.create(doc);
    txIds.push(inserted._id);
    txDocs.push({ ...doc, _id: inserted._id, _plain: { amountINR: AMOUNT_INR, btcAmount, pricePerBtc, costBasis } });

    const dateStr = date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', weekday: 'short' });
    console.log(`  ✅ Tx ${i + 1}/16 | ${dateStr} | ₹${AMOUNT_INR.toLocaleString('en-IN')} @ ₹${pricePerBtc.toLocaleString('en-IN')} | ₿${btcAmount.toFixed(6)}`);
  }

  // 3. Calculate portfolio totals
  const totalInvested = AMOUNT_INR * 16;  // ₹1,60,000
  const totalBtc      = txDocs.reduce((s, t) => s + t._plain.btcAmount, 0);
  const averageCost   = totalInvested / totalBtc;
  const currentPrice  = 7000000; // approx current price for seeding
  const currentValue  = totalBtc * currentPrice;
  const unrealizedPnL = currentValue - totalInvested;

  // 4. Insert portfolio
  await RawPortfolio.create({
    userId:       new mongoose.Types.ObjectId(USER_ID),
    totalInvested,
    totalBtc,
    averageCost,
    currentValue,
    transactions: txIds,
  });

  console.log(`\n📈 Portfolio Created:`);
  console.log(`   Total Invested : ₹${totalInvested.toLocaleString('en-IN')}`);
  console.log(`   Total BTC      : ₿${totalBtc.toFixed(6)}`);
  console.log(`   Avg Buy Price  : ₹${Math.round(averageCost).toLocaleString('en-IN')}`);
  console.log(`   Current Value  : ₹${Math.round(currentValue).toLocaleString('en-IN')}`);
  console.log(`   Unrealized P&L : ₹${Math.round(unrealizedPnL).toLocaleString('en-IN')}`);

  // 5. Update user — weekly, every Monday, ₹10,000
  await RawUser.updateOne(
    { _id: new mongoose.Types.ObjectId(USER_ID) },
    { $set: {
      name:           'Harsh Vardhan',
      monthlyAmount:  10000,
      frequency:      'weekly',
      scheduleDays:   ['MON'],
      scheduleTime:   '09:00',
      durationMonths: 12,
      riskMode:       'smart',
      walletBalance:  Math.max(0, 200000 - totalInvested), // ₹2L deposit - invested
    }}
  );
  console.log(`\n👤 User updated: weekly/Monday schedule, wallet balance adjusted`);

  // 6. Tax analysis for email
  const lots = txDocs.map((t, i) => {
    const currentLotValue = t._plain.btcAmount * currentPrice;
    const profit          = currentLotValue - t._plain.costBasis;
    const taxOnLot        = profit > 0 ? profit * 0.30 : 0;
    return { lot: i + 1, date: t.date, buyPrice: t._plain.pricePerBtc, btcAmount: t._plain.btcAmount, profit: Math.round(profit), taxOnLot: Math.round(taxOnLot), isLoss: profit < 0 };
  });

  const totalTaxDue     = lots.reduce((s, l) => s + l.taxOnLot, 0);
  const lossLots        = lots.filter(l => l.isLoss);
  const potentialSaving = lossLots.reduce((s, l) => s + Math.abs(l.profit) * 0.30, 0);

  // HIFO tax (sell highest cost basis first)
  const hifoLots        = [...lots].sort((a, b) => b.buyPrice - a.buyPrice);
  const hifoTax         = hifoLots.slice(0, 4).reduce((s, l) => s + (l.profit > 0 ? l.profit * 0.30 : 0), 0);
  const fifoTax         = [...lots].slice(0, 4).reduce((s, l) => s + (l.profit > 0 ? l.profit * 0.30 : 0), 0);
  const hifoSaving      = Math.max(0, fifoTax - hifoTax);

  console.log(`\n💰 Tax Analysis:`);
  console.log(`   Total Tax Due      : ₹${Math.round(totalTaxDue).toLocaleString('en-IN')}`);
  console.log(`   Loss Lots          : ${lossLots.length} lots`);
  console.log(`   Harvest Saving     : ₹${Math.round(potentialSaving).toLocaleString('en-IN')}`);
  console.log(`   HIFO vs FIFO Saving: ₹${Math.round(hifoSaving).toLocaleString('en-IN')}`);

  // 7. Send monthly tax saving email
  console.log(`\n📧 Sending monthly tax optimization email to ${USER_EMAIL}...`);

  const lossLotsRows = lossLots.map(l =>
    `<tr>
      <td style="padding:6px 8px;color:#a1a1aa;border-bottom:1px solid #27272a">Lot ${l.lot} — ${new Date(l.date).toLocaleDateString('en-IN')}</td>
      <td style="padding:6px 8px;color:#a1a1aa;border-bottom:1px solid #27272a;text-align:right">₹${l.buyPrice.toLocaleString('en-IN')}</td>
      <td style="padding:6px 8px;color:#f87171;border-bottom:1px solid #27272a;text-align:right">₹${Math.abs(l.profit).toLocaleString('en-IN')} loss</td>
    </tr>`
  ).join('');

  await transporter.sendMail({
    from: `"BitGuard AI" <${process.env.EMAIL_USER}>`,
    to: USER_EMAIL,
    subject: `💰 Monthly Tax Report — Save ₹${Math.round(potentialSaving).toLocaleString('en-IN')} in taxes this month`,
    html: base(`
      <h2 style="color:#f4f4f5;margin:0 0 4px">Monthly Tax Optimization Report</h2>
      <p style="color:#a1a1aa;margin:0 0 20px">Hi <strong style="color:#f4f4f5">${USER_NAME}</strong>, here's your tax summary for this month. You can save significantly by harvesting loss lots.</p>

      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <tr><td style="padding:8px 0;color:#a1a1aa;border-bottom:1px solid #27272a">Total Invested</td>
            <td style="padding:8px 0;color:#f4f4f5;font-weight:bold;border-bottom:1px solid #27272a;text-align:right">₹${totalInvested.toLocaleString('en-IN')}</td></tr>
        <tr><td style="padding:8px 0;color:#a1a1aa;border-bottom:1px solid #27272a">Current Portfolio Value</td>
            <td style="padding:8px 0;color:#f4f4f5;font-weight:bold;border-bottom:1px solid #27272a;text-align:right">₹${Math.round(currentValue).toLocaleString('en-IN')}</td></tr>
        <tr><td style="padding:8px 0;color:#a1a1aa;border-bottom:1px solid #27272a">Unrealized P&L</td>
            <td style="padding:8px 0;color:${unrealizedPnL >= 0 ? '#4ade80' : '#f87171'};font-weight:bold;border-bottom:1px solid #27272a;text-align:right">₹${Math.round(unrealizedPnL).toLocaleString('en-IN')}</td></tr>
        <tr><td style="padding:8px 0;color:#a1a1aa;border-bottom:1px solid #27272a">Total Tax Due (30% VDA)</td>
            <td style="padding:8px 0;color:#f87171;font-weight:bold;border-bottom:1px solid #27272a;text-align:right">₹${Math.round(totalTaxDue).toLocaleString('en-IN')}</td></tr>
        <tr><td style="padding:8px 0;color:#a1a1aa;border-bottom:1px solid #27272a">Loss Lots Available</td>
            <td style="padding:8px 0;color:#facc15;font-weight:bold;border-bottom:1px solid #27272a;text-align:right">${lossLots.length} lots</td></tr>
      </table>

      ${lossLots.length > 0 ? `
      <div style="background:#052e16;border:1px solid #166534;border-radius:8px;padding:16px;margin-bottom:20px;">
        <p style="color:#4ade80;font-weight:bold;font-size:15px;margin:0 0 8px">💰 Tax Harvest Opportunity</p>
        <p style="color:#a1a1aa;font-size:13px;margin:0 0 12px">You have <strong style="color:#f4f4f5">${lossLots.length} loss lots</strong>. Selling them can save you <strong style="color:#4ade80">₹${Math.round(potentialSaving).toLocaleString('en-IN')}</strong> in taxes.</p>
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <th style="padding:6px 8px;color:#52525b;text-align:left;font-size:11px;border-bottom:1px solid #27272a">LOT</th>
            <th style="padding:6px 8px;color:#52525b;text-align:right;font-size:11px;border-bottom:1px solid #27272a">BUY PRICE</th>
            <th style="padding:6px 8px;color:#52525b;text-align:right;font-size:11px;border-bottom:1px solid #27272a">UNREALIZED LOSS</th>
          </tr>
          ${lossLotsRows}
        </table>
      </div>` : ''}

      <div style="background:#1c1917;border:1px solid #44403c;border-radius:8px;padding:16px;margin-bottom:20px;">
        <p style="color:#f97316;font-weight:bold;font-size:14px;margin:0 0 8px">⚡ HIFO Method Advantage</p>
        <p style="color:#a1a1aa;font-size:13px;margin:0">By selling your <strong style="color:#f4f4f5">highest cost basis lots first</strong> (HIFO), you reduce taxable profit. BitGuard AI automatically recommends HIFO order when you sell.</p>
        ${hifoSaving > 0 ? `<p style="color:#4ade80;font-size:13px;margin:8px 0 0">Estimated HIFO saving vs FIFO: <strong>₹${Math.round(hifoSaving).toLocaleString('en-IN')}</strong></p>` : ''}
      </div>

      <div style="background:#18181b;border:1px solid #3f3f46;border-radius:8px;padding:16px;">
        <p style="color:#a1a1aa;font-size:12px;margin:0 0 8px">India VDA Tax Rules (FY 2025-26)</p>
        <ul style="color:#a1a1aa;font-size:12px;margin:0;padding-left:16px;line-height:1.8">
          <li>30% flat tax on every profitable crypto lot</li>
          <li>No loss offset between lots allowed</li>
          <li>No indexation benefit</li>
          <li>HIFO method minimizes your tax legally</li>
        </ul>
      </div>
    `)
  });

  console.log(`✅ Monthly tax optimization email sent to ${USER_EMAIL}`);
  console.log(`\n🎉 Seed complete!`);
  console.log(`   16 transactions | ₹${totalInvested.toLocaleString('en-IN')} invested | ${lossLots.length} loss lots | ₹${Math.round(potentialSaving).toLocaleString('en-IN')} harvest opportunity`);

  await mongoose.disconnect();
};

run().catch(e => { console.error('❌', e.message); process.exit(1); });
