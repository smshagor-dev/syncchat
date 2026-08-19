const { io } = global;
const logger = require('../helpers/logger');

const user = require('./events/user');
const chat = require('./events/chat');
const chatV2 = require('./events/chatV2');
const room = require('./events/room');
const group = require('./events/group');
const channel = require('./events/channel');
const admin = require('./events/admin');
const { wrapReliableChatInsert } = require('../helpers/chatReliability');

io.on('connection', (socket) => {
  logger.info('SOCKET_CONNECT', {
    socketId: socket.id,
    address: socket.handshake.address,
    authType: socket.authType || null,
    userId: socket.userId || null,
    adminId: socket.adminId || null,
    sessionId: socket.sessionId || null,
  });

  socket.onAny((event, ...args) => {
    logger.info('SOCKET_IN', {
      socketId: socket.id,
      authType: socket.authType || null,
      event,
      args,
    });
  });

  if (typeof socket.onAnyOutgoing === 'function') {
    socket.onAnyOutgoing((event, ...args) => {
      logger.info('SOCKET_OUT', {
        socketId: socket.id,
        event,
        args,
      });
    });
  }

  socket.on('disconnect', (reason) => {
    logger.warn('SOCKET_DISCONNECT', {
      socketId: socket.id,
      authType: socket.authType || null,
      userId: socket.userId || null,
      adminId: socket.adminId || null,
      reason,
    });
  });

  if (socket.authType === 'admin') {
    socket.join(`admin:${socket.adminId}`);
    admin(socket);
    return;
  }

  socket.join(socket.userId);
  user(socket);
  room(socket);
  chat(socket);
  group(socket);
  channel(socket);
  chatV2(socket);

  // Wrap the legacy chat/insert listener after it is registered so existing
  // moderation/file/secret-chat behavior is preserved while adding idempotency,
  // monotonic room sequence numbers, mention metadata and message requests.
  wrapReliableChatInsert(socket);
});
