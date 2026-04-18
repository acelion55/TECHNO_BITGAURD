import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, default: 'buy' },
  amountINR: { type: Number, required: true },
  btcAmount: { type: Number, required: true },
  pricePerBtc: { type: Number, required: true },
  date: { type: Date, default: Date.now },
  costBasis: { type: Number, required: true }
});

export default mongoose.model('Transaction', transactionSchema);
