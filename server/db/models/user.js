const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');
const uniqueId = require('../../helpers/uniqueId');

const UserModel = sequelize.define(
  'users',
  {
    _id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    username: {
      type: DataTypes.STRING(24),
      unique: 'users_username_unique',
      allowNull: false,
      validate: {
        len: [3, 24],
      },
    },
    fullname: {
      type: DataTypes.STRING(32),
      allowNull: false,
      validate: {
        len: [3, 32],
      },
    },
    email: {
      type: DataTypes.STRING(255),
      unique: 'users_email_unique',
      allowNull: false,
    },
    password: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    qrCode: {
      type: DataTypes.STRING(64),
      allowNull: false,
      defaultValue: () => uniqueId(16, { lowercase: false }),
    },
    verified: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    otp: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    resetOtp: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
    },
    resetOtpExpires: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    resetOtpVerified: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    status: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'active',
    },
    blockedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    bannedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
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
  }
);

module.exports = UserModel;
