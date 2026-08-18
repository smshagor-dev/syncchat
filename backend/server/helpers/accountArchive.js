const crypto = require('crypto');
const path = require('path');
const JSZip = require('jszip');
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
  saveBufferFile,
  readStorageFileToBuffer,
  deleteStorageFileByUrl,
} = require('./storage');
const { normalizePrivacySettingPayload } = require('./privacy');
const { isSecretEnabled } = require('./secretChat');

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

const extensionFromUrl = (sourceUrl = '') => {
  try {
    const pathname = new URL(String(sourceUrl)).pathname;
    const ext = path.posix.extname(pathname);
    return /^\.[a-z0-9]{1,12}$/i.test(ext) ? ext : '.bin';
  } catch (error0) {
    const ext = path.posix.extname(String(sourceUrl || '').split('?')[0]);
    return /^\.[a-z0-9]{1,12}$/i.test(ext) ? ext : '.bin';
  }
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
  for (const row of expired) {
    if (row.fileUrl) {
      // eslint-disable-next-line no-await-in-loop
      await deleteStorageFileByUrl(row.fileUrl).catch(() => false);
    }
    // eslint-disable-next-line no-await-in-loop
    await row.destroy();
  }
};

const buildExportBundle = async (userId) => {
  await cleanupExpiredExports();
  const [
    userDoc,
    profileDoc,
    settingDoc,
    contactsRaw,
    groupsRaw,
    communitiesRaw,
    inboxesRaw,
    statusesRaw,
  ] = await Promise.all([
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
  const groups = toPlainMany(groupsRaw).filter((group) =>
    asArray(group.participantsId).includes(userId)
  );
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
    thumbnailUrl: toAbsoluteUploadUrl(file.thumbnailUrl),
    streamUrl: toAbsoluteUploadUrl(file.streamUrl),
    streamHdUrl: toAbsoluteUploadUrl(file.streamHdUrl),
  }));
  const statuses = toPlainMany(statusesRaw).map((status) => ({
    ...status,
    mediaUrl: toAbsoluteUploadUrl(status.mediaUrl),
  }));

  return {
    user,
    profile: { ...profile, avatar: toAbsoluteUploadUrl(profile?.avatar) },
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

const assetCandidates = (data) => [
  { sourceUrl: data.profile?.avatar, label: 'profile-avatar' },
  ...data.groups.map((group) => ({ sourceUrl: group.avatar, label: `group-${group._id}` })),
  ...data.communities.map((community) => ({
    sourceUrl: community.avatar,
    label: `community-${community._id}`,
  })),
  ...data.statuses.map((status) => ({ sourceUrl: status.mediaUrl, label: `status-${status._id}` })),
  ...data.media.flatMap((file) => [
    { sourceUrl: file.url, label: `file-${file.fileId}` },
    { sourceUrl: file.thumbnailUrl, label: `file-${file.fileId}-thumb` },
    { sourceUrl: file.streamUrl, label: `file-${file.fileId}-stream` },
    { sourceUrl: file.streamHdUrl, label: `file-${file.fileId}-stream-hd` },
  ]),
];

const buildZipBuffer = async ({ data, requestTime, expiresAt = null }) => {
  const zip = new JSZip();
  const assetRefs = [];
  const usedUrls = new Map();
  let counter = 0;

  for (const item of assetCandidates(data)) {
    const sourceUrl = toAbsoluteUploadUrl(item.sourceUrl || '');
    if (!sourceUrl) continue;
    if (usedUrls.has(sourceUrl)) {
      assetRefs.push({ label: item.label, sourceUrl, relativePath: usedUrls.get(sourceUrl) });
      continue;
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      const buffer = await readStorageFileToBuffer(sourceUrl);
      counter += 1;
      const relativePath = `assets/${String(counter).padStart(6, '0')}-${safeFileName(
        item.label,
        'asset'
      )}${extensionFromUrl(sourceUrl)}`;
      zip.file(relativePath, buffer);
      usedUrls.set(sourceUrl, relativePath);
      assetRefs.push({ label: item.label, sourceUrl, relativePath });
    } catch (error0) {
      // Old/external media may be missing; keep the data export usable.
    }
  }

  zip.file(
    'account.json',
    JSON.stringify(
      {
        exportedAt: requestTime.toISOString(),
        expiresAt: expiresAt ? expiresAt.toISOString() : null,
        supportedRestoreSections: RESTOREABLE_SECTIONS,
        ...data,
      },
      null,
      2
    )
  );
  zip.file('assets.json', JSON.stringify(assetRefs, null, 2));
  zip.file(
    'readme.json',
    JSON.stringify(
      {
        note: 'This export contains your account data snapshot from SyncChat.',
        storage: 'ftp',
        expiresAt: expiresAt ? expiresAt.toISOString() : null,
      },
      null,
      2
    )
  );
  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
};

const readZipJson = async (zip, name, fallback = null) => {
  const file = zip.file(name);
  if (!file) return fallback;
  try {
    return JSON.parse(await file.async('string'));
  } catch (error0) {
    return fallback;
  }
};

const restoreAssetFromZip = async ({ zip, assetRefs = [], sourceUrl, folder, filenamePrefix }) => {
  if (!sourceUrl) return null;
  const match = assetRefs.find(
    (item) =>
      item?.sourceUrl === sourceUrl ||
      item?.label === sourceUrl ||
      item?.relativePath === sourceUrl
  );
  if (!match?.relativePath) return null;
  const file = zip.file(match.relativePath);
  if (!file) return null;
  const buffer = await file.async('nodebuffer');
  const ext = path.posix.extname(match.relativePath) || '.bin';
  const saved = await saveBufferFile({
    buffer,
    folder,
    filename: `${filenamePrefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`,
  });
  return saved.url;
};

const restoreProfileSection = async ({ userId, account, assetRefs, zip }) => {
  const profile = account?.profile || null;
  if (!profile) return false;
  const profileDoc = await ProfileModel.findOne({ where: { userId } });
  if (!profileDoc) return false;
  const nextAvatar = await restoreAssetFromZip({
    zip,
    assetRefs,
    sourceUrl: profile.avatar,
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
    'dark', 'enterToSend', 'mute', 'showNotificationBanner', 'showPopupNotification',
    'showPushNotification', 'notifyMessages', 'notifyGroups', 'notifyStatus', 'notifyCalls',
    'showNotificationPreviews', 'outgoingMessageSoundEnabled', 'keepArchived', 'mediaQuality',
    'chatWallpaperPreset', 'chatWallpaperImage', 'autoDownloadPhotos', 'autoDownloadAudio',
    'autoDownloadVideos', 'autoDownloadDocuments', 'spellCheckEnabled', 'replaceTextWithEmoji',
    'sortContactByName', 'blockedUserIds', 'lastSeenVisibility', 'onlineVisibility',
    'profilePhotoVisibility', 'statusVisibility', 'groupsVisibility', 'readReceiptsEnabled',
    'messageRequestsEnabled', 'disableLinkPreviews', 'securityNotificationsEnabled',
    'cameraEnabled', 'microphoneEnabled', 'speakerEnabled',
  ];
  const updates = Object.fromEntries(
    Object.entries(safeSettings).filter(([key]) => whitelist.includes(key))
  );
  const [setting] = await SettingModel.findOrCreate({ where: { userId }, defaults: { userId } });
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
      where: { userId, friendId: contact.friendId },
      defaults: { userId, friendId: contact.friendId, roomId: contact.roomId || uuidv4() },
    });
  }
  return true;
};

const restoreStatusesSection = async ({ userId, account, assetRefs, zip }) => {
  const statuses = Array.isArray(account?.statuses) ? account.statuses : [];
  if (statuses.length === 0) return false;
  await StatusModel.destroy({ where: { userId } });
  const nextExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
  for (const status of statuses) {
    const nextMediaUrl = status.mediaUrl
      ? // eslint-disable-next-line no-await-in-loop
        await restoreAssetFromZip({
          zip,
          assetRefs,
          sourceUrl: status.mediaUrl,
          folder: `chat/${safeFileName(userId, 'user')}`,
          filenamePrefix: `status-${safeFileName(userId, 'user')}`,
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
  archiveBuffer,
  passphrase,
  selections = [],
}) => {
  if (!Buffer.isBuffer(archiveBuffer)) {
    throw new Error('Backup archive must be uploaded in memory');
  }
  const decrypted = await decryptBackupBuffer({ buffer: archiveBuffer, passphrase });
  const zip = await JSZip.loadAsync(decrypted.buffer);
  const account = await readZipJson(zip, 'account.json');
  if (!account) throw new Error('Backup archive is missing account.json');
  const assetRefs = (await readZipJson(zip, 'assets.json', [])) || [];
  const requestedSections = Array.isArray(selections) && selections.length
    ? selections.filter((item) => RESTOREABLE_SECTIONS.includes(item))
    : RESTOREABLE_SECTIONS;
  const restored = [];
  if (
    requestedSections.includes('profile') &&
    (await restoreProfileSection({ userId, account, assetRefs, zip }))
  ) restored.push('profile');
  if (
    requestedSections.includes('settings') &&
    (await restoreSettingsSection({ userId, account }))
  ) restored.push('settings');
  if (
    requestedSections.includes('contacts') &&
    (await restoreContactsSection({ userId, account }))
  ) restored.push('contacts');
  if (
    requestedSections.includes('statuses') &&
    (await restoreStatusesSection({ userId, account, assetRefs, zip }))
  ) restored.push('statuses');
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
};

const createAccountExport = async ({ userId, username = 'user' }) => {
  const data = await buildExportBundle(userId);
  const token = crypto.randomBytes(24).toString('hex');
  const requestTime = new Date();
  const expiresAt = new Date(requestTime.getTime() + EXPORT_LIFETIME_MS);
  const zipBuffer = await buildZipBuffer({ data, requestTime, expiresAt });
  const saved = await saveBufferFile({
    buffer: zipBuffer,
    folder: `account-exports/${safeFileName(username, userId)}`,
    filename: `${token}.zip`,
  });
  const exportRow = await AccountExportModel.create({
    userId,
    token,
    fileUrl: saved.url,
    requestedAt: requestTime,
    expiresAt,
  });
  return { exportRow, token, fileUrl: saved.url, expiresAt };
};

const createEncryptedAccountBackup = async ({ userId, username = 'user', passphrase }) => {
  if (String(passphrase || '').length < 8) {
    throw new Error('Backup password must be at least 8 characters');
  }
  const data = await buildExportBundle(userId);
  const requestTime = new Date();
  const zipFileName = `${safeFileName(username, userId)}-backup.zip`;
  const zipBuffer = await buildZipBuffer({ data, requestTime });
  const encryptedBuffer = await encryptBackupBuffer({
    buffer: zipBuffer,
    passphrase,
    fileName: zipFileName,
  });
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
