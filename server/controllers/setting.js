const SettingModel = require('../db/models/setting');
const fs = require('fs');
const crypto = require('crypto');
const { toPlain } = require('../db/utils');
const encrypt = require('../helpers/encrypt');
const decrypt = require('../helpers/decrypt');
const response = require('../helpers/response');
const qrcode = require('qrcode');
const UserModel = require('../db/models/user');
const ProfileModel = require('../db/models/profile');
const AccountExportModel = require('../db/models/accountExport');
const UserSessionModel = require('../db/models/userSession');
const DeviceLinkRequestModel = require('../db/models/deviceLinkRequest');
const PushSubscriptionModel = require('../db/models/pushSubscription');
const Inbox = require('../helpers/models/inbox');
const {
  buildOtpAuthUrl,
  generateSecret,
  verifyToken,
} = require('../helpers/totp');
const {
  RECOVERY_CODE_COUNT,
  generateRecoveryCodes,
  hashRecoveryCodes,
  consumeRecoveryCode,
  countRemainingRecoveryCodes,
} = require('../helpers/recoveryCodes');
const {
  normalizePrivacyChoice,
  normalizePrivacySettingPayload,
} = require('../helpers/privacy');
const { toAbsoluteUploadUrl } = require('../helpers/storage');
const mailer = require('../helpers/mailer');
const { sendSupportMessage } = require('../helpers/supportChat');
const {
  cleanupExpiredExports,
  createAccountExport,
  createEncryptedAccountBackup,
  RESTOREABLE_SECTIONS,
  restoreFromEncryptedBackup,
} = require('../helpers/accountExport');
const {
  listSessions,
  revokeOtherSessions,
  revokeSession,
  serializeSession,
} = require('../helpers/userSessions');
const { getPublicVapidKey } = require('../helpers/pushNotifications');
const { Op } = require('sequelize');

const DEVICE_LINK_TTL_MS = 10 * 60 * 1000;

const generateSixDigitCode = () =>
  String(Math.floor(100000 + Math.random() * 900000));

const cleanupExpiredDeviceLinks = async () => {
  await DeviceLinkRequestModel.update(
    { status: 'expired' },
    {
      where: {
        status: 'pending',
        expiresAt: { [require('sequelize').Op.lte]: new Date() },
      },
    }
  );
};

const maskEmail = (value = '') => {
  const email = String(value || '').trim().toLowerCase();
  const [local = '', domain = ''] = email.split('@');
  if (!local || !domain) return '';
  const head = local.slice(0, 2);
  return `${head}${'*'.repeat(Math.max(local.length - 2, 1))}@${domain}`;
};

const getSafeSetting = (setting) => {
  const plain = toPlain(setting) || null;
  if (!plain) return null;

  delete plain.appLockHash;
  delete plain.twoFactorSecret;
  delete plain.twoFactorRecoveryCodes;
  const recoveryCodes = Array.isArray(setting?.twoFactorRecoveryCodes)
    ? setting.twoFactorRecoveryCodes
    : [];
  const remaining = countRemainingRecoveryCodes(recoveryCodes);
  return normalizePrivacySettingPayload(plain) && {
    ...plain,
    ...normalizePrivacySettingPayload(plain),
    twoFactorRecoveryRemaining: remaining,
    twoFactorRecoveryGeneratedAt: plain.twoFactorRecoveryGeneratedAt || null,
    twoFactorRecoveryRevokedAt: plain.twoFactorRecoveryRevokedAt || null,
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
      'chatSentBubbleBg',
      'chatSentTextColor',
      'chatReceivedBubbleBg',
      'chatReceivedTextColor',
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
        fileUrl,
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
  const archivePath = req.file?.path || null;
  try {
    if (!archivePath) {
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
      archivePath,
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
  } finally {
    if (archivePath && fs.existsSync(archivePath)) {
      await fs.promises.unlink(archivePath).catch(() => {});
    }
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

exports.deviceSessions = async (req, res) => {
  try {
    const sessions = await listSessions({
      userId: req.user._id,
      currentSessionId: req.session?._id || null,
    });

    response({
      res,
      payload: sessions,
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

exports.revokeDeviceSession = async (req, res) => {
  try {
    const session = await UserSessionModel.findOne({
      where: { _id: req.params.sessionId, userId: req.user._id },
    });

    if (!session) {
      response({
        res,
        statusCode: 404,
        success: false,
        message: 'Device session not found',
      });
      return;
    }

    if (req.session?._id === session._id) {
      response({
        res,
        statusCode: 400,
        success: false,
        message: 'Use current device sign out for this session',
      });
      return;
    }

    await revokeSession({ session, reason: 'remote-logout' });

    response({
      res,
      message: 'Device logged out remotely',
      payload: serializeSession(session, req.session?._id || null),
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

exports.revokeCurrentDeviceSession = async (req, res) => {
  try {
    if (!req.session) {
      response({
        res,
        statusCode: 400,
        success: false,
        message: 'Current session is unavailable',
      });
      return;
    }

    await revokeSession({ session: req.session, reason: 'self-logout' });

    response({
      res,
      message: 'Current device signed out',
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

exports.revokeOtherDeviceSessions = async (req, res) => {
  try {
    const count = await revokeOtherSessions({
      userId: req.user._id,
      currentSessionId: req.session?._id || null,
    });

    response({
      res,
      message: count > 0 ? 'Other devices logged out' : 'No other active devices found',
      payload: { count },
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

exports.createDeviceLinkRequest = async (req, res) => {
  try {
    await cleanupExpiredDeviceLinks();
    const user = await UserModel.findOne({
      where: { _id: req.user._id },
      attributes: ['_id', 'fullname', 'email'],
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

    await DeviceLinkRequestModel.update(
      { status: 'cancelled' },
      {
        where: {
          userId: req.user._id,
          status: 'pending',
        },
      }
    );

    const requestRow = await DeviceLinkRequestModel.create({
      userId: req.user._id,
      requesterSessionId: req.session?._id || null,
      pairingToken: require('crypto').randomBytes(24).toString('hex'),
      shortCode: generateSixDigitCode(),
      emailCode: generateSixDigitCode(),
      supportCode: generateSixDigitCode(),
      status: 'pending',
      expiresAt: new Date(Date.now() + DEVICE_LINK_TTL_MS),
    });

    const appOrigin = String(
      req.get('origin') || process.env.APP_ORIGIN || 'http://localhost:3000'
    ).replace(/\/$/, '');
    const linkUrl = `${appOrigin}/?link=${encodeURIComponent(
      requestRow.pairingToken
    )}`;
    const qrImage = await qrcode.toDataURL(linkUrl, {
      width: 260,
      margin: 2,
    });

    const deliveryResults = await Promise.allSettled([
      mailer({
        to: user.email,
        fullname: user.fullname,
        subject: 'Your SyncChat device link email code',
        otp: requestRow.emailCode,
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
            <p>Hello #fullname#,</p>
            <p>Use this email verification code to link a new SyncChat device:</p>
            <h2 style="letter-spacing:0.12em">${requestRow.emailCode}</h2>
            <p>This code expires in 10 minutes.</p>
          </div>
        `,
      }),
      sendSupportMessage({
        userId: req.user._id,
        text: `Device link verification code: ${requestRow.supportCode}\n\nEnter this code on the new device together with the email code. This request expires in 10 minutes.`,
      }),
    ]);

    const emailDelivered = deliveryResults[0]?.status === 'fulfilled';
    const supportDelivered = deliveryResults[1]?.status === 'fulfilled';
    const warnings = [];

    if (!emailDelivered) {
      warnings.push('Email code could not be delivered');
    }
    if (!supportDelivered) {
      warnings.push('Support chat code could not be delivered');
    }

    response({
      res,
      message:
        warnings.length > 0
          ? 'Device link created with delivery warnings'
          : 'Device link request created',
      payload: {
        token: requestRow.pairingToken,
        shortCode: requestRow.shortCode,
        expiresAt: requestRow.expiresAt,
        emailHint: maskEmail(user.email),
        linkUrl,
        qrImage,
        emailDelivered,
        supportDelivered,
        warnings,
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
      twoFactorRecoveryCodes: [],
      twoFactorRecoveryGeneratedAt: null,
      twoFactorRecoveryRevokedAt: new Date(),
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
    const recoveryCode = String(req.body?.recoveryCode || '');

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

    let verified = false;
    if (recoveryCode) {
      const consumed = consumeRecoveryCode(
        Array.isArray(setting.twoFactorRecoveryCodes)
          ? setting.twoFactorRecoveryCodes
          : [],
        recoveryCode
      );
      if (consumed.matched) {
        await setting.update({
          twoFactorRecoveryCodes: consumed.codes,
        });
        verified = true;
      }
    }

    if (!verified && verifyToken({ secret: setting.twoFactorSecret, token: code })) {
      verified = true;
    }

    if (!verified) {
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
      twoFactorRecoveryCodes: [],
      twoFactorRecoveryGeneratedAt: null,
      twoFactorRecoveryRevokedAt: new Date(),
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

exports.getTwoFactorRecoveryStatus = async (req, res) => {
  try {
    const setting = await ensureSetting(req.user._id);
    const codes = Array.isArray(setting.twoFactorRecoveryCodes)
      ? setting.twoFactorRecoveryCodes
      : [];
    response({
      res,
      payload: {
        enabled: !!setting.twoFactorEnabled,
        remaining: countRemainingRecoveryCodes(codes),
        generatedAt: setting.twoFactorRecoveryGeneratedAt || null,
        revokedAt: setting.twoFactorRecoveryRevokedAt || null,
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

exports.generateTwoFactorRecoveryCodes = async (req, res) => {
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

    const codes = generateRecoveryCodes(RECOVERY_CODE_COUNT);
    const generatedAt = new Date();
    await setting.update({
      twoFactorRecoveryCodes: hashRecoveryCodes(codes),
      twoFactorRecoveryGeneratedAt: generatedAt,
      twoFactorRecoveryRevokedAt: null,
    });

    response({
      res,
      message: 'Recovery codes generated',
      payload: {
        codes,
        remaining: codes.length,
        generatedAt,
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

exports.revokeTwoFactorRecoveryCodes = async (req, res) => {
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
      twoFactorRecoveryCodes: [],
      twoFactorRecoveryGeneratedAt: null,
      twoFactorRecoveryRevokedAt: new Date(),
    });

    response({
      res,
      message: 'Recovery codes revoked',
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

exports.getPushPublicKey = async (req, res) => {
  try {
    const publicKey = getPublicVapidKey();
    response({
      res,
      payload: {
        publicKey: publicKey || null,
        configured: !!publicKey,
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

exports.subscribePush = async (req, res) => {
  try {
    const subscription = req.body?.subscription || null;
    const endpoint = String(subscription?.endpoint || '').trim();
    const p256dh = String(subscription?.keys?.p256dh || '').trim();
    const auth = String(subscription?.keys?.auth || '').trim();

    if (!endpoint || !p256dh || !auth) {
      response({
        res,
        statusCode: 400,
        success: false,
        message: 'Invalid push subscription payload',
      });
      return;
    }

    const endpointHash = crypto
      .createHash('sha256')
      .update(endpoint)
      .digest('hex');

    const userAgent = String(
      req.body?.userAgent || req.get('user-agent') || ''
    ).slice(0, 255);
    const deviceLabel = String(req.body?.deviceLabel || '').slice(0, 64);
    const expirationTime =
      subscription?.expirationTime === undefined
        ? null
        : Number(subscription.expirationTime) || null;

    const existing = await PushSubscriptionModel.findOne({
      where: {
        [Op.or]: [{ endpointHash }, { endpoint }],
      },
    });

    if (existing) {
      await existing.update({
        userId: req.user._id,
        p256dh,
        auth,
        expirationTime,
        userAgent,
        deviceLabel,
        lastSeenAt: new Date(),
        endpointHash,
      });
    } else {
      await PushSubscriptionModel.create({
        userId: req.user._id,
        endpoint,
        endpointHash,
        p256dh,
        auth,
        expirationTime,
        userAgent,
        deviceLabel,
        lastSeenAt: new Date(),
      });
    }

    response({
      res,
      message: 'Push subscription saved',
      payload: { endpoint },
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

exports.unsubscribePush = async (req, res) => {
  try {
    const endpoint = String(
      req.body?.endpoint || req.body?.subscription?.endpoint || ''
    ).trim();

    if (!endpoint) {
      response({
        res,
        statusCode: 400,
        success: false,
        message: 'Push subscription endpoint is required',
      });
      return;
    }

    const endpointHash = crypto
      .createHash('sha256')
      .update(endpoint)
      .digest('hex');

    await PushSubscriptionModel.destroy({
      where: {
        userId: req.user._id,
        [Op.or]: [{ endpointHash }, { endpoint }],
      },
    });

    response({
      res,
      message: 'Push subscription removed',
      payload: { endpoint },
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
