const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const UserSessionModel = sequelize.define(
  'user_sessions',
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
    authProvider: {
      type: DataTypes.STRING(24),
      allowNull: false,
      defaultValue: 'password',
    },
    deviceName: {
      type: DataTypes.STRING(120),
      allowNull: false,
      defaultValue: 'Unknown device',
    },
    deviceType: {
      type: DataTypes.STRING(24),
      allowNull: false,
      defaultValue: 'desktop',
    },
    browser: {
      type: DataTypes.STRING(48),
      allowNull: false,
      defaultValue: '',
    },
    os: {
      type: DataTypes.STRING(48),
      allowNull: false,
      defaultValue: '',
    },
    userAgent: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    ipAddress: {
      type: DataTypes.STRING(120),
      allowNull: false,
      defaultValue: '',
    },
    locationLabel: {
      type: DataTypes.STRING(160),
      allowNull: false,
      defaultValue: 'Unknown location',
    },
    fingerprint: {
      type: DataTypes.STRING(128),
      allowNull: false,
      defaultValue: '',
    },
    suspicious: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    suspiciousReason: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: '',
    },
    lastSeenAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    revokedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    revokedReason: {
      type: DataTypes.STRING(64),
      allowNull: true,
      defaultValue: null,
    },
    reviewedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    reviewedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    timestamps: true,
    version: false,
    indexes: [
      {
        fields: ['userId', 'createdAt'],
      },
      {
        fields: ['userId', 'revokedAt'],
      },
    ],
  }
);

module.exports = UserSessionModel;
