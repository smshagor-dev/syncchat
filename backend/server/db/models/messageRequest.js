const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const MessageRequestModel = sequelize.define(
  'message_requests',
  {
    _id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    requesterId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    recipientId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    roomId: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('pending', 'accepted', 'declined', 'blocked'),
      allowNull: false,
      defaultValue: 'pending',
    },
    preview: {
      type: DataTypes.STRING(320),
      allowNull: false,
      defaultValue: '',
    },
    lastMessageAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    actionAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    timestamps: true,
    version: false,
    indexes: [
      { fields: ['recipientId', 'roomId'], unique: true },
      { fields: ['recipientId', 'status', 'lastMessageAt'] },
      { fields: ['requesterId', 'recipientId'] },
    ],
  }
);

module.exports = MessageRequestModel;
