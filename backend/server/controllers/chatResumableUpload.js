const crypto = require('crypto');
const mongoose = require('mongoose');
const ResumableUploadModel = require('../db/models/resumableUpload');
const { toPlain } = require('../db/utils');
const response = require('../helpers/response');
const { saveBufferFile } = require('../helpers/storage');
const { loadAppConfig } = require('../helpers/appConfig');
const { validateUploadBuffer } = require('../helpers/fileSignature');

exports.complete = async (req, res) => {
  let row = null;
  let collection = null;
  try {
    const uploadId = req.params.uploadId;
    row = await ResumableUploadModel.findOne({
      where: { uploadId, userId: req.user._id },
    });
    if (!row) {
      response({
        res,
        statusCode: 404,
        success: false,
        message: 'Upload session not found',
      });
      return;
    }

    if (row.status === 'complete' && row.result?.url) {
      response({ res, message: 'Upload already complete', payload: row.result });
      return;
    }
    if (row.status !== 'uploading') {
      response({
        res,
        statusCode: 409,
        success: false,
        message: `Upload cannot be completed from ${row.status} state`,
      });
      return;
    }
    if (new Date(row.expiresAt || 0).getTime() <= Date.now()) {
      await row.update({ status: 'expired' });
      response({
        res,
        statusCode: 410,
        success: false,
        message: 'Upload session expired',
      });
      return;
    }

    collection = mongoose.connection.db.collection('resumable_upload_chunks');
    const chunks = await collection
      .find({ uploadId, userId: req.user._id })
      .sort({ partNumber: 1 })
      .toArray();
    const expectedParts = Math.ceil(Number(row.totalSize) / Number(row.chunkSize));

    if (
      chunks.length !== expectedParts ||
      chunks.some((chunk, index) => chunk.partNumber !== index)
    ) {
      response({
        res,
        statusCode: 409,
        success: false,
        message: 'Upload is incomplete',
        payload: {
          expectedParts,
          receivedParts: chunks.map((item) => item.partNumber),
        },
      });
      return;
    }

    const buffer = Buffer.concat(
      chunks.map((chunk) => Buffer.from(chunk.data.buffer || chunk.data))
    );
    if (buffer.length !== Number(row.totalSize)) {
      response({
        res,
        statusCode: 409,
        success: false,
        message: 'Uploaded byte count does not match expected size',
      });
      return;
    }

    const detected = validateUploadBuffer({
      buffer,
      filename: row.filename,
      mime: row.mime,
    });
    const appConfig = await loadAppConfig();
    const allowedTypes = Array.isArray(appConfig?.uploadLimits?.allowedTypes)
      ? appConfig.uploadLimits.allowedTypes
      : ['image', 'video', 'audio', 'document'];
    if (!allowedTypes.includes(detected.type)) {
      const error = new Error(`Uploads for ${detected.type} files are disabled.`);
      error.statusCode = 415;
      error.code = 'UNSAFE_UPLOAD';
      throw error;
    }

    const safeFormat =
      String(detected.format || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 12) || 'bin';
    const stored = await saveBufferFile({
      buffer,
      folder: `chat/${req.user._id}`,
      filename: `${Date.now()}-${crypto.randomUUID()}.${safeFormat}`,
    });
    const payload = {
      url: stored.url,
      originalname: row.filename,
      type: detected.type,
      format: safeFormat,
      size: Number(row.totalSize),
      duration: 0,
      thumbnailUrl: '',
      streamUrl: '',
      streamHdUrl: '',
      width: 0,
      height: 0,
    };

    await row.update({
      status: 'complete',
      uploadedBytes: row.totalSize,
      result: payload,
    });
    await collection.deleteMany({ uploadId, userId: req.user._id });

    response({ res, message: 'Upload complete', payload });
  } catch (error0) {
    if (error0.code === 'UNSAFE_UPLOAD' && row) {
      await row.update({ status: 'cancelled' }).catch(() => {});
      if (collection) {
        await collection
          .deleteMany({ uploadId: row.uploadId, userId: req.user._id })
          .catch(() => {});
      }
    }
    response({
      res,
      statusCode: error0.statusCode || 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.status = async (req, res) => {
  try {
    const row = await ResumableUploadModel.findOne({
      where: { uploadId: req.params.uploadId, userId: req.user._id },
    });
    if (!row) {
      response({
        res,
        statusCode: 404,
        success: false,
        message: 'Upload session not found',
      });
      return;
    }
    response({ res, payload: toPlain(row) });
  } catch (error0) {
    response({ res, statusCode: 500, success: false, message: error0.message });
  }
};
