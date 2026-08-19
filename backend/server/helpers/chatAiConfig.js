const crypto = require('crypto');
const ChatAiConfigModel = require('../db/models/chatAiConfig');

const ENC_PREFIX = 'enc:v1:';

const getSecret = () => {
  const raw = String(
    process.env.CHAT_AI_CONFIG_SECRET ||
      process.env.CALL_CONFIG_SECRET ||
      process.env.STORAGE_CONFIG_SECRET ||
      process.env.JWT_SECRET ||
      ''
  ).trim();
  if (!raw) throw new Error('CHAT_AI_CONFIG_SECRET or another stable application secret is required');
  return crypto.createHash('sha256').update(raw).digest();
};

const encryptSecret = (value = '') => {
  const text = String(value || '');
  if (!text) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getSecret(), iv);
  const body = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENC_PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${body.toString('base64')}`;
};

const decryptSecret = (value = '') => {
  const raw = String(value || '');
  if (!raw) return '';
  if (!raw.startsWith(ENC_PREFIX)) return raw;
  const parts = raw.slice(ENC_PREFIX.length).split(':');
  if (parts.length !== 3) return '';
  const [ivText, tagText, bodyText] = parts;
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getSecret(),
    Buffer.from(ivText, 'base64')
  );
  decipher.setAuthTag(Buffer.from(tagText, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(bodyText, 'base64')),
    decipher.final(),
  ]).toString('utf8');
};

const defaults = () => ({
  key: 'default',
  translationEnabled: false,
  translationUrl: '',
  translationApiKey: '',
  transcriptionEnabled: false,
  transcriptionUrl: '',
  transcriptionApiKey: '',
  defaultTargetLanguage: 'en',
});

const getConfigRow = async () => {
  let row = await ChatAiConfigModel.findOne({ where: { key: 'default' } });
  if (!row) row = await ChatAiConfigModel.create(defaults());
  return row;
};

const getRuntimeChatAiConfig = async () => {
  const row = await getConfigRow();
  return {
    translationEnabled: !!row.translationEnabled,
    translationUrl: row.translationUrl || '',
    translationApiKey: decryptSecret(row.translationApiKey || ''),
    transcriptionEnabled: !!row.transcriptionEnabled,
    transcriptionUrl: row.transcriptionUrl || '',
    transcriptionApiKey: decryptSecret(row.transcriptionApiKey || ''),
    defaultTargetLanguage: row.defaultTargetLanguage || 'en',
  };
};

const getAdminChatAiConfig = async () => {
  const row = await getConfigRow();
  return {
    translationEnabled: !!row.translationEnabled,
    translationUrl: row.translationUrl || '',
    translationApiKeySet: !!row.translationApiKey,
    transcriptionEnabled: !!row.transcriptionEnabled,
    transcriptionUrl: row.transcriptionUrl || '',
    transcriptionApiKeySet: !!row.transcriptionApiKey,
    defaultTargetLanguage: row.defaultTargetLanguage || 'en',
  };
};

const updateChatAiConfig = async (input = {}) => {
  const row = await getConfigRow();
  const patch = {
    translationEnabled: !!input.translationEnabled,
    translationUrl: String(input.translationUrl || '').trim().slice(0, 512),
    transcriptionEnabled: !!input.transcriptionEnabled,
    transcriptionUrl: String(input.transcriptionUrl || '').trim().slice(0, 512),
    defaultTargetLanguage: String(input.defaultTargetLanguage || 'en').trim().slice(0, 16) || 'en',
  };
  if (String(input.translationApiKey || '').trim()) {
    patch.translationApiKey = encryptSecret(String(input.translationApiKey).trim());
  }
  if (String(input.transcriptionApiKey || '').trim()) {
    patch.transcriptionApiKey = encryptSecret(String(input.transcriptionApiKey).trim());
  }
  if (input.clearTranslationApiKey === true) patch.translationApiKey = '';
  if (input.clearTranscriptionApiKey === true) patch.transcriptionApiKey = '';
  await row.update(patch);
  return getAdminChatAiConfig();
};

module.exports = {
  getRuntimeChatAiConfig,
  getAdminChatAiConfig,
  updateChatAiConfig,
};
