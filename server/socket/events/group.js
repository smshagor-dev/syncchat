const { io } = global;
const { v4: uuidv4 } = require('uuid');

const ProfileModel = require('../../db/models/profile');
const GroupModel = require('../../db/models/group');
const InboxModel = require('../../db/models/inbox');
const ChatModel = require('../../db/models/chat');
const { toPlain, addToSet, pullFromArray } = require('../../db/utils');

const Inbox = require('../../helpers/models/inbox');
const uniqueId = require('../../helpers/uniqueId');

module.exports = (socket) => {
  socket.on('group/create', async (args, cb) => {
    try {
      const roomId = `group-${uuidv4()}`;
      const profile = await ProfileModel.findOne({
        where: { userId: args.adminId },
        attributes: ['fullname'],
      });

      const group = await GroupModel.create({
        ...args,
        roomId,
        link: `/group/+${uniqueId(16)}`,
      });

      const inbox = await InboxModel.create({
        ownersId: args.participantsId,
        roomId,
        roomType: 'group',
        content: {
          senderName: profile.fullname,
          from: args.adminId,
          text: 'group created',
          time: new Date().toISOString(),
        },
      });

      io.to(args.participantsId).emit('group/create', {
        group: toPlain(group),
        ...toPlain(inbox),
      });

      cb({ success: true, message: 'Group created successfully' });
    } catch (error0) {
      cb({ success: false, message: error0.message });
    }
  });

  socket.on('group/add-participants', async (args) => {
    try {
      const inviter = await ProfileModel.findOne({
        where: { userId: args.userId },
        attributes: ['fullname'],
      });
      const group = await GroupModel.findOne({ where: { _id: args.groupId } });
      const nextParticipants = addToSet(group.participantsId, args.friendsId);
      await group.update({ participantsId: nextParticipants });

      const inbox = await InboxModel.findOne({ where: { roomId: group.roomId } });
      await inbox.update({
        ownersId: addToSet(inbox.ownersId, args.friendsId),
        fileId: null,
        content: {
          senderName: inviter.fullname,
          from: args.userId,
          text: `${args.friendsId.length} ${
            args.friendsId.length > 1 ? 'participants' : 'participant'
          } added`,
          time: new Date().toISOString(),
        },
      });

      const inboxes = await Inbox.find({ roomId: args.roomId });
      io.to(inboxes[0].ownersId).emit('inbox/find', inboxes[0]);
    } catch (error0) {
      console.log(error0.message);
    }
  });

  socket.on('group/edit', async ({ groupId, userId, form }, cb) => {
    try {
      const { name = '', desc = '' } = form;
      if (name.length < 1 || desc.length > 300) {
        throw new Error(
          name.length < 1
            ? 'Group name is required!'
            : 'Description too long (max. 300)'
        );
      }

      const profile = await ProfileModel.findOne({
        where: { userId },
        attributes: ['fullname'],
      });
      const group = await GroupModel.findOne({ where: { _id: groupId } });
      await group.update({ name, desc });

      const inbox = await InboxModel.findOne({ where: { roomId: group.roomId } });
      await inbox.update({
        fileId: null,
        content: {
          senderName: profile.fullname,
          from: userId,
          text: 'group edited',
          time: new Date().toISOString(),
        },
      });

      const inboxes = await Inbox.find({ roomId: group.roomId });

      io.to(group.roomId).emit('group/edit', form);
      io.to(inboxes[0].ownersId).emit('inbox/find', inboxes[0]);

      cb({ success: true, message: 'Group edited successfully' });
    } catch ({ message }) {
      cb({ success: false, message });
    }
  });

  socket.on('group/exit', async ({ userId, groupId }, cb) => {
    try {
      const group = await GroupModel.findOne({ where: { _id: groupId } });
      const participantsId = pullFromArray(group.participantsId, [userId]);

      if (participantsId.length === 0) {
        await InboxModel.destroy({ where: { roomId: group.roomId } });
        await GroupModel.destroy({ where: { _id: groupId } });
        await ChatModel.destroy({ where: { roomId: group.roomId } });
      } else {
        const updates = { participantsId };
        if (group.adminId === userId) {
          updates.adminId = participantsId[0];
        }
        await group.update(updates);

        const profile = await ProfileModel.findOne({
          where: { userId },
          attributes: ['fullname'],
        });
        const inbox = await InboxModel.findOne({ where: { roomId: group.roomId } });
        await inbox.update({
          ownersId: pullFromArray(inbox.ownersId, [userId]),
          fileId: null,
          content: {
            senderName: profile.fullname,
            from: userId,
            text: 'left the group',
            time: new Date().toISOString(),
          },
        });

        const inboxs = await Inbox.find({ roomId: group.roomId });
        socket.broadcast.to(participantsId).emit('group/exit', {
          groupId,
          userId,
          inbox: inboxs[0],
        });
      }

      socket.emit('inbox/delete', [group.roomId]);
      cb({ success: true, message: 'Successfully exit the group' });
    } catch ({ message }) {
      cb({ success: false, message });
    }
  });

  socket.on('group/add-admin', async (args) => {
    try {
      const { groupId, userId, participantId } = args;

      const master = await ProfileModel.findOne({
        where: { userId },
        attributes: ['fullname'],
      });
      const friend = await ProfileModel.findOne({
        where: { userId: participantId },
        attributes: ['fullname'],
      });

      const group = await GroupModel.findOne({ where: { _id: groupId } });
      await group.update({ adminId: participantId });

      const inbox = await InboxModel.findOne({ where: { roomId: group.roomId } });
      await inbox.update({
        fileId: null,
        content: {
          senderName: master.fullname,
          from: userId,
          text: `add ${friend.fullname.split(' ')[0]} as admin`,
          time: new Date().toISOString(),
        },
      });

      const inboxes = await Inbox.find({ roomId: group.roomId });

      io.to(group.participantsId).emit('inbox/find', inboxes[0]);
      io.to(group.roomId).emit('group/add-admin', {
        ...toPlain(group),
        adminId: participantId,
      });
    } catch (error0) {
      console.error(error0.message);
    }
  });

  socket.on('group/remove-participant', async (args) => {
    try {
      const { groupId, userId, participantId } = args;

      const master = await ProfileModel.findOne({
        where: { userId },
        attributes: ['fullname'],
      });
      const friend = await ProfileModel.findOne({
        where: { userId: participantId },
        attributes: ['fullname'],
      });

      const group = await GroupModel.findOne({ where: { _id: groupId } });
      await group.update({
        participantsId: pullFromArray(group.participantsId, [participantId]),
      });

      const inbox = await InboxModel.findOne({ where: { roomId: group.roomId } });
      await inbox.update({
        ownersId: pullFromArray(inbox.ownersId, [participantId]),
        fileId: null,
        content: {
          senderName: master.fullname,
          from: userId,
          text: `removed ${friend.fullname.split(' ')[0]}`,
          time: new Date().toISOString(),
        },
      });

      const inboxes = await Inbox.find({ roomId: group.roomId });

      socket.broadcast.to(participantId).emit('inbox/delete', [inboxes[0].roomId]);
      io.to(inboxes[0].ownersId).emit('inbox/find', inboxes[0]);
      io.to(group.roomId).emit('group/remove-participant', args);
    } catch (error0) {
      console.error(error0.message);
    }
  });
};
