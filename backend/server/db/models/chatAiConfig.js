const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const ChatAiConfigModel = sequelize.define(
  'chat_ai_configs',
  {
    _id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    key: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'default', unique: 'chat_ai_config_key_unique' },
    translationEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    translationUrl: { type: DataTypes.STRING(512), allowNull: false, defaultValue: '' },
    translationApiKey: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
    transcriptionEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    transcriptionUrl: { type: DataTypes.STRING(512), allowNull: false, defaultValue: '' },
    transcriptionApiKey: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
    defaultTargetLanguage: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'en' },
  },
  { timestamps: true, version: false }
);

module.exports = ChatAiConfigModel;
