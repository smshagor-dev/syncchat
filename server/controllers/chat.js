const { Op } = require('sequelize');
const path = require('path');
const fs = require('fs');
const InboxModel = require('../db/models/inbox');
const ChatModel = require('../db/models/chat');
const FileModel = require('../db/models/file');
const ProfileModel = require('../db/models/profile');
const GroupModel = require('../db/models/group');
const ChannelModel = require('../db/models/channel');
const SettingModel = require('../db/models/setting');
const { asArray, toPlain, toPlainMany, pullFromArray } = require('../db/utils');
const { canGroupMemberSendMessage } = require('../helpers/groupPermissions');

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
const {
  canReceiveUnknownMessage,
  getSettingMap,
  getContactMap,
} = require('../helpers/privacy');

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

const isStarredByUser = (chat, userId) =>
  asArray(chat?.starredBy).includes(userId);

const resolveArchivedByAfterIncoming = async ({
  archivedBy,
  ownersId,
  senderId,
}) => {
  const currentArchivedBy = asArray(archivedBy);
  if (currentArchivedBy.length === 0) return currentArchivedBy;

  const receivers = asArray(ownersId).filter((ownerId) => ownerId !== senderId);
  const archivedReceivers = currentArchivedBy.filter((userId) =>
    receivers.includes(userId)
  );
  if (archivedReceivers.length === 0) return currentArchivedBy;

  const settingsRaw = await SettingModel.findAll({
    where: { userId: { [Op.in]: archivedReceivers } },
    attributes: ['userId', 'keepArchived'],
  });
  const settings = toPlainMany(settingsRaw);
  const keepArchivedByUser = new Map(
    settings.map((item) => [item.userId, !!item.keepArchived])
  );

  const toUnarchive = archivedReceivers.filter(
    (userId) => !keepArchivedByUser.get(userId)
  );

  return pullFromArray(currentArchivedBy, toUnarchive);
};

const getPrivateChatBlockState = async ({ senderId, ownersId }) => {
  const roomOwners = asArray(ownersId).filter(Boolean);
  if (!senderId || roomOwners.length < 2 || !roomOwners.includes(senderId)) {
    return null;
  }

  const receiverId = roomOwners.find((ownerId) => ownerId !== senderId);
  if (!receiverId) return null;

  const [senderSetting, receiverSetting] = await Promise.all([
    SettingModel.findOne({
      where: { userId: senderId },
      attributes: ['blockedUserIds'],
    }),
    SettingModel.findOne({
      where: { userId: receiverId },
      attributes: ['blockedUserIds'],
    }),
  ]);

  const senderBlocked = asArray(toPlain(senderSetting)?.blockedUserIds);
  const receiverBlocked = asArray(toPlain(receiverSetting)?.blockedUserIds);

  return {
    senderBlockedReceiver: senderBlocked.includes(receiverId),
    receiverBlockedSender: receiverBlocked.includes(senderId),
    receiverId,
  };
};

const canPrivateMessageProceed = async ({ senderId, receiverId }) => {
  const [settingMap, contactMap] = await Promise.all([
    getSettingMap([receiverId]),
    getContactMap({ ownerIds: [receiverId], friendIds: [senderId] }),
  ]);
  return (
    !!contactMap.get(`${receiverId}:${senderId}`) ||
    canReceiveUnknownMessage({
      setting: settingMap.get(receiverId),
    })
  );
};

const getGroupLikeRoom = async (roomId) => {
  const [channel, group] = await Promise.all([
    ChannelModel.findOne({
      where: { roomId },
      attributes: { exclude: ['passwordHash'] },
    }),
    GroupModel.findOne({
      where: { roomId },
      attributes: ['participantsId', 'adminId', 'adminsId', 'permissions', 'name', 'avatar'],
    }),
  ]);
  return {
    channel: toPlain(channel),
    group: toPlain(group),
  };
};

const getChannelIdentity = (channel) =>
  channel
    ? {
        userId: channel._id,
        fullname: channel.name,
        avatar: channel.avatar || null,
        isChannelIdentity: true,
      }
    : null;

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

    if (roomType === 'group') {
      const { channel, group } = await getGroupLikeRoom(roomId);
      const roomEntity = channel || group;
      if (!roomEntity || !asArray(roomEntity.participantsId).includes(senderId)) {
        response({
          res,
          statusCode: 403,
          success: false,
          message: `You are not a participant of this ${channel ? 'channel' : 'group'}`,
        });
        return;
      }
      if (!canGroupMemberSendMessage({ group: roomEntity, userId: senderId })) {
        response({
          res,
          statusCode: 403,
          success: false,
          message: 'You do not have permission to send messages',
        });
        return;
      }
    }
    if (roomType === 'private') {
      const privateBlock = await getPrivateChatBlockState({
        senderId,
        ownersId: safeOwners,
      });
      if (
        privateBlock?.senderBlockedReceiver ||
        privateBlock?.receiverBlockedSender
      ) {
        response({
          res,
          statusCode: 403,
          success: false,
          message: 'You cannot send messages in this chat',
        });
        return;
      }
      if (
        !(await canPrivateMessageProceed({
          senderId,
          receiverId: privateBlock?.receiverId,
        }))
      ) {
        response({
          res,
          statusCode: 403,
          success: false,
          message: 'This user only accepts messages from contacts',
        });
        return;
      }
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
    const { channel } = await getGroupLikeRoom(roomId);
    const senderName = channel?.name || profile?.fullname || '';
    const senderProfile = getChannelIdentity(channel) || profile;

    const contentText =
      chat.text && chat.text.length > 0 ? chat.text : file.originalname;

    const existingInbox = await InboxModel.findOne({ where: { roomId } });
    if (existingInbox) {
      const nextArchivedBy = await resolveArchivedByAfterIncoming({
        archivedBy: existingInbox.archivedBy,
        ownersId: safeOwners,
        senderId,
      });

      await existingInbox.update({
        ownersId: safeOwners,
        roomId,
        roomType,
        unreadMessage: Number(existingInbox.unreadMessage || 0) + 1,
        archivedBy: nextArchivedBy,
        fileId,
        content: {
          from: senderId,
          senderName,
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
          senderName,
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
      profile: senderProfile,
      channel: channel || null,
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
    const requestedRoomId = String(req.query.roomId || '').trim();
    const allInboxes = await InboxModel.findAll();
    const roomDocs = toPlainMany(allInboxes).filter((inbox) => {
      const belongsToUser =
        asArray(inbox.ownersId).includes(req.user._id) &&
        !asArray(inbox.deletedBy).includes(req.user._id);
      if (!belongsToUser) return false;
      if (!requestedRoomId) return true;
      return inbox.roomId === requestedRoomId;
    });

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
    const [profilesRaw, groupsRaw, channelsRaw] = await Promise.all([
      ownersIds.length
        ? ProfileModel.findAll({
            where: { userId: { [Op.in]: ownersIds } },
          })
        : [],
      GroupModel.findAll({
        where: { roomId: { [Op.in]: roomsId } },
      }),
      ChannelModel.findAll({
        where: { roomId: { [Op.in]: roomsId } },
        attributes: { exclude: ['passwordHash'] },
      }),
    ]);

    const profilesById = new Map(
      toPlainMany(profilesRaw).map((profile) => [profile.userId, profile])
    );
    const groupsByRoom = new Map(
      toPlainMany(groupsRaw).map((group) => [group.roomId, group])
    );
    const channelsByRoom = new Map(
      toPlainMany(channelsRaw).map((channel) => [channel.roomId, channel])
    );

    const payload = chats
      .map((chat) => {
        const inbox = inboxByRoomId.get(chat.roomId);
        if (!inbox) return null;
        const owners = asArray(inbox.ownersId)
          .map((ownerId) => profilesById.get(ownerId))
          .filter(Boolean);

        const channel = channelsByRoom.get(chat.roomId) || null;
        return {
          _id: chat._id,
          roomId: chat.roomId,
          roomType: inbox.roomType || 'private',
          ownersId: asArray(inbox.ownersId),
          owners,
          group: groupsByRoom.get(chat.roomId) || null,
          channel,
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

exports.toggleStar = async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user._id;
    const chat = await ChatModel.findOne({ where: { _id: chatId } });

    if (!chat) {
      response({
        res,
        statusCode: 404,
        success: false,
        message: 'Chat not found',
      });
      return;
    }

    const plain = toPlain(chat);
    if (asArray(plain.deletedBy).includes(userId)) {
      response({
        res,
        statusCode: 403,
        success: false,
        message: 'Cannot star a deleted message',
      });
      return;
    }

    const currentStarredBy = asArray(plain.starredBy);
    const requestValue = req.body?.starred;
    const shouldStar =
      typeof requestValue === 'boolean'
        ? requestValue
        : !currentStarredBy.includes(userId);

    const nextStarredBy = shouldStar
      ? [...new Set([...currentStarredBy, userId])]
      : currentStarredBy.filter((id) => id !== userId);

    await chat.update({ starredBy: nextStarredBy });

    response({
      res,
      message: shouldStar ? 'Message starred' : 'Message unstarred',
      payload: {
        chatId,
        starred: shouldStar,
        starredBy: nextStarredBy,
      },
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

exports.findStarred = async (req, res) => {
  try {
    const userId = req.user._id;
    const inboxesRaw = await InboxModel.findAll();
    const inboxes = toPlainMany(inboxesRaw).filter(
      (inbox) =>
        asArray(inbox.ownersId).includes(userId) &&
        !asArray(inbox.deletedBy).includes(userId)
    );

    if (inboxes.length === 0) {
      response({
        res,
        message: '0 starred messages found',
        payload: [],
      });
      return;
    }

    const roomsId = [...new Set(inboxes.map((inbox) => inbox.roomId))];
    const chatsRaw = await ChatModel.findAll({
      where: { roomId: { [Op.in]: roomsId } },
      order: [['createdAt', 'DESC']],
      limit: 5000,
    });

    const chats = toPlainMany(chatsRaw).filter(
      (chat) =>
        !asArray(chat.deletedBy).includes(userId) &&
        isStarredByUser(chat, userId)
    );

    if (chats.length === 0) {
      response({
        res,
        message: '0 starred messages found',
        payload: [],
      });
      return;
    }

    const fileIds = [
      ...new Set(chats.map((chat) => chat.fileId).filter(Boolean)),
    ];
    const senderIds = [
      ...new Set(chats.map((chat) => chat.userId).filter(Boolean)),
    ];
    const allOwnerIds = [
      ...new Set(inboxes.flatMap((inbox) => asArray(inbox.ownersId))),
    ];

    const [filesRaw, senderProfilesRaw, ownerProfilesRaw, groupsRaw, channelsRaw] =
      await Promise.all([
        fileIds.length
          ? FileModel.findAll({
              where: { fileId: { [Op.in]: fileIds } },
            })
          : [],
        senderIds.length
          ? ProfileModel.findAll({
              where: { userId: { [Op.in]: senderIds } },
            })
          : [],
        allOwnerIds.length
          ? ProfileModel.findAll({
              where: { userId: { [Op.in]: allOwnerIds } },
            })
          : [],
        GroupModel.findAll({
          where: { roomId: { [Op.in]: roomsId } },
          attributes: { exclude: ['passwordHash'] },
        }),
        ChannelModel.findAll({
          where: { roomId: { [Op.in]: roomsId } },
          attributes: { exclude: ['passwordHash'] },
        }),
      ]);

    const inboxByRoom = new Map(inboxes.map((inbox) => [inbox.roomId, inbox]));
    const fileById = new Map(
      toPlainMany(filesRaw).map((file) => [file.fileId, file])
    );
    const senderById = new Map(
      toPlainMany(senderProfilesRaw).map((profile) => [profile.userId, profile])
    );
    const ownerProfileById = new Map(
      toPlainMany(ownerProfilesRaw).map((profile) => [profile.userId, profile])
    );
    const groupByRoom = new Map(
      toPlainMany(groupsRaw).map((group) => [group.roomId, group])
    );
    const channelByRoom = new Map(
      toPlainMany(channelsRaw).map((channel) => [channel.roomId, channel])
    );

    const payload = chats.map((chat) => {
      const inbox = inboxByRoom.get(chat.roomId) || null;
      const roomType = inbox?.roomType || 'private';
      const owners = asArray(inbox?.ownersId)
        .map((ownerId) => ownerProfileById.get(ownerId))
        .filter(Boolean);
      const friendProfile =
        roomType === 'private'
          ? owners.find((owner) => owner.userId !== userId) || null
          : null;
      const roomGroup =
        roomType === 'group' ? groupByRoom.get(chat.roomId) || null : null;
      const roomChannel =
        roomType === 'group' ? channelByRoom.get(chat.roomId) || null : null;

      return {
        _id: chat._id,
        roomId: chat.roomId,
        roomType,
        text: chat.text || '',
        createdAt: chat.createdAt,
        userId: chat.userId,
        starredBy: asArray(chat.starredBy),
        file: chat.fileId ? fileById.get(chat.fileId) || null : null,
        profile: getChannelIdentity(roomChannel) || senderById.get(chat.userId) || null,
        channel: roomChannel,
        room: {
          roomId: chat.roomId,
          roomType,
          title:
            roomType === 'group'
              ? roomChannel?.name || groupByRoom.get(chat.roomId)?.name || 'Group'
              : friendProfile?.fullname || '[inactive]',
          avatar:
            roomType === 'group'
              ? roomChannel?.avatar || groupByRoom.get(chat.roomId)?.avatar || null
              : friendProfile?.avatar || null,
          ownersId: asArray(inbox?.ownersId),
          group:
            roomGroup,
          channel: roomChannel,
          friend: friendProfile,
        },
      };
    });

    response({
      res,
      message: `${payload.length} starred messages found`,
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
    const userId = req.user?._id;
    const inbox = await InboxModel.findOne({ where: { roomId } });
    if (!inbox) {
      response({ res, message: 'Chat deleted successfully' });
      return;
    }

    const owners = asArray(inbox.ownersId);
    const deletedBy = asArray(inbox.deletedBy);
    const nextOwners = pullFromArray(owners, [userId]);
    if (!deletedBy.includes(userId)) {
      deletedBy.push(userId);
      await inbox.update({
        deletedBy,
        ownersId: nextOwners,
      });
    } else if (owners.includes(userId)) {
      await inbox.update({ ownersId: nextOwners });
    }

    if (deletedBy.length >= owners.length || nextOwners.length === 0) {
      await InboxModel.destroy({ where: { roomId } });
      await ChatModel.destroy({ where: { roomId } });
    } else {
      const chats = await ChatModel.findAll({ where: { roomId } });
      await Promise.all(
        chats.map(async (chat) => {
          const curr = asArray(chat.deletedBy);
          if (curr.includes(userId)) return;
          await chat.update({ deletedBy: [...curr, userId] });
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

    if (userId && global?.io) {
      global.io.to(userId).emit('inbox/delete', [roomId]);
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
