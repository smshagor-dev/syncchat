const { Op } = require('sequelize');
const path = require('path');
const fs = require('fs');
const InboxModel = require('../db/models/inbox');
const ChatModel = require('../db/models/chat');
const FileModel = require('../db/models/file');
const ProfileModel = require('../db/models/profile');
const GroupModel = require('../db/models/group');
const { asArray, toPlain, toPlainMany } = require('../db/utils');

const response = require('../helpers/response');
const Chat = require('../helpers/models/chats');
const Inbox = require('../helpers/models/inbox');
const uniqueId = require('../helpers/uniqueId');
const logger = require('../helpers/logger');
const {
  deleteLocalFileByUrl,
  toAbsoluteUploadUrl,
  uploadRootDir,
} = require('../helpers/storage');

const sanitizeFolderName = (value, fallback = 'unknown') => {
  const safe = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
  return safe || fallback;
};

const isCallLogText = (text) => {
  if (typeof text !== 'string') return false;
  const value = text.trim().toLowerCase();
  return (
    value.includes('call') ||
    value.includes('missed') ||
    value.includes('reject') ||
    value.includes('decline')
  );
};

exports.upload = async (req, res) => {
  try {
    logger.info('CHAT_UPLOAD_START', {
      userId: req.user?._id || null,
      hasFile: !!req.file,
      file: req.file
        ? {
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size,
            path: req.file.path,
          }
        : null,
    });

    const uploadFile = req.file;
    if (!uploadFile) {
      logger.warn('CHAT_UPLOAD_NO_FILE', {
        userId: req.user?._id || null,
      });
      response({
        res,
        statusCode: 400,
        success: false,
        message: 'No file uploaded',
      });
      return;
    }

    let normalizedPath = path.resolve(String(uploadFile.path || ''));

    // Ensure chat uploads are stored by username: uploads/chat/<username>/...
    if (req.user?._id && !req.baseUrl.includes('avatar')) {
      const profile = await ProfileModel.findOne({
        where: { userId: req.user._id },
        attributes: ['username'],
      });
      const usernameFolder = sanitizeFolderName(
        profile?.username,
        sanitizeFolderName(req.user._id, 'unknown')
      );
      const targetDir = path.join(uploadRootDir, 'chat', usernameFolder);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const targetPath = path.join(targetDir, path.basename(normalizedPath));
      if (targetPath !== normalizedPath) {
        logger.info('CHAT_UPLOAD_MOVE', {
          from: normalizedPath,
          to: targetPath,
          usernameFolder,
        });
        await fs.promises.rename(normalizedPath, targetPath);
        normalizedPath = targetPath;
      }
    }

    const ext = path
      .extname(uploadFile.originalname || '')
      .replace('.', '')
      .toLowerCase();
    const mime = String(uploadFile.mimetype || '').toLowerCase();
    let type = 'raw';
    if (mime.startsWith('image/')) type = 'image';
    if (mime.startsWith('video/')) type = 'video';

    const relativePath = path
      .relative(path.resolve(uploadRootDir), normalizedPath)
      .replace(/\\/g, '/');
    const rel =
      relativePath && !relativePath.startsWith('..') ? relativePath : null;
    const publicPath = rel
      ? `/uploads/${rel}`
      : `/uploads/${uploadFile.filename}`;

    logger.info('CHAT_UPLOAD_SUCCESS', {
      userId: req.user?._id || null,
      normalizedPath,
      publicPath,
      type,
      size: Number(uploadFile.size || 0),
    });

    response({
      res,
      message: 'File uploaded successfully',
      payload: {
        originalname: uploadFile.originalname,
        url: toAbsoluteUploadUrl(publicPath),
        size: Number(uploadFile.size || 0),
        type,
        format: ext || 'bin',
      },
    });
  } catch (error0) {
    logger.error('CHAT_UPLOAD_ERROR', {
      userId: req.user?._id || null,
      message: error0.message,
      stack: error0.stack,
    });
    response({
      res,
      statusCode: error0.statusCode || 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.sendFile = async (req, res) => {
  try {
    const {
      roomId,
      roomType = 'private',
      ownersId,
      text = '',
      replyTo = null,
    } = req.body;
    const filePayload = req.body?.file || null;
    const senderId = req.user?._id;

    logger.info('CHAT_SEND_FILE_START', {
      senderId,
      roomId,
      roomType,
      ownersId,
      hasFile: !!filePayload,
    });

    if (!senderId || !roomId || !filePayload?.url) {
      response({
        res,
        statusCode: 400,
        success: false,
        message: 'Invalid send file payload',
      });
      return;
    }

    let safeOwners = asArray(ownersId).filter(Boolean);
    if (safeOwners.length === 0) {
      const inboxByRoom = await InboxModel.findOne({
        where: { roomId },
        attributes: ['ownersId'],
      });
      safeOwners = asArray(toPlain(inboxByRoom)?.ownersId).filter(Boolean);
    }

    if (safeOwners.length === 0) {
      response({
        res,
        statusCode: 400,
        success: false,
        message: 'ownersId is required',
      });
      return;
    }

    const originalname = filePayload.originalname || 'attachment';
    const inferredFormat = path
      .extname(originalname || '')
      .replace('.', '')
      .toLowerCase();

    const fileId = uniqueId(20);
    const file = await FileModel.create({
      fileId,
      url: filePayload.url,
      originalname,
      type: filePayload.type || 'raw',
      format: filePayload.format || inferredFormat || 'bin',
      size: Number(filePayload.size || 0),
    });

    const chatDoc = await ChatModel.create({
      userId: senderId,
      roomId,
      text: text || '',
      replyTo: replyTo || null,
      fileId,
      readed: false,
      delivered: false,
      deletedBy: [],
      reactions: {},
    });
    const chat = toPlain(chatDoc);

    const profile = toPlain(
      await ProfileModel.findOne({
        where: { userId: senderId },
        attributes: ['userId', 'avatar', 'fullname'],
      })
    );

    const contentText =
      chat.text && chat.text.length > 0 ? chat.text : file.originalname;

    const existingInbox = await InboxModel.findOne({ where: { roomId } });
    if (existingInbox) {
      await existingInbox.update({
        ownersId: safeOwners,
        roomId,
        roomType,
        unreadMessage: Number(existingInbox.unreadMessage || 0) + 1,
        fileId,
        content: {
          from: senderId,
          senderName: profile?.fullname || '',
          text: contentText,
          time: chat.createdAt,
          delivered: !!chat.delivered,
          readed: false,
        },
      });
    } else {
      await InboxModel.create({
        ownersId: safeOwners,
        roomId,
        roomType,
        unreadMessage: 1,
        fileId,
        deletedBy: [],
        content: {
          from: senderId,
          senderName: profile?.fullname || '',
          text: contentText,
          time: chat.createdAt,
          delivered: !!chat.delivered,
          readed: false,
        },
      });
    }

    const inboxes = await Inbox.find({ roomId });
    const payload = {
      ...chat,
      profile,
      file: toPlain(file),
      reply: null,
    };

    global.io.to(roomId).emit('chat/insert', payload);
    if (inboxes[0]) {
      global.io.to(safeOwners).emit('inbox/find', inboxes[0]);
    }

    logger.info('CHAT_SEND_FILE_DONE', {
      senderId,
      roomId,
      chatId: chat._id,
      fileId,
    });

    response({
      res,
      message: 'File message sent successfully',
      payload,
    });
  } catch (error0) {
    logger.error('CHAT_SEND_FILE_ERROR', {
      message: error0.message,
      stack: error0.stack,
      body: req.body,
      userId: req.user?._id || null,
    });

    response({
      res,
      statusCode: error0.statusCode || 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.findByRoomId = async (req, res) => {
  try {
    const { skip, limit } = req.query;
    const chats = await Chat.find(req.params.roomId, {
      skip,
      limit,
      userId: req.user._id,
    });

    response({
      res,
      message: `${chats.length} chats found`,
      payload: chats,
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

exports.findMedia = async (req, res) => {
  try {
    const allInboxes = await InboxModel.findAll();
    const roomDocs = toPlainMany(allInboxes).filter(
      (inbox) =>
        asArray(inbox.ownersId).includes(req.user._id) &&
        !asArray(inbox.deletedBy).includes(req.user._id)
    );

    const roomsId = roomDocs.map((doc) => doc.roomId);
    if (roomsId.length === 0) {
      response({
        res,
        message: '0 media found',
        payload: [],
      });
      return;
    }

    const chatsRaw = await ChatModel.findAll({
      where: {
        roomId: { [Op.in]: roomsId },
      },
      order: [['createdAt', 'DESC']],
      limit: 1000,
    });

    const chats = toPlainMany(chatsRaw).filter(
      (chat) => !asArray(chat.deletedBy).includes(req.user._id)
    );
    const fileIds = [
      ...new Set(chats.map((chat) => chat.fileId).filter(Boolean)),
    ];
    const filesRaw = fileIds.length
      ? await FileModel.findAll({ where: { fileId: { [Op.in]: fileIds } } })
      : [];
    const fileMap = new Map(
      toPlainMany(filesRaw).map((file) => [file.fileId, file])
    );

    const items = [];
    const linkRegex = /(https?:\/\/[^\s]+)/gi;

    chats.forEach((chat) => {
      const file = chat.fileId ? fileMap.get(chat.fileId) : null;
      if (file?.fileId) {
        let kind = 'file';
        if (file.type === 'image') kind = 'photo';
        if (file.type === 'video') kind = 'video';

        items.push({
          _id: `${chat._id}-file`,
          kind,
          roomId: chat.roomId,
          userId: chat.userId,
          text: chat.text,
          createdAt: chat.createdAt,
          file,
        });
      }

      const links = (chat.text || '').match(linkRegex) || [];
      links.forEach((url, index) => {
        items.push({
          _id: `${chat._id}-link-${index}`,
          kind: 'link',
          roomId: chat.roomId,
          userId: chat.userId,
          text: chat.text,
          createdAt: chat.createdAt,
          url,
        });
      });
    });

    response({
      res,
      message: `${items.length} media found`,
      payload: items.slice(0, 500),
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

exports.findCalls = async (req, res) => {
  try {
    const inboxesRaw = await InboxModel.findAll();
    const inboxes = toPlainMany(inboxesRaw).filter(
      (inbox) =>
        asArray(inbox.ownersId).includes(req.user._id) &&
        !asArray(inbox.deletedBy).includes(req.user._id)
    );

    if (inboxes.length === 0) {
      response({
        res,
        message: '0 call logs found',
        payload: [],
      });
      return;
    }

    const roomsId = [...new Set(inboxes.map((inbox) => inbox.roomId))];
    const chatsRaw = await ChatModel.findAll({
      where: {
        roomId: { [Op.in]: roomsId },
      },
      order: [['createdAt', 'DESC']],
      limit: 4000,
    });

    const chats = toPlainMany(chatsRaw).filter(
      (chat) =>
        !asArray(chat.deletedBy).includes(req.user._id) &&
        isCallLogText(chat.text)
    );

    if (chats.length === 0) {
      response({
        res,
        message: '0 call logs found',
        payload: [],
      });
      return;
    }

    const inboxByRoomId = new Map(
      inboxes.map((inbox) => [inbox.roomId, inbox])
    );
    const ownersIds = [
      ...new Set(inboxes.flatMap((inbox) => asArray(inbox.ownersId))),
    ];
    const [profilesRaw, groupsRaw] = await Promise.all([
      ownersIds.length
        ? ProfileModel.findAll({
            where: { userId: { [Op.in]: ownersIds } },
          })
        : [],
      GroupModel.findAll({
        where: { roomId: { [Op.in]: roomsId } },
      }),
    ]);

    const profilesById = new Map(
      toPlainMany(profilesRaw).map((profile) => [profile.userId, profile])
    );
    const groupsByRoom = new Map(
      toPlainMany(groupsRaw).map((group) => [group.roomId, group])
    );

    const payload = chats
      .map((chat) => {
        const inbox = inboxByRoomId.get(chat.roomId);
        if (!inbox) return null;
        const owners = asArray(inbox.ownersId)
          .map((ownerId) => profilesById.get(ownerId))
          .filter(Boolean);

        return {
          _id: chat._id,
          roomId: chat.roomId,
          roomType: inbox.roomType || 'private',
          ownersId: asArray(inbox.ownersId),
          owners,
          group: groupsByRoom.get(chat.roomId) || null,
          text: chat.text || '',
          userId: chat.userId,
          createdAt: chat.createdAt,
        };
      })
      .filter(Boolean);

    response({
      res,
      message: `${payload.length} call logs found`,
      payload,
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

exports.deleteByRoomId = async (req, res) => {
  try {
    const { roomId } = req.params;
    const inbox = await InboxModel.findOne({ where: { roomId } });
    if (!inbox) {
      response({ res, message: 'Chat deleted successfully' });
      return;
    }

    const owners = asArray(inbox.ownersId);
    const deletedBy = asArray(inbox.deletedBy);
    if (!deletedBy.includes(req.user._id)) {
      deletedBy.push(req.user._id);
      await inbox.update({ deletedBy });
    }

    if (deletedBy.length >= owners.length) {
      await InboxModel.destroy({ where: { roomId } });
      await ChatModel.destroy({ where: { roomId } });
    } else {
      const chats = await ChatModel.findAll({ where: { roomId } });
      await Promise.all(
        chats.map(async (chat) => {
          const curr = asArray(chat.deletedBy);
          if (curr.includes(req.user._id)) return;
          await chat.update({ deletedBy: [...curr, req.user._id] });
        })
      );
    }

    const chats = await ChatModel.findAll({ where: { roomId } });
    const chatsToDelete = toPlainMany(chats).filter(
      (chat) => asArray(chat.deletedBy).length >= owners.length
    );

    if (chatsToDelete.length > 0) {
      const filesId = chatsToDelete
        .filter((elem) => !!elem.fileId)
        .map((elem) => elem.fileId);

      await ChatModel.destroy({
        where: { _id: { [Op.in]: chatsToDelete.map((chat) => chat._id) } },
      });

      if (filesId.length > 0) {
        const files = await FileModel.findAll({
          where: { fileId: { [Op.in]: filesId } },
          attributes: ['url', 'fileId'],
        });

        await Promise.all(files.map((file) => deleteLocalFileByUrl(file.url)));
        await FileModel.destroy({ where: { fileId: { [Op.in]: filesId } } });
      }
    }

    response({
      res,
      message: 'Chat deleted successfully',
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
