const { Op } = require('sequelize');
const AdminModel = require('../db/models/admin');
const AdminSessionModel = require('../db/models/adminSession');
const encrypt = require('../helpers/encrypt');
const decrypt = require('../helpers/decrypt');
const response = require('../helpers/response');
const { logAdminAction } = require('../helpers/adminAudit');
const { validatePassword } = require('../helpers/authCodes');

const createError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

exports.changePassword = async (req, res) => {
  try {
    const adminId = req.admin?._id;
    const currentPassword = String(req.body.currentPassword || '');
    const newPassword = String(req.body.newPassword || '');
    const confirmPassword = String(req.body.confirmPassword || '');

    if (!adminId) throw createError(401, 'Admin authentication required');
    if (!currentPassword) throw createError(400, 'Current password is required');
    const passwordError = validatePassword(newPassword);
    if (passwordError) throw createError(400, passwordError);
    if (newPassword !== confirmPassword) {
      throw createError(400, 'New password and confirmation do not match');
    }
    if (currentPassword === newPassword) {
      throw createError(400, 'New password must be different from current password');
    }

    const admin = await AdminModel.findOne({ where: { _id: adminId } });
    if (!admin) throw createError(404, 'Admin not found');

    try {
      decrypt(currentPassword, admin.password);
    } catch (error0) {
      throw createError(401, 'Current password is incorrect');
    }

    await admin.update({ password: encrypt(newPassword) });

    const currentSessionId = req.adminSession?._id || null;
    const where = { adminId, revokedAt: null };
    if (currentSessionId) where._id = { [Op.ne]: currentSessionId };

    await AdminSessionModel.update(
      {
        revokedAt: new Date(),
        revokedReason: 'password_changed',
      },
      { where }
    );

    await logAdminAction({
      req,
      adminId,
      action: 'admin.password.change',
      entityType: 'admin',
      entityId: adminId,
    });

    response({
      res,
      message: 'Password changed successfully',
      payload: { otherSessionsRevoked: true },
    });
  } catch (error0) {
    response({
      res,
      statusCode: error0.statusCode || 500,
      success: false,
      message: error0.message || 'Failed to change password',
    });
  }
};
