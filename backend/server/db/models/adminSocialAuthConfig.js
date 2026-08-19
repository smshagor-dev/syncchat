const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const AdminSocialAuthConfigModel = sequelize.define(
  'admin_social_auth_configs',
  {
    _id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    google: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {
        enabled: false,
        clientId: '',
        clientSecret: '',
      },
    },
    facebook: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {
        enabled: false,
        appId: '',
        appSecret: '',
      },
    },
    telegram: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {
        enabled: false,
        botUsername: '',
        botToken: '',
      },
    },
  },
  {
    timestamps: true,
    version: false,
  }
);

module.exports = AdminSocialAuthConfigModel;
