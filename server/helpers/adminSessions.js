const jwt = require('jsonwebtoken');
const AdminSessionModel = require('../db/models/adminSession');

const JWT_SECRET = process.env.JWT_SECRET || 'shhhhh';
const SESSION_ACTIVITY_THROTTLE_MS = 60 * 1000;

const getClientIp = (req) => {
  const forwarded = String(
    req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || ''
  )
    .split(',')[0]
    .trim();
  return String(forwarded || req.ip || req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
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

const buildDeviceName = ({ browser, os }) => `${browser} on ${os}`;

const buildSessionMetaFromRequest = (req) => {
  const userAgent = String(req.headers['user-agent'] || '');
  const browser = parseBrowser(userAgent);
  const os = parseOs(userAgent);
  const ipAddress = getClientIp(req);

  return {
    browser,
    os,
    ipAddress,
    userAgent,
    deviceName: buildDeviceName({ browser, os }),
  };
};

const signAdminToken = ({ adminId, sessionId, role }) =>
  jwt.sign({ aid: adminId, sid: sessionId, role }, JWT_SECRET, { expiresIn: '7d' });

const verifyAdminToken = (token) => jwt.verify(token, JWT_SECRET);

const createAdminSession = async ({ adminId, req }) => {
  const meta = buildSessionMetaFromRequest(req);
  const session = await AdminSessionModel.create({
    adminId,
    deviceName: meta.deviceName,
    browser: meta.browser,
    os: meta.os,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
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
  await session.update({ revokedAt: new Date(), revokedReason: reason });
  return session;
};

const serializeSession = (session, currentSessionId = null) => {
  const plain = session?.get ? session.get({ plain: true }) : session;
  if (!plain) return null;
  return {
    _id: plain._id,
    adminId: plain.adminId,
    deviceName: plain.deviceName,
    browser: plain.browser,
    os: plain.os,
    ipAddress: plain.ipAddress,
    lastSeenAt: plain.lastSeenAt,
    createdAt: plain.createdAt,
    revokedAt: plain.revokedAt,
    revokedReason: plain.revokedReason,
    isCurrent: plain._id === currentSessionId,
    isActive: !plain.revokedAt,
  };
};

const listSessions = async ({ adminId, currentSessionId = null }) => {
  const rows = await AdminSessionModel.findAll({
    where: { adminId },
    order: [
      ['revokedAt', 'ASC'],
      ['lastSeenAt', 'DESC'],
      ['createdAt', 'DESC'],
    ],
  });
  return rows.map((row) => serializeSession(row, currentSessionId));
};

module.exports = {
  buildSessionMetaFromRequest,
  createAdminSession,
  getClientIp,
  listSessions,
  markSessionSeen,
  revokeSession,
  serializeSession,
  signAdminToken,
  verifyAdminToken,
};
