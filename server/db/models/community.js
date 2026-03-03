const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const CommunityModel = sequelize.define(
  'communities',
  {
    _id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    avatar: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },
    adminId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    membersId: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
  },
  {
    timestamps: true,
    version: false,
  }
);

module.exports = CommunityModel;
