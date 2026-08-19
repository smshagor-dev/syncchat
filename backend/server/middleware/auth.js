const response = require('../helpers/response');
const UserModel = require('../db/models/user');
const UserSessionModel = require('../db/models/userSession');
const { markSessionSeen, verifyToken } = require('../helpers/userSessions');

const isAllowedBeforeVerification = (req) => {
  const path = String(req.originalUrl || req.path || '')
    .split('?')[0]
    .replace(/^\/api/, '');
  const method = String(req.method || 'GET').toUpperCase();

  if (method === 'POST' && ['/users/verify', '/users/verify/resend'].includes(path)) {
    return true;
  }
  // The client needs these two reads to identify the signed-in account and
  // render the verification screen. All chat/content actions remain blocked.
  if (method === 'GET' && ['/users', '/settings'].includes(path)) {
    return true;
  }
  return false;
};

module.exports = async (req, res, next) => {
  try {
    const authorization = String(req.headers.authorization || '');
    const [scheme, token] = authorization.split(/\s+/, 2);
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new Error('Authentication required');
    }

    req.user = verifyToken(token);
    if (!req.user?._id || !req.user?.sid || req.user?.typ !== 'access') {
      throw new Error('Invalid session');
    }

    const user = await UserModel.findOne({ where: { _id: req.user._id } });
    if (!user) throw new Error('Account not found');
    if (user.status === 'blocked') throw new Error('Account is blocked');
    if (user.status === 'banned') throw new Error('You are banned from SyncChat.');
    if (user.status === 'deleted') throw new Error('Account is deleted');

    const session = await UserSessionModel.findOne({
      where: { _id: req.user.sid, userId: req.user._id },
    });
    if (!session || session.revokedAt) throw new Error('Session expired');

    req.session = session;
    req.authUser = user;
    markSessionSeen(session);

    if (!user.verified && !isAllowedBeforeVerification(req)) {
      response({
        res,
        statusCode: 403,
        success: false,
        message: 'Email verification required',
      });
      return;
    }

    next();
  } catch (error0) {
    response({
      res,
      statusCode: 401,
      success: false,
      message: error0.message || 'Unauthorized',
    });
  }
};
