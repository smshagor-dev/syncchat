const UserModel = require('../db/models/user');
const ProfileModel = require('../db/models/profile');
const { DEFAULT_USER_AVATAR_URL } = require('./avatarDefaults');

const createProfilePayload = (user) => ({
  userId: user._id,
  username: String(user.username || '').trim().toLowerCase(),
  email: String(user.email || '').trim().toLowerCase(),
  fullname: String(user.fullname || user.username || 'User').trim(),
  avatar: DEFAULT_USER_AVATAR_URL,
  bio: '',
  phone: '',
  dialCode: '',
  socialAccounts: [],
  online: false,
});

const ensureProfile = async (userId) => {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) return null;

  let profile = await ProfileModel.findOne({
    where: { userId: normalizedUserId },
  });
  if (profile) {
    if (!String(profile.avatar || '').trim()) {
      await profile.update({ avatar: DEFAULT_USER_AVATAR_URL });
    }
    return profile;
  }

  const user = await UserModel.findOne({
    where: { _id: normalizedUserId },
    attributes: ['_id', 'username', 'fullname', 'email'],
  });
  if (!user) return null;

  try {
    profile = await ProfileModel.create(createProfilePayload(user));
    return profile;
  } catch (error) {
    // Two concurrent requests may both try to repair the same missing profile.
    // If one of them wins the unique constraint race, reuse the row it created.
    if (
      error?.code === 11000 ||
      error?.name === 'MongoServerError' ||
      error?.name === 'SequelizeUniqueConstraintError'
    ) {
      return ProfileModel.findOne({
        where: { userId: normalizedUserId },
      });
    }
    throw error;
  }
};

module.exports = ensureProfile;
