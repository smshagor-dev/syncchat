const AdminContentConfigModel = require('../db/models/adminContentConfig');
const response = require('../helpers/response');
const { asArray } = require('../db/utils');

exports.getConfig = async (req, res) => {
  try {
    const [row] = await AdminContentConfigModel.findOrCreate({
      where: {},
      defaults: {
        blockedPreviewDomains: [],
      },
    });

    response({
      res,
      payload: {
        blockedPreviewDomains: asArray(row?.blockedPreviewDomains).filter(Boolean),
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
