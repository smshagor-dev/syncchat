const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const E2eeDeviceKeyModel = sequelize.define(
  'e2ee_device_keys',
  {
    _id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    sessionId: { type: DataTypes.UUID, allowNull: false },
    publicJwk: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
    fingerprint: { type: DataTypes.STRING(128), allowNull: false },
    algorithm: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'ECDH-P256' },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    revokedAt: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
  },
  {
    timestamps: true,
    version: false,
    indexes: [
      { fields: ['userId', 'sessionId'], unique: true },
      { fields: ['userId', 'active'] },
      { fields: ['fingerprint'] },
    ],
  }
);

module.exports = E2eeDeviceKeyModel;
