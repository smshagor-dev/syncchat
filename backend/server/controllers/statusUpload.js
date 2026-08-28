const StatusModel = require('../db/models/status');
const ContactModel = require('../db/models/contact');
const ProfileModel = require('../db/models/profile');
const ResumableUploadModel = require('../db/models/resumableUpload');
const { toPlainMany } = require('../db/utils');
const response = require('../helpers/response');
const { loadAppConfig } = require('../helpers/appConfig');
const { toAbsoluteUploadUrl } = require('../helpers/storage');

const STATUS_LIFETIME_MS = 24 * 60 * 60 * 1000;

const unique = (values = []) => [...new Set(values.filter(Boolean))];

const httpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const ensureStatusEnabled = async () => {
  const config = await loadAppConfig();
  if (config?.featureFlags?.status === false) {
    throw httpError(403, 'Status is disabled');
  }
};

const sanitizeMentions = (values = []) =>
  unique(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || '').trim().toLowerCase())
      .filter((value) => /^[a-z0-9_]{3,24}$/.test(value))
  );

const mentionsFromText = (text = '') =>
  unique(
    String(text)
      .match(/@[a-z0-9_]{3,24}/gi)
      ?.map((value) => value.slice(1).toLowerCase()) || []
  );

const friendIdsFor = async (userId) => {
  const rows = await ContactModel.findAll({
    where: { userId },
    attributes: ['friendId'],
  });
  return unique(toPlainMany(rows).map((row) => row.friendId));
};

const emitStatus = async ({ ownerId, payload }) => {
  if (!global?.io) return;
  const friendIds = await friendIdsFor(ownerId);
  for (const target of unique([ownerId, ...friendIds])) {
    global.io.to(target).emit('status/new', payload);
  }
};

exports.insertFromUpload = async (req, res) => {
  try {
    await ensureStatusEnabled();

    const type = String(req.body?.type || '').trim().toLowerCase();
    if (!['photo', 'video'].includes(type)) {
      throw httpError(400, 'Uploaded status type must be photo or video');
    }

    const uploadId = String(req.body?.mediaUploadId || '').trim();
    if (!uploadId) throw httpError(400, 'Status media upload ID is required');

    const upload = await ResumableUploadModel.findOne({
      where: { uploadId, userId: req.user._id },
    });
    if (!upload || upload.status !== 'complete') {
      throw httpError(404, 'Completed status media upload was not found');
    }

    const uploadPlain = upload.get({ plain: true });
    const uploaded =
      uploadPlain.result && typeof uploadPlain.result === 'object'
        ? uploadPlain.result
        : {};
    const mediaUrl = String(uploaded.url || '').trim();
    const detectedType = String(uploaded.type || '').trim().toLowerCase();
    if (!mediaUrl) throw httpError(409, 'Completed upload has no media URL');
    if (type === 'photo' && detectedType !== 'image') {
      throw httpError(415, 'Status media type mismatch');
    }
    if (type === 'video' && detectedType !== 'video') {
      throw httpError(415, 'Status media type mismatch');
    }

    const cleanText = String(req.body?.text || '').trim();
    const bgColor = String(req.body?.bgColor || '#0ea5e9').slice(0, 32);
    const mentionUsernames = unique([
      ...mentionsFromText(cleanText),
      ...sanitizeMentions(req.body?.mentions),
    ]);

    let mentionUserIds = [];
    if (mentionUsernames.length > 0) {
      const friendIds = await friendIdsFor(req.user._id);
      const mentionedProfiles = friendIds.length
        ? await ProfileModel.findAll({
            where: {
              userId: { [require('sequelize').Op.in]: friendIds },
              username: { [require('sequelize').Op.in]: mentionUsernames },
            },
            attributes: ['userId'],
          })
        : [];
      mentionUserIds = unique(
        toPlainMany(mentionedProfiles).map((profile) => profile.userId)
      );
    }

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
      expiresAt: new Date(Date.now() + STATUS_LIFETIME_MS),
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

    // The persisted status now owns the stored media. The temporary upload
    // session is no longer needed; its chunks were already removed on complete.
    await ResumableUploadModel.destroy({
      where: { uploadId, userId: req.user._id },
    }).catch(() => {});

    await emitStatus({ ownerId: req.user._id, payload }).catch(() => {});

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
