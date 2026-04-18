import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  // Basic Info
  name:          { type: String, required: true, trim: true },
  email:         { type: String, required: true, unique: true, lowercase: true },
  phone:         { type: String, required: true, unique: true },

  // Auth
  mpin:          { type: String, required: true },        // bcrypt hashed 6-digit MPIN
  isVerified:    { type: Boolean, default: false },       // email verified

  // KYC (optional for hackathon)
  pan:           { type: String, default: null },
  aadhaar:       { type: String, default: null },         // store masked only
  bankAccount:   { type: String, default: null },
  ifsc:          { type: String, default: null },

  // DCA Goal
  monthlyAmount: { type: Number, default: 0 },
  frequency:     { type: String, enum: ['weekly', 'monthly'], default: 'monthly' },
  durationMonths:{ type: Number, default: 12 },
  riskMode:      { type: String, enum: ['conservative', 'smart'], default: 'smart' },

  // Refresh Token (hashed, for rotation)
  refreshToken:  { type: String, default: null },

  // OTP for forgot password
  otp:           { type: String, default: null },
  otpExpiry:     { type: Date, default: null },

  createdAt:     { type: Date, default: Date.now }
});

// Hash MPIN before save
userSchema.pre('save', async function (next) {
  if (!this.isModified('mpin')) return next();
  this.mpin = await bcrypt.hash(this.mpin, 10);
  next();
});

// Compare MPIN
userSchema.methods.compareMpin = function (mpin) {
  return bcrypt.compare(mpin, this.mpin);
};

export default mongoose.model('User', userSchema);
