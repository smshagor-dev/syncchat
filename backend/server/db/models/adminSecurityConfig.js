const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const AdminSecurityConfigModel = sequelize.define(
  'admin_security_configs',
  {
    _id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    blockedIps: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    blockedFingerprints: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    rateLimits: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {
        enabled: false,
        windowSeconds: 60,
        maxRequests: 120,
      },
    },
  },
  {
    timestamps: true,
    version: false,
  }
);

module.exports = AdminSecurityConfigModel;
