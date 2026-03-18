const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const AdminRoleModel = sequelize.define(
  'admin_roles',
  {
    _id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(48),
      allowNull: false,
      unique: 'admin_roles_name_unique',
    },
    description: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: null,
    },
    permissions: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    isSystem: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    timestamps: true,
    version: false,
  }
);

module.exports = AdminRoleModel;
