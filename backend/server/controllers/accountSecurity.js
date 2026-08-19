const UserModel = require('../db/models/user');
const response = require('../helpers/response');
const encrypt = require('../helpers/encrypt');
const decrypt = require('../helpers/decrypt');
const { toPlain } = require('../db/utils');
const { revokeOtherSessions } = require('../helpers/userSessions');
const { validatePassword } = require('../helpers/authCodes');

const createError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

exports.changePassword = async (req, res) => {
  try {
    const userId = req.user._id;
    const oldPass = String(req.body?.oldPass || '');
    const newPass = String(req.body?.newPass || '');
    const confirmNewPass = String(req.body?.confirmNewPass || '');

    const user = await UserModel.findOne({ where: { _id: userId } });
    if (!user) throw createError(404, 'User not found');

    try {
      decrypt(oldPass, user.password);
    } catch (error0) {
      throw createError(401, 'Invalid password');
    }
    if (newPass !== confirmNewPass) {
      throw createError(400, "New password doesn't match");
    }
    const passwordError = validatePassword(newPass);
    if (passwordError) throw createError(400, passwordError);
    if (oldPass === newPass) {
      throw createError(400, 'New password must be different from the current password');
    }

    await user.update({ password: encrypt(newPass) });
    const loggedOutSessions = await revokeOtherSessions({
      userId,
      currentSessionId: req.session?._id || null,
    });

    const payload = toPlain(user) || {};
    delete payload.password;
    response({
      res,
      message: 'Password changed successfully',
      payload: { ...payload, loggedOutSessions },
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
