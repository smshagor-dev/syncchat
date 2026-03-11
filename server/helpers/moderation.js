const { Op } = require('sequelize');
const ChatModel = require('../db/models/chat');
const ReportModel = require('../db/models/report');
const { asArray, toPlain } = require('../db/utils');
const { isGroupAdminUser } = require('./groupAdmins');

const DEFAULT_MODERATION_SETTINGS = {
  slowModeSeconds: 0,
  bannedWords: [],
  blockedMediaTypes: [],
  autoReportViolations: true,
};

const normalizeWordList = (value) =>
  [...new Set(
    asArray(value)
      .map((item) => String(item || '').trim().toLowerCase())
      .filter(Boolean)
  )];

const normalizeMediaTypes = (value) =>
  [...new Set(
    asArray(value)
      .map((item) => String(item || '').trim().toLowerCase())
      .filter((item) =>
        ['image', 'video', 'audio', 'document'].includes(item)
      )
  )];

const normalizeModerationSettings = (raw) => {
  const source = raw && typeof raw === 'object' ? raw : {};
  const slowModeSeconds = Math.max(
    0,
    Math.min(3600, Number(source.slowModeSeconds || 0) || 0)
  );

  return {
    slowModeSeconds,
    bannedWords: normalizeWordList(source.bannedWords),
    blockedMediaTypes: normalizeMediaTypes(source.blockedMediaTypes),
    autoReportViolations: source.autoReportViolations !== false,
  };
};

const getModerationSettings = (entity) => ({
  ...DEFAULT_MODERATION_SETTINGS,
  ...normalizeModerationSettings(toPlain(entity)?.moderation),
});

const getNormalizedFileType = (file) => {
  const explicit = String(file?.type || '').trim().toLowerCase();
  if (['image', 'video', 'audio'].includes(explicit)) return explicit;
  if (explicit) return 'document';
  return '';
};

const findMatchedWord = (text, bannedWords) => {
  const normalizedText = String(text || '').toLowerCase();
  return bannedWords.find((word) => normalizedText.includes(word)) || null;
};

const createModerationError = ({ statusCode, code, message, details = {} }) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  error.details = details;
  return error;
};

const createAutoModerationReport = async ({
  senderId,
  roomId,
  roomType,
  category,
  reason,
  meta = {},
}) => {
  try {
    await ReportModel.create({
      reporterId: senderId,
      roomId,
      roomType,
      targetId: senderId,
      reportedUserId: senderId,
      category,
      source: 'auto',
      reason,
      status: 'open',
      meta,
    });
  } catch (error0) {
    // Ignore report creation failures so moderation still blocks.
  }
};

const enforceModerationForMessage = async ({
  roomEntity,
  roomId,
  roomType = 'group',
  senderId,
  text = '',
  file = null,
}) => {
  const entity = toPlain(roomEntity);
  if (!entity || !roomId || !senderId) return null;
  if (isGroupAdminUser({ group: entity, userId: senderId })) return null;

  const moderation = getModerationSettings(entity);
  const matchedWord =
    moderation.bannedWords.length > 0
      ? findMatchedWord(text, moderation.bannedWords)
      : null;
  if (matchedWord) {
    if (moderation.autoReportViolations) {
      await createAutoModerationReport({
        senderId,
        roomId,
        roomType,
        category: 'banned-word',
        reason: `Blocked message because it contains banned word "${matchedWord}"`,
        meta: { matchedWord },
      });
    }
    throw createModerationError({
      statusCode: 403,
      code: 'banned_word',
      message: 'This message contains a banned word',
      details: { matchedWord },
    });
  }

  const fileType = getNormalizedFileType(file);
  if (fileType && moderation.blockedMediaTypes.includes(fileType)) {
    if (moderation.autoReportViolations) {
      await createAutoModerationReport({
        senderId,
        roomId,
        roomType,
        category: 'blocked-media',
        reason: `Blocked ${fileType} upload by auto moderation`,
        meta: { fileType },
      });
    }
    throw createModerationError({
      statusCode: 403,
      code: 'blocked_media',
      message: `${fileType[0].toUpperCase()}${fileType.slice(1)} uploads are blocked here`,
      details: { fileType },
    });
  }

  if (moderation.slowModeSeconds > 0) {
    const latestChat = await ChatModel.findOne({
      where: {
        roomId,
        userId: senderId,
        createdAt: {
          [Op.gte]: new Date(Date.now() - moderation.slowModeSeconds * 1000),
        },
      },
      order: [['createdAt', 'DESC']],
      attributes: ['createdAt'],
    });

    if (latestChat) {
      const nextAllowedAt =
        new Date(latestChat.createdAt).getTime() +
        moderation.slowModeSeconds * 1000;
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((nextAllowedAt - Date.now()) / 1000)
      );
      throw createModerationError({
        statusCode: 429,
        code: 'slow_mode',
        message: `Slow mode is on. Try again in ${retryAfterSeconds}s`,
        details: {
          slowModeSeconds: moderation.slowModeSeconds,
          retryAfterSeconds,
        },
      });
    }
  }

  return moderation;
};

module.exports = {
  DEFAULT_MODERATION_SETTINGS,
  normalizeModerationSettings,
  getModerationSettings,
  enforceModerationForMessage,
};
