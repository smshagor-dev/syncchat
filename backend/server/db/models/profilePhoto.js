const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const ProfilePhotoModel = sequelize.define(
  'profile_photos',
  {
    _id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      index: true,
    },
    url: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    source: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'upload',
    },
    isCurrent: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    timestamps: true,
    version: false,
    indexes: [
      { fields: ['userId', 'createdAt'] },
      { fields: ['userId', 'deletedAt'] },
    ],
  }
);

module.exports = ProfilePhotoModel;
