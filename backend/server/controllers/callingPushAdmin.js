const response = require('../helpers/response');
const {
  getNativePushConfigForAdmin,
  saveNativePushConfig,
} = require('../helpers/nativePushConfig');
const { logAdminAction } = require('../helpers/adminAudit');

const safeError = (error0) =>
  String(error0?.message || 'Native push configuration operation failed').replace(
    /(privateKey|credential|secret|password)=([^&\s]+)/gi,
    '$1=***'
  );

exports.getConfig = async (req, res) => {
  try {
    response({ res, payload: await getNativePushConfigForAdmin() });
  } catch (error0) {
    response({
      res,
      statusCode: 500,
      success: false,
      message: safeError(error0),
    });
  }
};

exports.updateConfig = async (req, res) => {
  try {
    const payload = await saveNativePushConfig(req.body || {});
    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'calling.native_push.update',
      entityType: 'calling',
      entityId: 'native-push',
      metadata: {
        androidEnabled: payload.android?.enabled === true,
        iosEnabled: payload.ios?.enabled === true,
        iosEnvironment: payload.ios?.environment || 'production',
      },
    }).catch(() => {});
    response({
      res,
      message: 'Native call push configuration saved in MongoDB',
      payload,
    });
  } catch (error0) {
    response({
      res,
      statusCode: 400,
      success: false,
      message: safeError(error0),
    });
  }
};
