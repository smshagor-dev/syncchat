const crypto = require('crypto');
const { JWT_SECRET } = require('./jwtConfig');

const PREFIX = 'enc:v1:';

const getSecret = () => {
  const configured = String(
    process.env.SMTP_CONFIG_SECRET ||
      process.env.STORAGE_CONFIG_SECRET ||
      process.env.JWT_SECRET ||
      JWT_SECRET ||
      ''
  ).trim();
  if (!configured) throw new Error('SMTP credential encryption secret is missing');
  return crypto.createHash('sha256').update(configured).digest();
};

const isEncryptedSmtpSecret = (value) => String(value || '').startsWith(PREFIX);

const encryptSmtpSecret = (value) => {
  const plaintext = String(value || '');
  if (!plaintext || isEncryptedSmtpSecret(plaintext)) return plaintext;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getSecret(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
};

const decryptSmtpSecret = (value) => {
  const encoded = String(value || '');
  if (!encoded) return '';
  // Legacy plaintext values remain readable and are transparently migrated on
  // the next Admin App Config save.
  if (!isEncryptedSmtpSecret(encoded)) return encoded;

  const payload = encoded.slice(PREFIX.length);
  const [ivPart, tagPart, cipherPart] = payload.split('.');
  if (!ivPart || !tagPart || !cipherPart) {
    throw new Error('Stored SMTP credential is corrupted');
  }
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getSecret(),
    Buffer.from(ivPart, 'base64url')
  );
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(cipherPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
};

module.exports = {
  decryptSmtpSecret,
  encryptSmtpSecret,
  isEncryptedSmtpSecret,
};
