const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const ChannelReviewModel = sequelize.define(
  'channel_reviews',
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
      allowNull: false,
    },
    rating: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 5,
    },
    review: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    status: {
      type: DataTypes.ENUM('visible', 'hidden'),
      allowNull: false,
      defaultValue: 'visible',
    },
  },
  {
    timestamps: true,
    version: false,
    indexes: [
      {
        unique: true,
        fields: ['channelId', 'userId'],
      },
    ],
  }
);

module.exports = ChannelReviewModel;
