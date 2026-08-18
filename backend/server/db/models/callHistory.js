const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const CallHistoryModel = sequelize.define(
  'call_histories',
  {
    _id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    callId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
    },
    roomId: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    roomType: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'private',
    },
    mediaType: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'audio',
    },
    initiatorId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    participantIds: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    joinedUserIds: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    rejectedUserIds: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    busyUserIds: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    status: {
      type: DataTypes.STRING(24),
      allowNull: false,
      defaultValue: 'ringing',
    },
    statusHistory: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    ringingTimeoutSec: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 45,
    },
    ringingAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    acceptedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    connectedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    endedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    durationSec: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    endedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      defaultValue: null,
    },
    endReason: {
      type: DataTypes.STRING(64),
      allowNull: false,
      defaultValue: '',
    },
    failureCode: {
      type: DataTypes.STRING(64),
      allowNull: false,
      defaultValue: '',
    },
    failureMessage: {
      type: DataTypes.STRING(500),
      allowNull: false,
      defaultValue: '',
    },
  },
  {
    timestamps: true,
    version: false,
    indexes: [
      {
        unique: true,
        fields: ['callId'],
      },
      {
        fields: ['roomId', 'createdAt'],
      },
      {
        fields: ['initiatorId', 'createdAt'],
      },
      {
        fields: ['status', 'createdAt'],
      },
    ],
  }
);

module.exports = CallHistoryModel;
