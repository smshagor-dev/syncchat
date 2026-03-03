const SettingModel = require('../db/models/setting');
const { toPlain } = require('../db/utils');
const response = require('../helpers/response');

exports.find = async (req, res) => {
  try {
    const setting = await SettingModel.findOne({ where: { userId: req.user._id } });
    response({
      res,
      payload: toPlain(setting),
    });
  } catch (error0) {
    response({
      res,
      statusCode: error0.statusCode || 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.update = async (req, res) => {
  try {
    const [affectedRows] = await SettingModel.update(req.body, {
      where: { userId: req.user._id },
    });

    response({
      res,
      message: 'Successfully updated account settings',
      payload: { affectedRows },
    });
  } catch (error0) {
    response({
      res,
      statusCode: error0.statusCode || 500,
      success: false,
      message: error0.message,
    });
  }
};
