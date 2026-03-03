const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const FileModel = sequelize.define(
  'files',
  {
    _id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    fileId: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: 'files_file_id_unique',
    },
    originalname: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: '',
    },
    url: {
      type: DataTypes.STRING(700),
      allowNull: false,
      unique: 'files_url_unique',
    },
    type: {
      type: DataTypes.STRING(24),
      allowNull: false,
    },
    format: {
      type: DataTypes.STRING(24),
      allowNull: false,
    },
    size: {
      type: DataTypes.STRING(24),
      allowNull: false,
      defaultValue: '0',
    },
  },
  {
    timestamps: false,
    version: false,
  }
);

module.exports = FileModel;
