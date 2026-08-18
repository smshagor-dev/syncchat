import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import * as bi from 'react-icons/bi';
import socket from '../../helpers/socket';
import { setModal } from '../../redux/features/modal';
import { callAllowed, getCallingConfig } from '../../helpers/callingConfig';

const clock = (s) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

function CallPanelRuntime() {
  const dispatch = useDispatch();
  const call = useSelector((s) => s.modal.callPanel);
  const master = useSelector((s) => s.user.master);
  const setting = useSelector((s) => s.user.setting);
  const chat = useSelector((s) => s.room.chat);
  const active = !!call;
  const type = call?.mediaType === 'video' ? 'video' : 'audio';
  const video = type === 'video';
  const roomId = call?.roomId || chat?.data?.roomId;
  const roomType = call?.roomType || chat?.data?.roomType || 'private';
  const incoming = call?.mode === 'incoming';
  const recipients = Array.isArray(call?.recipientsId) ? call.recipientsId : [];

  const [cfg, setCfg] = useState(null);
  const [status, setStatus] = useState('');
  const [joined, setJoined] = useState(false);
  const [connected, setConnected] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(setting?.microphoneEnabled === false);
  const [camOff, setCamOff] = useState(setting?.cameraEnabled === false);
  const [speakerOff, setSpeakerOff] = useState(setting?.speakerEnabled === false);
  const [facing, setFacing] = useState('user');
  const [remote, setRemote] = useState({});
  const [quality, setQuality] = useState('Connecting');
  const [activeCallId, setActiveCallId] = useState(call?.callId || null);

  const peers = useRef({});
  const queuedIce = useRef({});
  const local = useRef(null);
  const localEl = useRef(null);
  const remoteEl = useRef(null);
  const joinedRef = useRef(false);
  const connectedRef = useRef(false);
  const startedRef = useRef(false);
  const ringTimer = useRef(null);
  const retryTimers = useRef({});
  const callIdRef = useRef(call?.callId || null);

  const participants =
    roomType === 'group' ? Math.max(2, recipients.length + 1) : 2;
  const policy = cfg
    ? callAllowed(cfg, { mediaType: type, roomType, participants })
    : { allowed: false, message: 'Loading calling configuration...' };

  const name = useMemo(() => {
    if (incoming) {
      return (
        call?.fromName ||
        (call?.fromUsername ? `@${call.fromUsername}` : 'Unknown user')
      );
    }
    if (call?.peerName) return call.peerName;
    if (roomType === 'group') return chat?.data?.group?.name || 'Group call';
    return (
      chat?.data?.profile?.fullname ||
      (chat?.data?.profile?.username
        ? `@${chat.data.profile.username}`
        : 'Unknown user')
    );
  }, [incoming, call, roomType, chat?.data]);

  const avatar =
    call?.peerAvatar ||
    call?.fromAvatar ||
    (roomType === 'group'
      ? chat?.data?.group?.avatar || 'assets/images/default-group-avatar.png'
      : chat?.data?.profile?.avatar || 'assets/images/default-avatar.png');

  const constraints = (withVideo = video, nextFacing = facing) => ({
    audio:
      setting?.microphoneEnabled === false
        ? false
        : {
            echoCancellation: cfg?.audioProfile?.echoCancellation !== false,
            noiseSuppression: cfg?.audioProfile?.noiseSuppression !== false,
            autoGainControl: cfg?.audioProfile?.autoGainControl !== false,
          },
    video:
      withVideo && cfg?.videoEnabled !== false && setting?.cameraEnabled !== false
        ? {
            width: {
              ideal: Number(cfg?.videoProfile?.width || 1280),
              min: Number(cfg?.videoProfile?.minWidth || 320),
            },
            height: {
              ideal: Number(cfg?.videoProfile?.height || 720),
              min: Number(cfg?.videoProfile?.minHeight || 180),
            },
            frameRate: {
              ideal: Number(cfg?.videoProfile?.frameRate || 30),
              min: Number(cfg?.videoProfile?.minFrameRate || 15),
            },
            facingMode: { ideal: nextFacing },
          }
        : false,
  });

  const setCallId = (value) => {
    const normalized = value || null;
    callIdRef.current = normalized;
    setActiveCallId(normalized);
  };

  const durableIdentity = () => ({
    callId: callIdRef.current || undefined,
    roomId,
  });

  const matchesCall = (rid, cid) => {
    if (rid !== roomId) return false;
    const expected = callIdRef.current;
    return !expected || !cid || cid === expected;
  };

  const clearRing = () => {
    if (ringTimer.current) clearTimeout(ringTimer.current);
    ringTimer.current = null;
  };

  const clearRetry = (id) => {
    if (retryTimers.current[id]) clearTimeout(retryTimers.current[id]);
    delete retryTimers.current[id];
  };

  const dropPeer = (id) => {
    clearRetry(id);
    const pc = peers.current[id];
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.close();
    }
    delete peers.current[id];
    delete queuedIce.current[id];
    setRemote((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const teardown = () => {
    clearRing();
    Object.keys(peers.current).forEach(dropPeer);
    Object.keys(retryTimers.current).forEach(clearRetry);
    local.current?.getTracks().forEach((t) => t.stop());
    local.current = null;
    if (localEl.current) localEl.current.srcObject = null;
    if (remoteEl.current) remoteEl.current.srcObject = null;
    joinedRef.current = false;
    connectedRef.current = false;
    startedRef.current = false;
    setJoined(false);
    setConnected(false);
    setSeconds(0);
    setRemote({});
  };

  const close = () => {
    if (joinedRef.current && roomId && master?._id) {
      socket.emit('call/leave', {
        ...durableIdentity(),
        userId: master._id,
      });
    }
    teardown();
    dispatch(setModal({ target: 'callPanel', data: false }));
  };

  const finish = (message, delay = 600) => ({
    callId: cid,
    roomId: rid,
  }) => {
    if (!matchesCall(rid, cid)) return;
    clearRing();
    setStatus(message);
    setTimeout(close, delay);
  };

  const ensureLocal = async () => {
    if (local.current) return local.current;
    const stream = await navigator.mediaDevices.getUserMedia(constraints(video));
    stream.getAudioTracks().forEach((t) => {
      t.enabled = !muted;
    });
    stream.getVideoTracks().forEach((t) => {
      t.enabled = !camOff;
    });
    local.current = stream;
    if (localEl.current) localEl.current.srcObject = stream;
    return stream;
  };

  const offer = async (id, pc, restart = false) => {
    if (restart && typeof pc.restartIce === 'function') pc.restartIce();
    const desc = await pc.createOffer(restart ? { iceRestart: true } : undefined);
    await pc.setLocalDescription(desc);
    socket.emit('call/signal', {
      ...durableIdentity(),
      fromUserId: master._id,
      toUserId: id,
      signal: { type: 'offer', sdp: desc.sdp },
    });
  };

  const ensurePeer = async (id) => {
    if (peers.current[id]) return peers.current[id];
    const stream = await ensureLocal();
    const pc = new RTCPeerConnection({
      iceServers: Array.isArray(cfg?.iceServers) ? cfg.iceServers : [],
      iceTransportPolicy: cfg?.iceTransportPolicy === 'relay' ? 'relay' : 'all',
    });
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit('call/signal', {
          ...durableIdentity(),
          fromUserId: master._id,
          toUserId: id,
          signal: { type: 'ice', candidate: e.candidate },
        });
      }
    };
    pc.ontrack = (e) => {
      const stream0 = e.streams?.[0];
      if (!stream0) return;
      setRemote((prev) => ({ ...prev, [id]: stream0 }));
      clearRing();
      connectedRef.current = true;
      setConnected(true);
      setStatus('Connected');
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        clearRetry(id);
        connectedRef.current = true;
        setConnected(true);
        setStatus('Connected');
      } else if (pc.connectionState === 'failed') {
        offer(id, pc, true).catch(() => dropPeer(id));
      } else if (pc.connectionState === 'disconnected') {
        setStatus('Reconnecting...');
        clearRetry(id);
        retryTimers.current[id] = setTimeout(
          () => offer(id, pc, true).catch(() => dropPeer(id)),
          Math.max(3, Number(cfg?.reconnectGraceSec || 12)) * 1000
        );
      }
    };
    peers.current[id] = pc;
    return pc;
  };

  const flushIce = async (id, pc) => {
    const list = queuedIce.current[id] || [];
    queuedIce.current[id] = [];
    for (const item of list) await pc.addIceCandidate(item);
  };

  const join = async () => {
    if (!policy.allowed) throw new Error(policy.message);
    await ensureLocal();
    socket.emit('call/join', {
      ...durableIdentity(),
      userId: master._id,
      mediaType: type,
    });
    joinedRef.current = true;
    setJoined(true);
  };

  const start = async () => {
    if (startedRef.current) return;
    if (!policy.allowed) throw new Error(policy.message);
    startedRef.current = true;
    setStatus('Preparing call...');
    await ensureLocal();
    socket.emit('call/start', {
      roomId,
      roomType,
      fromUserId: master._id,
      mediaType: type,
      fromName: call?.fromName || master?.fullname || '',
      fromUsername: call?.fromUsername || master?.username || '',
      recipientsId: recipients,
    });
    socket.emit('call/join', {
      roomId,
      userId: master._id,
      mediaType: type,
    });
    joinedRef.current = true;
    setJoined(true);
    setStatus('Ringing...');
    ringTimer.current = setTimeout(() => {
      if (connectedRef.current) return;
      socket.emit('call/cancel', {
        ...durableIdentity(),
        userId: master._id,
        reason: 'timeout',
      });
      setStatus('No answer');
      setTimeout(close, 700);
    }, Math.max(10, Number(cfg?.ringingTimeoutSec || 45)) * 1000);
  };

  const accept = () => {
    setStatus('Connecting...');
    join()
      .then(() =>
        socket.emit('call/accept', {
          ...durableIdentity(),
          userId: master._id,
          fromUserId: call?.fromUserId,
        })
      )
      .catch((e) => setStatus(e.message || 'Unable to accept call'));
  };

  const reject = () => {
    socket.emit('call/reject', {
      ...durableIdentity(),
      fromUserId: master._id,
      toUserId: call?.fromUserId,
    });
    close();
  };

  const end = () => {
    socket.emit(connectedRef.current || incoming ? 'call/end' : 'call/cancel', {
      ...durableIdentity(),
      userId: master._id,
      reason: connectedRef.current ? 'ended' : 'cancelled',
    });
    close();
  };

  const toggleMute = async () => {
    const stream = local.current || (await ensureLocal());
    let track = stream.getAudioTracks().find((t) => t.readyState === 'live');
    if (!track) {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: constraints(false).audio,
        video: false,
      });
      [track] = s.getAudioTracks();
      stream.addTrack(track);
      await Promise.all(
        Object.values(peers.current).map(async (pc) => {
          const sender = pc.getSenders().find((x) => x.track?.kind === 'audio');
          if (sender) await sender.replaceTrack(track);
          else pc.addTrack(track, stream);
        })
      );
      setMuted(false);
      return;
    }
    const next = !muted;
    track.enabled = !next;
    setMuted(next);
  };

  const replaceCamera = async (nextFacing) => {
    const s = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: constraints(true, nextFacing).video,
    });
    const [track] = s.getVideoTracks();
    if (!track) throw new Error('Camera not available');
    const stream = local.current || new MediaStream();
    stream.getVideoTracks().forEach((old) => {
      stream.removeTrack(old);
      old.stop();
    });
    stream.addTrack(track);
    local.current = stream;
    if (localEl.current) localEl.current.srcObject = stream;
    await Promise.all(
      Object.values(peers.current).map(async (pc) => {
        const sender = pc.getSenders().find((x) => x.track?.kind === 'video');
        if (sender) await sender.replaceTrack(track);
        else pc.addTrack(track, stream);
      })
    );
    setCamOff(false);
  };

  const toggleCamera = async () => {
    const track = local.current
      ?.getVideoTracks()
      .find((t) => t.readyState === 'live');
    if (!track) {
      replaceCamera(facing).catch((e) => setStatus(e.message));
      return;
    }
    const next = !camOff;
    track.enabled = !next;
    setCamOff(next);
  };

  const switchCamera = async () => {
    const next = facing === 'user' ? 'environment' : 'user';
    try {
      await replaceCamera(next);
      setFacing(next);
    } catch (e) {
      setStatus(e.message || 'Unable to switch camera');
    }
  };

  useEffect(() => {
    if (!active) {
      setCallId(null);
      return;
    }
    setCallId(call?.callId || null);
  }, [active, call?.callId, roomId]);

  useEffect(() => {
    if (!active) return undefined;
    let dead = false;
    setStatus('Loading calling settings...');
    getCallingConfig({ force: true })
      .then((value) => {
        if (dead) return;
        setCfg(value);
        const allowed = callAllowed(value, {
          mediaType: type,
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
      .catch(
        (e) => !dead && setStatus(e?.response?.data?.message || e.message)
      );
    return () => {
      dead = true;
    };
  }, [active, type, roomType, incoming]);

  useEffect(() => {
    if (!active || !cfg || !policy.allowed || !roomId || !master?._id) {
      return undefined;
    }
    if (!window.RTCPeerConnection || !navigator.mediaDevices?.getUserMedia) {
      setStatus('WebRTC is not supported in this browser');
      return undefined;
    }

    const onStarted = ({ callId: cid, roomId: rid }) => {
      if (rid !== roomId || !cid) return;
      if (callIdRef.current && callIdRef.current !== cid) return;
      setCallId(cid);
    };
    const onJoined = async ({ callId: cid, roomId: rid, userId }) => {
      if (
        !matchesCall(rid, cid) ||
        !userId ||
        userId === master._id ||
        !joinedRef.current
      ) {
        return;
      }
      if (cid && !callIdRef.current) setCallId(cid);
      clearRetry(userId);
      try {
        const pc = await ensurePeer(userId);
        await offer(userId, pc);
      } catch (e) {
        setStatus(e.message || 'Unable to connect participant');
      }
    };
    const onSignal = async ({
      callId: cid,
      roomId: rid,
      fromUserId,
      signal,
    }) => {
      if (
        !matchesCall(rid, cid) ||
        !fromUserId ||
        fromUserId === master._id ||
        !signal
      ) {
        return;
      }
      if (cid && !callIdRef.current) setCallId(cid);
      try {
        const pc = await ensurePeer(fromUserId);
        if (signal.type === 'offer') {
          await pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
          await flushIce(fromUserId, pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('call/signal', {
            ...durableIdentity(),
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
            queuedIce.current[fromUserId] = [
              ...(queuedIce.current[fromUserId] || []),
              signal.candidate,
            ];
          }
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Call signal error', e.message);
      }
    };
    const onLeft = ({ callId: cid, roomId: rid, userId, reason }) => {
      if (!matchesCall(rid, cid) || !userId) return;
      if (reason === 'socket-disconnected') {
        setStatus('Reconnecting...');
        clearRetry(userId);
        retryTimers.current[userId] = setTimeout(
          () => dropPeer(userId),
          Math.max(3, Number(cfg?.reconnectGraceSec || 12)) * 1000
        );
      } else {
        dropPeer(userId);
      }
    };
    const onConnected = ({ callId: cid, roomId: rid }) => {
      if (!matchesCall(rid, cid) || !joinedRef.current) return;
      if (cid && !callIdRef.current) setCallId(cid);
      clearRing();
      connectedRef.current = true;
      setConnected(true);
      setStatus('Connected');
    };
    const onAccepted = ({ callId: cid, roomId: rid }) => {
      if (!matchesCall(rid, cid)) return;
      if (cid && !callIdRef.current) setCallId(cid);
      clearRing();
      setStatus('Connecting...');
    };
    const onError = ({ callId: cid, roomId: rid, message }) => {
      if (rid && !matchesCall(rid, cid)) return;
      startedRef.current = false;
      setStatus(message || 'Call could not be started');
    };
    const onReconnect = () => {
      if (joinedRef.current) {
        socket.emit('call/join', {
          ...durableIdentity(),
          userId: master._id,
          mediaType: type,
        });
      }
    };
    const ended = finish('Call ended', 350);
    const rejected = finish('Call rejected');
    const busy = finish('User is busy');
    const missed = finish(incoming ? 'Missed call' : 'No answer');
    const cancelled = finish('Call cancelled', 450);

    socket.on('connect', onReconnect);
    socket.on('call/started', onStarted);
    socket.on('call/user-joined', onJoined);
    socket.on('call/signal', onSignal);
    socket.on('call/user-left', onLeft);
    socket.on('call/connected', onConnected);
    socket.on('call/accepted', onAccepted);
    socket.on('call/error', onError);
    socket.on('call/ended', ended);
    socket.on('call/rejected', rejected);
    socket.on('call/busy', busy);
    socket.on('call/missed', missed);
    socket.on('call/cancelled', cancelled);

    if (!incoming) {
      start().catch((e) => {
        startedRef.current = false;
        setStatus(e.message || 'Failed to start call');
      });
    }

    return () => {
      socket.off('connect', onReconnect);
      socket.off('call/started', onStarted);
      socket.off('call/user-joined', onJoined);
      socket.off('call/signal', onSignal);
      socket.off('call/user-left', onLeft);
      socket.off('call/connected', onConnected);
      socket.off('call/accepted', onAccepted);
      socket.off('call/error', onError);
      socket.off('call/ended', ended);
      socket.off('call/rejected', rejected);
      socket.off('call/busy', busy);
      socket.off('call/missed', missed);
      socket.off('call/cancelled', cancelled);
    };
  }, [active, cfg, roomId, type, roomType, incoming, master?._id]);

  useEffect(() => {
    if (!remoteEl.current) return;
    remoteEl.current.muted = speakerOff;
    remoteEl.current.volume = speakerOff ? 0 : 1;
  }, [speakerOff, remote]);

  useEffect(() => {
    if (!connected) return undefined;
    const timeId = setInterval(() => setSeconds((s) => s + 1), 1000);
    const statsId = setInterval(async () => {
      const pcs = Object.values(peers.current);
      if (!pcs.length) return;
      let rtt = 0;
      let rttN = 0;
      let lost = 0;
      let recv = 0;
      await Promise.all(
        pcs.map(async (pc) => {
          try {
            const reports = await pc.getStats();
            reports.forEach((x) => {
              if (
                x.type === 'candidate-pair' &&
                x.state === 'succeeded' &&
                Number.isFinite(x.currentRoundTripTime)
              ) {
                rtt += x.currentRoundTripTime * 1000;
                rttN += 1;
              }
              if (x.type === 'inbound-rtp' && !x.isRemote) {
                lost += Math.max(0, Number(x.packetsLost || 0));
                recv += Math.max(0, Number(x.packetsReceived || 0));
              }
            });
          } catch (e) {
            // A transient stats error should never interrupt the call.
          }
        })
      );
      const ms = rttN ? Math.round(rtt / rttN) : 0;
      const loss = lost + recv ? (lost / (lost + recv)) * 100 : 0;
      setQuality(
        ms > 350 || loss > 8 ? 'Poor' : ms > 180 || loss > 3 ? 'Fair' : 'Good'
      );
    }, 4000);
    return () => {
      clearInterval(timeId);
      clearInterval(statsId);
    };
  }, [connected]);

  useEffect(() => () => teardown(), []);

  const remoteStream = Object.values(remote)[0];

  if (!active) return null;
  return (
    <div className="fixed inset-0 z-[80] bg-[#0b141a] text-white">
      {video && remoteStream ? (
        <video
          ref={(el) => {
            remoteEl.current = el;
            if (el && el.srcObject !== remoteStream) {
              el.srcObject = remoteStream;
              el.muted = speakerOff;
              el.play?.().catch(() => {});
            }
          }}
          autoPlay
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[radial-gradient(circle_at_center,#19333e_0,#0b141a_60%)]">
          {!video && remoteStream && (
            <audio
              ref={(el) => {
                remoteEl.current = el;
                if (el && el.srcObject !== remoteStream) {
                  el.srcObject = remoteStream;
                  el.muted = speakerOff;
                  el.play?.().catch(() => {});
                }
              }}
              autoPlay
            />
          )}
          <img
            src={avatar}
            alt=""
            className="h-36 w-36 rounded-full object-cover ring-4 ring-white/10"
          />
          <h2 className="mt-5 text-2xl font-semibold">{name}</h2>
        </div>
      )}

      {video && local.current && (
        <video
          ref={(el) => {
            localEl.current = el;
            if (el && el.srcObject !== local.current) {
              el.srcObject = local.current;
              el.muted = true;
              el.play?.().catch(() => {});
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
          <h1 className="text-lg font-semibold">{name}</h1>
          <p className="text-sm text-white/70">
            {connected ? clock(seconds) : status || 'Calling...'}
          </p>
          {connected && (
            <p className="text-xs text-white/50">Quality: {quality}</p>
          )}
          {activeCallId && (
            <p className="mt-1 max-w-[220px] truncate text-[10px] text-white/30">
              Call {activeCallId}
            </p>
          )}
        </div>
        <button
          type="button"
          className="h-10 w-10 rounded-full bg-white/10"
          onClick={end}
          aria-label="Close"
        >
          <bi.BiX />
        </button>
      </div>

      {!policy.allowed && cfg && (
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
            aria-label="Reject"
          >
            <bi.BiPhoneOff />
          </button>
          <button
            type="button"
            className="h-16 w-16 rounded-full bg-emerald-600 text-2xl"
            onClick={accept}
            aria-label="Accept"
          >
            <bi.BiPhoneCall />
          </button>
        </div>
      ) : policy.allowed ? (
        <div className="absolute inset-x-0 bottom-6 flex justify-center gap-3">
          <button
            type="button"
            className="h-12 w-12 rounded-full bg-white/15"
            onClick={() => setSpeakerOff((x) => !x)}
            aria-label="Speaker"
          >
            {speakerOff ? <bi.BiVolumeMute /> : <bi.BiVolumeFull />}
          </button>
          <button
            type="button"
            className="h-12 w-12 rounded-full bg-white/15"
            onClick={() => toggleMute().catch((e) => setStatus(e.message))}
            aria-label="Mute"
          >
            {muted ? <bi.BiMicrophoneOff /> : <bi.BiMicrophone />}
          </button>
          {cfg?.videoEnabled && (
            <button
              type="button"
              className="h-12 w-12 rounded-full bg-white/15"
              onClick={toggleCamera}
              aria-label="Camera"
            >
              {camOff ? <bi.BiVideoOff /> : <bi.BiVideo />}
            </button>
          )}
          {cfg?.videoEnabled && !camOff && (
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
            aria-label="End"
          >
            <bi.BiPhoneOff />
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default CallPanelRuntime;
