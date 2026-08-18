const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const AdminStorageConfigModel = sequelize.define(
  'admin_storage_configs',
  {
    _id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    provider: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'ftp',
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    host: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: '',
    },
    port: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 21,
    },
    secureMode: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'none',
    },
    user: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: '',
    },
    password: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    basePath: {
      type: DataTypes.STRING(512),
      allowNull: false,
      defaultValue: '/uploads',
    },
    publicBaseUrl: {
      type: DataTypes.STRING(512),
      allowNull: false,
      defaultValue: '',
    },
    rejectUnauthorized: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    timeoutMs: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 15000,
    },
    lastTestedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    lastTestStatus: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'never',
    },
    lastTestMessage: {
      type: DataTypes.STRING(500),
      allowNull: false,
      defaultValue: '',
    },
  },
  {
    timestamps: true,
    version: false,
  }
);

module.exports = AdminStorageConfigModel;
