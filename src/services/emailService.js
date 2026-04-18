import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS   // Gmail App Password
  }
});

export const sendOtpEmail = async (email, otp, name) => {
  await transporter.sendMail({
    from: `"BitGuard AI" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'BitGuard AI — Password Reset OTP',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#09090b;color:#f4f4f5;padding:32px;border-radius:12px;">
        <h2 style="color:#f97316;margin:0 0 8px">BitGuard AI</h2>
        <p style="color:#a1a1aa;margin:0 0 24px">Autonomous Bitcoin DCA & Tax Optimizer</p>
        <hr style="border-color:#27272a;margin-bottom:24px"/>
        <p>Hi <strong>${name}</strong>,</p>
        <p>Your OTP to reset your MPIN is:</p>
        <div style="background:#18181b;border:1px solid #3f3f46;border-radius:8px;padding:20px;text-align:center;margin:20px 0;">
          <span style="font-size:36px;font-weight:bold;letter-spacing:12px;color:#f97316;">${otp}</span>
        </div>
        <p style="color:#a1a1aa;font-size:13px;">This OTP is valid for <strong style="color:#f4f4f5">10 minutes</strong>. Do not share it with anyone.</p>
        <hr style="border-color:#27272a;margin:24px 0"/>
        <p style="color:#52525b;font-size:12px;">If you didn't request this, please ignore this email.</p>
      </div>
    `
  });
};
