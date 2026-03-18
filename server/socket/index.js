const { io } = global;
const logger = require('../helpers/logger');

const user = require('./events/user');
const chat = require('./events/chat');
const room = require('./events/room');
const group = require('./events/group');
const channel = require('./events/channel');
const admin = require('./events/admin');

io.on('connection', (socket) => {
  logger.info('SOCKET_CONNECT', {
    socketId: socket.id,
    address: socket.handshake.address,
  });

  socket.onAny((event, ...args) => {
    logger.info('SOCKET_IN', {
      socketId: socket.id,
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
      reason,
    });
  });

  user(socket);
  room(socket);
  chat(socket);
  group(socket);
  channel(socket);
  admin(socket);
});
