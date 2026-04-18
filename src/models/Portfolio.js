import mongoose from 'mongoose';

const portfolioSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  totalInvested: { type: Number, default: 0 },
  totalBtc: { type: Number, default: 0 },
  averageCost: { type: Number, default: 0 },
  currentValue: { type: Number, default: 0 },
  transactions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' }]
});

export default mongoose.model('Portfolio', portfolioSchema);
