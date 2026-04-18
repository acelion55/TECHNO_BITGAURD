import mongoose from 'mongoose';
import { encrypt, decrypt } from '../utils/encryption.js';

const SENSITIVE = ['amountINR', 'btcAmount', 'pricePerBtc', 'costBasis'];

const transactionSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:        { type: String, default: 'buy' },
  date:        { type: Date, default: Date.now },

  // Stored as AES-256-GCM encrypted hex strings
  amountINR:   { type: String, required: true },
  btcAmount:   { type: String, required: true },
  pricePerBtc: { type: String, required: true },
  costBasis:   { type: String, required: true },

  // Encryption envelopes — named 'enc' (not '_enc') so Mongoose returns it
  enc: {
    amountINR:   { iv: String, tag: String },
    btcAmount:   { iv: String, tag: String },
    pricePerBtc: { iv: String, tag: String },
    costBasis:   { iv: String, tag: String },
  }
});

// ── Pre-save: encrypt all sensitive fields ─────────────────────────────────────
transactionSchema.pre('save', function (next) {
  if (!this.enc) this.enc = {};
  for (const field of SENSITIVE) {
    if ((this.isModified(field) || this.isNew) && typeof this[field] === 'number') {
      const result     = encrypt(this[field]);
      this[field]      = result.data;
      this.enc[field]  = { iv: result.iv, tag: result.tag };
    }
  }
  next();
});

// ── Decrypt a single doc back to plain numbers ─────────────────────────────────────────────
transactionSchema.methods.decryptFields = function () {
  const obj = this.toObject();
  // Support both 'enc' (new) and '_enc' (old) field names for backwards compatibility
  const envelope = this.enc || this._doc?._enc;
  for (const field of SENSITIVE) {
    try {
      const iv  = envelope?.[field]?.iv;
      const tag = envelope?.[field]?.tag;
      const data = this[field];
      if (!iv || !tag || !data) {
        // Field not encrypted — already a plain number (shouldn't happen but handle gracefully)
        obj[field] = typeof data === 'number' ? data : null;
        continue;
      }
      obj[field] = decrypt({ iv, data, tag });
    } catch (e) {
      console.error(`decryptFields failed for ${field}:`, e.message);
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
