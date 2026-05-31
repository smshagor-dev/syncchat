const crypto = require('crypto');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const normalizeSecret = (value = '') =>
  String(value)
    .toUpperCase()
    .replace(/=+$/g, '')
    .replace(/[^A-Z2-7]/g, '');

const encodeBase32 = (buffer) => {
  let bits = '';
  let output = '';

  buffer.forEach((byte) => {
    bits += byte.toString(2).padStart(8, '0');
  });

  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, '0');
    output += BASE32_ALPHABET[Number.parseInt(chunk, 2)];
  }

  return output;
};

const decodeBase32 = (secret) => {
  const normalized = normalizeSecret(secret);
  let bits = '';

  [...normalized].forEach((char) => {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) return;
    bits += index.toString(2).padStart(5, '0');
  });

  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  }

  return Buffer.from(bytes);
};

const generateSecret = (size = 20) => encodeBase32(crypto.randomBytes(size));

const generateToken = ({ secret, step = 30, digits = 6, epoch = Date.now() }) => {
  const key = decodeBase32(secret);
  const counter = Math.floor(epoch / 1000 / step);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));

  const digest = crypto.createHmac('sha1', key).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;

  return String(code).padStart(digits, '0');
};

const verifyToken = ({ secret, token, window = 1, step = 30 }) => {
  const normalizedToken = String(token || '').replace(/\D+/g, '');
  if (!normalizedToken || normalizedToken.length !== 6) return false;

  for (let offset = -window; offset <= window; offset += 1) {
    const epoch = Date.now() + offset * step * 1000;
    if (generateToken({ secret, step, epoch }) === normalizedToken) {
      return true;
    }
  }

  return false;
};

const buildOtpAuthUrl = ({ secret, email, issuer = 'SyncChat' }) => {
  const label = encodeURIComponent(`${issuer}:${email}`);
  const query = new URLSearchParams({
    secret: normalizeSecret(secret),
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });

  return `otpauth://totp/${label}?${query.toString()}`;
};

module.exports = {
  buildOtpAuthUrl,
  generateSecret,
  generateToken,
  normalizeSecret,
  verifyToken,
};
