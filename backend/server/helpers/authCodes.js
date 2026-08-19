const crypto = require('crypto');
const { JWT_SECRET } = require('./jwtConfig');

const OTP_LENGTH = 6;
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 8;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const RESET_TOKEN_TTL_MS = 10 * 60 * 1000;

const generateOtp = () => String(crypto.randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0');

const hashOtp = ({ purpose, userId, otp }) =>
  crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${String(purpose || '')}:${String(userId || '')}:${String(otp || '')}`)
    .digest('hex');

const timingSafeHexEqual = (left, right) => {
  const a = Buffer.from(String(left || ''), 'hex');
  const b = Buffer.from(String(right || ''), 'hex');
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
};

const verifyOtpHash = ({ purpose, userId, otp, hash }) =>
  timingSafeHexEqual(hashOtp({ purpose, userId, otp }), hash);

const generateResetToken = () => crypto.randomBytes(32).toString('base64url');
const hashResetToken = (token) =>
  crypto.createHash('sha256').update(String(token || '')).digest('hex');

const validatePassword = (value) => {
  const password = String(value || '');
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (password.length > 128) return 'Password must be at most 128 characters';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return 'Password must include at least one letter and one number';
  }
  return '';
};

module.exports = {
  OTP_LENGTH,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_MS,
  OTP_TTL_MS,
  RESET_TOKEN_TTL_MS,
  generateOtp,
  generateResetToken,
  hashOtp,
  hashResetToken,
  timingSafeHexEqual,
  validatePassword,
  verifyOtpHash,
};
