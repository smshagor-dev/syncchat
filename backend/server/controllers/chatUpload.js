const crypto = require('crypto');
const ProfileModel = require('../db/models/profile');
const response = require('../helpers/response');
const logger = require('../helpers/logger');
const { saveBufferFile, deleteStorageFileByUrl } = require('../helpers/storage');
const { processUploadedVideoBuffer } = require('../helpers/videoPipeline');
const { loadAppConfig } = require('../helpers/appConfig');
const { validateUploadBuffer } = require('../helpers/fileSignature');

const sanitizeFolderName = (value, fallback = 'unknown') => {
  const safe = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
  return safe || fallback;
};

exports.upload = async (req, res) => {
  let saved = null;
  try {
    const uploadFile = req.file;
    if (!uploadFile?.buffer) {
      response({
        res,
        statusCode: 400,
        success: false,
        message: 'No file uploaded',
      });
      return;
    }

    const appConfig = await loadAppConfig();
    if (appConfig?.featureFlags?.uploads === false) {
      response({
        res,
        statusCode: 403,
        success: false,
        message: 'Uploads are disabled right now.',
      });
      return;
    }

    const maxChatBytes =
      Math.max(1, Number(appConfig?.uploadLimits?.chatMb || 100)) * 1024 * 1024;
    if (Number(uploadFile.size || uploadFile.buffer.length) > maxChatBytes) {
      response({
        res,
        statusCode: 413,
        success: false,
        message: `File too large. Max ${appConfig?.uploadLimits?.chatMb || 100} MB allowed.`,
      });
      return;
    }

    // Browser MIME and filename metadata are untrusted. Detect the actual file
    // signature before writing anything to persistent FTP/FTPS storage.
    const detected = validateUploadBuffer({
      buffer: uploadFile.buffer,
      filename: uploadFile.originalname,
      mime: uploadFile.mimetype,
    });
    const { type, format } = detected;

    const allowedTypes = Array.isArray(appConfig?.uploadLimits?.allowedTypes)
      ? appConfig.uploadLimits.allowedTypes
      : ['image', 'video', 'audio', 'document'];
    if (allowedTypes.length === 0) {
      response({
        res,
        statusCode: 403,
        success: false,
        message: 'All uploads are disabled.',
      });
      return;
    }
    if (!allowedTypes.includes(type)) {
      response({
        res,
        statusCode: 415,
        success: false,
        message: `Uploads for ${type} files are disabled.`,
      });
      return;
    }

    const profile = req.user?._id
      ? await ProfileModel.findOne({
          where: { userId: req.user._id },
          attributes: ['username'],
        })
      : null;
    const usernameFolder = sanitizeFolderName(
      profile?.username,
      sanitizeFolderName(req.user?._id, 'unknown')
    );
    const folder = `chat/${usernameFolder}`;
    const safeFormat = String(format || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 12) || 'bin';
    const filename = `${Date.now()}-${crypto.randomUUID()}.${safeFormat}`;

    saved = await saveBufferFile({
      buffer: uploadFile.buffer,
      folder,
      filename,
    });

    let videoPayload = {};
    if (type === 'video') {
      try {
        videoPayload = await processUploadedVideoBuffer({
          buffer: uploadFile.buffer,
          folder,
          filename,
        });
      } catch (error0) {
        logger.warn('CHAT_VIDEO_PROCESSING_FAILED', {
          userId: req.user?._id || null,
          message: error0.message,
        });
      }
    }

    logger.info('CHAT_UPLOAD_FTP_SUCCESS', {
      userId: req.user?._id || null,
      type,
      format: safeFormat,
      size: Number(uploadFile.size || uploadFile.buffer.length),
    });

    response({
      res,
      message: 'File uploaded successfully',
      payload: {
        originalname: uploadFile.originalname,
        url: saved.url,
        size: Number(uploadFile.size || uploadFile.buffer.length),
        type,
        format: safeFormat,
        ...videoPayload,
      },
    });
  } catch (error0) {
    if (saved?.url) {
      await deleteStorageFileByUrl(saved.url).catch(() => {});
    }
    logger.error('CHAT_UPLOAD_FTP_ERROR', {
      userId: req.user?._id || null,
      code: error0.code || null,
      message: error0.message,
      ...(process.env.NODE_ENV !== 'production' ? { stack: error0.stack } : {}),
    });
    response({
      res,
      statusCode: error0.statusCode || 500,
      success: false,
      message: error0.message,
    });
  }
};
