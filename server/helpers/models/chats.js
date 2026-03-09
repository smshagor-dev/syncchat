const { Op } = require('sequelize');
const ChatModel = require('../../db/models/chat');
const ProfileModel = require('../../db/models/profile');
const FileModel = require('../../db/models/file');
const ChannelModel = require('../../db/models/channel');
const { asArray, toPlainMany } = require('../../db/utils');

const POLL_PREFIX = '__poll__::';

const normalizePollVotes = (votes) =>
  asArray(votes)
    .map((vote) => ({
      userId: vote?.userId || '',
      fullname: vote?.fullname || '[unknown]',
    }))
    .filter((vote) => vote.userId);

const parsePollFromText = (text) => {
  if (typeof text !== 'string' || !text.startsWith(POLL_PREFIX)) return null;
  try {
    const parsed = JSON.parse(text.slice(POLL_PREFIX.length));
    const options = asArray(parsed?.options)
      .map((option, index) => ({
        id: String(option?.id || `opt-${index + 1}`),
        text: String(option?.text || '').trim(),
        votes: normalizePollVotes(option?.votes),
      }))
      .filter((option) => option.text);

    if (!String(parsed?.question || '').trim() || options.length < 2) {
      return null;
    }

    return {
      version: 1,
      question: String(parsed.question).trim(),
      options,
      createdBy: parsed?.createdBy || null,
      createdAt: parsed?.createdAt || null,
    };
  } catch (error0) {
    return null;
  }
};

exports.find = async (roomId, { skip = 0, limit = 20, userId = null }) => {
  const chatsDesc = await ChatModel.findAll({
    where: { roomId },
    order: [['createdAt', 'DESC']],
    offset: Number(skip) || 0,
    limit: Number(limit) || 20,
  });

  const chats = toPlainMany(chatsDesc)
    .filter((chat) => !asArray(chat.deletedBy).includes(userId))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  const userIds = [...new Set(chats.map((chat) => chat.userId))];
  const fileIds = [
    ...new Set(chats.map((chat) => chat.fileId).filter(Boolean)),
  ];
  const replyIds = [
    ...new Set(chats.map((chat) => chat.replyTo).filter(Boolean)),
  ];

  const [profilesRaw, filesRaw, repliesRaw, channelsRaw] = await Promise.all([
    userIds.length
      ? ProfileModel.findAll({
          where: { userId: { [Op.in]: userIds } },
        })
      : [],
    fileIds.length
      ? FileModel.findAll({
          where: { fileId: { [Op.in]: fileIds } },
        })
      : [],
    replyIds.length
      ? ChatModel.findAll({
          where: { _id: { [Op.in]: replyIds } },
          attributes: ['_id', 'userId', 'text', 'fileId'],
        })
      : [],
    roomId
      ? ChannelModel.findAll({
          where: { roomId },
          attributes: { exclude: ['passwordHash'] },
        })
      : [],
  ]);

  const profiles = new Map(
    toPlainMany(profilesRaw).map((profile) => {
      const slim = { ...profile };
      delete slim.username;
      delete slim.email;
      delete slim.bio;
      delete slim.phone;
      delete slim.dialCode;
      delete slim.online;
      delete slim.createdAt;
      delete slim.updatedAt;
      return [profile.userId, slim];
    })
  );
  const files = new Map(
    toPlainMany(filesRaw).map((file) => [file.fileId, file])
  );
  const repliesMap = new Map(
    toPlainMany(repliesRaw).map((item) => [item._id, item])
  );
  const channel = toPlainMany(channelsRaw)[0] || null;
  const channelIdentity =
    channel && channel.name
      ? {
          userId: channel._id,
          fullname: channel.name,
          avatar: channel.avatar || null,
          isChannelIdentity: true,
        }
      : null;
  return chats.map((chat) => ({
    ...chat,
    poll: parsePollFromText(chat.text),
    profile: channelIdentity || profiles.get(chat.userId) || null,
    channel,
    file: chat.fileId ? files.get(chat.fileId) || null : null,
    reply: chat.replyTo
      ? (() => {
          const reply = repliesMap.get(chat.replyTo);
          if (!reply) return null;
          const replyProfile = profiles.get(reply.userId);
          const replyFile = reply.fileId ? files.get(reply.fileId) : null;
          return {
            _id: reply._id,
            userId: reply.userId,
            fullname:
              channelIdentity?.fullname || replyProfile?.fullname || '[inactive]',
            text: reply.text || replyFile?.originalname || '',
          };
        })()
      : null,
  }));
};
