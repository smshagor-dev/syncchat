const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const AdminContentConfigModel = sequelize.define(
  'admin_content_configs',
  {
    _id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    blockedPreviewDomains: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
  },
  {
    timestamps: true,
    version: false,
  }
);

module.exports = AdminContentConfigModel;
