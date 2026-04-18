import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action:    { type: String, required: true }, // e.g. LOGIN, SIMULATE_BUY, TAX_REPORT
  timestamp: { type: Date, default: Date.now },
  ip:        { type: String, default: null },
  userAgent: { type: String, default: null },
  // AES-256-GCM encrypted payload
  encrypted: {
    iv:   String,
    data: String,
    tag:  String
  }
});

export default mongoose.model('AuditLog', auditLogSchema);
