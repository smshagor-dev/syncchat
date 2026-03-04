const { io } = global;
const { v4: uuidv4 } = require('uuid');

const ProfileModel = require('../../db/models/profile');
const GroupModel = require('../../db/models/group');
const InboxModel = require('../../db/models/inbox');
const ChatModel = require('../../db/models/chat');
const { toPlain, addToSet, pullFromArray, asArray } = require('../../db/utils');
const {
  getGroupAdmins,
  isGroupAdminUser,
  addGroupAdmin,
  removeGroupAdmin,
} = require('../../helpers/groupAdmins');

const Inbox = require('../../helpers/models/inbox');
const uniqueId = require('../../helpers/uniqueId');
const encrypt = require('../../helpers/encrypt');
const {
  normalizeGroupPermissions,
  canGroupMemberEditInfo,
  canGroupMemberAddOtherMember,
} = require('../../helpers/groupPermissions');

const GROUP_INFO_PREFIX = '__group_info__::';

const buildGroupInfoText = ({
  groupName,
  createdBy,
  totalParticipants,
  icon = '\ud83d\udc65',
  accessType = 'public',
}) =>
  `${GROUP_INFO_PREFIX}${JSON.stringify({
    icon,
    groupName,
    createdBy,
    totalParticipants,
    accessType,
  })}`;

const ensureAdminControl = ({ group, userId }) => {
  if (!group) throw new Error('Group not found');
  if (!asArray(group.participantsId).includes(userId)) {
    throw new Error('You are not a participant of this group');
  }
  if (!isGroupAdminUser({ group, userId })) {
    throw new Error('Only group admin can perform this action');
  }
};

const sanitizeGroup = (group) => {
  const plain = toPlain(group);
  if (!plain) return plain;
  delete plain.passwordHash;
  return plain;
};

const emitGroupSystemChat = async ({ roomId, userId, text, profile }) => {
  const chatDoc = await ChatModel.create({
    userId,
    roomId,
    text,
    replyTo: null,
    fileId: null,
    readed: false,
    delivered: false,
    deletedBy: [],
    reactions: {},
  });
  const chat = toPlain(chatDoc);

  global.io.to(roomId).emit('chat/insert', {
    ...chat,
    profile: profile
      ? {
          userId,
          fullname: profile.fullname,
          avatar: profile.avatar || null,
        }
      : null,
    file: null,
    reply: null,
    poll: null,
  });
};

module.exports = (socket) => {
  socket.on('group/create', async (args, cb) => {
    try {
      const roomId = `group-${uuidv4()}`;
      const profile = await ProfileModel.findOne({
        where: { userId: args.adminId },
        attributes: ['fullname', 'avatar'],
      });

      const participantsId = addToSet(args.participantsId, [args.adminId]);
      const accessType = args.accessType === 'private' ? 'private' : 'public';
      const password = String(args.password || '');
      if (accessType === 'private' && password.length < 4) {
        throw new Error('Private group password must be at least 4 characters');
      }

      const group = await GroupModel.create({
        ...args,
        participantsId,
        adminsId: addToSet([], [args.adminId]),
        pendingMembersId: [],
        permissions: normalizeGroupPermissions(args.permissions),
        accessType,
        passwordHash: accessType === 'private' ? encrypt(password) : null,
        roomId,
        link: `/group/+${uniqueId(16)}`,
      });

      const inbox = await InboxModel.create({
        ownersId: participantsId,
        roomId,
        roomType: 'group',
        content: {
          senderName: profile.fullname,
          from: args.adminId,
          text: 'group created',
          time: new Date().toISOString(),
        },
      });

      await emitGroupSystemChat({
        roomId,
        userId: args.adminId,
        text: buildGroupInfoText({
          groupName: args.name,
          createdBy: profile?.fullname || 'Unknown',
          totalParticipants: participantsId.length,
          icon: '\ud83d\udc65',
          accessType,
        }),
        profile: toPlain(profile),
      });

      io.to(participantsId).emit('group/create', {
        group: sanitizeGroup(group),
        ...toPlain(inbox),
      });

      cb({
        success: true,
        message: 'Group created successfully',
        payload: {
          groupId: group._id,
          roomId,
        },
      });
    } catch (error0) {
      cb({ success: false, message: error0.message });
    }
  });

  socket.on('group/add-participants', async (args) => {
    try {
      const inviter = await ProfileModel.findOne({
        where: { userId: args.userId },
        attributes: ['fullname', 'avatar'],
      });
      const group = await GroupModel.findOne({ where: { _id: args.groupId } });
      if (!group) throw new Error('Group not found');
      if (!asArray(group.participantsId).includes(args.userId)) {
        throw new Error('You are not a participant of this group');
      }
      if (!canGroupMemberAddOtherMember({ group, userId: args.userId })) {
        throw new Error('You do not have permission to add members');
      }

      const nextParticipants = addToSet(group.participantsId, args.friendsId);
      await group.update({
        participantsId: nextParticipants,
        pendingMembersId: pullFromArray(group.pendingMembersId, args.friendsId),
      });

      const addedProfiles = await ProfileModel.findAll({
        where: { userId: args.friendsId },
        attributes: ['fullname'],
      });
      const addedNames = addedProfiles.map((item) => item.fullname);
      const actionText =
        addedNames.length > 0
          ? `Added: ${addedNames.join(', ')}`
          : `${args.friendsId.length} ${
              args.friendsId.length > 1 ? 'participants' : 'participant'
            } added`;

      const inbox = await InboxModel.findOne({
        where: { roomId: group.roomId },
      });
      await inbox.update({
        ownersId: addToSet(inbox.ownersId, args.friendsId),
        fileId: null,
        content: {
          senderName: inviter.fullname,
          from: args.userId,
          text: actionText,
          time: new Date().toISOString(),
        },
      });

      await emitGroupSystemChat({
        roomId: group.roomId,
        userId: args.userId,
        text: actionText,
        profile: toPlain(inviter),
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
      if (!group) throw new Error('Group not found');
      if (!asArray(group.participantsId).includes(userId)) {
        throw new Error('You are not a participant of this group');
      }
      if (!canGroupMemberEditInfo({ group, userId })) {
        throw new Error('You do not have permission to edit group info');
      }

      await group.update({ name, desc });

      const inbox = await InboxModel.findOne({
        where: { roomId: group.roomId },
      });
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
        const currentAdmins = getGroupAdmins(group);
        const adminsAfterExit = pullFromArray(currentAdmins, [userId]).filter(
          (adminId) => participantsId.includes(adminId)
        );
        const nextAdmins =
          adminsAfterExit.length > 0
            ? adminsAfterExit
            : participantsId.length > 0
            ? [participantsId[0]]
            : [];

        const updates = {
          participantsId,
          adminsId: nextAdmins,
          adminId: nextAdmins[0] || participantsId[0],
        };
        await group.update(updates);

        const profile = await ProfileModel.findOne({
          where: { userId },
          attributes: ['fullname'],
        });
        const inbox = await InboxModel.findOne({
          where: { roomId: group.roomId },
        });
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
        const [firstInbox] = inboxs;
        socket.broadcast.to(participantsId).emit('group/exit', {
          groupId,
          userId,
          inbox: firstInbox,
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
      ensureAdminControl({ group, userId });
      if (!asArray(group.participantsId).includes(participantId)) {
        throw new Error('Participant not found in this group');
      }

      const nextAdminsId = addGroupAdmin({ group, userId: participantId });
      await group.update({
        adminsId: nextAdminsId,
        adminId: nextAdminsId[0] || group.adminId,
      });
      const actionText = `Made ${friend.fullname.split(' ')[0]} admin`;

      const inbox = await InboxModel.findOne({
        where: { roomId: group.roomId },
      });
      await inbox.update({
        fileId: null,
        content: {
          senderName: master.fullname,
          from: userId,
          text: actionText,
          time: new Date().toISOString(),
        },
      });

      await emitGroupSystemChat({
        roomId: group.roomId,
        userId,
        text: actionText,
        profile: toPlain(master),
      });

      const inboxes = await Inbox.find({ roomId: group.roomId });

      io.to(group.participantsId).emit('inbox/find', inboxes[0]);
      io.to(group.roomId).emit('group/add-admin', {
        ...sanitizeGroup(group),
        adminId: nextAdminsId[0] || group.adminId,
        adminsId: nextAdminsId,
      });
    } catch (error0) {
      console.error(error0.message);
    }
  });

  socket.on('group/remove-admin', async (args) => {
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
      ensureAdminControl({ group, userId });
      if (!asArray(group.participantsId).includes(participantId)) {
        throw new Error('Participant not found in this group');
      }
      const currentAdminsId = getGroupAdmins(group);
      if (!currentAdminsId.includes(participantId)) {
        throw new Error('This participant is not an admin');
      }
      if (currentAdminsId.length <= 1) {
        throw new Error('At least one admin is required');
      }

      const nextAdminsId = removeGroupAdmin({ group, userId: participantId });
      await group.update({
        adminsId: nextAdminsId,
        adminId: nextAdminsId[0],
      });
      const actionText = `Removed admin role from ${
        friend.fullname.split(' ')[0]
      }`;

      const inbox = await InboxModel.findOne({
        where: { roomId: group.roomId },
      });
      await inbox.update({
        fileId: null,
        content: {
          senderName: master.fullname,
          from: userId,
          text: actionText,
          time: new Date().toISOString(),
        },
      });

      await emitGroupSystemChat({
        roomId: group.roomId,
        userId,
        text: actionText,
        profile: toPlain(master),
      });

      const inboxes = await Inbox.find({ roomId: group.roomId });

      io.to(group.participantsId).emit('inbox/find', inboxes[0]);
      io.to(group.roomId).emit('group/remove-admin', {
        ...sanitizeGroup(group),
        adminId: nextAdminsId[0],
        adminsId: nextAdminsId,
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
      ensureAdminControl({ group, userId });
      if (!asArray(group.participantsId).includes(participantId)) {
        throw new Error('Participant not found in this group');
      }
      const currentAdminsId = getGroupAdmins(group);
      if (
        currentAdminsId.includes(participantId) &&
        currentAdminsId.length <= 1
      ) {
        throw new Error('Cannot remove the only admin');
      }

      const nextParticipantsId = pullFromArray(group.participantsId, [
        participantId,
      ]);
      const nextAdminsId = pullFromArray(currentAdminsId, [participantId]);
      const normalizedAdminsId =
        nextAdminsId.length > 0
          ? nextAdminsId
          : nextParticipantsId.length > 0
          ? [nextParticipantsId[0]]
          : [];

      await group.update({
        participantsId: nextParticipantsId,
        adminsId: normalizedAdminsId,
        adminId: normalizedAdminsId[0] || group.adminId,
      });
      const actionText = `Removed ${friend.fullname.split(' ')[0]}`;

      const inbox = await InboxModel.findOne({
        where: { roomId: group.roomId },
      });
      await inbox.update({
        ownersId: pullFromArray(inbox.ownersId, [participantId]),
        fileId: null,
        content: {
          senderName: master.fullname,
          from: userId,
          text: actionText,
          time: new Date().toISOString(),
        },
      });

      await emitGroupSystemChat({
        roomId: group.roomId,
        userId,
        text: actionText,
        profile: toPlain(master),
      });

      const inboxes = await Inbox.find({ roomId: group.roomId });

      socket.broadcast
        .to(participantId)
        .emit('inbox/delete', [inboxes[0].roomId]);
      io.to(inboxes[0].ownersId).emit('inbox/find', inboxes[0]);
      io.to(group.roomId).emit('group/remove-participant', {
        ...args,
        adminsId: normalizedAdminsId,
        adminId: normalizedAdminsId[0] || group.adminId,
      });
    } catch (error0) {
      console.error(error0.message);
    }
  });
};
