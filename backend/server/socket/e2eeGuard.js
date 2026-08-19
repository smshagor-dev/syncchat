const { Op } = require('sequelize');
const InboxModel = require('../db/models/inbox');
const ChatModel = require('../db/models/chat');
const { asArray, toPlainMany } = require('../db/utils');
const logger = require('../helpers/logger');

const rejection = (socket, eventName, roomId, message, code) => {
  if (eventName === 'chat/forward') {
    socket.emit('chat/forward-blocked', { roomId, message, code });
  } else {
    socket.emit('chat/error', { roomId, message, code });
  }
  const error = new Error(message);
  error.data = { code, roomId };
  return error;
};

const installE2eeSocketGuard = (socket) => {
  if (!socket || socket.authType !== 'user' || socket.__syncchatE2eeGuard) return;
  socket.__syncchatE2eeGuard = true;

  socket.use(async (packet, next) => {
    const [eventName, payload = {}] = packet || [];
    if (!String(eventName || '').startsWith('chat/')) {
      next();
      return;
    }

    try {
      if (eventName === 'chat/insert') {
        const roomId = String(payload?.roomId || '');
        if (!roomId) {
          next();
          return;
        }
        const inbox = await InboxModel.findOne({ where: { roomId } });
        if (
          inbox?.roomType === 'private' &&
          inbox?.e2eeEnabled &&
          String(payload?.text || '').trim() &&
          !payload?.e2eeEnvelope
        ) {
          next(rejection(socket, eventName, roomId, 'This chat requires device E2EE. Plaintext message rejected.', 'E2EE_REQUIRED'));
          return;
        }
      }

      if (eventName === 'chat/edit') {
        const roomId = String(payload?.roomId || '');
        const chatId = String(payload?.chatId || '');
        if (roomId && chatId) {
          const [inbox, chat] = await Promise.all([
            InboxModel.findOne({ where: { roomId } }),
            ChatModel.findOne({ where: { _id: chatId, roomId } }),
          ]);
          if (inbox?.e2eeEnabled || chat?.e2eeEnvelope) {
            next(rejection(socket, eventName, roomId, 'Editing is disabled for device-E2EE messages until encrypted edit envelopes are supported.', 'E2EE_EDIT_BLOCKED'));
            return;
          }
        }
      }

      if (eventName === 'chat/forward') {
        const fromRoomId = String(payload?.fromRoomId || '');
        const chatsId = asArray(payload?.chatsId).filter(Boolean).slice(0, 500);
        if (fromRoomId && chatsId.length) {
          const [inbox, chats] = await Promise.all([
            InboxModel.findOne({ where: { roomId: fromRoomId } }),
            ChatModel.findAll({ where: { _id: { [Op.in]: chatsId }, roomId: fromRoomId } }),
          ]);
          const hasE2ee = !!inbox?.e2eeEnabled || toPlainMany(chats).some((chat) => !!chat.e2eeEnvelope);
          if (hasE2ee) {
            next(rejection(socket, eventName, fromRoomId, 'Forwarding device-E2EE messages is disabled to prevent plaintext downgrade.', 'E2EE_FORWARD_BLOCKED'));
            return;
          }
        }
      }

      next();
    } catch (error0) {
      logger.warn('E2EE_SOCKET_GUARD_ERROR', {
        userId: socket.userId,
        eventName,
        message: error0.message,
      });
      next(error0);
    }
  });
};

module.exports = {
  installE2eeSocketGuard,
};
