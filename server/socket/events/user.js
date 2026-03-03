const { Op } = require('sequelize');
const ProfileModel = require('../../db/models/profile');
const InboxModel = require('../../db/models/inbox');
const ChatModel = require('../../db/models/chat');
const { asArray, toPlain, toPlainMany } = require('../../db/utils');
const Inbox = require('../../helpers/models/inbox');

module.exports = (socket) => {
  socket.on('user/connect', async (userId) => {
    socket.join(userId);
    socket.broadcast.to(userId).emit('user/inactivate', true);

    /* eslint-disable */
    socket.userId = userId;
    /* eslint-enable */

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

    socket.broadcast.emit('user/connect', userId);
  });

  socket.on('disconnect', async () => {
    const { userId } = socket;
    if (!userId) return;
    await ProfileModel.update({ online: false }, { where: { userId } });
    socket.broadcast.emit('user/disconnect', userId);
  });

  socket.on('user/disconnect', async () => {
    const { userId } = socket;
    if (!userId) return;
    await ProfileModel.update({ online: false }, { where: { userId } });
    socket.broadcast.emit('user/disconnect', userId);
  });
};
