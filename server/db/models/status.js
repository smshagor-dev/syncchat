const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const StatusModel = sequelize.define(
  'statuses',
  {
    _id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    type: {
      type: DataTypes.ENUM('text', 'photo', 'video'),
      allowNull: false,
      defaultValue: 'text',
    },
    text: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    bgColor: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: '#0ea5e9',
    },
    mediaUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },
    mentionUserIds: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    timestamps: true,
    version: false,
  }
);

module.exports = StatusModel;
