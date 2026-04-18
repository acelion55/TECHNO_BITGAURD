import AuditLog from '../models/AuditLog.js';
import { encrypt } from '../utils/encryption.js';

export const log = async (userId, action, payload = {}, req = null) => {
  try {
    await AuditLog.create({
      userId,
      action,
      ip:        req?.ip || req?.headers?.['x-forwarded-for'] || null,
      userAgent: req?.headers?.['user-agent'] || null,
      encrypted: encrypt({ action, payload, ts: new Date().toISOString() })
    });
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }
};

// Action constants
export const ACTIONS = {
  SIGNUP:           'SIGNUP',
  LOGIN:            'LOGIN',
  LOGOUT:           'LOGOUT',
  FORGOT_PASSWORD:  'FORGOT_PASSWORD',
  RESET_PASSWORD:   'RESET_PASSWORD',
  SET_GOAL:         'SET_GOAL',
  SIMULATE_BUY:     'SIMULATE_BUY',
  AI_BUY_DECISION:  'AI_BUY_DECISION',
  TAX_REPORT:       'TAX_REPORT',
  TAX_SELL_SIM:     'TAX_SELL_SIM',
  CHAT:             'CHAT',
  PRICE_FETCH:      'PRICE_FETCH'
};
