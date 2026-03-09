const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const ScheduledMessageModel = sequelize.define(
  'scheduled_messages',
  {
    _id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    senderId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    roomId: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    roomType: {
      type: DataTypes.ENUM('private', 'group'),
      allowNull: false,
      defaultValue: 'private',
    },
    ownersId: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
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
    mode: {
      type: DataTypes.ENUM('once', 'recurring', 'when-online'),
      allowNull: false,
      defaultValue: 'once',
    },
    recurringType: {
      type: DataTypes.ENUM('none', 'daily', 'weekly', 'monthly'),
      allowNull: false,
      defaultValue: 'none',
    },
    scheduledFor: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    nextRunAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    targetUserId: {
      type: DataTypes.UUID,
      allowNull: true,
      defaultValue: null,
    },
    status: {
      type: DataTypes.ENUM('pending', 'sent', 'cancelled'),
      allowNull: false,
      defaultValue: 'pending',
    },
    sentCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    lastSentAt: {
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

module.exports = ScheduledMessageModel;
