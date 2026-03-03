const { Op } = require('sequelize');
const GroupModel = require('../db/models/group');
const ProfileModel = require('../db/models/profile');
const { asArray, toPlain, toPlainMany } = require('../db/utils');

const response = require('../helpers/response');

exports.findById = async (req, res) => {
  try {
    const group = await GroupModel.findOne({ where: { _id: req.params.groupId } });
    response({
      res,
      payload: toPlain(group),
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

exports.participantsName = async (req, res) => {
  try {
    const limit = Number(req.query.limit || 10);
    const group = await GroupModel.findOne({ where: { _id: req.params.groupId } });

    const participants = await ProfileModel.findAll({
      where: {
        userId: { [Op.in]: asArray(group?.participantsId) },
      },
      attributes: ['fullname', 'updatedAt'],
      order: [['updatedAt', 'DESC']],
      limit,
    });

    const names = toPlainMany(participants).map(({ fullname }) => fullname);

    response({
      res,
      payload: names,
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

exports.participants = async (req, res) => {
  try {
    const skip = Number(req.query.skip || 0);
    const limit = Number(req.query.limit || 20);
    const group = await GroupModel.findOne({ where: { _id: req.params.groupId } });

    const participants = await ProfileModel.findAll({
      where: {
        userId: { [Op.in]: asArray(group?.participantsId) },
      },
      order: [['updatedAt', 'DESC']],
      offset: skip,
      limit,
    });

    response({
      res,
      payload: toPlainMany(participants),
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
