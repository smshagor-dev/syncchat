const { Op } = require('sequelize');
const GroupModel = require('../db/models/group');
const ProfileModel = require('../db/models/profile');
const InboxModel = require('../db/models/inbox');
const ChatModel = require('../db/models/chat');
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
const {
  normalizeModerationSettings,
  getModerationSettings,
} = require('../helpers/moderation');
const { getGroupAdmins, isGroupAdminUser } = require('../helpers/groupAdmins');
const {
  getSettingMap,
  getContactMap,
  canUserAddToGroup,
} = require('../helpers/privacy');

const response = require('../helpers/response');

const asGroupLink = (token = '') => `/group/+${String(token || '').trim()}`;

const ensureGroupAccess = (group, userId) => {
  if (!group) {
    const err = new Error('Group not found');
    err.statusCode = 404;
    throw err;
  }

  if (!asArray(group.participantsId).includes(userId)) {
    const err = new Error('You are not a participant of this group');
    err.statusCode = 403;
    throw err;
  }
};

const ensureGroupAdminAccess = (group, userId) => {
  ensureGroupAccess(group, userId);
  if (!isGroupAdminUser({ group, userId })) {
    const err = new Error('Only group admin can perform this action');
    err.statusCode = 403;
    throw err;
  }
};

const sanitizeGroupForUser = (group, requesterId) => {
  const plain = toPlain(group);
  if (!plain) return null;
  delete plain.passwordHash;
  plain.permissions = getGroupPermissions(plain);
  plain.moderation = getModerationSettings(plain);
  if (!isGroupAdminUser({ group: plain, userId: requesterId })) {
    plain.pendingMembersId = [];
  }
  plain.adminsId = getGroupAdmins(plain);
  if (!plain.adminId && plain.adminsId[0]) {
    plain.adminId = plain.adminsId[0];
  }
  if (!Array.isArray(plain.pendingMembersId)) {
    plain.pendingMembersId = [];
  }
  return plain;
};

const emitGroupSystemChat = async ({ roomId, userId, text, profile }) => {
  if (!roomId || !userId || !text) return;

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

exports.findById = async (req, res) => {
  try {
    const userId = req.user._id;
    const group = await GroupModel.findOne({
      where: { _id: req.params.groupId },
    });
    ensureGroupAccess(group, userId);
    const plain = sanitizeGroupForUser(group, userId);
    response({
      res,
      payload: plain,
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
    const group = await GroupModel.findOne({
      where: { _id: req.params.groupId },
    });
    ensureGroupAccess(group, userId);

    const participants = await ProfileModel.findAll({
      where: {
        userId: { [Op.in]: asArray(group?.participantsId) },
      },
      attributes: ['fullname', 'updatedAt'],
      order: [['updatedAt', 'DESC']],
      limit,
    });

    const names = toPlainMany(participants).map(({ fullname }) => fullname);

    response({
      res,
      payload: names,
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
    const group = await GroupModel.findOne({
      where: { _id: req.params.groupId },
    });
    ensureGroupAccess(group, userId);

    const participants = await ProfileModel.findAll({
      where: {
        userId: { [Op.in]: asArray(group?.participantsId) },
      },
      order: [['updatedAt', 'DESC']],
      offset: skip,
      limit,
    });

    response({
      res,
      payload: toPlainMany(participants),
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

exports.pendingMembers = async (req, res) => {
  try {
    const userId = req.user._id;
    const group = await GroupModel.findOne({
      where: { _id: req.params.groupId },
    });
    ensureGroupAdminAccess(group, userId);

    const pending = asArray(group.pendingMembersId);
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

    response({
      res,
      payload: toPlainMany(profiles),
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

exports.addParticipants = async (req, res) => {
  try {
    const userId = req.user._id;
    const { groupId } = req.params;
    const friendsIdRaw = Array.isArray(req.body?.friendsId)
      ? req.body.friendsId
      : [];
    const friendsId = [...new Set(friendsIdRaw.map(String))].filter(Boolean);

    if (friendsId.length === 0) {
      throw new Error('No participant selected');
    }

    const group = await GroupModel.findOne({ where: { _id: groupId } });
    if (!group) throw new Error('Group not found');
    if (!asArray(group.participantsId).includes(userId)) {
      throw new Error('You are not a participant of this group');
    }
    if (!canGroupMemberAddOtherMember({ group, userId })) {
      throw new Error('You do not have permission to add members');
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
      throw new Error('One or more contacts do not allow group adds');
    }

    const nextParticipants = addToSet(group.participantsId, friendsId);
    const nextPendingMembers = pullFromArray(group.pendingMembersId, friendsId);
    await group.update({
      participantsId: nextParticipants,
      pendingMembersId: nextPendingMembers,
    });

    const inviter = await ProfileModel.findOne({
      where: { userId },
      attributes: ['fullname', 'avatar'],
    });

    const addedProfiles = await ProfileModel.findAll({
      where: { userId: friendsId },
      attributes: ['fullname'],
    });
    const addedNames = toPlainMany(addedProfiles).map((item) => item.fullname);
    const actionText =
      addedNames.length > 0
        ? `Added: ${addedNames.join(', ')}`
        : `${friendsId.length} ${
            friendsId.length > 1 ? 'participants' : 'participant'
          } added`;

    const inbox = await InboxModel.findOne({ where: { roomId: group.roomId } });
    if (inbox) {
      await inbox.update({
        ownersId: addToSet(inbox.ownersId, friendsId),
        fileId: null,
        content: {
          senderName: inviter?.fullname || 'Admin',
          from: userId,
          text: actionText,
          time: new Date().toISOString(),
        },
      });
    }

    const chatDoc = await ChatModel.create({
      userId,
      roomId: group.roomId,
      text: actionText,
      replyTo: null,
      fileId: null,
      readed: false,
      delivered: false,
      deletedBy: [],
      reactions: {},
    });
    const chat = toPlain(chatDoc);
    global.io.to(group.roomId).emit('chat/insert', {
      ...chat,
      profile: inviter
        ? {
            userId,
            fullname: inviter.fullname,
            avatar: inviter.avatar || null,
          }
        : null,
      file: null,
      reply: null,
      poll: null,
    });

    const inboxes = await Inbox.find({ roomId: group.roomId });
    if (inboxes[0]) {
      global.io.to(friendsId).emit('group/create', inboxes[0]);
      global.io.to(inboxes[0].ownersId).emit('inbox/find', inboxes[0]);
    }
    global.io.to(group.roomId).emit('group/edit', {
      participantsId: nextParticipants,
      pendingMembersId: nextPendingMembers,
    });

    response({
      res,
      message: 'Participants added successfully',
      payload: {
        groupId,
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

exports.linkMeta = async (req, res) => {
  try {
    const token = String(req.params.token || '').trim();
    if (!token) throw new Error('Invalid invite token');

    const group = await GroupModel.findOne({
      where: { link: asGroupLink(token) },
      attributes: ['_id', 'name', 'avatar', 'accessType', 'permissions'],
    });
    if (!group) {
      response({
        res,
        statusCode: 404,
        success: false,
        message: 'Group not found',
      });
      return;
    }

    response({
      res,
      payload: {
        _id: group._id,
        name: group.name,
        avatar: group.avatar || null,
        accessType: group.accessType || 'public',
        requiresPassword: group.accessType === 'private',
        inviteEnabled: getGroupPermissions(group).memberCanInviteViaLink,
        requiresApproval: getGroupPermissions(group).adminApprovalRequired,
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

    const group = await GroupModel.findOne({
      where: { link: asGroupLink(token) },
    });
    if (!group) throw new Error('Group not found');
    const permissions = getGroupPermissions(group);

    const participants = asArray(group.participantsId);
    if (participants.includes(userId)) {
      const inboxes = await Inbox.find({ roomId: group.roomId });
      response({
        res,
        message: 'Already joined this group',
        payload: {
          roomId: group.roomId,
          groupId: group._id,
          inbox: inboxes[0] || null,
        },
      });
      return;
    }
    if (!permissions.memberCanInviteViaLink) {
      throw new Error('Invite via link is disabled by admin');
    }

    if (group.accessType === 'private') {
      if (!group.passwordHash)
        throw new Error('Private group password is not set');
      decrypt(password, group.passwordHash);
    }
    if (permissions.adminApprovalRequired) {
      const pendingMembers = asArray(group.pendingMembersId);
      if (!pendingMembers.includes(userId)) {
        const nextPendingMembers = addToSet(pendingMembers, [userId]);
        await group.update({ pendingMembersId: nextPendingMembers });

        const requester = await ProfileModel.findOne({
          where: { userId },
          attributes: ['fullname', 'avatar'],
        });
        const requesterPlain = toPlain(requester);

        global.io.to(group.roomId).emit('group/edit', {
          pendingMembersId: nextPendingMembers,
        });
        const adminTargets = getGroupAdmins(group);
        if (adminTargets.length > 0) {
          global.io.to(adminTargets).emit('group/join-request', {
            groupId: group._id,
            roomId: group.roomId,
            userId,
            fullname: requesterPlain?.fullname || 'A user',
            avatar: requesterPlain?.avatar || null,
            createdAt: new Date().toISOString(),
          });
        }
      }

      response({
        res,
        message: 'Join request sent to admin for approval',
        payload: {
          groupId: group._id,
          roomId: group.roomId,
          pending: true,
        },
      });
      return;
    }

    const nextParticipants = addToSet(group.participantsId, [userId]);
    const nextPendingMembers = pullFromArray(group.pendingMembersId, [userId]);
    await group.update({
      participantsId: nextParticipants,
      pendingMembersId: nextPendingMembers,
    });

    const inbox = await InboxModel.findOne({ where: { roomId: group.roomId } });
    if (inbox) {
      await inbox.update({
        ownersId: addToSet(inbox.ownersId, [userId]),
      });
    }

    const profile = await ProfileModel.findOne({
      where: { userId },
      attributes: ['fullname', 'avatar'],
    });
    const actionText = `${
      profile?.fullname || 'A user'
    } joined via invite link`;

    if (inbox) {
      await inbox.update({
        fileId: null,
        content: {
          senderName: profile?.fullname || 'A user',
          from: userId,
          text: actionText,
          time: new Date().toISOString(),
        },
      });
    }

    await emitGroupSystemChat({
      roomId: group.roomId,
      userId,
      text: actionText,
      profile: toPlain(profile),
    });

    const inboxes = await Inbox.find({ roomId: group.roomId });
    if (inboxes[0]) {
      global.io.to(userId).emit('group/create', inboxes[0]);
      global.io.to(inboxes[0].ownersId).emit('inbox/find', inboxes[0]);
    }

    global.io.to(group.roomId).emit('group/edit', {
      accessType: group.accessType,
      participantsId: nextParticipants,
      pendingMembersId: nextPendingMembers,
    });

    response({
      res,
      message: 'Joined group successfully',
      payload: {
        roomId: group.roomId,
        groupId: group._id,
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

exports.updatePrivacy = async (req, res) => {
  try {
    const userId = req.user._id;
    const { groupId } = req.params;
    const accessType =
      req.body?.accessType === 'private' ? 'private' : 'public';
    const password = String(req.body?.password || '');

    const group = await GroupModel.findOne({ where: { _id: groupId } });
    ensureGroupAdminAccess(group, userId);

    if (accessType === 'private' && password.length < 4) {
      throw new Error('Private group password must be at least 4 characters');
    }

    const updates = {
      accessType,
      passwordHash: accessType === 'private' ? encrypt(password) : null,
    };
    await group.update(updates);

    const profile = await ProfileModel.findOne({
      where: { userId },
      attributes: ['fullname', 'avatar'],
    });
    const actionText =
      accessType === 'private'
        ? 'Group changed to private'
        : 'Group changed to public';

    const inbox = await InboxModel.findOne({ where: { roomId: group.roomId } });
    if (inbox) {
      await inbox.update({
        fileId: null,
        content: {
          senderName: profile?.fullname || 'Admin',
          from: userId,
          text: actionText,
          time: new Date().toISOString(),
        },
      });
    }

    await emitGroupSystemChat({
      roomId: group.roomId,
      userId,
      text: actionText,
      profile: toPlain(profile),
    });

    const inboxes = await Inbox.find({ roomId: group.roomId });
    if (inboxes[0]) {
      global.io.to(memberId).emit('group/create', inboxes[0]);
      global.io.to(inboxes[0].ownersId).emit('inbox/find', inboxes[0]);
    }
    global.io.to(group.roomId).emit('group/edit', {
      accessType,
    });

    response({
      res,
      message: 'Group privacy updated',
      payload: {
        groupId: group._id,
        accessType,
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

exports.updatePassword = async (req, res) => {
  try {
    const userId = req.user._id;
    const { groupId } = req.params;
    const oldPassword = String(req.body?.oldPassword || '');
    const newPassword = String(req.body?.newPassword || '');

    if (newPassword.length < 4) {
      throw new Error('New password must be at least 4 characters');
    }

    const group = await GroupModel.findOne({ where: { _id: groupId } });
    ensureGroupAdminAccess(group, userId);
    if (group.accessType !== 'private') {
      throw new Error('Password can be changed only for private group');
    }
    if (!group.passwordHash) {
      throw new Error('Password is not configured');
    }

    decrypt(oldPassword, group.passwordHash);
    await group.update({
      passwordHash: encrypt(newPassword),
    });

    const profile = await ProfileModel.findOne({
      where: { userId },
      attributes: ['fullname', 'avatar'],
    });
    const actionText = 'Private group password updated';

    const inbox = await InboxModel.findOne({ where: { roomId: group.roomId } });
    if (inbox) {
      await inbox.update({
        fileId: null,
        content: {
          senderName: profile?.fullname || 'Admin',
          from: userId,
          text: actionText,
          time: new Date().toISOString(),
        },
      });
    }

    await emitGroupSystemChat({
      roomId: group.roomId,
      userId,
      text: actionText,
      profile: toPlain(profile),
    });

    const inboxes = await Inbox.find({ roomId: group.roomId });
    if (inboxes[0]) {
      global.io.to(inboxes[0].ownersId).emit('inbox/find', inboxes[0]);
    }

    response({
      res,
      message: 'Group password updated',
      payload: {
        groupId: group._id,
        accessType: group.accessType,
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

exports.updatePermissions = async (req, res) => {
  try {
    const userId = req.user._id;
    const { groupId } = req.params;

    const group = await GroupModel.findOne({ where: { _id: groupId } });
    ensureGroupAdminAccess(group, userId);

    const nextPermissions = normalizeGroupPermissions(req.body?.permissions);
    await group.update({ permissions: nextPermissions });

    global.io.to(group.roomId).emit('group/edit', {
      permissions: nextPermissions,
    });

    response({
      res,
      message: 'Group permissions updated',
      payload: {
        groupId: group._id,
        permissions: nextPermissions,
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

exports.updateModeration = async (req, res) => {
  try {
    const userId = req.user._id;
    const { groupId } = req.params;
    const group = await GroupModel.findOne({ where: { _id: groupId } });
    ensureGroupAdminAccess(group, userId);

    const nextModeration = normalizeModerationSettings(req.body?.moderation);
    await group.update({ moderation: nextModeration });

    global.io.to(group.roomId).emit('group/edit', {
      moderation: nextModeration,
    });

    response({
      res,
      message: 'Group moderation updated',
      payload: {
        groupId: group._id,
        moderation: nextModeration,
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

exports.approvePendingMember = async (req, res) => {
  try {
    const userId = req.user._id;
    const { groupId } = req.params;
    const memberId = String(req.params.memberId || '');

    if (!memberId) throw new Error('Member ID is required');

    const group = await GroupModel.findOne({ where: { _id: groupId } });
    ensureGroupAdminAccess(group, userId);

    const pendingMembers = asArray(group.pendingMembersId);
    if (!pendingMembers.includes(memberId)) {
      throw new Error('Join request not found');
    }

    const nextParticipants = addToSet(group.participantsId, [memberId]);
    const nextPendingMembers = pullFromArray(pendingMembers, [memberId]);
    await group.update({
      participantsId: nextParticipants,
      pendingMembersId: nextPendingMembers,
    });

    const inbox = await InboxModel.findOne({ where: { roomId: group.roomId } });
    if (inbox) {
      await inbox.update({
        ownersId: addToSet(inbox.ownersId, [memberId]),
      });
    }

    const approvedProfile = await ProfileModel.findOne({
      where: { userId: memberId },
      attributes: ['fullname', 'avatar'],
    });
    const actionText = `${
      approvedProfile?.fullname || 'A user'
    } joined after admin approval`;

    if (inbox) {
      await inbox.update({
        fileId: null,
        content: {
          senderName: approvedProfile?.fullname || 'A user',
          from: memberId,
          text: actionText,
          time: new Date().toISOString(),
        },
      });
    }

    await emitGroupSystemChat({
      roomId: group.roomId,
      userId: memberId,
      text: actionText,
      profile: toPlain(approvedProfile),
    });

    const inboxes = await Inbox.find({ roomId: group.roomId });
    if (inboxes[0]) {
      global.io.to(inboxes[0].ownersId).emit('inbox/find', inboxes[0]);
    }

    global.io.to(group.roomId).emit('group/edit', {
      participantsId: nextParticipants,
      pendingMembersId: nextPendingMembers,
    });

    response({
      res,
      message: 'Member approved successfully',
      payload: {
        groupId: group._id,
        memberId,
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

exports.rejectPendingMember = async (req, res) => {
  try {
    const userId = req.user._id;
    const { groupId } = req.params;
    const memberId = String(req.params.memberId || '');

    if (!memberId) throw new Error('Member ID is required');

    const group = await GroupModel.findOne({ where: { _id: groupId } });
    ensureGroupAdminAccess(group, userId);

    const pendingMembers = asArray(group.pendingMembersId);
    if (!pendingMembers.includes(memberId)) {
      throw new Error('Join request not found');
    }

    const nextPendingMembers = pullFromArray(pendingMembers, [memberId]);
    await group.update({ pendingMembersId: nextPendingMembers });

    global.io.to(group.roomId).emit('group/edit', {
      pendingMembersId: nextPendingMembers,
    });

    response({
      res,
      message: 'Member request rejected',
      payload: {
        groupId: group._id,
        memberId,
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

exports.verifyPassword = async (req, res) => {
  try {
    const userId = req.user._id;
    const { groupId } = req.params;
    const password = String(req.body?.password || '');

    const group = await GroupModel.findOne({ where: { _id: groupId } });
    ensureGroupAccess(group, userId);

    if (group.accessType !== 'private') {
      response({
        res,
        message: 'Group is public',
        payload: { verified: true },
      });
      return;
    }

    if (!group.passwordHash) {
      throw new Error('Private group password is not set');
    }
    decrypt(password, group.passwordHash);

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
