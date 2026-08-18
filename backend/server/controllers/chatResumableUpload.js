const path = require('path');
const mongoose = require('mongoose');
const ResumableUploadModel = require('../db/models/resumableUpload');
const { toPlain } = require('../db/utils');
const response = require('../helpers/response');
const { saveBufferFile } = require('../helpers/storage');

const safeFileName = (value = 'file.bin') => {
  const base = path
    .basename(String(value || 'file.bin'))
    .replace(/[^a-zA-Z0-9._ -]/g, '_')
    .trim();
  return base.slice(0, 180) || 'file.bin';
};

const fileTypeFromMime = (mime = '', filename = '') => {
  const normalized = String(mime || '').toLowerCase();
  if (normalized.startsWith('image/')) return 'image';
  if (normalized.startsWith('video/')) return 'video';
  if (normalized.startsWith('audio/')) return 'audio';
  const ext = path.extname(String(filename || '')).slice(1).toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif'].includes(ext)) return 'image';
  if (['mp4', 'mov', 'mkv', 'webm', 'm4v'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(ext)) return 'audio';
  return 'document';
};

exports.complete = async (req, res) => {
  try {
    const uploadId = req.params.uploadId;
    const row = await ResumableUploadModel.findOne({
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
      response({
        res,
        message: 'Upload already complete',
        payload: row.result,
      });
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

    const collection = mongoose.connection.db.collection(
      'resumable_upload_chunks'
    );
    const chunks = await collection
      .find({ uploadId, userId: req.user._id })
      .sort({ partNumber: 1 })
      .toArray();
    const expectedParts = Math.ceil(
      Number(row.totalSize) / Number(row.chunkSize)
    );

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

    const stored = await saveBufferFile({
      buffer,
      folder: `chat/${req.user._id}`,
      filename: `${Date.now()}-${safeFileName(row.filename)}`,
    });
    const ext = path.extname(row.filename).slice(1).toLowerCase() || 'bin';
    const payload = {
      url: stored.url,
      originalname: row.filename,
      type: fileTypeFromMime(row.mime, row.filename),
      format: ext.slice(0, 24),
      size: Number(row.totalSize),
      duration: 0,
      thumbnailUrl: '',
      streamUrl: '',
      streamHdUrl: '',
      width: 0,
      height: 0,
    };

    // The final chat send endpoint creates the canonical FileModel row. Keeping
    // the resumable finalizer storage-only prevents an orphan duplicate DB row.
    await row.update({
      status: 'complete',
      uploadedBytes: row.totalSize,
      result: payload,
    });
    await collection.deleteMany({ uploadId, userId: req.user._id });

    response({
      res,
      message: 'Upload complete',
      payload,
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
