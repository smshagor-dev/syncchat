const response = require('../helpers/response');
const { getPublicAppConfig } = require('../helpers/appConfig');
const { toAbsoluteUploadUrl } = require('../helpers/storage');

exports.getPublicConfig = async (req, res) => {
  try {
    const payload = await getPublicAppConfig();
    response({
      res,
      payload: {
        ...payload,
        appLogo: toAbsoluteUploadUrl(payload.appLogo || ''),
        seo: {
          ...(payload.seo || {}),
          image: toAbsoluteUploadUrl(payload.seo?.image || ''),
        },
      },
    });
  } catch (error0) {
    response({
      res,
      statusCode: 500,
      success: false,
      message: error0.message,
    });
  }
};
