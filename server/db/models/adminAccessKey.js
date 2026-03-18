const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const AdminAccessKeyModel = sequelize.define(
  'admin_access_keys',
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
    label: {
      type: DataTypes.STRING(80),
      allowNull: false,
    },
    keyHash: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    lastUsedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    active: {
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

module.exports = AdminAccessKeyModel;
