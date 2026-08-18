const CallHistoryModel = require('../db/models/callHistory');
const { toPlain } = require('../db/utils');

const unique = (values) => [
  ...new Set((Array.isArray(values) ? values : []).filter(Boolean)),
];

const nowIso = () => new Date().toISOString();

const createCallHistory = async ({
  callId,
  roomId,
  roomType = 'private',
  mediaType = 'audio',
  initiatorId,
  participantIds = [],
  joinedUserIds = [],
  rejectedUserIds = [],
  busyUserIds = [],
  status = 'ringing',
  ringingTimeoutSec = 45,
  ringingAt = null,
  acceptedAt = null,
  connectedAt = null,
  endedAt = null,
  durationSec = 0,
  endedBy = null,
  endReason = '',
  failureCode = '',
  failureMessage = '',
  eventUserId = null,
  eventReason = '',
}) => {
  const eventAt = nowIso();
  const history = [
    {
      status,
      at: eventAt,
      userId: eventUserId || initiatorId || null,
      reason: eventReason || endReason || '',
      code: failureCode || '',
      message: failureMessage || '',
    },
  ];

  return CallHistoryModel.create({
    callId,
    roomId,
    roomType,
    mediaType,
    initiatorId,
    participantIds: unique(participantIds),
    joinedUserIds: unique(joinedUserIds),
    rejectedUserIds: unique(rejectedUserIds),
    busyUserIds: unique(busyUserIds),
    status,
    statusHistory: history,
    ringingTimeoutSec: Math.max(1, Number(ringingTimeoutSec || 45)),
    ringingAt,
    acceptedAt,
    connectedAt,
    endedAt,
    durationSec: Math.max(0, Number(durationSec || 0)),
    endedBy,
    endReason,
    failureCode,
    failureMessage,
  });
};

const recordCallEvent = async ({
  callId,
  eventStatus,
  setStatus = true,
  patch = {},
  userId = null,
  reason = '',
  code = '',
  message = '',
  details = null,
}) => {
  if (!callId || !eventStatus) return null;

  const doc = await CallHistoryModel.findOne({ where: { callId } });
  if (!doc) return null;

  const plain = toPlain(doc) || {};
  const currentHistory = Array.isArray(plain.statusHistory)
    ? plain.statusHistory
    : [];
  const event = {
    status: eventStatus,
    at: nowIso(),
    userId,
    reason,
    code,
    message,
  };
  if (details && typeof details === 'object') {
    event.details = details;
  }

  const nextHistory = [...currentHistory.slice(-199), event];
  const update = {
    ...patch,
    statusHistory: nextHistory,
  };
  if (setStatus) update.status = eventStatus;

  await doc.update(update);
  return toPlain(doc);
};

const markFailedAttempt = async ({
  callId,
  roomId,
  roomType,
  mediaType,
  initiatorId,
  participantIds,
  ringingTimeoutSec,
  code,
  message,
}) => {
  const endedAt = new Date();
  return createCallHistory({
    callId,
    roomId,
    roomType,
    mediaType,
    initiatorId,
    participantIds,
    status: 'failed',
    ringingTimeoutSec,
    endedAt,
    endedBy: initiatorId,
    endReason: 'failed',
    failureCode: code || 'CALL_FAILED',
    failureMessage: message || 'Call failed',
    eventUserId: initiatorId,
    eventReason: 'failed',
  });
};

const markBusyAttempt = async ({
  callId,
  roomId,
  roomType,
  mediaType,
  initiatorId,
  participantIds,
  busyUserIds,
  ringingTimeoutSec,
  reason = 'busy',
}) => {
  const endedAt = new Date();
  return createCallHistory({
    callId,
    roomId,
    roomType,
    mediaType,
    initiatorId,
    participantIds,
    busyUserIds,
    status: 'busy',
    ringingTimeoutSec,
    endedAt,
    endedBy: initiatorId,
    endReason: reason,
    eventUserId: initiatorId,
    eventReason: reason,
  });
};

module.exports = {
  createCallHistory,
  recordCallEvent,
  markFailedAttempt,
  markBusyAttempt,
};
