const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const ChatDraftModel = sequelize.define(
  'chat_drafts',
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
    replyTo: {
      type: DataTypes.UUID,
      allowNull: true,
      defaultValue: null,
    },
    topicId: {
      type: DataTypes.UUID,
      allowNull: true,
      defaultValue: null,
    },
    meta: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {},
    },
  },
  {
    timestamps: true,
    version: false,
    indexes: [
      { fields: ['userId', 'roomId'], unique: true },
      { fields: ['userId', 'updatedAt'] },
    ],
  }
);

module.exports = ChatDraftModel;
