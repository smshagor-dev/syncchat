const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const AdminCallConfigModel = sequelize.define(
  'admin_call_configs',
  {
    _id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    audioEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    videoEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    groupEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    maxGroupParticipants: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 4,
    },
    ringingTimeoutSec: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 45,
    },
    reconnectGraceSec: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 12,
    },
    iceTransportPolicy: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'all',
    },
    stunUrls: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: ['stun:stun.l.google.com:19302'],
    },
    turn: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {
        enabled: false,
        urls: [],
        authMode: 'static',
        username: '',
        credential: '',
        sharedSecret: '',
        credentialTtlSec: 3600,
      },
    },
    audioProfile: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    },
    videoProfile: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {
        width: 1280,
        height: 720,
        frameRate: 30,
        minWidth: 320,
        minHeight: 180,
        minFrameRate: 15,
        adaptive: true,
      },
    },
    lastTestedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    lastTestStatus: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'never',
    },
    lastTestMessage: {
      type: DataTypes.STRING(500),
      allowNull: false,
      defaultValue: '',
    },
  },
  {
    timestamps: true,
    version: false,
  }
);

module.exports = AdminCallConfigModel;
