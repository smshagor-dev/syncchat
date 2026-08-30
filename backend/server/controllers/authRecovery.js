const fs = require('fs');
const path = require('path');

const UserModel = require('../db/models/user');
const ProfileModel = require('../db/models/profile');
const SettingModel = require('../db/models/setting');
const response = require('../helpers/response');
const mailer = require('../helpers/mailer');
const encrypt = require('../helpers/encrypt');
const { toPlain } = require('../db/utils');
const { applyDefaultSettings, loadAppConfig } = require('../helpers/appConfig');
const {
  createSession,
  notifySuspiciousLogin,
  revokeAllSessions,
  signUserToken,
} = require('../helpers/userSessions');
const {
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
} = require('../helpers/authCodes');

const emailTemplate = () =>
  fs.readFileSync(path.resolve(__dirname, '../helpers/templates/otp.html'), 'utf8');

const createError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const escapeHtml = (value = '') =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizeUsername = (value) => String(value || '').trim().toLowerCase();
const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const sanitizeUser = (user) => {
  const plain = toPlain(user) || {};
  [
    'password',
    'otp',
    'otpHash',
    'otpExpires',
    'otpAttempts',
    'otpLastSentAt',
    'resetOtp',
    'resetOtpHash',
    'resetOtpExpires',
    'resetOtpAttempts',
    'resetOtpLastSentAt',
    'resetOtpVerified',
    'resetTokenHash',
    'resetTokenExpires',
  ].forEach((field) => delete plain[field]);
  return plain;
};

const duplicateMessage = (error0) => {
  if (error0?.code === 11000) {
    const key = Object.keys(error0.keyPattern || error0.keyValue || {})[0];
    return key === 'email'
      ? 'Email already registered'
      : key === 'username'
        ? 'Username already registered'
        : 'Account already registered';
  }
  if (error0?.name === 'SequelizeUniqueConstraintError') {
    const field = error0.errors?.[0]?.path;
    return field === 'email'
      ? 'Email already registered'
      : field === 'username'
        ? 'Username already registered'
        : 'Account already registered';
  }
  return '';
};

const assertAccountActive = (user) => {
  if (!user) throw createError(404, 'Account not found');
  if (user.status === 'blocked') throw createError(403, 'Account is blocked');
  if (user.status === 'banned') throw createError(403, 'Account is banned');
  if (user.status === 'deleted') throw createError(403, 'Account is deleted');
};

const assertResendAllowed = (lastSentAt) => {
  const last = new Date(lastSentAt || 0).getTime();
  const remaining = OTP_RESEND_COOLDOWN_MS - (Date.now() - last);
  if (last > 0 && remaining > 0) {
    const error = createError(
      429,
      `Please wait ${Math.max(1, Math.ceil(remaining / 1000))} seconds before requesting another code`
    );
    error.retryAfter = Math.max(1, Math.ceil(remaining / 1000));
    throw error;
  }
};

const isRegistrationOtpRequired = async () => {
  const config = await loadAppConfig();
  return config.featureFlags?.user_otp_verification_required !== false;
};

const sendVerificationMail = async ({ user, otp, subject }) =>
  mailer({
    to: user.email,
    fullname: escapeHtml(user.fullname || user.username),
    subject,
    html: emailTemplate(),
    otp,
  });

exports.register = async (req, res) => {
  try {
    const fullname = String(req.body?.fullname || '').trim();
    const username = normalizeUsername(req.body?.username);
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');

    if (fullname.length < 3 || fullname.length > 32) {
      throw createError(400, 'Full name must be between 3 and 32 characters');
    }
    if (!/^[a-z0-9_]{3,24}$/.test(username)) {
      throw createError(400, 'Username must be 3-24 characters using letters, numbers or underscore');
    }
    if (!validEmail(email)) throw createError(400, 'Email address is invalid');
    const passwordError = validatePassword(password);
    if (passwordError) throw createError(400, passwordError);

    const otpRequired = await isRegistrationOtpRequired();
    const otp = otpRequired ? generateOtp() : null;
    let user = await UserModel.create({
      fullname,
      username,
      email,
      password: encrypt(password),
      verified: !otpRequired,
      status: 'active',
      otp: null,
      otpHash: '',
      otpExpires: otpRequired ? new Date(Date.now() + OTP_TTL_MS) : null,
      otpAttempts: 0,
      otpLastSentAt: otpRequired ? new Date() : null,
    });
    if (otpRequired) {
      await user.update({
        otpHash: hashOtp({ purpose: 'verify-account', userId: user._id, otp }),
      });
    }

    const userId = user._id;
    await SettingModel.create(await applyDefaultSettings({ userId }));
    await ProfileModel.create({
      userId,
      fullname,
      username,
      email,
    });

    const session = await createSession({ userId, req, authProvider: 'password' });
    notifySuspiciousLogin(session);
    const token = signUserToken({ userId, sessionId: session._id });

    let mailError = null;
    if (otpRequired) {
      try {
        await sendVerificationMail({
          user,
          otp,
          subject: 'Verify your SyncChat account',
        });
      } catch (error0) {
        mailError = error0;
      }
    }

    response({
      res,
      statusCode: 201,
      message: !otpRequired
        ? 'Account created successfully. Verification is not required.'
        : mailError
          ? 'Account created, but the verification email could not be delivered. Use Re-Send OTP after SMTP is corrected.'
          : 'Account created. A 6-digit verification code was sent to your email.',
      payload: token,
    });
  } catch (error0) {
    const duplicate = duplicateMessage(error0);
    response({
      res,
      statusCode: duplicate ? 409 : error0.statusCode || 500,
      success: false,
      message: duplicate || error0.message,
    });
  }
};

exports.verify = async (req, res) => {
  try {
    const user = await UserModel.findOne({ where: { _id: req.user?._id } });
    assertAccountActive(user);
    if (user.verified) throw createError(400, 'Account is already verified');

    const otp = String(req.body?.otp || '').replace(/\D+/g, '').slice(0, 6);
    if (!otp) throw createError(400, 'Verification code is required');
    if (Number(user.otpAttempts || 0) >= OTP_MAX_ATTEMPTS) {
      throw createError(429, 'Too many invalid attempts. Request a new code.');
    }
    if (!user.otpExpires || new Date(user.otpExpires).getTime() <= Date.now()) {
      throw createError(401, 'Verification code expired. Request a new code.');
    }

    const valid = user.otpHash
      ? verifyOtpHash({
          purpose: 'verify-account',
          userId: user._id,
          otp,
          hash: user.otpHash,
        })
      : user.otp != null && String(user.otp) === otp;

    if (!valid) {
      await user.update({ otpAttempts: Number(user.otpAttempts || 0) + 1 });
      throw createError(401, 'Invalid verification code');
    }

    await user.update({
      verified: true,
      otp: null,
      otpHash: null,
      otpExpires: null,
      otpAttempts: 0,
      otpLastSentAt: null,
    });

    response({
      res,
      message: 'Account verified successfully',
      payload: sanitizeUser(user),
    });
  } catch (error0) {
    if (error0.retryAfter) res.setHeader('Retry-After', String(error0.retryAfter));
    response({
      res,
      statusCode: error0.statusCode || 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.resendVerifyOtp = async (req, res) => {
  try {
    const user = await UserModel.findOne({ where: { _id: req.user?._id } });
    assertAccountActive(user);
    if (user.verified) throw createError(400, 'Account is already verified');
    assertResendAllowed(user.otpLastSentAt);

    const otp = generateOtp();
    await user.update({
      otp: null,
      otpHash: hashOtp({ purpose: 'verify-account', userId: user._id, otp }),
      otpExpires: new Date(Date.now() + OTP_TTL_MS),
      otpAttempts: 0,
      otpLastSentAt: new Date(),
    });
    await sendVerificationMail({
      user,
      otp,
      subject: 'Your new SyncChat verification code',
    });

    response({ res, message: 'A new 6-digit verification code was sent successfully' });
  } catch (error0) {
    if (error0.retryAfter) res.setHeader('Retry-After', String(error0.retryAfter));
    response({
      res,
      statusCode: error0.statusCode || (String(error0.code || '').startsWith('SMTP_') ? 502 : 500),
      success: false,
      message: error0.message,
    });
  }
};

exports.requestForgotPass = async (req, res) => {
  const genericMessage = 'If your email is registered, a verification code has been sent';
  try {
    const email = normalizeEmail(req.body?.email);
    if (!validEmail(email)) throw createError(400, 'Email address is invalid');

    const user = await UserModel.findOne({ where: { email } });
    if (!user || ['deleted', 'banned'].includes(String(user.status || ''))) {
      response({ res, message: genericMessage });
      return;
    }

    const last = new Date(user.resetOtpLastSentAt || 0).getTime();
    if (last > 0 && Date.now() - last < OTP_RESEND_COOLDOWN_MS) {
      response({ res, message: genericMessage });
      return;
    }

    const otp = generateOtp();
    await user.update({
      resetOtp: null,
      resetOtpHash: hashOtp({ purpose: 'password-reset', userId: user._id, otp }),
      resetOtpExpires: new Date(Date.now() + OTP_TTL_MS),
      resetOtpAttempts: 0,
      resetOtpLastSentAt: new Date(),
      resetOtpVerified: false,
      resetTokenHash: null,
      resetTokenExpires: null,
    });

    try {
      await sendVerificationMail({
        user,
        otp,
        subject: 'Your SyncChat password reset code',
      });
    } catch (mailError) {
      // Keep the public response generic so SMTP state cannot be used for
      // account enumeration. The detailed failure is available in mail logs
      // and Admin > mail diagnostics.
    }

    response({ res, message: genericMessage });
  } catch (error0) {
    response({
      res,
      statusCode: error0.statusCode || 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.verifyForgotPass = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const otp = String(req.body?.otp || '').replace(/\D+/g, '').slice(0, 6);
    if (!validEmail(email) || !otp) {
      throw createError(400, 'Email and verification code are required');
    }

    const user = await UserModel.findOne({ where: { email } });
    if (
      !user ||
      !user.resetOtpHash ||
      !user.resetOtpExpires ||
      new Date(user.resetOtpExpires).getTime() <= Date.now()
    ) {
      throw createError(401, 'Invalid or expired verification code');
    }
    if (Number(user.resetOtpAttempts || 0) >= OTP_MAX_ATTEMPTS) {
      throw createError(429, 'Too many invalid attempts. Request a new code.');
    }

    const valid = verifyOtpHash({
      purpose: 'password-reset',
      userId: user._id,
      otp,
      hash: user.resetOtpHash,
    });
    if (!valid) {
      await user.update({ resetOtpAttempts: Number(user.resetOtpAttempts || 0) + 1 });
      throw createError(401, 'Invalid or expired verification code');
    }

    const resetToken = generateResetToken();
    await user.update({
      resetOtp: null,
      resetOtpHash: null,
      resetOtpExpires: null,
      resetOtpAttempts: 0,
      resetOtpVerified: false,
      resetTokenHash: hashResetToken(resetToken),
      resetTokenExpires: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    });

    response({
      res,
      message: 'Verification code accepted',
      payload: { resetToken },
    });
  } catch (error0) {
    response({
      res,
      statusCode: error0.statusCode || 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.resetForgotPass = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const resetToken = String(req.body?.resetToken || '').trim();
    const newPass = String(req.body?.newPass || '');
    const confirmNewPass = String(req.body?.confirmNewPass || '');

    if (!validEmail(email) || !resetToken) {
      throw createError(401, 'Reset session expired. Request a new code.');
    }
    if (newPass !== confirmNewPass) throw createError(400, "New password doesn't match");
    const passwordError = validatePassword(newPass);
    if (passwordError) throw createError(400, passwordError);

    const user = await UserModel.findOne({ where: { email } });
    if (
      !user ||
      !user.resetTokenHash ||
      !user.resetTokenExpires ||
      new Date(user.resetTokenExpires).getTime() <= Date.now() ||
      !timingSafeHexEqual(hashResetToken(resetToken), user.resetTokenHash)
    ) {
      throw createError(401, 'Reset session expired. Request a new code.');
    }

    await user.update({
      password: encrypt(newPass),
      resetOtp: null,
      resetOtpHash: null,
      resetOtpExpires: null,
      resetOtpAttempts: 0,
      resetOtpLastSentAt: null,
      resetOtpVerified: false,
      resetTokenHash: null,
      resetTokenExpires: null,
    });
    const revokedSessions = await revokeAllSessions({
      userId: user._id,
      reason: 'password-reset',
    });

    response({
      res,
      message: 'Password reset successfully. Sign in again on your devices.',
      payload: { revokedSessions },
    });
  } catch (error0) {
    response({
      res,
      statusCode: error0.statusCode || 500,
      success: false,
      message: error0.message,
    });
  }
};
