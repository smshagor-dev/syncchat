const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const UserSessionModel = sequelize.define(
  'user_sessions',
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
    authProvider: {
      type: DataTypes.STRING(24),
      allowNull: false,
      defaultValue: 'password',
    },
    deviceName: {
      type: DataTypes.STRING(120),
      allowNull: false,
      defaultValue: 'Unknown device',
    },
    deviceType: {
      type: DataTypes.STRING(24),
      allowNull: false,
      defaultValue: 'desktop',
    },
    browser: {
      type: DataTypes.STRING(48),
      allowNull: false,
      defaultValue: '',
    },
    os: {
      type: DataTypes.STRING(48),
      allowNull: false,
      defaultValue: '',
    },
    userAgent: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    ipAddress: {
      type: DataTypes.STRING(120),
      allowNull: false,
      defaultValue: '',
    },
    locationLabel: {
      type: DataTypes.STRING(160),
      allowNull: false,
      defaultValue: 'Unknown location',
    },
    fingerprint: {
      type: DataTypes.STRING(128),
      allowNull: false,
      defaultValue: '',
    },
    suspicious: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    suspiciousReason: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: '',
    },
    lastSeenAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    revokedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    revokedReason: {
      type: DataTypes.STRING(64),
      allowNull: true,
      defaultValue: null,
    },
    reviewedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    reviewedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    timestamps: true,
    version: false,
    indexes: [
      {
        fields: ['userId', 'createdAt'],
      },
      {
        fields: ['userId', 'revokedAt'],
      },
    ],
  }
);

// Aggregate queries from the Mongo-backed Sequelize compatibility layer return
// plain objects. Preserve the small Sequelize `.get(field)` contract expected by
// existing admin code without changing JSON serialization of those rows.
const findAll = UserSessionModel.findAll.bind(UserSessionModel);
UserSessionModel.findAll = async (...args) => {
  const rows = await findAll(...args);
  if (!Array.isArray(rows)) return rows;

  return rows.map((row) => {
    if (row && typeof row === 'object' && typeof row.get !== 'function') {
      Object.defineProperty(row, 'get', {
        configurable: true,
        enumerable: false,
        value: (field) => row[field],
      });
    }
    return row;
  });
};

module.exports = UserSessionModel;
