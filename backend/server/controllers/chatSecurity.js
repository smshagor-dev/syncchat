const InboxModel = require('../db/models/inbox');
const { asArray, addToSet, pullFromArray, toPlain } = require('../db/utils');
const encrypt = require('../helpers/encrypt');
const decrypt = require('../helpers/decrypt');
const response = require('../helpers/response');

const LOCK_SCOPES = ['self', 'both'];

const getInboxForUser = async ({ roomId, userId }) => {
  const inbox = await InboxModel.findOne({ where: { roomId } });
  if (!inbox) {
    const error = new Error('Inbox not found');
    error.statusCode = 404;
    throw error;
  }
  if (inbox.roomType !== 'private') {
    const error = new Error('Chat lock is only available for private chat');
    error.statusCode = 400;
    throw error;
  }
  if (!asArray(inbox.ownersId).includes(userId)) {
    const error = new Error('Forbidden');
    error.statusCode = 403;
    throw error;
  }
  return inbox;
};

const emitLockState = async (inbox) => {
  if (!global?.io || !inbox) return;
  const plain = toPlain(inbox);
  const ownersId = asArray(plain?.ownersId);
  const payload = {
    roomId: plain?.roomId,
    chatLockBy: asArray(plain?.chatLockBy),
    chatLockScope: plain?.chatLockScope || 'self',
    chatLockOwnerId: plain?.chatLockOwnerId || null,
  };
  ownersId.forEach((ownerId) => {
    global.io.to(ownerId).emit('inbox/chat-lock', payload);
  });
  global.io.to(plain?.roomId).emit('inbox/chat-lock', payload);
};

exports.guardLegacyLockPreference = async (req, res, next) => {
  try {
    const action = String(req.body?.action || '');
    if (!['chatLock', 'chatUnlock', 'chatLockPassword'].includes(action)) {
      next();
      return;
    }

    const inbox = await InboxModel.findOne({
      where: { roomId: req.params.roomId },
      attributes: ['roomId', 'chatLockScope'],
    });

    if (inbox?.chatLockScope === 'both') {
      response({
        res,
        statusCode: 409,
        success: false,
        message: 'This chat uses a shared lock. Use the shared chat lock controls.',
      });
      return;
    }

    next();
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
    const inbox = await getInboxForUser({ roomId, userId });

    const locked = asArray(inbox.chatLockBy).includes(userId);
    if (!locked) {
      response({
        res,
        message: 'Chat is not locked',
        payload: {
          verified: true,
          locked: false,
          scope: inbox.chatLockScope || 'self',
          ownerId: inbox.chatLockOwnerId || null,
        },
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
          scope: inbox.chatLockScope || 'self',
          ownerId: inbox.chatLockOwnerId || null,
        },
      });
      return;
    }

    const hash = inbox.chatLockHashes?.[userId];
    if (!hash) {
      const error = new Error('Lock password not found');
      error.statusCode = 409;
      throw error;
    }
    decrypt(password, hash);

    response({
      res,
      message: 'Chat unlocked',
      payload: {
        verified: true,
        locked: true,
        scope: inbox.chatLockScope || 'self',
        ownerId: inbox.chatLockOwnerId || null,
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

exports.createChatLock = async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user?._id;
    const scope = LOCK_SCOPES.includes(req.body?.scope) ? req.body.scope : 'self';
    const password = String(req.body?.password || '');

    if (password.length < 4) {
      response({
        res,
        statusCode: 400,
        success: false,
        message: 'Lock password must be at least 4 characters',
      });
      return;
    }

    const inbox = await getInboxForUser({ roomId, userId });
    if (scope === 'both') {
      const ownersId = asArray(inbox.ownersId).filter(Boolean);
      if (ownersId.length !== 2) {
        response({
          res,
          statusCode: 400,
          success: false,
          message: 'Shared lock requires exactly two private chat participants',
        });
        return;
      }

      const hash = encrypt(password);
      const chatLockHashes = ownersId.reduce((acc, ownerId) => {
        acc[ownerId] = hash;
        return acc;
      }, {});

      await inbox.update({
        chatLockBy: ownersId,
        chatLockHashes,
        chatLockScope: 'both',
        chatLockOwnerId: userId,
      });
    } else {
      if (inbox.chatLockScope === 'both') {
        response({
          res,
          statusCode: 409,
          success: false,
          message: 'A shared lock is already active in this chat',
        });
        return;
      }

      await inbox.update({
        chatLockBy: addToSet(inbox.chatLockBy, [userId]),
        chatLockHashes: {
          ...(inbox.chatLockHashes || {}),
          [userId]: encrypt(password),
        },
        chatLockScope: 'self',
        chatLockOwnerId: null,
      });
    }

    const refreshed = await InboxModel.findOne({ where: { roomId } });
    await emitLockState(refreshed);
    const plain = toPlain(refreshed);

    response({
      res,
      message:
        scope === 'both'
          ? 'Shared chat lock enabled for both participants'
          : 'Chat lock enabled for you',
      payload: {
        roomId,
        scope: plain.chatLockScope || 'self',
        ownerId: plain.chatLockOwnerId || null,
        chatLockBy: asArray(plain.chatLockBy),
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

exports.changeChatLockPassword = async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user?._id;
    const oldPassword = String(req.body?.oldPassword || '');
    const newPassword = String(req.body?.newPassword || '');

    if (newPassword.length < 4) {
      response({
        res,
        statusCode: 400,
        success: false,
        message: 'New password must be at least 4 characters',
      });
      return;
    }

    const inbox = await getInboxForUser({ roomId, userId });
    const isShared = inbox.chatLockScope === 'both';
    if (isShared && inbox.chatLockOwnerId !== userId) {
      response({
        res,
        statusCode: 403,
        success: false,
        message: 'Only the shared lock owner can change the password',
      });
      return;
    }

    const currentHash = inbox.chatLockHashes?.[userId];
    if (!currentHash || !asArray(inbox.chatLockBy).includes(userId)) {
      response({
        res,
        statusCode: 409,
        success: false,
        message: 'Chat lock is not enabled',
      });
      return;
    }

    decrypt(oldPassword, currentHash);
    const nextHash = encrypt(newPassword);

    if (isShared) {
      const ownersId = asArray(inbox.ownersId).filter(Boolean);
      const chatLockHashes = ownersId.reduce((acc, ownerId) => {
        acc[ownerId] = nextHash;
        return acc;
      }, {});
      await inbox.update({
        chatLockBy: ownersId,
        chatLockHashes,
      });
    } else {
      await inbox.update({
        chatLockHashes: {
          ...(inbox.chatLockHashes || {}),
          [userId]: nextHash,
        },
      });
    }

    const refreshed = await InboxModel.findOne({ where: { roomId } });
    await emitLockState(refreshed);

    response({
      res,
      message: isShared ? 'Shared lock password changed' : 'Lock password changed',
      payload: {
        roomId,
        scope: refreshed.chatLockScope || 'self',
        ownerId: refreshed.chatLockOwnerId || null,
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

exports.removeChatLock = async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user?._id;
    const inbox = await getInboxForUser({ roomId, userId });
    const isShared = inbox.chatLockScope === 'both';

    if (isShared && inbox.chatLockOwnerId !== userId) {
      response({
        res,
        statusCode: 403,
        success: false,
        message: 'Only the shared lock owner can remove the lock',
      });
      return;
    }

    if (isShared) {
      await inbox.update({
        chatLockBy: [],
        chatLockHashes: {},
        chatLockScope: 'self',
        chatLockOwnerId: null,
      });
    } else {
      const nextHashes = { ...(inbox.chatLockHashes || {}) };
      delete nextHashes[userId];
      await inbox.update({
        chatLockBy: pullFromArray(inbox.chatLockBy, [userId]),
        chatLockHashes: nextHashes,
        chatLockOwnerId: null,
      });
    }

    const refreshed = await InboxModel.findOne({ where: { roomId } });
    await emitLockState(refreshed);

    response({
      res,
      message: isShared ? 'Shared chat lock removed' : 'Chat lock removed',
      payload: {
        roomId,
        scope: refreshed.chatLockScope || 'self',
        ownerId: refreshed.chatLockOwnerId || null,
        chatLockBy: asArray(refreshed.chatLockBy),
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
