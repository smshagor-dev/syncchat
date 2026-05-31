const Inbox = require('../helpers/models/inbox');
const InboxModel = require('../db/models/inbox');
const ChatModel = require('../db/models/chat');
const ProfileModel = require('../db/models/profile');
const ChannelModel = require('../db/models/channel');
const { addToSet, pullFromArray, asArray, toPlain } = require('../db/utils');
const encrypt = require('../helpers/encrypt');
const decrypt = require('../helpers/decrypt');
const response = require('../helpers/response');
const { trackChannelEvent } = require('../helpers/channelAnalytics');
const { getSettingMap, allowsReadReceipts } = require('../helpers/privacy');
const {
  createSecretSession,
  ensureSecretSession,
  encryptSecretText,
  getSecretExpiresAt,
  isSecretEnabled,
  normalizeSecretTimer,
} = require('../helpers/secretChat');

exports.find = async (req, res) => {
  try {
    const inboxes = await Inbox.find(
      { ownersId: req.user._id },
      req.query.search
    );
    const visibleInboxes = inboxes.filter(
      (inbox) => !asArray(inbox.deletedBy).includes(req.user._id)
    );

    response({
      res,
      payload: visibleInboxes,
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

exports.findByRoomId = async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user?._id;
    const rawInbox = await InboxModel.findOne({ where: { roomId } });
    const normalizedInbox = await ensureSecretSession(rawInbox);
    const inboxes = await Inbox.find({ roomId });
    const inbox = inboxes[0]
      ? {
          ...inboxes[0],
          secretSessionId:
            inboxes[0].secretSessionId || normalizedInbox?.secretSessionId || null,
        }
      : normalizedInbox;

    if (!inbox) {
      response({
        res,
        statusCode: 404,
        success: false,
        message: 'Inbox not found',
      });
      return;
    }

    if (!asArray(inbox.ownersId).includes(userId)) {
      response({
        res,
        statusCode: 403,
        success: false,
        message: 'Forbidden',
      });
      return;
    }

    response({
      res,
      payload: inbox,
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

const toggleForUser = (current, userId, nextValue = null) => {
  const values = asArray(current);
  const enabled =
    typeof nextValue === 'boolean' ? nextValue : !values.includes(userId);
  return enabled ? addToSet(values, [userId]) : pullFromArray(values, [userId]);
};

const formatTimerLabel = (seconds) => {
  const value = Number(seconds || 0);
  if (value <= 0) return 'Off';
  if (value < 60) return `${value} sec`;
  if (value % 3600 === 0) return `${value / 3600} hour`;
  if (value % 60 === 0) return `${value / 60} min`;
  return `${value} sec`;
};

const emitToUserRooms = (userIds, eventName, payload) => {
  if (!global?.io) return;
  asArray(userIds)
    .filter(Boolean)
    .forEach((userId) => {
      global.io.to(userId).emit(eventName, payload);
    });
};

const emitToRoomAndUsers = ({ roomId, userIds, eventName, payload }) => {
  if (!global?.io) return;
  if (roomId) {
    global.io.to(roomId).emit(eventName, payload);
  }
  emitToUserRooms(userIds, eventName, payload);
};

const emitSecretStateMessage = async ({
  roomId,
  inbox,
  enabled,
  userId,
  actorName = 'Someone',
}) => {
  if (!roomId || !inbox || !userId) return null;

  const text = enabled
    ? `${actorName} turned on Secret Chat. Disappearing timer: ${formatTimerLabel(
        inbox.secretDisappearSeconds
      )}.`
    : `${actorName} turned off Secret Chat.`;

  const chatDoc = await ChatModel.create({
    userId,
    roomId,
    text: isSecretEnabled(inbox) ? '' : text,
    encryptedText: isSecretEnabled(inbox)
      ? encryptSecretText({
          text,
          key: inbox.secretSessionKey,
        })
      : null,
    encryptionSessionId: isSecretEnabled(inbox) ? inbox.secretSessionId : null,
    expiresAt: getSecretExpiresAt(inbox),
    readed: false,
    delivered: false,
    deletedBy: [],
    fileId: null,
    reactions: {},
    isSecretSystemMessage: true,
  });
  const chat = toPlain(chatDoc);

  await InboxModel.update(
    {
      unreadMessage: Number(inbox.unreadMessage || 0) + 1,
      content: {
        ...(inbox.content || {}),
        from: userId,
        senderName: 'Secret chat',
        text,
        time: chat.createdAt,
        delivered: false,
        readed: false,
      },
    },
    { where: { roomId } }
  );

  const inboxes = await Inbox.find({ roomId });
  const payloadInbox = inboxes[0] || null;

  if (global?.io) {
    emitToRoomAndUsers({
      roomId,
      userIds: asArray(payloadInbox?.ownersId || inbox?.ownersId),
      eventName: 'chat/insert',
      payload: {
      ...chat,
      text,
      profile: {
        userId,
        fullname: 'Secret chat',
        avatar: null,
      },
      file: null,
      reply: null,
      poll: null,
      secret: isSecretEnabled(inbox)
        ? {
            enabled: true,
            expiresAt: chat.expiresAt,
            saveBlocked: !!inbox.secretSaveBlocked,
            forwardBlocked: !!inbox.secretForwardBlocked,
            exportBlocked: !!inbox.secretExportBlocked,
            screenshotAlerts: !!inbox.secretScreenshotAlerts,
            sessionId: inbox.secretSessionId || null,
        }
      : null,
    }});

    if (payloadInbox) {
      emitToUserRooms(asArray(payloadInbox.ownersId), 'inbox/find', payloadInbox);
      emitToUserRooms(
        asArray(payloadInbox.ownersId),
        'inbox/preferences',
        payloadInbox
      );
    }
  }

  return payloadInbox;
};

const emitPreferenceSystemMessage = async ({
  roomId,
  inbox,
  userId,
  text,
}) => {
  if (!roomId || !inbox || !userId || !String(text || '').trim()) return null;

  const chatDoc = await ChatModel.create({
    userId,
    roomId,
    text: isSecretEnabled(inbox) ? '' : text,
    encryptedText: isSecretEnabled(inbox)
      ? encryptSecretText({
          text,
          key: inbox.secretSessionKey,
        })
      : null,
    encryptionSessionId: isSecretEnabled(inbox) ? inbox.secretSessionId : null,
    expiresAt: getSecretExpiresAt(inbox),
    readed: false,
    delivered: false,
    deletedBy: [],
    fileId: null,
    reactions: {},
    isSecretSystemMessage: true,
  });
  const chat = toPlain(chatDoc);

  await InboxModel.update(
    {
      unreadMessage: Number(inbox.unreadMessage || 0) + 1,
      content: {
        ...(inbox.content || {}),
        from: userId,
        senderName: 'Secret chat',
        text,
        time: chat.createdAt,
        delivered: false,
        readed: false,
      },
    },
    { where: { roomId } }
  );

  const inboxes = await Inbox.find({ roomId });
  const payloadInbox = inboxes[0] || null;

  if (global?.io) {
    emitToRoomAndUsers({
      roomId,
      userIds: asArray(payloadInbox?.ownersId || inbox?.ownersId),
      eventName: 'chat/insert',
      payload: {
      ...chat,
      text,
      profile: {
        userId,
        fullname: 'Secret chat',
        avatar: null,
      },
      file: null,
      reply: null,
      poll: null,
      secret: isSecretEnabled(inbox)
        ? {
            enabled: true,
            expiresAt: chat.expiresAt,
            saveBlocked: !!inbox.secretSaveBlocked,
            forwardBlocked: !!inbox.secretForwardBlocked,
            exportBlocked: !!inbox.secretExportBlocked,
            screenshotAlerts: !!inbox.secretScreenshotAlerts,
            sessionId: inbox.secretSessionId || null,
        }
      : null,
    }});

    if (payloadInbox) {
      emitToUserRooms(asArray(payloadInbox.ownersId), 'inbox/find', payloadInbox);
      emitToUserRooms(
        asArray(payloadInbox.ownersId),
        'inbox/preferences',
        payloadInbox
      );
    }
  }

  return payloadInbox;
};

exports.updatePreferences = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { action, value } = req.body || {};
    const userId = req.user?._id;

    const inbox = await InboxModel.findOne({ where: { roomId } });
    if (!inbox) {
      response({
        res,
        statusCode: 404,
        success: false,
        message: 'Inbox not found',
      });
      return;
    }

    if (!asArray(inbox.ownersId).includes(userId)) {
      response({
        res,
        statusCode: 403,
        success: false,
        message: 'Forbidden',
      });
      return;
    }

    const actorProfile = await ProfileModel.findOne({
      where: { userId },
      attributes: ['fullname', 'username'],
    });
    const actorName =
      toPlain(actorProfile)?.fullname ||
      toPlain(actorProfile)?.username ||
      'Someone';

    const updates = {};
    switch (action) {
      case 'archive':
        updates.archivedBy = toggleForUser(inbox.archivedBy, userId, value);
        break;
      case 'mute':
        updates.mutedBy = toggleForUser(inbox.mutedBy, userId, value);
        break;
      case 'notificationTone': {
        const tone = String(value || '').trim() || 'default-ringtone';
        updates.notificationToneBy = {
          ...(inbox.notificationToneBy || {}),
          [userId]: tone,
        };
        break;
      }
      case 'pin':
        updates.pinnedBy = toggleForUser(inbox.pinnedBy, userId, value);
        break;
      case 'favourite':
        updates.favouriteBy = toggleForUser(inbox.favouriteBy, userId, value);
        break;
      case 'list':
        updates.listedBy = toggleForUser(inbox.listedBy, userId, value);
        break;
      case 'markUnread':
        updates.markUnreadBy = toggleForUser(inbox.markUnreadBy, userId, value);
        break;
      case 'advancedPrivacy':
        updates.privacyShieldBy = value ? asArray(inbox.ownersId) : [];
        break;
      case 'hide':
        updates.hiddenBy = toggleForUser(inbox.hiddenBy, userId, value);
        break;
      case 'secretChat': {
        if (inbox.roomType !== 'private') {
          throw new Error('Secret chat is only available for private chat');
        }
        const enabled = !!value?.enabled;
        if (enabled) {
          const session = createSecretSession();
          updates.secretChatEnabled = true;
          updates.secretDisappearSeconds = normalizeSecretTimer(
            value?.disappearSeconds ?? inbox.secretDisappearSeconds
          );
          updates.secretScreenshotAlerts =
            value?.screenshotAlerts === undefined
              ? true
              : !!value.screenshotAlerts;
          updates.secretForwardBlocked = true;
          updates.secretSaveBlocked = true;
          updates.secretExportBlocked = true;
          updates.secretSessionId = session.secretSessionId;
          updates.secretSessionKey = session.secretSessionKey;
        } else {
          updates.secretChatEnabled = false;
          updates.secretDisappearSeconds = 0;
          updates.secretSessionId = null;
          updates.secretSessionKey = null;
        }
        break;
      }
      case 'secretDisappearSeconds': {
        if (inbox.roomType !== 'private' || !inbox.secretChatEnabled) {
          throw new Error('Secret chat timer is only available in secret private chat');
        }
        updates.secretDisappearSeconds = normalizeSecretTimer(value);
        break;
      }
      case 'secretScreenshotAlerts': {
        if (inbox.roomType !== 'private' || !inbox.secretChatEnabled) {
          throw new Error('Secret screenshot alerts are only available in secret private chat');
        }
        updates.secretScreenshotAlerts = !!value;
        break;
      }
      case 'secretRegenerateSession': {
        if (inbox.roomType !== 'private' || !inbox.secretChatEnabled) {
          throw new Error('Secret session is only available in secret private chat');
        }
        const session = createSecretSession();
        updates.secretSessionId = session.secretSessionId;
        updates.secretSessionKey = session.secretSessionKey;
        break;
      }
      case 'chatLock': {
        if (inbox.roomType !== 'private') {
          throw new Error('Chat lock is only available for private chat');
        }
        const password = String(value?.password || '');
        if (password.length < 4) {
          throw new Error('Lock password must be at least 4 characters');
        }
        updates.chatLockBy = addToSet(inbox.chatLockBy, [userId]);
        updates.chatLockHashes = {
          ...(inbox.chatLockHashes || {}),
          [userId]: encrypt(password),
        };
        break;
      }
      case 'chatUnlock': {
        if (inbox.roomType !== 'private') {
          throw new Error('Chat unlock is only available for private chat');
        }
        const nextHashes = { ...(inbox.chatLockHashes || {}) };
        delete nextHashes[userId];
        updates.chatLockBy = pullFromArray(inbox.chatLockBy, [userId]);
        updates.chatLockHashes = nextHashes;
        break;
      }
      case 'chatLockPassword': {
        if (inbox.roomType !== 'private') {
          throw new Error('Password change is only available for private chat');
        }
        const oldPassword = String(value?.oldPassword || '');
        const newPassword = String(value?.newPassword || '');
        if (newPassword.length < 4) {
          throw new Error('New password must be at least 4 characters');
        }
        const currentHash = inbox.chatLockHashes?.[userId];
        if (!currentHash) {
          throw new Error('Chat lock is not enabled');
        }
        decrypt(oldPassword, currentHash);
        updates.chatLockBy = addToSet(inbox.chatLockBy, [userId]);
        updates.chatLockHashes = {
          ...(inbox.chatLockHashes || {}),
          [userId]: encrypt(newPassword),
        };
        break;
      }
      default:
        response({
          res,
          statusCode: 400,
          success: false,
          message: 'Unsupported inbox action',
        });
        return;
    }

    await inbox.update(updates);

    if (action === 'mute') {
      const channel = await ChannelModel.findOne({
        where: { roomId },
        attributes: ['_id'],
      });
      if (channel?._id) {
        const isMutedNow = asArray(updates.mutedBy).includes(userId);
        await trackChannelEvent({
          channelId: channel._id,
          userId,
          eventType: isMutedNow ? 'subscriber_mute' : 'subscriber_unmute',
          meta: { source: 'inbox-preference' },
        });
      }
    }

    let payloadInbox = null;
    const refreshedInbox = await InboxModel.findOne({ where: { roomId } });
    const refreshedPlain = await ensureSecretSession(refreshedInbox);
    if (action === 'secretChat') {
      payloadInbox = await emitSecretStateMessage({
        roomId,
        inbox: refreshedPlain,
        enabled: !!value?.enabled,
        userId,
        actorName,
      });
    } else if (action === 'advancedPrivacy') {
      payloadInbox = await emitPreferenceSystemMessage({
        roomId,
        inbox: refreshedPlain,
        userId,
        text: value
          ? `${actorName} turned on Advanced Privacy Chat.`
          : `${actorName} turned off Advanced Privacy Chat.`,
      });
    } else if (action === 'secretDisappearSeconds') {
      const timerValue = normalizeSecretTimer(value);
      payloadInbox = await emitPreferenceSystemMessage({
        roomId,
        inbox: refreshedPlain,
        userId,
        text: timerValue
          ? `${actorName} changed the disappearing timer to ${formatTimerLabel(
              timerValue
            )}.`
          : `${actorName} turned off the disappearing timer.`,
      });
    } else if (action === 'secretScreenshotAlerts') {
      payloadInbox = await emitPreferenceSystemMessage({
        roomId,
        inbox: refreshedPlain,
        userId,
        text: value
          ? `${actorName} turned on screenshot alerts.`
          : `${actorName} turned off screenshot alerts.`,
      });
    } else if (action === 'secretRegenerateSession') {
      payloadInbox = await emitPreferenceSystemMessage({
        roomId,
        inbox: refreshedPlain,
        userId,
        text: `${actorName} regenerated the secret session.`,
      });
    }

    const inboxes = payloadInbox ? [payloadInbox] : await Inbox.find({ roomId });
    const responseInbox = toPlain(inboxes[0] || refreshedInbox || inbox);

    if (responseInbox?.ownersId) {
      emitToUserRooms(
        asArray(responseInbox.ownersId),
        'inbox/preferences',
        responseInbox
      );
    }

    response({
      res,
      message: 'Inbox updated',
      payload: responseInbox,
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

exports.verifyChatLock = async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user?._id;
    const password = String(req.body?.password || '');

    const inbox = await InboxModel.findOne({ where: { roomId } });
    if (!inbox) throw new Error('Inbox not found');
    if (!asArray(inbox.ownersId).includes(userId)) {
      throw new Error('Forbidden');
    }

    const locked = asArray(inbox.chatLockBy).includes(userId);
    if (!locked) {
      response({
        res,
        message: 'Chat is not locked',
        payload: { verified: true, locked: false },
      });
      return;
    }

    if (!password) {
      response({
        res,
        message: 'Chat is locked',
        payload: {
          verified: false,
          locked: true,
          requiresPassword: true,
        },
      });
      return;
    }

    const hash = inbox.chatLockHashes?.[userId];
    if (!hash) throw new Error('Lock password not found');
    decrypt(password, hash);

    response({
      res,
      message: 'Chat unlocked',
      payload: { verified: true, locked: true },
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

exports.clearByRoomId = async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user?._id;

    const inbox = await InboxModel.findOne({ where: { roomId } });
    if (!inbox) {
      response({ res, message: 'Chat cleared successfully' });
      return;
    }

    if (!asArray(inbox.ownersId).includes(userId)) {
      response({
        res,
        statusCode: 403,
        success: false,
        message: 'Forbidden',
      });
      return;
    }

    const chats = await ChatModel.findAll({ where: { roomId } });
    await Promise.all(
      chats.map(async (chat) => {
        const deletedBy = addToSet(chat.deletedBy, [userId]);
        await chat.update({ deletedBy });
      })
    );

    await inbox.update({
      markUnreadBy: pullFromArray(inbox.markUnreadBy, [userId]),
    });

    response({
      res,
      message: 'Chat cleared successfully',
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

exports.markAllRead = async (req, res) => {
  try {
    const userId = req.user?._id;
    const inboxes = await InboxModel.findAll();

    const visible = inboxes.filter((inbox) => {
      const ownersId = asArray(inbox.ownersId);
      const deletedBy = asArray(inbox.deletedBy);
      return ownersId.includes(userId) && !deletedBy.includes(userId);
    });

    await Promise.all(
      visible.map(async (inbox) => {
        const content = inbox.content || {};
        const settingMap = await getSettingMap([userId]);
        const canMarkRead = allowsReadReceipts({
          setting: settingMap.get(userId),
        });
        await inbox.update({
          unreadMessage: 0,
          markUnreadBy: pullFromArray(inbox.markUnreadBy, [userId]),
          content: {
            ...content,
            readed:
              content.from && content.from !== userId && canMarkRead
                ? true
                : content.readed,
          },
        });
      })
    );

    response({
      res,
      message: 'All chats marked as read',
      payload: { total: visible.length },
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
