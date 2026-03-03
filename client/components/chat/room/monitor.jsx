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
} from '../../../helpers/roomAppearance';

const POLL_PREFIX = '__poll__::';
const EVENT_PREFIX = '__event__::';
const GROUP_INFO_PREFIX = '__group_info__::';
const PINNED_MESSAGE_STORE_KEY = 'syncchat-room-pinned-message-v1';

const getPinnedStore = () => {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(PINNED_MESSAGE_STORE_KEY) || '{}'
    );
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error0) {
    return {};
  }
};

const setPinnedStore = (next) => {
  try {
    window.localStorage.setItem(
      PINNED_MESSAGE_STORE_KEY,
      JSON.stringify(next || {})
    );
  } catch (error0) {
    // ignore storage failure
  }
};

function Monitor({
  newMessage,
  setNewMessage,
  chats,
  setChats,
  control,
  setControl,
  loaded,
  searchQuery,
}) {
  const dispatch = useDispatch();
  const {
    chore: { selectedChats },
    room: { chat: chatRoom },
    user: { master },
    page,
  } = useSelector((state) => state);

  const isGroup = chatRoom.data.roomType === 'group';
  const isScrolled = useRef(false);
  const focusTimerRef = useRef(null);
  const audioRefs = useRef({});
  const monitorRef = useRef(null);
  const initialBottomPinRef = useRef(false);
  const roomIdRef = useRef(null);
  const [loadingScroll, setLoadingScroll] = useState(false);
  const [messageMenu, setMessageMenu] = useState(null);
  const [playingAudioId, setPlayingAudioId] = useState(null);
  const [audioProgress, setAudioProgress] = useState({});
  const [audioDuration, setAudioDuration] = useState({});
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [appearance, setAppearance] = useState(DEFAULT_ROOM_APPEARANCE);
  const [openVoters, setOpenVoters] = useState({});
  const [pinnedChatId, setPinnedChatId] = useState(null);
  const quickEmojis = [
    '\uD83D\uDC4D',
    '\u2764\uFE0F',
    '\uD83D\uDE02',
    '\uD83D\uDE2E',
    '\uD83D\uDE22',
    '\uD83D\uDD25',
  ];

  const openForwardFor = (chatId) => {
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
        question: String(parsed.question).trim(),
        options,
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
    if (
      typeof text !== 'string' ||
      !text.startsWith(GROUP_INFO_PREFIX)
    ) {
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

  const pinMessage = (chatId) => {
    const roomId = chatRoom?.data?.roomId;
    if (!roomId || !chatId) return;
    const store = getPinnedStore();
    store[roomId] = chatId;
    setPinnedStore(store);
    setPinnedChatId(chatId);
  };

  const unpinMessage = () => {
    const roomId = chatRoom?.data?.roomId;
    if (!roomId) return;
    const store = getPinnedStore();
    delete store[roomId];
    setPinnedStore(store);
    setPinnedChatId(null);
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

    return () => {
      socket.off('chat/read');
      socket.off('chat/delivered');
      socket.off('chat/react');
      socket.off('chat/poll-vote');
      socket.off('chat/delete');
    };
  }, []);

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
  const visibleChats = chats
    ? chats.filter((elem) => !elem.deletedBy.includes(master._id))
    : [];
  const normalizedSearch = String(searchQuery || '')
    .trim()
    .toLowerCase();
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
  const openPhotoPreview = (url) => {
    const resolved = resolveUploadUrl(url);
    if (!resolved) return;
    // Open on next frame to avoid same-click close race with backdrop handlers.
    window.requestAnimationFrame(() => {
      dispatch(
        setModal({
          target: 'photoFull',
          data: resolved,
        })
      );
    });
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
    const currentRoomId = chatRoom?.data?.roomId || null;
    if (roomIdRef.current === currentRoomId) return;
    roomIdRef.current = currentRoomId;
    initialBottomPinRef.current = false;
    setShowScrollBottom(false);
    setOpenVoters({});
    setPinnedChatId(
      currentRoomId ? getPinnedStore()[currentRoomId] || null : null
    );
    setAppearance(getRoomAppearance(currentRoomId));
  }, [chatRoom?.data?.roomId]);

  useEffect(() => {
    if (!pinnedChatId || !Array.isArray(chats)) return;
    const exists = chats.some((chat) => chat._id === pinnedChatId);
    if (exists) return;
    unpinMessage();
  }, [pinnedChatId, chats]);

  useEffect(() => {
    const onAppearanceUpdate = (event) => {
      const targetRoomId = event?.detail?.roomId;
      const currentRoomId = chatRoom?.data?.roomId;
      if (!currentRoomId || targetRoomId !== currentRoomId) return;
      setAppearance(getRoomAppearance(currentRoomId));
    };
    window.addEventListener(ROOM_APPEARANCE_EVENT, onAppearanceUpdate);
    return () => {
      window.removeEventListener(ROOM_APPEARANCE_EVENT, onAppearanceUpdate);
    };
  }, [chatRoom?.data?.roomId]);

  const wallpaperStyle = (() => {
    if (
      appearance.wallpaperPreset === 'custom-image' &&
      appearance.wallpaperImage
    ) {
      return {
        backgroundImage: `url(${appearance.wallpaperImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      };
    }
    if (appearance.wallpaperPreset === 'sunset') {
      return {
        backgroundImage:
          'linear-gradient(135deg, rgba(255,203,112,0.22), rgba(255,126,95,0.25), rgba(198,93,201,0.2))',
      };
    }
    if (appearance.wallpaperPreset === 'ocean') {
      return {
        backgroundImage:
          'linear-gradient(135deg, rgba(14,165,233,0.2), rgba(6,182,212,0.2), rgba(45,212,191,0.22))',
      };
    }
    if (appearance.wallpaperPreset === 'forest') {
      return {
        backgroundImage:
          'linear-gradient(135deg, rgba(34,197,94,0.2), rgba(16,185,129,0.2), rgba(132,204,22,0.18))',
      };
    }
    if (appearance.wallpaperPreset === 'plain') {
      return {
        backgroundImage: 'none',
        backgroundColor: '#e2e8f0',
      };
    }
    return {};
  })();

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
        {pinnedChatId && (
          <div className="sticky top-2 z-[8] mx-3 mb-2">
            <div className="w-full rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-left shadow-sm backdrop-blur-sm dark:border-spill-700 dark:bg-spill-800/95">
              <span className="flex items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">
                    <ri.RiPushpin2Line />
                    Pinned Message
                  </span>
                  <p className="truncate text-sm opacity-85">
                    {(() => {
                      const pinned = displayedChats.find(
                        (item) => item._id === pinnedChatId
                      );
                      if (!pinned) return 'Tap to jump';
                      const poll = getPollFromChat(pinned);
                      if (poll) return `Poll: ${poll.question}`;
                      const eventData = getEventFromChat(pinned);
                      if (eventData) return `Event: ${eventData.title}`;
                      const groupInfo = getGroupInfoFromChat(pinned);
                      if (groupInfo) return `Group: ${groupInfo.groupName}`;
                      return (
                        pinned.text ||
                        pinned.file?.originalname ||
                        '[attachment]'
                      );
                    })()}
                  </p>
                </span>
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs hover:bg-slate-100 dark:hover:bg-spill-700"
                    onClick={() => jumpToReferencedMessage(pinnedChatId)}
                  >
                    <span>Open</span>
                    <bi.BiChevronRight />
                  </button>
                  <button
                    type="button"
                    className="rounded-full p-1.5 hover:bg-slate-100 dark:hover:bg-spill-700"
                    onClick={(e) => {
                      e.stopPropagation();
                      unpinMessage();
                    }}
                    title="Unpin"
                  >
                    <bi.BiX />
                  </button>
                </span>
              </span>
            </div>
          </div>
        )}
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
            isPoll || isEvent || isGroupInfo ? null : getCallLogMeta(lead?.text);
          const groupActionMeta =
            isPoll || isEvent || isGroupInfo ? null : getGroupActionMeta(lead?.text);
          const systemMeta = callLogMeta || groupActionMeta;
          const isSystemLine = !!systemMeta;
          const SystemIcon = systemMeta?.icon || bi.BiInfoCircle;

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
                    className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs shadow-sm ${systemMeta?.toneClass}`}
                  >
                    <SystemIcon />
                    <span>{systemMeta?.label || lead.text}</span>
                  </span>
                </div>
              )}
              {!isSystemLine && (
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
                          ) || 'assets/images/default-avatar.png'
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
                              {lead.reply?.text || '[message unavailable]'}
                            </p>
                          </span>
                        </div>
                      )}
                      {lead.file && (
                        <div className="mb-2">
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
                              className="w-full rounded-lg"
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
                                  {lead.file.originalname}
                                </p>
                                <a
                                  href={resolveUploadUrl(lead.file.url)}
                                  download={lead.file.originalname}
                                  className="block ml-2 translate-y-0.5"
                                >
                                  <i className="text-slate-700 dark:text-spill-100 hover:text-sky-600 dark:hover:text-sky-400">
                                    <bi.BiDownload size={20} />
                                  </i>
                                </a>
                              </span>
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
                              {lead.profile?.fullname ?? '[inactive]'}
                            </p>
                          </span>
                        )}
                        {!isPoll && !isEvent && !isGroupInfo && (
                          <p
                            className="break-all"
                            aria-hidden
                            onClick={(e) => {
                              if (e.ctrlKey) e.preventDefault();
                            }}
                          >
                            <Linkify as="span">{lead.text}</Linkify>
                            <span
                              className={`${
                                lead.userId === master._id && 'mr-5'
                              } invisible text-xs ml-1`}
                            >
                              {moment(albumLast.createdAt).format('LT')}
                            </span>
                          </p>
                        )}
                        {isGroupInfo && (
                          <div className="w-[248px] sm:w-[300px] rounded-2xl border border-slate-200/80 bg-white/85 p-2.5 shadow-sm backdrop-blur-sm dark:border-spill-700 dark:bg-spill-900/55">
                            <span className="mb-2 inline-flex w-fit items-center gap-1 rounded-full bg-cyan-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300">
                              <span>{groupInfoData.icon}</span>
                              Group Created
                            </span>
                            <div className="grid gap-2 text-sm">
                              <div>
                                <p className="text-[11px] uppercase tracking-wide opacity-70">
                                  Group Name
                                </p>
                                <p className="font-semibold break-all">
                                  {groupInfoData.groupName}
                                </p>
                              </div>
                              <div>
                                <p className="text-[11px] uppercase tracking-wide opacity-70">
                                  Created By
                                </p>
                                <p className="font-medium break-all">
                                  {groupInfoData.createdBy}
                                </p>
                              </div>
                              <div>
                                <p className="text-[11px] uppercase tracking-wide opacity-70">
                                  Total Participants
                                </p>
                                <p className="font-medium">
                                  {groupInfoData.totalParticipants}
                                </p>
                              </div>
                              <div>
                                <p className="text-[11px] uppercase tracking-wide opacity-70">
                                  Privacy
                                </p>
                                <p className="font-medium capitalize flex items-center gap-1">
                                  {groupInfoData.accessType === 'private' ? (
                                    <bi.BiLockAlt className="text-amber-600 dark:text-amber-400" />
                                  ) : (
                                    <bi.BiLockOpenAlt className="text-emerald-600 dark:text-emerald-400" />
                                  )}
                                  {groupInfoData.accessType}
                                </p>
                              </div>
                            </div>
                          </div>
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
                            <div className="mb-2 flex items-center justify-between">
                              <span className="inline-flex w-fit items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                                <bi.BiBarChartAlt2 />
                                Poll
                              </span>
                              <span className="text-[11px] opacity-75">
                                Tap to vote
                              </span>
                            </div>
                            <p className="mb-2 text-sm font-semibold leading-5">
                              {pollData.question}
                            </p>
                            <div className="grid gap-2">
                              {pollData.options.map((option) => {
                                const voteCount = option.votes.length;
                                const totalVotes = pollData.options.reduce(
                                  (sum, item) => sum + item.votes.length,
                                  0
                                );
                                const votedByMe = option.votes.some(
                                  (vote) => vote.userId === master._id
                                );
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
                              {pollData.options.reduce(
                                (sum, item) => sum + item.votes.length,
                                0
                              )}
                            </p>
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
                            {openVoters[lead._id] && (
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
                        <span className="p-2 absolute bottom-0 right-0 flex gap-0.5 items-center">
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
                  setMessageMenu(null);
                }}
              >
                <bi.BiReply size={18} />
                <span>Reply</span>
              </button>
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
                onClick={() => {
                  if (pinnedChatId === messageMenu.chatId) {
                    unpinMessage();
                  } else {
                    pinMessage(messageMenu.chatId);
                  }
                  setMessageMenu(null);
                }}
              >
                <ri.RiPushpin2Line size={18} />
                <span>
                  {pinnedChatId === messageMenu.chatId
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
