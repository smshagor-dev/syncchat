const path = require('path');
const { getStorageConfig } = require('../helpers/storageConfig');
const { readStorageFileToBuffer } = require('../helpers/storage');

const IMAGE_TYPES = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
  ['.svg', 'image/svg+xml'],
  ['.ico', 'image/x-icon'],
  ['.avif', 'image/avif'],
]);

const safePathname = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    return decodeURIComponent(new URL(raw, 'https://syncchat.invalid').pathname);
  } catch (error0) {
    return '';
  }
};

const resolveConfiguredStorageUrl = async (rawUrl = '') => {
  const config = await getStorageConfig();
  if (!config.enabled || !config.publicBaseUrl) {
    const error = new Error('Image storage is not configured');
    error.statusCode = 503;
    throw error;
  }

  const raw = String(rawUrl || '').trim();
  if (!raw) {
    const error = new Error('Image URL is required');
    error.statusCode = 400;
    throw error;
  }

  const base = config.publicBaseUrl.replace(/\/+$/, '');
  if (raw === base || raw.startsWith(`${base}/`)) return raw;

  const pathname = safePathname(raw);
  if (!pathname || pathname.includes('..')) {
    const error = new Error('Invalid image URL');
    error.statusCode = 400;
    throw error;
  }

  let basePathname = '';
  try {
    basePathname = new URL(base).pathname.replace(/\/+$/, '');
  } catch (error0) {
    basePathname = '';
  }

  let relative = '';
  if (basePathname && pathname.startsWith(`${basePathname}/`)) {
    relative = pathname.slice(basePathname.length + 1);
  } else {
    const marker = '/uploads/';
    const index = pathname.toLowerCase().indexOf(marker);
    if (index >= 0) relative = pathname.slice(index + marker.length);
  }

  relative = String(relative || '').replace(/^\/+/, '');
  if (!relative || relative.includes('..')) {
    const error = new Error('Image URL does not belong to configured storage');
    error.statusCode = 400;
    throw error;
  }

  return `${base}/${relative}`;
};

exports.image = async (req, res) => {
  try {
    const storageUrl = await resolveConfiguredStorageUrl(req.query?.url);
    const extension = path.extname(safePathname(storageUrl)).toLowerCase();
    const contentType = IMAGE_TYPES.get(extension);
    if (!contentType) {
      res.status(415).json({ success: false, message: 'Unsupported image type' });
      return;
    }

    const buffer = await readStorageFileToBuffer(storageUrl);
    if (!buffer?.length) {
      res.status(404).json({ success: false, message: 'Image not found' });
      return;
    }

    const maxBytes = 20 * 1024 * 1024;
    if (buffer.length > maxBytes) {
      res.status(413).json({ success: false, message: 'Image is too large to proxy' });
      return;
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    res.status(200).send(buffer);
  } catch (error0) {
    res.status(error0.statusCode || 404).json({
      success: false,
      message: error0.message || 'Image could not be loaded',
    });
  }
};

module.exports.resolveConfiguredStorageUrl = resolveConfiguredStorageUrl;
