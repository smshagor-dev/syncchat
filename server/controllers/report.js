const response = require('../helpers/response');
const ReportModel = require('../db/models/report');

exports.chat = async (req, res) => {
  try {
    const userId = req.user?._id;
    const roomId = String(req.body?.roomId || '').trim();
    const roomType = req.body?.roomType === 'group' ? 'group' : 'private';
    const targetId = String(req.body?.targetId || '').trim();
    const reason = String(req.body?.reason || '').trim().slice(0, 500);

    if (!userId || !roomId) {
      throw new Error('Invalid report payload');
    }
    if (reason.length < 3) {
      throw new Error('Please add a short reason (min 3 characters)');
    }

    const doc = await ReportModel.create({
      reporterId: userId,
      roomId,
      roomType,
      targetId: targetId || null,
      reason,
      status: 'open',
    });

    response({
      res,
      message: 'Report submitted successfully',
      payload: {
        reportId: doc._id,
        roomId,
        roomType,
        targetId,
        reason,
      },
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
