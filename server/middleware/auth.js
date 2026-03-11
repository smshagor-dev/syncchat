const response = require('../helpers/response');
const UserSessionModel = require('../db/models/userSession');
const { markSessionSeen, verifyToken } = require('../helpers/userSessions');

module.exports = async (req, res, next) => {
  try {
    const headers = req.headers.authorization;
    const token = headers ? headers.split(' ')[1] : null;

    req.user = verifyToken(token);

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
