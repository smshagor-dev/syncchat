const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const ChatRoomCounterModel = sequelize.define(
  'chat_room_counters',
  {
    roomId: {
      type: DataTypes.STRING(64),
      allowNull: false,
      primaryKey: true,
      unique: true,
    },
    sequence: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    timestamps: false,
    version: false,
  }
);

module.exports = ChatRoomCounterModel;
