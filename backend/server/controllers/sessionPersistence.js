const UserModel = require('../db/models/user');
const UserSessionModel = require('../db/models/userSession');
const response = require('../helpers/response');
const {
  markSessionSeen,
  revokeSession,
  signRefreshToken,
  signUserToken,
  verifyRefreshToken,
} = require('../helpers/userSessions');

const createError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const assertActiveUser = (user) => {
  if (!user) throw createError(401, 'Account not found');
  if (user.status === 'blocked') throw createError(403, 'Account is blocked');
  if (user.status === 'banned') throw createError(403, 'You are banned from SyncChat.');
  if (user.status === 'deleted') throw createError(403, 'Account is deleted');
};

const issuePair = ({ userId, sessionId }) => ({
  token: signUserToken({ userId, sessionId }),
  refreshToken: signRefreshToken({ userId, sessionId }),
});

exports.persist = async (req, res) => {
  try {
    if (!req.user?._id || !req.session?._id) {
      throw createError(401, 'Authenticated session is required');
    }
    response({
      res,
      payload: issuePair({
        userId: req.user._id,
        sessionId: req.session._id,
      }),
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

exports.refresh = async (req, res) => {
  try {
    const refreshToken = String(req.body?.refreshToken || '').trim();
    if (!refreshToken) throw createError(401, 'Refresh token is required');

    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch (error0) {
      throw createError(401, error0.message || 'Refresh session expired');
    }

    const [user, session] = await Promise.all([
      UserModel.findOne({ where: { _id: payload._id } }),
      UserSessionModel.findOne({
        where: { _id: payload.sid, userId: payload._id },
      }),
    ]);
    assertActiveUser(user);
    if (!session || session.revokedAt) {
      throw createError(401, 'Session expired or was signed out');
    }

    await markSessionSeen(session);
    response({
      res,
      payload: issuePair({
        userId: payload._id,
        sessionId: payload.sid,
      }),
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

exports.logout = async (req, res) => {
  try {
    if (req.session) {
      await revokeSession({ session: req.session, reason: 'mobile-logout' });
    }
    response({ res, message: 'Signed out successfully' });
  } catch (error0) {
    response({
      res,
      statusCode: error0.statusCode || 500,
      success: false,
      message: error0.message,
    });
  }
};
