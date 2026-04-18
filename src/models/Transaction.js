import mongoose from 'mongoose';
import { encrypt, decrypt } from '../utils/encryption.js';

// Sensitive fields that get encrypted
const SENSITIVE = ['amountINR', 'btcAmount', 'pricePerBtc', 'costBasis'];

const transactionSchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:     { type: String, default: 'buy' },
  date:     { type: Date, default: Date.now },

  // Stored as encrypted hex strings in DB
  amountINR:   { type: String, required: true },
  btcAmount:   { type: String, required: true },
  pricePerBtc: { type: String, required: true },
  costBasis:   { type: String, required: true },

  // AES-256-GCM envelope (iv + tag for each field)
  _enc: {
    amountINR:   { iv: String, tag: String },
    btcAmount:   { iv: String, tag: String },
    pricePerBtc: { iv: String, tag: String },
    costBasis:   { iv: String, tag: String },
  }
});

// ── Pre-save: encrypt all sensitive fields ─────────────────────────────────────
transactionSchema.pre('save', function (next) {
  if (!this._enc) this._enc = {};
  for (const field of SENSITIVE) {
    if (this.isModified(field) || this.isNew) {
      const raw = this[field];
      if (raw === undefined || raw === null) continue;
      // Only encrypt if not already encrypted (plain number)
      if (typeof raw === 'number') {
        const result    = encrypt(raw);
        this[field]     = result.data;          // store ciphertext
        this._enc[field] = { iv: result.iv, tag: result.tag };
      }
    }
  }
  next();
});

// ── Helper: decrypt a single transaction doc back to plain numbers ─────────────
transactionSchema.methods.decryptFields = function () {
  const obj = this.toObject();
  for (const field of SENSITIVE) {
    try {
      obj[field] = decrypt({
        iv:   this._enc?.[field]?.iv,
        data: this[field],
        tag:  this._enc?.[field]?.tag
      });
    } catch {
      obj[field] = null; // decryption failed
    }
  }
  return obj;
};

// ── Static: decrypt an array of transactions ───────────────────────────────────
transactionSchema.statics.decryptAll = function (docs) {
  return docs.map(doc => doc.decryptFields ? doc.decryptFields() : doc);
};

export default mongoose.model('Transaction', transactionSchema);
