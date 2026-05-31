const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const ContactModel = sequelize.define(
  'contact',
  {
    _id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    roomId: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    friendId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    labels: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
  },
  {
    timestamps: false,
    version: false,
    indexes: [
      {
        unique: true,
        fields: ['userId', 'friendId'],
      },
    ],
  }
);

module.exports = ContactModel;
