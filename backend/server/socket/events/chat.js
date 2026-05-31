const { io } = global;
const { Op } = require('sequelize');
const InboxModel = require('../../db/models/inbox');
const ChatModel = require('../../db/models/chat');
const FileModel = require('../../db/models/file');
const ProfileModel = require('../../db/models/profile');
const SettingModel = require('../../db/models/setting');
const GroupModel = require('../../db/models/group');
const ChannelModel = require('../../db/models/channel');
const {
  asArray,
  toPlain,
  toPlainMany,
  addToSet,
  pullFromArray,
} = require('../../db/utils');

const Inbox = require('../../helpers/models/inbox');
const uniqueId = require('../../helpers/uniqueId');
const logger = require('../../helpers/logger');
const {
  parseDataUri,
  saveBufferFile,
  deleteLocalFileByUrl,
} = require('../../helpers/storage');
const { canGroupMemberSendMessage } = require('../../helpers/groupPermissions');
const { enforceModerationForMessage } = require('../../helpers/moderation');
const {
  canReceiveUnknownMessage,
  allowsReadReceipts,
  getSettingMap,
  getContactMap,
} = require('../../helpers/privacy');
const {
  createSecretSession,
  decryptSecretText,
  encryptSecretText,
  getSecretExpiresAt,
  getSecretPreviewText,
  getSecretRoomState,
  isSecretEnabled,
  cleanupExpiredSecretChats,
} = require('../../helpers/secretChat');
const {
  getViewOnceType,
  isViewOnceChat,
} = require('../../helpers/viewOnce');
const { sendPushToUsers } = require('../../helpers/pushNotifications');
const { getClientOrigin } = require('../../helpers/origins');

const POLL_PREFIX = '__poll__::';
const EVENT_PREFIX = '__event__::';
const GROUP_INFO_PREFIX = '__group_info__::';
const CLIENT_ORIGIN = getClientOrigin() || 'http://localhost:3000';

const normalizeDeepLinkToken = (link, prefix) => {
  const raw = String(link || '');
  if (!raw.startsWith(prefix)) return '';
  return raw.slice(prefix.length);
};

const buildPushUrl = ({ roomType, profile, roomAccess }) => {
  if (roomType === 'private' && profile?.username) {
    return `${CLIENT_ORIGIN}/?u=${encodeURIComponent(profile.username)}`;
  }
  const groupToken = normalizeDeepLinkToken(roomAccess?.group?.link, '/group/+');
  if (groupToken) {
    return `${CLIENT_ORIGIN}/?g=${encodeURIComponent(groupToken)}`;
  }
  const channelToken = normalizeDeepLinkToken(
    roomAccess?.channel?.link,
    '/channel/+'
  );
  if (channelToken) {
    return `${CLIENT_ORIGIN}/?c=${encodeURIComponent(channelToken)}`;
  }
  return CLIENT_ORIGIN || '/';
};

const getFileCleanupUrls = (file) =>
  [
    file?.url,
    file?.thumbnailUrl,
    file?.streamUrl,
    file?.streamHdUrl,
  ].filter(Boolean);

const sanitizeEditHistory = (history) =>
  asArray(history)
    .map((entry) => ({
      text: String(entry?.text || ''),
      replyTo: entry?.replyTo || null,
      editedAt: entry?.editedAt || null,
      editedBy: entry?.editedBy || null,
    }))
    .filter((entry) => entry.text.length > 0 || entry.replyTo);

const normalizePollVotes = (votes) =>
  asArray(votes)
    .map((vote) => ({
      userId: vote?.userId || '',
      fullname: vote?.fullname || '[unknown]',
      at: vote?.at || null,
    }))
    .filter((vote) => vote.userId);

const normalizePollCorrectOptionIds = (poll, options) => {
  const validIds = new Set(options.map((option) => option.id));
  const raw = asArray(poll?.correctOptionIds)
    .map((id) => String(id || '').trim())
    .filter((id) => validIds.has(id));
  return [...new Set(raw)];
};

const normalizePollPayload = (poll) => {
  const options = asArray(poll?.options)
    .map((option, index) => ({
      id: String(option?.id || `opt-${index + 1}`),
      text: String(option?.text || '').trim(),
      votes: normalizePollVotes(option?.votes),
    }))
    .filter((option) => option.text);

  if (!String(poll?.question || '').trim() || options.length < 2) {
    return null;
  }

  const anonymous = !!poll?.anonymous;
  const multiSelect = !!poll?.multiSelect;
  const mode = poll?.mode === 'quiz' ? 'quiz' : 'poll';
  const closedAt = poll?.closedAt || null;
  const closedBy = poll?.closedBy || null;
  const correctOptionIds =
    mode === 'quiz' ? normalizePollCorrectOptionIds(poll, options) : [];

  return {
    version: 2,
    mode,
    question: String(poll.question).trim(),
    options,
    anonymous,
    multiSelect,
    correctOptionIds,
    closedAt,
    closedBy,
    createdBy: poll?.createdBy || null,
    createdAt: poll?.createdAt || new Date().toISOString(),
  };
};

const parsePollFromText = (text) => {
  if (typeof text !== 'string' || !text.startsWith(POLL_PREFIX)) return null;
  try {
    return normalizePollPayload(JSON.parse(text.slice(POLL_PREFIX.length)));
  } catch (error0) {
    return null;
  }
};

const serializePollToText = (poll) => `${POLL_PREFIX}${JSON.stringify(poll)}`;

const parseEventFromText = (text) => {
  if (typeof text !== 'string' || !text.startsWith(EVENT_PREFIX)) return null;
  try {
    const parsed = JSON.parse(text.slice(EVENT_PREFIX.length));
    const title = String(parsed?.title || '').trim();
    const date = String(parsed?.date || '').trim();
    if (!title || !date) return null;
    return parsed;
  } catch (error0) {
    return null;
  }
};

const isStructuredMessage = (text) =>
  typeof text === 'string' &&
  (text.startsWith(POLL_PREFIX) ||
    text.startsWith(EVENT_PREFIX) ||
    text.startsWith(GROUP_INFO_PREFIX));

const getInboxPreviewText = (chatText, file) => {
  const poll = parsePollFromText(chatText);
  if (poll) return 'Poll';
  const event = parseEventFromText(chatText);
  if (event) return 'Event';
  if (chatText && chatText.length > 0) return chatText;
  const safeFile = toPlain(file);
  if (safeFile?.type === 'image') return 'Photo';
  if (safeFile?.type === 'video') return 'Video';
  if (safeFile?.type === 'audio') return 'Voice';
  return safeFile?.originalname || '';
};

const sanitizeFolderName = (value, fallback = 'unknown') => {
  const safe = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
  return safe || fallback;
};

const resolvePrivateOwners = async ({ ownersId, roomId }) => {
  const providedOwners = asArray(ownersId).filter(Boolean);
  if (providedOwners.length >= 2) return providedOwners;
  if (!roomId) return providedOwners;

  const inbox = await InboxModel.findOne({
    where: { roomId },
    attributes: ['ownersId'],
  });

  return asArray(toPlain(inbox)?.ownersId);
};

const getPrivateChatBlockState = async ({ senderId, ownersId, roomId }) => {
  if (!senderId) return true;

  const roomOwners = await resolvePrivateOwners({ ownersId, roomId });
  if (!roomOwners.includes(senderId)) return true;

  const receiverId = roomOwners.find((ownerId) => ownerId !== senderId);
  if (!receiverId) return true;

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
    receiverId,
    senderBlockedReceiver: senderBlocked.includes(receiverId),
    receiverBlockedSender: receiverBlocked.includes(senderId),
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

const buildReplyPayload = async (replyTo, secretRoom = null) => {
  if (!replyTo) return null;
  const replyDoc = await ChatModel.findOne({
    where: { _id: replyTo },
    attributes: ['_id', 'userId', 'text', 'fileId'],
  });
  const reply = toPlain(replyDoc);
  if (!reply) return null;

  const [replyProfileDoc, replyFileDoc] = await Promise.all([
    ProfileModel.findOne({
      where: { userId: reply.userId },
      attributes: ['fullname'],
    }),
    reply.fileId
      ? FileModel.findOne({
          where: { fileId: reply.fileId },
          attributes: ['originalname'],
        })
      : null,
  ]);

  return {
    _id: reply._id,
    userId: reply.userId,
    fullname: toPlain(replyProfileDoc)?.fullname || '[inactive]',
    text:
      getResolvedChatText({ chat: reply, secretRoom }) ||
      toPlain(replyFileDoc)?.originalname ||
      '',
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

const getResolvedChatText = ({ chat, secretRoom }) => {
  if (isSecretEnabled(secretRoom) && chat?.encryptedText) {
    return decryptSecretText({
      payload: chat.encryptedText,
      key: secretRoom.secretSessionKey,
    });
  }
  return chat?.text || '';
};

const getSecretPayload = (secretRoom, chat) =>
  isSecretEnabled(secretRoom)
    ? {
        enabled: true,
        expiresAt: chat?.expiresAt || null,
        saveBlocked: !!secretRoom.secretSaveBlocked,
        forwardBlocked: !!secretRoom.secretForwardBlocked,
        exportBlocked: !!secretRoom.secretExportBlocked,
        screenshotAlerts: !!secretRoom.secretScreenshotAlerts,
        sessionId: secretRoom.secretSessionId || null,
      }
    : null;

const buildHistoryEntry = ({ text, replyTo, userId, editedAt }) => ({
  text: String(text || ''),
  replyTo: replyTo || null,
  editedAt: editedAt || new Date().toISOString(),
  editedBy: userId || null,
});

const canAccessGroupRoom = async ({ roomId, userId }) => {
  if (!roomId || !userId) {
    return { canAccess: false, canSend: false, channel: null, group: null };
  }
  const [channelDoc, groupDoc] = await Promise.all([
    ChannelModel.findOne({
      where: { roomId },
      attributes: { exclude: ['passwordHash'] },
    }),
    GroupModel.findOne({
      where: { roomId },
      attributes: [
        'participantsId',
        'adminId',
        'adminsId',
        'permissions',
        'moderation',
      ],
    }),
  ]);
  const roomEntity = channelDoc || groupDoc;
  if (!roomEntity) {
    return { canAccess: false, canSend: false, channel: null, group: null };
  }
  const canAccess = asArray(toPlain(roomEntity)?.participantsId).includes(userId);
  return {
    canAccess,
    canSend:
      canAccess && canGroupMemberSendMessage({ group: roomEntity, userId }),
    channel: toPlain(channelDoc),
    group: toPlain(groupDoc),
  };
};

const canManagePoll = ({ poll, chat, userId, roomType, groupAccess }) => {
  if (!poll || !chat || !userId) return false;
  if (poll.createdBy && poll.createdBy === userId) return true;
  if (chat.userId === userId) return true;
  if (roomType !== 'group') return false;
  const group = groupAccess?.group || null;
  if (!group) return false;
  const adminIds = [
    group.adminId,
    ...asArray(group.adminsId),
  ].filter(Boolean);
  return adminIds.includes(userId);
};

const emitChatError = (message, extra = {}) => {
  socket.emit('chat/error', {
    message,
    ...extra,
  });
};

module.exports = (socket) => {
  socket.on('chat/insert', async (args) => {
    try {
      await cleanupExpiredSecretChats({ roomId: args?.roomId });
      logger.info('CHAT_INSERT_START', {
        socketId: socket.id,
        roomId: args?.roomId,
        roomType: args?.roomType,
        userId: args?.userId,
        hasText: !!args?.text,
        hasFile: !!args?.file,
        file: args?.file
          ? {
              originalname: args.file.originalname,
              type: args.file.type,
              size: args.file.size,
              urlPrefix:
                typeof args.file.url === 'string'
                  ? args.file.url.slice(0, 60)
                  : null,
            }
          : null,
      });

      let hiddenOwners = [];
      let visibleOwners = asArray(args.ownersId);
      let receiverOnline = false;
      const secretRoom = await getSecretRoomState(args?.roomId);

      if (args.roomType === 'group') {
        const groupAccess = await canAccessGroupRoom({
          roomId: args.roomId,
          userId: args.userId,
        });
        if (!groupAccess.canAccess || !groupAccess.canSend) return;
        await enforceModerationForMessage({
          roomEntity: groupAccess.channel || groupAccess.group,
          roomId: args.roomId,
          roomType: args.roomType,
          senderId: args.userId,
          text: args.text,
          file: args.file,
        });
      }

      if (args.roomType === 'private') {
        const blockState = await getPrivateChatBlockState({
          senderId: args.userId,
          ownersId: args.ownersId,
          roomId: args.roomId,
        });

        if (blockState === true) return;

        const { receiverId, senderBlockedReceiver, receiverBlockedSender } =
          blockState;
        if (senderBlockedReceiver || receiverBlockedSender) return;
        if (
          !(await canPrivateMessageProceed({
            senderId: args.userId,
            receiverId,
          }))
        ) {
          return;
        }

        hiddenOwners = [];
        visibleOwners = visibleOwners.filter((ownerId) => ownerId !== receiverId);
        visibleOwners = addToSet(visibleOwners, [receiverId]);

        const receiverProfile = await ProfileModel.findOne({
          where: { userId: receiverId },
          attributes: ['online'],
        });
        receiverOnline = !!toPlain(receiverProfile)?.online;
      }

      let fileId = null;
      let file = null;

      if (args.file) {
        const originalname = args.file.originalname || 'attachment';
        const arrOriname = originalname.split('.');
        const format =
          arrOriname.length === 1
            ? 'bin'
            : arrOriname.reverse()[0].toLowerCase();

        fileId = uniqueId(20);

        if (
          typeof args.file.url === 'string' &&
          args.file.url.startsWith('data:')
        ) {
          logger.info('CHAT_INSERT_FILE_DATA_URI', {
            userId: args.userId,
            roomId: args.roomId,
            originalname,
          });
          const { mime, buffer } = parseDataUri(args.file.url);
          const senderProfile = await ProfileModel.findOne({
            where: { userId: args.userId },
            attributes: ['username'],
          });
          const safeUserFolder = sanitizeFolderName(
            toPlain(senderProfile)?.username,
            sanitizeFolderName(args.userId, 'unknown')
          );

          const upload = await saveBufferFile({
            buffer,
            folder: `chat/${safeUserFolder || 'unknown'}`,
            filename: `${fileId}.${format}`,
          });
          logger.info('CHAT_INSERT_FILE_SAVED', {
            userId: args.userId,
            roomId: args.roomId,
            fileId,
            uploadPath: upload.publicPath,
            uploadSize: upload.size,
          });

          let type = 'raw';
          if (mime.startsWith('image/')) type = 'image';
          if (mime.startsWith('video/')) type = 'video';

          file = await FileModel.create({
            fileId,
            url: upload.url,
            originalname,
            type,
            format,
            size: upload.size,
            duration: Math.max(0, Math.round(Number(args.file?.duration) || 0)),
            thumbnailUrl: args.file?.thumbnailUrl || '',
            streamUrl: args.file?.streamUrl || '',
            streamHdUrl: args.file?.streamHdUrl || '',
            width: Math.max(0, Number(args.file?.width) || 0),
            height: Math.max(0, Number(args.file?.height) || 0),
          });
        } else {
          logger.info('CHAT_INSERT_FILE_URL', {
            userId: args.userId,
            roomId: args.roomId,
            fileId,
            url: args.file.url,
          });
          file = await FileModel.create({
            fileId,
            url: args.file.url,
            originalname,
            type: args.file.type || 'raw',
            format: args.file.format || format,
            size: Number(args.file.size || 0),
            duration: Math.max(0, Math.round(Number(args.file?.duration) || 0)),
            thumbnailUrl: args.file?.thumbnailUrl || '',
            streamUrl: args.file?.streamUrl || '',
            streamHdUrl: args.file?.streamHdUrl || '',
            width: Math.max(0, Number(args.file?.width) || 0),
            height: Math.max(0, Number(args.file?.height) || 0),
          });
        }
      }

      const chatDoc = await ChatModel.create({
        ...args,
        text: isSecretEnabled(secretRoom) ? '' : args.text,
        encryptedText:
          isSecretEnabled(secretRoom) && String(args?.text || '').length > 0
            ? encryptSecretText({
                text: args.text || '',
                key: secretRoom.secretSessionKey,
              })
            : null,
        encryptionSessionId: isSecretEnabled(secretRoom)
          ? secretRoom.secretSessionId
          : null,
        expiresAt: getSecretExpiresAt(secretRoom),
        fileId,
        viewOnce: !!args?.viewOnce,
        viewOnceType: !!args?.viewOnce
          ? getViewOnceType({
              text: args?.text,
              file: toPlain(file),
              explicitType: args?.viewOnceType,
            })
          : 'none',
        viewOnceOpenedBy: [],
        deletedBy: hiddenOwners,
        delivered: args.roomType === 'private' ? receiverOnline : false,
      });
      const chat = toPlain(chatDoc);

      const profileDoc = await ProfileModel.findOne({
        where: { userId: args.userId },
        attributes: ['userId', 'avatar', 'fullname', 'username'],
      });
      const profile = toPlain(profileDoc);
      const roomAccess =
        args.roomType === 'group'
          ? await canAccessGroupRoom({
              roomId: args.roomId,
              userId: args.userId,
            })
          : { channel: null };
      const senderName = roomAccess.channel?.name || profile?.fullname || '';
      const outgoingProfile = getChannelIdentity(roomAccess.channel) || profile;

      const currentInbox = await InboxModel.findOne({
        where: { roomId: args.roomId },
      });
      const contentText = isViewOnceChat(chat)
        ? chat.viewOnceType === 'image'
          ? '1-time photo'
          : chat.viewOnceType === 'video'
            ? '1-time video'
            : '1-time message'
        : isSecretEnabled(secretRoom)
          ? getSecretPreviewText({ text: args.text, file: toPlain(file) })
          : getInboxPreviewText(chat.text, file);

      const nextDeletedBy =
        hiddenOwners.length > 0
          ? addToSet(currentInbox?.deletedBy, hiddenOwners)
          : [];

      if (currentInbox) {
        const nextArchivedBy = await resolveArchivedByAfterIncoming({
          archivedBy: currentInbox.archivedBy,
          ownersId: args.ownersId,
          senderId: args.userId,
        });

        await currentInbox.update({
          unreadMessage: Number(currentInbox.unreadMessage || 0) + 1,
          roomId: args.roomId,
          ownersId: args.ownersId,
          fileId,
          deletedBy: nextDeletedBy,
          archivedBy: nextArchivedBy,
        content: {
          from: args.userId,
          senderName,
          text: contentText,
            time: chat.createdAt,
            delivered: !!chat.delivered,
            readed: false,
          },
        });
      } else {
        await InboxModel.create({
          roomId: args.roomId,
          ownersId: args.ownersId,
          unreadMessage: 1,
          fileId,
          deletedBy: nextDeletedBy,
        content: {
          from: args.userId,
          senderName,
          text: contentText,
            time: chat.createdAt,
            delivered: !!chat.delivered,
            readed: false,
          },
        });
      }

      const inboxes = await Inbox.find({ roomId: args.roomId });

      const resolvedChatText = getResolvedChatText({ chat, secretRoom });
      io.to(args.roomId).emit('chat/insert', {
        ...chat,
        text: isViewOnceChat(chat) ? '' : resolvedChatText,
        profile: outgoingProfile,
        channel: roomAccess.channel || null,
        file: isViewOnceChat(chat) && file ? { ...toPlain(file), url: null } : toPlain(file),
        viewOnce: isViewOnceChat(chat)
          ? {
              enabled: true,
              type: chat.viewOnceType,
              opened: false,
              label: 'Tap to open',
              previewText:
                chat.viewOnceType === 'image'
                  ? 'Photo'
                  : chat.viewOnceType === 'video'
                    ? 'Video'
                    : 'Encrypted message',
            }
          : null,
        reply: await buildReplyPayload(chat.replyTo, secretRoom),
        poll: parsePollFromText(resolvedChatText),
        secret: getSecretPayload(secretRoom, chat),
      });

      const pushTargets = visibleOwners.filter(
        (ownerId) => ownerId !== args.userId
      );
      if (pushTargets.length > 0) {
        const pushCategory = args.roomType === 'group' ? 'group' : 'message';
        const roomLabel =
          roomAccess.channel?.name || roomAccess.group?.name || '';
        const pushTitle =
          args.roomType === 'group'
            ? roomLabel
              ? `New message in ${roomLabel}`
              : 'New group message'
            : senderName || 'New message';
        const safeContent = contentText || 'New message';
        const pushPreview =
          args.roomType === 'group'
            ? `${senderName || 'Someone'}: ${safeContent}`
            : safeContent;
        const pushFallback =
          args.roomType === 'group' ? 'New group message' : 'New message';

        sendPushToUsers({
          userIds: pushTargets,
          title: pushTitle,
          preview: pushPreview,
          fallback: pushFallback,
          category: pushCategory,
          url: buildPushUrl({
            roomType: args.roomType,
            profile,
            roomAccess,
          }),
          data: {
            roomId: args.roomId,
            roomType: args.roomType,
          },
        }).catch((error0) => {
          logger.warn('PUSH_NOTIFY_ERROR', {
            roomId: args.roomId,
            message: error0?.message || 'Failed to send push notification',
          });
        });
      }

      logger.info('CHAT_INSERT_DONE', {
        roomId: args.roomId,
        chatId: chat._id,
        fileId,
        visibleOwnersCount: visibleOwners.length,
      });
      if (inboxes[0]) {
        io.to(visibleOwners).emit('inbox/find', inboxes[0]);
      }
    } catch (error0) {
      if (error0?.statusCode === 403 || error0?.statusCode === 429) {
        emitChatError(error0.message, {
          code: error0.code || 'moderation_blocked',
          roomId: roomId || null,
          details: error0.details || {},
        });
        return;
      }
      logger.error('CHAT_INSERT_ERROR', {
        socketId: socket.id,
        message: error0.message,
        stack: error0.stack,
        roomId: args?.roomId,
        userId: args?.userId,
      });
    }
  });

  socket.on('chat/read', async (args) => {
    try {
      const inbox = await InboxModel.findOne({
        where: { roomId: args.roomId },
      });
      const readerId = args.userId || socket.userId;
      if (inbox) {
        const content = toPlain(inbox)?.content || {};
        const isReaderReceiver = content.from && content.from !== readerId;
        const settingMap = readerId ? await getSettingMap([readerId]) : new Map();
        const canMarkRead = allowsReadReceipts({
          setting: settingMap.get(readerId),
        });
        await inbox.update({
          unreadMessage: 0,
          markUnreadBy: pullFromArray(inbox.markUnreadBy, [readerId]),
          content: {
            ...content,
            delivered: isReaderReceiver ? true : !!content.delivered,
            readed:
              isReaderReceiver && canMarkRead ? true : !!content.readed,
          },
        });
        const chats = await ChatModel.findAll({
          where: { roomId: args.roomId, readed: false },
        });
        await Promise.all(
          chats.map((chat) =>
            chat.update({
              delivered: true,
              readed:
                chat.userId !== readerId && canMarkRead ? true : chat.readed,
            })
          )
        );
      }

      const inboxes = await Inbox.find({ ownersId: { $all: args.ownersId } });

      io.to(args.ownersId).emit('inbox/read', inboxes[0]);
      if (
        allowsReadReceipts({
          setting: (await getSettingMap([readerId])).get(readerId),
        })
      ) {
        io.to(args.roomId).emit('chat/read', true);
      }
    } catch (error0) {
      console.log(error0.message);
    }
  });

  let typingEnds = null;
  socket.on('chat/typing', async ({ roomId, roomType, userId }) => {
    clearTimeout(typingEnds);

    if (roomType === 'private') {
      const blockState = await getPrivateChatBlockState({
        senderId: userId,
        roomId,
      });
      if (blockState === true) return;
      if (
        blockState.senderBlockedReceiver ||
        blockState.receiverBlockedSender
      ) {
        return;
      }
      if (
        !(await canPrivateMessageProceed({
          senderId: userId,
          receiverId: blockState.receiverId,
        }))
      ) {
        return;
      }
    }

    if (roomType === 'group') {
      const groupAccess = await canAccessGroupRoom({ roomId, userId });
      if (!groupAccess.canAccess || !groupAccess.canSend) return;
    }

      const isGroup = roomType === 'group';
      const roomAccess = isGroup
        ? await canAccessGroupRoom({ roomId, userId })
        : null;
      const typer = isGroup
        ? roomAccess?.channel
          ? { fullname: roomAccess.channel.name }
          : await ProfileModel.findOne({
              where: { userId },
              attributes: ['fullname'],
            })
        : null;

    socket.broadcast
      .to(roomId)
      .emit(
        'chat/typing',
        isGroup ? `${typer.fullname} typing...` : 'typing...'
      );

    typingEnds = setTimeout(() => {
      socket.broadcast.to(roomId).emit('chat/typing-ends', true);
    }, 1000);
  });

  socket.on(
    'chat/delete',
    async ({ userId, chatsId, roomId, deleteForEveryone }) => {
      try {
        const handleDeleteFiles = async (chats) => {
          const filesId = chats
            .filter((elem) => !!elem.fileId)
            .map((elem) => elem.fileId);

          if (filesId.length > 0) {
            const files = await FileModel.findAll({
              where: { fileId: { [Op.in]: filesId } },
              attributes: ['url', 'fileId', 'thumbnailUrl', 'streamUrl', 'streamHdUrl'],
            });

            await Promise.all(
              files.flatMap((file) =>
                getFileCleanupUrls(file).map((targetUrl) =>
                  deleteLocalFileByUrl(targetUrl)
                )
              )
            );
            await FileModel.destroy({
              where: { fileId: { [Op.in]: filesId } },
            });
          }
        };

        const targetChatsRaw = await ChatModel.findAll({
          where: { roomId, _id: { [Op.in]: chatsId } },
        });
        const targetChats = toPlainMany(targetChatsRaw);
        const ownChatIds = targetChats
          .filter((chat) => chat.userId === userId)
          .map((chat) => chat._id);
        const othersChatIds = targetChats
          .filter((chat) => chat.userId !== userId)
          .map((chat) => chat._id);

        if (deleteForEveryone) {
          // Owner messages can be deleted for everyone.
          if (ownChatIds.length > 0) {
            const ownChats = targetChats.filter((chat) =>
              ownChatIds.includes(chat._id)
            );
            await handleDeleteFiles(ownChats);
            await ChatModel.destroy({
              where: { roomId, _id: { [Op.in]: ownChatIds } },
            });
            io.to(roomId).emit('chat/delete', { userId, chatsId: ownChatIds });
          }

          // Non-owner messages are always delete-for-me only.
          if (othersChatIds.length > 0) {
            await Promise.all(
              targetChatsRaw
                .filter((chat) => othersChatIds.includes(chat._id))
                .map(async (chat) => {
                  const deletedBy = addToSet(chat.deletedBy, [userId]);
                  await chat.update({ deletedBy });
                })
            );
            socket.emit('chat/delete', { userId, chatsId: othersChatIds });
          }
        } else {
          await Promise.all(
            targetChatsRaw.map(async (chat) => {
              const deletedBy = addToSet(chat.deletedBy, [userId]);
              await chat.update({ deletedBy });
            })
          );

          const inbox = await InboxModel.findOne({ where: { roomId } });
          const ownersCount = asArray(toPlain(inbox)?.ownersId).length;

          const roomChats = toPlainMany(
            await ChatModel.findAll({
              where: { roomId },
            })
          );
          const permanentlyDeleted = roomChats.filter(
            (chat) => asArray(chat.deletedBy).length >= ownersCount
          );

          await handleDeleteFiles(permanentlyDeleted);
          if (permanentlyDeleted.length > 0) {
            await ChatModel.destroy({
              where: {
                _id: { [Op.in]: permanentlyDeleted.map((chat) => chat._id) },
              },
            });
          }

          socket.emit('chat/delete', { userId, chatsId });
        }
      } catch (error0) {
        console.error(error0.message);
      }
    }
  );

  socket.on('chat/react', async ({ roomId, chatId, userId, emoji }) => {
    try {
      if (!roomId || !chatId || !userId) return;
      await cleanupExpiredSecretChats({ roomId });
      const chatDoc = await ChatModel.findOne({
        where: { _id: chatId, roomId },
      });
      if (!chatDoc) return;
      const secretRoom = await getSecretRoomState(roomId);

      const nextReactions = { ...(toPlain(chatDoc)?.reactions || {}) };
      if (!emoji) {
        delete nextReactions[userId];
      } else {
        nextReactions[userId] = emoji;
      }

      await chatDoc.update({ reactions: nextReactions });
      io.to(roomId).emit('chat/react', { chatId, reactions: nextReactions });

      // Show reaction as a regular chat entry as well.
      if (!emoji) return;

      const currentInbox = await InboxModel.findOne({
        where: { roomId },
      });
      if (!currentInbox) return;

      const ownersId = asArray(currentInbox.ownersId);
      let hiddenOwners = [];
      let visibleOwners = ownersId;
      let receiverOnline = false;

      if (ownersId.length === 2) {
        const blockState = await getPrivateChatBlockState({
          senderId: userId,
          ownersId,
          roomId,
        });
        if (blockState === true) return;

        const { receiverId, senderBlockedReceiver, receiverBlockedSender } =
          blockState;
        if (senderBlockedReceiver || receiverBlockedSender) return;
        if (
          !(await canPrivateMessageProceed({
            senderId: userId,
            receiverId,
          }))
        ) {
          return;
        }

        hiddenOwners = [];
        visibleOwners = visibleOwners.filter((ownerId) => ownerId !== receiverId);
        visibleOwners = addToSet(visibleOwners, [receiverId]);

        const receiverProfile = await ProfileModel.findOne({
          where: { userId: receiverId },
          attributes: ['online'],
        });
        receiverOnline = !!toPlain(receiverProfile)?.online;
      }

      const reactionChatDoc = await ChatModel.create({
        userId,
        roomId,
        text: isSecretEnabled(secretRoom) ? '' : `Reacted ${emoji}`,
        encryptedText: isSecretEnabled(secretRoom)
          ? encryptSecretText({
              text: `Reacted ${emoji}`,
              key: secretRoom.secretSessionKey,
            })
          : null,
        encryptionSessionId: isSecretEnabled(secretRoom)
          ? secretRoom.secretSessionId
          : null,
        expiresAt: getSecretExpiresAt(secretRoom),
        replyTo: chatId,
        readed: false,
        delivered: ownersId.length === 2 ? receiverOnline : false,
        deletedBy: hiddenOwners,
        fileId: null,
        reactions: {},
      });
      const reactionChat = toPlain(reactionChatDoc);

      const profile = toPlain(
        await ProfileModel.findOne({
          where: { userId },
          attributes: ['userId', 'avatar', 'fullname'],
        })
      );

      const nextDeletedBy =
        hiddenOwners.length > 0
          ? addToSet(currentInbox.deletedBy, hiddenOwners)
          : [];

      await currentInbox.update({
        unreadMessage: Number(currentInbox.unreadMessage || 0) + 1,
        deletedBy: nextDeletedBy,
        archivedBy: await resolveArchivedByAfterIncoming({
          archivedBy: currentInbox.archivedBy,
          ownersId,
          senderId: userId,
        }),
        content: {
          from: userId,
          senderName: profile?.fullname || '',
          text: isSecretEnabled(secretRoom)
            ? 'Secret reaction'
            : reactionChat.text,
          time: reactionChat.createdAt,
          delivered: !!reactionChat.delivered,
          readed: false,
        },
      });

      io.to(roomId).emit('chat/insert', {
        ...reactionChat,
        text: getResolvedChatText({ chat: reactionChat, secretRoom }),
        profile,
        file: null,
        reply: await buildReplyPayload(reactionChat.replyTo, secretRoom),
        poll: null,
        secret: getSecretPayload(secretRoom, reactionChat),
      });

      const inboxes = await Inbox.find({ roomId });
      if (inboxes[0]) {
        io.to(visibleOwners).emit('inbox/find', inboxes[0]);
      }
    } catch (error0) {
      if (error0?.statusCode === 403 || error0?.statusCode === 429) {
        emitChatError(error0.message, {
          code: error0.code || 'moderation_blocked',
          roomId: args?.roomId || null,
          details: error0.details || {},
        });
        return;
      }
      console.error(error0.message);
    }
  });

  socket.on('chat/edit', async ({ roomId, chatId, userId, text, replyTo }) => {
    try {
      if (!roomId || !chatId || !userId) return;

      const chatDoc = await ChatModel.findOne({
        where: { _id: chatId, roomId },
      });
      if (!chatDoc) return;

      const chat = toPlain(chatDoc);
      if (chat.userId !== userId) return;
      if (chat.isSecretSystemMessage || isViewOnceChat(chat)) return;

      const secretRoom = await getSecretRoomState(roomId);
      const currentText = getResolvedChatText({ chat, secretRoom });
      if (isStructuredMessage(currentText)) return;
      const inbox = toPlain(
        await InboxModel.findOne({
          where: { roomId },
          attributes: ['roomType'],
        })
      );
      const roomType = inbox?.roomType === 'group' ? 'group' : 'private';

      const nextText = String(text || '').trim();
      if (!nextText) return;
      const nextReplyTo = replyTo || null;

      if (currentText === nextText && (chat.replyTo || null) === nextReplyTo) {
        return;
      }

      const editedAt = new Date().toISOString();
      const groupAccess =
        roomType === 'group'
          ? await canAccessGroupRoom({ roomId, userId })
          : null;
      if (roomType === 'group') {
        await enforceModerationForMessage({
          roomEntity: groupAccess?.channel || groupAccess?.group,
          roomId,
          roomType,
          senderId: userId,
          text: nextText,
          file: null,
        });
      }
      const nextHistory = [
        ...sanitizeEditHistory(chat.editHistory),
        buildHistoryEntry({
          text: currentText,
          replyTo: chat.replyTo || null,
          userId,
          editedAt,
        }),
      ];

      const encryptedText =
        isSecretEnabled(secretRoom) && nextText.length > 0
          ? encryptSecretText({
              text: nextText,
              key: secretRoom.secretSessionKey,
            })
          : null;

      await chatDoc.update({
        text: isSecretEnabled(secretRoom) ? '' : nextText,
        encryptedText,
        replyTo: nextReplyTo,
        isEdited: true,
        editedAt,
        editHistory: nextHistory,
      });

      const updatedChat = toPlain(chatDoc);
      const resolvedText = getResolvedChatText({ chat: updatedChat, secretRoom });

      io.to(roomId).emit('chat/edit', {
        chatId,
        text: resolvedText,
        replyTo: nextReplyTo,
        editedAt,
        isEdited: true,
        editHistory: nextHistory,
        poll: parsePollFromText(resolvedText),
      });

      const latestChatDoc = await ChatModel.findOne({
        where: { roomId },
        order: [['createdAt', 'DESC']],
      });

      if (latestChatDoc && toPlain(latestChatDoc)?._id === chatId) {
        const currentInbox = await InboxModel.findOne({ where: { roomId } });
        if (currentInbox) {
          const currentContent = toPlain(currentInbox)?.content || {};
          const attachment =
            chat.fileId && !chat.file
              ? toPlain(
                  await FileModel.findOne({
                    where: { fileId: chat.fileId },
                  })
                )
              : null;
          const previewText = isSecretEnabled(secretRoom)
            ? getSecretPreviewText({ text: resolvedText, file: attachment })
            : getInboxPreviewText(resolvedText, attachment);

          await currentInbox.update({
            content: {
              ...currentContent,
              text: previewText,
            },
          });

          const inboxes = await Inbox.find({ roomId });
          if (inboxes[0]) {
            io.to(asArray(inboxes[0].ownersId)).emit('inbox/find', inboxes[0]);
          }
        }
      }
    } catch (error0) {
      if (error0?.statusCode === 403 || error0?.statusCode === 429) {
        emitChatError(error0.message, {
          code: error0.code || 'moderation_blocked',
          roomId,
          details: error0.details || {},
        });
        return;
      }
      logger.error('CHAT_EDIT_ERROR', {
        message: error0.message,
        stack: error0.stack,
        roomId,
        chatId,
        userId,
      });
    }
  });

  socket.on('chat/poll-vote', async ({ roomId, chatId, userId, optionId }) => {
    try {
      if (!roomId || !chatId || !userId || !optionId) return;

      const chatDoc = await ChatModel.findOne({
        where: { _id: chatId, roomId },
      });
      if (!chatDoc) return;

      const poll = parsePollFromText(chatDoc.text);
      if (!poll) return;
      if (poll.closedAt) return;
      const optionExists = poll.options.some((option) => option.id === optionId);
      if (!optionExists) return;

      const voterProfile = toPlain(
        await ProfileModel.findOne({
          where: { userId },
          attributes: ['fullname'],
        })
      );
      const voterName = voterProfile?.fullname || '[unknown]';
      const nowIso = new Date().toISOString();
      let nextOptions = poll.options;

      if (poll.multiSelect) {
        nextOptions = poll.options.map((option) => {
          if (option.id !== optionId) return option;
          const hasVote = option.votes.some((vote) => vote.userId === userId);
          if (hasVote) {
            return {
              ...option,
              votes: option.votes.filter((vote) => vote.userId !== userId),
            };
          }
          return {
            ...option,
            votes: [
              ...option.votes,
              {
                userId,
                fullname: voterName,
                at: nowIso,
              },
            ],
          };
        });
      } else {
        let alreadySelectedOptionId = null;
        const cleanedOptions = poll.options.map((option) => {
          const hasVote = option.votes.some((vote) => vote.userId === userId);
          if (hasVote) alreadySelectedOptionId = option.id;
          return {
            ...option,
            votes: option.votes.filter((vote) => vote.userId !== userId),
          };
        });
        const shouldAddVote = alreadySelectedOptionId !== optionId;
        nextOptions = cleanedOptions.map((option) => {
          if (option.id !== optionId || !shouldAddVote) return option;
          return {
            ...option,
            votes: [
              ...option.votes,
              {
                userId,
                fullname: voterName,
                at: nowIso,
              },
            ],
          };
        });
      }

      const nextPoll = normalizePollPayload({
        ...poll,
        options: nextOptions,
      });
      if (!nextPoll) return;

      const nextText = serializePollToText(nextPoll);
      await chatDoc.update({ text: nextText });

      io.to(roomId).emit('chat/poll-vote', {
        chatId,
        text: nextText,
        poll: nextPoll,
      });
    } catch (error0) {
      logger.error('CHAT_POLL_VOTE_ERROR', {
        message: error0.message,
        stack: error0.stack,
        roomId,
        chatId,
        userId,
      });
    }
  });

  socket.on('chat/poll-close', async ({ roomId, chatId, userId }) => {
    try {
      if (!roomId || !chatId || !userId) return;

      const chatDoc = await ChatModel.findOne({
        where: { _id: chatId, roomId },
      });
      if (!chatDoc) return;

      const poll = parsePollFromText(chatDoc.text);
      if (!poll || poll.closedAt) return;

      let groupAccess = null;
      const inbox = toPlain(
        await InboxModel.findOne({
          where: { roomId },
          attributes: ['roomType'],
        })
      );
      const roomType = inbox?.roomType === 'group' ? 'group' : 'private';
      if (roomType === 'group') {
        groupAccess = await canAccessGroupRoom({ roomId, userId });
      }

      if (
        !canManagePoll({
          poll,
          chat: toPlain(chatDoc),
          userId,
          roomType,
          groupAccess,
        })
      ) {
        return;
      }

      const nextPoll = normalizePollPayload({
        ...poll,
        closedAt: new Date().toISOString(),
        closedBy: userId,
      });
      if (!nextPoll) return;

      const nextText = serializePollToText(nextPoll);
      await chatDoc.update({ text: nextText });

      io.to(roomId).emit('chat/poll-close', {
        chatId,
        text: nextText,
        poll: nextPoll,
      });
    } catch (error0) {
      logger.error('CHAT_POLL_CLOSE_ERROR', {
        message: error0.message,
        stack: error0.stack,
        roomId,
        chatId,
        userId,
      });
    }
  });

  socket.on(
    'chat/forward',
    async ({
      userId,
      fromRoomId,
      chatsId,
      toRoomId,
      toRoomType,
      toOwnersId,
    }) => {
      try {
        if (!userId || !fromRoomId || !toRoomId) return;
        const [fromSecretRoom, toSecretRoom] = await Promise.all([
          getSecretRoomState(fromRoomId),
          getSecretRoomState(toRoomId),
        ]);
        if (
          (isSecretEnabled(fromSecretRoom) && fromSecretRoom.secretForwardBlocked) ||
          (isSecretEnabled(toSecretRoom) && toSecretRoom.secretForwardBlocked)
        ) {
          socket.emit('chat/forward-blocked', {
            roomId: fromRoomId,
            message: 'Forward is blocked in secret chat',
          });
          return;
        }
        const ids = asArray(chatsId);
        if (ids.length === 0) return;

        let visibleOwners = asArray(toOwnersId);
        if (toRoomType === 'private') {
          const blockState = await getPrivateChatBlockState({
            senderId: userId,
            ownersId: toOwnersId,
            roomId: toRoomId,
          });
          if (blockState === true) return;
          if (blockState.senderBlockedReceiver || blockState.receiverBlockedSender) {
            return;
          }
          if (
            !(await canPrivateMessageProceed({
              senderId: userId,
              receiverId: blockState.receiverId,
            }))
          ) {
            return;
          }
        }

        if (toRoomType === 'group') {
          const groupAccess = await canAccessGroupRoom({
            roomId: toRoomId,
            userId,
          });
          if (!groupAccess.canAccess || !groupAccess.canSend) return;
        }

        const fromChats = toPlainMany(
          await ChatModel.findAll({
            where: { roomId: fromRoomId, _id: { [Op.in]: ids } },
            order: [['createdAt', 'ASC']],
          })
        );
        if (fromChats.length === 0) return;

        const profile = toPlain(
          await ProfileModel.findOne({
            where: { userId },
            attributes: ['userId', 'avatar', 'fullname'],
          })
        );

        const forwardTexts = fromChats.map((source) =>
          source.text
            ? (() => {
                const poll = parsePollFromText(source.text);
                if (poll) return `Forwarded poll: ${poll.question}`;
                return `Forwarded:\n${source.text}`;
              })()
            : 'Forwarded attachment'
        );
        const createdMessages = await Promise.all(
          forwardTexts.map((text) =>
            ChatModel.create({
              userId,
              roomId: toRoomId,
              text,
              replyTo: null,
              readed: false,
              delivered: false,
              deletedBy: [],
              fileId: null,
              reactions: {},
            })
          )
        );
        const createdPlain = toPlainMany(createdMessages);

        const lastMessage = createdPlain[createdPlain.length - 1];
        const lastContent = {
          from: userId,
          senderName: profile?.fullname || '',
          text: lastMessage?.text || '',
          time: lastMessage?.createdAt || new Date().toISOString(),
          delivered: false,
          readed: false,
        };

        const currentInbox = await InboxModel.findOne({
          where: { roomId: toRoomId },
        });
        if (currentInbox) {
          const nextArchivedBy = await resolveArchivedByAfterIncoming({
            archivedBy: currentInbox.archivedBy,
            ownersId: visibleOwners,
            senderId: userId,
          });

          await currentInbox.update({
            unreadMessage:
              Number(currentInbox.unreadMessage || 0) + createdPlain.length,
            content: lastContent,
            deletedBy: [],
            archivedBy: nextArchivedBy,
          });
        } else {
          await InboxModel.create({
            roomId: toRoomId,
            roomType: toRoomType || 'private',
            ownersId: visibleOwners,
            unreadMessage: createdPlain.length,
            fileId: null,
            deletedBy: [],
            content: lastContent,
          });
        }

        createdPlain.forEach((created) => {
          io.to(toRoomId).emit('chat/insert', {
            ...created,
            profile,
            file: null,
            reply: null,
          });
        });

        const inboxes = await Inbox.find({ roomId: toRoomId });
        if (inboxes[0]) {
          io.to(visibleOwners).emit('inbox/find', inboxes[0]);
        }
      } catch (error0) {
        console.error(error0.message);
      }
    }
  );

  const secretAlertCooldown = new Map();

  socket.on('secret/screenshot-alert', async ({ roomId, userId }) => {
    try {
      if (!roomId || !userId) return;
      const secretRoom = await getSecretRoomState(roomId);
      if (!isSecretEnabled(secretRoom) || !secretRoom.secretScreenshotAlerts) {
        return;
      }
      const cooldownKey = `${roomId}:${userId}`;
      const lastAt = secretAlertCooldown.get(cooldownKey) || 0;
      if (Date.now() - lastAt < 15000) return;
      secretAlertCooldown.set(cooldownKey, Date.now());

      const profile = toPlain(
        await ProfileModel.findOne({
          where: { userId },
          attributes: ['fullname'],
        })
      );
      const alertText = `${
        profile?.fullname || 'Someone'
      } triggered a screenshot alert`;
      const chatDoc = await ChatModel.create({
        userId,
        roomId,
        text: '',
        encryptedText: encryptSecretText({
          text: alertText,
          key: secretRoom.secretSessionKey,
        }),
        encryptionSessionId: secretRoom.secretSessionId,
        expiresAt: getSecretExpiresAt(secretRoom),
        replyTo: null,
        readed: false,
        delivered: false,
        deletedBy: [],
        fileId: null,
        reactions: {},
        isSecretSystemMessage: true,
      });
      const chat = toPlain(chatDoc);
      const inbox = await InboxModel.findOne({ where: { roomId } });
      if (inbox) {
        await inbox.update({
          unreadMessage: Number(inbox.unreadMessage || 0) + 1,
          content: {
            from: userId,
            senderName: profile?.fullname || '',
            text: 'Secret screenshot alert',
            time: chat.createdAt,
            delivered: false,
            readed: false,
          },
        });
      }

      io.to(roomId).emit('chat/insert', {
        ...chat,
        text: alertText,
        profile: {
          userId,
          fullname: 'Secret chat',
          avatar: null,
        },
        file: null,
        reply: null,
        poll: null,
        secret: getSecretPayload(secretRoom, chat),
      });

      const inboxes = await Inbox.find({ roomId });
      if (inboxes[0]) {
        io.to(asArray(inboxes[0].ownersId)).emit('inbox/find', inboxes[0]);
      }
    } catch (error0) {
      logger.error('SECRET_SCREENSHOT_ALERT_ERROR', {
        message: error0.message,
        stack: error0.stack,
        roomId,
        userId,
      });
    }
  });
};
