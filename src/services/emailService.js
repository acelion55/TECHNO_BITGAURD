import nodemailer from 'nodemailer';

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

const row = (label, value, valueColor = '#f4f4f5') =>
  `<tr>
    <td style="padding:8px 0;color:#a1a1aa;border-bottom:1px solid #27272a">${label}</td>
    <td style="padding:8px 0;color:${valueColor};font-weight:bold;border-bottom:1px solid #27272a;text-align:right">${value}</td>
  </tr>`;

// ── 1. Welcome Email ───────────────────────────────────────────────────────────
export const sendWelcomeEmail = async (user) => {
  await transporter.sendMail({
    from: `"BitGuard AI" <${process.env.EMAIL_USER}>`,
    to: user.email,
    subject: '🚀 Welcome to BitGuard AI — Your DCA Agent is Ready',
    html: base(`
      <h2 style="color:#f4f4f5;margin:0 0 8px">Welcome, ${user.name}! 🎉</h2>
      <p style="color:#a1a1aa;margin:0 0 20px">Your KYC is complete. Add funds to activate your autonomous Bitcoin DCA agent.</p>
      <div style="background:#18181b;border:1px solid #3f3f46;border-radius:8px;padding:16px;margin-top:12px;">
        <p style="color:#a1a1aa;font-size:12px;margin:0 0 6px">Next Step</p>
        <p style="color:#f97316;margin:0;font-size:14px;font-weight:bold;">Add funds to your wallet to start investing in Bitcoin automatically.</p>
      </div>
    `)
  }).catch(e => console.error('Welcome email failed:', e.message));
};

// ── 2. OTP Email ───────────────────────────────────────────────────────────────
export const sendOtpEmail = async (email, otp, name) => {
  await transporter.sendMail({
    from: `"BitGuard AI" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'BitGuard AI — Your Password Reset OTP',
    html: base(`
      <p style="color:#f4f4f5">Hi <strong>${name}</strong>,</p>
      <p style="color:#a1a1aa">Your OTP to reset your MPIN is:</p>
      <div style="background:#18181b;border:1px solid #3f3f46;border-radius:8px;padding:20px;text-align:center;margin:20px 0;">
        <span style="font-size:36px;font-weight:bold;letter-spacing:12px;color:#f97316;">${otp}</span>
      </div>
      <p style="color:#a1a1aa;font-size:13px;">Valid for <strong style="color:#f4f4f5">10 minutes</strong>. Do not share this OTP with anyone.</p>
    `)
  });
};

// ── 3. Wallet Deposit Confirmation ────────────────────────────────────────────
export const sendDepositEmail = async (user, amount, newBalance) => {
  await transporter.sendMail({
    from: `"BitGuard AI" <${process.env.EMAIL_USER}>`,
    to: user.email,
    subject: `✅ Wallet Funded — ₹${Number(amount).toLocaleString('en-IN')} added to BitGuard AI`,
    html: base(`
      <h2 style="color:#f4f4f5;margin:0 0 4px">Wallet Deposit Successful</h2>
      <p style="color:#a1a1aa;margin:0 0 20px">Your wallet has been funded and your DCA agent is now active.</p>
      <table style="width:100%;border-collapse:collapse;">
        ${row('Amount Deposited', `₹${Number(amount).toLocaleString('en-IN')}`, '#4ade80')}
        ${row('New Wallet Balance', `₹${Number(newBalance).toLocaleString('en-IN')}`)}
        ${row('DCA Frequency', user.frequency)}
        ${row('Monthly Goal', `₹${user.monthlyAmount?.toLocaleString('en-IN')}`)}
        ${row('Risk Mode', user.riskMode === 'smart' ? '⚡ Smart Dip' : '🛡️ Conservative')}
      </table>
      <div style="background:#052e16;border:1px solid #166534;border-radius:8px;padding:16px;margin-top:20px;">
        <p style="color:#4ade80;margin:0;font-size:13px;">🤖 Your AI DCA agent is now active and monitoring BTC price 24/7.</p>
      </div>
    `)
  }).catch(e => console.error('Deposit email failed:', e.message));
};

// ── 4. AI Buy Executed ─────────────────────────────────────────────────────────
export const sendAiBuyEmail = async (user, aiDecision, transaction, currentPrice) => {
  const isDip = currentPrice < (user.avgCost || currentPrice) * 0.97;
  await transporter.sendMail({
    from: `"BitGuard AI" <${process.env.EMAIL_USER}>`,
    to: user.email,
    subject: `₿ AI Buy Executed — ₹${aiDecision.amountToInvest?.toLocaleString('en-IN')} invested in BTC`,
    html: base(`
      <h2 style="color:#f4f4f5;margin:0 0 4px">AI Agent Executed a Buy</h2>
      <p style="color:#a1a1aa;margin:0 0 20px">Your autonomous DCA agent just purchased Bitcoin on your behalf.</p>
      <table style="width:100%;border-collapse:collapse;">
        ${row('Action', isDip ? '⚡ Smart Dip Buy (1.5x)' : '📅 Regular DCA Buy', '#f97316')}
        ${row('Amount Invested', `₹${aiDecision.amountToInvest?.toLocaleString('en-IN')}`, '#4ade80')}
        ${row('BTC Bought', `₿${transaction?.btcAmount?.toFixed(6)}`)}
        ${row('Price at Buy', `₹${currentPrice?.toLocaleString('en-IN')}`)}
        ${row('Price Signal', aiDecision.priceSignal)}
        ${row('Next DCA Date', aiDecision.nextDcaDate)}
      </table>
      <div style="background:#18181b;border:1px solid #3f3f46;border-radius:8px;padding:16px;margin-top:20px;">
        <p style="color:#a1a1aa;font-size:12px;margin:0 0 6px">AI Reasoning</p>
        <p style="color:#f4f4f5;margin:0;font-size:14px;">${aiDecision.reasoning}</p>
      </div>
      ${aiDecision.taxSavingsSuggestion ? `
      <div style="background:#052e16;border:1px solid #166534;border-radius:8px;padding:16px;margin-top:12px;">
        <p style="color:#4ade80;margin:0;font-size:13px;">💰 ${aiDecision.taxSavingsSuggestion}</p>
      </div>` : ''}
    `)
  }).catch(e => console.error('Buy email failed:', e.message));
};

// ── 5. AI Hold Decision ────────────────────────────────────────────────────────
export const sendAiHoldEmail = async (user, aiDecision, currentPrice) => {
  await transporter.sendMail({
    from: `"BitGuard AI" <${process.env.EMAIL_USER}>`,
    to: user.email,
    subject: `⏸️ AI Decision: Hold — BTC at ₹${currentPrice?.toLocaleString('en-IN')}`,
    html: base(`
      <h2 style="color:#f4f4f5;margin:0 0 4px">AI Agent Decision: Hold</h2>
      <p style="color:#a1a1aa;margin:0 0 20px">Your AI agent analyzed the market and decided to skip this buy cycle.</p>
      <table style="width:100%;border-collapse:collapse;">
        ${row('Decision', '⏸️ Hold — No Buy', '#facc15')}
        ${row('Current BTC Price', `₹${currentPrice?.toLocaleString('en-IN')}`)}
        ${row('Price Signal', aiDecision.priceSignal)}
        ${row('Next DCA Date', aiDecision.nextDcaDate || 'TBD')}
      </table>
      <div style="background:#18181b;border:1px solid #3f3f46;border-radius:8px;padding:16px;margin-top:20px;">
        <p style="color:#a1a1aa;font-size:12px;margin:0 0 6px">AI Reasoning</p>
        <p style="color:#f4f4f5;margin:0;font-size:14px;">${aiDecision.reasoning}</p>
      </div>
      <p style="color:#a1a1aa;font-size:13px;margin-top:16px;">Your wallet balance is unchanged. The agent will re-evaluate on the next scheduled cycle.</p>
    `)
  }).catch(e => console.error('Hold email failed:', e.message));
};

// ── 6. Low Wallet Balance Warning ─────────────────────────────────────────────
export const sendLowBalanceEmail = async (user, walletBalance, required) => {
  await transporter.sendMail({
    from: `"BitGuard AI" <${process.env.EMAIL_USER}>`,
    to: user.email,
    subject: `⚠️ Low Wallet Balance — Add funds to continue DCA`,
    html: base(`
      <h2 style="color:#f4f4f5;margin:0 0 4px">Wallet Balance Too Low</h2>
      <p style="color:#a1a1aa;margin:0 0 20px">Your AI agent tried to execute a buy but your wallet doesn't have enough funds.</p>
      <table style="width:100%;border-collapse:collapse;">
        ${row('Current Balance', `₹${Number(walletBalance).toLocaleString('en-IN')}`, '#f87171')}
        ${row('Amount Required', `₹${Number(required).toLocaleString('en-IN')}`)}
        ${row('Shortfall', `₹${(Number(required) - Number(walletBalance)).toLocaleString('en-IN')}`, '#f87171')}
      </table>
      <div style="background:#450a0a;border:1px solid #991b1b;border-radius:8px;padding:16px;margin-top:20px;">
        <p style="color:#f87171;margin:0;font-size:13px;">⚠️ Please add funds to your wallet to resume automated DCA investing.</p>
      </div>
    `)
  }).catch(e => console.error('Low balance email failed:', e.message));
};

// ── 7. Goal / Schedule Updated ────────────────────────────────────────────────
export const sendGoalUpdatedEmail = async (user) => {
  const scheduleDetail = user.frequency === 'daily'
    ? `Every day at ${user.scheduleTime} IST`
    : user.frequency === 'weekly'
    ? `Every ${(user.scheduleDays || []).join(', ')}`
    : `${user.scheduleDate}${user.scheduleDate === 1 ? 'st' : user.scheduleDate === 2 ? 'nd' : user.scheduleDate === 3 ? 'rd' : 'th'} of every month`;

  await transporter.sendMail({
    from: `"BitGuard AI" <${process.env.EMAIL_USER}>`,
    to: user.email,
    subject: `⚙️ DCA Strategy Updated — BitGuard AI`,
    html: base(`
      <h2 style="color:#f4f4f5;margin:0 0 4px">Your DCA Strategy Has Been Updated</h2>
      <p style="color:#a1a1aa;margin:0 0 20px">Your AI agent will follow the new schedule from the next cycle.</p>
      <table style="width:100%;border-collapse:collapse;">
        ${row('Investment Amount', `₹${user.monthlyAmount?.toLocaleString('en-IN')}`, '#f97316')}
        ${row('Frequency', user.frequency)}
        ${row('Schedule', scheduleDetail)}
        ${row('Duration', `${user.durationMonths} months`)}
        ${row('Risk Mode', user.riskMode === 'smart' ? '⚡ Smart Dip' : '🛡️ Conservative')}
      </table>
      <div style="background:#18181b;border:1px solid #3f3f46;border-radius:8px;padding:16px;margin-top:20px;">
        <p style="color:#a1a1aa;margin:0;font-size:13px;">Changes are live immediately. Your agent will use this schedule for all future buys.</p>
      </div>
    `)
  }).catch(e => console.error('Goal update email failed:', e.message));
};
