const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const ModerationActionModel = sequelize.define(
  'moderation_actions',
  {
    _id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    reportId: {
      type: DataTypes.UUID,
      allowNull: true,
      defaultValue: null,
    },
    actionType: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    actorAdminId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    targetUserId: {
      type: DataTypes.UUID,
      allowNull: true,
      defaultValue: null,
    },
    roomId: {
      type: DataTypes.STRING(64),
      allowNull: true,
      defaultValue: null,
    },
    chatId: {
      type: DataTypes.UUID,
      allowNull: true,
      defaultValue: null,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },
    metadata: {
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

module.exports = ModerationActionModel;
