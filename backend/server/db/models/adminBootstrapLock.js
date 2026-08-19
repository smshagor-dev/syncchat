const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const AdminBootstrapLockModel = sequelize.define(
  'admin_bootstrap_locks',
  {
    _id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    key: {
      type: DataTypes.STRING(32),
      allowNull: false,
      unique: 'admin_bootstrap_lock_key_unique',
    },
    acquiredAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    timestamps: true,
    version: false,
  }
);

module.exports = AdminBootstrapLockModel;
