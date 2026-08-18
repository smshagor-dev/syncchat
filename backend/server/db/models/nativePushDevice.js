const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const NativePushDeviceModel = sequelize.define(
  'native_push_devices',
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
    platform: {
      type: DataTypes.ENUM('android', 'ios'),
      allowNull: false,
    },
    provider: {
      type: DataTypes.ENUM('fcm', 'apns'),
      allowNull: false,
    },
    token: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    tokenHash: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    tokenType: {
      type: DataTypes.ENUM('standard', 'voip'),
      allowNull: false,
      defaultValue: 'standard',
    },
    deviceId: {
      type: DataTypes.STRING(160),
      allowNull: false,
      defaultValue: '',
    },
    deviceLabel: {
      type: DataTypes.STRING(120),
      allowNull: false,
      defaultValue: '',
    },
    appVersion: {
      type: DataTypes.STRING(48),
      allowNull: false,
      defaultValue: '',
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    lastSeenAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    timestamps: true,
    version: false,
    indexes: [
      {
        unique: true,
        fields: ['tokenHash'],
      },
      {
        fields: ['userId', 'platform', 'enabled'],
      },
      {
        fields: ['deviceId'],
      },
    ],
  }
);

module.exports = NativePushDeviceModel;
