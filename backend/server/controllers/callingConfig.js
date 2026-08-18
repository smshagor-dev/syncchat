const response = require('../helpers/response');
const { getCallRuntimeConfig } = require('../helpers/callConfig');
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
