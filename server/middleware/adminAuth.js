const AdminModel = require('../db/models/admin');
const AdminSessionModel = require('../db/models/adminSession');
const response = require('../helpers/response');
const { markSessionSeen, verifyAdminToken } = require('../helpers/adminSessions');
const { ensureDefaultRoles, resolveRolePermissions } = require('../helpers/adminPermissions');

module.exports = async (req, res, next) => {
  try {
    const headers = req.headers.authorization;
    const token = headers ? headers.split(' ')[1] : null;

    if (!token) {
      throw new Error('Missing admin token');
    }

    const payload = verifyAdminToken(token);
    if (!payload?.aid) throw new Error('Invalid admin token');

    const admin = await AdminModel.findOne({ where: { _id: payload.aid } });
    if (!admin || !admin.active) throw new Error('Admin access denied');

    if (payload?.sid) {
      const session = await AdminSessionModel.findOne({
        where: { _id: payload.sid, adminId: admin._id },
      });

      if (!session || session.revokedAt) {
        throw new Error('Session expired');
      }

      req.adminSession = session;
      markSessionSeen(session);
    } else {
      req.adminSession = null;
    }

    await ensureDefaultRoles();
    req.adminPermissions = await resolveRolePermissions({
      roleId: admin.roleId,
      roleName: admin.role,
    });
    req.admin = admin;
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
