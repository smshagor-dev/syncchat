const response = require('../helpers/response');
const {
  getSocialAuthConfigForAdmin,
  saveSocialAuthConfig,
} = require('../helpers/socialAuthConfig');

exports.getConfig = async (req, res) => {
  try {
    const payload = await getSocialAuthConfigForAdmin();
    response({ res, payload });
  } catch (error0) {
    response({
      res,
      statusCode: error0.statusCode || 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.updateConfig = async (req, res) => {
  try {
    const payload = await saveSocialAuthConfig(req.body || {});
    response({
      res,
      message: 'Social login configuration saved in MongoDB',
      payload,
    });
  } catch (error0) {
    response({
      res,
      statusCode: error0.statusCode || 400,
      success: false,
      message: error0.message,
    });
  }
};
