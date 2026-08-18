const response = require('../helpers/response');
const UserModel = require('../db/models/user');
const AccountExportModel = require('../db/models/accountExport');
const mailer = require('../helpers/mailer');
const {
  cleanupExpiredExports,
  createAccountExport,
  createEncryptedAccountBackup,
  RESTOREABLE_SECTIONS,
  restoreFromEncryptedBackup,
} = require('../helpers/accountArchive');

exports.accountExportStatus = async (req, res) => {
  try {
    await cleanupExpiredExports();
    const exportRow = await AccountExportModel.findOne({
      where: { userId: req.user._id },
      order: [['createdAt', 'DESC']],
    });
    response({
      res,
      payload: exportRow
        ? {
            requestedAt: exportRow.requestedAt,
            expiresAt: exportRow.expiresAt,
            fileUrl: exportRow.fileUrl,
          }
        : null,
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

exports.requestAccountExport = async (req, res) => {
  try {
    await cleanupExpiredExports();
    const user = await UserModel.findOne({
      where: { _id: req.user._id },
      attributes: ['_id', 'fullname', 'email', 'username'],
    });
    if (!user?.email) {
      response({
        res,
        statusCode: 400,
        success: false,
        message: 'Email address is not configured for this account',
      });
      return;
    }

    const { fileUrl, expiresAt } = await createAccountExport({
      userId: req.user._id,
      username: user.username,
    });
    await mailer({
      to: user.email,
      fullname: user.fullname,
      subject: 'Your SyncChat account information export is ready',
      otp: '',
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
          <p>Hello #fullname#,</p>
          <p>Your requested SyncChat account information export is ready.</p>
          <p><a href="${fileUrl}" style="display:inline-block;padding:12px 18px;background:#25d366;color:#07130a;text-decoration:none;border-radius:999px;font-weight:700">Download account export</a></p>
          <p>This link will expire automatically after ${new Date(expiresAt).toUTCString()}.</p>
          <p>If you did not request this export, you can ignore this email.</p>
        </div>
      `,
    });
    response({
      res,
      message: 'Account information export link has been sent to your email',
      payload: { email: user.email, expiresAt, fileUrl },
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

exports.downloadEncryptedBackup = async (req, res) => {
  try {
    const passphrase = String(req.body?.passphrase || '');
    if (passphrase.length < 8) {
      response({
        res,
        statusCode: 400,
        success: false,
        message: 'Backup password must be at least 8 characters',
      });
      return;
    }
    const user = await UserModel.findOne({
      where: { _id: req.user._id },
      attributes: ['_id', 'username'],
    });
    const backup = await createEncryptedAccountBackup({
      userId: req.user._id,
      username: user?.username || 'user',
      passphrase,
    });
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${backup.fileName.replace(/"/g, '')}"`
    );
    res.setHeader('X-SyncChat-Backup-Sections', backup.availableSections.join(','));
    res.status(200).send(backup.buffer);
  } catch (error0) {
    response({
      res,
      statusCode: error0.statusCode || 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.restoreEncryptedBackup = async (req, res) => {
  try {
    const archiveBuffer = req.file?.buffer || null;
    if (!Buffer.isBuffer(archiveBuffer)) {
      response({
        res,
        statusCode: 400,
        success: false,
        message: 'Backup archive is required',
      });
      return;
    }
    const passphrase = String(req.body?.passphrase || '');
    if (passphrase.length < 8) {
      response({
        res,
        statusCode: 400,
        success: false,
        message: 'Backup password must be at least 8 characters',
      });
      return;
    }
    const selections = Array.isArray(req.body?.selections)
      ? req.body.selections
      : String(req.body?.selections || '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean);
    const result = await restoreFromEncryptedBackup({
      userId: req.user._id,
      archiveBuffer,
      passphrase,
      selections,
    });
    response({
      res,
      message:
        result.restored.length > 0
          ? `Restored ${result.restored.join(', ')}`
          : 'No matching sections were restored',
      payload: {
        restored: result.restored,
        availableSections: result.availableSections,
        supportedSections: RESTOREABLE_SECTIONS,
        exportedAt: result.exportedAt,
      },
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
