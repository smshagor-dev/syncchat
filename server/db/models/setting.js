const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const SettingModel = sequelize.define(
  'settings',
  {
    _id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: 'settings_user_id_unique',
    },
    dark: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    enterToSend: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    mute: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    showNotificationBanner: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    showPopupNotification: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    showPushNotification: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    notifyMessages: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    notifyGroups: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    notifyStatus: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    notifyCalls: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    showNotificationPreviews: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    outgoingMessageSoundEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    keepArchived: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    mediaQuality: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'standard',
    },
    chatWallpaperPreset: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'whatsapp',
    },
    chatWallpaperImage: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },
    autoDownloadPhotos: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    autoDownloadAudio: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    autoDownloadVideos: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    autoDownloadDocuments: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    spellCheckEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    replaceTextWithEmoji: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    sortContactByName: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    blockedUserIds: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    lastSeenVisibility: {
      type: DataTypes.STRING(24),
      allowNull: false,
      defaultValue: 'everyone',
    },
    onlineVisibility: {
      type: DataTypes.STRING(24),
      allowNull: false,
      defaultValue: 'everyone',
    },
    profilePhotoVisibility: {
      type: DataTypes.STRING(24),
      allowNull: false,
      defaultValue: 'everyone',
    },
    statusVisibility: {
      type: DataTypes.STRING(24),
      allowNull: false,
      defaultValue: 'everyone',
    },
    groupsVisibility: {
      type: DataTypes.STRING(24),
      allowNull: false,
      defaultValue: 'everyone',
    },
    readReceiptsEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    messageRequestsEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    disableLinkPreviews: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    securityNotificationsEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    cameraEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    microphoneEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    speakerEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    appLockEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    appLockHash: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: null,
    },
    twoFactorEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    twoFactorSecret: {
      type: DataTypes.STRING(128),
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    timestamps: false,
    version: false,
  }
);

module.exports = SettingModel;
