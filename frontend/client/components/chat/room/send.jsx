import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import * as bi from 'react-icons/bi';
import socket from '../../../helpers/socket';
import EmojiBoard from './emojiBoard';
import { setModal } from '../../../redux/features/modal';
import { setSetting } from '../../../redux/features/user';
import { setEditingChat, setReplyingChat } from '../../../redux/features/chore';
import { isGroupAdmin } from '../../../helpers/groupAdmins';
import { replaceTextTokensWithEmoji } from '../../../helpers/emojiText';
import { playOutgoingMessageSound } from '../../../helpers/sound';
import { rememberVoiceNoteDuration } from '../../../helpers/voiceNoteDurationCache';

import AttachMenu from '../../modals/attachMenu';

const RECORD_WAVEFORM_BARS = 24;

function Send({ setChats, setNewMessage, control }) {
  const dispatch = useDispatch();
  const {
    user: { master, setting },
    chore: { replyingChat, editingChat },
    room: { chat: chatRoom },
  } = useSelector((state) => state);

  const isGroup = chatRoom.data.roomType === 'group';
  const isGroupMember = !!chatRoom.data?.group?.participantsId?.includes(
    master._id
  );
  const isCurrentUserGroupAdmin = !!(
    isGroup && isGroupAdmin(chatRoom.data?.group, master._id)
  );
  const isChannelRoom = !!chatRoom.data?.channel;
  const memberCanSendMessage =
    chatRoom.data?.group?.permissions?.memberCanSendMessage === undefined
      ? !isChannelRoom
      : !!chatRoom.data?.group?.permissions?.memberCanSendMessage;
  const showAdminOnlyNotice =
    isGroup &&
    isGroupMember &&
    !isCurrentUserGroupAdmin &&
    !memberCanSendMessage;
  const roomSlowModeSeconds = Number(
    chatRoom.data?.group?.moderation?.slowModeSeconds || 0
  );
  const isBlocked =
    !isGroup &&
    setting?.blockedUserIds?.includes(chatRoom.data?.profile?.userId);
  const [isBlockedByFriend, setIsBlockedByFriend] = useState(false);

  const [emojiBoard, setEmojiBoard] = useState(false);
  const [form, setForm] = useState({
    text: '',
    file: null,
  });
  const [isUnblocking, setIsUnblocking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isRecordingPaused, setIsRecordingPaused] = useState(false);
  const [isSendingVoice, setIsSendingVoice] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [recordWaveform, setRecordWaveform] = useState(() =>
    Array.from({ length: RECORD_WAVEFORM_BARS }, () => 0.2)
  );
  const [showSchedulePanel, setShowSchedulePanel] = useState(false);
  const [scheduledItems, setScheduledItems] = useState([]);
  const [scheduleForm, setScheduleForm] = useState({
    mode: 'once',
    scheduledFor: '',
    recurringType: 'daily',
  });
  const [isLoadingSchedules, setIsLoadingSchedules] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [viewOnceText, setViewOnceText] = useState(false);
  const [moderationNotice, setModerationNotice] = useState('');
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const recorderRef = useRef(null);
  const recordStreamRef = useRef(null);
  const recordChunksRef = useRef([]);
  const recordTimerRef = useRef(null);
  const sendRecordedVoiceRef = useRef(false);
  const recordSecondsRef = useRef(0);
  const recordAudioContextRef = useRef(null);
  const recordAnalyserRef = useRef(null);
  const recordSourceRef = useRef(null);
  const recordAnimationFrameRef = useRef(null);

  const canSendInCurrentRoom = () => {
    const { group = null, profile = null } = chatRoom.data;

    return (
      (isGroup &&
        group?.participantsId?.includes(master._id) &&
        (isGroupAdmin(group, master._id) ||
          (group?.permissions?.memberCanSendMessage === undefined
            ? !chatRoom.data?.channel
            : group?.permissions?.memberCanSendMessage !== false))) ||
      (!isGroup && profile?.active)
    );
  };

  const getDefaultScheduleValue = () => {
    const next = new Date(Date.now() + 5 * 60 * 1000);
    next.setSeconds(0, 0);
    return new Date(next.getTime() - next.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  };

  const clearRecordTimer = () => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
  };

  const resetRecordWaveform = () => {
    setRecordWaveform(
      Array.from({ length: RECORD_WAVEFORM_BARS }, () => 0.2)
    );
  };

  const stopWaveformAnalysis = () => {
    if (recordAnimationFrameRef.current) {
      cancelAnimationFrame(recordAnimationFrameRef.current);
      recordAnimationFrameRef.current = null;
    }
    if (recordSourceRef.current) {
      recordSourceRef.current.disconnect();
      recordSourceRef.current = null;
    }
    if (recordAnalyserRef.current) {
      recordAnalyserRef.current.disconnect();
      recordAnalyserRef.current = null;
    }
    if (recordAudioContextRef.current) {
      recordAudioContextRef.current.close().catch(() => {});
      recordAudioContextRef.current = null;
    }
    resetRecordWaveform();
  };

  const stopRecordTracks = () => {
    if (recordStreamRef.current) {
      recordStreamRef.current.getTracks().forEach((track) => track.stop());
      recordStreamRef.current = null;
    }
  };

  const startRecordTimer = () => {
    clearRecordTimer();
    recordTimerRef.current = setInterval(() => {
      setRecordSeconds((prev) => {
        const next = prev + 1;
        recordSecondsRef.current = next;
        return next;
      });
    }, 1000);
  };

  const startWaveformAnalysis = (stream) => {
    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      resetRecordWaveform();
      return;
    }

    const context = new AudioContextClass();
    const analyser = context.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.82;

    const source = context.createMediaStreamSource(stream);
    source.connect(analyser);

    recordAudioContextRef.current = context;
    recordAnalyserRef.current = analyser;
    recordSourceRef.current = source;

    const samples = new Uint8Array(analyser.frequencyBinCount);
    const draw = () => {
      if (!recordAnalyserRef.current) return;

      if (recorderRef.current?.state === 'paused') {
        setRecordWaveform((prev) => prev.map(() => 0.2));
        recordAnimationFrameRef.current = requestAnimationFrame(draw);
        return;
      }

      analyser.getByteFrequencyData(samples);
      const bucketSize = Math.max(
        1,
        Math.floor(samples.length / RECORD_WAVEFORM_BARS)
      );
      const nextWaveform = Array.from(
        { length: RECORD_WAVEFORM_BARS },
        (_, index) => {
          const start = index * bucketSize;
          const bucket = samples.slice(start, start + bucketSize);
          const total = bucket.reduce((sum, value) => sum + value, 0);
          const avg = bucket.length ? total / bucket.length : 0;
          return Math.max(0.18, Math.min(1, avg / 255));
        }
      );
      setRecordWaveform(nextWaveform);
      recordAnimationFrameRef.current = requestAnimationFrame(draw);
    };

    draw();
  };

  const uploadAndSendVoice = async (audioBlob, durationSeconds = 0) => {
    const token = localStorage.getItem('token');
    const headers = token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : undefined;

    const audioFile = new File([audioBlob], `voice-${Date.now()}.webm`, {
      type: audioBlob.type || 'audio/webm',
    });

    const formData = new FormData();
    formData.append('file', audioFile, audioFile.name);

    const uploadRes = await axios.post('/chats/upload', formData, {
      headers,
    });
    const uploaded = uploadRes?.data?.payload || null;
    if (!uploaded?.url) {
      throw new Error('Voice upload failed');
    }
    rememberVoiceNoteDuration(uploaded.url, durationSeconds);

    const sendRes = await axios.post(
      '/chats/send-file',
      {
        roomId: chatRoom.data.roomId,
        ownersId: chatRoom.data.ownersId,
        roomType: chatRoom.data.roomType,
        text: '',
        replyTo: replyingChat?._id || null,
        file: {
          ...uploaded,
          type: 'audio',
          duration: Math.max(0, Math.round(Number(durationSeconds) || 0)),
        },
      },
      { headers }
    );

    const payload = sendRes?.data?.payload || null;
    if (payload?.file) {
      payload.file = {
        ...payload.file,
        type: 'audio',
        duration: Math.max(
          Number(payload.file.duration) || 0,
          Math.round(Number(durationSeconds) || 0)
        ),
      };
    }
    return payload;
  };

  const startVoiceRecording = async () => {
    if (isBlocked || isBlockedByFriend || isRecording || isSendingVoice) return;
    if (!canSendInCurrentRoom()) return;

    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      // eslint-disable-next-line no-alert
      alert('Voice recording is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          noiseSuppression: true,
          echoCancellation: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      const recorder = new MediaRecorder(stream);
      recordStreamRef.current = stream;
      recorderRef.current = recorder;
      recordChunksRef.current = [];
      sendRecordedVoiceRef.current = false;
      recordSecondsRef.current = 0;
      setIsRecordingPaused(false);
      resetRecordWaveform();
      startWaveformAnalysis(stream);

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        clearRecordTimer();
        stopWaveformAnalysis();
        stopRecordTracks();
        setIsRecording(false);
        setIsRecordingPaused(false);

        const shouldSend = sendRecordedVoiceRef.current;
        sendRecordedVoiceRef.current = false;
        const chunks = recordChunksRef.current;
        recordChunksRef.current = [];

        if (!shouldSend || chunks.length === 0) {
          setRecordSeconds(0);
          return;
        }

        const audioBlob = new Blob(chunks, {
          type: recorder.mimeType || 'audio/webm',
        });
        if (!audioBlob.size) {
          setRecordSeconds(0);
          return;
        }

        try {
          const durationSeconds = recordSecondsRef.current;
          setIsSendingVoice(true);
          const sentPayload = await uploadAndSendVoice(
            audioBlob,
            durationSeconds
          );
          if (sentPayload?._id) {
            setChats((prev) => {
              const list = prev || [];
              const exists = list.some((item) => item._id === sentPayload._id);
              if (exists) {
                return list.map((item) =>
                  item._id === sentPayload._id ? sentPayload : item
                );
              }
              if (list.length >= control.limit) {
                return [...list.slice(1), sentPayload];
              }
              return [...list, sentPayload];
            });
          }
          dispatch(setReplyingChat(null));
        } catch (error0) {
          console.error(
            error0?.response?.data?.message || error0.message || error0
          );
          // eslint-disable-next-line no-alert
          alert(
            error0?.response?.data?.message ||
              error0.message ||
              'Voice send failed'
          );
        } finally {
          setIsSendingVoice(false);
          setRecordSeconds(0);
        }
      };

      recorder.start(300);
      recordSecondsRef.current = 0;
      setRecordSeconds(0);
      setIsRecording(true);
      startRecordTimer();
    } catch (error0) {
      console.error(error0.message || error0);
      // eslint-disable-next-line no-alert
      alert('Microphone permission denied or unavailable.');
      clearRecordTimer();
      stopWaveformAnalysis();
      stopRecordTracks();
      setIsRecording(false);
      setIsRecordingPaused(false);
      recordSecondsRef.current = 0;
    }
  };

  const togglePauseVoiceRecording = () => {
    const recorder = recorderRef.current;
    if (!recorder) return;

    if (recorder.state === 'recording') {
      recorder.pause();
      clearRecordTimer();
      setIsRecordingPaused(true);
      return;
    }

    if (recorder.state === 'paused') {
      recorder.resume();
      startRecordTimer();
      setIsRecordingPaused(false);
    }
  };

  const stopVoiceRecording = (shouldSend) => {
    sendRecordedVoiceRef.current = shouldSend;
    const recorder = recorderRef.current;

    if (!recorder) {
      clearRecordTimer();
      stopWaveformAnalysis();
      stopRecordTracks();
      setIsRecording(false);
      setIsRecordingPaused(false);
      recordSecondsRef.current = 0;
      return;
    }

    if (recorder.state !== 'inactive') {
      recorder.stop();
    } else {
      clearRecordTimer();
      stopWaveformAnalysis();
      stopRecordTracks();
      setIsRecording(false);
      setIsRecordingPaused(false);
      recordSecondsRef.current = 0;
    }
  };

  const handleUnblock = async () => {
    const friendId = chatRoom?.data?.profile?.userId;
    if (!friendId || isUnblocking) return;

    try {
      setIsUnblocking(true);
      const { data } = await axios.put(`/contacts/${friendId}/unblock`);
      dispatch(
        setSetting({
          ...setting,
          blockedUserIds: data.payload?.blockedUserIds || [],
        })
      );
    } catch (error0) {
      console.error(error0.message);
    } finally {
      setIsUnblocking(false);
    }
  };

  const handleChange = (e) => {
    const nextValue = e.target.value;
    setForm((prev) => ({
      ...prev,
      [e.target.name]: nextValue,
    }));

    const { roomId, roomType } = chatRoom.data;
    // set typing status
    socket.emit('chat/typing', {
      roomType,
      roomId,
      userId: master._id,
    });
  };

  const handleSubmit = () => {
    if (isBlocked || isBlockedByFriend) return;
    const nextText = setting?.replaceTextWithEmoji
      ? replaceTextTokensWithEmoji(form.text)
      : form.text;

    if (editingChat?._id) {
      const safeText = String(nextText || '').trim();
      if (!safeText) return;

      socket.emit('chat/edit', {
        roomId: chatRoom.data.roomId,
        chatId: editingChat._id,
        userId: master._id,
        text: safeText,
        replyTo: editingChat.replyTo || null,
      });

      setForm({ text: '', file: null });
      setViewOnceText(false);
      dispatch(setEditingChat(null));
      return;
    }

    if (nextText.length > 0 || form.file) {
      if (canSendInCurrentRoom()) {
        socket.emit('chat/insert', {
          ...form,
          text: nextText,
          ownersId: chatRoom.data.ownersId,
          roomType: chatRoom.data.roomType,
          userId: master._id,
          roomId: chatRoom.data.roomId,
          replyTo: replyingChat?._id || null,
          viewOnce: viewOnceText && nextText.trim().length > 0,
          viewOnceType: 'text',
        });
      } else return;

      // close emoji board after 150ms
      setTimeout(() => setEmojiBoard(false), 150);
      // reset form
      setForm({ text: '', file: null });
      setViewOnceText(false);
      dispatch(setReplyingChat(null));
      dispatch(setEditingChat(null));
    }
  };

  const handleSendLiveLocation = () => {
    if (isBlocked || isBlockedByFriend) return;
    if (!canSendInCurrentRoom()) return;
    if (!navigator.geolocation) {
      // eslint-disable-next-line no-alert
      alert('Location is not supported in this browser.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = Number(position?.coords?.latitude || 0);
        const longitude = Number(position?.coords?.longitude || 0);
        if (!latitude || !longitude) {
          // eslint-disable-next-line no-alert
          alert('Could not read your current location.');
          return;
        }

        const mapUrl = `https://maps.google.com/?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
        socket.emit('chat/insert', {
          text: `📍 Live location\n${mapUrl}`,
          file: null,
          ownersId: chatRoom.data.ownersId,
          roomType: chatRoom.data.roomType,
          userId: master._id,
          roomId: chatRoom.data.roomId,
          replyTo: replyingChat?._id || null,
          viewOnce: false,
        });

        setTimeout(() => setEmojiBoard(false), 150);
        setForm({ text: '', file: null });
        setViewOnceText(false);
        setMobileActionsOpen(false);
        dispatch(setReplyingChat(null));
        dispatch(setEditingChat(null));
      },
      (error0) => {
        const message =
          error0?.code === 1
            ? 'Location permission denied.'
            : 'Could not get your current location.';
        // eslint-disable-next-line no-alert
        alert(message);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 10000,
      }
    );
  };

  const loadScheduledMessages = async () => {
    if (!chatRoom?.data?.roomId) return;

    try {
      setIsLoadingSchedules(true);
      const { data } = await axios.get('/chats/scheduled', {
        params: { roomId: chatRoom.data.roomId },
      });
      setScheduledItems(Array.isArray(data?.payload) ? data.payload : []);
    } catch (error0) {
      console.error(error0?.response?.data?.message || error0.message);
    } finally {
      setIsLoadingSchedules(false);
    }
  };

  const handleScheduleCreate = async () => {
    const nextText = setting?.replaceTextWithEmoji
      ? replaceTextTokensWithEmoji(form.text)
      : form.text;
    const safeText = nextText.trim();

    if (!safeText || isScheduling) return;

    const payload = {
      roomId: chatRoom.data.roomId,
      ownersId: chatRoom.data.ownersId,
      roomType: chatRoom.data.roomType,
      text: safeText,
      replyTo: replyingChat?._id || null,
      mode: scheduleForm.mode,
      scheduledFor:
        scheduleForm.mode === 'when-online'
          ? null
          : scheduleForm.scheduledFor
            ? new Date(scheduleForm.scheduledFor).toISOString()
            : null,
      recurringType:
        scheduleForm.mode === 'recurring' ? scheduleForm.recurringType : 'none',
      targetUserId:
        scheduleForm.mode === 'when-online'
          ? chatRoom.data?.profile?.userId || null
          : null,
    };

    try {
      setIsScheduling(true);
      const { data } = await axios.post('/chats/scheduled', payload);
      if (data?.payload) {
        setScheduledItems((prev) => {
          const next = [data.payload, ...(prev || []).filter((item) => item._id !== data.payload._id)];
          return next.sort(
            (a, b) =>
              new Date(a.nextRunAt || a.createdAt).getTime() -
              new Date(b.nextRunAt || b.createdAt).getTime()
          );
        });
      }
      setForm({ text: '', file: null });
      dispatch(setReplyingChat(null));
      setShowSchedulePanel(false);
      setScheduleForm({
        mode: 'once',
        scheduledFor: '',
        recurringType: 'daily',
      });
    } catch (error0) {
      // eslint-disable-next-line no-alert
      alert(error0?.response?.data?.message || error0.message);
    } finally {
      setIsScheduling(false);
    }
  };

  const handleCancelScheduled = async (scheduleId) => {
    try {
      await axios.delete(`/chats/scheduled/${scheduleId}`);
      setScheduledItems((prev) =>
        (prev || []).filter((item) => item._id !== scheduleId)
      );
    } catch (error0) {
      console.error(error0?.response?.data?.message || error0.message);
    }
  };

  useEffect(() => {
    loadScheduledMessages();
  }, [chatRoom?.data?.roomId]);

  useEffect(() => {
    socket.on('chat/insert', (payload) => {
      if (!payload?.roomId || payload.roomId !== chatRoom?.data?.roomId) return;
      if (payload.deletedBy?.includes(master._id)) return;

      if (
        payload.userId === master._id &&
        setting?.mute !== true &&
        setting?.outgoingMessageSoundEnabled !== false
      ) {
        playOutgoingMessageSound();
      }

      if (chatRoom.isOpen) {
        // push new chat to state.chats
        setChats((prev) => {
          if (prev) {
            const exists = prev.some((item) => item._id === payload._id);
            if (exists) {
              return prev.map((item) =>
                item._id === payload._id
                  ? {
                      ...item,
                      ...payload,
                      file:
                        item?.file && payload?.file
                          ? {
                              ...item.file,
                              ...payload.file,
                              duration: Math.max(
                                Number(item.file.duration) || 0,
                                Number(payload.file.duration) || 0
                              ),
                            }
                          : payload.file || item.file || null,
                    }
                  : item
              );
            }
            if (prev.length >= control.limit) {
              return [...prev.slice(1), payload];
            }
            return [...prev, payload];
          }
          return [payload];
        });
      }

      setTimeout(() => {
        const monitor = document.querySelector('#monitor');

        if (payload.userId === master._id) {
          monitor.scrollTo({
            top: monitor.scrollHeight,
            behavior: 'smooth',
          });

          return;
        }

        if (
          monitor.scrollHeight - monitor.clientHeight >=
          monitor.scrollTop + monitor.clientHeight / 2
        ) {
          setNewMessage((prev) => prev + 1);
        } else {
          monitor.scrollTo({
            top: monitor.scrollHeight,
            behavior: 'smooth',
          });
        }
      }, 150);
    });

    socket.on('chat/relay-update', ({ chatId, text, replyTo }) => {
      if (!chatId) return;
      setChats((prev) =>
        (prev || []).map((chat) =>
          chat._id === chatId
            ? {
                ...chat,
                text: text ?? chat.text,
                replyTo: replyTo ?? null,
                reply: null,
              }
            : chat
        )
      );
    });

    socket.on('chat/edit', ({ chatId, text, replyTo, editedAt, editHistory, isEdited }) => {
      if (!chatId) return;
      setChats((prev) =>
        (prev || []).map((chat) =>
          chat._id === chatId
            ? {
                ...chat,
                text: text ?? chat.text,
                replyTo: replyTo ?? null,
                reply: null,
                editedAt: editedAt || new Date().toISOString(),
                isEdited: isEdited !== false,
                editHistory: Array.isArray(editHistory)
                  ? editHistory
                  : chat.editHistory || [],
              }
            : chat
        )
      );
    });

    socket.on('chat/error', (payload) => {
      if (!payload?.message) return;
      if (payload?.roomId && payload.roomId !== chatRoom?.data?.roomId) return;
      setModerationNotice(payload.message);
    });

    return () => {
      socket.off('chat/insert');
      socket.off('chat/relay-update');
      socket.off('chat/edit');
      socket.off('chat/error');
    };
  }, [
    chatRoom?.data?.roomId,
    master._id,
    setting?.mute,
    setting?.outgoingMessageSoundEnabled,
  ]);

  useEffect(() => {
    if (!moderationNotice) return undefined;
    const timer = setTimeout(() => setModerationNotice(''), 3500);
    return () => clearTimeout(timer);
  }, [moderationNotice]);

  useEffect(() => {
    const handleScheduledUpsert = (payload) => {
      if (!payload?.roomId || payload.roomId !== chatRoom?.data?.roomId) return;
      if (payload.status && payload.status !== 'pending') {
        setScheduledItems((prev) =>
          (prev || []).filter((item) => item._id !== payload._id)
        );
        return;
      }
      setScheduledItems((prev) => {
        const next = [payload, ...(prev || []).filter((item) => item._id !== payload._id)];
        return next.sort(
          (a, b) =>
            new Date(a.nextRunAt || a.createdAt).getTime() -
            new Date(b.nextRunAt || b.createdAt).getTime()
        );
      });
    };

    const handleScheduledRemove = (payload) => {
      if (!payload?._id || payload.roomId !== chatRoom?.data?.roomId) return;
      setScheduledItems((prev) =>
        (prev || []).filter((item) => item._id !== payload._id)
      );
    };

    socket.on('scheduled/upsert', handleScheduledUpsert);
    socket.on('scheduled/remove', handleScheduledRemove);

    return () => {
      socket.off('scheduled/upsert', handleScheduledUpsert);
      socket.off('scheduled/remove', handleScheduledRemove);
    };
  }, [chatRoom?.data?.roomId]);

  useEffect(() => {
    if (isGroup) {
      setIsBlockedByFriend(false);
      return undefined;
    }

    const friendId = chatRoom?.data?.profile?.userId;
    if (!friendId) {
      setIsBlockedByFriend(false);
      return undefined;
    }

    let canceled = false;
    axios
      .get(`/contacts/${friendId}/block-state`)
      .then(({ data }) => {
        if (canceled) return;
        setIsBlockedByFriend(!!data?.payload?.blockedYou);
      })
      .catch(() => {
        if (canceled) return;
        setIsBlockedByFriend(false);
      });

    return () => {
      canceled = true;
    };
  }, [isGroup, chatRoom?.data?.profile?.userId, chatRoom?.refreshId]);

  useEffect(() => {
    const onBlockUpdate = (payload) => {
      if (isGroup) return;
      const friendId = chatRoom?.data?.profile?.userId;
      if (!friendId) return;

      if (
        payload?.actorId === friendId &&
        payload?.targetId === master?._id
      ) {
        setIsBlockedByFriend(!!payload?.blocked);
      }
    };

    socket.on('contact/block-update', onBlockUpdate);
    return () => {
      socket.off('contact/block-update', onBlockUpdate);
    };
  }, [isGroup, chatRoom?.data?.profile?.userId, master?._id]);

  useEffect(
    () => () => {
      clearRecordTimer();
      stopWaveformAnalysis();
      stopRecordTracks();
      recorderRef.current = null;
      recordChunksRef.current = [];
      sendRecordedVoiceRef.current = false;
      recordSecondsRef.current = 0;
    },
    []
  );

  useEffect(() => {
    if (!editingChat?._id) return;
    setForm((prev) => ({
      ...prev,
      text: editingChat.text || '',
      file: null,
    }));
    setViewOnceText(false);
    setShowSchedulePanel(false);
    setEmojiBoard(false);
    dispatch(setReplyingChat(null));
  }, [dispatch, editingChat?._id, editingChat?.text]);

  useEffect(() => {
    if (!showSchedulePanel) return;
    setScheduleForm((prev) =>
      prev.scheduledFor
        ? prev
        : {
            ...prev,
            scheduledFor: getDefaultScheduleValue(),
          }
    );
  }, [showSchedulePanel]);

  useEffect(() => {
    if (isRecording) setMobileActionsOpen(false);
  }, [isRecording]);

  useEffect(() => {
    setMobileActionsOpen(false);
  }, [chatRoom?.data?.roomId]);

  const formatRecordTime = `${String(Math.floor(recordSeconds / 60)).padStart(
    2,
    '0'
  )}:${String(recordSeconds % 60).padStart(2, '0')}`;
  const hasText = form.text.trim().length > 0;
  const canScheduleWhenOnline =
    !isGroup && !!chatRoom?.data?.profile?.userId && chatRoom?.data?.profile?.active;
  const composerMode = (() => {
    if (isBlocked) return 'blocked';
    if (isBlockedByFriend) return 'blockedByFriend';
    if (showAdminOnlyNotice) return 'adminOnly';
    return 'normal';
  })();
  const isEditing = !!editingChat?._id;
  const isVoiceComposerLocked = isRecording || isSendingVoice;
  const renderComposerActionButtons = () => (
    <>
      <button
        type="button"
        className={`grid h-9 w-9 place-items-center rounded-full border border-transparent text-slate-600 transition hover:bg-slate-100 dark:text-spill-200 dark:hover:bg-spill-700 ${
          emojiBoard
            ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-900/30 dark:text-sky-300'
            : ''
        }`}
        disabled={isVoiceComposerLocked || isEditing}
        onClick={() => {
          if (isVoiceComposerLocked) return;
          const { group, profile } = chatRoom.data;
          const participant = group?.participantsId.includes(master._id);

          if ((!isGroup && profile.active) || (isGroup && participant)) {
            if (isBlocked || isBlockedByFriend) return;
            setEmojiBoard((prev) => !prev);
            setMobileActionsOpen(false);
          }
        }}
      >
        <i>{emojiBoard ? <bi.BiX /> : <bi.BiSmile />}</i>
      </button>
      <button
        type="button"
        className="grid h-9 w-9 place-items-center rounded-full border border-transparent text-slate-600 transition hover:bg-slate-100 dark:text-spill-200 dark:hover:bg-spill-700"
        disabled={isVoiceComposerLocked || isEditing}
        onClick={(e) => {
          e.stopPropagation();
          if (isVoiceComposerLocked) return;

          const { group, profile } = chatRoom.data;
          const participant = group?.participantsId.includes(master._id);

          if ((!isGroup && profile.active) || (isGroup && participant)) {
            if (isBlocked || isBlockedByFriend) return;
            setMobileActionsOpen(false);
            dispatch(setModal({ target: 'attachMenu' }));
          }
        }}
      >
        <i>
          <bi.BiPaperclip />
        </i>
      </button>
      <button
        type="button"
        className={`grid h-9 w-9 place-items-center rounded-full border border-transparent text-slate-600 transition hover:bg-slate-100 dark:text-spill-200 dark:hover:bg-spill-700 ${
          viewOnceText
            ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-900/30 dark:text-sky-300'
            : ''
        }`}
        disabled={isVoiceComposerLocked || isGroup || isEditing}
        onClick={() => {
          if (isVoiceComposerLocked || isGroup) return;
          if (isBlocked || isBlockedByFriend) return;
          setViewOnceText((prev) => !prev);
          setMobileActionsOpen(false);
        }}
        title={isGroup ? '1-time text is only available in private chat' : 'Send as one-time text'}
      >
        <i>
          <bi.BiLowVision />
        </i>
      </button>
      <button
        type="button"
        className={`grid h-9 w-9 place-items-center rounded-full border border-transparent text-slate-600 transition hover:bg-slate-100 dark:text-spill-200 dark:hover:bg-spill-700 ${
          showSchedulePanel
            ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-900/30 dark:text-sky-300'
            : ''
        }`}
        disabled={isVoiceComposerLocked || isEditing}
        onClick={() => {
          if (isVoiceComposerLocked) return;
          if (isBlocked || isBlockedByFriend) return;
          setShowSchedulePanel((prev) => !prev);
          setMobileActionsOpen(false);
        }}
      >
        <i>
          <bi.BiTimeFive />
        </i>
      </button>
    </>
  );

  return (
    <div className="bg-white border-t border-slate-200 text-slate-500 dark:bg-spill-800 dark:border-spill-700 dark:text-spill-300">
      <AttachMenu
        composerText={form.text}
        onCaptionUsed={() =>
          setForm((prev) => ({
            ...prev,
            text: '',
          }))
        }
        onSendLocation={handleSendLiveLocation}
      />
      {replyingChat && (
        <div className="px-3 py-1 border-b border-slate-200 dark:border-spill-700 flex items-center justify-between bg-slate-50 dark:bg-spill-900/60">
          <p className="text-xs text-slate-600 dark:text-spill-300">
            Replying to message
          </p>
          <button
            type="button"
            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-spill-700"
            onClick={() => dispatch(setReplyingChat(null))}
          >
            <bi.BiX />
          </button>
        </div>
      )}
      {isEditing && (
        <div className="px-3 py-1 border-b border-slate-200 dark:border-spill-700 flex items-center justify-between bg-amber-50 dark:bg-amber-900/20">
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Editing message
          </p>
          <button
            type="button"
            className="p-1 rounded hover:bg-amber-100 dark:hover:bg-amber-900/40"
            onClick={() => {
              dispatch(setEditingChat(null));
              setForm((prev) => ({
                ...prev,
                text: '',
              }));
            }}
          >
            <bi.BiX />
          </button>
        </div>
      )}
      {viewOnceText && composerMode === 'normal' && (
        <div className="px-3 pt-2">
          <div className="rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-700 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-200">
            This text will be blurred in chat and can be opened only one time.
          </div>
        </div>
      )}
      {moderationNotice && composerMode === 'normal' && (
        <div className="px-3 pt-2">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-200">
            {moderationNotice}
          </div>
        </div>
      )}
      {roomSlowModeSeconds > 0 && composerMode === 'normal' && (
        <div className="px-3 pt-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-spill-700 dark:bg-spill-900/40 dark:text-spill-300">
            Slow mode is enabled. Non-admin members can send one message every {roomSlowModeSeconds}s.
          </div>
        </div>
      )}
      {showSchedulePanel && composerMode === 'normal' && (
        <div className="px-3 pt-3 pb-2 border-b border-slate-200 bg-slate-50 dark:border-spill-700 dark:bg-spill-900/60">
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-spill-700 dark:bg-spill-800">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-700 dark:text-spill-100">
                  Message scheduling
                </p>
                <p className="text-xs text-slate-500 dark:text-spill-400">
                  Schedule send, recurring reminders, or send when the recipient comes online.
                </p>
              </div>
              <button
                type="button"
                className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-spill-700"
                onClick={() => setShowSchedulePanel(false)}
              >
                <bi.BiX />
              </button>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                { id: 'once', label: 'Schedule send' },
                { id: 'recurring', label: 'Recurring' },
                { id: 'when-online', label: 'Send online' },
              ]
                .filter((item) => item.id !== 'when-online' || canScheduleWhenOnline)
                .map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`rounded-xl border px-3 py-2 text-xs font-medium transition ${
                      scheduleForm.mode === item.id
                        ? 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-900/30 dark:text-sky-200'
                        : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-spill-700 dark:bg-spill-900 dark:text-spill-300'
                    }`}
                    onClick={() =>
                      setScheduleForm((prev) => ({
                        ...prev,
                        mode: item.id,
                      }))
                    }
                  >
                    {item.label}
                  </button>
                ))}
            </div>

            {scheduleForm.mode !== 'when-online' && (
              <div className="mt-3">
                <label
                  htmlFor="scheduled-message-time"
                  className="mb-1 block text-xs font-medium text-slate-500 dark:text-spill-400"
                >
                  Delivery time
                </label>
                <input
                  id="scheduled-message-time"
                  name="scheduled_for"
                  type="datetime-local"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-spill-700 dark:bg-spill-900 dark:text-spill-100"
                  value={scheduleForm.scheduledFor}
                  onChange={(e) =>
                    setScheduleForm((prev) => ({
                      ...prev,
                      scheduledFor: e.target.value,
                    }))
                  }
                />
              </div>
            )}

            {scheduleForm.mode === 'recurring' && (
              <div className="mt-3">
                <label
                  htmlFor="scheduled-message-recurring"
                  className="mb-1 block text-xs font-medium text-slate-500 dark:text-spill-400"
                >
                  Repeat
                </label>
                <select
                  id="scheduled-message-recurring"
                  name="recurring_type"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-spill-700 dark:bg-spill-900 dark:text-spill-100"
                  value={scheduleForm.recurringType}
                  onChange={(e) =>
                    setScheduleForm((prev) => ({
                      ...prev,
                      recurringType: e.target.value,
                    }))
                  }
                >
                  <option value="daily">Daily reminder</option>
                  <option value="weekly">Weekly reminder</option>
                  <option value="monthly">Monthly reminder</option>
                </select>
              </div>
            )}

            {scheduleForm.mode === 'when-online' && (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-spill-700 dark:bg-spill-900 dark:text-spill-300">
                This message will send automatically when{' '}
                {chatRoom?.data?.profile?.fullname || 'the recipient'} comes online.
              </div>
            )}

            <div className="mt-3 rounded-xl border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-500 dark:border-spill-700 dark:text-spill-400">
              {hasText
                ? `Draft to schedule: "${form.text.trim()}"`
                : 'Write a message in the composer first, then schedule it from here.'}
            </div>

            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-xl px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-spill-300 dark:hover:bg-spill-700"
                onClick={() => setShowSchedulePanel(false)}
              >
                Close
              </button>
              <button
                type="button"
                className="rounded-xl bg-sky-600 px-3 py-2 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-60"
                disabled={
                  !hasText ||
                  isScheduling ||
                  (scheduleForm.mode !== 'when-online' &&
                    !scheduleForm.scheduledFor)
                }
                onClick={handleScheduleCreate}
              >
                {isScheduling ? 'Saving...' : 'Save schedule'}
              </button>
            </div>

            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-spill-400">
                  Upcoming
                </p>
                {isLoadingSchedules && (
                  <span className="text-[11px] text-slate-400 dark:text-spill-500">
                    Loading...
                  </span>
                )}
              </div>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {(scheduledItems || []).length === 0 && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-spill-700 dark:bg-spill-900 dark:text-spill-400">
                    No scheduled messages in this chat.
                  </div>
                )}
                {(scheduledItems || []).map((item) => (
                  <div
                    key={item._id}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-spill-700 dark:bg-spill-900"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-slate-700 dark:text-spill-100">
                          {item.text}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-500 dark:text-spill-400">
                          {item.mode === 'when-online'
                            ? `Send when ${chatRoom?.data?.profile?.fullname || 'recipient'} is online`
                            : `${item.mode === 'recurring' ? `${item.recurringType} reminder` : 'Scheduled'} • ${new Date(
                                item.nextRunAt || item.scheduledFor || item.createdAt
                              ).toLocaleString()}`}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="rounded-lg px-2 py-1 text-[11px] font-medium text-rose-600 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-900/20"
                        onClick={() => handleCancelScheduled(item._id)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="overflow-visible px-2 h-16 grid grid-cols-[auto_1fr_auto] gap-2 items-center">
        {(() => {
          if (composerMode === 'blocked') {
            return (
              <div className="col-span-3 h-11 px-3 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-between dark:bg-amber-900/20 dark:border-amber-800">
                <p className="text-xs sm:text-sm text-amber-800 dark:text-amber-300">
                  You blocked this contact
                </p>
                <button
                  type="button"
                  className="ml-3 px-3 py-1 rounded-md text-xs sm:text-sm bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60"
                  onClick={handleUnblock}
                  disabled={isUnblocking}
                >
                  {isUnblocking ? 'Unblocking...' : 'Unblock now'}
                </button>
              </div>
            );
          }

          if (composerMode === 'adminOnly') {
            return (
              <div className="col-span-3 h-11 px-3 rounded-lg border border-sky-200 bg-sky-50 flex items-center justify-center dark:border-sky-800 dark:bg-sky-900/20">
                <p className="text-xs sm:text-sm font-medium text-sky-800 dark:text-sky-300">
                  Only Admins can send messages
                </p>
              </div>
            );
          }

          if (composerMode === 'blockedByFriend') {
            const blockerName = chatRoom?.data?.profile?.fullname || 'User';
            return (
              <div className="col-span-3 h-11 px-3 rounded-lg border border-rose-200 bg-rose-50 flex items-center justify-center gap-2 dark:border-rose-800 dark:bg-rose-900/20">
                <i className="text-rose-600 dark:text-rose-400">
                  <bi.BiBlock size={18} />
                </i>
                <p className="text-xs sm:text-sm font-medium text-rose-700 dark:text-rose-300">
                  {`${blockerName} Block You. you can not send message.`}
                </p>
              </div>
            );
          }

          return (
            <>
              <span className="hidden sm:flex">
                {renderComposerActionButtons()}
              </span>
              <span className="relative flex sm:hidden">
                <span
                  className={`absolute left-11 top-1/2 z-20 flex -translate-y-1/2 items-center gap-0.5 rounded-full border border-slate-200/90 bg-white/96 px-1.5 py-1 shadow-[0_16px_34px_rgba(15,23,42,0.16)] backdrop-blur-xl transition-all dark:border-spill-700 dark:bg-spill-800/96 ${
                    mobileActionsOpen
                      ? 'pointer-events-auto translate-x-0 opacity-100'
                      : 'pointer-events-none -translate-x-2 opacity-0'
                  }`}
                >
                  {renderComposerActionButtons()}
                </span>
                <button
                  type="button"
                  className={`grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200 dark:border-spill-700 dark:bg-spill-900 dark:text-spill-200 dark:hover:bg-spill-700 ${
                    mobileActionsOpen
                      ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-900/30 dark:text-sky-300'
                      : ''
                  }`}
                  disabled={isVoiceComposerLocked || isEditing}
                  onClick={() => {
                    if (isVoiceComposerLocked) return;
                    setMobileActionsOpen((prev) => !prev);
                  }}
                >
                  <i>{mobileActionsOpen ? <bi.BiX /> : <bi.BiPlus />}</i>
                </button>
              </span>
              <label
                htmlFor="new-message"
                className={`rounded-3xl border border-slate-200 bg-slate-100 px-4 py-2 flex items-center dark:bg-spill-900 dark:border-spill-700 ${
                  isRecording ? 'min-h-[52px]' : 'h-11'
                }`}
              >
                {isRecording ? (
                  <span className="w-full flex items-center gap-3">
                    <span className="flex items-center gap-2 text-sm text-rose-600 dark:text-rose-300">
                      <span
                        className={`w-2 h-2 rounded-full bg-rose-500 ${
                          isRecordingPaused ? '' : 'animate-pulse'
                        }`}
                      />
                      {isRecordingPaused ? 'Paused' : 'Recording'} {formatRecordTime}
                    </span>
                    <span className="flex-1 flex items-end gap-[3px] h-8">
                      {recordWaveform.map((level, index) => (
                        <span
                          key={`record-wave-${index + 1}`}
                          className={`flex-1 rounded-full transition-all duration-150 ${
                            isRecordingPaused
                              ? 'bg-slate-300 dark:bg-spill-600'
                              : 'bg-rose-400/90 dark:bg-rose-300/90'
                          }`}
                          style={{
                            height: `${Math.max(22, Math.round(level * 100))}%`,
                          }}
                        />
                      ))}
                    </span>
                    <button
                      type="button"
                      className="p-1 rounded-full text-slate-600 hover:bg-slate-200 dark:text-spill-200 dark:hover:bg-spill-700"
                      title={isRecordingPaused ? 'Resume recording' : 'Pause recording'}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        togglePauseVoiceRecording();
                      }}
                    >
                      {isRecordingPaused ? <bi.BiPlay /> : <bi.BiPause />}
                    </button>
                    <button
                      type="button"
                      className="p-1 rounded-full text-rose-600 hover:bg-rose-100 dark:text-rose-300 dark:hover:bg-rose-900/30"
                      title="Discard recording"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        stopVoiceRecording(false);
                      }}
                    >
                      <bi.BiTrash />
                    </button>
                  </span>
                ) : (
                  <input
                    type="text"
                    name="text"
                    id="new-message"
                    autoComplete="off"
                    spellCheck={setting?.spellCheckEnabled !== false}
                    placeholder={isEditing ? 'Edit message' : 'Type a message'}
                    className="w-full text-sm text-slate-700 placeholder:text-slate-400 dark:text-spill-100 dark:placeholder:text-spill-400"
                    onChange={handleChange}
                    value={form.text}
                    onKeyDown={(e) => {
                      if (setting.enterToSend && e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmit();
                      }
                    }}
                  />
                )}
              </label>
              <button
                type="submit"
                className="p-2 rounded-full hover:bg-slate-200 disabled:opacity-60 dark:hover:bg-spill-700"
                disabled={isSendingVoice}
                onClick={(e) => {
                  if (hasText) {
                    handleSubmit(e);
                    return;
                  }

                  if (isEditing) return;

                  if (isRecording) {
                    stopVoiceRecording(true);
                    return;
                  }

                  startVoiceRecording();
                }}
              >
                <i>
                  {hasText || isRecording || isEditing ? (
                    <bi.BiSend />
                  ) : (
                    <bi.BiMicrophone />
                  )}
                </i>
              </button>
            </>
          );
        })()}
      </div>
      {emojiBoard && <EmojiBoard setForm={setForm} />}
    </div>
  );
}

export default Send;
