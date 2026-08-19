const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const MessageReceiptModel = sequelize.define(
  'message_receipts',
  {
    _id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    chatId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    roomId: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    sessionId: {
      type: DataTypes.UUID,
      allowNull: true,
      defaultValue: null,
    },
    deliveredAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    readAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    timestamps: true,
    version: false,
    indexes: [
      { fields: ['chatId', 'userId', 'sessionId'], unique: true, sparse: true },
      { fields: ['roomId', 'userId'] },
      { fields: ['chatId'] },
    ],
  }
);

module.exports = MessageReceiptModel;
