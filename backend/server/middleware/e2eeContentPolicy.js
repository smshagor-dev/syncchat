const InboxModel = require('../db/models/inbox');
const response = require('../helpers/response');

const getRoom = async (req) => {
  const roomId = String(req.body?.roomId || req.params?.roomId || '').trim();
  if (!roomId) return null;
  return InboxModel.findOne({ where: { roomId } });
};

const rejectWhenE2ee = (message, code) => async (req, res, next) => {
  try {
    const inbox = await getRoom(req);
    if (inbox?.roomType === 'private' && inbox?.e2eeEnabled) {
      response({
        res,
        statusCode: 409,
        success: false,
        message,
        payload: { code, roomId: inbox.roomId },
      });
      return;
    }
    next();
  } catch (error0) {
    next(error0);
  }
};

const rejectE2eeUnencryptedMedia = rejectWhenE2ee(
  'Media sending is disabled while device E2EE is enabled because encrypted media attachments are not implemented yet.',
  'E2EE_MEDIA_NOT_SUPPORTED'
);

const rejectE2eeServerScheduledMessage = rejectWhenE2ee(
  'Scheduled send is disabled while device E2EE is enabled because the server cannot encrypt a message later without device private keys.',
  'E2EE_SCHEDULE_NOT_SUPPORTED'
);

module.exports = {
  rejectE2eeUnencryptedMedia,
  rejectE2eeServerScheduledMessage,
};
