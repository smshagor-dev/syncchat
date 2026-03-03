const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');
const uniqueId = require('../../helpers/uniqueId');

const GroupModel = sequelize.define(
  'groups',
  {
    _id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    roomId: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: 'groups_room_id_unique',
    },
    adminId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    participantsId: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    name: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    desc: {
      type: DataTypes.STRING(300),
      allowNull: false,
      defaultValue: '',
    },
    avatar: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },
    link: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: 'groups_link_unique',
      defaultValue: () => `/group/+${uniqueId(16)}`,
    },
  },
  {
    timestamps: true,
    version: false,
  }
);

module.exports = GroupModel;
