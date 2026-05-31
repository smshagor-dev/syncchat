const crypto = require('crypto');
const { Op } = require('sequelize');
const InboxModel = require('../db/models/inbox');
const ChatModel = require('../db/models/chat');
const { toPlain } = require('../db/utils');

const SECRET_TIMER_VALUES = [0, 10, 30, 60, 300, 3600, 86400];

const normalizeSecretTimer = (value) => {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return 0;
  if (SECRET_TIMER_VALUES.includes(parsed)) return parsed;
  return 0;
};

const createSecretSession = () => ({
  secretSessionId: crypto.randomUUID(),
  secretSessionKey: crypto.randomBytes(32).toString('hex'),
});

const ensureSecretSession = async (inboxLike) => {
  const plain = inboxLike?.get ? inboxLike.get({ plain: true }) : toPlain(inboxLike);
  if (!plain || !plain.roomType || plain.roomType !== 'private' || !plain.secretChatEnabled) {
    return plain;
  }
  if (plain.secretSessionId && plain.secretSessionKey) {
    return plain;
  }

  const session = createSecretSession();
  const target =
    inboxLike && typeof inboxLike.update === 'function'
      ? inboxLike
      : await InboxModel.findOne({ where: { roomId: plain.roomId } });

  if (!target) {
    return {
      ...plain,
      ...session,
    };
  }

  await target.update(session);
  return target.get({ plain: true });
};

const getSecretRoomState = async (roomId) => {
  if (!roomId) return null;
  const inbox = await InboxModel.findOne({ where: { roomId } });
  return ensureSecretSession(inbox);
};

const isSecretEnabled = (inbox) =>
  !!(inbox?.roomType === 'private' && inbox?.secretChatEnabled);

const encryptSecretText = ({ text = '', key }) => {
  if (!key) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(
    'aes-256-gcm',
    Buffer.from(key, 'hex'),
    iv
  );
  const encrypted = Buffer.concat([
    cipher.update(String(text || ''), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString(
    'hex'
  )}`;
};

const decryptSecretText = ({ payload = '', key }) => {
  if (!payload || !key) return '';
  const [ivHex, tagHex, dataHex] = String(payload).split(':');
  if (!ivHex || !tagHex || !dataHex) return '';

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    Buffer.from(key, 'hex'),
    Buffer.from(ivHex, 'hex')
  );
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
};

const getSecretPreviewText = ({ text = '', file = null }) => {
  if (file?.type === 'image') return 'Secret photo';
  if (file?.type === 'video') return 'Secret video';
  if (file?.type === 'audio') return 'Secret voice message';
  if (file?.originalname) return 'Secret attachment';
  if (String(text || '').trim()) return 'Secret message';
  return 'Secret message';
};

const getSecretExpiresAt = (inbox) => {
  if (!isSecretEnabled(inbox)) return null;
  const seconds = normalizeSecretTimer(inbox?.secretDisappearSeconds);
  if (!seconds) return null;
  return new Date(Date.now() + seconds * 1000);
};

const isExpiredSecretChat = (chat) =>
  !!(
    chat?.expiresAt &&
    Number.isFinite(new Date(chat.expiresAt).getTime()) &&
    new Date(chat.expiresAt).getTime() <= Date.now()
  );

const cleanupExpiredSecretChats = async ({ roomId = null } = {}) => {
  const where = roomId
    ? { roomId, expiresAt: { [Op.lte]: new Date() } }
    : { expiresAt: { [Op.lte]: new Date() } };
  const expired = await ChatModel.findAll({ where });
  if (expired.length === 0) return [];
  await ChatModel.destroy({ where });
  return expired.map((item) => toPlain(item)?._id).filter(Boolean);
};

module.exports = {
  SECRET_TIMER_VALUES,
  normalizeSecretTimer,
  createSecretSession,
  ensureSecretSession,
  getSecretRoomState,
  isSecretEnabled,
  encryptSecretText,
  decryptSecretText,
  getSecretPreviewText,
  getSecretExpiresAt,
  isExpiredSecretChat,
  cleanupExpiredSecretChats,
};
