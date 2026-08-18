const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const ResumableUploadModel = sequelize.define(
  'resumable_uploads',
  {
    _id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    uploadId: { type: DataTypes.UUID, allowNull: false, unique: 'resumable_upload_id_unique' },
    userId: { type: DataTypes.UUID, allowNull: false },
    filename: { type: DataTypes.STRING(255), allowNull: false },
    mime: { type: DataTypes.STRING(120), allowNull: false, defaultValue: 'application/octet-stream' },
    totalSize: { type: DataTypes.BIGINT, allowNull: false },
    chunkSize: { type: DataTypes.INTEGER, allowNull: false },
    uploadedBytes: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
    receivedParts: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
    status: {
      type: DataTypes.ENUM('uploading', 'complete', 'cancelled', 'expired'),
      allowNull: false,
      defaultValue: 'uploading',
    },
    result: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    timestamps: true,
    version: false,
    indexes: [
      { fields: ['userId', 'status', 'createdAt'] },
      { fields: ['expiresAt'] },
    ],
  }
);

module.exports = ResumableUploadModel;
