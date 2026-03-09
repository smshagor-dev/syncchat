const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { Op } = require('sequelize');
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
} = require('./storage');
const { normalizePrivacySettingPayload } = require('./privacy');

const execFileAsync = promisify(execFile);
const EXPORT_LIFETIME_MS = 48 * 60 * 60 * 1000;

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
      !asArray(inbox.deletedBy).includes(userId)
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

const createAccountExport = async ({ userId, username = 'user' }) => {
  const data = await buildExportBundle(userId);
  const token = crypto.randomBytes(24).toString('hex');
  const requestTime = new Date();
  const expiresAt = new Date(requestTime.getTime() + EXPORT_LIFETIME_MS);

  const tempDir = path.join(os.tmpdir(), `syncchat-export-${token}`);
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
      expiresAt: expiresAt.toISOString(),
      ...data,
    }),
    writeJson(path.join(tempDir, 'assets.json'), assetRefs),
    writeJson(path.join(tempDir, 'readme.json'), {
      note: 'This export contains your account data snapshot from SyncChat.',
      expiresAt: expiresAt.toISOString(),
      uploadRootDir,
    }),
  ]);

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

module.exports = {
  EXPORT_LIFETIME_MS,
  cleanupExpiredExports,
  createAccountExport,
};
