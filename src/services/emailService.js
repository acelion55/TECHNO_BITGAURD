import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

const base = (content) => `
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#09090b;color:#f4f4f5;padding:32px;border-radius:12px;">
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:24px;">
    <span style="font-size:22px;font-weight:bold;color:#f97316;">₿ BitGuard AI</span>
  </div>
  ${content}
  <hr style="border-color:#27272a;margin:24px 0"/>
  <p style="color:#52525b;font-size:12px;">This is an automated notification from BitGuard AI. Do not reply.</p>
</div>`;

// AI Buy Action Email
export const sendAiBuyEmail = async (user, aiDecision, transaction, currentPrice) => {
  const isDip = currentPrice < (user.avgCost || currentPrice) * 0.97;
  await transporter.sendMail({
    from: `"BitGuard AI" <${process.env.EMAIL_USER}>`,
    to: user.email,
    subject: `₿ BitGuard AI ${isDip ? '⚡ Dip Buy' : 'DCA Buy'} — ₹${aiDecision.amountToInvest?.toLocaleString('en-IN')} invested`,
    html: base(`
      <h2 style="color:#f4f4f5;margin:0 0 4px">AI Agent Action</h2>
      <p style="color:#a1a1aa;margin:0 0 20px">Your autonomous DCA agent just executed a buy.</p>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;color:#a1a1aa;border-bottom:1px solid #27272a">Action</td>
            <td style="padding:8px 0;color:#f97316;font-weight:bold;border-bottom:1px solid #27272a">${isDip ? '⚡ Smart Dip Buy (1.5x)' : '📅 Regular DCA Buy'}</td></tr>
        <tr><td style="padding:8px 0;color:#a1a1aa;border-bottom:1px solid #27272a">Amount Invested</td>
            <td style="padding:8px 0;color:#f4f4f5;font-weight:bold;border-bottom:1px solid #27272a">₹${aiDecision.amountToInvest?.toLocaleString('en-IN')}</td></tr>
        <tr><td style="padding:8px 0;color:#a1a1aa;border-bottom:1px solid #27272a">BTC Bought</td>
            <td style="padding:8px 0;color:#f4f4f5;border-bottom:1px solid #27272a">₿${transaction?.btcAmount?.toFixed(6)}</td></tr>
        <tr><td style="padding:8px 0;color:#a1a1aa;border-bottom:1px solid #27272a">Price at Buy</td>
            <td style="padding:8px 0;color:#f4f4f5;border-bottom:1px solid #27272a">₹${currentPrice?.toLocaleString('en-IN')}</td></tr>
        <tr><td style="padding:8px 0;color:#a1a1aa;border-bottom:1px solid #27272a">Next DCA Date</td>
            <td style="padding:8px 0;color:#f4f4f5;border-bottom:1px solid #27272a">${aiDecision.nextDcaDate}</td></tr>
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
  });
};

// OTP Email
export const sendOtpEmail = async (email, otp, name) => {
  await transporter.sendMail({
    from: `"BitGuard AI" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'BitGuard AI — Password Reset OTP',
    html: base(`
      <p>Hi <strong>${name}</strong>,</p>
      <p>Your OTP to reset your MPIN is:</p>
      <div style="background:#18181b;border:1px solid #3f3f46;border-radius:8px;padding:20px;text-align:center;margin:20px 0;">
        <span style="font-size:36px;font-weight:bold;letter-spacing:12px;color:#f97316;">${otp}</span>
      </div>
      <p style="color:#a1a1aa;font-size:13px;">Valid for <strong style="color:#f4f4f5">10 minutes</strong>. Do not share.</p>
    `)
  });
};

// Welcome Email
export const sendWelcomeEmail = async (user) => {
  await transporter.sendMail({
    from: `"BitGuard AI" <${process.env.EMAIL_USER}>`,
    to: user.email,
    subject: '🚀 Welcome to BitGuard AI — Your DCA Agent is Active',
    html: base(`
      <h2 style="color:#f4f4f5;margin:0 0 8px">Welcome, ${user.name}! 🎉</h2>
      <p style="color:#a1a1aa;margin:0 0 20px">Your autonomous Bitcoin DCA agent is now active.</p>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;color:#a1a1aa;border-bottom:1px solid #27272a">Monthly Goal</td>
            <td style="padding:8px 0;color:#f97316;font-weight:bold;border-bottom:1px solid #27272a">₹${user.monthlyAmount?.toLocaleString('en-IN')}</td></tr>
        <tr><td style="padding:8px 0;color:#a1a1aa;border-bottom:1px solid #27272a">Risk Mode</td>
            <td style="padding:8px 0;color:#f4f4f5;border-bottom:1px solid #27272a">${user.riskMode === 'smart' ? '⚡ Smart Dip' : '🛡️ Conservative'}</td></tr>
        <tr><td style="padding:8px 0;color:#a1a1aa">Duration</td>
            <td style="padding:8px 0;color:#f4f4f5">${user.durationMonths} months</td></tr>
      </table>
      <p style="color:#a1a1aa;margin-top:20px;font-size:13px;">You will receive email notifications every time the AI agent takes an action on your behalf.</p>
    `)
  });
};
