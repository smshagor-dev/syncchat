const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { Op } = require('sequelize');

const UserModel = require('../db/models/user');
const ProfileModel = require('../db/models/profile');
const SettingModel = require('../db/models/setting');
const GroupModel = require('../db/models/group');
const ContactModel = require('../db/models/contact');

const { toPlain, asArray, pullFromArray } = require('../db/utils');
const response = require('../helpers/response');
const mailer = require('../helpers/mailer');
const { toAbsoluteUploadUrl } = require('../helpers/storage');

const encrypt = require('../helpers/encrypt');
const decrypt = require('../helpers/decrypt');

const JWT_SECRET = 'shhhhh';

const SOCIAL_EMAIL_DOMAIN = 'social.syncchat.local';

const createError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const normalizeUsernameSeed = (value = '') =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);

const buildSyntheticEmail = ({ provider, providerUserId }) =>
  `${provider}_${providerUserId}@${SOCIAL_EMAIL_DOMAIN}`;

const mergeSocialAccounts = ({ current = [], next }) => {
  const list = asArray(current).filter((item) => item?.provider && item?.providerId);
  const exists = list.find(
    (item) =>
      item.provider === next.provider && String(item.providerId) === String(next.providerId)
  );

  if (exists) {
    return list.map((item) =>
      item.provider === next.provider && String(item.providerId) === String(next.providerId)
        ? {
            ...item,
            ...next,
            linkedAt: item.linkedAt || next.linkedAt,
          }
        : item
    );
  }

  return [...list, next];
};

const generateUniqueUsername = async (seed) => {
  const normalized = normalizeUsernameSeed(seed);
  const base = normalized.length >= 3 ? normalized : `${normalized}user`.slice(0, 24);
  const prefix = base.slice(0, 18);

  for (let i = 0; i < 2000; i += 1) {
    const suffix = i === 0 ? '' : String(i);
    const candidate = `${prefix}${suffix}`.slice(0, 24);
    // eslint-disable-next-line no-await-in-loop
    const existing = await UserModel.findOne({
      where: { username: candidate },
      attributes: ['_id'],
    });
    if (!existing) return candidate;
  }

  return `user_${crypto.randomBytes(4).toString('hex')}`.slice(0, 24);
};

const verifyGooglePayload = async ({ credential }) => {
  if (!credential) throw createError(400, 'Google credential is required');

  const { data } = await axios.get('https://oauth2.googleapis.com/tokeninfo', {
    params: { id_token: credential },
    timeout: 12000,
  });

  const expectedAud = process.env.GOOGLE_CLIENT_ID;
  if (expectedAud && data.aud !== expectedAud) {
    throw createError(401, 'Google token audience mismatch');
  }

  if (!data.sub) {
    throw createError(401, 'Invalid Google account payload');
  }

  return {
    provider: 'google',
    providerUserId: String(data.sub),
    email: String(data.email || '').toLowerCase() || null,
    fullname: String(data.name || data.given_name || 'Google User').trim(),
    usernameHint: String(data.email || data.name || data.given_name || 'google_user')
      .split('@')[0]
      .trim(),
    avatar: data.picture || null,
  };
};

const verifyFacebookPayload = async ({ accessToken }) => {
  if (!accessToken) throw createError(400, 'Facebook access token is required');

  const { data } = await axios.get('https://graph.facebook.com/me', {
    params: {
      fields: 'id,name,email,picture.width(256).height(256)',
      access_token: accessToken,
    },
    timeout: 12000,
  });

  if (!data?.id) {
    throw createError(401, 'Invalid Facebook account payload');
  }

  return {
    provider: 'facebook',
    providerUserId: String(data.id),
    email:
      String(data.email || '').toLowerCase() ||
      buildSyntheticEmail({ provider: 'facebook', providerUserId: String(data.id) }),
    fullname: String(data.name || 'Facebook User').trim(),
    usernameHint: String(data.name || `facebook_${data.id}`).trim(),
    avatar: data?.picture?.data?.url || null,
  };
};

const verifyTelegramPayload = ({ telegram }) => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) throw createError(500, 'Telegram bot token is missing on server');
  if (!telegram || typeof telegram !== 'object') {
    throw createError(400, 'Telegram payload is required');
  }

  const hash = String(telegram.hash || '');
  if (!hash) throw createError(401, 'Invalid Telegram payload hash');

  const allowedKeys = [
    'id',
    'first_name',
    'last_name',
    'username',
    'photo_url',
    'auth_date',
    'hash',
  ];

  const compact = {};
  allowedKeys.forEach((key) => {
    if (telegram[key] !== undefined && telegram[key] !== null) {
      compact[key] = telegram[key];
    }
  });

  const dataCheckString = Object.keys(compact)
    .filter((key) => key !== 'hash')
    .sort()
    .map((key) => `${key}=${compact[key]}`)
    .join('\n');

  const secretKey = crypto.createHash('sha256').update(botToken).digest();
  const expectedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  if (expectedHash !== hash) {
    throw createError(401, 'Telegram verification failed');
  }

  const authDate = Number(compact.auth_date || 0);
  const nowSec = Math.floor(Date.now() / 1000);
  if (!authDate || Math.abs(nowSec - authDate) > 24 * 60 * 60) {
    throw createError(401, 'Telegram auth data expired');
  }

  const providerUserId = String(compact.id || '');
  if (!providerUserId) {
    throw createError(401, 'Invalid Telegram account payload');
  }

  const fullname = String(
    [compact.first_name || '', compact.last_name || ''].join(' ').trim() || 'Telegram User'
  );

  return {
    provider: 'telegram',
    providerUserId,
    email: buildSyntheticEmail({
      provider: 'telegram',
      providerUserId,
    }),
    fullname,
    usernameHint: String(compact.username || compact.first_name || `telegram_${providerUserId}`),
    avatar: compact.photo_url || null,
  };
};

const verifySocialPayload = async ({ provider, payload }) => {
  if (provider === 'google') {
    return verifyGooglePayload(payload || {});
  }
  if (provider === 'facebook') {
    return verifyFacebookPayload(payload || {});
  }
  if (provider === 'telegram') {
    return verifyTelegramPayload(payload || {});
  }

  throw createError(400, 'Unsupported social provider');
};

const findUserBySocialIdentity = async ({ email, provider, providerUserId }) => {
  const where = email ? { email } : null;
  if (where) {
    const user = await UserModel.findOne({ where });
    if (user) return user;
  }

  const profiles = await ProfileModel.findAll({
    attributes: ['userId', 'socialAccounts'],
  });
  const profile = profiles
    .map((item) => item.get({ plain: true }))
    .find((item) =>
      asArray(item.socialAccounts).some(
        (entry) =>
          entry?.provider === provider &&
          String(entry?.providerId || '') === String(providerUserId)
      )
    );

  if (!profile?.userId) return null;
  return UserModel.findOne({ where: { _id: profile.userId } });
};

const upsertSocialUser = async (socialData) => {
  const nowIso = new Date().toISOString();
  const socialAccount = {
    provider: socialData.provider,
    providerId: socialData.providerUserId,
    username: socialData.usernameHint || '',
    linkedAt: nowIso,
  };

  let user = await findUserBySocialIdentity({
    email: socialData.email,
    provider: socialData.provider,
    providerUserId: socialData.providerUserId,
  });

  if (!user) {
    const username = await generateUniqueUsername(
      socialData.usernameHint || socialData.fullname || socialData.provider
    );
    const fullname = String(socialData.fullname || username).trim().slice(0, 32) || username;
    const email =
      String(socialData.email || '').toLowerCase() ||
      buildSyntheticEmail({
        provider: socialData.provider,
        providerUserId: socialData.providerUserId,
      });
    const password = encrypt(crypto.randomBytes(32).toString('hex'));

    user = await UserModel.create({
      username,
      fullname,
      email,
      password,
      verified: true,
      otp: null,
    });

    await SettingModel.create({ userId: user._id });
    await ProfileModel.create({
      userId: user._id,
      username,
      fullname,
      email,
      avatar: socialData.avatar || null,
      socialAccounts: [socialAccount],
    });

    return { user, created: true };
  }

  const profile = await ProfileModel.findOne({ where: { userId: user._id } });
  if (profile) {
    const nextSocialAccounts = mergeSocialAccounts({
      current: profile.socialAccounts,
      next: socialAccount,
    });

    await profile.update({
      socialAccounts: nextSocialAccounts,
      avatar: profile.avatar || socialData.avatar || null,
      fullname: profile.fullname || socialData.fullname || user.fullname,
      email: profile.email || user.email,
    });
  }

  if (!user.verified) {
    await user.update({ verified: true, otp: null });
  }

  return { user, created: false };
};

exports.register = async (req, res) => {
  try {
    const otp = Math.floor(1000 + Math.random() * 9000);

    const user = await UserModel.create({
      ...req.body,
      password: encrypt(req.body.password),
      otp,
    });
    const userId = user._id;

    await SettingModel.create({ userId });
    await ProfileModel.create({
      ...req.body,
      userId,
      fullname: req.body.fullname,
    });

    const token = jwt.sign({ _id: userId }, JWT_SECRET);
    const template = fs.readFileSync(
      path.resolve(__dirname, '../helpers/templates/otp.html'),
      'utf8'
    );

    await mailer({
      to: req.body.email,
      fullname: req.body.fullname,
      subject: 'Please activate your account',
      html: template,
      otp,
    });

    response({
      res,
      statusCode: 201,
      message: 'Successfully created a new account',
      payload: token,
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

exports.verify = async (req, res) => {
  try {
    const { userId, otp } = req.body;
    const user = await UserModel.findOne({ where: { _id: userId, otp } });

    if (!user) {
      throw createError(401, 'Invalid OTP code');
    }

    user.verified = true;
    user.otp = null;
    await user.save();

    response({
      res,
      message: 'Successfully verified an account',
      payload: toPlain(user),
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

exports.resendVerifyOtp = async (req, res) => {
  try {
    const user = await UserModel.findOne({ where: { _id: req.user._id } });
    if (!user) throw createError(404, 'User not found');
    if (user.verified) throw createError(400, 'Account already verified');

    const otp = Math.floor(1000 + Math.random() * 9000);
    const template = fs.readFileSync(
      path.resolve(__dirname, '../helpers/templates/otp.html'),
      'utf8'
    );

    await user.update({ otp });
    await mailer({
      to: user.email,
      fullname: user.fullname || user.username,
      subject: 'Please activate your account',
      html: template,
      otp,
    });

    response({
      res,
      message: 'OTP code sent successfully',
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

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await UserModel.findOne({
      where: {
        [Op.or]: [{ email: username }, { username }],
      },
    });

    if (!user) {
      throw createError(401, 'Username or email not registered');
    }

    if (!user.password || typeof user.password !== 'string') {
      throw createError(401, 'Invalid password');
    }

    try {
      decrypt(password, user.password);
    } catch (error0) {
      throw createError(401, 'Invalid password');
    }

    const token = jwt.sign({ _id: user._id }, JWT_SECRET);

    response({
      res,
      statusCode: 200,
      message: 'Successfully logged in',
      payload: token,
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

exports.socialConfig = async (req, res) => {
  response({
    res,
    payload: {
      googleClientId: process.env.GOOGLE_CLIENT_ID || '',
      facebookAppId: process.env.FACEBOOK_APP_ID || '',
      telegramBotUsername: process.env.TELEGRAM_BOT_USERNAME || '',
    },
  });
};

exports.socialAuth = async (req, res) => {
  try {
    const provider = String(req.body.provider || '')
      .trim()
      .toLowerCase();
    const payload = req.body.payload || {};

    const socialData = await verifySocialPayload({ provider, payload });
    const { user, created } = await upsertSocialUser(socialData);

    const token = jwt.sign({ _id: user._id }, JWT_SECRET);

    response({
      res,
      statusCode: created ? 201 : 200,
      message: created
        ? 'Successfully created a new account'
        : 'Successfully logged in',
      payload: token,
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

exports.find = async (req, res) => {
  try {
    const user = await UserModel.findOne({
      where: { _id: req.user._id },
      attributes: { exclude: ['password'] },
    });
    const profile = await ProfileModel.findOne({
      where: { userId: req.user._id },
      attributes: ['avatar'],
    });

    response({
      res,
      payload: {
        ...toPlain(user),
        avatar: toAbsoluteUploadUrl(profile?.avatar || null),
      },
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

exports.feedback = async (req, res) => {
  try {
    const message = (req.body.message || '').trim();

    if (message.length < 10) {
      throw createError(400, 'Feedback must be at least 10 characters long');
    }

    const user = await UserModel.findOne({ where: { _id: req.user._id } });
    if (!user) throw createError(404, 'User not found');

    const to = process.env.FEEDBACK_EMAIL || process.env.EMAIL_USER;
    if (!to) {
      throw createError(
        500,
        'Feedback email is not configured on server environment'
      );
    }

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2>New user feedback</h2>
        <p><strong>User:</strong> ${user.username} (${user.email})</p>
        <p><strong>User ID:</strong> ${user._id}</p>
        <p><strong>Submitted at:</strong> ${new Date().toISOString()}</p>
        <hr />
        <p style="white-space: pre-wrap;">${message}</p>
      </div>
    `;

    await mailer({
      to,
      fullname: user.fullname || user.username,
      subject: `Feedback from @${user.username}`,
      html,
      otp: '',
    });

    response({
      res,
      message: 'Feedback sent successfully',
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

exports.delete = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await UserModel.findOne({ where: { _id: userId } });
    if (!user) throw createError(404, 'User not found');

    const compare = decrypt(req.body.password, user.password);
    if (!compare) throw createError(401, 'Invalid password');

    await UserModel.destroy({ where: { _id: userId } });
    await ProfileModel.destroy({ where: { userId } });
    await SettingModel.destroy({ where: { userId } });
    await ContactModel.destroy({ where: { userId } });

    const groups = await GroupModel.findAll();
    await Promise.all(
      groups.map(async (group) => {
        const participants = asArray(group.participantsId);
        if (!participants.includes(userId)) return;
        await group.update({
          participantsId: pullFromArray(participants, [userId]),
        });
      })
    );

    response({
      res,
      message: 'Account deleted successfully',
      payload: toPlain(user),
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

exports.changePass = async (req, res) => {
  try {
    const userId = req.user._id;
    const { oldPass, newPass, confirmNewPass } = req.body;

    const user = await UserModel.findOne({ where: { _id: userId } });
    if (!user) throw createError(404, 'User not found');

    if (!decrypt(oldPass, user.password)) {
      throw createError(401, 'Invalid password');
    }

    if (newPass !== confirmNewPass) {
      throw createError(400, "New password doesn't match");
    }

    await user.update({ password: encrypt(newPass) });

    const payload = toPlain(user);
    delete payload.password;
    response({
      res,
      message: 'Password changed successfully',
      payload,
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

exports.requestForgotPass = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await UserModel.findOne({ where: { email } });

    if (!user) {
      response({
        res,
        message:
          'If your email is registered, a verification code has been sent',
      });
      return;
    }

    const otp = Math.floor(1000 + Math.random() * 9000);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const template = fs.readFileSync(
      path.resolve(__dirname, '../helpers/templates/otp.html'),
      'utf8'
    );

    await user.update({
      resetOtp: otp,
      resetOtpExpires: expiresAt,
      resetOtpVerified: false,
    });

    await mailer({
      to: user.email,
      fullname: user.fullname || user.username,
      subject: 'Password reset code',
      html: template,
      otp,
    });

    response({
      res,
      message: 'If your email is registered, a verification code has been sent',
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

exports.verifyForgotPass = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await UserModel.findOne({
      where: {
        email,
        resetOtp: otp,
        resetOtpExpires: { [Op.gt]: new Date() },
      },
    });

    if (!user) {
      throw createError(401, 'Invalid or expired verification code');
    }

    await user.update({ resetOtpVerified: true });

    response({
      res,
      message: 'Verification code accepted',
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
    const { email, newPass, confirmNewPass } = req.body;

    if (newPass !== confirmNewPass) {
      throw createError(400, "New password doesn't match");
    }

    const user = await UserModel.findOne({
      where: {
        email,
        resetOtpVerified: true,
        resetOtpExpires: { [Op.gt]: new Date() },
      },
    });

    if (!user) {
      throw createError(
        401,
        'Reset session expired. Please request a new code'
      );
    }

    await user.update({
      password: encrypt(newPass),
      resetOtp: null,
      resetOtpExpires: null,
      resetOtpVerified: false,
    });

    response({
      res,
      message: 'Password reset successfully',
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
