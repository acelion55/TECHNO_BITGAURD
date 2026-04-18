import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

export const generateAccessToken = (userId) =>
  jwt.sign({ userId }, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: process.env.ACCESS_TOKEN_EXPIRY || '15m'
  });

export const generateRefreshToken = (userId) =>
  jwt.sign({ userId }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: process.env.REFRESH_TOKEN_EXPIRY || '7d'
  });

export const verifyAccessToken = (token) =>
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

export const verifyRefreshToken = (token) =>
  jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);

export const hashToken = (token) =>
  bcrypt.hash(token, 10);

export const compareToken = (token, hash) =>
  bcrypt.compare(token, hash);

// Set both tokens as httpOnly cookies
export const setAuthCookies = (res, accessToken, refreshToken) => {
  const isProd = process.env.NODE_ENV === 'production';

  const cookieOptions = {
    httpOnly: true,
    secure: true,           // always true (Render uses HTTPS)
    sameSite: 'none',       // required for cross-origin cookies (Vercel → Render)
  };

  res.cookie('accessToken', accessToken, {
    ...cookieOptions,
    maxAge: 15 * 60 * 1000           // 15 minutes
  });

  res.cookie('refreshToken', refreshToken, {
    ...cookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000  // 7 days
  });
};

export const clearAuthCookies = (res) => {
  const options = { httpOnly: true, secure: true, sameSite: 'none' };
  res.clearCookie('accessToken', options);
  res.clearCookie('refreshToken', options);
};
