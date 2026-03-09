const { io } = global;
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');

const ProfileModel = require('../../db/models/profile');
const ChannelModel = require('../../db/models/channel');
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
const decrypt = require('../../helpers/decrypt');
const { parseDataUri, saveBufferFile } = require('../../helpers/storage');
const {
  normalizeGroupPermissions,
  canGroupMemberEditInfo,
  canGroupMemberAddOtherMember,
} = require('../../helpers/groupPermissions');
const {
  getSettingMap,
  getContactMap,
  canUserAddToGroup,
} = require('../../helpers/privacy');

const ensureAdminControl = ({ channel, userId }) => {
  if (!channel) throw new Error('Channel not found');
  if (!asArray(channel.participantsId).includes(userId)) {
    throw new Error('You are not subscribed to this channel');
  }
  if (!isGroupAdminUser({ group: channel, userId })) {
    throw new Error('Only channel admin can perform this action');
  }
};

const sanitizeChannel = (channel) => {
  const plain = toPlain(channel);
  if (!plain) return plain;
  delete plain.passwordHash;
  return plain;
};

const uploadChannelAvatar = async ({ avatar, channelId }) => {
  if (!avatar || !channelId) return null;

  const { buffer } = parseDataUri(avatar);
  const processedBuffer = await sharp(buffer)
    .resize(460, 460, { fit: 'cover' })
    .webp({ quality: 90 })
    .toBuffer();

  const uploaded = await saveBufferFile({
    buffer: processedBuffer,
    folder: 'avatars',
    filename: `${channelId}-${Date.now()}.webp`,
  });

  return uploaded.url;
};

module.exports = (socket) => {
  socket.on('channel/create', async (args, cb) => {
    try {
      const roomId = `channel-${uuidv4()}`;
      const requestedParticipants = addToSet(args.participantsId, [args.adminId]);
      const [settingMap, contactMap] = await Promise.all([
        getSettingMap(requestedParticipants),
        getContactMap({
          ownerIds: requestedParticipants,
          friendIds: [args.adminId],
        }),
      ]);
      const blockedTargets = requestedParticipants.filter(
        (participantId) =>
          participantId !== args.adminId &&
          !canUserAddToGroup({
            setting: settingMap.get(participantId),
            isContact: !!contactMap.get(`${participantId}:${args.adminId}`),
            isSelf: false,
          })
      );
      if (blockedTargets.length > 0) {
        throw new Error('One or more contacts do not allow channel adds');
      }

      const accessType = args.accessType === 'private' ? 'private' : 'public';
      const password = String(args.password || '');
      if (accessType === 'private' && password.length < 4) {
        throw new Error('Private channel password must be at least 4 characters');
      }

      const channel = await ChannelModel.create({
        ...args,
        roomId,
        participantsId: requestedParticipants,
        adminsId: addToSet([], [args.adminId]),
        pendingMembersId: [],
        permissions: normalizeGroupPermissions(args.permissions, {
          isChannel: true,
        }),
        accessType,
        passwordHash: accessType === 'private' ? encrypt(password) : null,
        link: `/channel/+${uniqueId(16)}`,
      });

      let avatarUrl = null;
      if (args.avatar) {
        avatarUrl = await uploadChannelAvatar({
          avatar: args.avatar,
          channelId: channel._id,
        });
        if (avatarUrl) {
          await channel.update({ avatar: avatarUrl });
        }
      }

      const inbox = await InboxModel.create({
        ownersId: requestedParticipants,
        roomId,
        roomType: 'group',
        content: {
          senderName: channel.name,
          from: args.adminId,
          text: 'channel created',
          time: new Date().toISOString(),
        },
      });

      const plainChannel = sanitizeChannel(channel);

      io.to(requestedParticipants).emit('channel/create', {
        channel: plainChannel,
        ...toPlain(inbox),
      });

      if (avatarUrl) {
        const avatarPayload = {
          channelId: channel._id,
          roomId,
          avatar: avatarUrl,
        };
        io.to(roomId).emit('channel/avatar', avatarPayload);
        io.to(requestedParticipants).emit('channel/avatar', avatarPayload);
      }

      cb({
        success: true,
        message: 'Channel created successfully',
        payload: {
          channelId: channel._id,
          roomId,
        },
      });
    } catch (error0) {
      cb({ success: false, message: error0.message });
    }
  });

  socket.on('channel/edit', async ({ channelId, userId, form }, cb) => {
    try {
      const { name = '', desc = '' } = form;
      if (name.length < 1 || desc.length > 300) {
        throw new Error(
          name.length < 1
            ? 'Channel name is required!'
            : 'Description too long (max. 300)'
        );
      }
      const channel = await ChannelModel.findOne({ where: { _id: channelId } });
      if (!channel) throw new Error('Channel not found');
      if (!asArray(channel.participantsId).includes(userId)) {
        throw new Error('You are not subscribed to this channel');
      }
      if (!canGroupMemberEditInfo({ group: channel, userId })) {
        throw new Error('You do not have permission to edit channel info');
      }
      await channel.update({ name, desc });
      io.to(channel.roomId).emit('channel/edit', {
        roomId: channel.roomId,
        ...form,
      });
      cb({ success: true, message: 'Channel edited successfully' });
    } catch (error0) {
      cb({ success: false, message: error0.message });
    }
  });

  socket.on('channel/subscribe', async ({ channelId, userId, password }, cb) => {
    try {
      const channel = await ChannelModel.findOne({ where: { _id: channelId } });
      if (!channel) throw new Error('Channel not found');
      if (asArray(channel.participantsId).includes(userId)) {
        cb({
          success: true,
          message: 'Already subscribed',
          payload: { roomId: channel.roomId, channelId },
        });
        return;
      }
      if (channel.accessType === 'private') {
        if (!channel.passwordHash) throw new Error('Private channel password is not set');
        decrypt(String(password || ''), channel.passwordHash);
      }

      const nextParticipants = addToSet(channel.participantsId, [userId]);
      await channel.update({ participantsId: nextParticipants });
      const inbox = await InboxModel.findOne({ where: { roomId: channel.roomId } });
      if (inbox) {
        await inbox.update({ ownersId: addToSet(inbox.ownersId, [userId]) });
      }

      const inboxes = await Inbox.find({ roomId: channel.roomId });
      if (inboxes[0]) {
        io.to(userId).emit('channel/create', inboxes[0]);
        io.to(inboxes[0].ownersId).emit('inbox/find', inboxes[0]);
      }
      io.to(channel.roomId).emit('channel/edit', { participantsId: nextParticipants });

      cb({
        success: true,
        message: 'Subscribed successfully',
        payload: { roomId: channel.roomId, channelId, inbox: inboxes[0] || null },
      });
    } catch (error0) {
      cb({ success: false, message: error0.message });
    }
  });

  socket.on('channel/exit', async ({ userId, channelId }, cb) => {
    try {
      const channel = await ChannelModel.findOne({ where: { _id: channelId } });
      const participantsId = pullFromArray(channel.participantsId, [userId]);
      if (participantsId.length === 0) {
        await InboxModel.destroy({ where: { roomId: channel.roomId } });
        await ChannelModel.destroy({ where: { _id: channelId } });
        await ChatModel.destroy({ where: { roomId: channel.roomId } });
      } else {
        const currentAdmins = getGroupAdmins(channel);
        const adminsAfterExit = pullFromArray(currentAdmins, [userId]).filter(
          (adminId) => participantsId.includes(adminId)
        );
        const nextAdmins =
          adminsAfterExit.length > 0 ? adminsAfterExit : [participantsId[0]];
        await channel.update({
          participantsId,
          adminsId: nextAdmins,
          adminId: nextAdmins[0] || participantsId[0],
        });
        const inbox = await InboxModel.findOne({ where: { roomId: channel.roomId } });
        await inbox.update({
          ownersId: pullFromArray(inbox.ownersId, [userId]),
        });
      }
      socket.emit('inbox/delete', [channel.roomId]);
      cb({ success: true, message: 'Successfully left the channel' });
    } catch (error0) {
      cb({ success: false, message: error0.message });
    }
  });

  socket.on('channel/add-admin', async ({ channelId, userId, participantId }) => {
    try {
      const channel = await ChannelModel.findOne({ where: { _id: channelId } });
      ensureAdminControl({ channel, userId });
      if (!asArray(channel.participantsId).includes(participantId)) {
        throw new Error('Subscriber not found in this channel');
      }
      const nextAdminsId = addGroupAdmin({ group: channel, userId: participantId });
      await channel.update({
        adminsId: nextAdminsId,
        adminId: nextAdminsId[0] || channel.adminId,
      });
      io.to(channel.roomId).emit('channel/add-admin', {
        ...sanitizeChannel(channel),
        adminId: nextAdminsId[0] || channel.adminId,
        adminsId: nextAdminsId,
      });
    } catch (error0) {
      console.error(error0.message);
    }
  });

  socket.on('channel/remove-admin', async ({ channelId, userId, participantId }) => {
    try {
      const channel = await ChannelModel.findOne({ where: { _id: channelId } });
      ensureAdminControl({ channel, userId });
      const currentAdminsId = getGroupAdmins(channel);
      if (!currentAdminsId.includes(participantId)) {
        throw new Error('This subscriber is not an admin');
      }
      if (currentAdminsId.length <= 1) {
        throw new Error('At least one admin is required');
      }
      const nextAdminsId = removeGroupAdmin({ group: channel, userId: participantId });
      await channel.update({
        adminsId: nextAdminsId,
        adminId: nextAdminsId[0],
      });
      io.to(channel.roomId).emit('channel/remove-admin', {
        ...sanitizeChannel(channel),
        adminId: nextAdminsId[0],
        adminsId: nextAdminsId,
      });
    } catch (error0) {
      console.error(error0.message);
    }
  });

  socket.on('channel/remove-participant', async ({ channelId, userId, participantId }) => {
    try {
      const channel = await ChannelModel.findOne({ where: { _id: channelId } });
      ensureAdminControl({ channel, userId });
      if (!asArray(channel.participantsId).includes(participantId)) {
        throw new Error('Subscriber not found in this channel');
      }
      const nextParticipantsId = pullFromArray(channel.participantsId, [participantId]);
      const nextAdminsId = pullFromArray(getGroupAdmins(channel), [participantId]);
      const normalizedAdminsId =
        nextAdminsId.length > 0
          ? nextAdminsId
          : nextParticipantsId.length > 0
          ? [nextParticipantsId[0]]
          : [];
      await channel.update({
        participantsId: nextParticipantsId,
        adminsId: normalizedAdminsId,
        adminId: normalizedAdminsId[0] || channel.adminId,
      });
      const inbox = await InboxModel.findOne({ where: { roomId: channel.roomId } });
      await inbox.update({
        ownersId: pullFromArray(inbox.ownersId, [participantId]),
      });
      const inboxes = await Inbox.find({ roomId: channel.roomId });
      socket.broadcast.to(participantId).emit('inbox/delete', [inboxes[0].roomId]);
      io.to(inboxes[0].ownersId).emit('inbox/find', inboxes[0]);
      io.to(channel.roomId).emit('channel/remove-participant', {
        participantId,
        adminsId: normalizedAdminsId,
        adminId: normalizedAdminsId[0] || channel.adminId,
      });
    } catch (error0) {
      console.error(error0.message);
    }
  });
};
