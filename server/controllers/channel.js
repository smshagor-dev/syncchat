const { Op } = require('sequelize');
const ChannelModel = require('../db/models/channel');
const ProfileModel = require('../db/models/profile');
const InboxModel = require('../db/models/inbox');
const Inbox = require('../helpers/models/inbox');
const {
  asArray,
  toPlain,
  toPlainMany,
  addToSet,
  pullFromArray,
} = require('../db/utils');
const encrypt = require('../helpers/encrypt');
const decrypt = require('../helpers/decrypt');
const {
  normalizeGroupPermissions,
  getGroupPermissions,
  canGroupMemberAddOtherMember,
} = require('../helpers/groupPermissions');
const { getGroupAdmins, isGroupAdminUser } = require('../helpers/groupAdmins');
const {
  getSettingMap,
  getContactMap,
  canUserAddToGroup,
} = require('../helpers/privacy');
const response = require('../helpers/response');

const asChannelLink = (token = '') => `/channel/+${String(token || '').trim()}`;

const ensureChannelAccess = (channel, userId) => {
  if (!channel) {
    const err = new Error('Channel not found');
    err.statusCode = 404;
    throw err;
  }

  if (!asArray(channel.participantsId).includes(userId)) {
    const err = new Error('You are not subscribed to this channel');
    err.statusCode = 403;
    throw err;
  }
};

const ensureChannelAdminAccess = (channel, userId) => {
  ensureChannelAccess(channel, userId);
  if (!isGroupAdminUser({ group: channel, userId })) {
    const err = new Error('Only channel admin can perform this action');
    err.statusCode = 403;
    throw err;
  }
};

const sanitizeChannelForUser = (channel, requesterId) => {
  const plain = toPlain(channel);
  if (!plain) return null;
  delete plain.passwordHash;
  plain.permissions = getGroupPermissions(plain);
  plain.adminsId = getGroupAdmins(plain);
  if (!isGroupAdminUser({ group: plain, userId: requesterId })) {
    plain.pendingMembersId = [];
  }
  if (!plain.adminId && plain.adminsId[0]) {
    plain.adminId = plain.adminsId[0];
  }
  plain.requiresPassword = plain.accessType === 'private';
  return plain;
};

exports.list = async (req, res) => {
  try {
    const userId = req.user._id;
    const channels = await ChannelModel.findAll({
      order: [['updatedAt', 'DESC']],
    });
    const payload = toPlainMany(channels).map((channel) => ({
      ...sanitizeChannelForUser(channel, userId),
      subscribed: asArray(channel.participantsId).includes(userId),
      totalSubscribers: asArray(channel.participantsId).length,
    }));
    response({ res, payload });
  } catch (error0) {
    response({
      res,
      statusCode: error0.statusCode || 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.findById = async (req, res) => {
  try {
    const userId = req.user._id;
    const channel = await ChannelModel.findOne({
      where: { _id: req.params.channelId },
    });
    ensureChannelAccess(channel, userId);
    response({
      res,
      payload: sanitizeChannelForUser(channel, userId),
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

exports.participantsName = async (req, res) => {
  try {
    const limit = Number(req.query.limit || 10);
    const userId = req.user._id;
    const channel = await ChannelModel.findOne({
      where: { _id: req.params.channelId },
    });
    ensureChannelAccess(channel, userId);
    const participants = await ProfileModel.findAll({
      where: {
        userId: { [Op.in]: asArray(channel?.participantsId) },
      },
      attributes: ['fullname', 'updatedAt'],
      order: [['updatedAt', 'DESC']],
      limit,
    });
    response({
      res,
      payload: toPlainMany(participants).map(({ fullname }) => fullname),
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

exports.participants = async (req, res) => {
  try {
    const skip = Number(req.query.skip || 0);
    const limit = Number(req.query.limit || 20);
    const userId = req.user._id;
    const channel = await ChannelModel.findOne({
      where: { _id: req.params.channelId },
    });
    ensureChannelAccess(channel, userId);
    const participants = await ProfileModel.findAll({
      where: {
        userId: { [Op.in]: asArray(channel?.participantsId) },
      },
      order: [['updatedAt', 'DESC']],
      offset: skip,
      limit,
    });
    response({ res, payload: toPlainMany(participants) });
  } catch (error0) {
    response({
      res,
      statusCode: error0.statusCode || 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.pendingMembers = async (req, res) => {
  try {
    const userId = req.user._id;
    const channel = await ChannelModel.findOne({
      where: { _id: req.params.channelId },
    });
    ensureChannelAdminAccess(channel, userId);
    const pending = asArray(channel.pendingMembersId);
    if (pending.length === 0) {
      response({ res, payload: [] });
      return;
    }
    const profiles = await ProfileModel.findAll({
      where: {
        userId: { [Op.in]: pending },
      },
      attributes: ['userId', 'fullname', 'avatar', 'bio', 'updatedAt'],
      order: [['updatedAt', 'DESC']],
    });
    response({ res, payload: toPlainMany(profiles) });
  } catch (error0) {
    response({
      res,
      statusCode: error0.statusCode || 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.addParticipants = async (req, res) => {
  try {
    const userId = req.user._id;
    const { channelId } = req.params;
    const friendsIdRaw = Array.isArray(req.body?.friendsId)
      ? req.body.friendsId
      : [];
    const friendsId = [...new Set(friendsIdRaw.map(String))].filter(Boolean);
    if (friendsId.length === 0) throw new Error('No subscriber selected');

    const channel = await ChannelModel.findOne({ where: { _id: channelId } });
    if (!channel) throw new Error('Channel not found');
    if (!asArray(channel.participantsId).includes(userId)) {
      throw new Error('You are not subscribed to this channel');
    }
    if (!canGroupMemberAddOtherMember({ group: channel, userId })) {
      throw new Error('You do not have permission to add subscribers');
    }

    const [settingMap, contactMap] = await Promise.all([
      getSettingMap(friendsId),
      getContactMap({ ownerIds: friendsId, friendIds: [userId] }),
    ]);
    const blockedTargets = friendsId.filter((friendId) => {
      const targetSetting = settingMap.get(friendId);
      return !canUserAddToGroup({
        setting: targetSetting,
        isContact: !!contactMap.get(`${friendId}:${userId}`),
        isSelf: friendId === userId,
      });
    });
    if (blockedTargets.length > 0) {
      throw new Error('One or more contacts do not allow channel adds');
    }

    const nextParticipants = addToSet(channel.participantsId, friendsId);
    const nextPendingMembers = pullFromArray(channel.pendingMembersId, friendsId);
    await channel.update({
      participantsId: nextParticipants,
      pendingMembersId: nextPendingMembers,
    });

    const inbox = await InboxModel.findOne({ where: { roomId: channel.roomId } });
    if (inbox) {
      await inbox.update({
        ownersId: addToSet(inbox.ownersId, friendsId),
      });
    }

    global.io.to(channel.roomId).emit('channel/edit', {
      participantsId: nextParticipants,
      pendingMembersId: nextPendingMembers,
    });

    const inboxes = await Inbox.find({ roomId: channel.roomId });
    if (inboxes[0]) {
      global.io.to(friendsId).emit('channel/create', inboxes[0]);
      global.io.to(inboxes[0].ownersId).emit('inbox/find', inboxes[0]);
    }

    response({
      res,
      message: 'Subscribers added successfully',
      payload: {
        channelId,
        participantsId: nextParticipants,
        pendingMembersId: nextPendingMembers,
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

exports.updatePrivacy = async (req, res) => {
  try {
    const userId = req.user._id;
    const { channelId } = req.params;
    const accessType =
      req.body?.accessType === 'private' ? 'private' : 'public';
    const password = String(req.body?.password || '');
    const channel = await ChannelModel.findOne({ where: { _id: channelId } });
    ensureChannelAdminAccess(channel, userId);

    if (accessType === 'private' && password.length < 4) {
      throw new Error('Private channel password must be at least 4 characters');
    }

    await channel.update({
      accessType,
      passwordHash: accessType === 'private' ? encrypt(password) : null,
    });
    global.io.to(channel.roomId).emit('channel/edit', { accessType });

    response({
      res,
      message: 'Channel privacy updated',
      payload: { channelId: channel._id, accessType },
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

exports.updatePassword = async (req, res) => {
  try {
    const userId = req.user._id;
    const { channelId } = req.params;
    const oldPassword = String(req.body?.oldPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    if (newPassword.length < 4) {
      throw new Error('New password must be at least 4 characters');
    }
    const channel = await ChannelModel.findOne({ where: { _id: channelId } });
    ensureChannelAdminAccess(channel, userId);
    if (channel.accessType !== 'private') {
      throw new Error('Password can be changed only for private channel');
    }
    if (!channel.passwordHash) {
      throw new Error('Password is not configured');
    }
    decrypt(oldPassword, channel.passwordHash);
    await channel.update({ passwordHash: encrypt(newPassword) });
    response({
      res,
      message: 'Channel password updated',
      payload: { channelId: channel._id },
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

exports.updatePermissions = async (req, res) => {
  try {
    const userId = req.user._id;
    const { channelId } = req.params;
    const channel = await ChannelModel.findOne({ where: { _id: channelId } });
    ensureChannelAdminAccess(channel, userId);
    const nextPermissions = normalizeGroupPermissions(req.body?.permissions, {
      isChannel: true,
    });
    await channel.update({ permissions: nextPermissions });
    global.io.to(channel.roomId).emit('channel/edit', {
      permissions: nextPermissions,
    });
    response({
      res,
      message: 'Channel permissions updated',
      payload: { channelId: channel._id, permissions: nextPermissions },
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

exports.approvePendingMember = async (req, res) => {
  try {
    const userId = req.user._id;
    const { channelId } = req.params;
    const memberId = String(req.params.memberId || '');
    const channel = await ChannelModel.findOne({ where: { _id: channelId } });
    ensureChannelAdminAccess(channel, userId);
    const pendingMembers = asArray(channel.pendingMembersId);
    if (!pendingMembers.includes(memberId)) {
      throw new Error('Join request not found');
    }
    const nextParticipants = addToSet(channel.participantsId, [memberId]);
    const nextPendingMembers = pullFromArray(pendingMembers, [memberId]);
    await channel.update({
      participantsId: nextParticipants,
      pendingMembersId: nextPendingMembers,
    });
    const inbox = await InboxModel.findOne({ where: { roomId: channel.roomId } });
    if (inbox) {
      await inbox.update({ ownersId: addToSet(inbox.ownersId, [memberId]) });
    }
    const inboxes = await Inbox.find({ roomId: channel.roomId });
    if (inboxes[0]) {
      global.io.to(memberId).emit('channel/create', inboxes[0]);
      global.io.to(inboxes[0].ownersId).emit('inbox/find', inboxes[0]);
    }
    global.io.to(channel.roomId).emit('channel/edit', {
      participantsId: nextParticipants,
      pendingMembersId: nextPendingMembers,
    });
    response({
      res,
      message: 'Subscriber approved successfully',
      payload: { channelId, memberId, participantsId: nextParticipants },
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

exports.rejectPendingMember = async (req, res) => {
  try {
    const userId = req.user._id;
    const { channelId } = req.params;
    const memberId = String(req.params.memberId || '');
    const channel = await ChannelModel.findOne({ where: { _id: channelId } });
    ensureChannelAdminAccess(channel, userId);
    const pendingMembers = asArray(channel.pendingMembersId);
    if (!pendingMembers.includes(memberId)) {
      throw new Error('Join request not found');
    }
    const nextPendingMembers = pullFromArray(pendingMembers, [memberId]);
    await channel.update({ pendingMembersId: nextPendingMembers });
    global.io.to(channel.roomId).emit('channel/edit', {
      pendingMembersId: nextPendingMembers,
    });
    response({
      res,
      message: 'Subscriber request rejected',
      payload: { channelId, memberId, pendingMembersId: nextPendingMembers },
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

exports.linkMeta = async (req, res) => {
  try {
    const token = String(req.params.token || '').trim();
    if (!token) throw new Error('Invalid invite token');
    const channel = await ChannelModel.findOne({
      where: { link: asChannelLink(token) },
      attributes: ['_id', 'name', 'avatar', 'accessType', 'permissions'],
    });
    if (!channel) {
      response({
        res,
        statusCode: 404,
        success: false,
        message: 'Channel not found',
      });
      return;
    }
    response({
      res,
      payload: {
        _id: channel._id,
        name: channel.name,
        avatar: channel.avatar || null,
        accessType: channel.accessType || 'public',
        requiresPassword: channel.accessType === 'private',
        inviteEnabled: getGroupPermissions(channel).memberCanInviteViaLink,
        requiresApproval: getGroupPermissions(channel).adminApprovalRequired,
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

exports.joinByLink = async (req, res) => {
  try {
    const userId = req.user._id;
    const token = String(req.body?.token || '').trim();
    const password = String(req.body?.password || '');
    if (!token) throw new Error('Invite token is required');

    const channel = await ChannelModel.findOne({
      where: { link: asChannelLink(token) },
    });
    if (!channel) throw new Error('Channel not found');
    const permissions = getGroupPermissions(channel);

    if (asArray(channel.participantsId).includes(userId)) {
      const inboxes = await Inbox.find({ roomId: channel.roomId });
      response({
        res,
        message: 'Already joined this channel',
        payload: {
          roomId: channel.roomId,
          channelId: channel._id,
          inbox: inboxes[0] || null,
        },
      });
      return;
    }

    if (!permissions.memberCanInviteViaLink) {
      throw new Error('Invite via link is disabled by admin');
    }

    if (channel.accessType === 'private') {
      if (!channel.passwordHash) {
        throw new Error('Private channel password is not set');
      }
      decrypt(password, channel.passwordHash);
    }

    if (permissions.adminApprovalRequired) {
      const pendingMembers = asArray(channel.pendingMembersId);
      const nextPendingMembers = addToSet(pendingMembers, [userId]);
      await channel.update({ pendingMembersId: nextPendingMembers });
      global.io.to(channel.roomId).emit('channel/edit', {
        pendingMembersId: nextPendingMembers,
      });
      response({
        res,
        message: 'Join request sent to admin for approval',
        payload: { channelId: channel._id, roomId: channel.roomId, pending: true },
      });
      return;
    }

    const nextParticipants = addToSet(channel.participantsId, [userId]);
    const nextPendingMembers = pullFromArray(channel.pendingMembersId, [userId]);
    await channel.update({
      participantsId: nextParticipants,
      pendingMembersId: nextPendingMembers,
    });
    const inbox = await InboxModel.findOne({ where: { roomId: channel.roomId } });
    if (inbox) {
      await inbox.update({
        ownersId: addToSet(inbox.ownersId, [userId]),
      });
    }
    const inboxes = await Inbox.find({ roomId: channel.roomId });
    if (inboxes[0]) {
      global.io.to(userId).emit('channel/create', inboxes[0]);
      global.io.to(inboxes[0].ownersId).emit('inbox/find', inboxes[0]);
    }
    global.io.to(channel.roomId).emit('channel/edit', {
      participantsId: nextParticipants,
      pendingMembersId: nextPendingMembers,
    });
    response({
      res,
      message: 'Joined channel successfully',
      payload: {
        roomId: channel.roomId,
        channelId: channel._id,
        inbox: inboxes[0] || null,
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

exports.verifyPassword = async (req, res) => {
  try {
    const userId = req.user._id;
    const { channelId } = req.params;
    const password = String(req.body?.password || '');
    const channel = await ChannelModel.findOne({
      where: { _id: channelId },
    });
    ensureChannelAccess(channel, userId);
    if (channel.accessType !== 'private') {
      response({
        res,
        message: 'Channel is public',
        payload: { verified: true },
      });
      return;
    }
    if (!channel.passwordHash) {
      throw new Error('Private channel password is not set');
    }
    decrypt(password, channel.passwordHash);
    response({
      res,
      message: 'Password verified',
      payload: { verified: true },
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
