const response = require('../helpers/response');
const UserModel = require('../db/models/user');
const UserSessionModel = require('../db/models/userSession');
const { markSessionSeen, verifyToken } = require('../helpers/userSessions');

module.exports = async (req, res, next) => {
  try {
    const headers = req.headers.authorization;
    const token = headers ? headers.split(' ')[1] : null;

    req.user = verifyToken(token);
    if (!req.user?._id) {
      throw new Error('Invalid session');
    }

    const user = await UserModel.findOne({ where: { _id: req.user._id } });
    if (!user) {
      throw new Error('Account not found');
    }
    if (user.status === 'blocked') {
      throw new Error('Account is blocked');
    }
    if (user.status === 'banned') {
      throw new Error('You are banned from SyncChat.');
    }
    if (user.status === 'deleted') {
      throw new Error('Account is deleted');
    }

    if (req.user?.sid) {
      const session = await UserSessionModel.findOne({
        where: { _id: req.user.sid, userId: req.user._id },
      });

      if (!session || session.revokedAt) {
        throw new Error('Session expired');
      }

      req.session = session;
      markSessionSeen(session);
    } else {
      req.session = null;
    }
    next();
  } catch (error0) {
    response({
      res,
      statusCode: 401,
      success: false,
      message: error0.message,
    });
  }
};
