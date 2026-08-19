const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const ChatModel = sequelize.define(
  'chats',
  {
    _id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    roomId: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    text: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    readed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    delivered: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    replyTo: {
      type: DataTypes.UUID,
      allowNull: true,
      defaultValue: null,
    },
    reactions: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {},
    },
    starredBy: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    deletedBy: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    fileId: {
      type: DataTypes.STRING(64),
      allowNull: true,
      defaultValue: null,
    },
    encryptedText: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },
    encryptionSessionId: {
      type: DataTypes.STRING(64),
      allowNull: true,
      defaultValue: null,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    isSecretSystemMessage: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    viewOnce: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    viewOnceType: {
      type: DataTypes.ENUM('none', 'text', 'image', 'video'),
      allowNull: false,
      defaultValue: 'none',
    },
    viewOnceOpenedBy: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    isEdited: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    editedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    editHistory: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    clientMessageId: {
      type: DataTypes.STRING(96),
      allowNull: true,
      defaultValue: null,
    },
    sequence: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 0,
    },
    mentionUserIds: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    topicId: {
      type: DataTypes.UUID,
      allowNull: true,
      defaultValue: null,
    },
    e2eeEnvelope: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null,
    },
    transcript: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    translations: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {},
    },
  },
  {
    timestamps: true,
    version: false,
    indexes: [
      { fields: ['roomId', 'sequence'] },
      { fields: ['roomId', 'createdAt'] },
      { fields: ['userId', 'clientMessageId'], unique: true, sparse: true },
      { fields: ['topicId', 'createdAt'] },
    ],
  }
);

module.exports = ChatModel;
