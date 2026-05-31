const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const AdminAuditLogModel = sequelize.define(
  'admin_audit_logs',
  {
    _id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    adminId: {
      type: DataTypes.UUID,
      allowNull: true,
      defaultValue: null,
    },
    action: {
      type: DataTypes.STRING(80),
      allowNull: false,
    },
    entityType: {
      type: DataTypes.STRING(80),
      allowNull: true,
      defaultValue: null,
    },
    entityId: {
      type: DataTypes.STRING(120),
      allowNull: true,
      defaultValue: null,
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null,
    },
    ipAddress: {
      type: DataTypes.STRING(64),
      allowNull: true,
      defaultValue: null,
    },
    userAgent: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    timestamps: true,
    version: false,
  }
);

module.exports = AdminAuditLogModel;
