const path = require('path');
const { readStorageFileToBuffer } = require('../helpers/storage');

const MIME_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.pdf': 'application/pdf',
};

const mediaProxy = async (req, res, next) => {
  try {
    const source = String(req.query.url || '').trim();
    if (!source) {
      res.status(400).json({ success: false, message: 'Media URL is required' });
      return;
    }

    const parsed = new URL(source);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      res.status(400).json({ success: false, message: 'Invalid media URL' });
      return;
    }

    // readStorageFileToBuffer validates that the source belongs to the
    // configured FTP publicBaseUrl before touching storage. This prevents the
    // endpoint from becoming an arbitrary HTTP/SSRF proxy.
    const buffer = await readStorageFileToBuffer(source);
    const extension = path.extname(parsed.pathname).toLowerCase();
    const contentType = MIME_TYPES[extension] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
    res.setHeader('X-SyncChat-Media-Source', 'backend-storage');
    res.status(200).send(buffer);
  } catch (error0) {
    if (error0 instanceof TypeError) {
      res.status(400).json({ success: false, message: 'Invalid media URL' });
      return;
    }
    if (String(error0?.message || '').includes('does not belong to configured FTP storage')) {
      res.status(403).json({ success: false, message: 'Media source is not allowed' });
      return;
    }
    next(error0);
  }
};

module.exports = { mediaProxy };
