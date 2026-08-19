const UserModel = require('../db/models/user');
const UserSessionModel = require('../db/models/userSession');
const AdminModel = require('../db/models/admin');
const AdminSessionModel = require('../db/models/adminSession');
const { verifyToken } = require('../helpers/userSessions');
const { verifyAdminToken } = require('../helpers/adminSessions');
const logger = require('../helpers/logger');

const touchSeen = async (session) => {
  if (!session || session.revokedAt) return;
  const lastSeen = new Date(session.lastSeenAt || 0).getTime();
  if (Date.now() - lastSeen < 60 * 1000) return;
  await session.update({ lastSeenAt: new Date() }).catch(() => {});
};

const authenticateUser = async (token) => {
  const decoded = verifyToken(token);
  const userId = decoded?._id;
  if (!userId || !decoded?.sid || decoded?.typ !== 'access') {
    throw new Error('Invalid user session');
  }

  const user = await UserModel.findOne({ where: { _id: userId } });
  if (
    !user ||
    !user.verified ||
    ['banned', 'blocked', 'deleted'].includes(String(user.status || ''))
  ) {
    throw new Error('User account is not active');
  }

  const session = await UserSessionModel.findOne({
    where: { _id: decoded.sid, userId },
  });
  if (!session || session.revokedAt) {
    throw new Error('User session is no longer active');
  }
  await touchSeen(session);

  return {
    authType: 'user',
    userId: String(userId),
    sessionId: String(decoded.sid),
    user,
  };
};

const authenticateAdmin = async (token) => {
  const decoded = verifyAdminToken(token);
  const adminId = decoded?.aid;
  if (!adminId || !decoded?.sid || decoded?.typ !== 'admin-access') {
    throw new Error('Invalid admin session');
  }

  const admin = await AdminModel.findOne({ where: { _id: adminId } });
  if (!admin || admin.active === false || admin.status === 'disabled') {
    throw new Error('Admin account is not active');
  }

  const session = await AdminSessionModel.findOne({
    where: { _id: decoded.sid, adminId },
  });
  if (!session || session.revokedAt) {
    throw new Error('Admin session is no longer active');
  }
  await touchSeen(session);

  return {
    authType: 'admin',
    adminId: String(adminId),
    sessionId: String(decoded.sid),
    admin,
  };
};

const applyVerifiedIdentity = (socket, packet) => {
  const [event, payload] = packet || [];
  if (!event) return;
  const name = String(event);

  if (socket.authType === 'admin') {
    if (!name.startsWith('admin/')) {
      const error = new Error('Admin socket cannot emit user events');
      error.data = { code: 'SOCKET_SCOPE_DENIED' };
      throw error;
    }
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      if ('adminId' in payload) payload.adminId = socket.adminId;
      if ('actorId' in payload) payload.actorId = socket.adminId;
    }
    return;
  }

  if (name.startsWith('admin/')) {
    const error = new Error('User socket cannot emit admin events');
    error.data = { code: 'SOCKET_SCOPE_DENIED' };
    throw error;
  }

  if (name === 'user/connect' || name === 'user/disconnect') {
    packet[1] = socket.userId;
    return;
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return;

  ['userId', 'senderId', 'fromUserId', 'actorId'].forEach((field) => {
    if (field in payload) payload[field] = socket.userId;
  });

  if ((name === 'group/create' || name === 'channel/create') && 'adminId' in payload) {
    payload.adminId = socket.userId;
  }
};

const installSocketAuthentication = (io) => {
  if (!io) return;

  io.use(async (socket, next) => {
    try {
      const userToken = String(socket.handshake?.auth?.token || '').trim();
      const adminToken = String(socket.handshake?.auth?.adminToken || '').trim();

      if (adminToken) {
        Object.assign(socket, await authenticateAdmin(adminToken));
      } else if (userToken) {
        Object.assign(socket, await authenticateUser(userToken));
      } else {
        const error = new Error('Authentication required');
        error.data = { code: 'SOCKET_AUTH_REQUIRED' };
        next(error);
        return;
      }

      socket.use((packet, packetNext) => {
        try {
          applyVerifiedIdentity(socket, packet);
          packetNext();
        } catch (error0) {
          packetNext(error0);
        }
      });

      next();
    } catch (error0) {
      logger.warn('SOCKET_AUTH_REJECTED', {
        socketId: socket.id,
        message: error0.message,
      });
      const error = new Error('Socket authentication failed');
      error.data = { code: 'SOCKET_AUTH_INVALID' };
      next(error);
    }
  });
};

module.exports = {
  installSocketAuthentication,
};
