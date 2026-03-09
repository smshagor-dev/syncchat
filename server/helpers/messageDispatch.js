const { Op } = require('sequelize');
const ChatModel = require('../db/models/chat');
const InboxModel = require('../db/models/inbox');
const FileModel = require('../db/models/file');
const ProfileModel = require('../db/models/profile');
const SettingModel = require('../db/models/setting');
const GroupModel = require('../db/models/group');
const ChannelModel = require('../db/models/channel');
const { asArray, toPlain, toPlainMany, addToSet, pullFromArray } = require('../db/utils');
const Inbox = require('./models/inbox');
const Chat = require('./models/chats');
const { canGroupMemberSendMessage } = require('./groupPermissions');
const {
  canReceiveUnknownMessage,
  getSettingMap,
  getContactMap,
} = require('./privacy');
const {
  decryptSecretText,
  encryptSecretText,
  getSecretExpiresAt,
  getSecretPreviewText,
  getSecretRoomState,
  isSecretEnabled,
  cleanupExpiredSecretChats,
} = require('./secretChat');

const POLL_PREFIX = '__poll__::';
const EVENT_PREFIX = '__event__::';

const normalizePollVotes = (votes) =>
  asArray(votes)
    .map((vote) => ({
      userId: vote?.userId || '',
      fullname: vote?.fullname || '[unknown]',
    }))
    .filter((vote) => vote.userId);

const parsePollFromText = (text) => {
  if (typeof text !== 'string' || !text.startsWith(POLL_PREFIX)) return null;
  try {
    const parsed = JSON.parse(text.slice(POLL_PREFIX.length));
    const options = asArray(parsed?.options)
      .map((option, index) => ({
        id: String(option?.id || `opt-${index + 1}`),
        text: String(option?.text || '').trim(),
        votes: normalizePollVotes(option?.votes),
      }))
      .filter((option) => option.text);

    if (!String(parsed?.question || '').trim() || options.length < 2) {
      return null;
    }

    return {
      version: 1,
      question: String(parsed.question).trim(),
      options,
      createdBy: parsed?.createdBy || null,
      createdAt: parsed?.createdAt || null,
    };
  } catch (error0) {
    return null;
  }
};

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

const getInboxPreviewText = (chatText, file) => {
  const poll = parsePollFromText(chatText);
  if (poll) return 'Poll';
  const event = parseEventFromText(chatText);
  if (event) return 'Event';
  return chatText && chatText.length > 0
    ? chatText
    : toPlain(file)?.originalname || '';
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

const getResolvedChatText = ({ chat, secretRoom }) => {
  if (isSecretEnabled(secretRoom) && chat?.encryptedText) {
    return decryptSecretText({
      payload: chat.encryptedText,
      key: secretRoom.secretSessionKey,
    });
  }
  return chat?.text || '';
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

const getSecretPayload = (secretRoom, chat) =>
  isSecretEnabled(secretRoom)
    ? {
        enabled: true,
        expiresAt: chat.expiresAt,
        saveBlocked: !!secretRoom.secretSaveBlocked,
        forwardBlocked: !!secretRoom.secretForwardBlocked,
        exportBlocked: !!secretRoom.secretExportBlocked,
        screenshotAlerts: !!secretRoom.secretScreenshotAlerts,
        sessionId: secretRoom.secretSessionId,
      }
    : null;

const buildReplyPayload = async (replyTo, secretRoom = null) => {
  if (!replyTo) return null;
  const replyDoc = await ChatModel.findOne({
    where: { _id: replyTo },
    attributes: ['_id', 'userId', 'text', 'encryptedText', 'fileId'],
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

const canAccessGroupRoom = async ({ roomId, userId }) => {
  const [channelDoc, groupDoc] = await Promise.all([
    ChannelModel.findOne({
      where: { roomId },
      attributes: { exclude: ['passwordHash'] },
    }),
    GroupModel.findOne({
      where: { roomId },
      attributes: ['participantsId', 'adminId', 'adminsId', 'permissions'],
    }),
  ]);
  const roomEntity = toPlain(channelDoc) || toPlain(groupDoc);
  if (!roomEntity) {
    return { canAccess: false, canSend: false, channel: null };
  }

  const canAccess = asArray(roomEntity.participantsId).includes(userId);
  return {
    canAccess,
    canSend:
      canAccess && canGroupMemberSendMessage({ group: roomEntity, userId }),
    channel: toPlain(channelDoc),
  };
};

exports.sendTextMessage = async ({
  senderId,
  roomId,
  roomType = 'private',
  ownersId = [],
  text = '',
  replyTo = null,
  scheduleMeta = null,
}) => {
  if (!senderId || !roomId) {
    throw new Error('Invalid message payload');
  }

  await cleanupExpiredSecretChats({ roomId });

  let hiddenOwners = [];
  let visibleOwners = asArray(ownersId).filter(Boolean);
  let receiverOnline = false;
  const secretRoom = await getSecretRoomState(roomId);

  if (roomType === 'group') {
    const groupAccess = await canAccessGroupRoom({ roomId, userId: senderId });
    if (!groupAccess.canAccess || !groupAccess.canSend) {
      throw new Error('You do not have permission to send messages');
    }
  }

  if (roomType === 'private') {
    const blockState = await getPrivateChatBlockState({
      senderId,
      ownersId,
      roomId,
    });
    if (blockState === true) {
      throw new Error('This chat is no longer available');
    }

    const { receiverId, senderBlockedReceiver, receiverBlockedSender } =
      blockState;
    if (senderBlockedReceiver || receiverBlockedSender) {
      throw new Error('You cannot send messages in this chat');
    }
    if (
      !(await canPrivateMessageProceed({
        senderId,
        receiverId,
      }))
    ) {
      throw new Error('This user only accepts messages from contacts');
    }

    visibleOwners = addToSet(
      visibleOwners.filter((ownerId) => ownerId !== receiverId),
      [receiverId]
    );

    const receiverProfile = await ProfileModel.findOne({
      where: { userId: receiverId },
      attributes: ['online'],
    });
    receiverOnline = !!toPlain(receiverProfile)?.online;
  }

  const chatDoc = await ChatModel.create({
    userId: senderId,
    roomId,
    text: isSecretEnabled(secretRoom) ? '' : text,
    encryptedText:
      isSecretEnabled(secretRoom) && String(text || '').length > 0
        ? encryptSecretText({
            text: text || '',
            key: secretRoom.secretSessionKey,
          })
        : null,
    encryptionSessionId: isSecretEnabled(secretRoom)
      ? secretRoom.secretSessionId
      : null,
    expiresAt: getSecretExpiresAt(secretRoom),
    replyTo: replyTo || null,
    deletedBy: hiddenOwners,
    delivered: roomType === 'private' ? receiverOnline : false,
  });
  const chat = toPlain(chatDoc);

  const [profileDoc, roomAccess, currentInbox] = await Promise.all([
    ProfileModel.findOne({
      where: { userId: senderId },
      attributes: ['userId', 'avatar', 'fullname'],
    }),
    roomType === 'group'
      ? canAccessGroupRoom({ roomId, userId: senderId })
      : Promise.resolve({ channel: null }),
    InboxModel.findOne({ where: { roomId } }),
  ]);

  const profile = toPlain(profileDoc);
  const senderName = roomAccess.channel?.name || profile?.fullname || '';
  const outgoingProfile = getChannelIdentity(roomAccess.channel) || profile;
  const contentText = isSecretEnabled(secretRoom)
    ? getSecretPreviewText({ text })
    : getInboxPreviewText(chat.text, null);
  const nextDeletedBy =
    hiddenOwners.length > 0 ? addToSet(currentInbox?.deletedBy, hiddenOwners) : [];

  if (currentInbox) {
    const nextArchivedBy = await resolveArchivedByAfterIncoming({
      archivedBy: currentInbox.archivedBy,
      ownersId,
      senderId,
    });

    await currentInbox.update({
      unreadMessage: Number(currentInbox.unreadMessage || 0) + 1,
      roomId,
      ownersId,
      deletedBy: nextDeletedBy,
      archivedBy: nextArchivedBy,
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
      roomId,
      ownersId,
      roomType,
      unreadMessage: 1,
      deletedBy: nextDeletedBy,
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
  const resolvedChatText = getResolvedChatText({ chat, secretRoom });
  const payload = {
    ...chat,
    text: resolvedChatText,
    profile: outgoingProfile,
    channel: roomAccess.channel || null,
    file: null,
    reply: await buildReplyPayload(chat.replyTo, secretRoom),
    poll: parsePollFromText(resolvedChatText),
    secret: getSecretPayload(secretRoom, chat),
    scheduled: scheduleMeta,
  };

  if (global.io) {
    global.io.to(roomId).emit('chat/insert', payload);
    if (inboxes[0]) {
      global.io.to(visibleOwners).emit('inbox/find', inboxes[0]);
    }
  }

  const latest = await Chat.find(roomId, {
    skip: 0,
    limit: 1,
    userId: senderId,
  });

  return {
    chat: latest[0] || payload,
    inbox: inboxes[0] || null,
  };
};
