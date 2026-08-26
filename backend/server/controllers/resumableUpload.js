const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const ProfileModel = require('../db/models/profile');
const response = require('../helpers/response');
const logger = require('../helpers/logger');
const { uploadStreamFile, deleteStorageFileByUrl } = require('../helpers/storage');
const { processUploadedVideoBuffer } = require('../helpers/videoPipeline');
const { loadAppConfig } = require('../helpers/appConfig');
const { validateUploadBuffer } = require('../helpers/fileSignature');

const SESSION_ROOT = path.join(os.tmpdir(), 'syncchat-resumable-uploads');
const SESSION_TTL_MS = Math.max(
  60 * 60 * 1000,
  Number(process.env.RESUMABLE_UPLOAD_TTL_MS || 24 * 60 * 60 * 1000)
);
const DEFAULT_CHUNK_BYTES = 4 * 1024 * 1024;
const MIN_CHUNK_BYTES = 256 * 1024;
const MAX_CHUNK_BYTES = 8 * 1024 * 1024;
const VIDEO_PROCESSING_BUFFER_LIMIT = Math.max(
  8 * 1024 * 1024,
  Number(process.env.RESUMABLE_VIDEO_PROCESSING_BUFFER_MB || 32) * 1024 * 1024
);

const sanitizeFolderName = (value, fallback = 'unknown') => {
  const safe = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
  return safe || fallback;
};

const safeOriginalName = (value = '') => {
  const normalized = path.basename(String(value || '').trim()).replace(/[\u0000-\u001f]/g, '');
  return normalized.slice(0, 180) || 'upload.bin';
};

const safeMime = (value = '') => String(value || '').trim().toLowerCase().slice(0, 120);

const clampChunkSize = (value) => {
  const requested = Number(value || DEFAULT_CHUNK_BYTES);
  if (!Number.isFinite(requested)) return DEFAULT_CHUNK_BYTES;
  return Math.max(MIN_CHUNK_BYTES, Math.min(MAX_CHUNK_BYTES, Math.floor(requested)));
};

const sessionPaths = (uploadId) => {
  const safeId = String(uploadId || '').replace(/[^a-f0-9-]/gi, '');
  return {
    data: path.join(SESSION_ROOT, `${safeId}.part`),
    meta: path.join(SESSION_ROOT, `${safeId}.json`),
  };
};

const ensureRoot = () => fsp.mkdir(SESSION_ROOT, { recursive: true });

const writeSession = async (session) => {
  await ensureRoot();
  const { meta } = sessionPaths(session.uploadId);
  const tmp = `${meta}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(session), 'utf8');
  await fsp.rename(tmp, meta);
};

const readSession = async (uploadId, userId) => {
  const { meta, data } = sessionPaths(uploadId);
  let raw;
  try {
    raw = await fsp.readFile(meta, 'utf8');
  } catch (error0) {
    if (error0.code === 'ENOENT') {
      const error = new Error('Upload session not found or expired');
      error.statusCode = 404;
      throw error;
    }
    throw error0;
  }

  let session;
  try {
    session = JSON.parse(raw);
  } catch (error0) {
    const error = new Error('Upload session is invalid');
    error.statusCode = 500;
    throw error;
  }

  if (String(session.userId || '') !== String(userId || '')) {
    const error = new Error('Upload session does not belong to this account');
    error.statusCode = 403;
    throw error;
  }
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    await Promise.allSettled([fsp.unlink(meta), fsp.unlink(data)]);
    const error = new Error('Upload session expired');
    error.statusCode = 410;
    throw error;
  }
  return session;
};

const currentOffset = async (uploadId) => {
  const { data } = sessionPaths(uploadId);
  try {
    return (await fsp.stat(data)).size;
  } catch (error0) {
    if (error0.code === 'ENOENT') return 0;
    throw error0;
  }
};

const removeSessionFiles = async (uploadId) => {
  const { data, meta } = sessionPaths(uploadId);
  await Promise.allSettled([fsp.unlink(data), fsp.unlink(meta)]);
};

const cleanupExpiredSessions = async () => {
  await ensureRoot();
  let entries = [];
  try {
    entries = await fsp.readdir(SESSION_ROOT, { withFileTypes: true });
  } catch (error0) {
    return;
  }

  await Promise.allSettled(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .slice(0, 100)
      .map(async (entry) => {
        const metaPath = path.join(SESSION_ROOT, entry.name);
        try {
          const parsed = JSON.parse(await fsp.readFile(metaPath, 'utf8'));
          if (new Date(parsed.expiresAt).getTime() > Date.now()) return;
          await removeSessionFiles(parsed.uploadId || entry.name.replace(/\.json$/, ''));
        } catch (error0) {
          const stat = await fsp.stat(metaPath).catch(() => null);
          if (stat && Date.now() - stat.mtimeMs > SESSION_TTL_MS) {
            await fsp.unlink(metaPath).catch(() => {});
          }
        }
      })
  );
};

const readProbe = async (filePath, maxBytes = 8192) => {
  const handle = await fsp.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(maxBytes);
    const result = await handle.read(buffer, 0, maxBytes, 0);
    return buffer.subarray(0, result.bytesRead);
  } finally {
    await handle.close();
  }
};

const uploadLimits = async () => {
  const appConfig = await loadAppConfig();
  if (appConfig?.featureFlags?.uploads === false) {
    const error = new Error('Uploads are disabled right now.');
    error.statusCode = 403;
    throw error;
  }
  const chatMb = Math.max(1, Number(appConfig?.uploadLimits?.chatMb || 100));
  const hardMb = Math.max(1, Number(process.env.CHAT_UPLOAD_HARD_LIMIT_MB || 250));
  return {
    appConfig,
    maxBytes: Math.min(chatMb, hardMb) * 1024 * 1024,
    maxMb: Math.min(chatMb, hardMb),
  };
};

const publicSession = async (session) => {
  const offset = await currentOffset(session.uploadId);
  return {
    uploadId: session.uploadId,
    filename: session.filename,
    mime: session.mime,
    size: session.size,
    offset,
    remaining: Math.max(0, session.size - offset),
    progress: session.size ? Number(((offset / session.size) * 100).toFixed(1)) : 0,
    chunkSize: session.chunkSize,
    expiresAt: session.expiresAt,
    complete: offset === session.size,
  };
};

exports.create = async (req, res) => {
  try {
    await cleanupExpiredSessions();
    const { maxBytes, maxMb } = await uploadLimits();
    const size = Math.floor(Number(req.body?.size || 0));
    if (!Number.isFinite(size) || size <= 0) throw new Error('Upload size is required');
    if (size > maxBytes) {
      const error = new Error(`File too large. Max ${maxMb} MB allowed.`);
      error.statusCode = 413;
      throw error;
    }

    const uploadId = crypto.randomUUID();
    const now = Date.now();
    const session = {
      uploadId,
      userId: req.user._id,
      filename: safeOriginalName(req.body?.filename),
      mime: safeMime(req.body?.mime),
      size,
      chunkSize: clampChunkSize(req.body?.chunkSize),
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
    };

    await ensureRoot();
    await fsp.writeFile(sessionPaths(uploadId).data, Buffer.alloc(0), { flag: 'wx' });
    await writeSession(session);

    response({
      res,
      statusCode: 201,
      message: 'Resumable upload session created',
      payload: await publicSession(session),
    });
  } catch (error0) {
    response({
      res,
      statusCode: error0.statusCode || 400,
      success: false,
      message: error0.message,
    });
  }
};

exports.status = async (req, res) => {
  try {
    const session = await readSession(req.params.uploadId, req.user._id);
    response({ res, payload: await publicSession(session) });
  } catch (error0) {
    response({
      res,
      statusCode: error0.statusCode || 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.chunk = async (req, res) => {
  try {
    const session = await readSession(req.params.uploadId, req.user._id);
    const chunk = req.body;
    if (!Buffer.isBuffer(chunk) || chunk.length === 0) {
      const error = new Error('Upload chunk is required');
      error.statusCode = 400;
      throw error;
    }
    if (chunk.length > session.chunkSize) {
      const error = new Error(`Chunk exceeds session limit of ${session.chunkSize} bytes`);
      error.statusCode = 413;
      throw error;
    }

    const suppliedOffset = Number(req.get('upload-offset') || req.get('x-upload-offset'));
    if (!Number.isFinite(suppliedOffset) || suppliedOffset < 0) {
      const error = new Error('Upload-Offset header is required');
      error.statusCode = 400;
      throw error;
    }

    const offset = await currentOffset(session.uploadId);
    if (suppliedOffset < offset && suppliedOffset + chunk.length <= offset) {
      response({
        res,
        message: 'Chunk already received',
        payload: { ...(await publicSession(session)), duplicate: true },
      });
      return;
    }
    if (suppliedOffset !== offset) {
      const error = new Error(`Upload offset mismatch. Resume from byte ${offset}.`);
      error.statusCode = 409;
      error.payload = { expectedOffset: offset };
      throw error;
    }
    if (offset + chunk.length > session.size) {
      const error = new Error('Chunk exceeds declared upload size');
      error.statusCode = 413;
      throw error;
    }

    await fsp.appendFile(sessionPaths(session.uploadId).data, chunk);
    session.updatedAt = new Date().toISOString();
    session.expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    await writeSession(session);

    response({
      res,
      message: 'Upload chunk accepted',
      payload: await publicSession(session),
    });
  } catch (error0) {
    response({
      res,
      statusCode: error0.statusCode || 500,
      success: false,
      message: error0.message,
      payload: error0.payload,
    });
  }
};

exports.complete = async (req, res) => {
  let saved = null;
  try {
    const session = await readSession(req.params.uploadId, req.user._id);
    const offset = await currentOffset(session.uploadId);
    if (offset !== session.size) {
      const error = new Error(`Upload is incomplete. Resume from byte ${offset}.`);
      error.statusCode = 409;
      error.payload = { expectedOffset: offset, remaining: session.size - offset };
      throw error;
    }

    const { appConfig } = await uploadLimits();
    const dataPath = sessionPaths(session.uploadId).data;
    const probe = await readProbe(dataPath);
    const detected = validateUploadBuffer({
      buffer: probe,
      filename: session.filename,
      mime: session.mime,
    });
    const allowedTypes = Array.isArray(appConfig?.uploadLimits?.allowedTypes)
      ? appConfig.uploadLimits.allowedTypes
      : ['image', 'video', 'audio', 'document'];
    if (!allowedTypes.includes(detected.type)) {
      const error = new Error(`Uploads for ${detected.type} files are disabled.`);
      error.statusCode = 415;
      throw error;
    }

    const profile = await ProfileModel.findOne({
      where: { userId: req.user._id },
      attributes: ['username'],
    });
    const usernameFolder = sanitizeFolderName(
      profile?.username,
      sanitizeFolderName(req.user._id, 'unknown')
    );
    const folder = `chat/${usernameFolder}`;
    const safeFormat = String(detected.format || 'bin')
      .replace(/[^a-z0-9]/gi, '')
      .slice(0, 12) || 'bin';
    const filename = `${Date.now()}-${crypto.randomUUID()}.${safeFormat}`;

    saved = await uploadStreamFile({
      stream: fs.createReadStream(dataPath),
      folder,
      filename,
      size: session.size,
    });

    let videoPayload = {};
    if (detected.type === 'video' && session.size <= VIDEO_PROCESSING_BUFFER_LIMIT) {
      try {
        const videoBuffer = await fsp.readFile(dataPath);
        videoPayload = await processUploadedVideoBuffer({
          buffer: videoBuffer,
          folder,
          filename,
        });
      } catch (error0) {
        logger.warn('RESUMABLE_VIDEO_PROCESSING_FAILED', {
          userId: req.user._id,
          uploadId: session.uploadId,
          message: error0.message,
        });
      }
    } else if (detected.type === 'video') {
      videoPayload = { processingDeferred: true };
    }

    await removeSessionFiles(session.uploadId);
    logger.info('CHAT_RESUMABLE_UPLOAD_SUCCESS', {
      userId: req.user._id,
      uploadId: session.uploadId,
      type: detected.type,
      size: session.size,
    });

    response({
      res,
      message: 'Resumable upload completed',
      payload: {
        originalname: session.filename,
        url: saved.url,
        size: session.size,
        type: detected.type,
        format: safeFormat,
        resumable: true,
        ...videoPayload,
      },
    });
  } catch (error0) {
    if (saved?.url) await deleteStorageFileByUrl(saved.url).catch(() => {});
    logger.error('CHAT_RESUMABLE_UPLOAD_ERROR', {
      userId: req.user?._id || null,
      uploadId: req.params.uploadId,
      message: error0.message,
    });
    response({
      res,
      statusCode: error0.statusCode || 500,
      success: false,
      message: error0.message,
      payload: error0.payload,
    });
  }
};

exports.cancel = async (req, res) => {
  try {
    const session = await readSession(req.params.uploadId, req.user._id);
    await removeSessionFiles(session.uploadId);
    response({
      res,
      message: 'Upload cancelled',
      payload: { uploadId: session.uploadId, cancelled: true },
    });
  } catch (error0) {
    response({
      res,
      statusCode: error0.statusCode || 500,
      success: false,
      message: error0.message,
    });
  }
};

exports._test = {
  clampChunkSize,
  safeOriginalName,
  safeMime,
  sessionPaths,
};
