const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const AdminModel = sequelize.define(
  'admins',
  {
    _id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    fullname: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(255),
      unique: 'admins_email_unique',
      allowNull: false,
    },
    avatar: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },
    roleId: {
      type: DataTypes.UUID,
      allowNull: true,
      defaultValue: null,
    },
    password: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    role: {
      type: DataTypes.STRING(24),
      allowNull: false,
      defaultValue: 'super-admin',
    },
    active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    lastLoginAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    timestamps: true,
    version: false,
  }
);

module.exports = AdminModel;
