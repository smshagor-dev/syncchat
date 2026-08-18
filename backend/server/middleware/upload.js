const multer = require('multer');

const hardLimitMb = Number(
  process.env.CHAT_UPLOAD_HARD_LIMIT_MB || process.env.CHAT_UPLOAD_LIMIT_MB || 250
);
const chatUploadLimitBytes =
  Number.isFinite(hardLimitMb) && hardLimitMb > 0
    ? hardLimitMb * 1024 * 1024
    : 250 * 1024 * 1024;

// Memory-only ingestion. Persistent bytes are written by the controller directly to FTP.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: chatUploadLimitBytes,
  },
});

module.exports = upload;
