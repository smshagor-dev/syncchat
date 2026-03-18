const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const ContactLabelModel = sequelize.define(
  'contact_label',
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
    name: {
      type: DataTypes.STRING(48),
      allowNull: false,
    },
    color: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: '#3b82f6',
    },
    isSystem: {
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
        unique: true,
        fields: ['userId', 'name'],
      },
    ],
  }
);

module.exports = ContactLabelModel;
