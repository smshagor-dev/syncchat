const response = require('../helpers/response');
const {
  getAdminChatAiConfig,
  updateChatAiConfig,
} = require('../helpers/chatAiConfig');

exports.getConfig = async (req, res) => {
  try {
    response({ res, payload: await getAdminChatAiConfig() });
  } catch (error0) {
    response({ res, statusCode: 500, success: false, message: error0.message });
  }
};

exports.updateConfig = async (req, res) => {
  try {
    const payload = await updateChatAiConfig(req.body || {});
    response({ res, message: 'Chat AI configuration updated', payload });
  } catch (error0) {
    response({ res, statusCode: 500, success: false, message: error0.message });
  }
};
