const { randomUUID: uuidv4 } = require('crypto');
const ChatModel = require('../db/models/chat');
const ChatRoomCounterModel = require('../db/models/chatRoomCounter');
const InboxModel = require('../db/models/inbox');
const { asArray, toPlain } = require('../db/utils');
const { assertChatSendAllowed } = require('./chatAbuse');
const { resolveMentions } = require('./chatMentions');
const { upsertMessageRequest } = require('./messageRequests');
const logger = require('./logger');

const nextSequence = async (roomId) => {
  const model = ChatRoomCounterModel.mongoModel;
  const row = await model.findOneAndUpdate(
    { roomId },
    { $inc: { sequence: 1 }, $setOnInsert: { roomId } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );
  return Number(row?.sequence || 0);
};

const findDuplicate = async ({ userId, clientMessageId }) => {
  if (!userId || !clientMessageId) return null;
  return ChatModel.findOne({ where: { userId, clientMessageId } });
};

const findCreatedChat = async ({ roomId, userId, startedAt }) => {
  const chat = await ChatModel.findOne({
    where: { roomId, userId },
    order: [['createdAt', 'DESC']],
  });
  if (!chat) return null;
  const createdAt = new Date(chat.createdAt || 0).getTime();
  if (!Number.isFinite(createdAt) || createdAt < startedAt - 1500) return null;
  return chat;
};

const emitMeta = ({ socket, chat, meta }) => {
  const payload = {
    chatId: chat._id,
    roomId: chat.roomId,
    userId: chat.userId,
    clientMessageId: meta.clientMessageId,
    sequence: meta.sequence,
    mentionUserIds: meta.mentionUserIds,
    topicId: meta.topicId,
    e2eeEnvelope: meta.e2eeEnvelope || null,
    transcript: meta.transcript || '',
  };
  socket.emit('chat/ack', {
    accepted: true,
    duplicate: false,
    ...payload,
  });
  if (global?.io) {
    global.io.to(chat.roomId).emit('chat/meta', payload);
    asArray(meta.ownerIds).forEach((ownerId) => {
      global.io.to(ownerId).emit('chat/meta', payload);
    });
  }
};

const wrapReliableChatInsert = (socket) => {
  if (!socket || socket.authType !== 'user' || socket.__syncchatReliableInsert) return;
  const listeners = socket.listeners('chat/insert');
  if (!listeners.length) return;
  socket.__syncchatReliableInsert = true;
  socket.removeAllListeners('chat/insert');

  socket.on('chat/insert', async (rawArgs = {}) => {
    const original = listeners[0];
    const startedAt = Date.now();
    const args = rawArgs && typeof rawArgs === 'object' ? rawArgs : {};
    args.userId = socket.userId;
    args.clientMessageId = String(args.clientMessageId || uuidv4()).slice(0, 96);

    try {
      const duplicate = await findDuplicate({
        userId: socket.userId,
        clientMessageId: args.clientMessageId,
      });
      if (duplicate) {
        const plain = toPlain(duplicate);
        socket.emit('chat/ack', {
          accepted: true,
          duplicate: true,
          chatId: plain._id,
          roomId: plain.roomId,
          clientMessageId: plain.clientMessageId,
          sequence: Number(plain.sequence || 0),
        });
        return;
      }

      await assertChatSendAllowed({ userId: socket.userId, text: args.text || '' });
      const [sequence, mentions] = await Promise.all([
        nextSequence(args.roomId),
        resolveMentions({
          text: args.text || '',
          roomId: args.roomId,
          roomType: args.roomType,
          senderId: socket.userId,
        }),
      ]);

      const topicId = args.topicId || null;
      const e2eeEnvelope =
        args.e2eeEnvelope && typeof args.e2eeEnvelope === 'object'
          ? args.e2eeEnvelope
          : null;
      const transcript = String(args.transcript || '').slice(0, 8000);

      args.sequence = sequence;
      args.mentionUserIds = mentions.mentionedUserIds;
      args.topicId = topicId;
      args.e2eeEnvelope = e2eeEnvelope;
      args.transcript = transcript;

      await original(args);

      const created = await findCreatedChat({
        roomId: args.roomId,
        userId: socket.userId,
        startedAt,
      });
      if (!created) {
        socket.emit('chat/ack', {
          accepted: false,
          clientMessageId: args.clientMessageId,
          roomId: args.roomId,
          reason: 'message-not-created',
        });
        return;
      }

      const inbox = await InboxModel.findOne({ where: { roomId: args.roomId } });
      const ownerIds = asArray(toPlain(inbox)?.ownersId || args.ownersId);

      emitMeta({
        socket,
        chat: toPlain(created),
        meta: {
          clientMessageId: args.clientMessageId,
          sequence,
          mentionUserIds: mentions.mentionedUserIds,
          topicId,
          e2eeEnvelope,
          transcript,
          ownerIds,
        },
      });

      if (args.roomType === 'private' && ownerIds.length === 2) {
        const recipientId = ownerIds.find((id) => id !== socket.userId);
        if (recipientId) {
          const request = await upsertMessageRequest({
            senderId: socket.userId,
            recipientId,
            roomId: args.roomId,
            preview: e2eeEnvelope ? 'Encrypted message' : args.text || '',
          });
          if (request?.status === 'pending' && global?.io) {
            global.io.to(recipientId).emit('message-request/new', request);
            global.io.to(recipientId).emit('inbox/delete', [args.roomId]);
          }
        }
      }

      if (mentions.mentionedUserIds.length && global?.io) {
        mentions.mentionedUserIds.forEach((userId) => {
          global.io.to(userId).emit('chat/mention', {
            chatId: created._id,
            roomId: args.roomId,
            fromUserId: socket.userId,
            text: e2eeEnvelope
              ? 'Encrypted mention'
              : String(args.text || '').slice(0, 240),
            allMention: mentions.allMention,
            adminsMention: mentions.adminsMention,
          });
        });
      }
    } catch (error0) {
      logger.warn('CHAT_RELIABILITY_REJECTED', {
        userId: socket.userId,
        roomId: args.roomId || null,
        code: error0.code || null,
        message: error0.message,
      });
      socket.emit('chat/ack', {
        accepted: false,
        clientMessageId: args.clientMessageId,
        roomId: args.roomId || null,
        code: error0.code || 'CHAT_SEND_FAILED',
        message: error0.message,
      });
    }
  });

  listeners.slice(1).forEach((listener) => socket.on('chat/insert', listener));
};

module.exports = {
  nextSequence,
  wrapReliableChatInsert,
};
