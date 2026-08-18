const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');
const { DEFAULT_USER_AVATAR_URL } = require('../../helpers/avatarDefaults');

const ProfileModel = sequelize.define(
  'profiles',
  {
    _id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: 'profiles_user_id_unique',
    },
    username: {
      type: DataTypes.STRING(24),
      unique: 'profiles_username_unique',
      allowNull: false,
      validate: {
        len: [3, 24],
      },
    },
    email: {
      type: DataTypes.STRING(255),
      unique: 'profiles_email_unique',
      allowNull: false,
    },
    fullname: {
      type: DataTypes.STRING(32),
      allowNull: false,
      validate: {
        len: [3, 32],
      },
    },
    avatar: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: DEFAULT_USER_AVATAR_URL,
    },
    bio: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    phone: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: '',
    },
    dialCode: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: '',
    },
    socialAccounts: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    online: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    timestamps: true,
    version: false,
  }
);

const createProfile = ProfileModel.create.bind(ProfileModel);
ProfileModel.create = (values = {}) =>
  createProfile({
    ...values,
    avatar: String(values.avatar || '').trim()
      ? values.avatar
      : DEFAULT_USER_AVATAR_URL,
  });

module.exports = ProfileModel;
