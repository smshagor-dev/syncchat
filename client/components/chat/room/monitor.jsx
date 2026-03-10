import React, { useEffect, useState, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import moment from 'moment';
import * as ri from 'react-icons/ri';
import * as bi from 'react-icons/bi';
import axios from 'axios';
import Linkify from 'linkify-react';
import socket from '../../../helpers/socket';
import {
  touchAndHoldStart,
  touchAndHoldEnd,
} from '../../../helpers/touchAndHold';
import {
  setEditingChat,
  setReplyingChat,
  setSelectedChats,
} from '../../../redux/features/chore';
import { setPage } from '../../../redux/features/page';
import { setModal } from '../../../redux/features/modal';
import resolveUploadUrl from '../../../helpers/resolveUploadUrl';
import {
  DEFAULT_ROOM_APPEARANCE,
  ROOM_APPEARANCE_EVENT,
  getRoomAppearance,
  getWallpaperStyle,
} from '../../../helpers/roomAppearance';
import { isGroupAdmin } from '../../../helpers/groupAdmins';

const POLL_PREFIX = '__poll__::';
const EVENT_PREFIX = '__event__::';
const GROUP_INFO_PREFIX = '__group_info__::';

function Monitor({
  newMessage,
  setNewMessage,
  chats,
  setChats,
  control,
  setControl,
  loaded,
  searchQuery,
  pinsData,
  onPinsRefresh,
}) {
  const dispatch = useDispatch();
  const {
    chore: { selectedChats },
    room: { chat: chatRoom },
    user: { master, setting },
    page,
  } = useSelector((state) => state);

  const isGroup = chatRoom.data.roomType === 'group';
  const isChannel = !!chatRoom.data.channel;
  const isSecretChat =
    chatRoom.data.roomType === 'private' && !!chatRoom.data.secretChatEnabled;
  const isCurrentUserGroupAdmin =
    isGroup && isGroupAdmin(chatRoom.data?.group, master._id);
  const isScrolled = useRef(false);
  const focusTimerRef = useRef(null);
  const audioRefs = useRef({});
  const monitorRef = useRef(null);
  const initialBottomPinRef = useRef(false);
  const [loadingScroll, setLoadingScroll] = useState(false);
  const [messageMenu, setMessageMenu] = useState(null);
  const [playingAudioId, setPlayingAudioId] = useState(null);
  const [audioProgress, setAudioProgress] = useState({});
  const [audioDuration, setAudioDuration] = useState({});
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [appearance, setAppearance] = useState(DEFAULT_ROOM_APPEARANCE);
  const [openVoters, setOpenVoters] = useState({});
  const [manualMediaAccess, setManualMediaAccess] = useState({});
  const [nowTs, setNowTs] = useState(Date.now());
  const downloadedMediaRef = useRef(new Set());
  const quickEmojis = [
    '\uD83D\uDC4D',
    '\u2764\uFE0F',
    '\uD83D\uDE02',
    '\uD83D\uDE2E',
    '\uD83D\uDE22',
    '\uD83D\uDD25',
  ];

  const openForwardFor = (chatId) => {
    if (isSecretChat) return;
    dispatch(
      setModal({
        target: 'shareContact',
        data: {
          mode: 'forward',
          chatsId: [chatId],
          fromRoomId: chatRoom.data.roomId,
        },
      })
    );
  };

  const openDeleteFor = (chatId) => {
    dispatch(setSelectedChats([chatId]));
    dispatch(setModal({ target: 'confirmDeleteChat', data: true }));
  };

  const getEditHistoryList = (chat) =>
    Array.isArray(chat?.editHistory) ? chat.editHistory : [];

  const canEditChat = (chat) => {
    if (!chat || chat.userId !== master._id) return false;
    if (chat?.viewOnce?.enabled) return false;
    if (chat?.profile?.isSecretSystemMessage) return false;
    if (getPollFromChat(chat) || getEventFromChat(chat) || getGroupInfoFromChat(chat)) {
      return false;
    }
    return true;
  };

  const isStarredByMe = (chat) =>
    Array.isArray(chat?.starredBy) && chat.starredBy.includes(master?._id);

  const toggleStarFor = async (chat) => {
    if (!chat?._id) return;
    try {
      const nextStar = !isStarredByMe(chat);
      const { data } = await axios.patch(`/chats/${chat._id}/star`, {
        starred: nextStar,
      });
      const nextStarredBy = data?.payload?.starredBy || [];
      setChats((prev) =>
        prev.map((item) =>
          item._id === chat._id
            ? {
                ...item,
                starredBy: nextStarredBy,
              }
            : item
        )
      );
    } catch (error0) {
      // eslint-disable-next-line no-console
      console.error(error0?.response?.data?.message || error0.message);
    }
  };

  const reactToMessage = (chatId, emoji) => {
    socket.emit('chat/react', {
      roomId: chatRoom.data.roomId,
      chatId,
      userId: master._id,
      emoji,
    });
  };

  const parsePollFromText = (text) => {
    if (typeof text !== 'string' || !text.startsWith(POLL_PREFIX)) return null;
    try {
      const parsed = JSON.parse(text.slice(POLL_PREFIX.length));
      const options = Array.isArray(parsed?.options)
        ? parsed.options
            .map((option, index) => ({
              id: String(option?.id || `opt-${index + 1}`),
              text: String(option?.text || '').trim(),
              votes: Array.isArray(option?.votes)
                ? option.votes
                    .map((vote) => ({
                      userId: vote?.userId || '',
                      fullname: vote?.fullname || '[unknown]',
                      at: vote?.at || null,
                    }))
                    .filter((vote) => vote.userId)
                : [],
            }))
            .filter((option) => option.text)
        : [];

      if (!String(parsed?.question || '').trim() || options.length < 2) {
        return null;
      }

      return {
        version: Number(parsed?.version || 1),
        mode: parsed?.mode === 'quiz' ? 'quiz' : 'poll',
        question: String(parsed.question).trim(),
        options,
        anonymous: !!parsed?.anonymous,
        multiSelect: !!parsed?.multiSelect,
        correctOptionIds: Array.isArray(parsed?.correctOptionIds)
          ? parsed.correctOptionIds
              .map((id) => String(id || '').trim())
              .filter((id) => options.some((option) => option.id === id))
          : [],
        closedAt: parsed?.closedAt || null,
        closedBy: parsed?.closedBy || null,
        createdBy: parsed?.createdBy || null,
      };
    } catch (error0) {
      return null;
    }
  };

  const getPollFromChat = (chat) =>
    chat?.poll && Array.isArray(chat.poll?.options)
      ? chat.poll
      : parsePollFromText(chat?.text);

  const parseEventFromText = (text) => {
    if (typeof text !== 'string' || !text.startsWith(EVENT_PREFIX)) return null;
    try {
      const parsed = JSON.parse(text.slice(EVENT_PREFIX.length));
      const title = String(parsed?.title || '').trim();
      const date = String(parsed?.date || '').trim();
      const time = String(parsed?.time || '').trim();
      const details = String(parsed?.details || '').trim();
      const linkType = String(parsed?.link?.type || '').trim();
      const linkUrl = String(parsed?.link?.url || '').trim();
      if (!title || !date) return null;

      return {
        title,
        date,
        time,
        details,
        link: linkUrl
          ? {
              type: linkType || 'Link',
              url: linkUrl,
            }
          : null,
      };
    } catch (error0) {
      return null;
    }
  };

  const getEventFromChat = (chat) => parseEventFromText(chat?.text);

  const parseGroupInfoFromText = (text) => {
    if (typeof text !== 'string' || !text.startsWith(GROUP_INFO_PREFIX)) {
      return null;
    }
    try {
      const parsed = JSON.parse(text.slice(GROUP_INFO_PREFIX.length));
      const groupName = String(parsed?.groupName || '').trim();
      const createdBy = String(parsed?.createdBy || '').trim();
      const totalParticipants = Number(parsed?.totalParticipants || 0);
      const icon = String(parsed?.icon || '👥').trim() || '👥';
      const accessType =
        String(parsed?.accessType || 'public').toLowerCase() === 'private'
          ? 'private'
          : 'public';
      if (!groupName || !createdBy || !totalParticipants) return null;

      return {
        icon,
        groupName,
        createdBy,
        totalParticipants,
        accessType,
      };
    } catch (error0) {
      return null;
    }
  };

  const getGroupInfoFromChat = (chat) => parseGroupInfoFromText(chat?.text);

  const voteOnPoll = (chatId, optionId) => {
    socket.emit('chat/poll-vote', {
      roomId: chatRoom.data.roomId,
      chatId,
      userId: master._id,
      optionId,
    });
  };

  const closePoll = (chatId) => {
    socket.emit('chat/poll-close', {
      roomId: chatRoom.data.roomId,
      chatId,
      userId: master._id,
    });
  };

  const pinMessage = async (chatId) => {
    const roomId = chatRoom?.data?.roomId;
    if (!roomId || !chatId) return;
    try {
      await axios.post(`/chats/${chatId}/pin`, { roomId });
      if (onPinsRefresh) await onPinsRefresh();
    } catch (error0) {
      // eslint-disable-next-line no-console
      console.error(error0?.response?.data?.message || error0.message);
    }
  };

  const unpinMessage = async (chatId) => {
    const roomId = chatRoom?.data?.roomId;
    if (!roomId || !chatId) return;
    try {
      await axios.delete(`/chats/${chatId}/pin`, {
        data: { roomId },
      });
      if (onPinsRefresh) await onPinsRefresh();
    } catch (error0) {
      // eslint-disable-next-line no-console
      console.error(error0?.response?.data?.message || error0.message);
    }
  };

  const openGroupEditSettings = () => {
    const rawGroup = chatRoom.data?.group || null;
    if (!rawGroup?._id) {
      dispatch(
        setPage({
          target: isChannel ? 'channelProfile' : 'groupProfile',
          data: false,
        })
      );
      return;
    }

    // Open immediately with available room payload so click always responds.
    dispatch(
      setModal({
        target: 'editGroup',
        data: rawGroup,
      })
    );

    // Keep group profile visible as fallback edit surface.
    dispatch(
      setPage({
        target: isChannel ? 'channelProfile' : 'groupProfile',
        data: isChannel
          ? { channelId: rawGroup._id, roomId: rawGroup.roomId }
          : rawGroup._id,
      })
    );

    // Refresh modal payload with latest server state (best-effort).
    axios
      .get(`/${isChannel ? 'channels' : 'groups'}/${rawGroup._id}`)
      .then(({ data }) => {
        if (!data?.payload) return;
        dispatch(
          setModal({
            target: 'editGroup',
            data: {
              ...rawGroup,
              ...data.payload,
            },
          })
        );
      })
      .catch(() => {
        // no-op; modal is already open with local payload
      });
  };

  const openGroupAddMembers = () => {
    if (!chatRoom.data?.group) return;
    dispatch(
      setPage({
        target: 'addParticipant',
        data: {
          participantsId: chatRoom.data.group.participantsId || [],
          groupId: chatRoom.data.group._id,
          channelId: isChannel ? chatRoom.data.group._id : null,
          roomId: chatRoom.data.group.roomId,
        },
      })
    );
  };

  const openGroupInviteQr = () => {
    if (!chatRoom.data?.group) return;
    const token = String(chatRoom.data.group.link || '').replace(
      isChannel ? '/channel/+' : '/group/+',
      ''
    );
    dispatch(
      setModal({
        target: 'qr',
        data: {
          type: isChannel ? 'channel' : 'group',
          fullname: chatRoom.data.group.name || (isChannel ? 'Channel' : 'Group'),
          bio:
            chatRoom.data.group.accessType === 'private'
              ? `Private ${isChannel ? 'channel' : 'group'} invite`
              : `Public ${isChannel ? 'channel' : 'group'} invite`,
          avatar:
            chatRoom.data.group.avatar ||
            'assets/images/default-group-avatar.png',
          shareUrl: `${window.location.origin}/chat?${
            isChannel ? 'c' : 'g'
          }=${encodeURIComponent(
            token
          )}`,
        },
      })
    );
  };

  const openMessageMenu = (event, chatId) => {
    if (selectedChats) {
      dispatch(setSelectedChats(chatId));
      return;
    }

    const menuWidth = 256;
    const menuHeight = 260;
    const margin = 12;
    const maxX = window.innerWidth - menuWidth - margin;
    const maxY = window.innerHeight - menuHeight - margin;

    setMessageMenu({
      chatId,
      x: Math.max(margin, Math.min(event.clientX, maxX)),
      y: Math.max(margin, Math.min(event.clientY, maxY)),
    });
  };

  const jumpToReferencedMessage = (targetChatId) => {
    if (!targetChatId || selectedChats) return;

    const monitor = monitorRef.current;
    const targetNode = document.querySelector(`#chat-msg-${targetChatId}`);
    if (!monitor || !targetNode) return;

    const targetTop =
      targetNode.offsetTop -
      monitor.clientHeight / 2 +
      targetNode.clientHeight / 2;
    monitor.scrollTo({
      top: Math.max(0, targetTop),
      behavior: 'smooth',
    });
    targetNode.style.transition = 'box-shadow 180ms ease';
    targetNode.style.boxShadow =
      '0 0 0 2px rgba(14,165,233,0.9), 0 0 0 6px rgba(14,165,233,0.18)';

    if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    focusTimerRef.current = setTimeout(() => {
      targetNode.style.boxShadow = '';
    }, 1300);
  };

  useEffect(() => {
    if (chats) {
      const last = chats[chats.length - 1];

      if (master._id !== last?.userId && !last?.readed) {
        const { roomId, ownersId } = chatRoom.data;

        socket.emit('chat/read', { roomId, ownersId });
      }
    }
  }, [chats ? chats[chats.length - 1] : !!chats]);

  useEffect(() => {
    const hasTimer = (chats || []).some((chat) => !!chat?.expiresAt);
    if (!hasTimer) return undefined;

    const timer = window.setInterval(() => {
      const ts = Date.now();
      setNowTs(ts);
      setChats((prev) =>
        (prev || []).filter(
          (chat) =>
            !(
              chat?.expiresAt &&
              Number.isFinite(new Date(chat.expiresAt).getTime()) &&
              new Date(chat.expiresAt).getTime() <= ts
            )
        )
      );
    }, 1000);
    return () => window.clearInterval(timer);
  }, [chats, setChats]);

  useEffect(() => {
    socket.on('chat/read', () => {
      setChats((prev) => {
        prev
          .filter((elem) => !elem.readed)
          .map((elem) =>
            Object.assign(elem, { readed: true, delivered: true })
          );

        return [...prev];
      });
    });

    socket.on('chat/delivered', ({ chatIds }) => {
      if (!Array.isArray(chatIds) || chatIds.length === 0) return;
      setChats((prev) =>
        prev.map((elem) =>
          chatIds.includes(elem._id) ? { ...elem, delivered: true } : elem
        )
      );
    });

    socket.on('chat/react', ({ chatId, reactions }) => {
      setChats((prev) =>
        prev.map((elem) =>
          elem._id === chatId ? { ...elem, reactions } : elem
        )
      );
    });

    socket.on('chat/poll-vote', ({ chatId, text, poll }) => {
      setChats((prev) =>
        prev.map((elem) =>
          elem._id === chatId
            ? { ...elem, text: text || elem.text, poll: poll || null }
            : elem
        )
      );
    });

    socket.on('chat/poll-close', ({ chatId, text, poll }) => {
      setChats((prev) =>
        prev.map((elem) =>
          elem._id === chatId
            ? { ...elem, text: text || elem.text, poll: poll || null }
            : elem
        )
      );
    });

    socket.on('chat/delete', ({ userId, chatsId }) => {
      if (chatRoom.isOpen) {
        if (userId === master._id) {
          dispatch(setSelectedChats(null));
          // close confirmDeleteChat modal
          dispatch(
            setModal({
              target: 'confirmDeleteChat',
              data: false,
            })
          );
        }

        setTimeout(() => {
          setChats((prev) =>
            prev.filter((elem) => !chatsId.includes(elem._id))
          );
        }, 300);
      }
    });

    socket.on('chat/forward-blocked', ({ message }) => {
      // eslint-disable-next-line no-alert
      alert(message || 'Forward is blocked in secret chat');
    });

    return () => {
      socket.off('chat/read');
      socket.off('chat/delivered');
      socket.off('chat/react');
      socket.off('chat/poll-vote');
      socket.off('chat/poll-close');
      socket.off('chat/delete');
      socket.off('chat/forward-blocked');
    };
  }, []);

  useEffect(() => {
    if (!isSecretChat) return undefined;

    const emitAlert = () => {
      socket.emit('secret/screenshot-alert', {
        roomId: chatRoom.data.roomId,
        userId: master._id,
      });
    };

    const handleKeyDown = (event) => {
      const key = String(event.key || '');
      const isPrintScreen =
        key === 'PrintScreen' ||
        key === 'Snapshot' ||
        (event.metaKey &&
          event.shiftKey &&
          ['3', '4', '5'].includes(String(event.key || '')));
      if (isPrintScreen) emitAlert();
    };

    const handleBlockedSave = (event) => {
      const isSaveShortcut =
        (event.ctrlKey || event.metaKey) &&
        String(event.key || '').toLowerCase() === 's';
      if (!isSaveShortcut) return;
      event.preventDefault();
      event.stopPropagation();
      emitAlert();
    };

    const preventSecretExtraction = (event) => {
      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keydown', handleBlockedSave, true);
    window.addEventListener('contextmenu', preventSecretExtraction, true);
    window.addEventListener('dragstart', preventSecretExtraction, true);
    window.addEventListener('copy', preventSecretExtraction, true);
    window.addEventListener('cut', preventSecretExtraction, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keydown', handleBlockedSave, true);
      window.removeEventListener('contextmenu', preventSecretExtraction, true);
      window.removeEventListener('dragstart', preventSecretExtraction, true);
      window.removeEventListener('copy', preventSecretExtraction, true);
      window.removeEventListener('cut', preventSecretExtraction, true);
    };
  }, [chatRoom.data.roomId, isSecretChat, master._id]);

  useEffect(() => {
    if (selectedChats && messageMenu) {
      setMessageMenu(null);
    }
  }, [selectedChats]);

  useEffect(
    () => () => {
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    },
    []
  );

  const handleInfiniteScroll = async (e) => {
    if (messageMenu) {
      setMessageMenu(null);
    }

    const { scrollTop } = e.target;
    const distanceFromBottom =
      e.target.scrollHeight - (e.target.scrollTop + e.target.clientHeight);
    setShowScrollBottom(distanceFromBottom > 90);
    const { skip, limit } = control;

    if (scrollTop === 0) {
      e.target.scrollTop = 1;
    }

    if (
      scrollTop < 128 &&
      chats?.length >= skip + limit &&
      !isScrolled.current
    ) {
      isScrolled.current = true;
      setLoadingScroll(true);

      const { data } = await axios.get(`/chats/${chatRoom.data.roomId}`, {
        params: {
          skip: skip + limit,
          limit,
        },
      });

      setChats((prev) => [...data.payload, ...prev]);
      setControl((prev) => ({
        ...prev,
        skip: prev.skip + prev.limit,
      }));

      setLoadingScroll(false);

      setTimeout(() => {
        isScrolled.current = false;
      }, 1000);
    }
  };

  const menuTarget =
    messageMenu && chats
      ? chats.find((item) => item._id === messageMenu.chatId)
      : null;
  const isAudioAttachment = (file) => {
    if (!file) return false;
    if (file.type === 'audio') return true;

    const ext = String(file.format || file.originalname || '')
      .split('.')
      .pop()
      .toLowerCase();
    return ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'webm'].includes(ext);
  };
  const isImageChat = (chat) => chat?.file?.type === 'image';
  const getAutoDownloadSettingKey = (file) => {
    if (!file) return null;
    if (file.type === 'image') return 'autoDownloadPhotos';
    if (file.type === 'video') return 'autoDownloadVideos';
    if (isAudioAttachment(file)) return 'autoDownloadAudio';
    return 'autoDownloadDocuments';
  };
  const canAutoLoadAttachment = (chat) => {
    if (!chat?.file) return false;
    if (isSecretChat) return !!manualMediaAccess[chat._id];
    if (chat.userId === master._id) return true;
    if (manualMediaAccess[chat._id]) return true;
    const settingKey = getAutoDownloadSettingKey(chat.file);
    return settingKey ? setting?.[settingKey] !== false : false;
  };
  const triggerBrowserDownload = (file) => {
    if (isSecretChat) return;
    const resolved = resolveUploadUrl(file?.url);
    if (!resolved) return;
    const link = document.createElement('a');
    link.href = resolved;
    link.download = file?.originalname || 'download';
    link.rel = 'noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  const requestManualAttachmentAccess = (chat) => {
    if (!chat?._id) return;
    setManualMediaAccess((prev) => ({
      ...prev,
      [chat._id]: true,
    }));
  };
  const getCallLogMeta = (text) => {
    if (typeof text !== 'string') return null;
    const raw = text.trim();
    const value = raw.toLowerCase();
    const mentionsCall =
      value.includes('call') ||
      value.includes('missed') ||
      value.includes('reject') ||
      value.includes('decline');
    if (!mentionsCall) return null;

    const isVideo = value.includes('video');
    const isMissed = value.includes('missed');
    const isRejected =
      value.includes('reject') ||
      value.includes('rejected') ||
      value.includes('decline') ||
      value.includes('declined');
    const isDanger = isMissed || isRejected;

    let label = `${isVideo ? 'Video' : 'Audio'} call`;
    if (isRejected) {
      label = `${isVideo ? 'Video' : 'Audio'} call rejected`;
    } else if (isMissed) {
      label = `Missed ${isVideo ? 'video' : 'audio'} call`;
    }

    return {
      label,
      icon: isVideo ? bi.BiVideo : bi.BiPhone,
      toneClass: isDanger
        ? 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30 border-rose-200 dark:border-rose-800'
        : 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800',
    };
  };
  const getGroupActionMeta = (text) => {
    if (!isGroup || typeof text !== 'string') return null;
    const value = text.trim();
    if (!value) return null;

    const patterns = [
      /^Added:/i,
      /^Removed\s/i,
      /^Made\s.+\sadmin$/i,
      /^left the group$/i,
      /^group edited$/i,
      /^Group changed to (private|public)$/i,
      /^Private group password updated$/i,
      /^.+ joined via invite link$/i,
    ];
    if (!patterns.some((regex) => regex.test(value))) return null;

    return {
      label: value,
      icon: bi.BiGroup,
      toneClass:
        'text-slate-700 dark:text-spill-200 bg-white/90 dark:bg-spill-900/70 border-slate-200 dark:border-spill-700',
    };
  };
  const formatSeconds = (sec) => {
    const total = Number.isFinite(sec) ? Math.max(0, Math.floor(sec)) : 0;
    const min = String(Math.floor(total / 60)).padStart(2, '0');
    const s = String(total % 60).padStart(2, '0');
    return `${min}:${s}`;
  };
  const toggleAudio = async (chatId) => {
    const target = audioRefs.current[chatId];
    if (!target) return;

    if (playingAudioId && playingAudioId !== chatId) {
      const current = audioRefs.current[playingAudioId];
      if (current) current.pause();
    }

    if (target.paused) {
      try {
        await target.play();
        setPlayingAudioId(chatId);
      } catch (error0) {
        // eslint-disable-next-line no-console
        console.error(error0.message);
      }
    } else {
      target.pause();
      setPlayingAudioId(null);
    }
  };
  const canJoinImageAlbum = (left, right) => {
    if (!isImageChat(left) || !isImageChat(right)) return false;
    if (left.userId !== right.userId) return false;
    if (left.replyTo || right.replyTo) return false;
    const leftTs = new Date(left.createdAt).getTime();
    const rightTs = new Date(right.createdAt).getTime();
    return Number.isFinite(leftTs) && Number.isFinite(rightTs)
      ? rightTs - leftTs <= 120000
      : false;
  };
  const highlightText = (value, query) => {
    const text = String(value || '');
    const normalized = String(query || '').trim();
    if (!normalized) return text;

    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!escaped) return text;
    const regex = new RegExp(`(${escaped})`, 'ig');
    const parts = text.split(regex);

    return parts.map((part, index) =>
      part.toLowerCase() === normalized.toLowerCase() ? (
        <mark
          key={`${part}-${index}`}
          className="rounded bg-amber-200 px-[1px] text-inherit dark:bg-amber-500/40"
        >
          {part}
        </mark>
      ) : (
        <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>
      )
    );
  };
  const normalizedSearch = String(searchQuery || '')
    .trim()
    .toLowerCase();
  const visibleChats = chats
    ? chats.filter(
        (elem) =>
          !elem.deletedBy.includes(master._id) &&
          !(
            elem?.expiresAt &&
            Number.isFinite(new Date(elem.expiresAt).getTime()) &&
            new Date(elem.expiresAt).getTime() <= nowTs
          )
      )
    : [];
  const displayedChats = normalizedSearch
    ? visibleChats.filter((chat) => {
        const poll = getPollFromChat(chat);
        const eventData = getEventFromChat(chat);
        const groupInfo = getGroupInfoFromChat(chat);
        const haystack = [
          ...(groupInfo
            ? [
                groupInfo.groupName,
                groupInfo.createdBy,
                String(groupInfo.totalParticipants),
              ]
            : []),
          poll ? `Poll ${poll.question}` : chat?.text || '',
          ...(poll ? poll.options.map((option) => option.text) : []),
          ...(eventData
            ? [
                eventData.title,
                eventData.date,
                eventData.time,
                eventData.details,
                eventData.link?.type || '',
                eventData.link?.url || '',
              ]
            : []),
          chat?.profile?.fullname || '',
          chat?.file?.originalname || '',
          chat?.reply?.text || '',
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(normalizedSearch);
      })
    : visibleChats;
  const pinnedIds = new Set((pinsData?.pinned || []).map((item) => item.chatId));
  const openPhotoPreview = (url) => {
    const resolved = resolveUploadUrl(url);
    if (!resolved) return;
    // Open on next frame to avoid same-click close race with backdrop handlers.
    window.requestAnimationFrame(() => {
      dispatch(
        setModal({
          target: 'photoFull',
          data: {
            url: resolved,
            allowDownload: !isSecretChat,
          },
        })
      );
    });
  };
  const openViewOnceMessage = async (chat) => {
    if (!chat?._id || !chat?.viewOnce?.enabled || chat?.viewOnce?.opened) return;

    try {
      const { data } = await axios.post(`/chats/${chat._id}/view-once-open`);
      const payload = data?.payload || null;
      if (!payload) return;

      setChats((prev) =>
        (prev || []).map((item) =>
          item._id === chat._id
            ? {
                ...item,
                viewOnce: {
                  ...(item.viewOnce || {}),
                  opened: true,
                  label: 'Opened',
                },
              }
            : item
        )
      );

      dispatch(
        setModal({
          target: 'photoFull',
          data: {
            kind: payload.viewOnceType,
            url: payload.file?.url ? resolveUploadUrl(payload.file.url) : '',
            text: payload.text || '',
            allowDownload: false,
            viewOnce: true,
          },
        })
      );
    } catch (error0) {
      // eslint-disable-next-line no-alert
      alert(error0?.response?.data?.message || error0.message);
    }
  };
  const scrollToBottom = (behavior = 'smooth') => {
    const monitor = monitorRef.current;
    if (!monitor) return;

    monitor.scrollTo({
      top: monitor.scrollHeight,
      behavior,
    });
  };

  useEffect(() => {
    initialBottomPinRef.current = false;
    setShowScrollBottom(false);
    setOpenVoters({});
    setManualMediaAccess({});
    const currentRoomId = chatRoom?.data?.roomId || null;
    const roomAppearance = getRoomAppearance(currentRoomId);
    setAppearance({
      ...roomAppearance,
      wallpaperPreset:
        setting?.chatWallpaperPreset || roomAppearance.wallpaperPreset,
      wallpaperImage:
        setting?.chatWallpaperPreset === 'custom-image'
          ? setting?.chatWallpaperImage || ''
          : roomAppearance.wallpaperImage,
    });
  }, [
    chatRoom?.data?.roomId,
    setting?.chatWallpaperPreset,
    setting?.chatWallpaperImage,
  ]);

  useEffect(() => {
    const handleViewOnceOpened = ({ chatId, userId }) => {
      if (!chatId) return;
      setChats((prev) =>
        (prev || []).map((item) =>
          item._id === chatId
            ? {
                ...item,
                viewOnce: item.viewOnce
                  ? {
                      ...item.viewOnce,
                      opened:
                        userId === master._id ? true : item.viewOnce.opened,
                      label:
                        userId === master._id
                          ? 'Opened'
                          : item.viewOnce.label,
                    }
                  : item.viewOnce,
              }
            : item
        )
      );
    };

    socket.on('chat/view-once', handleViewOnceOpened);
    return () => {
      socket.off('chat/view-once', handleViewOnceOpened);
    };
  }, [master._id]);

  useEffect(() => {
    const onAppearanceUpdate = (event) => {
      const targetRoomId = event?.detail?.roomId;
      const currentRoomId = chatRoom?.data?.roomId;
      if (!currentRoomId || targetRoomId !== currentRoomId) return;
      const roomAppearance = getRoomAppearance(currentRoomId);
      setAppearance({
        ...roomAppearance,
        wallpaperPreset:
          setting?.chatWallpaperPreset || roomAppearance.wallpaperPreset,
        wallpaperImage:
          setting?.chatWallpaperPreset === 'custom-image'
            ? setting?.chatWallpaperImage || ''
            : roomAppearance.wallpaperImage,
      });
    };
    window.addEventListener(ROOM_APPEARANCE_EVENT, onAppearanceUpdate);
    return () => {
      window.removeEventListener(ROOM_APPEARANCE_EVENT, onAppearanceUpdate);
    };
  }, [chatRoom?.data?.roomId]);

  useEffect(() => {
    const onJump = (event) => {
      const targetChatId = event?.detail?.chatId;
      if (!targetChatId) return;
      jumpToReferencedMessage(targetChatId);
    };
    window.addEventListener('syncchat:jump-to-chat', onJump);
    return () => {
      window.removeEventListener('syncchat:jump-to-chat', onJump);
    };
  }, [selectedChats]);

  const wallpaperStyle = getWallpaperStyle(appearance);

  useEffect(() => {
    displayedChats.forEach((chat) => {
      if (!chat?.file || chat.userId === master?._id) return;
      const settingKey = getAutoDownloadSettingKey(chat.file);
      if (!settingKey || setting?.[settingKey] === false) return;
      const downloadKey = `${chat._id}:${chat.file.url}`;
      if (downloadedMediaRef.current.has(downloadKey)) return;
      downloadedMediaRef.current.add(downloadKey);
      triggerBrowserDownload(chat.file);
    });
  }, [displayedChats, master?._id, setting]);

  useEffect(() => {
    if (!loaded || !displayedChats.length || normalizedSearch) return;
    if (initialBottomPinRef.current) return;

    window.requestAnimationFrame(() => {
      scrollToBottom('auto');
      initialBottomPinRef.current = true;
      setShowScrollBottom(false);
      setNewMessage(0);
    });
  }, [loaded, displayedChats.length, normalizedSearch]);

  return (
    <div
      id="monitor"
      ref={monitorRef}
      aria-hidden
      className={`
        ${
          loaded ? 'scrollbar-thin' : 'scrollbar-none'
        } scrollbar-thumb-slate-400 hover:scrollbar-thumb-slate-500 dark:scrollbar-thumb-spill-600 dark:hover:scrollbar-thumb-spill-500
        select-text relative overflow-y-auto ${
          appearance.wallpaperPreset === 'whatsapp' ? 'whatsapp-wallpaper' : ''
        }
      `}
      style={wallpaperStyle}
      onScroll={handleInfiniteScroll}
      onClick={() => setMessageMenu(null)}
    >
      {!loaded && (
        <div className="absolute w-full h-full z-10 flex justify-center items-center bg-slate-100/90 text-slate-600 dark:bg-spill-900/90 dark:text-spill-300">
          <span className="flex gap-2 items-center">
            <i className="animate-spin">
              <bi.BiLoaderAlt size={18} />
            </i>
            <p>Loading</p>
          </span>
        </div>
      )}
      <div id="monitor-content" className="relative py-4 pb-0 flex flex-col">
        {loadingScroll && (
          <div className="mb-2 flex justify-center">
            <i className="animate-spin">
              <bi.BiLoaderAlt size={32} />
            </i>
          </div>
        )}
        {displayedChats.map((elem, i, arr) => {
          const previous = arr[i - 1];
          const albumContinuation = canJoinImageAlbum(previous, elem);
          if (albumContinuation) return null;

          const albumItems = [elem];
          if (isImageChat(elem)) {
            let cursor = i;
            while (canJoinImageAlbum(arr[cursor], arr[cursor + 1])) {
              cursor += 1;
              albumItems.push(arr[cursor]);
            }
          }
          const hasAlbum = albumItems.length > 1;
          const albumLast = albumItems[albumItems.length - 1];
          const albumLastIndex = i + albumItems.length - 1;
          const nextAfterAlbum = arr[albumLastIndex + 1];
          const lead = elem;
          const pollData = getPollFromChat(lead);
          const isPoll = !!pollData;
          const eventData = getEventFromChat(lead);
          const isEvent = !!eventData;
          const groupInfoData = getGroupInfoFromChat(lead);
          const isGroupInfo = !!groupInfoData;
          const callLogMeta =
            isPoll || isEvent || isGroupInfo
              ? null
              : getCallLogMeta(lead?.text);
          const groupActionMeta =
            isPoll || isEvent || isGroupInfo
              ? null
              : getGroupActionMeta(lead?.text);
          const systemMeta = callLogMeta || groupActionMeta;
          const isSecretSystemLine = !!lead?.profile?.isSecretSystemMessage;
          const isSystemLine = !!systemMeta || isSecretSystemLine;
          const SystemIcon = systemMeta?.icon || bi.BiInfoCircle;
          const leadEdited = !!lead.isEdited || getEditHistoryList(lead).length > 0;

          return (
            <React.Fragment key={elem._id}>
              {
                // chat header: show datetime every new days
                moment(lead.createdAt).date() !==
                  (i > 0 && moment(previous?.createdAt).date()) && (
                  <div className="my-2 flex justify-center">
                    <span className="block py-0.5 px-2 rounded-md bg-white/90 border border-slate-200 shadow-sm dark:bg-spill-800/90 dark:border-spill-700">
                      <p className="text-xs text-slate-600 dark:text-spill-300">
                        {moment(lead.createdAt).format('LL')}
                      </p>
                    </span>
                  </div>
                )
              }
              {isSystemLine && (
                <div className="my-1 flex justify-center">
                  <span
                    id={`chat-msg-${lead._id}`}
                    data-owner-id={lead.userId}
                    className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs shadow-sm ${
                      isSecretSystemLine
                        ? 'border-sky-200 bg-sky-50/95 text-sky-900 dark:border-sky-700/70 dark:bg-sky-900/25 dark:text-sky-100'
                        : systemMeta?.toneClass
                    }`}
                  >
                    {isSecretSystemLine ? <bi.BiShieldQuarter /> : <SystemIcon />}
                    <span>
                      {isSecretSystemLine ? lead.text : systemMeta?.label || lead.text}
                    </span>
                  </span>
                </div>
              )}
              {!isSystemLine && isGroupInfo && (
                <div className="w-full px-3 md:px-5 py-2 flex flex-col items-center gap-3">
                  <div className="max-w-[520px] rounded-xl border border-amber-200/70 bg-amber-100/90 px-3 py-2 text-center text-xs font-medium text-amber-900 shadow-sm dark:border-amber-700/60 dark:bg-amber-900/25 dark:text-amber-200">
                    <span className="inline-flex items-center gap-1">
                      <bi.BiLockAlt />
                      Messages and calls are end-to-end encrypted. Only people
                      in this chat can read, listen to, or share them.
                    </span>
                  </div>
                  <div className="w-full max-w-[420px] rounded-3xl border border-slate-200/70 bg-white/90 p-4 text-center shadow-xl backdrop-blur-sm dark:border-spill-700 dark:bg-spill-900/80">
                    <img
                      src={
                        resolveUploadUrl(chatRoom.data?.group?.avatar) ||
                        'assets/images/default-group-avatar.png'
                      }
                      alt=""
                      className="mx-auto h-20 w-20 rounded-full object-cover border border-slate-200 dark:border-spill-700"
                    />
                    <h3 className="mt-3 text-3xl font-light tracking-tight text-slate-900 dark:text-white">
                      {groupInfoData.createdBy} created this group
                    </h3>
                    <p className="mt-1 text-sm text-slate-600 dark:text-spill-300">
                      {Number(groupInfoData.totalParticipants || 0)} members ·{' '}
                      {Math.max(
                        0,
                        Number(groupInfoData.totalParticipants || 0) - 1
                      )}{' '}
                      contacts · Created{' '}
                      {moment(lead.createdAt).isSame(moment(), 'day')
                        ? 'today'
                        : moment(lead.createdAt).format('ll')}
                    </p>
                    {isCurrentUserGroupAdmin && (
                      <button
                        type="button"
                        className="mt-2 text-sm font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
                        onClick={(e) => {
                          e.stopPropagation();
                          openGroupEditSettings();
                        }}
                      >
                        Edit group setting
                      </button>
                    )}
                    {isCurrentUserGroupAdmin && (
                      <div className="mt-3 grid gap-2">
                        <button
                          type="button"
                          className="h-11 rounded-full border border-emerald-300/60 text-emerald-700 font-semibold hover:bg-emerald-50 dark:border-emerald-700/60 dark:text-emerald-300 dark:hover:bg-emerald-900/20"
                          onClick={(e) => {
                            e.stopPropagation();
                            openGroupAddMembers();
                          }}
                        >
                          <span className="inline-flex items-center gap-2">
                            <bi.BiUserPlus />
                            Add members
                          </span>
                        </button>
                        <button
                          type="button"
                          className="h-11 rounded-full border border-emerald-300/60 text-emerald-700 font-semibold hover:bg-emerald-50 dark:border-emerald-700/60 dark:text-emerald-300 dark:hover:bg-emerald-900/20"
                          onClick={(e) => {
                            e.stopPropagation();
                            openGroupInviteQr();
                          }}
                        >
                          <span className="inline-flex items-center gap-2">
                            <bi.BiLinkAlt />
                            Invite via link or QR code
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {!isSystemLine && !isGroupInfo && (
                <div
                  className={`
                    ${albumLast.userId !== nextAfterAlbum?.userId && 'mb-2'}
                    ${selectedChats ? 'cursor-pointer' : ''}
                    ${
                      selectedChats &&
                      selectedChats.includes(lead._id) &&
                      'bg-spill-200 dark:bg-black/20'
                    }
                    ${
                      lead.userId === master._id
                        ? 'justify-end'
                        : 'justify-start'
                    }
                    w-full py-0.5 px-3 md:px-5 flex gap-2 items-end
                  `}
                  aria-hidden
                  onClick={() => {
                    if (selectedChats) {
                      dispatch(setSelectedChats(lead._id));
                    }
                  }}
                >
                  {selectedChats && (
                    <span
                      className={`${
                        selectedChats.includes(lead._id)
                          ? 'bg-sky-400 dark:bg-sky-600'
                          : 'transparent'
                      } w-6 h-6 flex flex-none justify-center items-center rounded-full border-2 border-solid border-spill-900/60 dark:border-spill-100/60`}
                    >
                      {selectedChats.includes(lead._id) && (
                        <bi.BiCheck size={18} />
                      )}
                    </span>
                  )}
                  <div
                    className={`${
                      lead.userId === master._id
                        ? 'justify-end'
                        : 'justify-start'
                    } flex items-end gap-2 max-w-[92%] sm:max-w-[86%]`}
                  >
                    {lead.userId !== master._id && (
                      <img
                        src={
                          resolveUploadUrl(
                            isGroup
                              ? lead.profile?.avatar
                              : chatRoom.data.profile?.avatar
                          ) ||
                          'assets/images/default-avatar.png'
                        }
                        alt=""
                        className="w-8 h-8 rounded-full object-cover flex-none border border-slate-200 dark:border-spill-700"
                      />
                    )}
                    {/* chat card */}
                    <div
                      id={`chat-msg-${lead._id}`}
                      data-owner-id={lead.userId}
                      className={`
                        ${
                          lead.userId === master._id
                            ? 'rounded-l-xl'
                            : 'rounded-r-xl'
                        }
                        ${
                          lead.userId === previous?.userId &&
                          moment(lead.createdAt).date() ===
                            moment(previous?.createdAt).date() &&
                          'rounded-xl'
                        }
                        relative p-2 rounded-b-xl overflow-hidden
                      `}
                      style={{
                        backgroundColor:
                          lead.userId === master._id
                            ? appearance.sentBubbleBg
                            : appearance.receivedBubbleBg,
                        color: '#0f172a',
                      }}
                      aria-hidden
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        openMessageMenu(e, lead._id);
                      }}
                      onTouchStart={() => {
                        touchAndHoldStart(() =>
                          dispatch(setSelectedChats(lead._id))
                        );
                      }}
                      onTouchMove={() => touchAndHoldEnd()}
                      onTouchEnd={() => touchAndHoldEnd()}
                    >
                      {lead.replyTo && (
                        <div
                          className="relative mb-2 rounded-xl grid grid-cols-[auto_1fr] overflow-hidden bg-slate-100/80 dark:bg-black/20 cursor-pointer hover:brightness-95"
                          aria-hidden
                          onClick={(e) => {
                            e.stopPropagation();
                            jumpToReferencedMessage(lead.replyTo);
                          }}
                        >
                          <span className="block w-1 h-full bg-gradient-to-b from-sky-500 via-cyan-500 to-teal-500"></span>
                          <span className="py-2 px-3">
                            <span className="text-sm">
                              {lead.reply?.fullname || '[inactive]'}
                            </span>
                            <p className="text-sm opacity-60">
                              {lead.reply?.text
                                ? highlightText(lead.reply.text, normalizedSearch)
                                : '[message unavailable]'}
                            </p>
                          </span>
                        </div>
                      )}
                      {lead.file && (
                        <div className="mb-2">
                          {lead.viewOnce?.enabled ? (
                            <button
                              type="button"
                              className="grid w-[220px] sm:w-[280px] gap-2 rounded-2xl border border-slate-200 bg-white/80 px-3 py-3 text-left shadow-sm dark:border-spill-700 dark:bg-spill-900/70"
                              onClick={(e) => {
                                e.stopPropagation();
                                openViewOnceMessage(lead);
                              }}
                            >
                              <span className="flex items-center justify-between">
                                <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-spill-100">
                                  <bi.BiShieldQuarter />
                                  {lead.viewOnce.previewText}
                                </span>
                                <span className="text-xs text-slate-500 dark:text-spill-400">
                                  1-time
                                </span>
                              </span>
                              <div className="rounded-xl bg-slate-200/80 px-3 py-5 text-center text-sm text-slate-600 blur-[2px] dark:bg-spill-700 dark:text-spill-300">
                                {lead.viewOnce.opened ? 'Opened' : 'Tap to open'}
                              </div>
                            </button>
                          ) : !canAutoLoadAttachment(lead) ? (
                            <button
                              type="button"
                              className="grid w-[220px] sm:w-[280px] grid-cols-[auto_1fr_auto] gap-3 rounded-2xl border border-slate-200 bg-white/80 px-3 py-3 text-left shadow-sm dark:border-spill-700 dark:bg-spill-900/70"
                              onClick={(e) => {
                                e.stopPropagation();
                                requestManualAttachmentAccess(lead);
                                if (!isSecretChat) {
                                  triggerBrowserDownload(lead.file);
                                }
                              }}
                            >
                              <i className="self-center text-sky-600 dark:text-sky-400">
                                {lead.file.type === 'image' ? (
                                  <bi.BiImage size={22} />
                                ) : lead.file.type === 'video' ? (
                                  <bi.BiVideo size={22} />
                                ) : isAudioAttachment(lead.file) ? (
                                  <bi.BiMicrophone size={22} />
                                ) : (
                                  <ri.RiFileTextFill size={22} />
                                )}
                              </i>
                              <span className="min-w-0">
                                <p className="truncate text-sm font-medium">
                                  {lead.file.originalname
                                    ? highlightText(
                                        lead.file.originalname,
                                        normalizedSearch
                                      )
                                    : 'Attachment'}
                                </p>
                                <p className="mt-1 text-xs opacity-70">
                                  {isSecretChat
                                    ? 'Tap to view inside secret chat.'
                                    : 'Auto-download is off. Tap to load.'}
                                </p>
                              </span>
                              <i className="self-center text-slate-500 dark:text-spill-300">
                                {isSecretChat ? (
                                  <bi.BiShow size={20} />
                                ) : (
                                  <bi.BiDownload size={20} />
                                )}
                              </i>
                            </button>
                          ) : (
                            <>
                              {hasAlbum && (
                                <div className="grid grid-cols-2 gap-1 w-[220px] sm:w-[260px]">
                                  {albumItems.slice(0, 4).map((imageChat, idx) => (
                                    <button
                                      key={imageChat._id}
                                      type="button"
                                      className={`relative overflow-hidden rounded-lg ${
                                        albumItems.length === 3 && idx === 0
                                          ? 'col-span-2'
                                          : ''
                                      }`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openPhotoPreview(imageChat.file.url);
                                      }}
                                    >
                                      <img
                                        src={resolveUploadUrl(imageChat.file.url)}
                                        alt=""
                                        className="h-[120px] w-full object-cover"
                                      />
                                      {idx === 3 && albumItems.length > 4 && (
                                        <span className="absolute inset-0 bg-black/45 text-white text-xl font-semibold grid place-items-center">
                                          +{albumItems.length - 4}
                                        </span>
                                      )}
                                    </button>
                                  ))}
                                </div>
                              )}
                              {!hasAlbum && lead.file.type === 'image' && (
                                <img
                                  src={resolveUploadUrl(lead.file.url)}
                                  alt=""
                                  className="w-full max-w-[240px] sm:max-w-[280px] max-h-[340px] object-cover rounded-lg cursor-pointer hover:brightness-90"
                                  aria-hidden
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openPhotoPreview(lead.file.url);
                                  }}
                                />
                              )}
                              {lead.file.type === 'video' && (
                                <video
                                  src={resolveUploadUrl(lead.file.url)}
                                  controls
                                  controlsList={
                                    isSecretChat
                                      ? 'nodownload noplaybackrate noremoteplayback'
                                      : undefined
                                  }
                                  disablePictureInPicture={isSecretChat}
                                  className="w-full rounded-lg"
                                  onContextMenu={(e) => {
                                    if (isSecretChat) {
                                      e.preventDefault();
                                      e.stopPropagation();
                                    }
                                  }}
                                >
                                  <track kind="captions" />
                                </video>
                              )}
                              {isAudioAttachment(lead.file) && (
                                <div
                                  className={`${
                                    lead.userId === master._id
                                      ? 'bg-cyan-100/80 dark:bg-cyan-900/30'
                                      : 'bg-slate-100 dark:bg-spill-700'
                                  } w-[220px] sm:w-[260px] rounded-lg px-2 py-2 grid grid-cols-[auto_1fr_auto] gap-2 items-center`}
                                  aria-hidden
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    type="button"
                                    className="w-9 h-9 rounded-full bg-sky-500 text-white grid place-items-center hover:bg-sky-600"
                                    onClick={() => toggleAudio(lead._id)}
                                  >
                                    {playingAudioId === lead._id ? (
                                      <bi.BiPause />
                                    ) : (
                                      <bi.BiPlay />
                                    )}
                                  </button>
                                  <span className="w-full">
                                    <input
                                      type="range"
                                      min={0}
                                      max={Math.max(
                                        1,
                                        Math.floor(audioDuration[lead._id] || 0)
                                      )}
                                      value={Math.floor(
                                        audioProgress[lead._id] || 0
                                      )}
                                      className="w-full accent-sky-500"
                                      onChange={(e) => {
                                        const seekTo = Number(e.target.value || 0);
                                        const audio = audioRefs.current[lead._id];
                                        if (audio) audio.currentTime = seekTo;
                                        setAudioProgress((prev) => ({
                                          ...prev,
                                          [lead._id]: seekTo,
                                        }));
                                      }}
                                    />
                                    <p className="text-[11px] opacity-70">
                                      {formatSeconds(audioProgress[lead._id] || 0)}{' '}
                                      /{' '}
                                      {formatSeconds(audioDuration[lead._id] || 0)}
                                      {Number.isFinite(audioDuration[lead._id]) &&
                                      audioDuration[lead._id] > 0
                                        ? ` (${Math.max(
                                            1,
                                            Math.round(audioDuration[lead._id])
                                          )} sec)`
                                        : ''}
                                    </p>
                                  </span>
                                  <i className="opacity-70">
                                    <bi.BiMicrophone />
                                  </i>
                                  <audio
                                    ref={(el) => {
                                      if (el) {
                                        audioRefs.current[lead._id] = el;
                                      } else {
                                        delete audioRefs.current[lead._id];
                                      }
                                    }}
                                    src={resolveUploadUrl(lead.file.url)}
                                    preload="metadata"
                                    controlsList={
                                      isSecretChat
                                        ? 'nodownload noplaybackrate noremoteplayback'
                                        : undefined
                                    }
                                    onLoadedMetadata={(e) => {
                                      const rawDuration = Number(
                                        e.currentTarget?.duration || 0
                                      );
                                      const duration = Number.isFinite(rawDuration)
                                        ? rawDuration
                                        : 0;
                                      setAudioDuration((prev) => ({
                                        ...prev,
                                        [lead._id]: duration,
                                      }));
                                    }}
                                    onTimeUpdate={(e) => {
                                      const current = Number(
                                        e.currentTarget?.currentTime || 0
                                      );
                                      setAudioProgress((prev) => ({
                                        ...prev,
                                        [lead._id]: current,
                                      }));
                                    }}
                                    onEnded={() => {
                                      setPlayingAudioId((prev) =>
                                        prev === lead._id ? null : prev
                                      );
                                    }}
                                    className="hidden"
                                    onContextMenu={(e) => {
                                      if (isSecretChat) {
                                        e.preventDefault();
                                        e.stopPropagation();
                                      }
                                    }}
                                  >
                                    <track kind="captions" />
                                  </audio>
                                </div>
                              )}
                              {lead.file.type !== 'image' &&
                                lead.file.type !== 'video' &&
                                !isAudioAttachment(lead.file) && (
                                  <span
                                    className={`
                                      ${
                                        lead.userId === master._id
                                          ? 'bg-cyan-100/80 dark:bg-cyan-900/30'
                                          : 'bg-slate-100 dark:bg-spill-700'
                                      }
                                      p-2 grid grid-cols-[auto_1fr_auto] gap-2 rounded-lg
                                    `}
                                  >
                                    <i className="translate-y-0.5">
                                      <ri.RiFileTextFill size={20} />
                                    </i>
                                    <p className="break-all">
                                      {highlightText(
                                        lead.file.originalname,
                                        normalizedSearch
                                      )}
                                    </p>
                                    {!isSecretChat && (
                                      <a
                                        href={resolveUploadUrl(lead.file.url)}
                                        download={lead.file.originalname}
                                        className="block ml-2 translate-y-0.5"
                                      >
                                        <i className="text-slate-700 dark:text-spill-100 hover:text-sky-600 dark:hover:text-sky-400">
                                          <bi.BiDownload size={20} />
                                        </i>
                                      </a>
                                    )}
                                  </span>
                                )}
                            </>
                          )}
                        </div>
                      )}
                      {/* chat body message */}
                      <div className="px-1">
                        {/* profile avatar in group chat */}
                        {isGroup && (
                          <span
                            className="truncate flex items-start cursor-pointer"
                            aria-hidden
                            onClick={() => {
                              if (
                                master._id !== lead.userId &&
                                page.friendProfile !== lead.userId &&
                                !selectedChats
                              ) {
                                dispatch(
                                  setPage({
                                    target: 'friendProfile',
                                    data: lead.userId,
                                  })
                                );
                              }
                            }}
                          >
                            <p className="font-bold truncate text-cyan-700 dark:text-cyan-300">
                              {highlightText(
                                lead.profile?.fullname ?? '[inactive]',
                                normalizedSearch
                              )}
                            </p>
                          </span>
                        )}
                        {!isPoll && !isEvent && !isGroupInfo && !lead.viewOnce?.enabled && (
                          <p
                            className="break-all"
                            aria-hidden
                            onClick={(e) => {
                              if (e.ctrlKey) e.preventDefault();
                            }}
                          >
                            {setting?.disableLinkPreviews ? (
                              <span>{highlightText(lead.text, normalizedSearch)}</span>
                            ) : (
                              <span>
                                {normalizedSearch ? (
                                  highlightText(lead.text, normalizedSearch)
                                ) : (
                                  <Linkify as="span">{lead.text}</Linkify>
                                )}
                              </span>
                            )}
                          </p>
                        )}
                        {lead.viewOnce?.enabled && !lead.file && (
                          <button
                            type="button"
                            className="w-[220px] sm:w-[280px] rounded-2xl border border-slate-200 bg-white/85 px-3 py-3 text-left shadow-sm backdrop-blur-sm dark:border-spill-700 dark:bg-spill-900/60"
                            onClick={(e) => {
                              e.stopPropagation();
                              openViewOnceMessage(lead);
                            }}
                          >
                            <span className="flex items-center justify-between">
                              <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-spill-100">
                                <bi.BiLowVision />
                                Encrypted message
                              </span>
                              <span className="text-xs text-slate-500 dark:text-spill-400">
                                1-time
                              </span>
                            </span>
                            <div className="mt-2 rounded-xl bg-slate-200/80 px-3 py-4 text-sm text-slate-600 blur-[2px] dark:bg-spill-700 dark:text-spill-300">
                              {lead.viewOnce.opened ? 'Opened' : 'Tap to open'}
                            </div>
                          </button>
                        )}
                        {isEvent && (
                          <div className="w-[248px] sm:w-[300px] rounded-2xl border border-slate-200/80 bg-white/85 p-2.5 shadow-sm backdrop-blur-sm dark:border-spill-700 dark:bg-spill-900/55">
                            <span className="mb-2 inline-flex w-fit items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
                              <bi.BiCalendarEvent />
                              Event
                            </span>
                            <div className="grid gap-2 text-sm">
                              <div>
                                <p className="text-[11px] uppercase tracking-wide opacity-70">
                                  Event Title
                                </p>
                                <p className="font-semibold break-all">
                                  {eventData.title}
                                </p>
                              </div>
                              <div>
                                <p className="text-[11px] uppercase tracking-wide opacity-70">
                                  Date and Time
                                </p>
                                <p className="font-medium">
                                  {eventData.date}
                                  {eventData.time ? `, ${eventData.time}` : ''}
                                </p>
                              </div>
                              {eventData.details && (
                                <div>
                                  <p className="text-[11px] uppercase tracking-wide opacity-70">
                                    Details
                                  </p>
                                  <p className="break-all">
                                    {eventData.details}
                                  </p>
                                </div>
                              )}
                              {eventData.link?.url && (
                                <div>
                                  <p className="text-[11px] uppercase tracking-wide opacity-70">
                                    Link
                                  </p>
                                  <a
                                    href={eventData.link.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:brightness-110"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <span>{eventData.link.type}</span>
                                    <ri.RiExternalLinkLine size={14} />
                                  </a>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        {isPoll && (
                          <div className="w-[248px] sm:w-[300px] rounded-2xl border border-slate-200/80 bg-white/75 p-2.5 shadow-sm backdrop-blur-sm dark:border-spill-700 dark:bg-spill-900/40">
                            {(() => {
                              const totalVotes = pollData.options.reduce(
                                (sum, item) => sum + item.votes.length,
                                0
                              );
                              const isClosed = !!pollData.closedAt;
                              const canClose =
                                !isClosed &&
                                (pollData.createdBy === master._id ||
                                  lead.userId === master._id ||
                                  isCurrentUserGroupAdmin);
                              const showVoters = !pollData.anonymous;
                              const modeLabel =
                                pollData.mode === 'quiz' ? 'Quiz' : 'Poll';
                              return (
                                <>
                            <div className="mb-2 flex items-center justify-between">
                              <span className="inline-flex w-fit items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                                <bi.BiBarChartAlt2 />
                                      {modeLabel}
                              </span>
                                    <span className="flex items-center gap-1">
                                      {canClose && (
                                        <button
                                          type="button"
                                          className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-600 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-900/30"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            closePoll(lead._id);
                                          }}
                                        >
                                          Close
                                        </button>
                                      )}
                                      <span className="text-[11px] opacity-75">
                                        {isClosed ? 'Closed' : 'Tap to vote'}
                              </span>
                                    </span>
                            </div>
                                  <div className="mb-1 flex flex-wrap gap-1">
                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide dark:bg-spill-700/70">
                                      {pollData.anonymous
                                        ? 'Anonymous'
                                        : 'Public votes'}
                                    </span>
                                    {pollData.multiSelect && (
                                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide dark:bg-spill-700/70">
                                        Multi select
                                      </span>
                                    )}
                                    {isClosed && (
                                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
                                        Closed
                                      </span>
                                    )}
                                  </div>
                            <p className="mb-2 text-sm font-semibold leading-5">
                              {pollData.question}
                            </p>
                            <div className="grid gap-2">
                              {pollData.options.map((option) => {
                                const voteCount = option.votes.length;
                                const votedByMe = option.votes.some(
                                  (vote) => vote.userId === master._id
                                );
                                const isCorrect =
                                  pollData.mode === 'quiz' &&
                                  pollData.correctOptionIds.includes(option.id);
                                const progress =
                                  totalVotes > 0
                                    ? (voteCount / totalVotes) * 100
                                    : 0;
                                const percent =
                                  totalVotes > 0
                                    ? Math.round((voteCount / totalVotes) * 100)
                                    : 0;

                                return (
                                  <button
                                    key={`${lead._id}-${option.id}`}
                                    type="button"
                                    className={`relative overflow-hidden rounded-xl border px-2.5 py-2 text-left transition hover:brightness-[0.98] ${
                                      votedByMe
                                        ? 'border-emerald-400 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-900/20'
                                        : 'border-slate-200 bg-white dark:border-spill-700 dark:bg-spill-800/70'
                                    }`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (isClosed) return;
                                      voteOnPoll(lead._id, option.id);
                                    }}
                                  >
                                    <span
                                      className="absolute inset-y-0 left-0 bg-emerald-300/25 dark:bg-emerald-600/20"
                                      style={{ width: `${progress}%` }}
                                    ></span>
                                    <span className="relative z-[1] flex items-center justify-between gap-1.5">
                                      <span className="truncate text-sm">
                                        {option.text}
                                      </span>
                                      <span className="flex items-center gap-1 text-[11px] opacity-80">
                                        <span>{voteCount}</span>
                                        <span>({percent}%)</span>
                                        {isCorrect && isClosed && (
                                          <ri.RiShieldCheckLine
                                            className="text-emerald-600 dark:text-emerald-400"
                                            size={14}
                                          />
                                        )}
                                        {votedByMe && (
                                          <ri.RiCheckLine
                                            className="text-emerald-600 dark:text-emerald-400"
                                            size={14}
                                          />
                                        )}
                                      </span>
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                            <p className="mt-2 text-[11px] opacity-70">
                              Total votes:{' '}
                                    {totalVotes}
                            </p>
                                  {showVoters && (
                                    <button
                                      type="button"
                                      className="mt-1 w-fit text-xs font-medium text-sky-700 underline-offset-2 hover:underline dark:text-sky-300"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenVoters((prev) => ({
                                          ...prev,
                                          [lead._id]: !prev[lead._id],
                                        }));
                                      }}
                                    >
                                      {openVoters[lead._id]
                                        ? 'Hide voters'
                                        : 'Show voters'}
                                    </button>
                                  )}
                                  {showVoters && openVoters[lead._id] && (
                              <div className="mt-1 max-h-44 overflow-y-auto rounded-xl border border-slate-200 bg-white/90 p-2 text-xs dark:border-spill-700 dark:bg-spill-900/70">
                                {pollData.options.map((option) => (
                                  <div
                                    key={`voters-${lead._id}-${option.id}`}
                                    className="mb-2 last:mb-0"
                                  >
                                    <p className="font-semibold text-slate-700 dark:text-spill-100">
                                      {option.text}
                                    </p>
                                    <p className="opacity-80 leading-5">
                                      {option.votes.length > 0
                                        ? option.votes
                                            .map((vote) => vote.fullname)
                                            .join(', ')
                                        : 'No votes yet'}
                                    </p>
                                  </div>
                                ))}
                              </div>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        )}
                        {lead.reactions &&
                          Object.keys(lead.reactions).length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {Object.entries(lead.reactions).map(
                                ([userId, emoji]) => (
                                  <span
                                    key={`${lead._id}-${userId}`}
                                    className={`px-1.5 py-0.5 rounded-full text-xs border ${
                                      userId === master._id
                                        ? 'bg-sky-100 border-sky-300 dark:bg-sky-900/40 dark:border-sky-700'
                                        : 'bg-slate-100 border-slate-300 dark:bg-spill-700 dark:border-spill-600'
                                    }`}
                                  >
                                    {emoji}
                                  </span>
                                )
                              )}
                            </div>
                          )}
                        <span className="mt-1 px-1 pb-0.5 flex justify-end gap-1 items-center">
                          {leadEdited && (
                            <span
                              className="rounded-full bg-slate-100 px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-spill-700 dark:text-spill-200"
                              title="Message edited"
                            >
                              edited
                            </span>
                          )}
                          <p className="text-xs opacity-80">
                            {moment(albumLast.createdAt).format('LT')}
                          </p>
                          {lead.userId === master._id && (
                            <i>
                              {(() => {
                                if (albumLast.readed) {
                                  return (
                                    <ri.RiCheckDoubleFill
                                      size={18}
                                      className="text-sky-600 dark:text-sky-400"
                                    />
                                  );
                                }
                                if (albumLast.delivered) {
                                  return (
                                    <ri.RiCheckDoubleFill
                                      size={18}
                                      className="opacity-80"
                                    />
                                  );
                                }
                                return (
                                  <ri.RiCheckFill
                                    size={18}
                                    className="opacity-80"
                                  />
                                );
                              })()}
                            </i>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </React.Fragment>
          );
        })}
        {loaded && normalizedSearch && displayedChats.length === 0 && (
          <div className="my-6 text-center text-sm opacity-70">
            No messages found for &quot;{searchQuery}&quot;
          </div>
        )}
        {messageMenu && menuTarget && !selectedChats && (
          <div
            className="fixed z-50 w-64 rounded-xl border border-slate-200 bg-white/95 p-2 shadow-xl dark:border-spill-700 dark:bg-spill-800/95"
            style={{ left: messageMenu.x, top: messageMenu.y }}
            aria-hidden
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <div className="mb-2 flex items-center justify-between rounded-lg bg-slate-50 px-1 py-1 dark:bg-spill-700/80">
              {quickEmojis.map((emoji) => (
                <button
                  key={`${messageMenu.chatId}-${emoji}`}
                  type="button"
                  className="h-8 w-8 rounded-full text-base hover:bg-slate-200 dark:hover:bg-spill-600"
                  onClick={() => {
                    reactToMessage(messageMenu.chatId, emoji);
                    setMessageMenu(null);
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <div className="grid gap-1">
              <button
                type="button"
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-spill-700"
                onClick={() => {
                  const menuPoll = getPollFromChat(menuTarget);
                  dispatch(
                    setReplyingChat({
                      _id: messageMenu.chatId,
                      text: (() => {
                        const menuEvent = getEventFromChat(menuTarget);
                        const menuGroupInfo = getGroupInfoFromChat(menuTarget);
                        if (menuPoll) return `Poll: ${menuPoll.question}`;
                        if (menuEvent) return `Event: ${menuEvent.title}`;
                        if (menuGroupInfo) {
                          return `Group: ${menuGroupInfo.groupName}`;
                        }
                        return (
                          menuTarget.text ||
                          menuTarget.file?.originalname ||
                          '[attachment]'
                        );
                      })(),
                    })
                  );
                  dispatch(setEditingChat(null));
                  setMessageMenu(null);
                }}
              >
                <bi.BiReply size={18} />
                <span>Reply</span>
              </button>
              {canEditChat(menuTarget) && (
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-spill-700"
                  onClick={() => {
                    dispatch(
                      setEditingChat({
                        _id: messageMenu.chatId,
                        text: menuTarget.text || '',
                        replyTo: menuTarget.replyTo || null,
                      })
                    );
                    setMessageMenu(null);
                  }}
                >
                  <bi.BiEditAlt size={18} />
                  <span>Edit</span>
                </button>
              )}
              {!isSecretChat && (
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-spill-700"
                  onClick={() => {
                    openForwardFor(messageMenu.chatId);
                    setMessageMenu(null);
                  }}
                >
                  <bi.BiShareAlt size={18} />
                  <span>Forward</span>
                </button>
              )}
              <button
                type="button"
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-spill-700"
                onClick={() => {
                  dispatch(setSelectedChats(messageMenu.chatId));
                  setMessageMenu(null);
                }}
              >
                <bi.BiCheckSquare size={18} />
                <span>Select</span>
              </button>
              <button
                type="button"
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-spill-700"
                onClick={async () => {
                  await toggleStarFor(menuTarget);
                  setMessageMenu(null);
                }}
              >
                <bi.BiStar
                  size={18}
                  className={
                    isStarredByMe(menuTarget) ? 'text-amber-500' : undefined
                  }
                />
                <span>
                  {isStarredByMe(menuTarget)
                    ? 'Unstar Message'
                    : 'Star Message'}
                </span>
              </button>
              <button
                type="button"
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-spill-700"
                onClick={async () => {
                  if (pinnedIds.has(messageMenu.chatId)) {
                    await unpinMessage(messageMenu.chatId);
                  } else {
                    await pinMessage(messageMenu.chatId);
                  }
                  setMessageMenu(null);
                }}
              >
                <ri.RiPushpin2Line size={18} />
                <span>
                  {pinnedIds.has(messageMenu.chatId)
                    ? 'Unpin Message'
                    : 'Pin Message'}
                </span>
              </button>
              <button
                type="button"
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-900/20"
                onClick={() => {
                  openDeleteFor(messageMenu.chatId);
                  setMessageMenu(null);
                }}
              >
                <bi.BiTrashAlt size={18} />
                <span>Delete</span>
              </button>
            </div>
          </div>
        )}
        {chats && !isGroup && !chatRoom.data.profile.active && (
          <div className="py-2 px-6 flex justify-center border-0 border-y border-solid border-rose-400 dark:border-rose-200/60 bg-rose-400/10 dark:bg-rose-200/20">
            <div className="w-[560px]">
              <p className="text-rose-900 dark:text-rose-100">
                This account has been deleted by the owner, you no longer have
                access to send messages to this account.
              </p>
            </div>
          </div>
        )}
        {isGroup &&
          !chatRoom.data.group.participantsId.includes(master._id) && (
            <div className="py-2 px-6 flex justify-center border-0 border-y border-solid border-rose-400 dark:border-rose-200/60 bg-rose-400/10 dark:bg-rose-200/20">
              <div className="w-[560px]">
                <p className="text-rose-900 dark:text-rose-100">
                  You cannot access this group because you&#39;re not a
                  participant of this group.
                </p>
              </div>
            </div>
          )}
      </div>
      {(showScrollBottom || newMessage > 0) && (
        <div className="pointer-events-none sticky bottom-3 z-10 ml-auto mr-3 w-fit">
          <button
            type="button"
            className="group pointer-events-auto w-12 h-12 flex justify-center items-center rounded-full bg-white text-slate-700 border border-slate-200 shadow-lg hover:bg-gradient-to-r hover:from-sky-500 hover:via-cyan-500 hover:to-teal-500 hover:text-white dark:bg-spill-800 dark:text-spill-100 dark:border-spill-700 dark:hover:from-sky-600 dark:hover:via-cyan-600 dark:hover:to-teal-600"
            onClick={() => {
              scrollToBottom();
              setTimeout(() => setNewMessage(0), 150);
              setShowScrollBottom(false);
            }}
          >
            {newMessage > 0 && (
              <span className="font-bold absolute top-0 px-2 -translate-y-2/3 rounded-full text-white bg-gradient-to-r from-sky-500 via-cyan-500 to-teal-500">
                {newMessage}
              </span>
            )}
            <i className="group-hover:text-white">
              <bi.BiChevronDown size={28} />
            </i>
          </button>
        </div>
      )}
    </div>
  );
}

export default Monitor;
