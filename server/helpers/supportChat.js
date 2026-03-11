const crypto = require('crypto');
const { Op } = require('sequelize');
const UserModel = require('../db/models/user');
const ProfileModel = require('../db/models/profile');
const SettingModel = require('../db/models/setting');
const InboxModel = require('../db/models/inbox');
const ChatModel = require('../db/models/chat');
const Inbox = require('./models/inbox');
const encrypt = require('./encrypt');
const { toPlain, asArray } = require('../db/utils');

const SUPPORT_EMAIL = 'support@syncchat.local';
const SUPPORT_USERNAME = 'syncchat_support';
const SUPPORT_NAME = 'SyncChat Support';
const SUPPORT_AVATAR = '/pwa-192x192.png';

const ensureSupportUser = async () => {
  let user = await UserModel.findOne({
    where: {
      [Op.or]: [{ email: SUPPORT_EMAIL }, { username: SUPPORT_USERNAME }],
    },
  });

  if (!user) {
    user = await UserModel.create({
      username: SUPPORT_USERNAME,
      fullname: SUPPORT_NAME,
      email: SUPPORT_EMAIL,
      password: encrypt(crypto.randomBytes(24).toString('hex')),
      verified: true,
      otp: null,
    });

    await SettingModel.create({ userId: user._id });
    await ProfileModel.create({
      userId: user._id,
      username: SUPPORT_USERNAME,
      fullname: SUPPORT_NAME,
      email: SUPPORT_EMAIL,
      avatar: SUPPORT_AVATAR,
      bio: 'Security and device verification updates from SyncChat.',
    });
  }

  const profile = await ProfileModel.findOne({ where: { userId: user._id } });
  if (profile && profile.avatar !== SUPPORT_AVATAR) {
    await profile.update({ avatar: SUPPORT_AVATAR });
  }
  const plainProfile = profile
    ? {
        ...toPlain(profile),
        avatar: SUPPORT_AVATAR,
      }
    : null;
  return {
    user: toPlain(user),
    profile: plainProfile,
  };
};

const ensureSupportInbox = async ({ userId, supportUserId }) => {
  const existing = await InboxModel.findAll({
    where: { roomType: 'private' },
  });
  const match = existing.find((row) => {
    const owners = asArray(toPlain(row)?.ownersId);
    return owners.length === 2 && owners.includes(userId) && owners.includes(supportUserId);
  });

  if (match) return match;

  return InboxModel.create({
    ownersId: [userId, supportUserId],
    roomId: `support-${userId}`,
    roomType: 'private',
    unreadMessage: 0,
    deletedBy: [],
    content: {
      from: supportUserId,
      senderName: SUPPORT_NAME,
      text: 'Support channel ready.',
      time: new Date().toISOString(),
      delivered: true,
      readed: true,
    },
  });
};

const sendSupportMessage = async ({ userId, text }) => {
  const { user, profile } = await ensureSupportUser();
  const inbox = await ensureSupportInbox({ userId, supportUserId: user._id });
  const roomId = toPlain(inbox)?.roomId;
  const createdAt = new Date().toISOString();

  const chat = await ChatModel.create({
    userId: user._id,
    roomId,
    text: String(text || ''),
    delivered: true,
    readed: false,
    deletedBy: [],
  });

  await inbox.update({
    unreadMessage: Number(inbox.unreadMessage || 0) + 1,
    content: {
      from: user._id,
      senderName: SUPPORT_NAME,
      text: String(text || ''),
      time: createdAt,
      delivered: true,
      readed: false,
    },
  });

  const inboxPayload = await Inbox.find({ roomId });
  if (global?.io) {
    global.io.to(roomId).emit('chat/insert', {
      ...toPlain(chat),
      profile,
      channel: null,
      file: null,
      reply: null,
      poll: null,
      secret: null,
      scheduled: null,
    });
    if (inboxPayload[0]) {
      global.io.to([userId]).emit('inbox/find', inboxPayload[0]);
    }
  }

  return {
    supportUser: user,
    inbox: toPlain(inbox),
  };
};

module.exports = {
  ensureSupportUser,
  sendSupportMessage,
};
