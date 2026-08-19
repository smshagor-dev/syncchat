const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const ChatTopicModel = sequelize.define(
  'chat_topics',
  {
    _id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    roomId: { type: DataTypes.STRING(64), allowNull: false },
    name: { type: DataTypes.STRING(120), allowNull: false },
    icon: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'topic' },
    createdBy: { type: DataTypes.UUID, allowNull: false },
    closed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    pinned: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    participantIds: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  },
  {
    timestamps: true,
    version: false,
    indexes: [
      { fields: ['roomId', 'createdAt'] },
      { fields: ['roomId', 'pinned'] },
    ],
  }
);

module.exports = ChatTopicModel;
