import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import * as bi from 'react-icons/bi';
import socket from '../../helpers/socket';
import { setModal } from '../../redux/features/modal';
import { callAllowed, getCallingConfig } from '../../helpers/callingConfig';

const durationText = (seconds) => {
  const total = Math.max(0, Number(seconds || 0));
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

function CallPanelV2() {
  const dispatch = useDispatch();
  const {
    modal: { callPanel },
    user: { master, setting },
    room: { chat: chatRoom },
  } = useSelector((state) => state);

  const data = callPanel || null;
  const active = !!data;
  const mediaType = data?.mediaType === 'video' ? 'video' : 'audio';
  const isVideo = mediaType === 'video';
  const roomId = data?.roomId || chatRoom?.data?.roomId;
  const roomType = data?.roomType || chatRoom?.data?.roomType || 'private';
  const incoming = data?.mode === 'incoming';
  const recipients = Array.isArray(data?.recipientsId) ? data.recipientsId : [];

  const [config, setConfig] = useState(null);
  const [status, setStatus] = useState('');
  const [joined, setJoined] = useState(false);
  const [connected, setConnected] = useState(false);
  const [muted, setMuted] = useState(!setting?.microphoneEnabled);
  const [camOff, setCamOff] = useState(!setting?.cameraEnabled);
  const [speakerOff, setSpeakerOff] = useState(!setting?.speakerEnabled);
  const [facingMode, setFacingMode] = useState('user');
  const [seconds, setSeconds] = useState(0);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [quality, setQuality] = useState({
    label: 'Connecting',
    rttMs: null,
    jitterMs: null,
    packetLossPct: null,
  });

  const peers = useRef({});
  const pendingIce = useRef({});
  const localStream = useRef(null);
  const localVideo = useRef(null);
  const remoteVideo = useRef(null);
  const joinedRef = useRef(false);
  const connectedRef = useRef(false);
  const startedRef = useRef(false);
  const ringTimer = useRef(null);
  const reconnectTimers = useRef({});
  const restartAttempts = useRef({});

  const peerName = useMemo(() => {
    if (incoming) {
      return data?.fromName || (data?.fromUsername ? `@${data.fromUsername}` : 'Unknown user');
    }
    if (data?.peerName) return data.peerName;
    if (roomType === 'group') return chatRoom?.data?.group?.name || 'Group call';
    return (
      chatRoom?.data?.profile?.fullname ||
      (chatRoom?.data?.profile?.username
        ? `@${chatRoom.data.profile.username}`
        : 'Unknown user')
    );
  }, [incoming, data, roomType, chatRoom?.data]);

  const peerAvatar =
    data?.peerAvatar ||
    data?.fromAvatar ||
    (roomType === 'group'
      ? chatRoom?.data?.group?.avatar || 'assets/images/default-group-avatar.png'
      : chatRoom?.data?.profile?.avatar || 'assets/images/default-avatar.png');

  const participants = Math.max(
    2,
    roomType === 'group' ? recipients.length + 1 : 2
  );
  const policy = config
    ? callAllowed(config, { mediaType, roomType, participants })
    : { allowed: false, message: 'Loading calling configuration...' };

  const mediaConstraints = (videoEnabled = isVideo) => ({
    audio: setting?.microphoneEnabled
      ? {
          echoCancellation: config?.audioProfile?.echoCancellation !== false,
          noiseSuppression: config?.audioProfile?.noiseSuppression !== false,
          autoGainControl: config?.audioProfile?.autoGainControl !== false,
        }
      : false,
    video:
      videoEnabled && setting?.cameraEnabled && config?.videoEnabled !== false
        ? {
            width: {
              ideal: Number(config?.videoProfile?.width || 1280),
              min: Number(config?.videoProfile?.minWidth || 320),
            },
            height: {
              ideal: Number(config?.videoProfile?.height || 720),
              min: Number(config?.videoProfile?.minHeight || 180),
            },
            frameRate: {
              ideal: Number(config?.videoProfile?.frameRate || 30),
              min: Number(config?.videoProfile?.minFrameRate || 15),
            },
            facingMode: { ideal: facingMode },
          }
        : false,
  });

  const clearTimer = (ref) => {
    if (ref.current) clearTimeout(ref.current);
    ref.current = null;
  };

  const clearReconnect = (userId) => {
    if (reconnectTimers.current[userId]) {
      clearTimeout(reconnectTimers.current[userId]);
      delete reconnectTimers.current[userId];
    }
  };

  const cleanupPeer = (userId) => {
    clearReconnect(userId);
    const pc = peers.current[userId];
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.close();
      delete peers.current[userId];
    }
    delete pendingIce.current[userId];
    delete restartAttempts.current[userId];
    setRemoteStreams((prev) => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
  };

  const teardown = () => {
    clearTimer(ringTimer);
    Object.keys(peers.current).forEach(cleanupPeer);
    if (localStream.current) {
      localStream.current.getTracks().forEach((track) => track.stop());
      localStream.current = null;
    }
    if (localVideo.current) localVideo.current.srcObject = null;
    joinedRef.current = false;
    connectedRef.current = false;
    startedRef.current = false;
    setJoined(false);
    setConnected(false);
    setRemoteStreams({});
    setSeconds(0);
  };

  const close = () => {
    if (joinedRef.current && roomId && master?._id) {
      socket.emit('call/leave', { roomId, userId: master._id });
    }
    teardown();
    dispatch(setModal({ target: 'callPanel', data: false }));
  };

  const markConnected = () => {
    clearTimer(ringTimer);
    connectedRef.current = true;
    setConnected(true);
    setStatus('Connected');
  };

  const ensureLocalStream = async () => {
    if (localStream.current) return localStream.current;
    const stream = await navigator.mediaDevices.getUserMedia(mediaConstraints(isVideo));
    localStream.current = stream;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
    stream.getVideoTracks().forEach((track) => {
      track.enabled = !camOff;
    });
    if (localVideo.current) localVideo.current.srcObject = stream;
    return stream;
  };

  const sendOffer = async (userId, pc, iceRestart = false) => {
    const offer = await pc.createOffer(iceRestart ? { iceRestart: true } : undefined);
    await pc.setLocalDescription(offer);
    socket.emit('call/signal', {
      roomId,
      fromUserId: master._id,
      toUserId: userId,
      signal: { type: 'offer', sdp: offer.sdp },
    });
  };

  const restartIce = async (userId, pc) => {
    const attempts = Number(restartAttempts.current[userId] || 0);
    if (attempts >= 2 || pc.signalingState === 'closed') {
      cleanupPeer(userId);
      setStatus('Connection lost');
      return;
    }
    restartAttempts.current[userId] = attempts + 1;
    setStatus('Reconnecting...');
    try {
      if (typeof pc.restartIce === 'function') pc.restartIce();
      await sendOffer(userId, pc, true);
    } catch (error0) {
      cleanupPeer(userId);
      setStatus('Connection lost');
    }
  };

  const ensurePeer = async (userId) => {
    if (peers.current[userId]) return peers.current[userId];
    const stream = await ensureLocalStream();
    const pc = new RTCPeerConnection({
      iceServers: Array.isArray(config?.iceServers) ? config.iceServers : [],
      iceTransportPolicy: config?.iceTransportPolicy === 'relay' ? 'relay' : 'all',
    });
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      socket.emit('call/signal', {
        roomId,
        fromUserId: master._id,
        toUserId: userId,
        signal: { type: 'ice', candidate: event.candidate },
      });
    };
    pc.ontrack = (event) => {
      const stream0 = event.streams?.[0];
      if (!stream0) return;
      setRemoteStreams((prev) => ({ ...prev, [userId]: stream0 }));
      markConnected();
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        clearReconnect(userId);
        restartAttempts.current[userId] = 0;
        markConnected();
        return;
      }
      if (pc.connectionState === 'failed') {
        restartIce(userId, pc);
        return;
      }
      if (pc.connectionState === 'disconnected') {
        clearReconnect(userId);
        reconnectTimers.current[userId] = setTimeout(
          () => restartIce(userId, pc),
          Math.max(3, Number(config?.reconnectGraceSec || 12)) * 1000
        );
        setStatus('Reconnecting...');
      }
      if (pc.connectionState === 'closed') cleanupPeer(userId);
    };

    peers.current[userId] = pc;
    return pc;
  };

  const flushIce = async (userId, pc) => {
    const items = pendingIce.current[userId] || [];
    pendingIce.current[userId] = [];
    for (const candidate of items) {
      await pc.addIceCandidate(candidate);
    }
  };

  const join = async () => {
    if (!policy.allowed) throw new Error(policy.message);
    await ensureLocalStream();
    socket.emit('call/join', { roomId, userId: master._id, mediaType });
    joinedRef.current = true;
    setJoined(true);
  };

  const start = async () => {
    if (startedRef.current) return;
    if (!policy.allowed) throw new Error(policy.message);
    startedRef.current = true;
    setStatus('Preparing call...');
    await ensureLocalStream();
    socket.emit('call/start', {
      roomId,
      roomType,
      fromUserId: master._id,
      mediaType,
      fromName: data?.fromName || master?.fullname || '',
      fromUsername: data?.fromUsername || master?.username || '',
      recipientsId: recipients,
    });
    socket.emit('call/join', { roomId, userId: master._id, mediaType });
    joinedRef.current = true;
    setJoined(true);
    setStatus('Ringing...');
    ringTimer.current = setTimeout(() => {
      if (connectedRef.current) return;
      socket.emit('call/cancel', {
        roomId,
        userId: master._id,
        reason: 'timeout',
      });
      setStatus('No answer');
      setTimeout(close, 700);
    }, Math.max(10, Number(config?.ringingTimeoutSec || 45)) * 1000);
  };

  const accept = async () => {
    try {
      setStatus('Connecting...');
      await join();
      socket.emit('call/accept', {
        roomId,
        userId: master._id,
        fromUserId: data?.fromUserId,
      });
    } catch (error0) {
      setStatus(error0.message || 'Unable to accept call');
    }
  };

  const reject = () => {
    socket.emit('call/reject', {
      roomId,
      fromUserId: master._id,
      toUserId: data?.fromUserId,
    });
    close();
  };

  const end = () => {
    if (!connectedRef.current && !incoming) {
      socket.emit('call/cancel', {
        roomId,
        userId: master._id,
        reason: 'cancelled',
      });
    } else {
      socket.emit('call/end', {
        roomId,
        userId: master._id,
        reason: 'ended',
      });
    }
    close();
  };

  const enableAudio = async () => {
    let stream = localStream.current;
    if (!stream) stream = await ensureLocalStream();
    let track = stream.getAudioTracks().find((item) => item.readyState === 'live');
    if (!track) {
      const audioStream = await navigator.mediaDevices.getUserMedia({
        audio: mediaConstraints(false).audio,
        video: false,
      });
      [track] = audioStream.getAudioTracks();
      stream.addTrack(track);
      await Promise.all(
        Object.values(peers.current).map(async (pc) => {
          const sender = pc.getSenders().find((item) => item.track?.kind === 'audio');
          if (sender) await sender.replaceTrack(track);
          else pc.addTrack(track, stream);
        })
      );
    }
    track.enabled = true;
    setMuted(false);
  };

  const toggleMute = () => {
    const tracks = localStream.current?.getAudioTracks() || [];
    if (!tracks.length) {
      enableAudio().catch((error0) => setStatus(error0.message));
      return;
    }
    const next = !muted;
    tracks.forEach((track) => {
      track.enabled = !next;
    });
    setMuted(next);
  };

  const replaceVideoTrack = async (nextFacing = facingMode) => {
    const videoStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { ...mediaConstraints(true).video, facingMode: { ideal: nextFacing } },
    });
    const [track] = videoStream.getVideoTracks();
    if (!track) throw new Error('Camera not available');
    const stream = localStream.current || new MediaStream();
    stream.getVideoTracks().forEach((oldTrack) => {
      stream.removeTrack(oldTrack);
      oldTrack.stop();
    });
    stream.addTrack(track);
    localStream.current = stream;
    if (localVideo.current) localVideo.current.srcObject = stream;
    await Promise.all(
      Object.values(peers.current).map(async (pc) => {
        const sender = pc.getSenders().find((item) => item.track?.kind === 'video');
        if (sender) await sender.replaceTrack(track);
        else pc.addTrack(track, stream);
      })
    );
    track.enabled = true;
    setCamOff(false);
  };

  const toggleCamera = async () => {
    const tracks = localStream.current?.getVideoTracks() || [];
    if (!tracks.length) {
      try {
        await replaceVideoTrack(facingMode);
      } catch (error0) {
        setStatus(error0.message || 'Unable to enable camera');
      }
      return;
    }
    const next = !camOff;
    tracks.forEach((track) => {
      track.enabled = !next;
    });
    setCamOff(next);
  };

  const switchCamera = async () => {
    const next = facingMode === 'user' ? 'environment' : 'user';
    try {
      await replaceVideoTrack(next);
      setFacingMode(next);
    } catch (error0) {
      setStatus(error0.message || 'Unable to switch camera');
    }
  };

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    setStatus('Loading calling settings...');
    getCallingConfig({ force: true })
      .then((value) => {
        if (cancelled) return;
        setConfig(value);
        const allowed = callAllowed(value, {
          mediaType,
          roomType,
          participants,
        });
        setStatus(
          allowed.allowed
            ? incoming
              ? 'Incoming call'
              : 'Preparing call...'
            : allowed.message
        );
      })
      .catch((error0) => {
        if (!cancelled) {
          setStatus(error0?.response?.data?.message || error0.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [active, mediaType, roomType, incoming]);

  useEffect(() => {
    if (!active || !config || !policy.allowed || !roomId || !master?._id) {
      return undefined;
    }
    if (!window.RTCPeerConnection || !navigator.mediaDevices?.getUserMedia) {
      setStatus('WebRTC is not supported in this browser');
      return undefined;
    }

    const onJoined = async ({ roomId: rid, userId }) => {
      if (rid !== roomId || !userId || userId === master._id || !joinedRef.current) return;
      try {
        const pc = await ensurePeer(userId);
        await sendOffer(userId, pc);
      } catch (error0) {
        setStatus(error0.message || 'Unable to connect participant');
      }
    };
    const onSignal = async ({ roomId: rid, fromUserId, signal }) => {
      if (rid !== roomId || !fromUserId || fromUserId === master._id || !signal) return;
      try {
        const pc = await ensurePeer(fromUserId);
        if (signal.type === 'offer') {
          await pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
          await flushIce(fromUserId, pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('call/signal', {
            roomId,
            fromUserId: master._id,
            toUserId: fromUserId,
            signal: { type: 'answer', sdp: answer.sdp },
          });
        } else if (signal.type === 'answer') {
          await pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
          await flushIce(fromUserId, pc);
        } else if (signal.type === 'ice' && signal.candidate) {
          if (pc.remoteDescription) await pc.addIceCandidate(signal.candidate);
          else {
            pendingIce.current[fromUserId] = [
              ...(pendingIce.current[fromUserId] || []),
              signal.candidate,
            ];
          }
        }
      } catch (error0) {
        // eslint-disable-next-line no-console
        console.error('Call signal error', error0.message);
      }
    };
    const finish = (message, delay = 650) => ({ roomId: rid }) => {
      if (rid !== roomId) return;
      clearTimer(ringTimer);
      setStatus(message);
      setTimeout(close, delay);
    };
    const onEnded = finish('Call ended', 400);
    const onRejected = finish('Call rejected');
    const onBusy = finish('User is busy');
    const onMissed = finish(incoming ? 'Missed call' : 'No answer');
    const onCancelled = finish('Call cancelled', 450);
    const onConnected = ({ roomId: rid }) => {
      if (rid === roomId && joinedRef.current) markConnected();
    };
    const onAccepted = ({ roomId: rid }) => {
      if (rid !== roomId) return;
      clearTimer(ringTimer);
      setStatus('Connecting...');
    };
    const onLeft = ({ roomId: rid, userId }) => {
      if (rid === roomId && userId) cleanupPeer(userId);
    };
    const onError = ({ roomId: rid, message }) => {
      if (rid && rid !== roomId) return;
      startedRef.current = false;
      setStatus(message || 'Call could not be started');
    };

    socket.on('call/user-joined', onJoined);
    socket.on('call/signal', onSignal);
    socket.on('call/connected', onConnected);
    socket.on('call/accepted', onAccepted);
    socket.on('call/user-left', onLeft);
    socket.on('call/ended', onEnded);
    socket.on('call/rejected', onRejected);
    socket.on('call/busy', onBusy);
    socket.on('call/missed', onMissed);
    socket.on('call/cancelled', onCancelled);
    socket.on('call/error', onError);

    if (!incoming) {
      start().catch((error0) => {
        startedRef.current = false;
        setStatus(error0.message || 'Failed to start call');
      });
    }

    return () => {
      socket.off('call/user-joined', onJoined);
      socket.off('call/signal', onSignal);
      socket.off('call/connected', onConnected);
      socket.off('call/accepted', onAccepted);
      socket.off('call/user-left', onLeft);
      socket.off('call/ended', onEnded);
      socket.off('call/rejected', onRejected);
      socket.off('call/busy', onBusy);
      socket.off('call/missed', onMissed);
      socket.off('call/cancelled', onCancelled);
      socket.off('call/error', onError);
    };
  }, [active, config, roomId, mediaType, roomType, incoming, master?._id]);

  useEffect(() => {
    if (!remoteVideo.current) return;
    remoteVideo.current.muted = speakerOff;
    remoteVideo.current.volume = speakerOff ? 0 : 1;
  }, [speakerOff, remoteStreams]);

  useEffect(() => {
    if (!connected) return undefined;
    const callClock = setInterval(() => setSeconds((value) => value + 1), 1000);
    const statsClock = setInterval(async () => {
      const values = Object.values(peers.current);
      if (!values.length) return;
      let rtt = 0;
      let rttN = 0;
      let jitter = 0;
      let jitterN = 0;
      let lost = 0;
      let received = 0;
      await Promise.all(
        values.map(async (pc) => {
          try {
            const reports = await pc.getStats();
            reports.forEach((report) => {
              if (
                report.type === 'candidate-pair' &&
                report.state === 'succeeded' &&
                Number.isFinite(report.currentRoundTripTime)
              ) {
                rtt += report.currentRoundTripTime * 1000;
                rttN += 1;
              }
              if (report.type === 'inbound-rtp' && !report.isRemote) {
                if (Number.isFinite(report.jitter)) {
                  jitter += report.jitter * 1000;
                  jitterN += 1;
                }
                lost += Math.max(0, Number(report.packetsLost || 0));
                received += Math.max(0, Number(report.packetsReceived || 0));
              }
            });
          } catch (error0) {
            // Ignore one sampling failure.
          }
        })
      );
      const rttMs = rttN ? Math.round(rtt / rttN) : null;
      const jitterMs = jitterN ? Math.round(jitter / jitterN) : null;
      const packetLossPct =
        lost + received > 0 ? Number(((lost / (lost + received)) * 100).toFixed(1)) : null;
      const poor =
        (rttMs !== null && rttMs > 350) ||
        (jitterMs !== null && jitterMs > 50) ||
        (packetLossPct !== null && packetLossPct > 8);
      const fair =
        (rttMs !== null && rttMs > 180) ||
        (jitterMs !== null && jitterMs > 30) ||
        (packetLossPct !== null && packetLossPct > 3);
      setQuality({
        label: poor ? 'Poor' : fair ? 'Fair' : 'Good',
        rttMs,
        jitterMs,
        packetLossPct,
      });
    }, 4000);
    return () => {
      clearInterval(callClock);
      clearInterval(statsClock);
    };
  }, [connected]);

  useEffect(
    () => () => {
      teardown();
    },
    []
  );

  const primaryRemote = Object.values(remoteStreams)[0];

  return active ? (
    <div className="fixed inset-0 z-[80] bg-[#0b141a] text-white">
      {isVideo && primaryRemote ? (
        <video
          ref={(node) => {
            remoteVideo.current = node;
            if (node && node.srcObject !== primaryRemote) {
              node.srcObject = primaryRemote;
              node.muted = speakerOff;
              node.volume = speakerOff ? 0 : 1;
              node.play?.().catch(() => {});
            }
          }}
          autoPlay
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[radial-gradient(circle_at_center,#19333e_0,#0b141a_60%)]">
          <img
            src={peerAvatar}
            alt=""
            className="h-36 w-36 rounded-full object-cover ring-4 ring-white/10"
          />
          <h2 className="mt-5 text-2xl font-semibold">{peerName}</h2>
        </div>
      )}

      {isVideo && localStream.current && (
        <video
          ref={(node) => {
            localVideo.current = node;
            if (node && node.srcObject !== localStream.current) {
              node.srcObject = localStream.current;
              node.muted = true;
              node.play?.().catch(() => {});
            }
          }}
          autoPlay
          muted
          playsInline
          className="absolute right-4 top-20 h-40 w-28 rounded-xl border border-white/20 bg-black object-cover md:h-52 md:w-36"
        />
      )}

      <div className="absolute inset-x-0 top-0 flex justify-between bg-gradient-to-b from-black/60 to-transparent p-5">
        <div>
          <h1 className="text-lg font-semibold">{peerName}</h1>
          <p className="text-sm text-white/70">
            {connected ? durationText(seconds) : status || 'Calling...'}
          </p>
          {connected && (
            <p className="mt-1 text-xs text-white/55">
              Quality: {quality.label}
              {quality.rttMs !== null ? ` • ${quality.rttMs} ms` : ''}
              {quality.packetLossPct !== null ? ` • ${quality.packetLossPct}% loss` : ''}
            </p>
          )}
        </div>
        <button
          type="button"
          className="h-10 w-10 rounded-full bg-white/10 hover:bg-white/20"
          onClick={end}
          aria-label="Close call"
        >
          <bi.BiX />
        </button>
      </div>

      {!policy.allowed && config && (
        <div className="absolute left-1/2 top-1/2 max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-red-500/20 p-4 text-center">
          {policy.message}
        </div>
      )}

      {incoming && !joined && policy.allowed ? (
        <div className="absolute inset-x-0 bottom-8 flex justify-center gap-8">
          <button
            type="button"
            className="h-16 w-16 rounded-full bg-red-600 text-2xl"
            onClick={reject}
            aria-label="Reject call"
          >
            <bi.BiPhoneOff />
          </button>
          <button
            type="button"
            className="h-16 w-16 rounded-full bg-emerald-600 text-2xl"
            onClick={accept}
            aria-label="Accept call"
          >
            <bi.BiPhoneCall />
          </button>
        </div>
      ) : policy.allowed ? (
        <div className="absolute inset-x-0 bottom-6 flex flex-wrap justify-center gap-3 px-4">
          <button
            type="button"
            className="h-12 w-12 rounded-full bg-white/15"
            onClick={() => setSpeakerOff((value) => !value)}
            aria-label="Toggle speaker"
          >
            {speakerOff ? <bi.BiVolumeMute /> : <bi.BiVolumeFull />}
          </button>
          <button
            type="button"
            className="h-12 w-12 rounded-full bg-white/15"
            onClick={toggleMute}
            aria-label="Toggle mute"
          >
            {muted ? <bi.BiMicrophoneOff /> : <bi.BiMicrophone />}
          </button>
          {config?.videoEnabled && (
            <button
              type="button"
              className="h-12 w-12 rounded-full bg-white/15"
              onClick={toggleCamera}
              aria-label="Toggle camera"
            >
              {camOff ? <bi.BiVideoOff /> : <bi.BiVideo />}
            </button>
          )}
          {config?.videoEnabled && !camOff && (
            <button
              type="button"
              className="h-12 w-12 rounded-full bg-white/15"
              onClick={switchCamera}
              aria-label="Switch camera"
            >
              <bi.BiRefresh />
            </button>
          )}
          <button
            type="button"
            className="h-14 w-14 rounded-full bg-red-600 text-xl"
            onClick={end}
            aria-label="End call"
          >
            <bi.BiPhoneOff />
          </button>
        </div>
      ) : null}
    </div>
  ) : null;
}

export default CallPanelV2;
