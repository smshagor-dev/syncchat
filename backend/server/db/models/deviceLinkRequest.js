const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const DeviceLinkRequestModel = sequelize.define(
  'device_link_requests',
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
    requesterSessionId: {
      type: DataTypes.UUID,
      allowNull: true,
      defaultValue: null,
    },
    pairingToken: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: 'device_link_pairing_token_unique',
    },
    shortCode: {
      type: DataTypes.STRING(12),
      allowNull: false,
    },
    emailCode: {
      type: DataTypes.STRING(12),
      allowNull: false,
    },
    supportCode: {
      type: DataTypes.STRING(12),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('pending', 'consumed', 'expired', 'cancelled'),
      allowNull: false,
      defaultValue: 'pending',
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    consumedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    timestamps: true,
    version: false,
    indexes: [
      { fields: ['userId', 'status'] },
      { fields: ['shortCode', 'status'] },
      { fields: ['expiresAt'] },
    ],
  }
);

module.exports = DeviceLinkRequestModel;
