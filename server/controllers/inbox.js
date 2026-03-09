const Inbox = require('../helpers/models/inbox');
const InboxModel = require('../db/models/inbox');
const ChatModel = require('../db/models/chat');
const { addToSet, pullFromArray, asArray, toPlain } = require('../db/utils');
const encrypt = require('../helpers/encrypt');
const decrypt = require('../helpers/decrypt');
const response = require('../helpers/response');
const { getSettingMap, allowsReadReceipts } = require('../helpers/privacy');

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
    const inboxes = await Inbox.find({ roomId });
    const inbox = inboxes[0];

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
        updates.privacyShieldBy = toggleForUser(
          inbox.privacyShieldBy,
          userId,
          value
        );
        break;
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
    const inboxes = await Inbox.find({ roomId });

    response({
      res,
      message: 'Inbox updated',
      payload: toPlain(inboxes[0] || inbox),
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
