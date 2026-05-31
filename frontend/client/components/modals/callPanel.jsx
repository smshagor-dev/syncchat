import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import * as bi from 'react-icons/bi';
import socket from '../../helpers/socket';
import { setModal } from '../../redux/features/modal';

const ICE_SERVERS = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

function CallPanel() {
  const dispatch = useDispatch();
  const {
    modal: { callPanel },
    user: { master, setting },
    room: { chat: chatRoom },
  } = useSelector((state) => state);

  const [status, setStatus] = useState('');
  const [isMuted, setIsMuted] = useState(!setting?.microphoneEnabled);
  const [isCamOff, setIsCamOff] = useState(!setting?.cameraEnabled);
  const [isSpeakerOff, setIsSpeakerOff] = useState(!setting?.speakerEnabled);
  const [joined, setJoined] = useState(false);
  const [connected, setConnected] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [callSeconds, setCallSeconds] = useState(0);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const peersRef = useRef({});
  const joinedRef = useRef(false);
  const connectedRef = useRef(false);
  const callTimerRef = useRef(null);

  const active = !!callPanel;
  const callData = useMemo(() => callPanel || null, [callPanel]);
  const mediaType = callData?.mediaType || 'audio';
  const isVideo = mediaType === 'video';
  const [videoMode, setVideoMode] = useState(isVideo);
  const roomId = callData?.roomId || chatRoom?.data?.roomId;
  const roomType = callData?.roomType || chatRoom?.data?.roomType || 'private';
  const isIncoming = callData?.mode === 'incoming';

  const peerName = useMemo(() => {
    if (!isIncoming && callData?.peerName) return callData.peerName;
    if (isIncoming) {
      return (
        callData?.fromName ||
        (callData?.fromUsername ? `@${callData.fromUsername}` : 'Unknown user')
      );
    }

    if (roomType === 'group') {
      return chatRoom?.data?.group?.name || 'Group';
    }

    return (
      chatRoom?.data?.profile?.fullname ||
      (chatRoom?.data?.profile?.username
        ? `@${chatRoom.data.profile.username}`
        : 'Unknown user')
    );
  }, [isIncoming, callData, roomType, chatRoom?.data]);

  const peerSubLabel = useMemo(() => {
    if (!isIncoming && callData?.peerSubLabel) return callData.peerSubLabel;
    if (isIncoming) {
      return callData?.fromUsername ? `@${callData.fromUsername}` : '';
    }
    if (roomType !== 'group' && chatRoom?.data?.profile?.username) {
      return `@${chatRoom.data.profile.username}`;
    }
    return '';
  }, [isIncoming, callData, roomType, chatRoom?.data]);

  const peerAvatar = useMemo(() => {
    if (!isIncoming && callData?.peerAvatar) return callData.peerAvatar;
    if (isIncoming && callData?.fromAvatar) return callData.fromAvatar;
    if (roomType === 'group') {
      return (
        chatRoom?.data?.group?.avatar ||
        'assets/images/default-group-avatar.png'
      );
    }
    return (
      chatRoom?.data?.profile?.avatar || 'assets/images/default-avatar.png'
    );
  }, [isIncoming, callData, roomType, chatRoom?.data]);

  const remotePrimary = useMemo(
    () => Object.entries(remoteStreams)[0],
    [remoteStreams]
  );

  const cleanupPeer = (peerUserId) => {
    const peer = peersRef.current[peerUserId];
    if (peer) {
      peer.onicecandidate = null;
      peer.ontrack = null;
      peer.onconnectionstatechange = null;
      peer.close();
      delete peersRef.current[peerUserId];
    }

    setRemoteStreams((prev) => {
      const next = { ...prev };
      delete next[peerUserId];
      return next;
    });
  };

  const teardownAll = () => {
    Object.keys(peersRef.current).forEach(cleanupPeer);

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    setJoined(false);
    joinedRef.current = false;
    setConnected(false);
    connectedRef.current = false;
    setRemoteStreams({});
    setCallSeconds(0);
    setVideoMode(false);
    setIsCamOff(false);

    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }

    setStatus('');
  };

  const markConnected = () => {
    if (connectedRef.current) return;
    connectedRef.current = true;
    setConnected(true);
    setStatus('Connected');
  };

  const renegotiatePeer = async (peerUserId, peer) => {
    if (!roomId || !master?._id) return;
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    socket.emit('call/signal', {
      roomId,
      fromUserId: master._id,
      toUserId: peerUserId,
      signal: { type: 'offer', sdp: offer.sdp },
    });
  };

  const renegotiateAllPeers = async () => {
    const peerEntries = Object.entries(peersRef.current);
    await Promise.all(
      peerEntries.map(async ([peerUserId, peer]) => {
        try {
          await renegotiatePeer(peerUserId, peer);
        } catch (error0) {
          // eslint-disable-next-line no-console
          console.error(error0.message);
        }
      })
    );
  };

  const bindStreamToVideo = (element, stream, muted = false) => {
    const videoElement = element;
    if (!videoElement || videoElement.srcObject === stream) return;
    videoElement.srcObject = stream;
    videoElement.muted = muted;
    videoElement.volume = muted ? 0 : 1;
  };

  const closePanel = () => {
    if (roomId && master?._id && joined) {
      socket.emit('call/leave', { roomId, userId: master._id });
      socket.emit('call/end', { roomId, userId: master._id });
    }
    teardownAll();
    dispatch(setModal({ target: 'callPanel', data: false }));
  };

  const ensureLocalStream = async () => {
    if (localStreamRef.current) return localStreamRef.current;

    const shouldUseAudio = !!setting?.microphoneEnabled;
    const shouldUseVideo = !!setting?.cameraEnabled && videoMode;

    const stream =
      shouldUseAudio || shouldUseVideo
        ? await navigator.mediaDevices.getUserMedia({
            audio: shouldUseAudio,
            video: shouldUseVideo,
          })
        : new MediaStream();

    localStreamRef.current = stream;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }

    return stream;
  };

  const enableAudio = async () => {
    const stream = await ensureLocalStream();
    const liveAudioTracks = stream
      .getAudioTracks()
      .filter((track) => track.readyState === 'live');

    if (liveAudioTracks.length > 0) {
      liveAudioTracks.forEach((track0) => {
        const track = track0;
        track.enabled = true;
      });
      setIsMuted(false);
      return;
    }

    const audioStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
    const [audioTrack] = audioStream.getAudioTracks();
    if (!audioTrack) throw new Error('Microphone not available');

    stream.addTrack(audioTrack);
    Object.values(peersRef.current).forEach((peer) => {
      const existingAudioSender = peer
        .getSenders()
        .find((sender) => sender.track && sender.track.kind === 'audio');

      if (existingAudioSender) {
        existingAudioSender.replaceTrack(audioTrack);
        return;
      }
      peer.addTrack(audioTrack, stream);
    });

    setIsMuted(false);
    await renegotiateAllPeers();
  };

  const enableVideo = async () => {
    const stream = await ensureLocalStream();
    const liveVideoTracks = stream
      .getVideoTracks()
      .filter((track) => track.readyState === 'live');

    if (liveVideoTracks.length > 0) {
      liveVideoTracks.forEach((track0) => {
        const track = track0;
        track.enabled = true;
      });
      setVideoMode(true);
      setIsCamOff(false);
      return;
    }

    const videoStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: true,
    });
    const [videoTrack] = videoStream.getVideoTracks();
    if (!videoTrack) throw new Error('Camera not available');

    stream.addTrack(videoTrack);
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }

    const peers = Object.values(peersRef.current);
    await Promise.all(
      peers.map(async (peer) => {
        const existingVideoSender = peer
          .getSenders()
          .find((sender) => sender.track && sender.track.kind === 'video');

        if (existingVideoSender) {
          await existingVideoSender.replaceTrack(videoTrack);
          return;
        }
        peer.addTrack(videoTrack, stream);
      })
    );

    setVideoMode(true);
    setIsCamOff(false);
    await renegotiateAllPeers();
  };

  const ensurePeer = async (peerUserId) => {
    if (peersRef.current[peerUserId]) return peersRef.current[peerUserId];

    const stream = await ensureLocalStream();
    const pc = new RTCPeerConnection(ICE_SERVERS);
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      socket.emit('call/signal', {
        roomId,
        fromUserId: master._id,
        toUserId: peerUserId,
        signal: { type: 'ice', candidate: event.candidate },
      });
    };

    pc.ontrack = (event) => {
      const stream0 = event.streams?.[0];
      if (!stream0) return;
      setRemoteStreams((prev) => ({
        ...prev,
        [peerUserId]: stream0,
      }));
      markConnected();
    };

    pc.onconnectionstatechange = () => {
      if (
        pc.connectionState === 'connected' ||
        pc.connectionState === 'completed'
      ) {
        markConnected();
      }
      if (
        pc.connectionState === 'failed' ||
        pc.connectionState === 'disconnected' ||
        pc.connectionState === 'closed'
      ) {
        cleanupPeer(peerUserId);
      }
    };

    peersRef.current[peerUserId] = pc;
    return pc;
  };

  const joinCall = async () => {
    if (!roomId || !master?._id) return;

    setStatus('Connecting...');
    await ensureLocalStream();

    socket.emit('call/join', {
      roomId,
      userId: master._id,
      mediaType,
    });

    setJoined(true);
    joinedRef.current = true;
  };

  const startOutgoing = async () => {
    if (!roomId || !master?._id) return;

    await joinCall();
    socket.emit('call/start', {
      roomId,
      roomType,
      fromUserId: master._id,
      mediaType,
      fromName: callData?.fromName || master?.fullname || '',
      fromUsername: callData?.fromUsername || master?.username || '',
      recipientsId: Array.isArray(callData?.recipientsId)
        ? callData.recipientsId
        : [],
    });
    setStatus('Ringing...');
  };

  const acceptIncoming = async () => {
    setStatus('Connecting...');
    await joinCall();
  };

  const rejectIncoming = () => {
    if (roomId && master?._id && callData?.fromUserId) {
      socket.emit('call/reject', {
        roomId,
        fromUserId: master._id,
        toUserId: callData.fromUserId,
      });
    }

    teardownAll();
    dispatch(setModal({ target: 'callPanel', data: false }));
  };

  const toggleMute = () => {
    const stream = localStreamRef.current;
    if (!stream) {
      setStatus('Microphone will stay muted until the call is connected');
      return;
    }

    const liveAudioTracks = stream
      .getAudioTracks()
      .filter((track) => track.readyState === 'live');
    if (liveAudioTracks.length === 0) {
      setStatus('Enabling microphone...');
      enableAudio()
        .then(() => setStatus(connected ? 'Connected' : 'Connecting...'))
        .catch((error0) => {
          setStatus(error0.message || 'Unable to turn on microphone');
        });
      return;
    }

    const next = !isMuted;
    liveAudioTracks.forEach((track0) => {
      const track = track0;
      track.enabled = !next;
    });
    setIsMuted(next);
  };

  const toggleCam = async () => {
    const stream = localStreamRef.current;
    if (!stream) return;

    const liveVideoTracks = stream
      .getVideoTracks()
      .filter((track) => track.readyState === 'live');

    if (liveVideoTracks.length === 0) {
      try {
        setStatus('Enabling camera...');
        await enableVideo();
        setStatus('Connected');
      } catch (error0) {
        setStatus(error0.message || 'Unable to turn on camera');
      }
      return;
    }

    const next = !isCamOff;
    liveVideoTracks.forEach((track0) => {
      const track = track0;
      track.enabled = !next;
    });
    setVideoMode(true);
    setIsCamOff(next);
  };

  const toggleSpeaker = () => {
    setIsSpeakerOff((prev) => !prev);
  };

  useEffect(() => {
    if (!active) return;
    const nextVideoMode = isVideo && !!setting?.cameraEnabled;
    setVideoMode(nextVideoMode);
    setIsCamOff(!nextVideoMode);
    setIsMuted(!setting?.microphoneEnabled);
    setIsSpeakerOff(!setting?.speakerEnabled);
  }, [
    active,
    isVideo,
    setting?.cameraEnabled,
    setting?.microphoneEnabled,
    setting?.speakerEnabled,
  ]);

  useEffect(() => {
    const remoteVideo = remoteVideoRef.current;
    if (!remoteVideo) return;
    remoteVideo.muted = isSpeakerOff;
    remoteVideo.volume = isSpeakerOff ? 0 : 1;
  }, [isSpeakerOff, remotePrimary]);

  useEffect(() => {
    if (!active || !connected) {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
        callTimerRef.current = null;
      }
      return undefined;
    }

    if (!callTimerRef.current) {
      callTimerRef.current = setInterval(() => {
        setCallSeconds((prev) => prev + 1);
      }, 1000);
    }

    return () => {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
        callTimerRef.current = null;
      }
    };
  }, [active, connected]);

  useEffect(() => {
    const onIncoming = (payload) => {
      if (!master?._id) return;
      if (!payload?.roomId || payload.fromUserId === master._id) return;
      if (callPanel) return;

      dispatch(
        setModal({
          target: 'callPanel',
          data: { ...payload, mode: 'incoming' },
        })
      );
    };

    socket.on('call/incoming', onIncoming);
    return () => {
      socket.off('call/incoming', onIncoming);
    };
  }, [master?._id, callPanel]);

  useEffect(() => {
    if (!active) return undefined;

    if (!window.RTCPeerConnection || !navigator.mediaDevices?.getUserMedia) {
      setStatus('WebRTC not supported in this browser');
      return undefined;
    }

    const onUserJoined = async ({ roomId: rid, userId }) => {
      if (
        !joinedRef.current ||
        rid !== roomId ||
        !userId ||
        userId === master._id
      )
        return;

      const pc = await ensurePeer(userId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      setStatus('Connecting...');

      socket.emit('call/signal', {
        roomId,
        fromUserId: master._id,
        toUserId: userId,
        signal: { type: 'offer', sdp: offer.sdp },
      });
    };

    const onSignal = async ({ roomId: rid, fromUserId, signal }) => {
      if (rid !== roomId || fromUserId === master._id || !signal) return;

      const pc = await ensurePeer(fromUserId);

      if (signal.type === 'offer') {
        await pc.setRemoteDescription(
          new RTCSessionDescription({ type: 'offer', sdp: signal.sdp })
        );
        setStatus('Connecting...');

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit('call/signal', {
          roomId,
          fromUserId: master._id,
          toUserId: fromUserId,
          signal: { type: 'answer', sdp: answer.sdp },
        });
        return;
      }

      if (signal.type === 'answer') {
        await pc.setRemoteDescription(
          new RTCSessionDescription({ type: 'answer', sdp: signal.sdp })
        );
        markConnected();
        return;
      }

      if (signal.type === 'ice' && signal.candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        } catch (error0) {
          // eslint-disable-next-line no-console
          console.error(error0.message);
        }
      }
    };

    const onUserLeft = ({ roomId: rid, userId }) => {
      if (rid !== roomId || !userId) return;
      cleanupPeer(userId);
    };

    const onEnded = ({ roomId: rid }) => {
      if (rid !== roomId) return;
      teardownAll();
      dispatch(setModal({ target: 'callPanel', data: false }));
    };

    const onRejected = ({ roomId: rid, toUserId }) => {
      if (rid !== roomId) return;
      if (toUserId && toUserId !== master._id) return;

      setStatus('Rejected');
      if (joinedRef.current && roomId && master?._id) {
        socket.emit('call/leave', { roomId, userId: master._id });
      }
      teardownAll();
      dispatch(setModal({ target: 'callPanel', data: false }));
    };
    const onConnected = ({ roomId: rid }) => {
      if (rid !== roomId || !joinedRef.current) return;
      markConnected();
    };

    socket.on('call/user-joined', onUserJoined);
    socket.on('call/signal', onSignal);
    socket.on('call/user-left', onUserLeft);
    socket.on('call/ended', onEnded);
    socket.on('call/rejected', onRejected);
    socket.on('call/connected', onConnected);

    if (callData?.mode === 'outgoing') {
      setCallSeconds(0);
      startOutgoing().catch((error0) => {
        setStatus(error0.message || 'Failed to start call');
      });
    }

    return () => {
      socket.off('call/user-joined', onUserJoined);
      socket.off('call/signal', onSignal);
      socket.off('call/user-left', onUserLeft);
      socket.off('call/ended', onEnded);
      socket.off('call/rejected', onRejected);
      socket.off('call/connected', onConnected);
      teardownAll();
    };
  }, [active]);

  if (!active) return null;

  const callTimeLabel = `${String(Math.floor(callSeconds / 60)).padStart(
    2,
    '0'
  )}:${String(callSeconds % 60).padStart(2, '0')}`;
  const callKindLabel = videoMode ? 'Video Call' : 'Audio Call';
  const waitingLabel = isIncoming
    ? `${callKindLabel} incoming...`
    : status || 'Calling...';
  return (
    <div
      className="fixed inset-0 z-[80] bg-[#0b141a]"
      aria-hidden
      onClick={(e) => {
        if (e.target === e.currentTarget) closePanel();
      }}
    >
      {!joined ? (
        <div className="relative grid h-full place-items-center overflow-hidden px-4 py-6 text-white">
          <img
            src={peerAvatar}
            alt={peerName}
            className="absolute inset-0 h-full w-full scale-125 object-cover opacity-35 blur-2xl"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-emerald-700/60 via-emerald-900/70 to-[#0b141a]" />
          <div className="absolute right-6 top-6 z-10 flex items-center gap-2 text-xs text-white/85">
            <bi.BiBroadcast className="text-base" />
            <bi.BiBattery className="text-lg" />
          </div>

          <div className="relative z-10 flex h-full w-full max-w-sm flex-col items-center rounded-[40px] border border-white/25 bg-white/10 px-8 pb-14 pt-20 shadow-[0_22px_70px_rgba(0,0,0,0.42)] backdrop-blur-md">
            <p className="text-[34px] font-semibold leading-none tracking-tight">
              {peerName}
            </p>
            {peerSubLabel ? (
              <p className="mt-2 text-sm text-white/75">{peerSubLabel}</p>
            ) : null}
            <p className="mt-3 text-base text-white/80">{waitingLabel}</p>
            <div className="flex flex-1 items-center justify-center">
              <div className="h-[190px] w-[190px] rounded-full border border-white/30 p-1.5 shadow-[0_18px_32px_rgba(0,0,0,0.28)]">
                <img
                  src={peerAvatar}
                  alt={peerName}
                  className="h-full w-full rounded-full object-cover"
                />
              </div>
            </div>

            {isIncoming ? (
              <div className="flex w-full items-end justify-between px-3">
                <div className="text-center">
                  <button
                    type="button"
                    className="flex h-[78px] w-[78px] items-center justify-center rounded-full bg-[#ef4444] shadow-[0_12px_22px_rgba(239,68,68,0.45)]"
                    onClick={rejectIncoming}
                    aria-label="Decline"
                  >
                    <bi.BiPhone className="text-[34px] -rotate-[135deg]" />
                  </button>
                  <p className="mt-3 text-sm font-medium tracking-wide">
                    Decline
                  </p>
                </div>
                <div className="text-center">
                  <button
                    type="button"
                    className="flex h-[78px] w-[78px] items-center justify-center rounded-full bg-[#22c55e] shadow-[0_12px_22px_rgba(34,197,94,0.45)]"
                    onClick={() => acceptIncoming()}
                    aria-label="Accept"
                  >
                    <bi.BiPhone className="text-[34px] -rotate-45" />
                  </button>
                  <p className="mt-3 text-sm font-medium tracking-wide">
                    Accept
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="mx-auto w-full max-w-[282px] rounded-[26px] bg-black/35 px-3 py-3 shadow-[0_14px_30px_rgba(0,0,0,0.3)] backdrop-blur-lg">
                  <div className="grid grid-cols-5 gap-2 text-center">
                    {[
                      {
                        label: 'Share',
                        icon: <bi.BiShareAlt className="text-lg" />,
                      },
                      {
                        label: 'Message',
                        icon: <bi.BiMessageDetail className="text-lg" />,
                      },
                      {
                        label: 'Video',
                        icon: <bi.BiVideo className="text-lg" />,
                      },
                      {
                        label: 'Speaker',
                        icon: <bi.BiVolumeFull className="text-lg" />,
                      },
                      {
                        label: 'Mute',
                        icon: <bi.BiMicrophoneOff className="text-lg" />,
                      },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="flex flex-col items-center"
                      >
                        <span className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/20">
                          {item.icon}
                        </span>
                        <p className="mt-1 text-[10px] leading-tight text-white/85">
                          {item.label}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="pt-8">
                  <button
                    type="button"
                    className="flex h-[82px] w-[82px] items-center justify-center rounded-full bg-[#ef4444] shadow-[0_14px_26px_rgba(239,68,68,0.46)]"
                    onClick={closePanel}
                    aria-label="Hang up"
                  >
                    <bi.BiPhone className="text-[34px] -rotate-[135deg]" />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="relative h-full w-full overflow-hidden bg-[#0b141a]">
          {remotePrimary ? (
            <video
              autoPlay
              playsInline
              ref={(node) => {
                remoteVideoRef.current = node;
                bindStreamToVideo(node, remotePrimary[1], isSpeakerOff);
              }}
              className="absolute inset-0 h-full w-full object-cover"
            >
              <track kind="captions" />
            </video>
          ) : (
            <img
              src={peerAvatar}
              alt={peerName}
              className="absolute inset-0 h-full w-full scale-110 object-cover opacity-35 blur-xl"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/10 to-black/60" />

          <div className="relative z-10 flex h-full flex-col justify-between p-4 text-white">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-2xl font-semibold tracking-tight">
                  {peerName}
                </p>
                <p className="mt-1 text-sm text-white/85">
                  {connected
                    ? `${callKindLabel} • ${callTimeLabel}`
                    : status || 'Connecting...'}
                </p>
                {!setting?.cameraEnabled || !setting?.microphoneEnabled ? (
                  <p className="mt-1 text-xs text-white/65">
                    {[
                      !setting?.cameraEnabled ? 'camera off by settings' : null,
                      !setting?.microphoneEnabled
                        ? 'microphone muted by settings'
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' • ')}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                className="rounded-full bg-black/35 p-2 hover:bg-black/45"
                onClick={closePanel}
                aria-label="Close"
              >
                <bi.BiX className="text-xl" />
              </button>
            </div>

            <div className="self-end w-[124px] overflow-hidden rounded-2xl border border-white/25 bg-black/35 shadow-[0_12px_20px_rgba(0,0,0,0.35)]">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="h-[176px] w-full object-cover"
              >
                <track kind="captions" />
              </video>
              {!videoMode || isCamOff ? (
                <div className="absolute inset-x-0 top-[72px] text-center text-xs text-white/80">
                  Audio only
                </div>
              ) : null}
            </div>

            <div className="mx-auto flex w-full max-w-md items-center justify-center gap-3 rounded-3xl bg-black/40 px-4 py-3 backdrop-blur-md">
              <button
                type="button"
                className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 hover:bg-white/25"
                onClick={toggleMute}
                aria-label="Toggle mute"
              >
                {isMuted ? <bi.BiMicrophoneOff /> : <bi.BiMicrophone />}
              </button>
              <button
                type="button"
                className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 hover:bg-white/25"
                onClick={() => {
                  toggleCam();
                }}
                aria-label="Toggle camera"
              >
                {!videoMode || isCamOff ? <bi.BiVideoOff /> : <bi.BiVideo />}
              </button>
              <button
                type="button"
                className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-600 hover:bg-rose-700"
                onClick={closePanel}
                aria-label="End call"
              >
                <bi.BiPhoneOff className="text-xl" />
              </button>
              <button
                type="button"
                className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 hover:bg-white/25"
                onClick={toggleSpeaker}
                aria-label="Speaker"
              >
                {isSpeakerOff ? <bi.BiVolumeMute /> : <bi.BiVolumeFull />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CallPanel;
