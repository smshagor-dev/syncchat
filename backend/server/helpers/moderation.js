const { Op } = require('sequelize');
const ChatModel = require('../db/models/chat');
const ReportModel = require('../db/models/report');
const AdminModerationConfigModel = require('../db/models/adminModerationConfig');
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

const normalizePresetList = (value) =>
  [...new Set(
    asArray(value)
      .map((item) => Math.max(0, Math.min(3600, Number(item) || 0)))
      .filter((item) => Number.isFinite(item))
  )].sort((a, b) => a - b);

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

let cachedGlobalConfig = null;
let cachedGlobalAt = 0;
const GLOBAL_CONFIG_TTL_MS = 60 * 1000;

const loadGlobalModerationConfig = async () => {
  const now = Date.now();
  if (cachedGlobalConfig && now - cachedGlobalAt < GLOBAL_CONFIG_TTL_MS) {
    return cachedGlobalConfig;
  }

  const [row] = await AdminModerationConfigModel.findOrCreate({
    where: {},
    defaults: {
      bannedWords: [],
      blockedMediaTypes: [],
      slowModePresets: [0, 10, 30, 60, 120],
      autoReportViolations: true,
    },
  });

  const plain = row?.get ? row.get({ plain: true }) : row;
  const normalized = {
    bannedWords: normalizeWordList(plain?.bannedWords),
    blockedMediaTypes: normalizeMediaTypes(plain?.blockedMediaTypes),
    slowModePresets: normalizePresetList(plain?.slowModePresets),
    autoReportViolations: plain?.autoReportViolations !== false,
  };

  cachedGlobalConfig = normalized;
  cachedGlobalAt = now;
  return normalized;
};

const getActiveMuteEntry = ({ mutedUsers = [], userId }) => {
  const now = Date.now();
  const entries = asArray(mutedUsers)
    .map((entry) => ({
      userId: entry?.userId || entry?.id || entry,
      expiresAt: entry?.expiresAt || null,
    }))
    .filter((entry) => entry.userId);

  return entries.find((entry) => {
    if (String(entry.userId) !== String(userId)) return false;
    if (!entry.expiresAt) return true;
    return new Date(entry.expiresAt).getTime() > now;
  });
};

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

  const [globalConfig, moderation] = await Promise.all([
    loadGlobalModerationConfig(),
    getModerationSettings(entity),
  ]);

  const merged = {
    ...moderation,
    bannedWords: [
      ...new Set([
        ...normalizeWordList(globalConfig?.bannedWords),
        ...normalizeWordList(moderation?.bannedWords),
      ]),
    ],
    blockedMediaTypes: [
      ...new Set([
        ...normalizeMediaTypes(globalConfig?.blockedMediaTypes),
        ...normalizeMediaTypes(moderation?.blockedMediaTypes),
      ]),
    ],
    autoReportViolations:
      moderation?.autoReportViolations !== false &&
      globalConfig?.autoReportViolations !== false,
  };

  const mutedEntry = getActiveMuteEntry({
    mutedUsers: entity?.mutedUserIds,
    userId: senderId,
  });
  if (mutedEntry) {
    throw createModerationError({
      statusCode: 403,
      code: 'muted',
      message: 'You are muted in this room',
      details: { expiresAt: mutedEntry.expiresAt || null },
    });
  }

  const matchedWord =
    merged.bannedWords.length > 0
      ? findMatchedWord(text, merged.bannedWords)
      : null;
  if (matchedWord) {
    if (merged.autoReportViolations) {
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
  if (fileType && merged.blockedMediaTypes.includes(fileType)) {
    if (merged.autoReportViolations) {
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

  if (merged.slowModeSeconds > 0) {
    const latestChat = await ChatModel.findOne({
      where: {
        roomId,
        userId: senderId,
        createdAt: {
          [Op.gte]: new Date(Date.now() - merged.slowModeSeconds * 1000),
        },
      },
      order: [['createdAt', 'DESC']],
      attributes: ['createdAt'],
    });

    if (latestChat) {
      const nextAllowedAt =
        new Date(latestChat.createdAt).getTime() +
        merged.slowModeSeconds * 1000;
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((nextAllowedAt - Date.now()) / 1000)
      );
      throw createModerationError({
        statusCode: 429,
        code: 'slow_mode',
        message: `Slow mode is on. Try again in ${retryAfterSeconds}s`,
        details: {
          slowModeSeconds: merged.slowModeSeconds,
          retryAfterSeconds,
        },
      });
    }
  }

  return merged;
};

module.exports = {
  DEFAULT_MODERATION_SETTINGS,
  normalizeModerationSettings,
  normalizePresetList,
  getModerationSettings,
  enforceModerationForMessage,
  loadGlobalModerationConfig,
};
