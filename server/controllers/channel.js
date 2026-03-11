const { Op } = require('sequelize');
const ChannelModel = require('../db/models/channel');
const ProfileModel = require('../db/models/profile');
const InboxModel = require('../db/models/inbox');
const ChatModel = require('../db/models/chat');
const ChannelAnalyticsEventModel = require('../db/models/channelAnalyticsEvent');
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
const { trackChannelEvent } = require('../helpers/channelAnalytics');
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
  plain.moderation = getModerationSettings(plain);
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

const toDayKey = (value) => {
  const date = value ? new Date(value) : new Date();
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
    .toISOString()
    .slice(0, 10);
};

const getRecentDayKeys = (days = 30) => {
  const total = Math.max(1, Number(days || 1));
  const now = new Date();
  const base = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );

  return Array.from({ length: total }, (_, index) => {
    const day = new Date(base);
    day.setUTCDate(base.getUTCDate() - (total - 1 - index));
    return day.toISOString().slice(0, 10);
  });
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

exports.analytics = async (req, res) => {
  try {
    const userId = req.user._id;
    const channel = await ChannelModel.findOne({
      where: { _id: req.params.channelId },
    });
    ensureChannelAccess(channel, userId);

    const roomId = channel.roomId;
    const participantIds = asArray(channel.participantsId);
    const subscriberCount = participantIds.length;
    const recentDayKeys = getRecentDayKeys(30);
    const fromDate = new Date(`${recentDayKeys[0]}T00:00:00.000Z`);

    const [inboxDoc, eventsRaw, chatsRaw] = await Promise.all([
      InboxModel.findOne({
        where: { roomId },
        attributes: ['mutedBy'],
      }),
      ChannelAnalyticsEventModel.findAll({
        where: {
          channelId: channel._id,
          createdAt: { [Op.gte]: fromDate },
        },
        attributes: ['eventType', 'createdAt'],
        order: [['createdAt', 'ASC']],
      }),
      ChatModel.findAll({
        where: { roomId },
        attributes: [
          '_id',
          'text',
          'replyTo',
          'reactions',
          'readed',
          'delivered',
          'isSecretSystemMessage',
        ],
      }),
    ]);

    const events = toPlainMany(eventsRaw);
    const posts = toPlainMany(chatsRaw).filter((chat) => {
      if (chat?.isSecretSystemMessage) return false;
      if (chat?.replyTo && /^Reacted\s/u.test(String(chat?.text || ''))) return false;
      return true;
    });

    const deliveredPosts = posts.filter((item) => !!item.delivered).length;
    const viewedPosts = posts.filter((item) => !!item.readed).length;
    const totalPosts = posts.length;

    const reactionCounts = {};
    const uniqueReactors = new Set();
    let totalReactions = 0;
    let postsWithReactions = 0;

    posts.forEach((post) => {
      const reactions = post?.reactions && typeof post.reactions === 'object'
        ? Object.entries(post.reactions)
        : [];
      if (reactions.length > 0) postsWithReactions += 1;
      reactions.forEach(([reactorId, emoji]) => {
        if (!emoji) return;
        totalReactions += 1;
        uniqueReactors.add(reactorId);
        reactionCounts[emoji] = (reactionCounts[emoji] || 0) + 1;
      });
    });

    const topReactions = Object.entries(reactionCounts)
      .map(([emoji, count]) => ({ emoji, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 5);

    const growthDailyMap = new Map(
      recentDayKeys.map((day) => [day, { date: day, join: 0, leave: 0, net: 0 }])
    );
    const muteLeaveDailyMap = new Map(
      recentDayKeys.map((day) => [
        day,
        { date: day, mute: 0, unmute: 0, leave: 0 },
      ])
    );

    let joinedLast30Days = 0;
    let leftLast30Days = 0;
    let muteLast30Days = 0;
    let unmuteLast30Days = 0;

    events.forEach((event) => {
      const dayKey = toDayKey(event.createdAt);
      if (!growthDailyMap.has(dayKey)) return;

      if (event.eventType === 'subscriber_join') {
        const day = growthDailyMap.get(dayKey);
        day.join += 1;
        day.net += 1;
        joinedLast30Days += 1;
      } else if (event.eventType === 'subscriber_leave') {
        const day = growthDailyMap.get(dayKey);
        day.leave += 1;
        day.net -= 1;
        leftLast30Days += 1;

        const trend = muteLeaveDailyMap.get(dayKey);
        trend.leave += 1;
      } else if (event.eventType === 'subscriber_mute') {
        const trend = muteLeaveDailyMap.get(dayKey);
        trend.mute += 1;
        muteLast30Days += 1;
      } else if (event.eventType === 'subscriber_unmute') {
        const trend = muteLeaveDailyMap.get(dayKey);
        trend.unmute += 1;
        unmuteLast30Days += 1;
      }
    });

    const mutedBy = asArray(toPlain(inboxDoc)?.mutedBy).filter((id) =>
      participantIds.includes(id)
    );

    response({
      res,
      payload: {
        channelId: channel._id,
        generatedAt: new Date().toISOString(),
        subscriberGrowth: {
          currentSubscribers: subscriberCount,
          joinedLast30Days,
          leftLast30Days,
          netLast30Days: joinedLast30Days - leftLast30Days,
          daily: [...growthDailyMap.values()],
        },
        postReach: {
          totalPosts,
          deliveredPosts,
          viewedPosts,
          deliveryRate: totalPosts
            ? Number(((deliveredPosts / totalPosts) * 100).toFixed(1))
            : 0,
          viewRate: totalPosts
            ? Number(((viewedPosts / totalPosts) * 100).toFixed(1))
            : 0,
        },
        reactions: {
          totalReactions,
          uniqueReactors: uniqueReactors.size,
          postsWithReactions,
          averagePerPost: totalPosts
            ? Number((totalReactions / totalPosts).toFixed(2))
            : 0,
          topReactions,
        },
        muteLeaveTrend: {
          currentMutedSubscribers: mutedBy.length,
          muteLast30Days,
          unmuteLast30Days,
          leaveLast30Days: leftLast30Days,
          daily: [...muteLeaveDailyMap.values()],
        },
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

    const currentParticipants = asArray(channel.participantsId);
    const nextParticipants = addToSet(currentParticipants, friendsId);
    const newlyAddedParticipants = friendsId.filter(
      (friendId) => !currentParticipants.includes(friendId)
    );
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

    await Promise.allSettled(
      newlyAddedParticipants.map((friendId) =>
        trackChannelEvent({
          channelId: channel._id,
          userId: friendId,
          eventType: 'subscriber_join',
          meta: { source: 'add-participants' },
        })
      )
    );

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

exports.updateModeration = async (req, res) => {
  try {
    const userId = req.user._id;
    const { channelId } = req.params;
    const channel = await ChannelModel.findOne({ where: { _id: channelId } });
    ensureChannelAdminAccess(channel, userId);
    const nextModeration = normalizeModerationSettings(req.body?.moderation);
    await channel.update({ moderation: nextModeration });
    global.io.to(channel.roomId).emit('channel/edit', {
      moderation: nextModeration,
    });
    response({
      res,
      message: 'Channel moderation updated',
      payload: { channelId: channel._id, moderation: nextModeration },
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
    await trackChannelEvent({
      channelId: channel._id,
      userId: memberId,
      eventType: 'subscriber_join',
      meta: { source: 'approve-pending' },
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
    await trackChannelEvent({
      channelId: channel._id,
      userId,
      eventType: 'subscriber_join',
      meta: { source: 'join-link' },
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
