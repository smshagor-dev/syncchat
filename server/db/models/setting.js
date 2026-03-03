const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const SettingModel = sequelize.define(
  'settings',
  {
    _id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: 'settings_user_id_unique',
    },
    dark: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    enterToSend: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    mute: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    keepArchived: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    sortContactByName: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    blockedUserIds: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    appLockEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    appLockHash: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    timestamps: false,
    version: false,
  }
);

module.exports = SettingModel;
