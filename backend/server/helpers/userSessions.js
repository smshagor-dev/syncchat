const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const UserSessionModel = require('../db/models/userSession');
const { toPlainMany } = require('../db/utils');
const { getClientIp } = require('./clientIp');
const {
  JWT_SECRET,
  JWT_ISSUER,
  TWO_FACTOR_TOKEN_TTL,
  USER_ACCESS_TOKEN_TTL,
  USER_REFRESH_TOKEN_TTL,
  USER_AUDIENCE,
} = require('./jwtConfig');

const SESSION_ACTIVITY_THROTTLE_MS = 60 * 1000;

const maskIp = (value = '') => {
  const ip = String(value || '').trim();
  if (!ip) return 'Unknown network';
  if (ip === '127.0.0.1' || ip === '::1') return 'Localhost';
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)) {
    return `Private network (${ip})`;
  }
  const ipv4 = ip.split('.');
  if (ipv4.length === 4) {
    return `IP ${ipv4[0]}.${ipv4[1]}.${ipv4[2]}.x`;
  }
  return `IP ${ip}`;
};

const parseBrowser = (ua = '') => {
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\//.test(ua)) return 'Opera';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return 'Safari';
  return 'Browser';
};

const parseOs = (ua = '') => {
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Android/i.test(ua)) return 'Android';
  if (/(iPhone|iPad|iPod)/i.test(ua)) return 'iOS';
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macOS';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'Unknown OS';
};

const parseDeviceType = (ua = '') => {
  if (/iPad|Tablet/i.test(ua)) return 'tablet';
  if (/Mobile|Android|iPhone/i.test(ua)) return 'mobile';
  return 'desktop';
};

const buildFingerprint = ({ userAgent, acceptLanguage }) =>
  crypto
    .createHash('sha256')
    .update(`${String(userAgent || '')}::${String(acceptLanguage || '')}`)
    .digest('hex');

const describeDevice = ({ browser, os, deviceType }) => {
  if (deviceType === 'mobile') return `${browser} on ${os} phone`;
  if (deviceType === 'tablet') return `${browser} on ${os} tablet`;
  return `${browser} on ${os}`;
};

const buildSessionMetaFromRequest = (req) => {
  const userAgent = String(req.headers['user-agent'] || '');
  const browser = parseBrowser(userAgent);
  const os = parseOs(userAgent);
  const deviceType = parseDeviceType(userAgent);
  const ipAddress = getClientIp(req);
  const fingerprint = buildFingerprint({
    userAgent,
    acceptLanguage: req.headers['accept-language'],
  });

  return {
    browser,
    os,
    deviceType,
    userAgent,
    ipAddress,
    fingerprint,
    deviceName: describeDevice({ browser, os, deviceType }),
    locationLabel: maskIp(ipAddress),
  };
};

const signUserToken = ({ userId, sessionId }) => {
  if (!userId || !sessionId) throw new Error('User and session are required');
  return jwt.sign(
    { _id: userId, sid: sessionId, typ: 'access' },
    JWT_SECRET,
    {
      expiresIn: USER_ACCESS_TOKEN_TTL,
      issuer: JWT_ISSUER,
      audience: USER_AUDIENCE,
      subject: String(userId),
    }
  );
};

const signRefreshToken = ({ userId, sessionId }) => {
  if (!userId || !sessionId) throw new Error('User and session are required');
  return jwt.sign(
    { _id: userId, sid: sessionId, typ: 'refresh' },
    JWT_SECRET,
    {
      expiresIn: USER_REFRESH_TOKEN_TTL,
      issuer: JWT_ISSUER,
      audience: USER_AUDIENCE,
      subject: String(userId),
    }
  );
};

const signTwoFactorTempToken = ({ userId, pendingSessionId }) =>
  jwt.sign(
    {
      _id: userId,
      purpose: 'user-2fa',
      ...(pendingSessionId ? { psid: pendingSessionId } : {}),
    },
    JWT_SECRET,
    {
      expiresIn: TWO_FACTOR_TOKEN_TTL,
      issuer: JWT_ISSUER,
      audience: USER_AUDIENCE,
      subject: String(userId),
    }
  );

const verifyToken = (token) => {
  if (!token) throw new Error('Missing session token');
  return jwt.verify(token, JWT_SECRET, {
    issuer: JWT_ISSUER,
    audience: USER_AUDIENCE,
  });
};

const verifyRefreshToken = (token) => {
  const payload = verifyToken(token);
  if (!payload?._id || !payload?.sid || payload?.typ !== 'refresh') {
    throw new Error('Invalid refresh session');
  }
  return payload;
};

const createSession = async ({ userId, req, authProvider = 'password' }) => {
  const meta = buildSessionMetaFromRequest(req);
  const previousSessions = await UserSessionModel.findAll({
    where: {
      userId,
      revokedAt: null,
    },
    order: [['createdAt', 'DESC']],
    limit: 10,
  });
  const previous = toPlainMany(previousSessions);

  const seenFingerprint = previous.some((item) => item.fingerprint === meta.fingerprint);
  const seenIp = previous.some((item) => item.ipAddress === meta.ipAddress);

  const reasons = [];
  if (!seenFingerprint && previous.length > 0) reasons.push('New device');
  if (!seenIp && previous.length > 0) reasons.push('New network');

  const session = await UserSessionModel.create({
    userId,
    authProvider,
    deviceName: meta.deviceName,
    deviceType: meta.deviceType,
    browser: meta.browser,
    os: meta.os,
    userAgent: meta.userAgent,
    ipAddress: meta.ipAddress,
    locationLabel: meta.locationLabel,
    fingerprint: meta.fingerprint,
    suspicious: reasons.length > 0,
    suspiciousReason: reasons.join(', '),
    lastSeenAt: new Date(),
  });

  return session;
};

const markSessionSeen = async (session) => {
  if (!session || session.revokedAt) return;
  const lastSeenAt = new Date(session.lastSeenAt || 0).getTime();
  if (Date.now() - lastSeenAt < SESSION_ACTIVITY_THROTTLE_MS) return;
  await session.update({ lastSeenAt: new Date() }).catch(() => {});
};

const revokeSession = async ({ session, reason = 'manual' }) => {
  if (!session || session.revokedAt) return session;
  await session.update({
    revokedAt: new Date(),
    revokedReason: reason,
  });
  return session;
};

const serializeSession = (session, currentSessionId = null) => {
  const plain = session?.get ? session.get({ plain: true }) : session;
  if (!plain) return null;
  return {
    _id: plain._id,
    authProvider: plain.authProvider,
    deviceName: plain.deviceName,
    deviceType: plain.deviceType,
    browser: plain.browser,
    os: plain.os,
    ipAddress: plain.ipAddress,
    locationLabel: plain.locationLabel,
    suspicious: !!plain.suspicious,
    suspiciousReason: plain.suspiciousReason || '',
    lastSeenAt: plain.lastSeenAt,
    createdAt: plain.createdAt,
    revokedAt: plain.revokedAt,
    revokedReason: plain.revokedReason,
    isCurrent: plain._id === currentSessionId,
    isActive: !plain.revokedAt,
  };
};

const notifySuspiciousLogin = (session) => {
  if (!session?.suspicious || !global?.io) return;
  global.io.to(session.userId).emit('system', {
    type: 'suspicious-login',
    text: `Suspicious login detected: ${session.deviceName} from ${session.locationLabel}.`,
  });
};

const listSessions = async ({ userId, currentSessionId = null }) => {
  const rows = await UserSessionModel.findAll({
    where: { userId },
    order: [
      ['revokedAt', 'ASC'],
      ['lastSeenAt', 'DESC'],
      ['createdAt', 'DESC'],
    ],
  });
  return rows.map((row) => serializeSession(row, currentSessionId));
};

const revokeOtherSessions = async ({ userId, currentSessionId }) => {
  const rows = await UserSessionModel.findAll({
    where: {
      userId,
      revokedAt: null,
      _id: { [Op.ne]: currentSessionId },
    },
  });
  await Promise.all(
    rows.map((row) => revokeSession({ session: row, reason: 'remote-logout' }))
  );
  return rows.length;
};

const revokeAllSessions = async ({ userId, reason = 'security-reset' }) => {
  const rows = await UserSessionModel.findAll({
    where: { userId, revokedAt: null },
  });
  await Promise.all(rows.map((row) => revokeSession({ session: row, reason })));
  return rows.length;
};

module.exports = {
  JWT_SECRET,
  createSession,
  getClientIp,
  listSessions,
  markSessionSeen,
  notifySuspiciousLogin,
  revokeAllSessions,
  revokeOtherSessions,
  revokeSession,
  serializeSession,
  signRefreshToken,
  signTwoFactorTempToken,
  signUserToken,
  verifyRefreshToken,
  verifyToken,
};
