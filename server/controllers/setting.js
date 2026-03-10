const SettingModel = require('../db/models/setting');
const { toPlain } = require('../db/utils');
const encrypt = require('../helpers/encrypt');
const decrypt = require('../helpers/decrypt');
const response = require('../helpers/response');
const qrcode = require('qrcode');
const UserModel = require('../db/models/user');
const ProfileModel = require('../db/models/profile');
const AccountExportModel = require('../db/models/accountExport');
const Inbox = require('../helpers/models/inbox');
const {
  buildOtpAuthUrl,
  generateSecret,
  verifyToken,
} = require('../helpers/totp');
const {
  normalizePrivacyChoice,
  normalizePrivacySettingPayload,
} = require('../helpers/privacy');
const { toAbsoluteUploadUrl } = require('../helpers/storage');
const mailer = require('../helpers/mailer');
const {
  cleanupExpiredExports,
  createAccountExport,
} = require('../helpers/accountExport');

const getSafeSetting = (setting) => {
  const plain = toPlain(setting) || null;
  if (!plain) return null;

  delete plain.appLockHash;
  delete plain.twoFactorSecret;
  return normalizePrivacySettingPayload(plain) && {
    ...plain,
    ...normalizePrivacySettingPayload(plain),
  };
};

const ensureSetting = async (userId) => {
  const [setting] = await SettingModel.findOrCreate({
    where: { userId },
    defaults: { userId },
  });
  return setting;
};

exports.find = async (req, res) => {
  try {
    const setting = await ensureSetting(req.user._id);
    response({
      res,
      payload: getSafeSetting(setting),
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

exports.update = async (req, res) => {
  try {
    const whitelist = [
      'dark',
      'enterToSend',
      'mute',
      'showNotificationBanner',
      'showPopupNotification',
      'showPushNotification',
      'notifyMessages',
      'notifyGroups',
      'notifyStatus',
      'notifyCalls',
      'showNotificationPreviews',
      'outgoingMessageSoundEnabled',
      'keepArchived',
      'mediaQuality',
      'chatWallpaperPreset',
      'chatWallpaperImage',
      'autoDownloadPhotos',
      'autoDownloadAudio',
      'autoDownloadVideos',
      'autoDownloadDocuments',
      'spellCheckEnabled',
      'replaceTextWithEmoji',
      'sortContactByName',
      'blockedUserIds',
      'lastSeenVisibility',
      'onlineVisibility',
      'profilePhotoVisibility',
      'statusVisibility',
      'groupsVisibility',
      'readReceiptsEnabled',
      'messageRequestsEnabled',
      'disableLinkPreviews',
      'securityNotificationsEnabled',
      'cameraEnabled',
      'microphoneEnabled',
      'speakerEnabled',
    ];
    const updates = Object.fromEntries(
      Object.entries(req.body || {}).filter(([key]) => whitelist.includes(key))
    );

    ['lastSeenVisibility', 'onlineVisibility', 'profilePhotoVisibility', 'statusVisibility', 'groupsVisibility'].forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(updates, key)) {
        updates[key] = normalizePrivacyChoice(updates[key]);
      }
    });

    if (Object.prototype.hasOwnProperty.call(updates, 'mediaQuality')) {
      updates.mediaQuality =
        String(updates.mediaQuality || '').toLowerCase() === 'hd'
          ? 'hd'
          : 'standard';
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'chatWallpaperPreset')) {
      const nextPreset = String(updates.chatWallpaperPreset || '');
      updates.chatWallpaperPreset = [
        'whatsapp',
        'plain',
        'sunset',
        'ocean',
        'forest',
        'custom-image',
      ].includes(nextPreset)
        ? nextPreset
        : 'whatsapp';
    }
    const setting = await ensureSetting(req.user._id);
    await setting.update(updates);

    response({
      res,
      message: 'Successfully updated account settings',
      payload: getSafeSetting(setting),
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
          <p>
            <a href="${fileUrl}" style="display:inline-block;padding:12px 18px;background:#25d366;color:#07130a;text-decoration:none;border-radius:999px;font-weight:700">
              Download account export
            </a>
          </p>
          <p>This link will expire automatically after ${new Date(
            expiresAt
          ).toUTCString()}.</p>
          <p>If you did not request this export, you can ignore this email.</p>
        </div>
      `,
    });

    response({
      res,
      message: 'Account information export link has been sent to your email',
      payload: {
        email: user.email,
        expiresAt,
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

exports.blockedContacts = async (req, res) => {
  try {
    const setting = await ensureSetting(req.user._id);
    const blockedIds = Array.isArray(setting?.blockedUserIds)
      ? setting.blockedUserIds
      : [];

    if (blockedIds.length === 0) {
      response({ res, payload: [] });
      return;
    }

    const profiles = await ProfileModel.findAll({
      where: { userId: blockedIds },
      attributes: ['userId', 'username', 'fullname', 'avatar', 'bio', 'phone'],
    });

    const payload = profiles.map((profile) => ({
      ...toPlain(profile),
      avatar: toAbsoluteUploadUrl(profile.avatar),
    }));

    response({ res, payload });
  } catch (error0) {
    response({
      res,
      statusCode: error0.statusCode || 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.hiddenChats = async (req, res) => {
  try {
    const inboxes = await Inbox.find(
      { ownersId: req.user._id },
      '',
      { includeHidden: true }
    );

    const payload = inboxes.filter((inbox) =>
      Array.isArray(inbox.hiddenBy) && inbox.hiddenBy.includes(req.user._id)
    );

    response({ res, payload });
  } catch (error0) {
    response({
      res,
      statusCode: error0.statusCode || 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.setAppLock = async (req, res) => {
  try {
    const setting = await ensureSetting(req.user._id);
    const password = String(req.body?.password || '');

    if (password.length < 4) {
      response({
        res,
        statusCode: 400,
        success: false,
        message: 'Password must be at least 4 characters',
      });
      return;
    }

    await setting.update({
      appLockEnabled: true,
      appLockHash: encrypt(password),
    });

    response({
      res,
      message: 'App lock enabled',
      payload: getSafeSetting(setting),
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

exports.verifyAppLock = async (req, res) => {
  try {
    const setting = await ensureSetting(req.user._id);

    if (!setting.appLockEnabled) {
      response({
        res,
        message: 'App lock is disabled',
        payload: { verified: true, locked: false },
      });
      return;
    }

    const password = String(req.body?.password || '');
    if (!password) {
      response({
        res,
        statusCode: 400,
        success: false,
        message: 'Password is required',
      });
      return;
    }

    if (!setting.appLockHash) {
      response({
        res,
        statusCode: 500,
        success: false,
        message: 'App lock is misconfigured',
      });
      return;
    }

    decrypt(password, setting.appLockHash);

    response({
      res,
      message: 'App unlocked',
      payload: { verified: true, locked: true },
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

exports.changeAppLockPassword = async (req, res) => {
  try {
    const setting = await ensureSetting(req.user._id);

    if (!setting.appLockEnabled || !setting.appLockHash) {
      response({
        res,
        statusCode: 400,
        success: false,
        message: 'App lock is not enabled',
      });
      return;
    }

    const oldPassword = String(req.body?.oldPassword || '');
    const newPassword = String(req.body?.newPassword || '');

    if (newPassword.length < 4) {
      response({
        res,
        statusCode: 400,
        success: false,
        message: 'New password must be at least 4 characters',
      });
      return;
    }

    decrypt(oldPassword, setting.appLockHash);

    await setting.update({
      appLockHash: encrypt(newPassword),
    });

    response({
      res,
      message: 'App lock password updated',
      payload: getSafeSetting(setting),
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

exports.removeAppLock = async (req, res) => {
  try {
    const setting = await ensureSetting(req.user._id);

    if (!setting.appLockEnabled) {
      response({
        res,
        message: 'App lock already disabled',
        payload: getSafeSetting(setting),
      });
      return;
    }

    const password = String(req.body?.password || '');
    if (!password) {
      response({
        res,
        statusCode: 400,
        success: false,
        message: 'Password is required',
      });
      return;
    }

    if (!setting.appLockHash) {
      response({
        res,
        statusCode: 500,
        success: false,
        message: 'App lock is misconfigured',
      });
      return;
    }

    decrypt(password, setting.appLockHash);

    await setting.update({
      appLockEnabled: false,
      appLockHash: null,
    });

    response({
      res,
      message: 'App lock removed',
      payload: getSafeSetting(setting),
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

exports.setupTwoFactor = async (req, res) => {
  try {
    const setting = await ensureSetting(req.user._id);
    const user = await UserModel.findOne({ where: { _id: req.user._id } });

    if (!user) {
      response({
        res,
        statusCode: 404,
        success: false,
        message: 'User not found',
      });
      return;
    }

    const secret = generateSecret();
    const otpauthUrl = buildOtpAuthUrl({
      secret,
      email: user.email,
      issuer: 'SyncChat',
    });
    const qrCode = await qrcode.toDataURL(otpauthUrl);

    await setting.update({
      twoFactorSecret: secret,
      twoFactorEnabled: false,
    });

    response({
      res,
      message: 'Two-factor setup created',
      payload: {
        secret,
        qrCode,
        otpauthUrl,
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

exports.enableTwoFactor = async (req, res) => {
  try {
    const setting = await ensureSetting(req.user._id);
    const code = String(req.body?.code || '');

    if (!setting.twoFactorSecret) {
      response({
        res,
        statusCode: 400,
        success: false,
        message: 'Two-factor setup is not initialized',
      });
      return;
    }

    if (!verifyToken({ secret: setting.twoFactorSecret, token: code })) {
      response({
        res,
        statusCode: 400,
        success: false,
        message: 'Invalid authentication code',
      });
      return;
    }

    await setting.update({
      twoFactorEnabled: true,
    });

    response({
      res,
      message: 'Two-factor authentication enabled',
      payload: getSafeSetting(setting),
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

exports.disableTwoFactor = async (req, res) => {
  try {
    const setting = await ensureSetting(req.user._id);
    const user = await UserModel.findOne({ where: { _id: req.user._id } });
    const password = String(req.body?.password || '');
    const code = String(req.body?.code || '');

    if (!setting.twoFactorEnabled || !setting.twoFactorSecret) {
      response({
        res,
        statusCode: 400,
        success: false,
        message: 'Two-factor authentication is not enabled',
      });
      return;
    }

    decrypt(password, user.password);

    if (!verifyToken({ secret: setting.twoFactorSecret, token: code })) {
      response({
        res,
        statusCode: 400,
        success: false,
        message: 'Invalid authentication code',
      });
      return;
    }

    await setting.update({
      twoFactorEnabled: false,
      twoFactorSecret: null,
    });

    response({
      res,
      message: 'Two-factor authentication disabled',
      payload: getSafeSetting(setting),
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
