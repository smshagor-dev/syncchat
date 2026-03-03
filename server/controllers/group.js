const { Op } = require('sequelize');
const GroupModel = require('../db/models/group');
const ProfileModel = require('../db/models/profile');
const InboxModel = require('../db/models/inbox');
const ChatModel = require('../db/models/chat');
const Inbox = require('../helpers/models/inbox');
const { asArray, toPlain, toPlainMany, addToSet } = require('../db/utils');
const encrypt = require('../helpers/encrypt');
const decrypt = require('../helpers/decrypt');

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

const emitGroupSystemChat = async ({
  roomId,
  userId,
  text,
  profile,
}) => {
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
    const group = await GroupModel.findOne({ where: { _id: req.params.groupId } });
    const plain = toPlain(group);
    if (plain) delete plain.passwordHash;
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
    const group = await GroupModel.findOne({ where: { _id: req.params.groupId } });

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
    const group = await GroupModel.findOne({ where: { _id: req.params.groupId } });

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

exports.addParticipants = async (req, res) => {
  try {
    const userId = req.user._id;
    const groupId = req.params.groupId;
    const friendsIdRaw = Array.isArray(req.body?.friendsId)
      ? req.body.friendsId
      : [];
    const friendsId = [...new Set(friendsIdRaw.map(String))].filter(Boolean);

    if (friendsId.length === 0) {
      throw new Error('No participant selected');
    }

    const group = await GroupModel.findOne({ where: { _id: groupId } });
    if (!group) throw new Error('Group not found');
    if (group.adminId !== userId) {
      throw new Error('Only group admin can add participants');
    }
    if (!asArray(group.participantsId).includes(userId)) {
      throw new Error('You are not a participant of this group');
    }

    const nextParticipants = addToSet(group.participantsId, friendsId);
    await group.update({ participantsId: nextParticipants });

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
      global.io.to(inboxes[0].ownersId).emit('inbox/find', inboxes[0]);
    }

    response({
      res,
      message: 'Participants added successfully',
      payload: {
        groupId,
        participantsId: nextParticipants,
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
      attributes: ['_id', 'name', 'avatar', 'accessType'],
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

    const group = await GroupModel.findOne({ where: { link: asGroupLink(token) } });
    if (!group) throw new Error('Group not found');

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

    if (group.accessType === 'private') {
      if (!group.passwordHash) throw new Error('Private group password is not set');
      decrypt(password, group.passwordHash);
    }

    const nextParticipants = addToSet(group.participantsId, [userId]);
    await group.update({ participantsId: nextParticipants });

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
    const actionText = `${profile?.fullname || 'A user'} joined via invite link`;

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
      global.io.to(inboxes[0].ownersId).emit('inbox/find', inboxes[0]);
    }

    global.io.to(group.roomId).emit('group/edit', {
      accessType: group.accessType,
      participantsId: nextParticipants,
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
    const groupId = req.params.groupId;
    const accessType = req.body?.accessType === 'private' ? 'private' : 'public';
    const password = String(req.body?.password || '');

    const group = await GroupModel.findOne({ where: { _id: groupId } });
    ensureGroupAccess(group, userId);
    if (group.adminId !== userId) {
      throw new Error('Only group admin can update privacy');
    }

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
    const groupId = req.params.groupId;
    const oldPassword = String(req.body?.oldPassword || '');
    const newPassword = String(req.body?.newPassword || '');

    if (newPassword.length < 4) {
      throw new Error('New password must be at least 4 characters');
    }

    const group = await GroupModel.findOne({ where: { _id: groupId } });
    ensureGroupAccess(group, userId);
    if (group.adminId !== userId) {
      throw new Error('Only group admin can change password');
    }
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

exports.verifyPassword = async (req, res) => {
  try {
    const userId = req.user._id;
    const groupId = req.params.groupId;
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
