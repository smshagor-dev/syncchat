const { Op } = require('sequelize');
const sharp = require('sharp');
const { randomUUID: uuidv4 } = require('crypto');

const CommunityModel = require('../db/models/community');
const GroupModel = require('../db/models/group');
const InboxModel = require('../db/models/inbox');
const ChatModel = require('../db/models/chat');
const ProfileModel = require('../db/models/profile');
const Inbox = require('../helpers/models/inbox');
const { asArray, toPlain, toPlainMany, addToSet } = require('../db/utils');
const response = require('../helpers/response');
const { parseDataUri, saveBufferFile } = require('../helpers/storage');
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

const normalizePhone = (value = '') => String(value).replace(/\D/g, '');

const buildProfilePhones = (profile) => {
  const phone = normalizePhone(profile.phone);
  const dial = normalizePhone(profile.dialCode);
  const values = [
    phone,
    `${dial}${phone}`,
    phone.startsWith('0') ? `${dial}${phone.slice(1)}` : '',
  ].filter(Boolean);

  return [...new Set(values)];
};

const resolveUserIdByIdentity = async (identityRaw = '') => {
  const identity = String(identityRaw || '').trim();
  if (!identity) return null;

  const profile = await ProfileModel.findOne({
    where: {
      [Op.or]: [{ userId: identity }, { username: identity }, { email: identity }],
    },
    attributes: ['userId'],
  });
  if (profile?.userId) return profile.userId;

  const byPhone = normalizePhone(identity);
  if (!byPhone) return null;

  const profiles = await ProfileModel.findAll({
    where: { phone: { [Op.not]: '' } },
    attributes: ['userId', 'phone', 'dialCode'],
  });

  const found = toPlainMany(profiles).find((item) => {
    const phones = buildProfilePhones(item);
    const last10 = byPhone.slice(-10);

    return (
      phones.includes(byPhone) ||
      (last10.length === 10 && phones.some((x) => x.endsWith(last10)))
    );
  });

  return found?.userId || null;
};

const isUnreadForUser = (inbox, userId) => {
  const incoming = inbox?.content?.from && inbox.content.from !== userId;
  const unread = Number(inbox?.unreadMessage || 0) > 0;
  const manualUnread =
    Array.isArray(inbox?.markUnreadBy) && inbox.markUnreadBy.includes(userId);

  return (incoming && unread) || manualUnread;
};

const mapChatItem = ({ inbox, groupByRoom, profileById, userId }) => {
  const group = groupByRoom.get(inbox.roomId) || null;
  const sender =
    profileById.get(inbox?.content?.from) || {
      fullname: inbox?.content?.senderName || 'Unknown',
    };
  const unreadRooms = isUnreadForUser(inbox, userId);

  return {
    inboxId: inbox._id,
    roomId: inbox.roomId,
    roomType: inbox.roomType,
    ownersId: inbox.ownersId || [],
    group,
    content: inbox.content || null,
    unreadMessage: inbox.unreadMessage || 0,
    unreadRooms,
    isMuted:
      Array.isArray(inbox.mutedBy) && inbox.mutedBy.includes(userId),
    isPinned:
      Array.isArray(inbox.pinnedBy) && inbox.pinnedBy.includes(userId),
    senderName: sender.fullname || inbox?.content?.senderName || 'Unknown',
  };
};

const buildCommunityPayload = async (community, userId) => {
  const groupsRaw = await GroupModel.findAll({
    attributes: { exclude: ['passwordHash'] },
  });
  const groups = toPlainMany(groupsRaw).filter(
    (group) =>
      group.communityId === community._id &&
      asArray(group.participantsId).includes(userId)
  );

  const roomIds = groups.map((group) => group.roomId);
  if (roomIds.length === 0) {
    return {
      ...community,
      unreadTotal: 0,
      previewChats: [],
      totalChats: 0,
    };
  }

  const inboxesRaw = await InboxModel.findAll({
    where: { roomId: { [Op.in]: roomIds } },
  });
  const inboxes = toPlainMany(inboxesRaw).filter(
    (inbox) =>
      asArray(inbox.ownersId).includes(userId) &&
      !asArray(inbox.deletedBy).includes(userId)
  );

  const senderIds = [
    ...new Set(inboxes.map((inbox) => inbox?.content?.from).filter(Boolean)),
  ];
  const profilesRaw = senderIds.length
    ? await ProfileModel.findAll({ where: { userId: { [Op.in]: senderIds } } })
    : [];
  const profileById = new Map(
    toPlainMany(profilesRaw).map((profile) => [profile.userId, profile])
  );
  const groupByRoom = new Map(groups.map((group) => [group.roomId, group]));

  const chats = inboxes
    .map((inbox) => mapChatItem({ inbox, groupByRoom, profileById, userId }))
    .sort(
      (a, b) =>
        new Date(b.content?.time || 0).getTime() -
        new Date(a.content?.time || 0).getTime()
    );

  const unreadChats = chats.filter((chat) => chat.unreadRooms);
  const previewChats = (unreadChats.length > 0 ? unreadChats : chats).slice(
    0,
    3
  );

  const unreadTotal = chats.reduce((sum, chat) => {
    if (!chat.unreadRooms) return sum;
    return sum + Math.max(1, Number(chat.unreadMessage || 0));
  }, 0);

  return {
    ...community,
    unreadTotal,
    previewChats,
    totalChats: chats.length,
  };
};

exports.findAll = async (req, res) => {
  try {
    const userId = req.user._id;
    const communitiesRaw = await CommunityModel.findAll();
    const communities = toPlainMany(communitiesRaw)
      .filter((community) => asArray(community.membersId).includes(userId))
      .sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );

    const payload = [];
    for (const community of communities) {
      // eslint-disable-next-line no-await-in-loop
      payload.push(await buildCommunityPayload(community, userId));
    }

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

exports.findChats = async (req, res) => {
  try {
    const userId = req.user._id;
    const community = await CommunityModel.findOne({
      where: { _id: req.params.communityId },
    });
    const communityPlain = toPlain(community);

    if (!communityPlain || !asArray(communityPlain.membersId).includes(userId)) {
      throw new Error('Community not found');
    }

    const groupsRaw = await GroupModel.findAll({
      attributes: { exclude: ['passwordHash'] },
    });
    const groups = toPlainMany(groupsRaw).filter(
      (group) =>
        group.communityId === communityPlain._id &&
        asArray(group.participantsId).includes(userId)
    );
    const roomIds = groups.map((group) => group.roomId);
    const groupByRoom = new Map(groups.map((group) => [group.roomId, group]));

    if (roomIds.length === 0) {
      response({ res, payload: [] });
      return;
    }

    const inboxesRaw = await InboxModel.findAll({
      where: { roomId: { [Op.in]: roomIds } },
    });
    const inboxes = toPlainMany(inboxesRaw).filter(
      (inbox) =>
        asArray(inbox.ownersId).includes(userId) &&
        !asArray(inbox.deletedBy).includes(userId)
    );

    const senderIds = [
      ...new Set(inboxes.map((inbox) => inbox?.content?.from).filter(Boolean)),
    ];
    const profilesRaw = senderIds.length
      ? await ProfileModel.findAll({
          where: { userId: { [Op.in]: senderIds } },
        })
      : [];
    const profileById = new Map(
      toPlainMany(profilesRaw).map((profile) => [profile.userId, profile])
    );

    const payload = inboxes
      .map((inbox) => mapChatItem({ inbox, groupByRoom, profileById, userId }))
      .sort(
        (a, b) =>
          new Date(b.content?.time || 0).getTime() -
          new Date(a.content?.time || 0).getTime()
      );

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

exports.create = async (req, res) => {
  try {
    const userId = req.user._id;
    const name = String(req.body?.name || '').trim();
    const avatar = req.body?.avatar || null;

    if (name.length < 3 || name.length > 64) {
      throw new Error('Community name must be between 3 and 64 characters');
    }

    let avatarUrl = null;
    if (avatar) {
      const { buffer } = parseDataUri(avatar);
      const processedBuffer = await sharp(buffer)
        .resize(460, 460, { fit: 'cover' })
        .webp({ quality: 90 })
        .toBuffer();

      const uploaded = await saveBufferFile({
        buffer: processedBuffer,
        folder: 'avatars',
        filename: `community-${uuidv4()}-${Date.now()}.webp`,
      });
      avatarUrl = uploaded.url;
    }

    const community = await CommunityModel.create({
      name,
      avatar: avatarUrl,
      adminId: userId,
      membersId: [userId],
    });
    const communityPlain = toPlain(community);

    const adminProfile = await ProfileModel.findOne({
      where: { userId },
      attributes: ['fullname', 'avatar'],
    });
    const senderName = adminProfile?.fullname || 'Admin';

    const systemGroups = [
      `${name} Announcements`,
      `${name} General`,
    ];

    for (const groupName of systemGroups) {
      const roomId = `group-${uuidv4()}`;
      // eslint-disable-next-line no-await-in-loop
      const group = await GroupModel.create({
        roomId,
        adminId: userId,
        adminsId: [userId],
        participantsId: [userId],
        communityId: communityPlain._id,
        name: groupName,
        desc: `${name} community channel`,
      });

      // eslint-disable-next-line no-await-in-loop
      await InboxModel.create({
        ownersId: [userId],
        roomId,
        roomType: 'group',
        content: {
          senderName,
          from: userId,
          text: 'group created',
          time: new Date().toISOString(),
          delivered: true,
          readed: true,
        },
      });

      // eslint-disable-next-line no-await-in-loop
      await ChatModel.create({
        userId,
        roomId,
        text: buildGroupInfoText({
          groupName: group.name,
          createdBy: senderName,
          totalParticipants: 1,
          icon: '\ud83d\udc65',
          accessType: group.accessType || 'public',
        }),
        replyTo: null,
        fileId: null,
        readed: false,
        delivered: false,
        deletedBy: [],
        reactions: {},
      });
    }

    const payload = await buildCommunityPayload(communityPlain, userId);
    response({
      res,
      statusCode: 201,
      message: 'Community created successfully',
      payload,
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

exports.createGroup = async (req, res) => {
  try {
    const userId = req.user._id;
    const communityId = req.params.communityId;
    const name = String(req.body?.name || '').trim();
    const desc = String(req.body?.desc || '').trim();
    const participantIdsRaw = Array.isArray(req.body?.participantsId)
      ? req.body.participantsId
      : [];
    const identities = Array.isArray(req.body?.identities)
      ? req.body.identities
      : [];

    if (name.length < 3 || name.length > 32) {
      throw new Error('Group name must be between 3 and 32 characters');
    }
    if (desc.length > 300) {
      throw new Error('Description too long (max 300)');
    }

    const community = await CommunityModel.findOne({
      where: { _id: communityId },
    });
    const communityPlain = toPlain(community);
    if (!communityPlain) throw new Error('Community not found');
    if (!asArray(communityPlain.membersId).includes(userId)) {
      throw new Error('You are not a member of this community');
    }

    const resolvedByIdentity = [];
    for (const identity of identities) {
      // eslint-disable-next-line no-await-in-loop
      const friendId = await resolveUserIdByIdentity(identity);
      if (friendId) resolvedByIdentity.push(friendId);
    }

    const participantsId = addToSet(
      [userId],
      [...participantIdsRaw, ...resolvedByIdentity]
    );

    if (participantsId.length < 1) {
      throw new Error('Invalid participants');
    }

    const roomId = `group-${uuidv4()}`;
    const group = await GroupModel.create({
      roomId,
      adminId: userId,
      adminsId: [userId],
      participantsId,
      communityId,
      name,
      desc,
    });
    const groupPlain = toPlain(group);
    if (groupPlain) delete groupPlain.passwordHash;

    const adminProfile = await ProfileModel.findOne({
      where: { userId },
      attributes: ['fullname', 'avatar'],
    });
    const senderName = adminProfile?.fullname || 'Admin';

    await InboxModel.create({
      ownersId: participantsId,
      roomId,
      roomType: 'group',
      content: {
        senderName,
        from: userId,
        text: 'group created',
        time: new Date().toISOString(),
        delivered: true,
        readed: false,
      },
    });

    const chatDoc = await ChatModel.create({
      userId,
      roomId,
      text: buildGroupInfoText({
        groupName: groupPlain.name,
        createdBy: senderName,
        totalParticipants: participantsId.length,
        icon: '\ud83d\udc65',
        accessType: groupPlain.accessType || 'public',
      }),
      replyTo: null,
      fileId: null,
      readed: false,
      delivered: false,
      deletedBy: [],
      reactions: {},
    });
    const createdChat = toPlain(chatDoc);
    global.io.to(roomId).emit('chat/insert', {
      ...createdChat,
      profile: {
        userId,
        fullname: senderName,
        avatar: adminProfile?.avatar || null,
      },
      file: null,
      reply: null,
      poll: null,
    });

    const nextMembersId = addToSet(communityPlain.membersId, participantsId);
    await community.update({ membersId: nextMembersId });

    const inboxes = await Inbox.find({ roomId });
    if (inboxes[0]) {
      global.io.to(participantsId).emit('group/create', inboxes[0]);
    }

    response({
      res,
      statusCode: 201,
      message: 'Group created in community',
      payload: {
        group: groupPlain,
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


