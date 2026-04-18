import mongoose from 'mongoose';
import { ecEncrypt, ecDecrypt } from '../utils/ecEncryption.js';

const SENSITIVE = ['amountINR', 'btcAmount', 'pricePerBtc', 'costBasis'];

// Each encrypted field stores: ephemeralPub + iv + tag + data
const ecEnvelope = {
  ephemeralPub: String,
  iv:           String,
  tag:          String,
  data:         String,
};

const transactionSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:        { type: String, default: 'buy' },
  date:        { type: Date, default: Date.now },

  // Ciphertext hex strings (ECDH+AES-256-GCM)
  amountINR:   { type: String, required: true },
  btcAmount:   { type: String, required: true },
  pricePerBtc: { type: String, required: true },
  costBasis:   { type: String, required: true },

  // ECDH envelopes — one ephemeral public key per field
  enc: {
    amountINR:   ecEnvelope,
    btcAmount:   ecEnvelope,
    pricePerBtc: ecEnvelope,
    costBasis:   ecEnvelope,
  },
});

// ── Pre-save: ECDH-encrypt all sensitive fields ────────────────────────────────
transactionSchema.pre('save', function (next) {
  if (!this.enc) this.enc = {};
  for (const field of SENSITIVE) {
    const val = this[field];
    // Mongoose coerces numbers to strings before pre-save, so check both
    const isPlain = typeof val === 'number' ||
      (typeof val === 'string' && val.length < 40 && !isNaN(Number(val)) && val.trim() !== '');
    if ((this.isModified(field) || this.isNew) && isPlain) {
      const result    = ecEncrypt(Number(val));
      this[field]     = result.data;
      this.enc[field] = { ephemeralPub: result.ephemeralPub, iv: result.iv, tag: result.tag, data: result.data };
    }
  }
  next();
});

// ── Decrypt a single doc back to plain numbers ─────────────────────────────────
transactionSchema.methods.decryptFields = function () {
  const obj = this.toObject();
  for (const field of SENSITIVE) {
    try {
      const env = this.enc?.[field];
      if (!env?.ephemeralPub || !env?.iv || !env?.tag || !env?.data) {
        console.warn(`Missing ECDH envelope for ${field}, setting to null`);
        obj[field] = null;
        continue;
      }
      obj[field] = Number(ecDecrypt(env)) || 0;
    } catch (e) {
      console.error(`ECDH decryptFields failed for ${field}:`, e.message);
      obj[field] = null;
    }
  }
  return obj;
};

// ── Decrypt an array of transaction docs ──────────────────────────────────────
transactionSchema.statics.decryptAll = function (docs) {
  return docs.map(doc => doc.decryptFields ? doc.decryptFields() : doc);
};

export default mongoose.model('Transaction', transactionSchema);
