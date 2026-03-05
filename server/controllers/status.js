const { Op } = require('sequelize');
const { randomUUID } = require('crypto');
const StatusModel = require('../db/models/status');
const ContactModel = require('../db/models/contact');
const ProfileModel = require('../db/models/profile');
const InboxModel = require('../db/models/inbox');
const ChatModel = require('../db/models/chat');
const { toPlainMany, toPlain, asArray } = require('../db/utils');
const response = require('../helpers/response');
const Inbox = require('../helpers/models/inbox');
const uniqueId = require('../helpers/uniqueId');
const {
  parseDataUri,
  saveBufferFile,
  deleteLocalFileByUrl,
  toAbsoluteUploadUrl,
} = require('../helpers/storage');

const STATUS_LIFETIME_MS = 24 * 60 * 60 * 1000;
const toHttpError = (statusCode, message) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

const extByMime = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

const unique = (arr = []) => [...new Set(arr)];

const extractMentionUsernames = (text = '') =>
  unique(
    String(text)
      .match(/@[a-z0-9_]{3,24}/gi)
      ?.map((tag) => tag.slice(1).toLowerCase()) || []
  );

const sanitizeMentions = (mentions = []) =>
  unique(
    asArray(mentions)
      .map((item) =>
        String(item || '')
          .trim()
          .toLowerCase()
      )
      .filter((item) => /^[a-z0-9_]{3,24}$/.test(item))
  );

const getAllowedFriends = async (userId) => {
  const contacts = await ContactModel.findAll({
    where: { userId },
    attributes: ['friendId'],
  });
  return unique(toPlainMany(contacts).map((item) => item.friendId));
};

const emitStatusUpdate = async ({
  ownerId,
  payload,
  event = 'status/update',
}) => {
  try {
    const friendIds = await getAllowedFriends(ownerId);
    const targets = unique([ownerId, ...friendIds]);
    if (targets.length > 0) {
      global.io.to(targets).emit(event, payload);
    }
  } catch (error0) {
    // eslint-disable-next-line no-console
    console.error(error0?.message || 'status socket emit failed');
  }
};

const resolvePrivateInbox = async ({ senderId, receiverId }) => {
  const allPrivate = await InboxModel.findAll({
    where: { roomType: 'private' },
  });
  const list = toPlainMany(allPrivate);
  const matches = list.filter((item) => {
    const owners = asArray(item.ownersId);
    return (
      owners.length === 2 &&
      owners.includes(senderId) &&
      owners.includes(receiverId)
    );
  });
  const existing = matches
    .sort((a, b) => {
      const aDeletedScore = asArray(a.deletedBy).includes(senderId) ? -1 : 0;
      const bDeletedScore = asArray(b.deletedBy).includes(senderId) ? -1 : 0;
      if (aDeletedScore !== bDeletedScore) return bDeletedScore - aDeletedScore;

      const aTime = new Date(a.content?.time || a.createdAt || 0).getTime();
      const bTime = new Date(b.content?.time || b.createdAt || 0).getTime();
      return bTime - aTime;
    })
    .at(0);

  if (existing) return existing;

  const created = await InboxModel.create({
    ownersId: [senderId, receiverId],
    roomId: uniqueId(20),
    roomType: 'private',
    unreadMessage: 0,
    deletedBy: [],
    content: {
      from: null,
      senderName: '',
      text: '',
      time: new Date().toISOString(),
      delivered: false,
      readed: false,
    },
  });

  return created.get({ plain: true });
};

const relayStatusInteractionToChat = async ({
  senderId,
  receiverId,
  text,
  kind = 'reply',
}) => {
  if (!senderId || !receiverId || !text || senderId === receiverId) return;

  const [senderProfileDoc, inbox] = await Promise.all([
    ProfileModel.findOne({
      where: { userId: senderId },
      attributes: ['userId', 'avatar', 'fullname'],
    }),
    resolvePrivateInbox({ senderId, receiverId }),
  ]);
  const senderProfile = senderProfileDoc
    ? senderProfileDoc.get({ plain: true })
    : null;

  const existingRelayChat =
    kind === 'react'
      ? await ChatModel.findOne({
          where: {
            roomId: inbox.roomId,
            userId: senderId,
            text: {
              [Op.like]: 'Reacted to your status %',
            },
          },
          order: [['createdAt', 'DESC']],
        })
      : null;

  const relayText = text;

  let chat = null;
  if (
    existingRelayChat &&
    String(toPlain(existingRelayChat)?.text || '')
      .toLowerCase()
      .startsWith('reacted to your status')
  ) {
    await existingRelayChat.update({
      text: relayText,
      replyTo: null,
      delivered: false,
      readed: false,
    });
    chat = toPlain(existingRelayChat);
  } else {
    const chatDoc = await ChatModel.create({
      userId: senderId,
      roomId: inbox.roomId,
      text: relayText,
      replyTo: null,
      fileId: null,
      readed: false,
      delivered: false,
      deletedBy: [],
      reactions: {},
    });
    chat = chatDoc.get({ plain: true });
  }

  const inboxDoc = await InboxModel.findOne({ where: { roomId: inbox.roomId } });
  if (inboxDoc) {
    await inboxDoc.update({
      ownersId: [senderId, receiverId],
      unreadMessage: Number(inboxDoc.unreadMessage || 0) + 1,
      content: {
        from: senderId,
        senderName: senderProfile?.fullname || '',
        text,
        time: chat.createdAt,
        delivered: !!chat.delivered,
        readed: false,
      },
    });
  }

  const payload = {
    ...chat,
    profile: senderProfile,
    file: null,
    reply: null,
  };
  const inboxRows = await Inbox.find({ roomId: inbox.roomId });

  if (existingRelayChat && kind === 'react') {
    global.io.to(inbox.roomId).emit('chat/relay-update', {
      chatId: chat._id,
      text: relayText,
      replyTo: null,
      updatedAt: new Date().toISOString(),
    });
  } else {
    global.io.to(inbox.roomId).emit('chat/insert', payload);
  }
  if (inboxRows[0]) {
    global.io.to([senderId, receiverId]).emit('inbox/find', inboxRows[0]);
  }
};

const nowDate = () => new Date();

const mapStatusPayload = ({ item, profileMap, currentUserId }) => {
  const views = asArray(item.views).filter((entry) => entry?.userId);
  const reactions = asArray(item.reactions).filter(
    (entry) => entry?.userId && entry?.emoji
  );
  const replies = asArray(item.replies).filter(
    (entry) => entry?.userId && String(entry?.text || '').trim()
  );

  const myReaction =
    reactions.find((entry) => entry.userId === currentUserId)?.emoji || null;
  const hasViewed = views.some((entry) => entry.userId === currentUserId);

  return {
    ...item,
    mediaUrl: toAbsoluteUploadUrl(item.mediaUrl),
    profile: profileMap.get(item.userId) || null,
    mentions: asArray(item.mentionUserIds)
      .map((id) => profileMap.get(id))
      .filter(Boolean),
    isMine: item.userId === currentUserId,
    viewCount: views.length,
    replyCount: replies.length,
    reactionCount: reactions.length,
    myReaction,
    hasViewed,
  };
};

const getVisibleStatus = async ({ statusId, userId }) => {
  const now = nowDate();
  const friendIds = await getAllowedFriends(userId);
  const visibleUserIds = unique([userId, ...friendIds]);

  const statusDoc = await StatusModel.findOne({
    where: {
      _id: statusId,
      userId: { [Op.in]: visibleUserIds },
      expiresAt: { [Op.gt]: now },
    },
  });

  if (!statusDoc) {
    throw toHttpError(404, 'Status not found');
  }

  return statusDoc;
};

exports.find = async (req, res) => {
  try {
    const now = nowDate();

    const expired = await StatusModel.findAll({
      where: {
        expiresAt: { [Op.lte]: now },
      },
      attributes: ['_id', 'mediaUrl'],
    });
    if (expired.length > 0) {
      const expiredPlain = toPlainMany(expired);
      await Promise.all(
        expiredPlain.map((item) => deleteLocalFileByUrl(item.mediaUrl))
      );
      await StatusModel.destroy({
        where: { _id: { [Op.in]: expiredPlain.map((item) => item._id) } },
      });
    }

    const friendIds = await getAllowedFriends(req.user._id);
    const visibleUserIds = unique([req.user._id, ...friendIds]);

    const statuses = await StatusModel.findAll({
      where: {
        userId: { [Op.in]: visibleUserIds },
        expiresAt: { [Op.gt]: now },
      },
      order: [['createdAt', 'DESC']],
    });

    const list = toPlainMany(statuses);
    const profileUserIds = unique(list.map((item) => item.userId));
    const mentionUserIds = unique(
      list.flatMap((item) => asArray(item.mentionUserIds))
    );
    const allProfileIds = unique([...profileUserIds, ...mentionUserIds]);

    const profiles = allProfileIds.length
      ? await ProfileModel.findAll({
          where: { userId: { [Op.in]: allProfileIds } },
          attributes: [
            'userId',
            'username',
            'fullname',
            'avatar',
            'online',
            'updatedAt',
          ],
        })
      : [];

    const profileMap = new Map(
      toPlainMany(profiles).map((profile) => [
        profile.userId,
        {
          ...profile,
          avatar: toAbsoluteUploadUrl(profile.avatar),
        },
      ])
    );

    const payload = list.map((item) =>
      mapStatusPayload({
        item,
        profileMap,
        currentUserId: req.user._id,
      })
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

exports.insert = async (req, res) => {
  try {
    const {
      type = 'text',
      text = '',
      bgColor = '#0ea5e9',
      mediaDataUrl = null,
      mentions = [],
    } = req.body || {};

    if (!['text', 'photo', 'video'].includes(type)) {
      throw toHttpError(400, 'Invalid status type');
    }

    const cleanText = String(text || '').trim();
    if (type === 'text' && !cleanText) {
      throw toHttpError(400, 'Text is required for text status');
    }

    let mediaUrl = null;
    if (['photo', 'video'].includes(type)) {
      if (!mediaDataUrl) {
        throw toHttpError(400, 'Media is required for this status type');
      }

      const { mime, buffer } = parseDataUri(mediaDataUrl);
      const isImage = mime.startsWith('image/');
      const isVideo = mime.startsWith('video/');

      if ((type === 'photo' && !isImage) || (type === 'video' && !isVideo)) {
        throw toHttpError(400, 'Status media type mismatch');
      }

      const ext = extByMime[mime] || mime.split('/')[1]?.split(';')[0] || 'bin';
      const upload = await saveBufferFile({
        buffer,
        folder: 'status',
        filename: `${req.user._id}-${Date.now()}.${ext}`,
      });

      mediaUrl = upload.url;
    }

    const mentionUsernames = unique([
      ...extractMentionUsernames(cleanText),
      ...sanitizeMentions(mentions),
    ]);

    let mentionUserIds = [];
    if (mentionUsernames.length > 0) {
      const friendIds = await getAllowedFriends(req.user._id);
      const mentionedProfiles = friendIds.length
        ? await ProfileModel.findAll({
            where: {
              userId: { [Op.in]: friendIds },
              username: { [Op.in]: mentionUsernames },
            },
            attributes: ['userId', 'username'],
          })
        : [];

      mentionUserIds = unique(
        toPlainMany(mentionedProfiles).map((profile) => profile.userId)
      );
    }

    const expiresAt = new Date(Date.now() + STATUS_LIFETIME_MS);
    const created = await StatusModel.create({
      userId: req.user._id,
      type,
      text: cleanText,
      bgColor,
      mediaUrl,
      mentionUserIds,
      views: [],
      reactions: [],
      replies: [],
      expiresAt,
    });

    const profile = await ProfileModel.findOne({
      where: { userId: req.user._id },
      attributes: [
        'userId',
        'username',
        'fullname',
        'avatar',
        'online',
        'updatedAt',
      ],
    });

    const payload = {
      ...created.get({ plain: true }),
      mediaUrl: toAbsoluteUploadUrl(created.mediaUrl),
      profile: profile
        ? {
            ...profile.get({ plain: true }),
            avatar: toAbsoluteUploadUrl(profile.avatar),
          }
        : null,
      mentions: [],
      isMine: true,
      viewCount: 0,
      replyCount: 0,
      reactionCount: 0,
      myReaction: null,
      hasViewed: true,
    };

    await emitStatusUpdate({
      ownerId: req.user._id,
      event: 'status/new',
      payload,
    });

    response({
      res,
      statusCode: 201,
      message: 'Status posted',
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

exports.markViewed = async (req, res) => {
  try {
    const { statusId } = req.params;
    const statusDoc = await getVisibleStatus({
      statusId,
      userId: req.user._id,
    });

    const plain = statusDoc.get({ plain: true });
    const views = asArray(plain.views).filter((entry) => entry?.userId);

    if (plain.userId !== req.user._id) {
      const index = views.findIndex((entry) => entry.userId === req.user._id);
      const nowIso = nowDate().toISOString();
      if (index >= 0) {
        views[index] = {
          ...views[index],
          viewedAt: nowIso,
        };
      } else {
        views.push({
          _id: randomUUID(),
          userId: req.user._id,
          viewedAt: nowIso,
        });
      }
      await statusDoc.update({ views });
    }

    response({
      res,
      message: 'Status viewed',
      payload: {
        statusId: plain._id,
        viewCount: plain.userId === req.user._id ? views.length : views.length,
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

exports.react = async (req, res) => {
  try {
    const { statusId } = req.params;
    const { emoji = '' } = req.body || {};

    const cleanEmoji = String(emoji || '').trim().slice(0, 16);

    const statusDoc = await getVisibleStatus({
      statusId,
      userId: req.user._id,
    });
    const plain = statusDoc.get({ plain: true });

    const reactions = asArray(plain.reactions).filter(
      (entry) => entry?.userId && entry?.emoji
    );

    const next = [...reactions];
    if (cleanEmoji) {
      next.push({
        _id: randomUUID(),
        userId: req.user._id,
        emoji: cleanEmoji,
        createdAt: nowDate().toISOString(),
      });
    }

    await statusDoc.update({ reactions: next });

    if (cleanEmoji) {
      await relayStatusInteractionToChat({
        senderId: req.user._id,
        receiverId: plain.userId,
        text: `Reacted to your status ${cleanEmoji}`,
        kind: 'react',
      });
    }

    await emitStatusUpdate({
      ownerId: plain.userId,
      payload: {
        type: 'react',
        statusId: plain._id,
        actorId: req.user._id,
        reactionCount: next.length,
        myReaction: cleanEmoji || null,
      },
    });

    response({
      res,
      message: cleanEmoji ? 'Reaction saved' : 'Reaction removed',
      payload: {
        statusId: plain._id,
        myReaction: cleanEmoji || null,
        reactionCount: next.length,
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

exports.reply = async (req, res) => {
  try {
    const { statusId } = req.params;
    const { text = '' } = req.body || {};

    const cleanText = String(text || '').trim();
    if (!cleanText) {
      throw toHttpError(400, 'Reply text is required');
    }
    if (cleanText.length > 500) {
      throw toHttpError(400, 'Reply text is too long');
    }

    const statusDoc = await getVisibleStatus({
      statusId,
      userId: req.user._id,
    });
    const plain = statusDoc.get({ plain: true });

    const replies = asArray(plain.replies).filter(
      (entry) => entry?.userId && String(entry?.text || '').trim()
    );

    replies.push({
      _id: randomUUID(),
      userId: req.user._id,
      text: cleanText,
      createdAt: nowDate().toISOString(),
    });

    await statusDoc.update({ replies });

    await relayStatusInteractionToChat({
      senderId: req.user._id,
      receiverId: plain.userId,
      text: `Replied to your status: ${cleanText}`,
      kind: 'reply',
    });

    await emitStatusUpdate({
      ownerId: plain.userId,
      payload: {
        type: 'reply',
        statusId: plain._id,
        actorId: req.user._id,
        replyCount: replies.length,
        text: cleanText,
      },
    });

    response({
      res,
      message: 'Reply sent',
      payload: {
        statusId: plain._id,
        replyCount: replies.length,
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

exports.activity = async (req, res) => {
  try {
    const { statusId } = req.params;

    const statusDoc = await StatusModel.findOne({
      where: {
        _id: statusId,
        userId: req.user._id,
        expiresAt: { [Op.gt]: nowDate() },
      },
    });

    if (!statusDoc) {
      throw toHttpError(404, 'Status not found');
    }

    const plain = statusDoc.get({ plain: true });
    const views = asArray(plain.views).filter((entry) => entry?.userId);
    const reactions = asArray(plain.reactions).filter(
      (entry) => entry?.userId && entry?.emoji
    );
    const replies = asArray(plain.replies).filter(
      (entry) => entry?.userId && String(entry?.text || '').trim()
    );

    const userIds = unique([
      ...views.map((entry) => entry.userId),
      ...reactions.map((entry) => entry.userId),
      ...replies.map((entry) => entry.userId),
    ]);

    const profiles = userIds.length
      ? await ProfileModel.findAll({
          where: { userId: { [Op.in]: userIds } },
          attributes: ['userId', 'username', 'fullname', 'avatar'],
        })
      : [];

    const profileMap = new Map(
      toPlainMany(profiles).map((profile) => [
        profile.userId,
        {
          ...profile,
          avatar: toAbsoluteUploadUrl(profile.avatar),
        },
      ])
    );

    const payload = {
      statusId: plain._id,
      counts: {
        views: views.length,
        reactions: reactions.length,
        replies: replies.length,
      },
      views: views
        .map((entry) => ({
          ...entry,
          profile: profileMap.get(entry.userId) || null,
        }))
        .sort(
          (a, b) =>
            new Date(b.viewedAt || b.createdAt || 0).getTime() -
            new Date(a.viewedAt || a.createdAt || 0).getTime()
        ),
      reactions: reactions
        .map((entry) => ({
          ...entry,
          profile: profileMap.get(entry.userId) || null,
        }))
        .sort(
          (a, b) =>
            new Date(b.createdAt || 0).getTime() -
            new Date(a.createdAt || 0).getTime()
        ),
      replies: replies
        .map((entry) => ({
          ...entry,
          profile: profileMap.get(entry.userId) || null,
        }))
        .sort(
          (a, b) =>
            new Date(b.createdAt || 0).getTime() -
            new Date(a.createdAt || 0).getTime()
        ),
    };

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

exports.deleteById = async (req, res) => {
  try {
    const { statusId } = req.params;
    const status = await StatusModel.findOne({
      where: { _id: statusId, userId: req.user._id },
    });

    if (!status) {
      throw toHttpError(404, 'Status not found');
    }

    await deleteLocalFileByUrl(status.mediaUrl);
    await status.destroy();

    response({
      res,
      message: 'Status deleted',
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
