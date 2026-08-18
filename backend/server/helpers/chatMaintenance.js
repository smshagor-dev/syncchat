const mongoose = require('mongoose');
const { Op } = require('sequelize');
const ResumableUploadModel = require('../db/models/resumableUpload');
const ChatDraftModel = require('../db/models/chatDraft');
const MessageReceiptModel = require('../db/models/messageReceipt');
const { toPlainMany } = require('../db/utils');
const { cleanupStaleE2eeKeys } = require('./e2eeKeyDirectory');
const logger = require('./logger');

const DAY_MS = 24 * 60 * 60 * 1000;

const cleanupExpiredResumableUploads = async () => {
  const now = new Date();
  const expiredRows = await ResumableUploadModel.findAll({
    where: {
      status: 'uploading',
      expiresAt: { [Op.lte]: now },
    },
  });

  if (expiredRows.length) {
    await Promise.all(
      expiredRows.map((row) => row.update({ status: 'expired' }))
    );
  }

  const terminalRows = await ResumableUploadModel.findAll({
    where: {
      status: { [Op.in]: ['expired', 'cancelled', 'complete'] },
      updatedAt: { [Op.lte]: new Date(Date.now() - 7 * DAY_MS) },
    },
  });

  const expiredIds = toPlainMany(expiredRows)
    .map((item) => item.uploadId)
    .filter(Boolean);
  const terminalIds = toPlainMany(terminalRows)
    .map((item) => item.uploadId)
    .filter(Boolean);
  const chunkCleanupIds = [...new Set([...expiredIds, ...terminalIds])];

  if (mongoose.connection.db && chunkCleanupIds.length) {
    await mongoose.connection.db
      .collection('resumable_upload_chunks')
      .deleteMany({ uploadId: { $in: chunkCleanupIds } });
  }

  if (terminalRows.length) {
    await Promise.all(terminalRows.map((row) => row.destroy()));
  }

  return {
    expiredUploads: expiredRows.length,
    removedUploadRows: terminalRows.length,
    cleanedChunkSessions: chunkCleanupIds.length,
  };
};

const cleanupOldEphemeralChatMetadata = async () => {
  const draftCutoff = new Date(Date.now() - 90 * DAY_MS);
  const receiptCutoff = new Date(Date.now() - 180 * DAY_MS);

  const [draftsRemoved, receiptsRemoved] = await Promise.all([
    ChatDraftModel.destroy({
      where: { updatedAt: { [Op.lte]: draftCutoff } },
    }),
    MessageReceiptModel.destroy({
      where: { updatedAt: { [Op.lte]: receiptCutoff } },
    }),
  ]);

  return {
    draftsRemoved: Number(draftsRemoved || 0),
    receiptsRemoved: Number(receiptsRemoved || 0),
  };
};

const cleanupChatMaintenance = async () => {
  const startedAt = Date.now();
  const result = {
    uploads: await cleanupExpiredResumableUploads(),
    metadata: await cleanupOldEphemeralChatMetadata(),
    e2ee: await cleanupStaleE2eeKeys(),
  };

  logger.info('CHAT_MAINTENANCE_COMPLETE', {
    tookMs: Date.now() - startedAt,
    uploads: result.uploads,
    metadata: result.metadata,
    staleE2eeSessions: result.e2ee.staleSessionIds.length,
  });

  return result;
};

module.exports = {
  cleanupExpiredResumableUploads,
  cleanupOldEphemeralChatMetadata,
  cleanupChatMaintenance,
};
