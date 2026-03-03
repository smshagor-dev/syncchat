const { Op } = require('sequelize');
const StatusModel = require('../db/models/status');
const ContactModel = require('../db/models/contact');
const ProfileModel = require('../db/models/profile');
const { toPlainMany, asArray } = require('../db/utils');
const response = require('../helpers/response');
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

exports.find = async (req, res) => {
  try {
    const now = new Date();

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

    const payload = list.map((item) => ({
      ...item,
      mediaUrl: toAbsoluteUploadUrl(item.mediaUrl),
      profile: profileMap.get(item.userId) || null,
      mentions: asArray(item.mentionUserIds)
        .map((id) => profileMap.get(id))
        .filter(Boolean),
      isMine: item.userId === req.user._id,
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
    };

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
