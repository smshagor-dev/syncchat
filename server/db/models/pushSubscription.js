const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const PushSubscriptionModel = sequelize.define(
  'push_subscriptions',
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
    endpoint: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    endpointHash: {
      type: DataTypes.STRING(64),
      allowNull: true,
      defaultValue: null,
    },
    p256dh: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    auth: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    expirationTime: {
      type: DataTypes.BIGINT,
      allowNull: true,
      defaultValue: null,
    },
    userAgent: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: '',
    },
    deviceLabel: {
      type: DataTypes.STRING(64),
      allowNull: false,
      defaultValue: '',
    },
    lastSeenAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    timestamps: true,
    version: false,
    indexes: [
      {
        unique: true,
        fields: ['endpointHash'],
      },
      {
        fields: ['userId'],
      },
    ],
  }
);

module.exports = PushSubscriptionModel;
