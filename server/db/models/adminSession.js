const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const AdminSessionModel = sequelize.define(
  'admin_sessions',
  {
    _id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    adminId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    deviceName: {
      type: DataTypes.STRING(120),
      allowNull: true,
      defaultValue: null,
    },
    browser: {
      type: DataTypes.STRING(60),
      allowNull: true,
      defaultValue: null,
    },
    os: {
      type: DataTypes.STRING(60),
      allowNull: true,
      defaultValue: null,
    },
    ipAddress: {
      type: DataTypes.STRING(64),
      allowNull: true,
      defaultValue: null,
    },
    userAgent: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },
    lastSeenAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    revokedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    revokedReason: {
      type: DataTypes.STRING(120),
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    timestamps: true,
    version: false,
  }
);

module.exports = AdminSessionModel;
