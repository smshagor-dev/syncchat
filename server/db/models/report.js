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
  },
  {
    timestamps: true,
    version: false,
  }
);

module.exports = ReportModel;

