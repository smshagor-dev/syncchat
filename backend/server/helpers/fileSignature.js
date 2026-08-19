const path = require('path');

const DANGEROUS_EXTENSIONS = new Set([
  'exe', 'dll', 'com', 'scr', 'bat', 'cmd', 'ps1', 'sh', 'bash', 'msi',
  'php', 'phtml', 'phar', 'asp', 'aspx', 'jsp', 'cgi', 'pl', 'py', 'rb',
  'html', 'htm', 'xhtml', 'svg', 'js', 'mjs', 'cjs', 'jar', 'apk', 'dmg',
  'iso', 'app', 'deb', 'rpm', 'reg', 'lnk', 'vbs', 'wsf', 'hta',
]);

const SAFE_TEXT_EXTENSIONS = new Set(['txt', 'md', 'csv', 'json', 'log']);
const SAFE_ARCHIVE_DOCUMENT_EXTENSIONS = new Set([
  'zip', 'docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp',
]);
const SAFE_OLE_EXTENSIONS = new Set(['doc', 'xls', 'ppt']);

const extensionOf = (filename = '') =>
  path.extname(String(filename || '')).slice(1).trim().toLowerCase();

const startsWith = (buffer, bytes, offset = 0) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < offset + bytes.length) return false;
  return bytes.every((byte, index) => buffer[offset + index] === byte);
};

const ascii = (buffer, start, end) =>
  Buffer.isBuffer(buffer) && buffer.length >= end
    ? buffer.subarray(start, end).toString('ascii')
    : '';

const sniff = (buffer, filename = '') => {
  const ext = extensionOf(filename);
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null;

  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return { type: 'image', format: 'jpg' };
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { type: 'image', format: 'png' };
  }
  if (['GIF87a', 'GIF89a'].includes(ascii(buffer, 0, 6))) {
    return { type: 'image', format: 'gif' };
  }
  if (ascii(buffer, 0, 4) === 'RIFF' && ascii(buffer, 8, 12) === 'WEBP') {
    return { type: 'image', format: 'webp' };
  }

  const brand = ascii(buffer, 8, 12).toLowerCase();
  if (ascii(buffer, 4, 8) === 'ftyp') {
    if (['avif', 'avis', 'heic', 'heix', 'hevc', 'hevx'].includes(brand)) {
      return { type: 'image', format: brand.startsWith('avi') ? 'avif' : 'heic' };
    }
    if (['m4a', 'm4b', 'm4p'].includes(ext)) return { type: 'audio', format: ext };
    return { type: 'video', format: ext || brand || 'mp4' };
  }

  if (ascii(buffer, 0, 4) === '%PDF') return { type: 'document', format: 'pdf' };
  if (startsWith(buffer, [0x50, 0x4b, 0x03, 0x04]) || startsWith(buffer, [0x50, 0x4b, 0x05, 0x06])) {
    if (SAFE_ARCHIVE_DOCUMENT_EXTENSIONS.has(ext)) {
      return { type: 'document', format: ext || 'zip' };
    }
    return { type: 'document', format: 'zip' };
  }
  if (startsWith(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    return SAFE_OLE_EXTENSIONS.has(ext) ? { type: 'document', format: ext } : null;
  }

  if (ascii(buffer, 0, 4) === 'OggS') return { type: 'audio', format: ext || 'ogg' };
  if (ascii(buffer, 0, 4) === 'fLaC') return { type: 'audio', format: 'flac' };
  if (ascii(buffer, 0, 3) === 'ID3') return { type: 'audio', format: 'mp3' };
  if (
    buffer.length >= 2 &&
    buffer[0] === 0xff &&
    (buffer[1] & 0xe0) === 0xe0
  ) {
    if ((buffer[1] & 0xf6) === 0xf0) return { type: 'audio', format: 'aac' };
    return { type: 'audio', format: ext || 'mp3' };
  }
  if (ascii(buffer, 0, 4) === 'RIFF' && ascii(buffer, 8, 12) === 'WAVE') {
    return { type: 'audio', format: 'wav' };
  }

  if (startsWith(buffer, [0x1a, 0x45, 0xdf, 0xa3])) {
    return { type: 'video', format: ext === 'mkv' ? 'mkv' : 'webm' };
  }

  if (SAFE_TEXT_EXTENSIONS.has(ext)) {
    const probe = buffer.subarray(0, Math.min(buffer.length, 4096));
    if (!probe.includes(0x00)) return { type: 'document', format: ext };
  }

  return null;
};

const typeFromMime = (mime = '') => {
  const normalized = String(mime || '').trim().toLowerCase();
  if (normalized.startsWith('image/')) return 'image';
  if (normalized.startsWith('video/')) return 'video';
  if (normalized.startsWith('audio/')) return 'audio';
  return 'document';
};

const createUploadError = (message) => {
  const error = new Error(message);
  error.statusCode = 415;
  error.code = 'UNSAFE_UPLOAD';
  return error;
};

const validateUploadBuffer = ({ buffer, filename = '', mime = '' }) => {
  const ext = extensionOf(filename);
  if (ext && DANGEROUS_EXTENSIONS.has(ext)) {
    throw createUploadError(`.${ext} files are not allowed`);
  }

  const detected = sniff(buffer, filename);
  if (!detected) {
    throw createUploadError('File content could not be safely identified');
  }

  const claimedType = typeFromMime(mime);
  if (
    ['image', 'video', 'audio'].includes(claimedType) &&
    claimedType !== detected.type
  ) {
    throw createUploadError('Uploaded file content does not match its media type');
  }

  if (detected.type === 'document') {
    const documentAllowed =
      detected.format === 'pdf' ||
      SAFE_TEXT_EXTENSIONS.has(detected.format) ||
      SAFE_ARCHIVE_DOCUMENT_EXTENSIONS.has(detected.format) ||
      SAFE_OLE_EXTENSIONS.has(detected.format);
    if (!documentAllowed) {
      throw createUploadError('This document format is not allowed');
    }
  }

  return {
    type: detected.type,
    format: String(detected.format || ext || 'bin').slice(0, 24),
  };
};

module.exports = {
  DANGEROUS_EXTENSIONS,
  extensionOf,
  sniff,
  typeFromMime,
  validateUploadBuffer,
};
