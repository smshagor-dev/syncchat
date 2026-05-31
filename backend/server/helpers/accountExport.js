const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const UserModel = require('../db/models/user');
const ProfileModel = require('../db/models/profile');
const SettingModel = require('../db/models/setting');
const ContactModel = require('../db/models/contact');
const GroupModel = require('../db/models/group');
const CommunityModel = require('../db/models/community');
const InboxModel = require('../db/models/inbox');
const ChatModel = require('../db/models/chat');
const FileModel = require('../db/models/file');
const StatusModel = require('../db/models/status');
const AccountExportModel = require('../db/models/accountExport');
const { toPlain, toPlainMany, asArray } = require('../db/utils');
const {
  toAbsoluteUploadUrl,
  toPublicUrl,
  resolveLocalUploadPath,
  uploadRootDir,
  saveBufferFile,
} = require('./storage');
const { normalizePrivacySettingPayload } = require('./privacy');
const { isSecretEnabled } = require('./secretChat');

const execFileAsync = promisify(execFile);
const EXPORT_LIFETIME_MS = 48 * 60 * 60 * 1000;
const ENCRYPTED_BACKUP_VERSION = 1;
const RESTOREABLE_SECTIONS = ['profile', 'settings', 'contacts', 'statuses'];

const safeFileName = (value = '', fallback = 'file') => {
  const normalized = String(value || '')
    .trim()
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
};

const ensureDir = async (dir) => {
  await fs.promises.mkdir(dir, { recursive: true });
};

const writeJson = async (targetPath, payload) => {
  await fs.promises.writeFile(
    targetPath,
    JSON.stringify(payload, null, 2),
    'utf8'
  );
};

const readJson = async (targetPath) =>
  JSON.parse(await fs.promises.readFile(targetPath, 'utf8'));

const copyLocalFileIfExists = async ({ sourceUrl, targetDir, usedPaths }) => {
  const absolute = resolveLocalUploadPath(sourceUrl);
  if (!absolute || !fs.existsSync(absolute)) return null;

  const normalizedSource = path.normalize(absolute);
  if (usedPaths.has(normalizedSource)) {
    return usedPaths.get(normalizedSource);
  }

  const targetName = safeFileName(path.basename(absolute), 'asset.bin');
  let finalName = targetName;
  let counter = 1;
  while (fs.existsSync(path.join(targetDir, finalName))) {
    const ext = path.extname(targetName);
    const base = path.basename(targetName, ext);
    finalName = `${base}-${counter}${ext}`;
    counter += 1;
  }

  await fs.promises.copyFile(absolute, path.join(targetDir, finalName));
  usedPaths.set(normalizedSource, finalName);
  return finalName;
};

const compressDirectoryToZip = async ({ sourceDir, zipPath }) => {
  const sourcePattern = path.join(sourceDir, '*');
  await execFileAsync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `Compress-Archive -Path '${sourcePattern.replace(/'/g, "''")}' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`,
    ],
    { windowsHide: true }
  );
};

const expandZipToDirectory = async ({ zipPath, targetDir }) => {
  await ensureDir(targetDir);
  await execFileAsync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${targetDir.replace(/'/g, "''")}' -Force`,
    ],
    { windowsHide: true }
  );
};

const deriveKey = (passphrase, salt) =>
  new Promise((resolve, reject) => {
    crypto.scrypt(passphrase, salt, 32, (error0, derivedKey) => {
      if (error0) reject(error0);
      else resolve(derivedKey);
    });
  });

const encryptBackupBuffer = async ({ buffer, passphrase, fileName }) => {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = await deriveKey(passphrase, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.from(
    JSON.stringify({
      format: 'syncchat-encrypted-backup',
      version: ENCRYPTED_BACKUP_VERSION,
      algorithm: 'aes-256-gcm',
      kdf: 'scrypt',
      fileName,
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    }),
    'utf8'
  );
};

const decryptBackupBuffer = async ({ buffer, passphrase }) => {
  let payload;
  try {
    payload = JSON.parse(buffer.toString('utf8'));
  } catch (error0) {
    throw new Error('Invalid backup archive format');
  }

  if (
    payload?.format !== 'syncchat-encrypted-backup' ||
    Number(payload?.version) !== ENCRYPTED_BACKUP_VERSION
  ) {
    throw new Error('Unsupported backup archive format');
  }

  const key = await deriveKey(
    passphrase,
    Buffer.from(String(payload.salt || ''), 'base64')
  );
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(String(payload.iv || ''), 'base64')
  );
  decipher.setAuthTag(Buffer.from(String(payload.tag || ''), 'base64'));

  try {
    return {
      fileName: payload.fileName || 'backup.zip',
      buffer: Buffer.concat([
        decipher.update(Buffer.from(String(payload.ciphertext || ''), 'base64')),
        decipher.final(),
      ]),
    };
  } catch (error0) {
    throw new Error('Invalid backup password or corrupted archive');
  }
};

const cleanupExpiredExports = async () => {
  const expired = await AccountExportModel.findAll({
    where: { expiresAt: { [Op.lte]: new Date() } },
  });
  if (expired.length === 0) return;

  await Promise.all(
    expired.map(async (row) => {
      const filePath = resolveLocalUploadPath(row.fileUrl);
      if (filePath && fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath).catch(() => {});
      }
      await row.destroy();
    })
  );
};

const buildExportBundle = async (userId) => {
  await cleanupExpiredExports();

  const [userDoc, profileDoc, settingDoc, contactsRaw, groupsRaw, communitiesRaw, inboxesRaw, statusesRaw] =
    await Promise.all([
      UserModel.findOne({
        where: { _id: userId },
        attributes: ['_id', 'username', 'fullname', 'email', 'verified', 'createdAt', 'updatedAt'],
      }),
      ProfileModel.findOne({ where: { userId } }),
      SettingModel.findOne({ where: { userId } }),
      ContactModel.findAll({ where: { userId } }),
      GroupModel.findAll(),
      CommunityModel.findAll(),
      InboxModel.findAll(),
      StatusModel.findAll({ where: { userId } }),
    ]);

  const user = toPlain(userDoc);
  const profile = toPlain(profileDoc);
  const setting = normalizePrivacySettingPayload(toPlain(settingDoc) || {});
  const contacts = toPlainMany(contactsRaw);
  const allGroups = toPlainMany(groupsRaw);
  const groups = allGroups.filter((group) => asArray(group.participantsId).includes(userId));
  const communities = toPlainMany(communitiesRaw).filter((community) =>
    asArray(community.membersId).includes(userId)
  );
  const inboxes = toPlainMany(inboxesRaw).filter(
    (inbox) =>
      asArray(inbox.ownersId).includes(userId) &&
      !asArray(inbox.deletedBy).includes(userId) &&
      !(isSecretEnabled(inbox) && inbox.secretExportBlocked)
  );
  const roomIds = inboxes.map((item) => item.roomId);
  const chatsRaw = roomIds.length
    ? await ChatModel.findAll({
        where: { roomId: { [Op.in]: roomIds } },
        order: [['createdAt', 'ASC']],
      })
    : [];
  const chats = toPlainMany(chatsRaw).filter(
    (chat) => !asArray(chat.deletedBy).includes(userId)
  );
  const fileIds = [...new Set(chats.map((chat) => chat.fileId).filter(Boolean))];
  const filesRaw = fileIds.length
    ? await FileModel.findAll({ where: { fileId: { [Op.in]: fileIds } } })
    : [];
  const files = toPlainMany(filesRaw).map((file) => ({
    ...file,
    url: toAbsoluteUploadUrl(file.url),
  }));
  const statuses = toPlainMany(statusesRaw).map((status) => ({
    ...status,
    mediaUrl: toAbsoluteUploadUrl(status.mediaUrl),
  }));

  return {
    user,
    profile: {
      ...profile,
      avatar: toAbsoluteUploadUrl(profile?.avatar),
    },
    settings: setting,
    contacts,
    groups: groups.map((group) => ({
      ...group,
      avatar: toAbsoluteUploadUrl(group.avatar),
      passwordHash: undefined,
    })),
    communities: communities.map((community) => ({
      ...community,
      avatar: toAbsoluteUploadUrl(community.avatar),
    })),
    inboxes,
    messages: chats,
    media: files,
    statuses,
  };
};

const createExportPackage = async ({
  data,
  requestTime,
  tempDir,
  expiresAt = null,
}) => {
  const assetsDir = path.join(tempDir, 'assets');
  await ensureDir(tempDir);
  await ensureDir(assetsDir);

  const copiedAssets = new Map();
  const assetRefs = [];
  const collectAsset = async (sourceUrl, label) => {
    const filename = await copyLocalFileIfExists({
      sourceUrl,
      targetDir: assetsDir,
      usedPaths: copiedAssets,
    });
    if (filename) {
      assetRefs.push({
        label,
        sourceUrl: toAbsoluteUploadUrl(sourceUrl),
        relativePath: `assets/${filename}`,
      });
    }
  };

  await Promise.all([
    collectAsset(data.profile?.avatar, 'profile-avatar'),
    ...data.groups.map((group) => collectAsset(group.avatar, `group-${group._id}`)),
    ...data.communities.map((community) =>
      collectAsset(community.avatar, `community-${community._id}`)
    ),
    ...data.statuses.map((status) => collectAsset(status.mediaUrl, `status-${status._id}`)),
    ...data.media.map((file) => collectAsset(file.url, `file-${file.fileId}`)),
  ]);

  await Promise.all([
    writeJson(path.join(tempDir, 'account.json'), {
      exportedAt: requestTime.toISOString(),
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      supportedRestoreSections: RESTOREABLE_SECTIONS,
      ...data,
    }),
    writeJson(path.join(tempDir, 'assets.json'), assetRefs),
    writeJson(path.join(tempDir, 'readme.json'), {
      note: 'This export contains your account data snapshot from SyncChat.',
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      uploadRootDir,
    }),
  ]);
};

const restoreAssetFromBundle = async ({
  assetRefs = [],
  sourceUrl,
  tempDir,
  folder,
  filenamePrefix,
}) => {
  if (!sourceUrl) return null;
  const match = assetRefs.find(
    (item) =>
      item?.sourceUrl === sourceUrl ||
      item?.label === sourceUrl ||
      item?.relativePath === sourceUrl
  );
  if (!match?.relativePath) return null;

  const absoluteAssetPath = path.join(tempDir, match.relativePath);
  if (!fs.existsSync(absoluteAssetPath)) return null;

  const originalName = path.basename(match.relativePath);
  const ext = path.extname(originalName) || '.bin';
  const buffer = await fs.promises.readFile(absoluteAssetPath);
  const saved = await saveBufferFile({
    buffer,
    folder,
    filename: `${filenamePrefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`,
  });
  return saved.url;
};

const restoreProfileSection = async ({ userId, account, assetRefs, tempDir }) => {
  const profile = account?.profile || null;
  if (!profile) return false;

  const profileDoc = await ProfileModel.findOne({ where: { userId } });
  if (!profileDoc) return false;

  const nextAvatar = await restoreAssetFromBundle({
    assetRefs,
    sourceUrl: profile.avatar,
    tempDir,
    folder: 'avatars',
    filenamePrefix: userId,
  });

  const profileUpdate = {
    fullname: String(profile.fullname || profileDoc.fullname || '').slice(0, 32),
    bio: String(profile.bio || ''),
    phone: String(profile.phone || ''),
    dialCode: String(profile.dialCode || ''),
    socialAccounts: Array.isArray(profile.socialAccounts) ? profile.socialAccounts : [],
  };
  if (nextAvatar) profileUpdate.avatar = nextAvatar;

  await profileDoc.update(profileUpdate);
  await UserModel.update(
    { fullname: profileUpdate.fullname || profileDoc.fullname },
    { where: { _id: userId } }
  );
  return true;
};

const restoreSettingsSection = async ({ userId, account }) => {
  const safeSettings = account?.settings || null;
  if (!safeSettings) return false;

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
    Object.entries(safeSettings).filter(([key]) => whitelist.includes(key))
  );

  const [setting] = await SettingModel.findOrCreate({
    where: { userId },
    defaults: { userId },
  });
  await setting.update(updates);
  return true;
};

const restoreContactsSection = async ({ userId, account }) => {
  const contacts = Array.isArray(account?.contacts) ? account.contacts : [];
  if (contacts.length === 0) return false;

  const friendIds = [...new Set(contacts.map((item) => item?.friendId).filter(Boolean))];
  const existingUsers = await UserModel.findAll({
    where: { _id: { [Op.in]: friendIds } },
    attributes: ['_id'],
  });
  const validFriendIds = new Set(existingUsers.map((item) => item._id));

  for (const contact of contacts) {
    if (!validFriendIds.has(contact.friendId)) continue;
    // eslint-disable-next-line no-await-in-loop
    await ContactModel.findOrCreate({
      where: {
        userId,
        friendId: contact.friendId,
      },
      defaults: {
        userId,
        friendId: contact.friendId,
        roomId: contact.roomId || uuidv4(),
      },
    });
  }

  return true;
};

const restoreStatusesSection = async ({ userId, account, assetRefs, tempDir }) => {
  const statuses = Array.isArray(account?.statuses) ? account.statuses : [];
  if (statuses.length === 0) return false;

  await StatusModel.destroy({ where: { userId } });

  const nextExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
  for (const status of statuses) {
    const nextMediaUrl = status.mediaUrl
      ? // eslint-disable-next-line no-await-in-loop
        await restoreAssetFromBundle({
          assetRefs,
          sourceUrl: status.mediaUrl,
          tempDir,
          folder: `chat/${userId}`,
          filenamePrefix: `status-${userId}`,
        })
      : null;

    // eslint-disable-next-line no-await-in-loop
    await StatusModel.create({
      userId,
      type: ['text', 'photo', 'video'].includes(status.type) ? status.type : 'text',
      text: String(status.text || ''),
      bgColor: String(status.bgColor || '#0ea5e9'),
      mediaUrl: nextMediaUrl,
      mentionUserIds: Array.isArray(status.mentionUserIds) ? status.mentionUserIds : [],
      views: [],
      reactions: [],
      replies: [],
      expiresAt: nextExpiry,
    });
  }

  return true;
};

const restoreFromEncryptedBackup = async ({
  userId,
  archivePath,
  passphrase,
  selections = [],
}) => {
  const encryptedBuffer = await fs.promises.readFile(archivePath);
  const decrypted = await decryptBackupBuffer({ buffer: encryptedBuffer, passphrase });

  const tempRoot = path.join(
    os.tmpdir(),
    `syncchat-restore-${userId}-${crypto.randomBytes(8).toString('hex')}`
  );
  try {
    const zipPath = path.join(tempRoot, decrypted.fileName || 'backup.zip');
    const extractDir = path.join(tempRoot, 'archive');
    await ensureDir(tempRoot);
    await fs.promises.writeFile(zipPath, decrypted.buffer);
    await expandZipToDirectory({ zipPath, targetDir: extractDir });

    const account = await readJson(path.join(extractDir, 'account.json'));
    const assetRefs = await readJson(path.join(extractDir, 'assets.json')).catch(() => []);
    const requestedSections = Array.isArray(selections) && selections.length
      ? selections.filter((item) => RESTOREABLE_SECTIONS.includes(item))
      : RESTOREABLE_SECTIONS;

    const restored = [];
    if (
      requestedSections.includes('profile') &&
      (await restoreProfileSection({ userId, account, assetRefs, tempDir: extractDir }))
    ) {
      restored.push('profile');
    }
    if (
      requestedSections.includes('settings') &&
      (await restoreSettingsSection({ userId, account }))
    ) {
      restored.push('settings');
    }
    if (
      requestedSections.includes('contacts') &&
      (await restoreContactsSection({ userId, account }))
    ) {
      restored.push('contacts');
    }
    if (
      requestedSections.includes('statuses') &&
      (await restoreStatusesSection({ userId, account, assetRefs, tempDir: extractDir }))
    ) {
      restored.push('statuses');
    }

    return {
      restored,
      exportedAt: account.exportedAt || null,
      availableSections: RESTOREABLE_SECTIONS.filter((item) => {
        if (item === 'profile') return !!account.profile;
        if (item === 'settings') return !!account.settings;
        if (item === 'contacts') return Array.isArray(account.contacts) && account.contacts.length > 0;
        if (item === 'statuses') return Array.isArray(account.statuses) && account.statuses.length > 0;
        return false;
      }),
    };
  } finally {
    await fs.promises.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
  }
};

const createAccountExport = async ({ userId, username = 'user' }) => {
  const data = await buildExportBundle(userId);
  const token = crypto.randomBytes(24).toString('hex');
  const requestTime = new Date();
  const expiresAt = new Date(requestTime.getTime() + EXPORT_LIFETIME_MS);

  const tempDir = path.join(os.tmpdir(), `syncchat-export-${token}`);
  await createExportPackage({
    data,
    requestTime,
    expiresAt,
    tempDir,
  });

  const zipFolder = path.join(uploadRootDir, 'account-exports', safeFileName(username, userId));
  await ensureDir(zipFolder);
  const zipFileName = `${token}.zip`;
  const zipPath = path.join(zipFolder, zipFileName);
  await compressDirectoryToZip({ sourceDir: tempDir, zipPath });

  await fs.promises.rm(tempDir, { recursive: true, force: true });

  const publicPath = `/uploads/account-exports/${safeFileName(username, userId)}/${zipFileName}`.replace(
    /\\/g,
    '/'
  );
  const fileUrl = toPublicUrl(publicPath);

  const exportRow = await AccountExportModel.create({
    userId,
    token,
    fileUrl,
    requestedAt: requestTime,
    expiresAt,
  });

  return {
    exportRow,
    token,
    fileUrl,
    expiresAt,
  };
};

const createEncryptedAccountBackup = async ({
  userId,
  username = 'user',
  passphrase,
}) => {
  if (String(passphrase || '').length < 8) {
    throw new Error('Backup password must be at least 8 characters');
  }

  const data = await buildExportBundle(userId);
  const token = crypto.randomBytes(18).toString('hex');
  const requestTime = new Date();
  const tempDir = path.join(os.tmpdir(), `syncchat-backup-${token}`);
  const zipPath = path.join(tempDir, `${safeFileName(username, userId)}-backup.zip`);
  await createExportPackage({
    data,
    requestTime,
    tempDir: path.join(tempDir, 'package'),
  });
  await compressDirectoryToZip({ sourceDir: path.join(tempDir, 'package'), zipPath });
  const zipBuffer = await fs.promises.readFile(zipPath);
  const encryptedBuffer = await encryptBackupBuffer({
    buffer: zipBuffer,
    passphrase,
    fileName: path.basename(zipPath),
  });
  await fs.promises.rm(tempDir, { recursive: true, force: true });

  return {
    buffer: encryptedBuffer,
    fileName: `${safeFileName(username, userId)}-${requestTime.getTime()}.syncbackup`,
    exportedAt: requestTime,
    availableSections: RESTOREABLE_SECTIONS,
  };
};

module.exports = {
  EXPORT_LIFETIME_MS,
  RESTOREABLE_SECTIONS,
  cleanupExpiredExports,
  createAccountExport,
  createEncryptedAccountBackup,
  restoreFromEncryptedBackup,
};
