const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');
const uniqueId = require('../../helpers/uniqueId');
const { DEFAULT_GROUP_PERMISSIONS } = require('../../helpers/groupPermissions');
const { DEFAULT_MODERATION_SETTINGS } = require('../../helpers/moderation');
const { DEFAULT_GROUP_AVATAR_URL } = require('../../helpers/avatarDefaults');

const GroupModel = sequelize.define(
  'groups',
  {
    _id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    roomId: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: 'groups_room_id_unique',
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
    communityId: {
      type: DataTypes.UUID,
      allowNull: true,
      defaultValue: null,
    },
    isChannel: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
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
      defaultValue: DEFAULT_GROUP_AVATAR_URL,
    },
    link: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: 'groups_link_unique',
      defaultValue: () => `/group/+${uniqueId(16)}`,
    },
    permissions: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: DEFAULT_GROUP_PERMISSIONS,
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

module.exports = GroupModel;
