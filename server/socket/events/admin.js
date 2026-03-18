const AdminModel = require('../../db/models/admin');
const AdminSessionModel = require('../../db/models/adminSession');
const { verifyAdminToken, markSessionSeen } = require('../../helpers/adminSessions');
const {
  ensureDefaultRoles,
  resolveRolePermissions,
  hasPermission,
  PERMISSIONS,
} = require('../../helpers/adminPermissions');
const { getAnalyticsSnapshot } = require('../../controllers/admin');

const extractToken = (payload) => {
  if (!payload) return null;
  if (typeof payload === 'string') return payload;
  if (typeof payload?.token === 'string') return payload.token;
  return null;
};

const authenticateAdmin = async (token) => {
  if (!token) throw new Error('Missing admin token');
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
    markSessionSeen(session);
  }

  await ensureDefaultRoles();
  const permissions = await resolveRolePermissions({
    roleId: admin.roleId,
    roleName: admin.role,
  });

  return { admin, permissions };
};

module.exports = (socket) => {
  const sendError = (message) => {
    socket.emit('admin/error', { message: message || 'Unauthorized' });
  };

  socket.on('admin/connect', async (args = {}, callback) => {
    try {
      const token = extractToken(args);
      const { admin, permissions } = await authenticateAdmin(token);
      socket.adminId = admin._id;
      socket.adminPermissions = permissions;
      socket.join(`admin:${admin._id}`);
      socket.emit('admin/connected', {
        adminId: admin._id,
        permissions,
      });
      if (typeof callback === 'function') callback({ ok: true });
    } catch (error0) {
      sendError(error0.message);
      if (typeof callback === 'function') {
        callback({ ok: false, message: error0.message });
      }
    }
  });

  socket.on('admin/analytics/subscribe', async (args = {}, callback) => {
    try {
      if (!socket.adminId) {
        const token = extractToken(args);
        const { admin, permissions } = await authenticateAdmin(token);
        socket.adminId = admin._id;
        socket.adminPermissions = permissions;
        socket.join(`admin:${admin._id}`);
      }

      const allowed = hasPermission({
        permissions: socket.adminPermissions || [],
        needed: PERMISSIONS.ANALYTICS_READ,
      });

      if (!allowed) {
        throw new Error('Insufficient admin permissions');
      }

      socket.join('admin:analytics');
      const snapshot = await getAnalyticsSnapshot({ force: false });
      socket.emit('admin/analytics', snapshot);
      if (typeof callback === 'function') callback({ ok: true });
    } catch (error0) {
      sendError(error0.message);
      if (typeof callback === 'function') {
        callback({ ok: false, message: error0.message });
      }
    }
  });

  socket.on('admin/analytics/unsubscribe', () => {
    socket.leave('admin:analytics');
  });
};
