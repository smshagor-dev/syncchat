const { Op } = require('sequelize');
const E2eeDeviceKeyModel = require('../db/models/e2eeDeviceKey');
const UserSessionModel = require('../db/models/userSession');
const InboxModel = require('../db/models/inbox');
const { asArray, toPlainMany } = require('../db/utils');

const unique = (values) => [...new Set(asArray(values).filter(Boolean).map(String))];

const cleanupStaleE2eeKeys = async ({ userIds = [] } = {}) => {
  const normalizedUserIds = unique(userIds);
  const where = { active: true };
  if (normalizedUserIds.length) where.userId = { [Op.in]: normalizedUserIds };

  const keyRows = await E2eeDeviceKeyModel.findAll({ where });
  const keys = toPlainMany(keyRows);
  if (!keys.length) return { activeKeys: [], staleSessionIds: [] };

  const sessionIds = unique(keys.map((item) => item.sessionId));
  const sessions = sessionIds.length
    ? toPlainMany(
        await UserSessionModel.findAll({
          where: { _id: { [Op.in]: sessionIds } },
          attributes: ['_id', 'userId', 'revokedAt'],
        })
      )
    : [];

  const activeSessionIds = new Set(
    sessions
      .filter((session) => !session.revokedAt)
      .map((session) => String(session._id))
  );
  const staleKeys = keyRows.filter(
    (row) => !activeSessionIds.has(String(row.sessionId || ''))
  );

  if (staleKeys.length) {
    await Promise.all(
      staleKeys.map((row) =>
        row.update({
          active: false,
          revokedAt: row.revokedAt || new Date(),
        })
      )
    );
  }

  const staleIds = new Set(staleKeys.map((row) => String(row.sessionId || '')));
  return {
    activeKeys: keys.filter((item) => !staleIds.has(String(item.sessionId || ''))),
    staleSessionIds: [...staleIds],
  };
};

const queryUserIds = (req) =>
  unique(String(req.query?.userIds || '').split(',').map((item) => item.trim()));

const roomUserIds = async (req) => {
  const roomId = String(req.params?.roomId || '').trim();
  if (!roomId) return [];
  const inbox = await InboxModel.findOne({
    where: { roomId },
    attributes: ['ownersId'],
  });
  return unique(inbox?.ownersId);
};

const cleanupQueryE2eeKeys = async (req, res, next) => {
  try {
    await cleanupStaleE2eeKeys({ userIds: queryUserIds(req) });
    next();
  } catch (error0) {
    next(error0);
  }
};

const cleanupRoomE2eeKeys = async (req, res, next) => {
  try {
    await cleanupStaleE2eeKeys({ userIds: await roomUserIds(req) });
    next();
  } catch (error0) {
    next(error0);
  }
};

module.exports = {
  cleanupStaleE2eeKeys,
  cleanupQueryE2eeKeys,
  cleanupRoomE2eeKeys,
};
