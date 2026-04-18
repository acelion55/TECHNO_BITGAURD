import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:          { type: String, default: 'buy' },
  amountINR:     { type: Number, required: true },
  btcAmount:     { type: Number, required: true },
  pricePerBtc:   { type: Number, required: true },
  date:          { type: Date, default: Date.now },
  costBasis:     { type: Number, required: true },
  // AES-256-GCM encrypted copy of full transaction
  encryptedData: {
    iv:   { type: String, default: null },
    data: { type: String, default: null },
    tag:  { type: String, default: null }
  }
});

export default mongoose.model('Transaction', transactionSchema);
