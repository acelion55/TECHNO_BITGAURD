import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  monthlyAmount: { type: Number, required: true },
  frequency: { type: String, enum: ['weekly', 'monthly'], default: 'monthly' },
  durationMonths: { type: Number, required: true },
  riskMode: { type: String, enum: ['conservative', 'smart'], default: 'smart' },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('User', userSchema);
