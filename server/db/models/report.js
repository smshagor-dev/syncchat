const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const ReportModel = sequelize.define(
  'reports',
  {
    _id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    reporterId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    roomId: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    roomType: {
      type: DataTypes.ENUM('private', 'group'),
      allowNull: false,
      defaultValue: 'private',
    },
    targetId: {
      type: DataTypes.STRING(64),
      allowNull: true,
      defaultValue: null,
    },
    reportedUserId: {
      type: DataTypes.UUID,
      allowNull: true,
      defaultValue: null,
    },
    chatId: {
      type: DataTypes.UUID,
      allowNull: true,
      defaultValue: null,
    },
    source: {
      type: DataTypes.ENUM('user', 'auto'),
      allowNull: false,
      defaultValue: 'user',
    },
    category: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'general',
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    status: {
      type: DataTypes.STRING(24),
      allowNull: false,
      defaultValue: 'open',
    },
    resolutionNote: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },
    reviewedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      defaultValue: null,
    },
    reviewedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    meta: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {},
    },
  },
  {
    timestamps: true,
    version: false,
  }
);

module.exports = ReportModel;
