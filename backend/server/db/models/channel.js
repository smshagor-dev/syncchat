const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');
const uniqueId = require('../../helpers/uniqueId');
const { DEFAULT_GROUP_PERMISSIONS } = require('../../helpers/groupPermissions');
const { DEFAULT_MODERATION_SETTINGS } = require('../../helpers/moderation');
const { DEFAULT_CHANNEL_AVATAR_URL } = require('../../helpers/avatarDefaults');

const ChannelModel = sequelize.define(
  'channels',
  {
    _id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    roomId: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: 'channels_room_id_unique',
    },
    adminId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    adminsId: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    participantsId: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    pendingMembersId: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    name: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    desc: {
      type: DataTypes.STRING(300),
      allowNull: false,
      defaultValue: '',
    },
    accessType: {
      type: DataTypes.ENUM('public', 'private'),
      allowNull: false,
      defaultValue: 'public',
    },
    passwordHash: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },
    avatar: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: DEFAULT_CHANNEL_AVATAR_URL,
    },
    link: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: 'channels_link_unique',
      defaultValue: () => `/channel/+${uniqueId(16)}`,
    },
    permissions: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {
        ...DEFAULT_GROUP_PERMISSIONS,
        memberCanSendMessage: false,
      },
    },
    moderation: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: DEFAULT_MODERATION_SETTINGS,
    },
    mutedUserIds: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    status: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'active',
    },
    bannedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    timestamps: true,
    version: false,
  }
);

module.exports = ChannelModel;
