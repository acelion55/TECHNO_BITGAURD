import User from '../models/User.js';

export const requireFullAccess = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId).select('hasFullAccess kycStatus walletFunded');
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!user.hasFullAccess) {
      const reason = !user.walletFunded
        ? 'Wallet not funded. Please add minimum ₹100 to activate full access.'
        : user.kycStatus !== 'complete'
        ? 'KYC incomplete. Please complete PAN + Aadhaar verification.'
        : 'Full access not granted.';
      return res.status(403).json({ error: reason, code: 'FULL_ACCESS_REQUIRED' });
    }
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
