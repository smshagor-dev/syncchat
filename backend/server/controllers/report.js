const response = require('../helpers/response');
const ReportModel = require('../db/models/report');
const GroupModel = require('../db/models/group');
const ChannelModel = require('../db/models/channel');
const ProfileModel = require('../db/models/profile');
const { toPlain, toPlainMany, asArray } = require('../db/utils');
const { isGroupAdminUser } = require('../helpers/groupAdmins');

const ensureRoomModeratorAccess = async ({ roomId, userId }) => {
  const [channel, group] = await Promise.all([
    ChannelModel.findOne({ where: { roomId } }),
    GroupModel.findOne({ where: { roomId } }),
  ]);
  const entity = toPlain(channel) || toPlain(group);
  if (!entity) {
    const error = new Error('Room not found');
    error.statusCode = 404;
    throw error;
  }
  if (!asArray(entity.participantsId).includes(userId)) {
    const error = new Error('You are not a participant of this room');
    error.statusCode = 403;
    throw error;
  }
  if (!isGroupAdminUser({ group: entity, userId })) {
    const error = new Error('Only admins can access report center');
    error.statusCode = 403;
    throw error;
  }
  return entity;
};

exports.chat = async (req, res) => {
  try {
    const userId = req.user?._id;
    const roomId = String(req.body?.roomId || '').trim();
    const roomType = req.body?.roomType === 'group' ? 'group' : 'private';
    const targetId = String(req.body?.targetId || '').trim();
    const reportedUserId = String(req.body?.reportedUserId || '').trim();
    const chatId = String(req.body?.chatId || '').trim();
    const category = String(req.body?.category || 'general')
      .trim()
      .toLowerCase()
      .slice(0, 32);
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
      reportedUserId: reportedUserId || null,
      chatId: chatId || null,
      source: 'user',
      category: category || 'general',
      reason,
      status: 'open',
      meta: {},
    });

    response({
      res,
      message: 'Report submitted successfully',
      payload: {
        reportId: doc._id,
        roomId,
        roomType,
        targetId,
        reportedUserId,
        chatId,
        category,
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

exports.roomCenter = async (req, res) => {
  try {
    const userId = req.user?._id;
    const roomId = String(req.params.roomId || '').trim();
    await ensureRoomModeratorAccess({ roomId, userId });

    const reports = toPlainMany(
      await ReportModel.findAll({
        where: { roomId },
        order: [['createdAt', 'DESC']],
        limit: 200,
      })
    );

    const profileIds = [
      ...new Set(
        reports
          .flatMap((item) => [item.reporterId, item.reportedUserId, item.reviewedBy])
          .filter(Boolean)
      ),
    ];
    const profiles = profileIds.length
      ? toPlainMany(
          await ProfileModel.findAll({
            where: { userId: profileIds },
            attributes: ['userId', 'fullname', 'avatar', 'username'],
          })
        )
      : [];
    const profileMap = new Map(profiles.map((item) => [item.userId, item]));

    response({
      res,
      payload: reports.map((item) => ({
        ...item,
        reporter: item.reporterId ? profileMap.get(item.reporterId) || null : null,
        reportedUser: item.reportedUserId
          ? profileMap.get(item.reportedUserId) || null
          : null,
        reviewer: item.reviewedBy ? profileMap.get(item.reviewedBy) || null : null,
      })),
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

exports.updateStatus = async (req, res) => {
  try {
    const userId = req.user?._id;
    const reportId = String(req.params.reportId || '').trim();
    const nextStatus = ['open', 'resolved', 'dismissed'].includes(req.body?.status)
      ? req.body.status
      : null;
    const resolutionNote = String(req.body?.resolutionNote || '').trim().slice(0, 500);

    if (!reportId || !nextStatus) {
      const error = new Error('Invalid report status update');
      error.statusCode = 400;
      throw error;
    }

    const report = await ReportModel.findOne({ where: { _id: reportId } });
    if (!report) {
      const error = new Error('Report not found');
      error.statusCode = 404;
      throw error;
    }

    await ensureRoomModeratorAccess({ roomId: report.roomId, userId });
    await report.update({
      status: nextStatus,
      resolutionNote: resolutionNote || null,
      reviewedBy: userId,
      reviewedAt: new Date(),
    });

    response({
      res,
      message: 'Report updated',
      payload: toPlain(report),
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
