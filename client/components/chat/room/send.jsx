import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import * as bi from 'react-icons/bi';
import socket from '../../../helpers/socket';
import EmojiBoard from './emojiBoard';
import { setModal } from '../../../redux/features/modal';
import { setSetting } from '../../../redux/features/user';
import { setReplyingChat } from '../../../redux/features/chore';
import { isGroupAdmin } from '../../../helpers/groupAdmins';

import AttachMenu from '../../modals/attachMenu';

function Send({ setChats, setNewMessage, control }) {
  const dispatch = useDispatch();
  const {
    user: { master, setting },
    chore: { replyingChat },
    room: { chat: chatRoom },
  } = useSelector((state) => state);

  const isGroup = chatRoom.data.roomType === 'group';
  const isGroupMember = !!chatRoom.data?.group?.participantsId?.includes(
    master._id
  );
  const isCurrentUserGroupAdmin = !!(
    isGroup && isGroupAdmin(chatRoom.data?.group, master._id)
  );
  const memberCanSendMessage =
    chatRoom.data?.group?.permissions?.memberCanSendMessage === undefined
      ? true
      : !!chatRoom.data?.group?.permissions?.memberCanSendMessage;
  const showAdminOnlyNotice =
    isGroup &&
    isGroupMember &&
    !isCurrentUserGroupAdmin &&
    !memberCanSendMessage;
  const isBlocked =
    !isGroup &&
    setting?.blockedUserIds?.includes(chatRoom.data?.profile?.userId);

  const [emojiBoard, setEmojiBoard] = useState(false);
  const [form, setForm] = useState({
    text: '',
    file: null,
  });
  const [isUnblocking, setIsUnblocking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isSendingVoice, setIsSendingVoice] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const recorderRef = useRef(null);
  const recordStreamRef = useRef(null);
  const recordChunksRef = useRef([]);
  const recordTimerRef = useRef(null);
  const sendRecordedVoiceRef = useRef(false);

  const canSendInCurrentRoom = () => {
    const { group = null, profile = null } = chatRoom.data;

    return (
      (isGroup &&
        group?.participantsId?.includes(master._id) &&
        (isGroupAdmin(group, master._id) ||
          group?.permissions?.memberCanSendMessage !== false)) ||
      (!isGroup && profile?.active)
    );
  };

  const clearRecordTimer = () => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
  };

  const stopRecordTracks = () => {
    if (recordStreamRef.current) {
      recordStreamRef.current.getTracks().forEach((track) => track.stop());
      recordStreamRef.current = null;
    }
  };

  const uploadAndSendVoice = async (audioBlob) => {
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

    await axios.post(
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
        },
      },
      { headers }
    );
  };

  const startVoiceRecording = async () => {
    if (isBlocked || isRecording || isSendingVoice) return;
    if (!canSendInCurrentRoom()) return;

    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      // eslint-disable-next-line no-alert
      alert('Voice recording is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recordStreamRef.current = stream;
      recorderRef.current = recorder;
      recordChunksRef.current = [];
      sendRecordedVoiceRef.current = false;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        clearRecordTimer();
        stopRecordTracks();
        setIsRecording(false);

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
          setIsSendingVoice(true);
          await uploadAndSendVoice(audioBlob);
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
      setRecordSeconds(0);
      setIsRecording(true);
      clearRecordTimer();
      recordTimerRef.current = setInterval(() => {
        setRecordSeconds((prev) => prev + 1);
      }, 1000);
    } catch (error0) {
      console.error(error0.message || error0);
      // eslint-disable-next-line no-alert
      alert('Microphone permission denied or unavailable.');
      clearRecordTimer();
      stopRecordTracks();
      setIsRecording(false);
    }
  };

  const stopVoiceRecording = (shouldSend) => {
    sendRecordedVoiceRef.current = shouldSend;
    const recorder = recorderRef.current;

    if (!recorder) {
      clearRecordTimer();
      stopRecordTracks();
      setIsRecording(false);
      return;
    }

    if (recorder.state !== 'inactive') {
      recorder.stop();
    } else {
      clearRecordTimer();
      stopRecordTracks();
      setIsRecording(false);
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
    setForm((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
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
    if (isBlocked) return;
    if (form.text.length > 0 || form.file) {
      if (canSendInCurrentRoom()) {
        socket.emit('chat/insert', {
          ...form,
          ownersId: chatRoom.data.ownersId,
          roomType: chatRoom.data.roomType,
          userId: master._id,
          roomId: chatRoom.data.roomId,
          replyTo: replyingChat?._id || null,
        });
      } else return;

      // close emoji board after 150ms
      setTimeout(() => setEmojiBoard(false), 150);
      // reset form
      setForm({ text: '', file: null });
      dispatch(setReplyingChat(null));
    }
  };

  useEffect(() => {
    socket.on('chat/insert', (payload) => {
      if (payload.deletedBy?.includes(master._id)) return;

      if (chatRoom.isOpen) {
        // push new chat to state.chats
        setChats((prev) => {
          if (prev) {
            if (prev.length >= control.limit) {
              prev.shift();
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

    return () => {
      socket.off('chat/insert');
    };
  }, []);

  useEffect(
    () => () => {
      clearRecordTimer();
      stopRecordTracks();
      recorderRef.current = null;
      recordChunksRef.current = [];
      sendRecordedVoiceRef.current = false;
    },
    []
  );

  const formatRecordTime = `${String(Math.floor(recordSeconds / 60)).padStart(
    2,
    '0'
  )}:${String(recordSeconds % 60).padStart(2, '0')}`;
  const hasText = form.text.trim().length > 0;
  const composerMode = (() => {
    if (isBlocked) return 'blocked';
    if (showAdminOnlyNotice) return 'adminOnly';
    return 'normal';
  })();

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
      <div className="px-2 h-16 grid grid-cols-[auto_1fr_auto] gap-2 items-center">
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

          return (
            <>
              <span className="flex">
                <button
                  type="button"
                  className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-spill-700"
                  disabled={isRecording || isSendingVoice}
                  onClick={() => {
                    if (isRecording || isSendingVoice) return;
                    const { group, profile } = chatRoom.data;
                    const participant = group?.participantsId.includes(
                      master._id
                    );

                    if (
                      (!isGroup && profile.active) ||
                      (isGroup && participant)
                    ) {
                      if (isBlocked) return;
                      setEmojiBoard((prev) => !prev);
                    }
                  }}
                >
                  <i>{emojiBoard ? <bi.BiX /> : <bi.BiSmile />}</i>
                </button>
                <button
                  type="button"
                  className="p-2 rounded-full -rotate-90 hover:bg-slate-200 dark:hover:bg-spill-700"
                  disabled={isRecording || isSendingVoice}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isRecording || isSendingVoice) return;

                    const { group, profile } = chatRoom.data;
                    const participant = group?.participantsId.includes(
                      master._id
                    );

                    if (
                      (!isGroup && profile.active) ||
                      (isGroup && participant)
                    ) {
                      if (isBlocked) return;
                      dispatch(setModal({ target: 'attachMenu' }));
                    }
                  }}
                >
                  <i>
                    <bi.BiPaperclip />
                  </i>
                </button>
              </span>
              <label
                htmlFor="new-message"
                className="h-11 px-4 rounded-full bg-slate-100 border border-slate-200 flex items-center dark:bg-spill-900 dark:border-spill-700"
              >
                {isRecording ? (
                  <span className="w-full grid grid-cols-[1fr_auto] gap-2 items-center">
                    <span className="flex items-center gap-2 text-sm text-rose-600 dark:text-rose-300">
                      <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                      Recording {formatRecordTime}
                    </span>
                    <button
                      type="button"
                      className="p-1 rounded-full text-rose-600 hover:bg-rose-100 dark:text-rose-300 dark:hover:bg-rose-900/30"
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
                    placeholder="Type a message"
                    className="w-full text-sm text-slate-700 placeholder:text-slate-400 dark:text-spill-100 dark:placeholder:text-spill-400"
                    onChange={handleChange}
                    value={form.text}
                    onKeyPress={(e) => {
                      if (setting.enterToSend && e.key === 'Enter') {
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

                  if (isRecording) {
                    stopVoiceRecording(true);
                    return;
                  }

                  startVoiceRecording();
                }}
              >
                <i>
                  {hasText || isRecording ? <bi.BiSend /> : <bi.BiMicrophone />}
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
