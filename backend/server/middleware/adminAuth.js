const AdminModel = require('../db/models/admin');
const AdminSessionModel = require('../db/models/adminSession');
const response = require('../helpers/response');
const { markSessionSeen, verifyAdminToken } = require('../helpers/adminSessions');
const { ensureDefaultRoles, resolveRolePermissions } = require('../helpers/adminPermissions');

module.exports = async (req, res, next) => {
  try {
    const authorization = String(req.headers.authorization || '');
    const [scheme, token] = authorization.split(/\s+/, 2);
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new Error('Missing admin token');
    }

    const payload = verifyAdminToken(token);
    if (!payload?.aid || !payload?.sid || payload?.typ !== 'admin-access') {
      throw new Error('Invalid admin session');
    }

    const admin = await AdminModel.findOne({ where: { _id: payload.aid } });
    if (!admin || !admin.active) throw new Error('Admin access denied');

    const session = await AdminSessionModel.findOne({
      where: { _id: payload.sid, adminId: admin._id },
    });
    if (!session || session.revokedAt) throw new Error('Session expired');

    req.adminSession = session;
    markSessionSeen(session);

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
