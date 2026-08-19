const { Op } = require('sequelize');
const ProfileModel = require('../db/models/profile');
const GroupModel = require('../db/models/group');
const ChannelModel = require('../db/models/channel');
const { asArray, toPlain, toPlainMany } = require('../db/utils');

const unique = (values) => [...new Set(asArray(values).filter(Boolean))];

const resolveMentions = async ({ text = '', roomId, roomType, senderId }) => {
  const raw = String(text || '');
  const usernameTokens = unique(
    [...raw.matchAll(/@([a-z0-9_]{2,32})/gi)].map((match) => match[1].toLowerCase())
  );
  const special = new Set(usernameTokens.filter((item) => ['all', 'admins'].includes(item)));
  const usernames = usernameTokens.filter((item) => !special.has(item));

  const profiles = usernames.length
    ? await ProfileModel.findAll({
        where: { username: { [Op.in]: usernames } },
        attributes: ['userId', 'username', 'fullname'],
      })
    : [];

  let mentionedUserIds = toPlainMany(profiles).map((profile) => profile.userId);
  let allMention = false;
  let adminsMention = false;

  if (roomType === 'group' && (special.has('all') || special.has('admins'))) {
    const [channelDoc, groupDoc] = await Promise.all([
      ChannelModel.findOne({ where: { roomId } }),
      GroupModel.findOne({ where: { roomId } }),
    ]);
    const room = toPlain(channelDoc) || toPlain(groupDoc) || {};
    const admins = unique([room.adminId, ...asArray(room.adminsId)]);
    const participants = unique(room.participantsId);
    const senderIsAdmin = admins.includes(senderId);

    if (special.has('admins')) {
      adminsMention = true;
      mentionedUserIds.push(...admins);
    }
    if (special.has('all') && senderIsAdmin) {
      allMention = true;
      mentionedUserIds.push(...participants);
    }
  }

  mentionedUserIds = unique(mentionedUserIds).filter((id) => id !== senderId);
  return {
    mentionedUserIds,
    usernames,
    allMention,
    adminsMention,
  };
};

module.exports = {
  resolveMentions,
};
