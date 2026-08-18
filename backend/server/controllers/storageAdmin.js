const response = require('../helpers/response');
const {
  getStorageConfigForAdmin,
  saveStorageConfig,
  mergeStorageInput,
} = require('../helpers/storageConfig');
const { testFtpConnection } = require('../helpers/storage');
const { logAdminAction } = require('../helpers/adminAudit');

const safeError = (error0) => {
  const message = String(error0?.message || 'FTP operation failed');
  return message.replace(/(password|pass)=([^&\s]+)/gi, '$1=***');
};

exports.getFtpConfig = async (req, res) => {
  try {
    const payload = await getStorageConfigForAdmin();
    response({ res, payload });
  } catch (error0) {
    response({
      res,
      statusCode: 500,
      success: false,
      message: safeError(error0),
    });
  }
};

exports.updateFtpConfig = async (req, res) => {
  try {
    const payload = await saveStorageConfig(req.body || {});
    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'storage.ftp.update',
      entityType: 'storage',
      entityId: 'ftp',
    }).catch(() => {});
    response({
      res,
      message: 'FTP storage configuration saved',
      payload,
    });
  } catch (error0) {
    response({
      res,
      statusCode: 400,
      success: false,
      message: safeError(error0),
    });
  }
};

exports.testFtpConfig = async (req, res) => {
  try {
    const merged = await mergeStorageInput(req.body || {});
    const payload = await testFtpConnection(merged);
    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'storage.ftp.test',
      entityType: 'storage',
      entityId: 'ftp',
      metadata: { success: true, latencyMs: payload.latencyMs },
    }).catch(() => {});
    response({
      res,
      message: payload.message,
      payload,
    });
  } catch (error0) {
    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'storage.ftp.test',
      entityType: 'storage',
      entityId: 'ftp',
      metadata: { success: false },
    }).catch(() => {});
    response({
      res,
      statusCode: 400,
      success: false,
      message: safeError(error0),
    });
  }
};
