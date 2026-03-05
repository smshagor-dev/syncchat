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
