const crypto = require('crypto');
const axios = require('axios');

const UserModel = require('../db/models/user');
const ProfileModel = require('../db/models/profile');
const SettingModel = require('../db/models/setting');
const { asArray } = require('../db/utils');
const response = require('../helpers/response');
const encrypt = require('../helpers/encrypt');
const { applyDefaultSettings } = require('../helpers/appConfig');
const { DEFAULT_USER_AVATAR_URL } = require('../helpers/avatarDefaults');
const {
  getSocialAuthConfig,
  getPublicSocialAuthConfig,
} = require('../helpers/socialAuthConfig');
const {
  createSession,
  notifySuspiciousLogin,
  signTwoFactorTempToken,
  signUserToken,
} = require('../helpers/userSessions');

const SOCIAL_EMAIL_DOMAIN = 'social.syncchat.local';

const createError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const normalizeUsernameSeed = (value = '') =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);

const buildSyntheticEmail = ({ provider, providerUserId }) =>
  `${provider}_${providerUserId}@${SOCIAL_EMAIL_DOMAIN}`;

const mergeSocialAccounts = ({ current = [], next }) => {
  const list = asArray(current).filter(
    (item) => item?.provider && item?.providerId
  );
  const exists = list.find(
    (item) =>
      item.provider === next.provider &&
      String(item.providerId) === String(next.providerId)
  );

  if (exists) {
    return list.map((item) =>
      item.provider === next.provider &&
      String(item.providerId) === String(next.providerId)
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

const buildLoginPayload = async ({ user, req, authProvider }) => {
  if (user?.status === 'blocked') throw createError(403, 'Account is blocked');
  if (user?.status === 'banned') {
    throw createError(403, 'You are banned from SyncChat.');
  }
  if (user?.status === 'deleted') throw createError(403, 'Account is deleted');

  const setting = await SettingModel.findOne({
    where: { userId: user._id },
    attributes: ['twoFactorEnabled', 'twoFactorSecret'],
  });

  if (setting?.twoFactorEnabled && setting?.twoFactorSecret) {
    return {
      requiresTwoFactor: true,
      tempToken: signTwoFactorTempToken({ userId: user._id }),
    };
  }

  const session = await createSession({
    userId: user._id,
    req,
    authProvider,
  });
  notifySuspiciousLogin(session);

  return {
    requiresTwoFactor: false,
    token: signUserToken({ userId: user._id, sessionId: session._id }),
  };
};

const verifyGooglePayload = async ({ credential }, config) => {
  if (!config.google.enabled) throw createError(403, 'Google login is disabled');
  if (!config.google.clientId) {
    throw createError(503, 'Google login is not configured');
  }
  if (!credential) throw createError(400, 'Google credential is required');

  const { data } = await axios.get('https://oauth2.googleapis.com/tokeninfo', {
    params: { id_token: credential },
    timeout: 12000,
  });

  if (String(data?.aud || '') !== config.google.clientId) {
    throw createError(401, 'Google token audience mismatch');
  }
  if (!data?.sub) throw createError(401, 'Invalid Google account payload');

  return {
    provider: 'google',
    providerUserId: String(data.sub),
    email: String(data.email || '').trim().toLowerCase() || null,
    fullname: String(data.name || data.given_name || 'Google User').trim(),
    usernameHint: String(
      data.email || data.name || data.given_name || 'google_user'
    )
      .split('@')[0]
      .trim(),
    avatar: data.picture || null,
  };
};

const verifyFacebookPayload = async ({ accessToken }, config) => {
  if (!config.facebook.enabled) {
    throw createError(403, 'Facebook login is disabled');
  }
  if (!config.facebook.appId || !config.facebook.appSecret) {
    throw createError(503, 'Facebook login is not fully configured');
  }
  if (!accessToken) {
    throw createError(400, 'Facebook access token is required');
  }

  const appAccessToken = `${config.facebook.appId}|${config.facebook.appSecret}`;
  const debug = await axios.get('https://graph.facebook.com/debug_token', {
    params: {
      input_token: accessToken,
      access_token: appAccessToken,
    },
    timeout: 12000,
  });
  const debugData = debug?.data?.data || {};
  if (
    debugData.is_valid !== true ||
    String(debugData.app_id || '') !== String(config.facebook.appId)
  ) {
    throw createError(401, 'Facebook access token is not valid for this app');
  }

  const { data } = await axios.get('https://graph.facebook.com/me', {
    params: {
      fields: 'id,name,email,picture.width(256).height(256)',
      access_token: accessToken,
    },
    timeout: 12000,
  });

  if (!data?.id) throw createError(401, 'Invalid Facebook account payload');

  return {
    provider: 'facebook',
    providerUserId: String(data.id),
    email:
      String(data.email || '').trim().toLowerCase() ||
      buildSyntheticEmail({
        provider: 'facebook',
        providerUserId: String(data.id),
      }),
    fullname: String(data.name || 'Facebook User').trim(),
    usernameHint: String(data.name || `facebook_${data.id}`).trim(),
    avatar: data?.picture?.data?.url || null,
  };
};

const verifyTelegramPayload = async ({ telegram }, config) => {
  if (!config.telegram.enabled) {
    throw createError(403, 'Telegram login is disabled');
  }
  const botToken = String(config.telegram.botToken || '');
  if (!config.telegram.botUsername || !botToken) {
    throw createError(503, 'Telegram login is not fully configured');
  }
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

  const expectedBuffer = Buffer.from(expectedHash, 'hex');
  const actualBuffer = Buffer.from(hash, 'hex');
  if (
    expectedBuffer.length !== actualBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, actualBuffer)
  ) {
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
    [compact.first_name || '', compact.last_name || ''].join(' ').trim() ||
      'Telegram User'
  );

  return {
    provider: 'telegram',
    providerUserId,
    email: buildSyntheticEmail({ provider: 'telegram', providerUserId }),
    fullname,
    usernameHint: String(
      compact.username || compact.first_name || `telegram_${providerUserId}`
    ),
    avatar: compact.photo_url || null,
  };
};

const verifySocialPayload = async ({ provider, payload, config }) => {
  if (provider === 'google') return verifyGooglePayload(payload || {}, config);
  if (provider === 'facebook') {
    return verifyFacebookPayload(payload || {}, config);
  }
  if (provider === 'telegram') {
    return verifyTelegramPayload(payload || {}, config);
  }
  throw createError(400, 'Unsupported social provider');
};

const findUserBySocialIdentity = async ({ email, provider, providerUserId }) => {
  if (email) {
    const user = await UserModel.findOne({ where: { email } });
    if (user) return user;
  }

  const profiles = await ProfileModel.findAll({
    attributes: ['userId', 'socialAccounts'],
  });
  const profile = profiles
    .map((item) => (item?.get ? item.get({ plain: true }) : item))
    .find((item) =>
      asArray(item?.socialAccounts).some(
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
    const fullname =
      String(socialData.fullname || username).trim().slice(0, 32) || username;
    const email =
      String(socialData.email || '').trim().toLowerCase() ||
      buildSyntheticEmail({
        provider: socialData.provider,
        providerUserId: socialData.providerUserId,
      });

    user = await UserModel.create({
      username,
      fullname,
      email,
      password: encrypt(crypto.randomBytes(32).toString('hex')),
      verified: true,
      otp: null,
    });

    await SettingModel.create(await applyDefaultSettings({ userId: user._id }));
    await ProfileModel.create({
      userId: user._id,
      username,
      fullname,
      email,
      avatar: socialData.avatar || DEFAULT_USER_AVATAR_URL,
      socialAccounts: [socialAccount],
    });

    return { user, created: true };
  }

  const profile = await ProfileModel.findOne({ where: { userId: user._id } });
  if (profile) {
    await profile.update({
      socialAccounts: mergeSocialAccounts({
        current: profile.socialAccounts,
        next: socialAccount,
      }),
      avatar: profile.avatar || socialData.avatar || DEFAULT_USER_AVATAR_URL,
      fullname: profile.fullname || socialData.fullname || user.fullname,
      email: profile.email || user.email,
    });
  }

  if (!user.verified) await user.update({ verified: true, otp: null });
  return { user, created: false };
};

exports.socialConfig = async (req, res) => {
  try {
    response({ res, payload: await getPublicSocialAuthConfig() });
  } catch (error0) {
    response({
      res,
      statusCode: error0.statusCode || 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.socialAuth = async (req, res) => {
  try {
    const provider = String(req.body?.provider || '')
      .trim()
      .toLowerCase();
    const payload = req.body?.payload || {};
    const config = await getSocialAuthConfig();
    const socialData = await verifySocialPayload({ provider, payload, config });
    const { user, created } = await upsertSocialUser(socialData);
    const loginPayload = await buildLoginPayload({
      user,
      req,
      authProvider: provider || 'social',
    });

    response({
      res,
      statusCode: created ? 201 : 200,
      message: created
        ? `Account created with ${provider}`
        : `Signed in with ${provider}`,
      payload: loginPayload,
    });
  } catch (error0) {
    response({
      res,
      statusCode: error0.statusCode || error0.response?.status || 500,
      success: false,
      message:
        error0.statusCode || !error0.response
          ? error0.message
          : 'Social provider verification failed',
    });
  }
};
