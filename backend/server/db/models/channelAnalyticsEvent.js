const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const ChannelAnalyticsEventModel = sequelize.define(
  'channel_analytics_events',
  {
    _id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    channelId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      defaultValue: null,
    },
    eventType: {
      type: DataTypes.ENUM(
        'subscriber_join',
        'subscriber_leave',
        'subscriber_mute',
        'subscriber_unmute'
      ),
      allowNull: false,
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

module.exports = ChannelAnalyticsEventModel;
