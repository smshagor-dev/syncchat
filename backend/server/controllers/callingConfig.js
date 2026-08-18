const response = require('../helpers/response');
const { getCallRuntimeConfig, getCallConfig } = require('../helpers/callConfig');
const { getCallStateById } = require('../helpers/callState');
const { getLiveKitJoinCredentials } = require('../helpers/livekit');

exports.getRuntimeConfig = async (req, res) => {
  try {
    const payload = await getCallRuntimeConfig(req.user?._id);
    response({ res, payload });
  } catch (error0) {
    response({
      res,
      statusCode: 500,
      success: false,
      message: error0.message || 'Unable to load calling configuration',
    });
  }
};

exports.getSessionMedia = async (req, res) => {
  try {
    const callId = req.params.callId;
    const userId = req.user?._id;
    const [state, config] = await Promise.all([
      getCallStateById(callId),
      getCallConfig(),
    ]);
    if (!state) {
      response({ res, statusCode: 404, success: false, message: 'Active call not found' });
      return;
    }
    if (!Array.isArray(state.participantIds) || !state.participantIds.includes(userId)) {
      response({ res, statusCode: 403, success: false, message: 'You are not a participant in this call' });
      return;
    }
    const participantCount = state.participantIds.length;
    const mediaMode =
      state.roomType === 'group' &&
      config.groupSfu?.enabled === true &&
      participantCount >= Number(config.groupSfu.minParticipants || 3)
        ? 'sfu'
        : 'p2p';
    response({
      res,
      payload: {
        callId,
        roomId: state.roomId,
        roomType: state.roomType,
        participantCount,
        mediaMode,
        provider: mediaMode === 'sfu' ? 'livekit' : 'webrtc-p2p',
      },
    });
  } catch (error0) {
    response({
      res,
      statusCode: 500,
      success: false,
      message: error0.message || 'Unable to resolve call media mode',
    });
  }
};

exports.getSfuToken = async (req, res) => {
  try {
    const payload = await getLiveKitJoinCredentials({
      callId: req.body?.callId,
      userId: req.user?._id,
      displayName: req.user?.fullname || req.user?.username || '',
    });
    response({ res, payload });
  } catch (error0) {
    response({
      res,
      statusCode: error0.statusCode || 500,
      success: false,
      message: error0.message || 'Unable to authorize group media session',
    });
  }
};
