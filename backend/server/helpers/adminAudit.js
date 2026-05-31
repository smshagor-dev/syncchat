const AdminAuditLogModel = require('../db/models/adminAuditLog');
const { getClientIp } = require('./adminSessions');

const logAdminAction = async ({ req, adminId, action, entityType, entityId, metadata }) => {
  try {
    await AdminAuditLogModel.create({
      adminId: adminId || null,
      action,
      entityType: entityType || null,
      entityId: entityId || null,
      metadata: metadata || null,
      ipAddress: req ? getClientIp(req) : null,
      userAgent: req ? String(req.headers['user-agent'] || '') : null,
    });
  } catch (error0) {
    // best-effort audit logging
  }
};

module.exports = {
  logAdminAction,
};
