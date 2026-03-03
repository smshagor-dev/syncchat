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
  },
  {
    timestamps: true,
    version: false,
  }
);

module.exports = ChatModel;
