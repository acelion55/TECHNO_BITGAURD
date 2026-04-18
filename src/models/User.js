import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { encrypt, decrypt } from '../utils/encryption.js';

const ENCRYPTED_FIELDS = ['pan', 'aadhaar', 'bankAccount', 'ifsc', 'bankHolderName'];

const userSchema = new mongoose.Schema({
  // Basic Info
  name:          { type: String, required: true, trim: true },
  email:         { type: String, default: null, lowercase: true },
  phone:         { type: String, default: null },

  // Auth
  mpin:          { type: String, default: null },
  isVerified:    { type: Boolean, default: false },   // email OTP verified

  // KYC — stored as AES-256 encrypted hex strings
  pan:           { type: String, default: null },
  aadhaar:       { type: String, default: null },
  bankAccount:   { type: String, default: null },
  ifsc:          { type: String, default: null },
  bankHolderName:{ type: String, default: null },

  // KYC encryption envelopes
  _kycEnc: {
    pan:           { iv: String, tag: String },
    aadhaar:       { iv: String, tag: String },
    bankAccount:   { iv: String, tag: String },
    ifsc:          { iv: String, tag: String },
    bankHolderName:{ iv: String, tag: String },
  },

  // KYC Status
  kycStatus: {
    type: String,
    enum: ['pending', 'pan_verified', 'aadhaar_verified', 'email_verified', 'complete'],
    default: 'pending'
  },
  kycData: {                        // Gemini-fetched PAN data (encrypted)
    iv: String, data: String, tag: String
  },

  // Wallet
  walletBalance:  { type: Number, default: 0 },
  walletFunded:   { type: Boolean, default: false },  // true after first deposit
  hasBankDetails: { type: Boolean, default: false },

  // Full access gate: KYC complete + wallet funded
  hasFullAccess:  { type: Boolean, default: false },

  // DCA Goal
  monthlyAmount:  { type: Number, default: 0 },
  frequency:      { type: String, enum: ['weekly', 'monthly'], default: 'monthly' },
  durationMonths: { type: Number, default: 12 },
  riskMode:       { type: String, enum: ['conservative', 'smart'], default: 'smart' },

  // Refresh Token (hashed)
  refreshToken:   { type: String, default: null },

  // OTP
  otp:            { type: String, default: null },
  otpExpiry:      { type: Date, default: null },

  createdAt:      { type: Date, default: Date.now }
});

// ── Pre-save: hash MPIN + encrypt KYC fields ───────────────────────────────────
userSchema.pre('save', async function (next) {
  // Hash MPIN
  if (this.isModified('mpin') && this.mpin && this.mpin.length === 6 && /^\d{6}$/.test(this.mpin)) {
    this.mpin = await bcrypt.hash(this.mpin, 10);
  }

  // Encrypt KYC fields if modified and plain text
  if (!this._kycEnc) this._kycEnc = {};
  for (const field of ENCRYPTED_FIELDS) {
    const val = this[field];
    if (this.isModified(field) && val && !this._kycEnc[field]?.iv) {
      const result = encrypt(val);
      this[field]  = result.data;
      this._kycEnc[field] = { iv: result.iv, tag: result.tag };
    }
  }
  next();
});

// ── Compare MPIN ───────────────────────────────────────────────────────────────
userSchema.methods.compareMpin = function (mpin) {
  return bcrypt.compare(mpin, this.mpin);
};

// ── Decrypt a single KYC field ─────────────────────────────────────────────────
userSchema.methods.decryptKyc = function (field) {
  try {
    return decrypt({ iv: this._kycEnc?.[field]?.iv, data: this[field], tag: this._kycEnc?.[field]?.tag });
  } catch { return null; }
};

export default mongoose.model('User', userSchema);
