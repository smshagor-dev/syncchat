const ProfilePhotoModel = require('../db/models/profilePhoto');
const ProfileModel = require('../db/models/profile');
const { toPlain, toPlainMany } = require('../db/utils');
const {
  deleteStorageFileByUrl,
  toAbsoluteUploadUrl,
} = require('./storage');
const {
  DEFAULT_USER_AVATAR_URL,
  isDefaultUserAvatar,
} = require('./avatarDefaults');
const logger = require('./logger');

const normalizeUrl = (value = '') => String(value || '').trim();

const urlCandidates = (rawUrl = '') => {
  const value = normalizeUrl(rawUrl);
  if (!value) return [];

  const candidates = new Set([value]);
  try {
    const parsed = new URL(value);
    if (parsed.pathname?.startsWith('/uploads/')) {
      candidates.add(`${parsed.pathname}${parsed.search || ''}${parsed.hash || ''}`);
    }
  } catch (error0) {
    // Relative URLs are already included above.
  }

  return [...candidates];
};

const serializePhoto = (photo, currentAvatar = '') => {
  const plain = toPlain(photo) || {};
  return {
    _id: plain._id,
    userId: plain.userId,
    url: toAbsoluteUploadUrl(plain.url),
    isCurrent: normalizeUrl(plain.url) === normalizeUrl(currentAvatar),
    createdAt: plain.createdAt || null,
  };
};

const ensureCurrentProfilePhoto = async (profile) => {
  const plain = toPlain(profile);
  const userId = normalizeUrl(plain?.userId);
  const avatar = normalizeUrl(plain?.avatar);

  if (!userId || !avatar || isDefaultUserAvatar(avatar)) {
    return null;
  }

  let row = await ProfilePhotoModel.findOne({
    where: {
      userId,
      url: avatar,
      deletedAt: null,
    },
  });

  if (!row) {
    row = await ProfilePhotoModel.create({
      userId,
      url: avatar,
      source: 'legacy',
      isCurrent: true,
      deletedAt: null,
    });
  }

  await ProfilePhotoModel.update(
    { isCurrent: false },
    { where: { userId } }
  );
  await row.update({ isCurrent: true });
  return row;
};

const appendProfilePhoto = async ({ profile, url, source = 'upload' }) => {
  const plain = toPlain(profile);
  const userId = normalizeUrl(plain?.userId);
  const nextUrl = normalizeUrl(url);
  if (!userId || !nextUrl) {
    throw new Error('User id and profile photo URL are required');
  }

  await ensureCurrentProfilePhoto(profile);
  await ProfilePhotoModel.update(
    { isCurrent: false },
    { where: { userId } }
  );

  const row = await ProfilePhotoModel.create({
    userId,
    url: nextUrl,
    source,
    isCurrent: true,
    deletedAt: null,
  });

  await profile.update({ avatar: nextUrl });
  return row;
};

const listProfilePhotos = async (userId) => {
  const normalizedUserId = normalizeUrl(userId);
  if (!normalizedUserId) return [];

  const profile = await ProfileModel.findOne({
    where: { userId: normalizedUserId },
  });
  if (!profile) return [];

  await ensureCurrentProfilePhoto(profile);

  const rows = await ProfilePhotoModel.findAll({
    where: {
      userId: normalizedUserId,
      deletedAt: null,
    },
    order: [['createdAt', 'DESC']],
  });

  const currentAvatar = toPlain(profile)?.avatar || '';
  return toPlainMany(rows).map((row) => serializePhoto(row, currentAvatar));
};

const resolveProfileByPhotoUrl = async (rawUrl) => {
  const candidates = urlCandidates(rawUrl).filter(
    (value) => value && !isDefaultUserAvatar(value)
  );
  if (!candidates.length) return null;

  for (const candidate of candidates) {
    // eslint-disable-next-line no-await-in-loop
    const photo = await ProfilePhotoModel.findOne({
      where: {
        url: candidate,
        deletedAt: null,
      },
    });
    if (photo?.userId) {
      // eslint-disable-next-line no-await-in-loop
      const profile = await ProfileModel.findOne({
        where: { userId: photo.userId },
      });
      if (profile) return profile;
    }
  }

  for (const candidate of candidates) {
    // eslint-disable-next-line no-await-in-loop
    const profile = await ProfileModel.findOne({
      where: { avatar: candidate },
    });
    if (profile) {
      // Lazily backfill accounts that had a profile photo before history existed.
      // eslint-disable-next-line no-await-in-loop
      await ensureCurrentProfilePhoto(profile);
      return profile;
    }
  }

  return null;
};

const removeProfilePhoto = async ({ userId, photoId }) => {
  const normalizedUserId = normalizeUrl(userId);
  const normalizedPhotoId = normalizeUrl(photoId);
  if (!normalizedUserId || !normalizedPhotoId) {
    const error = new Error('Profile photo not found');
    error.statusCode = 404;
    throw error;
  }

  const photo = await ProfilePhotoModel.findOne({
    where: {
      _id: normalizedPhotoId,
      userId: normalizedUserId,
      deletedAt: null,
    },
  });
  if (!photo) {
    const error = new Error('Profile photo not found');
    error.statusCode = 404;
    throw error;
  }

  const profile = await ProfileModel.findOne({
    where: { userId: normalizedUserId },
  });
  if (!profile) {
    const error = new Error('User profile not found');
    error.statusCode = 404;
    throw error;
  }

  const plainPhoto = toPlain(photo);
  const plainProfile = toPlain(profile);
  const deletingCurrent =
    normalizeUrl(plainPhoto?.url) === normalizeUrl(plainProfile?.avatar);

  await photo.update({
    isCurrent: false,
    deletedAt: new Date(),
  });

  if (plainPhoto?.url && !isDefaultUserAvatar(plainPhoto.url)) {
    try {
      await deleteStorageFileByUrl(plainPhoto.url);
    } catch (error0) {
      logger.warn('PROFILE_PHOTO_STORAGE_DELETE_FAILED', {
        userId: normalizedUserId,
        photoId: normalizedPhotoId,
        message: error0.message,
      });
    }
  }

  if (deletingCurrent) {
    const nextPhoto = await ProfilePhotoModel.findOne({
      where: {
        userId: normalizedUserId,
        deletedAt: null,
      },
      order: [['createdAt', 'DESC']],
    });

    if (nextPhoto) {
      await ProfilePhotoModel.update(
        { isCurrent: false },
        { where: { userId: normalizedUserId } }
      );
      await nextPhoto.update({ isCurrent: true });
      await profile.update({ avatar: nextPhoto.url });
    } else {
      await profile.update({ avatar: DEFAULT_USER_AVATAR_URL });
    }
  }

  const updatedProfile = await ProfileModel.findOne({
    where: { userId: normalizedUserId },
  });
  const photos = await listProfilePhotos(normalizedUserId);

  return {
    currentAvatar: toAbsoluteUploadUrl(
      toPlain(updatedProfile)?.avatar || DEFAULT_USER_AVATAR_URL
    ),
    photos,
  };
};

module.exports = {
  ensureCurrentProfilePhoto,
  appendProfilePhoto,
  listProfilePhotos,
  resolveProfileByPhotoUrl,
  removeProfilePhoto,
};
