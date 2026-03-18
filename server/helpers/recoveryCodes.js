const crypto = require('crypto');
const { compareSync } = require('bcryptjs');
const encrypt = require('./encrypt');

const RECOVERY_CODE_COUNT = 10;
const RECOVERY_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const RECOVERY_CODE_RAW_LENGTH = 8;

const normalizeRecoveryCode = (value = '') => {
  const raw = String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, RECOVERY_CODE_RAW_LENGTH);

  if (raw.length !== RECOVERY_CODE_RAW_LENGTH) return '';
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
};

const generateRecoveryCode = () => {
  const bytes = crypto.randomBytes(RECOVERY_CODE_RAW_LENGTH);
  let raw = '';
  for (let i = 0; i < RECOVERY_CODE_RAW_LENGTH; i += 1) {
    raw += RECOVERY_CODE_ALPHABET[bytes[i] % RECOVERY_CODE_ALPHABET.length];
  }
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
};

const generateRecoveryCodes = (count = RECOVERY_CODE_COUNT) => {
  const codes = new Set();
  while (codes.size < count) {
    codes.add(generateRecoveryCode());
  }
  return Array.from(codes);
};

const hashRecoveryCodes = (codes = []) => {
  const nowIso = new Date().toISOString();
  return codes.map((code) => ({
    hash: encrypt(code),
    usedAt: null,
    createdAt: nowIso,
  }));
};

const findRecoveryCodeIndex = (codes = [], input) => {
  const normalized = normalizeRecoveryCode(input);
  if (!normalized) return -1;

  for (let i = 0; i < codes.length; i += 1) {
    const entry = codes[i];
    if (!entry || entry.usedAt) continue;
    if (compareSync(normalized, entry.hash)) {
      return i;
    }
  }
  return -1;
};

const consumeRecoveryCode = (codes = [], input) => {
  const index = findRecoveryCodeIndex(codes, input);
  if (index < 0) {
    return { matched: false, codes };
  }

  const usedAt = new Date().toISOString();
  const next = codes.map((entry, idx) =>
    idx === index ? { ...entry, usedAt } : entry
  );

  return { matched: true, codes: next, usedAt };
};

const countRemainingRecoveryCodes = (codes = []) =>
  codes.filter((entry) => entry && !entry.usedAt).length;

module.exports = {
  RECOVERY_CODE_COUNT,
  normalizeRecoveryCode,
  generateRecoveryCodes,
  hashRecoveryCodes,
  consumeRecoveryCode,
  countRemainingRecoveryCodes,
};
