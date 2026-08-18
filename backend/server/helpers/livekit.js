const jwt = require('jsonwebtoken');
const { getCallConfig } = require('./callConfig');
const { getCallStateById } = require('./callState');

const normalizeName = (value) => String(value || '').trim().slice(0, 128);

const roomNameForCall = (callId) => `syncchat-${String(callId || '').trim()}`;

const getLiveKitJoinCredentials = async ({ callId, userId, displayName }) => {
  if (!callId || !userId) {
    const error0 = new Error('callId and userId are required');
    error0.statusCode = 400;
    throw error0;
  }

  const [state, config] = await Promise.all([
    getCallStateById(callId),
    getCallConfig(),
  ]);

  if (!state) {
    const error0 = new Error('Active call not found');
    error0.statusCode = 404;
    throw error0;
  }

  if (state.roomType !== 'group') {
    const error0 = new Error('SFU access is only available for group calls');
    error0.statusCode = 400;
    throw error0;
  }

  if (!Array.isArray(state.participantIds) || !state.participantIds.includes(userId)) {
    const error0 = new Error('You are not a participant in this call');
    error0.statusCode = 403;
    throw error0;
  }

  const sfu = config.groupSfu || {};
  if (!sfu.enabled || sfu.provider !== 'livekit') {
    const error0 = new Error('Group SFU is not enabled');
    error0.statusCode = 503;
    throw error0;
  }

  if (!sfu.url || !sfu.apiKey || !sfu.apiSecret) {
    const error0 = new Error('LiveKit is not fully configured');
    error0.statusCode = 503;
    throw error0;
  }

  const participantCount = Array.isArray(state.participantIds)
    ? state.participantIds.length
    : 0;
  if (participantCount < Number(sfu.minParticipants || 3)) {
    const error0 = new Error('This call does not require SFU media routing');
    error0.statusCode = 409;
    throw error0;
  }

  const roomName = roomNameForCall(callId);
  const ttlSec = Math.max(300, Math.min(21600, Number(sfu.tokenTtlSec || 3600)));
  const token = jwt.sign(
    {
      name: normalizeName(displayName),
      metadata: JSON.stringify({
        syncchatCallId: callId,
        syncchatRoomId: state.roomId,
        syncchatUserId: userId,
      }),
      video: {
        roomJoin: true,
        room: roomName,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      },
    },
    sfu.apiSecret,
    {
      algorithm: 'HS256',
      issuer: sfu.apiKey,
      subject: String(userId),
      expiresIn: ttlSec,
    }
  );

  return {
    provider: 'livekit',
    url: sfu.url,
    token,
    roomName,
    expiresInSec: ttlSec,
    adaptiveStream: sfu.adaptiveStream !== false,
    dynacast: sfu.dynacast !== false,
  };
};

module.exports = {
  roomNameForCall,
  getLiveKitJoinCredentials,
};
