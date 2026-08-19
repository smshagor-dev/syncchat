const crypto = require('crypto');

module.exports = (length, options = null) => {
  let schema = '';

  if (options?.uppercase ?? true) schema += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (options?.lowercase ?? true) schema += 'abcdefghijklmnopqrstuvwxyz';
  if (options?.number ?? true) schema += '0123456789';

  const targetLength = Math.max(1, Math.min(512, Number(length) || 1));
  if (!schema.length) {
    throw new Error('At least one unique ID character class must be enabled');
  }

  let unique = '';
  while (unique.length < targetLength) {
    unique += schema.charAt(crypto.randomInt(0, schema.length));
  }
  return unique;
};
