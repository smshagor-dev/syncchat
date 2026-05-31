const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const AdminModerationConfigModel = sequelize.define(
  'admin_moderation_configs',
  {
    _id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    bannedWords: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    blockedMediaTypes: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    slowModePresets: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [0, 10, 30, 60, 120],
    },
    autoReportViolations: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    timestamps: true,
    version: false,
  }
);

module.exports = AdminModerationConfigModel;
