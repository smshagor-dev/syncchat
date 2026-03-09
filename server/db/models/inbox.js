const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const InboxModel = sequelize.define(
  'inboxes',
  {
    _id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    ownersId: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    roomId: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: 'inboxes_room_id_unique',
    },
    roomType: {
      type: DataTypes.ENUM('private', 'group'),
      allowNull: false,
      defaultValue: 'private',
    },
    archivedBy: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    mutedBy: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    notificationToneBy: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {},
    },
    pinnedBy: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    favouriteBy: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    listedBy: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    markUnreadBy: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    privacyShieldBy: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    hiddenBy: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    secretChatEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    secretDisappearSeconds: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    secretScreenshotAlerts: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    secretForwardBlocked: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    secretSaveBlocked: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    secretExportBlocked: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    secretSessionId: {
      type: DataTypes.STRING(64),
      allowNull: true,
      defaultValue: null,
    },
    secretSessionKey: {
      type: DataTypes.STRING(128),
      allowNull: true,
      defaultValue: null,
    },
    chatLockBy: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    chatLockHashes: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {},
    },
    unreadMessage: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    fileId: {
      type: DataTypes.STRING(64),
      allowNull: true,
      defaultValue: null,
    },
    deletedBy: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    content: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {
        from: null,
        senderName: '',
        text: '',
        time: new Date().toISOString(),
        delivered: false,
        readed: false,
      },
    },
  },
  {
    timestamps: false,
    version: false,
  }
);

module.exports = InboxModel;
