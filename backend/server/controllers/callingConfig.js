const response = require('../helpers/response');
const { getCallRuntimeConfig } = require('../helpers/callConfig');

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
