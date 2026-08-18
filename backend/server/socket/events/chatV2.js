const { Op } = require('sequelize');
const ChatModel = require('../../db/models/chat');
const InboxModel = require('../../db/models/inbox');
const MessageReceiptModel = require('../../db/models/messageReceipt');
const { asArray, toPlain, toPlainMany } = require('../../db/utils');
const logger = require('../../helpers/logger');

const ensureRoomMember = async ({ roomId, userId }) => {
  const inbox = await InboxModel.findOne({ where: { roomId } });
  if (!inbox || !asArray(inbox.ownersId).includes(userId)) return null;
  return inbox;
};

const upsertReceipt = async ({ chatId, roomId, userId, sessionId, type }) => {
  let row = await MessageReceiptModel.findOne({
    where: {
      chatId,
      userId,
      sessionId: sessionId || null,
    },
  });
  const now = new Date();
  const patch = {
    chatId,
    roomId,
    userId,
    sessionId: sessionId || null,
    ...(type === 'read'
      ? { deliveredAt: row?.deliveredAt || now, readAt: now }
      : { deliveredAt: row?.deliveredAt || now }),
  };
  if (row) await row.update(patch);
  else row = await MessageReceiptModel.create(patch);
  return toPlain(row);
};

module.exports = (socket) => {
  if (socket.authType !== 'user') return;

  socket.on('chat/receipt', async (payload = {}) => {
    try {
      const chatId = String(payload.chatId || '');
      const roomId = String(payload.roomId || '');
      const type = payload.type === 'read' ? 'read' : 'delivered';
      if (!chatId || !roomId) return;
      if (!(await ensureRoomMember({ roomId, userId: socket.userId }))) return;

      const chat = await ChatModel.findOne({ where: { _id: chatId, roomId } });
      if (!chat || chat.userId === socket.userId) return;

      const receipt = await upsertReceipt({
        chatId,
        roomId,
        userId: socket.userId,
        sessionId: socket.sessionId,
        type,
      });

      if (type === 'read') {
        await chat.update({ delivered: true, readed: true }).catch(() => {});
      } else if (!chat.delivered) {
        await chat.update({ delivered: true }).catch(() => {});
      }

      const event = { chatId, roomId, type, receipt };
      if (global?.io) {
        global.io.to(roomId).emit('chat/receipt', event);
        global.io.to(chat.userId).emit('chat/receipt', event);
      }
    } catch (error0) {
      logger.warn('CHAT_RECEIPT_ERROR', { message: error0.message, userId: socket.userId });
    }
  });

  socket.on('chat/sync-request', async (payload = {}, ack) => {
    try {
      const roomId = String(payload.roomId || '');
      const afterSequence = Math.max(0, Number(payload.afterSequence || 0));
      const limit = Math.min(250, Math.max(1, Number(payload.limit || 100)));
      if (!roomId || !(await ensureRoomMember({ roomId, userId: socket.userId }))) {
        if (typeof ack === 'function') ack({ success: false, message: 'Forbidden' });
        return;
      }

      const rows = await ChatModel.findAll({
        where: {
          roomId,
          sequence: { [Op.gt]: afterSequence },
        },
        order: [['sequence', 'ASC']],
        limit,
      });
      const messages = toPlainMany(rows).filter(
        (chat) => !asArray(chat.deletedBy).includes(socket.userId)
      );
      const result = {
        success: true,
        roomId,
        messages,
        lastSequence: messages.length
          ? Number(messages[messages.length - 1].sequence || afterSequence)
          : afterSequence,
        hasMore: messages.length >= limit,
      };
      socket.emit('chat/sync-result', result);
      if (typeof ack === 'function') ack(result);
    } catch (error0) {
      if (typeof ack === 'function') ack({ success: false, message: error0.message });
    }
  });
};

module.exports.upsertReceipt = upsertReceipt;
