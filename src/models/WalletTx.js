import mongoose from 'mongoose';
import { encrypt } from '../utils/encryption.js';

const walletTxSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:      { type: String, enum: ['deposit', 'debit'], required: true },
  amount:    { type: String, required: true },   // encrypted
  method:    { type: String, default: 'UPI' },   // UPI, NEFT, etc.
  status:    { type: String, enum: ['pending', 'success', 'failed'], default: 'success' },
  reference: { type: String, default: null },    // encrypted txn ref
  date:      { type: Date, default: Date.now },
  _enc: {
    amount:    { iv: String, tag: String },
    reference: { iv: String, tag: String }
  }
});

walletTxSchema.pre('save', function (next) {
  if (!this._enc) this._enc = {};
  if (this.isModified('amount') && typeof this.amount === 'number') {
    const r = encrypt(this.amount);
    this.amount = r.data;
    this._enc.amount = { iv: r.iv, tag: r.tag };
  }
  if (this.isModified('reference') && this.reference && !this._enc.reference?.iv) {
    const r = encrypt(this.reference);
    this.reference = r.data;
    this._enc.reference = { iv: r.iv, tag: r.tag };
  }
  next();
});

export default mongoose.model('WalletTx', walletTxSchema);
