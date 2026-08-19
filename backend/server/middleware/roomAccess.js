const InboxModel = require('../db/models/inbox');
const GroupModel = require('../db/models/group');
const ChannelModel = require('../db/models/channel');
const { addToSet, asArray, toPlain } = require('../db/utils');
const response = require('../helpers/response');
const logger = require('../helpers/logger');

const getRoomId = (req) =>
  String(req?.params?.roomId || req?.body?.roomId || '').trim();

const isCanonicalGroupMember = async ({ roomId, userId }) => {
  const [channelRow, groupRow] = await Promise.all([
    ChannelModel.findOne({
      where: { roomId },
      attributes: ['participantsId'],
    }),
    GroupModel.findOne({
      where: { roomId },
      attributes: ['participantsId'],
    }),
  ]);

  const channel = toPlain(channelRow);
  const group = toPlain(groupRow);
  const entity = channel || group;

  return !!entity && asArray(entity.participantsId).includes(userId);
};

/**
 * Authorize access to a room by the authenticated user.
 *
 * Private rooms continue to trust inbox.ownersId only. Group/channel rooms use
 * their canonical participantsId list as a fallback so legacy/stale inbox
 * ownership cannot reject a valid member. When that drift is detected, repair
 * inbox.ownersId before the existing controller-level access checks run.
 */
const roomAccess = async (req, res, next) => {
  try {
    const roomId = getRoomId(req);
    const userId = String(req?.user?._id || '').trim();

    if (!roomId || !userId) {
      response({
        res,
        statusCode: 400,
        success: false,
        message: 'Room and authenticated user are required',
      });
      return;
    }

    const inbox = await InboxModel.findOne({ where: { roomId } });
    if (!inbox) {
      response({
        res,
        statusCode: 404,
        success: false,
        message: 'Room not found',
      });
      return;
    }

    const inboxPlain = toPlain(inbox) || {};
    const ownersId = asArray(inboxPlain.ownersId);
    if (ownersId.includes(userId)) {
      next();
      return;
    }

    if (inboxPlain.roomType === 'group') {
      const canonicalMember = await isCanonicalGroupMember({ roomId, userId });
      if (canonicalMember) {
        const repairedOwnersId = addToSet(ownersId, [userId]);
        await inbox.update({ ownersId: repairedOwnersId });
        logger.warn('ROOM_ACCESS_MEMBERSHIP_REPAIRED', {
          roomId,
          userId,
          previousOwnerCount: ownersId.length,
          repairedOwnerCount: repairedOwnersId.length,
        });
        next();
        return;
      }
    }

    response({
      res,
      statusCode: 403,
      success: false,
      message: 'Forbidden',
    });
  } catch (error0) {
    next(error0);
  }
};

module.exports = roomAccess;
