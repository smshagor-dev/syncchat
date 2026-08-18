import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useDispatch, useSelector } from 'react-redux';
import * as bi from 'react-icons/bi';
import socket from '../../helpers/socket';
import { setModal } from '../../redux/features/modal';

const clock = (s) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

function TrackElement({ track, audio = false, muted = false, className = '' }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !track) return undefined;
    track.attach(el);
    return () => {
      try {
        track.detach(el);
      } catch (error0) {
        // Track may already be detached during room teardown.
      }
    };
  }, [track]);

  if (audio) {
    return <audio ref={ref} autoPlay muted={muted} className="hidden" />;
  }
  return <video ref={ref} autoPlay playsInline muted={muted} className={className} />;
}

function GroupCallLiveKit({ config }) {
  const dispatch = useDispatch();
  const call = useSelector((s) => s.modal.callPanel);
  const master = useSelector((s) => s.user.master);
  const setting = useSelector((s) => s.user.setting);
  const chat = useSelector((s) => s.room.chat);

  const type = call?.mediaType === 'video' ? 'video' : 'audio';
  const video = type === 'video';
  const incoming = call?.mode === 'incoming';
  const roomId = call?.roomId || chat?.data?.roomId;
  const recipients = Array.isArray(call?.recipientsId) ? call.recipientsId : [];
  const [status, setStatus] = useState(incoming ? 'Incoming group call' : 'Preparing group call...');
  const [callId, setCallId] = useState(call?.callId || null);
  const [joined, setJoined] = useState(false);
  const [connected, setConnected] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(setting?.microphoneEnabled === false);
  const [camOff, setCamOff] = useState(setting?.cameraEnabled === false || !video);
  const [speakerOff, setSpeakerOff] = useState(setting?.speakerEnabled === false);
  const [facing, setFacing] = useState('user');
  const [quality, setQuality] = useState('Connecting');
  const [remote, setRemote] = useState({});
  const [localVideoTrack, setLocalVideoTrack] = useState(null);
  const [activeSpeakers, setActiveSpeakers] = useState([]);

  const roomRef = useRef(null);
  const callIdRef = useRef(call?.callId || null);
  const startedRef = useRef(false);
  const joinedRef = useRef(false);
  const connectedRef = useRef(false);
  const ringTimer = useRef(null);

  const sdk = window.LivekitClient;
  const host = call?.fromUserId === master?._id;
  const participantCount = Math.max(3, recipients.length + 1);

  const groupName = useMemo(
    () =>
      call?.peerName ||
      chat?.data?.group?.name ||
      (incoming
        ? call?.fromName
          ? `${call.fromName}'s group call`
          : 'Group call'
        : 'Group call'),
    [call, chat?.data?.group?.name, incoming]
  );

  const setCanonicalCallId = (value) => {
    callIdRef.current = value || null;
    setCallId(value || null);
  };

  const clearRing = () => {
    if (ringTimer.current) clearTimeout(ringTimer.current);
    ringTimer.current = null;
  };

  const updateRemote = (participant, track = null, removeTrack = null) => {
    if (!participant?.identity) return;
    const id = participant.identity;
    setRemote((prev) => {
      const current = prev[id] || {
        identity: id,
        name: participant.name || id,
        videoTrack: null,
        audioTrack: null,
      };
      const nextItem = {
        ...current,
        name: participant.name || current.name || id,
      };
      if (track?.kind === 'video') nextItem.videoTrack = track;
      if (track?.kind === 'audio') nextItem.audioTrack = track;
      if (removeTrack?.kind === 'video' && nextItem.videoTrack === removeTrack) {
        nextItem.videoTrack = null;
      }
      if (removeTrack?.kind === 'audio' && nextItem.audioTrack === removeTrack) {
        nextItem.audioTrack = null;
      }
      return { ...prev, [id]: nextItem };
    });
  };

  const dropRemote = (participant) => {
    const id = participant?.identity;
    if (!id) return;
    setRemote((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const teardown = () => {
    clearRing();
    joinedRef.current = false;
    connectedRef.current = false;
    setJoined(false);
    setConnected(false);
    setRemote({});
    setLocalVideoTrack(null);
    setSeconds(0);
    const room = roomRef.current;
    roomRef.current = null;
    if (room) {
      try {
        Promise.resolve(room.disconnect()).catch(() => {});
      } catch (error0) {
        // Room may already be disconnected.
      }
    }
  };

  const close = () => {
    if (joinedRef.current && callIdRef.current && master?._id) {
      socket.emit('call/leave', {
        callId: callIdRef.current,
        roomId,
        userId: master._id,
      });
    }
    teardown();
    dispatch(setModal({ target: 'callPanel', data: false }));
  };

  const finish = (message, delay = 500) => ({ callId: cid, roomId: rid }) => {
    if (rid && rid !== roomId) return;
    if (callIdRef.current && cid && cid !== callIdRef.current) return;
    clearRing();
    setStatus(message);
    setTimeout(close, delay);
  };

  const cameraOptions = (nextFacing = facing) => ({
    facingMode: nextFacing,
    resolution: {
      width: Number(config?.videoProfile?.width || 1280),
      height: Number(config?.videoProfile?.height || 720),
    },
    frameRate: Number(config?.videoProfile?.frameRate || 30),
  });

  const audioOptions = () => ({
    echoCancellation: config?.audioProfile?.echoCancellation !== false,
    noiseSuppression: config?.audioProfile?.noiseSuppression !== false,
    autoGainControl: config?.audioProfile?.autoGainControl !== false,
  });

  const syncLocalCamera = () => {
    const room = roomRef.current;
    if (!room || !sdk?.Track) return;
    const publication = room.localParticipant.getTrackPublication(sdk.Track.Source.Camera);
    setLocalVideoTrack(publication?.track || null);
  };

  const connectMedia = async (canonicalCallId) => {
    if (!canonicalCallId) throw new Error('Call ID is not ready');
    if (!sdk?.Room || !sdk?.RoomEvent || !sdk?.Track) {
      throw new Error('LiveKit client SDK is unavailable');
    }
    if (roomRef.current) return roomRef.current;

    const tokenRes = await axios.post('/calling/sfu-token', {
      callId: canonicalCallId,
    });
    const credentials = tokenRes?.data?.payload;
    if (!credentials?.url || !credentials?.token) {
      throw new Error('Group media credentials are unavailable');
    }

    const room = new sdk.Room({
      adaptiveStream: credentials.adaptiveStream !== false,
      dynacast: credentials.dynacast !== false,
      audioCaptureDefaults: audioOptions(),
      videoCaptureDefaults: cameraOptions(),
    });
    roomRef.current = room;

    const onParticipantConnected = (participant) => updateRemote(participant);
    const onParticipantDisconnected = (participant) => dropRemote(participant);
    const onTrackSubscribed = (track, publication, participant) =>
      updateRemote(participant, track);
    const onTrackUnsubscribed = (track, publication, participant) =>
      updateRemote(participant, null, track);
    const onActiveSpeakersChanged = (participants) =>
      setActiveSpeakers((participants || []).map((item) => item.identity));
    const onReconnecting = () => setStatus('Reconnecting to group media...');
    const onReconnected = () => setStatus(connectedRef.current ? 'Connected' : 'Ringing...');
    const onDisconnected = () => {
      if (joinedRef.current) setStatus('Group media disconnected');
    };
    const onQualityChanged = (nextQuality, participant) => {
      if (!participant?.isLocal) return;
      const value = String(nextQuality || '').toLowerCase();
      setQuality(value.includes('poor') ? 'Poor' : value.includes('good') ? 'Good' : 'Fair');
    };

    room
      .on(sdk.RoomEvent.ParticipantConnected, onParticipantConnected)
      .on(sdk.RoomEvent.ParticipantDisconnected, onParticipantDisconnected)
      .on(sdk.RoomEvent.TrackSubscribed, onTrackSubscribed)
      .on(sdk.RoomEvent.TrackUnsubscribed, onTrackUnsubscribed)
      .on(sdk.RoomEvent.ActiveSpeakersChanged, onActiveSpeakersChanged)
      .on(sdk.RoomEvent.Reconnecting, onReconnecting)
      .on(sdk.RoomEvent.Reconnected, onReconnected)
      .on(sdk.RoomEvent.Disconnected, onDisconnected)
      .on(sdk.RoomEvent.ConnectionQualityChanged, onQualityChanged);

    if (typeof room.prepareConnection === 'function') {
      room.prepareConnection(credentials.url, credentials.token);
    }
    await room.connect(credentials.url, credentials.token, { autoSubscribe: true });

    room.remoteParticipants.forEach((participant) => updateRemote(participant));

    if (setting?.microphoneEnabled !== false) {
      await room.localParticipant.setMicrophoneEnabled(true, audioOptions());
      setMuted(false);
    }
    if (video && setting?.cameraEnabled !== false) {
      await room.localParticipant.setCameraEnabled(true, cameraOptions());
      setCamOff(false);
      syncLocalCamera();
    }

    socket.emit('call/join', {
      callId: canonicalCallId,
      roomId,
      userId: master._id,
      mediaType: type,
    });
    joinedRef.current = true;
    setJoined(true);
    return room;
  };

  const startOutgoing = () => {
    if (startedRef.current) return;
    startedRef.current = true;
    setStatus('Creating group call...');
    socket.emit('call/start', {
      roomId,
      roomType: 'group',
      fromUserId: master._id,
      mediaType: type,
      fromName: master?.fullname || '',
      fromUsername: master?.username || '',
      recipientsId: recipients,
    });
  };

  const accept = async () => {
    try {
      setStatus('Connecting to group media...');
      socket.emit('call/accept', {
        callId: callIdRef.current,
        roomId,
        userId: master._id,
        fromUserId: call?.fromUserId,
      });
      await connectMedia(callIdRef.current);
    } catch (error0) {
      setStatus(error0?.response?.data?.message || error0.message || 'Unable to join group call');
    }
  };

  const reject = () => {
    socket.emit('call/reject', {
      callId: callIdRef.current,
      roomId,
      fromUserId: master._id,
      toUserId: call?.fromUserId,
    });
    close();
  };

  const end = () => {
    const event = connectedRef.current || incoming ? 'call/end' : 'call/cancel';
    socket.emit(event, {
      callId: callIdRef.current,
      roomId,
      userId: master._id,
      reason: connectedRef.current ? 'ended' : 'cancelled',
    });
    close();
  };

  const toggleMute = async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !muted;
    await room.localParticipant.setMicrophoneEnabled(!next, audioOptions());
    setMuted(next);
  };

  const toggleCamera = async () => {
    const room = roomRef.current;
    if (!room || !video) return;
    const next = !camOff;
    await room.localParticipant.setCameraEnabled(!next, cameraOptions());
    setCamOff(next);
    syncLocalCamera();
  };

  const switchCamera = async () => {
    const room = roomRef.current;
    if (!room || !video || !sdk?.Track) return;
    const publication = room.localParticipant.getTrackPublication(sdk.Track.Source.Camera);
    const track = publication?.track;
    if (!track?.restartTrack) return;
    const next = facing === 'user' ? 'environment' : 'user';
    await track.restartTrack(cameraOptions(next));
    setFacing(next);
    setLocalVideoTrack(track);
  };

  const moderate = (targetUserId, action) => {
    if (!host || !callIdRef.current) return;
    socket.emit('call/moderate', {
      callId: callIdRef.current,
      userId: master._id,
      targetUserId,
      action,
    });
  };

  useEffect(() => {
    setCanonicalCallId(call?.callId || null);
  }, [call?.callId, roomId]);

  useEffect(() => {
    if (!call || !roomId || !master?._id) return undefined;

    const onStarted = ({ callId: cid, roomId: rid }) => {
      if (rid !== roomId || !cid) return;
      setCanonicalCallId(cid);
      setStatus('Connecting to group media...');
      connectMedia(cid)
        .then(() => {
          setStatus('Ringing...');
          clearRing();
          ringTimer.current = setTimeout(() => {
            if (connectedRef.current) return;
            socket.emit('call/cancel', {
              callId: cid,
              roomId,
              userId: master._id,
              reason: 'timeout',
            });
            setStatus('No answer');
            setTimeout(close, 700);
          }, Math.max(10, Number(config?.ringingTimeoutSec || 45)) * 1000);
        })
        .catch((error0) => {
          setStatus(error0?.response?.data?.message || error0.message || 'Unable to connect group media');
        });
    };

    const onAccepted = ({ callId: cid, roomId: rid }) => {
      if (rid !== roomId || (callIdRef.current && cid !== callIdRef.current)) return;
      setStatus('Participant accepted. Connecting...');
    };
    const onConnected = ({ callId: cid, roomId: rid }) => {
      if (rid !== roomId || (callIdRef.current && cid !== callIdRef.current)) return;
      clearRing();
      connectedRef.current = true;
      setConnected(true);
      setStatus('Connected');
    };
    const onError = ({ callId: cid, roomId: rid, message }) => {
      if (rid && rid !== roomId) return;
      if (callIdRef.current && cid && cid !== callIdRef.current) return;
      startedRef.current = false;
      setStatus(message || 'Group call failed');
    };
    const onModeration = async ({ callId: cid, action }) => {
      if (cid !== callIdRef.current) return;
      if (action === 'mute') {
        try {
          await roomRef.current?.localParticipant?.setMicrophoneEnabled(false);
          setMuted(true);
          setStatus('Muted by group call host');
        } catch (error0) {
          setStatus('Host requested microphone mute');
        }
      }
      if (action === 'remove') {
        setStatus('Removed from group call');
        setTimeout(close, 500);
      }
    };
    const onModerationApplied = ({ callId: cid, action, targetUserId }) => {
      if (cid !== callIdRef.current || !host) return;
      if (action === 'remove') {
        setRemote((prev) => {
          const next = { ...prev };
          delete next[targetUserId];
          return next;
        });
      }
    };
    const onSocketReconnect = () => {
      if (joinedRef.current && callIdRef.current) {
        socket.emit('call/join', {
          callId: callIdRef.current,
          roomId,
          userId: master._id,
          mediaType: type,
        });
      }
    };

    const ended = finish('Call ended', 350);
    const rejected = finish('Call rejected');
    const busy = finish('Participant is busy');
    const missed = finish(incoming ? 'Missed group call' : 'No answer');
    const cancelled = finish('Call cancelled', 450);

    socket.on('connect', onSocketReconnect);
    socket.on('call/started', onStarted);
    socket.on('call/accepted', onAccepted);
    socket.on('call/connected', onConnected);
    socket.on('call/error', onError);
    socket.on('call/moderation', onModeration);
    socket.on('call/moderation-applied', onModerationApplied);
    socket.on('call/ended', ended);
    socket.on('call/rejected', rejected);
    socket.on('call/busy', busy);
    socket.on('call/missed', missed);
    socket.on('call/cancelled', cancelled);

    if (!incoming) startOutgoing();

    return () => {
      socket.off('connect', onSocketReconnect);
      socket.off('call/started', onStarted);
      socket.off('call/accepted', onAccepted);
      socket.off('call/connected', onConnected);
      socket.off('call/error', onError);
      socket.off('call/moderation', onModeration);
      socket.off('call/moderation-applied', onModerationApplied);
      socket.off('call/ended', ended);
      socket.off('call/rejected', rejected);
      socket.off('call/busy', busy);
      socket.off('call/missed', missed);
      socket.off('call/cancelled', cancelled);
    };
  }, [call, roomId, master?._id, incoming, type]);

  useEffect(() => {
    if (!connected) return undefined;
    const id = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(id);
  }, [connected]);

  useEffect(() => () => teardown(), []);

  if (!call) return null;

  const remoteList = Object.values(remote);
  const localName = master?.fullname || master?.username || 'You';

  return (
    <div className="fixed inset-0 z-[1100] bg-slate-950 text-white">
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between bg-black/35 px-5 py-4 backdrop-blur">
        <div>
          <h2 className="text-lg font-bold">{groupName}</h2>
          <div className="text-xs text-white/70">
            LiveKit SFU · {status}{connected ? ` · ${clock(seconds)}` : ''} · {quality}
          </div>
        </div>
        <div className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-200">
          {Math.max(1, remoteList.length + (joined ? 1 : 0))}/{participantCount} connected
        </div>
      </div>

      <div className="h-full overflow-y-auto px-4 pb-28 pt-24">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {joined && (
            <div className={`relative min-h-[220px] overflow-hidden rounded-2xl bg-slate-800 ${activeSpeakers.includes(master?._id) ? 'ring-2 ring-emerald-400' : ''}`}>
              {video && localVideoTrack && !camOff ? (
                <TrackElement track={localVideoTrack} muted className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full min-h-[220px] items-center justify-center text-5xl font-bold">{String(localName).slice(0, 1).toUpperCase()}</div>
              )}
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent p-3 text-sm">
                <span>{localName} (You){host ? ' · Host' : ''}</span>
                <span>{muted ? 'Muted' : 'Mic on'}</span>
              </div>
            </div>
          )}

          {remoteList.map((item) => (
            <div key={item.identity} className={`relative min-h-[220px] overflow-hidden rounded-2xl bg-slate-800 ${activeSpeakers.includes(item.identity) ? 'ring-2 ring-emerald-400' : ''}`}>
              {item.videoTrack && video ? (
                <TrackElement track={item.videoTrack} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full min-h-[220px] items-center justify-center text-5xl font-bold">{String(item.name || item.identity).slice(0, 1).toUpperCase()}</div>
              )}
              {item.audioTrack && <TrackElement track={item.audioTrack} audio muted={speakerOff} />}
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/80 to-transparent p-3 text-sm">
                <span className="truncate">{item.name || item.identity}</span>
                {host && (
                  <span className="flex gap-1">
                    <button type="button" className="rounded bg-black/45 px-2 py-1 text-xs" onClick={() => moderate(item.identity, 'mute')}>Mute</button>
                    <button type="button" className="rounded bg-red-600/80 px-2 py-1 text-xs" onClick={() => moderate(item.identity, 'remove')}>Remove</button>
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {incoming && !joined ? (
        <div className="absolute inset-x-0 bottom-10 flex justify-center gap-8">
          <button type="button" className="h-16 w-16 rounded-full bg-red-600 text-2xl" onClick={reject} aria-label="Reject"><bi.BiPhoneOff /></button>
          <button type="button" className="h-16 w-16 rounded-full bg-emerald-600 text-2xl" onClick={accept} aria-label="Accept"><bi.BiPhoneCall /></button>
        </div>
      ) : (
        <div className="absolute inset-x-0 bottom-6 flex justify-center gap-3">
          <button type="button" className="h-12 w-12 rounded-full bg-white/15" onClick={() => setSpeakerOff((value) => !value)} aria-label="Speaker">{speakerOff ? <bi.BiVolumeMute /> : <bi.BiVolumeFull />}</button>
          <button type="button" className="h-12 w-12 rounded-full bg-white/15" onClick={() => toggleMute().catch((e) => setStatus(e.message))} aria-label="Mute">{muted ? <bi.BiMicrophoneOff /> : <bi.BiMicrophone />}</button>
          {video && (
            <button type="button" className="h-12 w-12 rounded-full bg-white/15" onClick={() => toggleCamera().catch((e) => setStatus(e.message))} aria-label="Camera">{camOff ? <bi.BiVideoOff /> : <bi.BiVideo />}</button>
          )}
          {video && !camOff && (
            <button type="button" className="h-12 w-12 rounded-full bg-white/15" onClick={() => switchCamera().catch((e) => setStatus(e.message))} aria-label="Switch camera"><bi.BiRefresh /></button>
          )}
          <button type="button" className="h-14 w-14 rounded-full bg-red-600 text-xl" onClick={end} aria-label="End"><bi.BiPhoneOff /></button>
        </div>
      )}
    </div>
  );
}

export default GroupCallLiveKit;
