const { Op } = require('sequelize');
const InboxModel = require('../db/models/inbox');
const ProfileModel = require('../db/models/profile');
const { asArray, toPlainMany } = require('../db/utils');
const response = require('../helpers/response');

exports.mentionSuggestions = async (req, res) => {
  try {
    const roomId = String(req.params.roomId || '').trim();
    const userId = req.user?._id;
    const q = String(req.query.q || '').trim().toLowerCase().slice(0, 32);

    const inbox = await InboxModel.findOne({ where: { roomId } });
    if (!inbox || !asArray(inbox.ownersId).includes(userId)) {
      response({
        res,
        statusCode: 403,
        success: false,
        message: 'Forbidden',
      });
      return;
    }

    const participantIds = asArray(inbox.ownersId).filter(Boolean).slice(0, 5000);
    if (!participantIds.length) {
      response({ res, payload: [] });
      return;
    }

    const rows = await ProfileModel.findAll({
      where: { userId: { [Op.in]: participantIds } },
      attributes: ['userId', 'username', 'fullname', 'avatar'],
      limit: 5000,
    });

    const payload = toPlainMany(rows)
      .filter((profile) => profile.userId !== userId)
      .filter((profile) => {
        if (!q) return true;
        return (
          String(profile.username || '').toLowerCase().includes(q) ||
          String(profile.fullname || '').toLowerCase().includes(q)
        );
      })
      .filter((profile) => !!String(profile.username || '').trim())
      .sort((left, right) =>
        String(left.fullname || left.username || '').localeCompare(
          String(right.fullname || right.username || '')
        )
      )
      .slice(0, 12);

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
