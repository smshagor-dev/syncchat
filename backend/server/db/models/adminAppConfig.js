const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const AdminAppConfigModel = sequelize.define(
  'admin_app_configs',
  {
    _id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    appName: {
      type: DataTypes.STRING(80),
      allowNull: false,
      defaultValue: 'SyncChat',
    },
    appLogo: {
      type: DataTypes.STRING(512),
      allowNull: true,
      defaultValue: '',
    },
    supportEmail: {
      type: DataTypes.STRING(160),
      allowNull: true,
      defaultValue: '',
    },
    smtp: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {
        host: '',
        port: 587,
        secure: false,
        user: '',
        pass: '',
        fromName: '',
        fromEmail: '',
      },
    },
    featureFlags: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {
        uploads: true,
        status: true,
        calls: true,
        groups: true,
        channels: true,
        communities: true,
      },
    },
    defaultPrivacy: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {},
    },
    defaultChat: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {},
    },
    defaultNotifications: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {},
    },
    uploadLimits: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {
        chatMb: 100,
        avatarMb: 10,
        allowedTypes: ['image', 'video', 'audio', 'document'],
      },
    },
    mediaProfile: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {
        defaultQuality: 'standard',
        hdEnabled: true,
      },
    },
    maintenance: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {
        enabled: false,
        message: '',
      },
    },
    seo: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {
        title: '',
        description: '',
        keywords: '',
        image: '',
        ogType: 'website',
        twitterCard: 'summary_large_image',
      },
    },
  },
  {
    timestamps: true,
    version: false,
  }
);

module.exports = AdminAppConfigModel;
