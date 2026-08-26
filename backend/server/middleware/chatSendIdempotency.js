const { randomUUID: uuidv4 } = require('crypto');
const ChatModel = require('../db/models/chat');
const FileModel = require('../db/models/file');
const ProfileModel = require('../db/models/profile');
const { toPlain } = require('../db/utils');
const { nextSequence } = require('../helpers/chatReliability');
const { resolveMentions } = require('../helpers/chatMentions');
const logger = require('../helpers/logger');

const buildDuplicatePayload = async (chat) => {
  const plain = toPlain(chat);
  const [file, profile] = await Promise.all([
    plain?.fileId
      ? FileModel.findOne({ where: { fileId: plain.fileId } })
      : null,
    ProfileModel.findOne({
      where: { userId: plain?.userId },
      attributes: ['userId', 'avatar', 'fullname', 'username'],
    }),
  ]);
  return {
    ...plain,
    file: toPlain(file),
    profile: toPlain(profile),
  };
};

module.exports = async (req, res, next) => {
  try {
    const senderId = req.user?._id;
    const roomId = String(req.body?.roomId || '').trim();
    if (!senderId || !roomId) {
      next();
      return;
    }

    const clientMessageId = String(
      req.body?.clientMessageId || req.get('x-client-message-id') || uuidv4()
    )
      .trim()
      .slice(0, 96);
    req.body.clientMessageId = clientMessageId;

    const duplicate = await ChatModel.findOne({
      where: { userId: senderId, roomId, clientMessageId },
    });
    if (duplicate) {
      res.status(200).json({
        success: true,
        message: 'File message already sent',
        duplicate: true,
        payload: await buildDuplicatePayload(duplicate),
      });
      return;
    }

    const originalJson = res.json.bind(res);
    let completed = false;
    res.json = (body) => {
      if (completed) return originalJson(body);
      completed = true;

      const chatId = body?.success !== false ? body?.payload?._id : null;
      if (!chatId) return originalJson(body);

      Promise.resolve()
        .then(async () => {
          const chat = await ChatModel.findOne({
            where: { _id: chatId, userId: senderId, roomId },
          });
          if (!chat) return;
          const sequence = Number(chat.sequence || 0) || (await nextSequence(roomId));
          const mentions = await resolveMentions({
            text: req.body?.text || '',
            roomId,
            roomType: req.body?.roomType || 'private',
            senderId,
          });
          await chat.update({
            clientMessageId,
            sequence,
            mentionUserIds: mentions.mentionedUserIds,
            topicId: req.body?.topicId || null,
          });
          body.payload.clientMessageId = clientMessageId;
          body.payload.sequence = sequence;
          body.payload.mentionUserIds = mentions.mentionedUserIds;
          body.payload.topicId = req.body?.topicId || null;
        })
        .catch((error0) => {
          logger.warn('CHAT_MEDIA_IDEMPOTENCY_PATCH_FAILED', {
            chatId,
            roomId,
            userId: senderId,
            message: error0.message,
          });
        })
        .finally(() => originalJson(body));

      return res;
    };

    next();
  } catch (error0) {
    next(error0);
  }
};
