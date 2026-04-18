import { GoogleGenerativeAI } from '@google/generative-ai';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import WalletTx from '../models/WalletTx.js';
import { encrypt, decrypt } from '../utils/encryption.js';
import { log, ACTIONS } from '../services/auditService.js';
import { sendOtpEmail } from '../services/emailService.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ── Fuzzy name match (handles minor spelling differences) ──────────────────────
const namesMatch = (name1, name2) => {
  const normalize = (s) => s?.toLowerCase().replace(/[^a-z\s]/g, '').trim().split(/\s+/).sort().join(' ');
  const n1 = normalize(name1);
  const n2 = normalize(name2);
  if (n1 === n2) return true;
  // Allow 1 word difference (middle name missing etc.)
  const words1 = n1.split(' ');
  const words2 = n2.split(' ');
  const common = words1.filter(w => words2.includes(w));
  return common.length >= Math.min(words1.length, words2.length) - 1 && common.length >= 2;
};

// ── STEP 1: POST /api/kyc/pan ──────────────────────────────────────────────────
// Fetch mock PAN data via Gemini
export const verifyPan = async (req, res) => {
  try {
    const { pan } = req.body;
    if (!pan || !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan.toUpperCase()))
      return res.status(400).json({ error: 'Invalid PAN format. Example: ABCDE1234F' });

    const panUpper = pan.toUpperCase();

    // Check if PAN already registered
    const existing = await User.find({});
    for (const u of existing) {
      try {
        const decPan = u.decryptKyc('pan');
        if (decPan === panUpper) return res.status(409).json({ error: 'PAN already registered' });
      } catch {}
    }

    // Use Gemini to generate realistic mock KYC data
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { responseMimeType: 'application/json' }
    });

    const prompt = `Generate realistic Indian KYC mock data for PAN: ${panUpper}
Return ONLY valid JSON:
{
  "fullName": "realistic Indian full name (3 words)",
  "dob": "YYYY-MM-DD (between 1970-2000)",
  "fatherName": "realistic Indian father name",
  "gender": "Male or Female",
  "panType": "Individual",
  "address": "realistic Indian city and state"
}`;

    const result  = await model.generateContent(prompt);
    const kycData = JSON.parse(result.response.text());

    // Encrypt and store KYC data temporarily in session-like field
    const encKyc = encrypt({ ...kycData, pan: panUpper });

    // Create a temporary user record (kycStatus: pan_verified)
    // Or update if session exists via temp token
    res.json({
      success: true,
      kycData: {
        fullName:   kycData.fullName,
        dob:        kycData.dob,
        fatherName: kycData.fatherName,
        gender:     kycData.gender,
        address:    kycData.address
      },
      encryptedSession: encKyc  // sent back to frontend, returned in step 2
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── STEP 2: POST /api/kyc/aadhaar ─────────────────────────────────────────────
// Verify Aadhaar + name match with PAN data
export const verifyAadhaar = async (req, res) => {
  try {
    const { aadhaar, encryptedSession } = req.body;

    if (!aadhaar || !/^\d{12}$/.test(aadhaar))
      return res.status(400).json({ error: 'Aadhaar must be 12 digits' });

    if (!encryptedSession?.iv)
      return res.status(400).json({ error: 'Invalid session. Please restart KYC.' });

    // Decrypt PAN session
    const panSession = decrypt(encryptedSession);

    // Use Gemini to generate mock Aadhaar data
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { responseMimeType: 'application/json' }
    });

    const prompt = `Generate realistic Indian Aadhaar mock data for Aadhaar: ${aadhaar.slice(0, 4)}XXXXXXXX
The person's real name from PAN is: "${panSession.fullName}"
Return ONLY valid JSON:
{
  "fullName": "same name as PAN with possible minor variation (same person)",
  "dob": "${panSession.dob}",
  "gender": "${panSession.gender}",
  "address": "realistic Indian address"
}`;

    const result      = await model.generateContent(prompt);
    const aadhaarData = JSON.parse(result.response.text());

    // Name match check
    const match = namesMatch(panSession.fullName, aadhaarData.fullName);
    if (!match) {
      return res.status(400).json({
        error: `KYC Failed: Name mismatch. PAN name: "${panSession.fullName}", Aadhaar name: "${aadhaarData.fullName}". Both documents must belong to the same person.`
      });
    }

    // Encrypt updated session with aadhaar
    const updatedSession = encrypt({
      ...panSession,
      aadhaar:     aadhaar.slice(-4).padStart(12, '*'), // mask
      aadhaarFull: aadhaar,                              // keep for saving
      aadhaarName: aadhaarData.fullName,
      aadhaarVerified: true
    });

    res.json({
      success: true,
      verifiedName: panSession.fullName,
      encryptedSession: updatedSession
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── STEP 3: POST /api/kyc/send-otp ────────────────────────────────────────────
export const sendEmailOtp = async (req, res) => {
  try {
    const { email, encryptedSession } = req.body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ error: 'Valid email required' });

    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const session = decrypt(encryptedSession);
    const otp     = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = await bcrypt.hash(otp, 10);

    const updatedSession = encrypt({ ...session, email, otpHash, otpExpiry: Date.now() + 10 * 60 * 1000 });

    await sendOtpEmail(email, otp, session.fullName);
    res.json({ success: true, encryptedSession: updatedSession });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── STEP 3b: POST /api/kyc/verify-otp ─────────────────────────────────────────
export const verifyEmailOtp = async (req, res) => {
  try {
    const { otp, mpin, encryptedSession } = req.body;

    if (!otp || !/^\d{6}$/.test(otp))
      return res.status(400).json({ error: 'Invalid OTP' });
    if (!mpin || !/^\d{6}$/.test(mpin))
      return res.status(400).json({ error: 'MPIN must be 6 digits' });

    const session = decrypt(encryptedSession);

    if (Date.now() > session.otpExpiry)
      return res.status(400).json({ error: 'OTP expired. Please request a new one.' });

    const validOtp = await bcrypt.compare(otp, session.otpHash);
    if (!validOtp) return res.status(400).json({ error: 'Invalid OTP' });

    const updatedSession = encrypt({ ...session, mpin, emailVerified: true });
    res.json({ success: true, encryptedSession: updatedSession });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── STEP 4: POST /api/kyc/bank ─────────────────────────────────────────────────
export const saveBankDetails = async (req, res) => {
  try {
    const { bankAccount, ifsc, bankHolderName, encryptedSession, skip } = req.body;

    const session = decrypt(encryptedSession);
    let updatedSession;

    if (skip) {
      updatedSession = encrypt({ ...session, bankSkipped: true });
    } else {
      if (!bankAccount || !ifsc || !bankHolderName)
        return res.status(400).json({ error: 'All bank fields required or skip' });
      updatedSession = encrypt({ ...session, bankAccount, ifsc, bankHolderName, bankSkipped: false });
    }

    res.json({ success: true, encryptedSession: updatedSession });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── STEP 5: POST /api/kyc/complete ────────────────────────────────────────────
// Final step: create user + wallet deposit simulation
export const completeKyc = async (req, res) => {
  try {
    const { encryptedSession, depositAmount, monthlyAmount, frequency, durationMonths, riskMode } = req.body;

    if (!depositAmount || depositAmount < 100)
      return res.status(400).json({ error: 'Minimum wallet deposit is ₹100' });

    const session = decrypt(encryptedSession);

    if (!session.emailVerified || !session.aadhaarVerified)
      return res.status(400).json({ error: 'KYC incomplete. Please complete all steps.' });

    // Create user — pre-save hook will encrypt KYC fields
    const user = new User({
      name:           session.fullName,
      email:          session.email,
      mpin:           session.mpin,
      pan:            session.pan,
      aadhaar:        session.aadhaar,       // masked
      bankAccount:    session.bankSkipped ? null : session.bankAccount,
      ifsc:           session.bankSkipped ? null : session.ifsc,
      bankHolderName: session.bankSkipped ? null : session.bankHolderName,
      hasBankDetails: !session.bankSkipped,
      kycStatus:      'complete',
      isVerified:     true,
      walletBalance:  depositAmount,
      walletFunded:   true,
      hasFullAccess:  true,
      monthlyAmount:  monthlyAmount || 10000,
      frequency:      frequency || 'monthly',
      durationMonths: durationMonths || 12,
      riskMode:       riskMode || 'smart',
      kycData:        encrypt({ pan: session.pan, fullName: session.fullName, dob: session.dob })
    });

    await user.save();

    // Record wallet deposit (encrypted)
    await WalletTx.create({
      userId:    user._id,
      type:      'deposit',
      amount:    depositAmount,
      method:    'UPI',
      status:    'success',
      reference: `SIM_${Date.now()}`
    });

    // Audit log
    await log(user._id, ACTIONS.SIGNUP, { kycComplete: true, walletFunded: true }, req);

    res.status(201).json({
      success: true,
      message: 'KYC complete. Full access unlocked.',
      user: {
        _id:           user._id,
        name:          user.name,
        email:         user.email,
        kycStatus:     user.kycStatus,
        walletBalance: user.walletBalance,
        hasFullAccess: user.hasFullAccess,
        hasBankDetails:user.hasBankDetails,
        monthlyAmount: user.monthlyAmount,
        frequency:     user.frequency,
        durationMonths:user.durationMonths,
        riskMode:      user.riskMode
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── GET /api/kyc/wallet ────────────────────────────────────────────────────────
export const getWallet = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const txs = await WalletTx.find({ userId: req.userId }).sort({ date: -1 });
    res.json({ balance: user.walletBalance, funded: user.walletFunded, transactions: txs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── POST /api/kyc/wallet/deposit ───────────────────────────────────────────────
export const addDeposit = async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount < 100) return res.status(400).json({ error: 'Minimum deposit ₹100' });

    const user = await User.findById(req.userId);
    user.walletBalance += amount;
    user.walletFunded   = true;
    user.hasFullAccess  = user.kycStatus === 'complete';
    await user.save();

    await WalletTx.create({
      userId: req.userId, type: 'deposit',
      amount, method: 'UPI', status: 'success',
      reference: `SIM_${Date.now()}`
    });

    await log(req.userId, 'WALLET_DEPOSIT', { amount }, req);
    res.json({ success: true, newBalance: user.walletBalance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
