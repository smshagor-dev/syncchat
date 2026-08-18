const { Op } = require('sequelize');
const InboxModel = require('../db/models/inbox');
const ChatModel = require('../db/models/chat');
const FileModel = require('../db/models/file');
const ScheduledMessageModel = require('../db/models/scheduledMessage');
const { asArray, addToSet, toPlainMany } = require('../db/utils');
const response = require('../helpers/response');
const { deleteLocalFileByUrl } = require('../helpers/storage');
const logger = require('../helpers/logger');

const getFileCleanupUrls = (file) =>
  [file?.url, file?.thumbnailUrl, file?.streamUrl, file?.streamHdUrl].filter(Boolean);

const emitInboxDelete = ({ roomId, userIds }) => {
  if (!global?.io) return;
  asArray(userIds)
    .filter(Boolean)
    .forEach((userId) => {
      global.io.to(userId).emit('inbox/delete', [roomId]);
    });
  global.io.to(roomId).emit('inbox/delete', [roomId]);
};

const cleanupRoomFiles = async (fileIds) => {
  const ids = [...new Set(asArray(fileIds).filter(Boolean))];
  if (!ids.length) return;

  const files = await FileModel.findAll({
    where: { fileId: { [Op.in]: ids } },
    attributes: ['fileId', 'url', 'thumbnailUrl', 'streamUrl', 'streamHdUrl'],
  });

  const cleanup = await Promise.allSettled(
    files.flatMap((file) =>
      getFileCleanupUrls(file).map((targetUrl) => deleteLocalFileByUrl(targetUrl))
    )
  );

  const failed = cleanup.filter((item) => item.status === 'rejected');
  if (failed.length) {
    logger.warn('CHAT_DELETE_FILE_CLEANUP_PARTIAL', {
      failed: failed.length,
      total: cleanup.length,
    });
  }

  await FileModel.destroy({ where: { fileId: { [Op.in]: ids } } });
};

const purgeRoom = async ({ roomId, ownersId }) => {
  const chats = await ChatModel.findAll({ where: { roomId } });
  const plainChats = toPlainMany(chats);
  const fileIds = plainChats.map((chat) => chat.fileId).filter(Boolean);

  await Promise.all([
    ChatModel.destroy({ where: { roomId } }),
    ScheduledMessageModel.destroy({ where: { roomId } }),
  ]);
  await InboxModel.destroy({ where: { roomId } });
  await cleanupRoomFiles(fileIds);
  emitInboxDelete({ roomId, userIds: ownersId });
};

exports.deleteByRoomId = async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user?._id;
    const requestedScope = String(req.body?.scope || req.query?.scope || 'self');
    const scope = requestedScope === 'both' ? 'both' : 'self';

    const inbox = await InboxModel.findOne({ where: { roomId } });
    if (!inbox) {
      response({
        res,
        message: 'Chat deleted successfully',
        payload: { roomId, scope },
      });
      return;
    }

    const ownersId = asArray(inbox.ownersId).filter(Boolean);
    if (!ownersId.includes(userId)) {
      response({
        res,
        statusCode: 403,
        success: false,
        message: 'Forbidden',
      });
      return;
    }

    if (scope === 'both') {
      if (inbox.roomType !== 'private') {
        response({
          res,
          statusCode: 400,
          success: false,
          message: 'Delete for both is only available in private chats',
        });
        return;
      }

      await purgeRoom({ roomId, ownersId });
      response({
        res,
        message: 'Chat deleted for both participants',
        payload: { roomId, scope: 'both' },
      });
      return;
    }

    const deletedBy = addToSet(inbox.deletedBy, [userId]);
    await inbox.update({
      deletedBy,
      markUnreadBy: asArray(inbox.markUnreadBy).filter((id) => id !== userId),
    });

    const chats = await ChatModel.findAll({ where: { roomId } });
    await Promise.all(
      chats.map(async (chat) => {
        const nextDeletedBy = addToSet(chat.deletedBy, [userId]);
        await chat.update({ deletedBy: nextDeletedBy });
      })
    );

    // Once every participant independently deletes the chat for themselves,
    // there is no remaining visible copy, so the room can be physically cleaned.
    if (ownersId.length > 0 && ownersId.every((id) => deletedBy.includes(id))) {
      await purgeRoom({ roomId, ownersId });
    } else {
      emitInboxDelete({ roomId, userIds: [userId] });
    }

    response({
      res,
      message: 'Chat deleted for you',
      payload: { roomId, scope: 'self' },
    });
  } catch (error0) {
    response({
      res,
      statusCode: error0.statusCode || 500,
      success: false,
      message: error0.message,
    });
  }
};
