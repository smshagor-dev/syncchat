const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const SocialIdentityModel = sequelize.define(
  'social_identities',
  {
    _id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    provider: {
      type: DataTypes.STRING(24),
      allowNull: false,
    },
    providerUserId: {
      type: DataTypes.STRING(160),
      allowNull: false,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      index: true,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: '',
    },
    emailVerified: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    timestamps: true,
    version: false,
    indexes: [
      {
        name: 'social_identity_provider_user_unique',
        unique: true,
        fields: ['provider', 'providerUserId'],
      },
      { name: 'social_identity_user_idx', fields: ['userId'] },
    ],
  }
);

module.exports = SocialIdentityModel;
