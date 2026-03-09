const { Op } = require('sequelize');
const ScheduledMessageModel = require('../db/models/scheduledMessage');
const ProfileModel = require('../db/models/profile');
const { asArray, toPlain, toPlainMany } = require('../db/utils');
const { sendTextMessage } = require('./messageDispatch');

let workerInterval = null;
let isProcessing = false;

const addInterval = (date, recurringType) => {
  const next = new Date(date);
  if (Number.isNaN(next.getTime())) return null;

  switch (recurringType) {
    case 'daily':
      next.setDate(next.getDate() + 1);
      break;
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
    default:
      return null;
  }

  return next;
};

const computeFutureRecurringRun = (fromDate, recurringType) => {
  let next = addInterval(fromDate, recurringType);
  if (!next) return null;

  const now = new Date();
  while (next && next <= now) {
    next = addInterval(next, recurringType);
  }
  return next;
};

const serializeScheduledMessage = (job) => ({
  _id: job._id,
  senderId: job.senderId,
  roomId: job.roomId,
  roomType: job.roomType,
  ownersId: asArray(job.ownersId),
  text: job.text,
  replyTo: job.replyTo,
  mode: job.mode,
  recurringType: job.recurringType,
  scheduledFor: job.scheduledFor,
  nextRunAt: job.nextRunAt,
  targetUserId: job.targetUserId,
  status: job.status,
  sentCount: Number(job.sentCount || 0),
  lastSentAt: job.lastSentAt,
  createdAt: job.createdAt,
  updatedAt: job.updatedAt,
});

const emitScheduleUpsert = (job) => {
  if (!global.io || !job?.senderId) return;
  global.io.to(job.senderId).emit('scheduled/upsert', serializeScheduledMessage(job));
};

const emitScheduleRemove = (job) => {
  if (!global.io || !job?.senderId) return;
  global.io.to(job.senderId).emit('scheduled/remove', {
    _id: job._id,
    roomId: job.roomId,
  });
};

const isJobDue = async (job, targetUserId = null) => {
  if (job.status !== 'pending') return false;

  if (job.mode === 'when-online') {
    if (targetUserId && job.targetUserId !== targetUserId) return false;
    const target = await ProfileModel.findOne({
      where: { userId: job.targetUserId },
      attributes: ['online'],
    });
    return !!toPlain(target)?.online;
  }

  const nextRunAt = job.nextRunAt ? new Date(job.nextRunAt) : null;
  return !!nextRunAt && nextRunAt <= new Date();
};

const deliverJob = async (job) => {
  await sendTextMessage({
    senderId: job.senderId,
    roomId: job.roomId,
    roomType: job.roomType,
    ownersId: asArray(job.ownersId),
    text: job.text,
    replyTo: job.replyTo,
    scheduleMeta: {
      scheduledMessageId: job._id,
      mode: job.mode,
      recurringType: job.recurringType,
    },
  });

  const now = new Date();
  const nextRunAt =
    job.mode === 'recurring' && job.recurringType !== 'none'
      ? computeFutureRecurringRun(job.nextRunAt || job.scheduledFor || now, job.recurringType)
      : null;

  await job.update({
    status: nextRunAt ? 'pending' : 'sent',
    nextRunAt,
    lastSentAt: now,
    sentCount: Number(job.sentCount || 0) + 1,
  });

  emitScheduleUpsert(toPlain(job));
};

exports.serializeScheduledMessage = serializeScheduledMessage;

exports.processScheduledMessages = async ({
  targetUserId = null,
  scheduledMessageId = null,
} = {}) => {
  if (isProcessing) return;
  isProcessing = true;

  try {
    const where = { status: 'pending' };
    if (scheduledMessageId) where._id = scheduledMessageId;

    const jobsRaw = await ScheduledMessageModel.findAll({
      where,
      order: [['nextRunAt', 'ASC'], ['createdAt', 'ASC']],
      limit: scheduledMessageId ? 1 : 100,
    });

    for (const jobDoc of jobsRaw) {
      const job = jobDoc;
      // eslint-disable-next-line no-await-in-loop
      const due = await isJobDue(toPlain(job), targetUserId);
      if (!due) continue;

      try {
        // eslint-disable-next-line no-await-in-loop
        await deliverJob(job);
      } catch (error0) {
        // keep pending; try again next cycle
      }
    }
  } finally {
    isProcessing = false;
  }
};

exports.startScheduledMessageWorker = () => {
  if (workerInterval) return workerInterval;
  workerInterval = setInterval(() => {
    exports.processScheduledMessages().catch(() => {});
  }, 5000);
  return workerInterval;
};

exports.stopScheduledMessageWorker = () => {
  if (!workerInterval) return;
  clearInterval(workerInterval);
  workerInterval = null;
};

exports.createScheduledMessage = async (payload) => {
  const jobDoc = await ScheduledMessageModel.create(payload);
  const job = serializeScheduledMessage(toPlain(jobDoc));
  emitScheduleUpsert(job);
  return job;
};

exports.findScheduledMessages = async ({ senderId, roomId }) => {
  const jobsRaw = await ScheduledMessageModel.findAll({
    where: {
      senderId,
      roomId,
      status: 'pending',
    },
    order: [['nextRunAt', 'ASC'], ['createdAt', 'ASC']],
  });
  return toPlainMany(jobsRaw).map(serializeScheduledMessage);
};

exports.cancelScheduledMessage = async ({ senderId, scheduledMessageId }) => {
  const jobDoc = await ScheduledMessageModel.findOne({
    where: { _id: scheduledMessageId, senderId },
  });
  if (!jobDoc) return null;

  await jobDoc.update({ status: 'cancelled' });
  const job = toPlain(jobDoc);
  emitScheduleRemove(job);
  return serializeScheduledMessage(job);
};
