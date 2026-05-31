const { Op } = require('sequelize');
const ProfileModel = require('../../db/models/profile');
const InboxModel = require('../../db/models/inbox');
const ChatModel = require('../../db/models/chat');
const ContactModel = require('../../db/models/contact');
const SettingModel = require('../../db/models/setting');
const { asArray, toPlain, toPlainMany } = require('../../db/utils');
const Inbox = require('../../helpers/models/inbox');
const {
  normalizePrivacySettingPayload,
} = require('../../helpers/privacy');
const {
  processScheduledMessages,
} = require('../../helpers/scheduledMessages');

const connectedSocketIdsByUser = new Map();
const knownDeviceSignaturesByUser = new Map();

const getDeviceSignature = (socket) =>
  [
    socket?.handshake?.headers?.['user-agent'] || 'unknown-agent',
    socket?.handshake?.headers?.['sec-ch-ua-platform'] || 'unknown-platform',
  ].join('::');

const trackConnectedSocket = (userId, socketId) => {
  const next = connectedSocketIdsByUser.get(userId) || new Set();
  next.add(socketId);
  connectedSocketIdsByUser.set(userId, next);
};

const untrackConnectedSocket = (userId, socketId) => {
  const next = connectedSocketIdsByUser.get(userId);
  if (!next) return false;

  next.delete(socketId);
  if (next.size === 0) {
    connectedSocketIdsByUser.delete(userId);
    return false;
  }

  connectedSocketIdsByUser.set(userId, next);
  return true;
};

const shouldEmitSecurityChange = (userId, socket) => {
  const signature = getDeviceSignature(socket);
  const known = knownDeviceSignaturesByUser.get(userId) || new Set();
  const isNewSignature = !known.has(signature);
  known.add(signature);
  knownDeviceSignaturesByUser.set(userId, known);
  return isNewSignature;
};

const emitSecurityChangeNotice = async (userId) => {
  const [profileDoc, contactsDoc] = await Promise.all([
    ProfileModel.findOne({
      where: { userId },
      attributes: ['userId', 'fullname', 'username'],
    }),
    ContactModel.findAll({
      where: { friendId: userId },
      attributes: ['userId'],
    }),
  ]);

  const profile = toPlain(profileDoc);
  if (!profile) return;

  const contactOwnerIds = [...new Set(toPlainMany(contactsDoc).map((item) => item.userId))];
  if (contactOwnerIds.length === 0) return;

  const settingsDoc = await SettingModel.findAll({
    where: { userId: { [Op.in]: contactOwnerIds } },
    attributes: ['userId', 'securityNotificationsEnabled'],
  });

  const settingMap = new Map(
    toPlainMany(settingsDoc).map((item) => [
      item.userId,
      normalizePrivacySettingPayload(item),
    ])
  );

  const recipients = contactOwnerIds.filter(
    (contactUserId) =>
      normalizePrivacySettingPayload(settingMap.get(contactUserId))
        .securityNotificationsEnabled
  );

  if (recipients.length === 0) return;

  global.io.to(recipients).emit('system', {
    type: 'security-notice',
    userId,
    text: `Security code changed for ${profile.fullname || profile.username}. They signed in on a new device.`,
  });
};

module.exports = (socket) => {
  socket.on('user/connect', async (userId) => {
    socket.join(userId);
    socket.broadcast.to(userId).emit('user/inactivate', true);

    /* eslint-disable */
    socket.userId = userId;
    /* eslint-enable */
    trackConnectedSocket(userId, socket.id);

    await ProfileModel.update({ online: true }, { where: { userId } });

    const inboxesRaw = await InboxModel.findAll({
      where: { roomType: 'private' },
      attributes: ['roomId', 'ownersId'],
    });
    const inboxes = toPlainMany(inboxesRaw).filter((inbox) =>
      asArray(inbox.ownersId).includes(userId)
    );
    const privateRoomIds = inboxes.map((inbox) => inbox.roomId);

    if (privateRoomIds.length > 0) {
      const pendingRaw = await ChatModel.findAll({
        where: {
          roomId: { [Op.in]: privateRoomIds },
          userId: { [Op.ne]: userId },
          delivered: false,
        },
        attributes: ['_id', 'roomId'],
      });
      const pending = toPlainMany(pendingRaw);

      if (pending.length > 0) {
        const ids = pending.map((item) => item._id);
        await ChatModel.update(
          { delivered: true },
          { where: { _id: { [Op.in]: ids } } }
        );

        const byRoom = pending.reduce((acc, item) => {
          const arr = acc.get(item.roomId) || [];
          acc.set(item.roomId, [...arr, item._id]);
          return acc;
        }, new Map());

        byRoom.forEach((chatIds, roomId) => {
          global.io.to(roomId).emit('chat/delivered', { chatIds });
        });

        await Promise.all(
          [...byRoom.keys()].map(async (roomId) => {
            const inbox = await InboxModel.findOne({ where: { roomId } });
            if (!inbox) return;

            const plain = toPlain(inbox);
            const content = plain?.content || {};
            const shouldMarkDelivered =
              content.from && content.from !== userId && !content.readed;
            if (!shouldMarkDelivered) return;

            await inbox.update({
              content: {
                ...content,
                delivered: true,
              },
            });

            const roomInboxes = await Inbox.find({ roomId });
            if (!roomInboxes[0]) return;
            global.io
              .to(asArray(plain.ownersId))
              .emit('inbox/find', roomInboxes[0]);
          })
        );
      }
    }

    processScheduledMessages({ targetUserId: userId }).catch(() => {});

    if (shouldEmitSecurityChange(userId, socket)) {
      await emitSecurityChangeNotice(userId);
    }

    socket.broadcast.emit('user/connect', userId);
  });

  socket.on('disconnect', async () => {
    const { userId } = socket;
    if (!userId) return;
    const stillConnected = untrackConnectedSocket(userId, socket.id);
    if (stillConnected) return;
    await ProfileModel.update({ online: false }, { where: { userId } });
    socket.broadcast.emit('user/disconnect', userId);
  });

  socket.on('user/disconnect', async () => {
    const { userId } = socket;
    if (!userId) return;
    const stillConnected = untrackConnectedSocket(userId, socket.id);
    if (stillConnected) return;
    await ProfileModel.update({ online: false }, { where: { userId } });
    socket.broadcast.emit('user/disconnect', userId);
  });
};
