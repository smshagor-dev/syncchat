import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useDispatch, useSelector } from 'react-redux';
import moment from 'moment';
import * as ri from 'react-icons/ri';
import * as bi from 'react-icons/bi';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import socket from '../../../helpers/socket';
import { setChatRoom } from '../../../redux/features/room';
import InboxMenu from '../../modals/inboxMenu';
import { setModal } from '../../../redux/features/modal';
import { setPage } from '../../../redux/features/page';
import { setRefreshInbox } from '../../../redux/features/chore';
import { setSelectedInboxes } from '../../../redux/features/chore';
import resolveUploadUrl from '../../../helpers/resolveUploadUrl';
import { getPresenceMeta } from '../../../helpers/presence';

import {
  touchAndHoldStart,
  touchAndHoldEnd,
} from '../../../helpers/touchAndHold';
import notification from '../../../helpers/notification';

const EVENT_PREFIX = '__event__::';
const POLL_PREFIX = '__poll__::';

function Inbox({ inboxes, setInboxes, chatFilter = 'all' }) {
  const dispatch = useDispatch();
  const {
    user: { master, setting },
    room: { chat: chatRoom },
    chore: { selectedInboxes, refreshInbox },
    modal,
    page,
  } = useSelector((state) => state);
  const [callLogs, setCallLogs] = React.useState([]);
  const [callLogsLoading, setCallLogsLoading] = React.useState(false);
  const [starredMessages, setStarredMessages] = React.useState([]);
  const [starredLoading, setStarredLoading] = React.useState(false);
  const [unlockDialog, setUnlockDialog] = React.useState({
    open: false,
    mode: 'group',
    inbox: null,
    password: '',
    error: '',
    loading: false,
  });
  const [lockChatDialog, setLockChatDialog] = React.useState({
    password: '',
    oldPassword: '',
    newPassword: '',
    loading: false,
    error: '',
  });
  const [privacyShieldVisible, setPrivacyShieldVisible] = React.useState(false);
  const [statuses, setStatuses] = React.useState([]);
  const [statusLoaded, setStatusLoaded] = React.useState(false);
  const [statusViewer, setStatusViewer] = React.useState({
    open: false,
    userId: null,
    index: 0,
  });
  const [statusReplyText, setStatusReplyText] = React.useState('');
  const [statusReactionPulse, setStatusReactionPulse] = React.useState('');
  const [statusReactionBursts, setStatusReactionBursts] = React.useState([]);
  const [statusActivity, setStatusActivity] = React.useState({
    open: false,
    loading: false,
    statusId: null,
    counts: { views: 0, reactions: 0, replies: 0 },
    views: [],
    reactions: [],
    replies: [],
  });
  const unlockResolverRef = React.useRef(null);
  const applyEntityRoomPatch = React.useCallback(
    (payload, target = 'group') => {
      if (!payload?.roomId) return;

      setInboxes((prev) =>
        prev.map((elem) => {
          if (elem.roomType !== 'group' || elem.roomId !== payload.roomId) {
            return elem;
          }

          if (target === 'channel') {
            return {
              ...elem,
              channel: {
                ...(elem.channel || {}),
                ...payload,
              },
              group: {
                ...(elem.group || {}),
                ...payload,
              },
            };
          }

          return {
            ...elem,
            group: {
              ...(elem.group || {}),
              ...payload,
            },
          };
        })
      );

      if (
        chatRoom?.data?.roomType === 'group' &&
        chatRoom?.data?.roomId === payload.roomId
      ) {
        dispatch(
          setChatRoom({
            ...chatRoom,
            data: {
              ...chatRoom.data,
              group: {
                ...(chatRoom.data.group || {}),
                ...payload,
              },
              channel:
                target === 'channel' || chatRoom.data.channel
                  ? {
                      ...(chatRoom.data.channel || {}),
                      ...payload,
                    }
                  : chatRoom.data.channel,
            },
          })
        );
      }
    },
    [chatRoom, dispatch, setInboxes]
  );
  const getInboxDisplayTitle = (inbox) => {
    if (inbox?.roomType === 'group') {
      return inbox?.channel?.name || inbox?.group?.name || 'Group';
    }
    return (
      inbox?.owners?.find((owner) => owner.userId !== master?._id)?.fullname ||
      '[inactive]'
    );
  };

  const openMenuForInbox = ({ elem, x, y }) => {
    const inbox = document.querySelector('#inbox');
    if (!inbox) return;
    const bounds = inbox.getBoundingClientRect();

    const menuWidth = Math.min(224, Math.max(160, inbox.clientWidth - 16));
    const menuHeight = 360;
    const margin = 8;

    const minX = margin;
    const maxX = Math.max(margin, inbox.clientWidth - menuWidth - margin);
    const minY = margin;
    const maxY = Math.max(margin, inbox.clientHeight - menuHeight - margin);

    const desiredX = x + 6;
    const desiredY = y + 8;

    const menuX = Math.max(minX, Math.min(desiredX, maxX));
    const menuY =
      desiredY > maxY
        ? Math.max(minY, y - menuHeight - 8)
        : Math.max(minY, Math.min(desiredY, maxY));

    dispatch(
      setModal({
        target: 'inboxMenu',
        data: {
          inbox: elem,
          x: bounds.left + menuX,
          y: bounds.top + menuY,
          width: menuWidth,
        },
      })
    );
  };
  const handleContextMenu = (e, elem) => {
    const inbox = document.querySelector('#inbox');
    const bounds = inbox?.getBoundingClientRect();
    const localX = bounds ? e.clientX - bounds.left : e.clientX;
    const localY = bounds ? e.clientY - bounds.top : e.clientY;

    openMenuForInbox({
      elem,
      x: localX,
      y: localY,
    });
  };
  const isAudioFile = (file) => {
    if (!file) return false;
    if (file.type === 'audio') return true;

    const ext = String(file.format || file.originalname || '')
      .split('.')
      .pop()
      .toLowerCase();
    return ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'webm'].includes(ext);
  };
  const getCallStatusMeta = (text) => {
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

    const icon = isVideo ? bi.BiVideo : bi.BiPhone;
    let label = `${isVideo ? 'Video' : 'Audio'} call`;
    if (isRejected) {
      label = `${isVideo ? 'Video' : 'Audio'} call rejected`;
    } else if (isMissed) {
      label = `Missed ${isVideo ? 'video' : 'audio'} call`;
    }

    return {
      label,
      icon,
      toneClass: isDanger
        ? 'text-rose-600 dark:text-rose-400'
        : 'text-emerald-600 dark:text-emerald-400',
    };
  };
  const getCallListMeta = (text, fromUserId) => {
    const base = getCallStatusMeta(text);
    if (!base) return null;

    const lower = String(text || '').toLowerCase();
    const isRejected =
      lower.includes('reject') ||
      lower.includes('rejected') ||
      lower.includes('decline') ||
      lower.includes('declined');
    const isMissed = lower.includes('missed');
    const isOutgoing = fromUserId === master?._id;

    let statusLabel = 'Incoming';
    let statusTone = 'text-emerald-600 dark:text-emerald-400';

    if (isRejected) {
      statusLabel = 'Rejected';
      statusTone = 'text-rose-600 dark:text-rose-400';
    } else if (isMissed) {
      statusLabel = 'Missed';
      statusTone = 'text-rose-600 dark:text-rose-400';
    } else if (isOutgoing) {
      statusLabel = 'Outgoing';
      statusTone = 'text-sky-600 dark:text-sky-400';
    }

    return {
      ...base,
      statusLabel,
      statusTone,
    };
  };
  const isEventMessage = (text) => {
    if (typeof text !== 'string' || !text.startsWith(EVENT_PREFIX)) {
      return false;
    }
    try {
      const parsed = JSON.parse(text.slice(EVENT_PREFIX.length));
      return !!(
        String(parsed?.title || '').trim() && String(parsed?.date || '').trim()
      );
    } catch (error0) {
      return false;
    }
  };
  const isPollMessage = (text) => {
    if (typeof text !== 'string') return false;
    if (text.startsWith(POLL_PREFIX)) {
      try {
        const parsed = JSON.parse(text.slice(POLL_PREFIX.length));
        return !!(
          String(parsed?.question || '').trim() &&
          Array.isArray(parsed?.options) &&
          parsed.options.length >= 2
        );
      } catch (error0) {
        return false;
      }
    }
    return /^poll\s*:/i.test(text.trim()) || /^poll$/i.test(text.trim());
  };

  const showStatusRail =
    !page.calls &&
    !page.starred &&
    !page.contact &&
    !page.setting &&
    !page.status &&
    !page.communities &&
    !page.media &&
    !page.policy &&
    !page.profile &&
    !page.selectParticipant;

  const loadStatuses = React.useCallback(
    async (signal) => {
      try {
        const { data } = await axios.get('/statuses', { signal });
        setStatuses(data.payload || []);
      } catch (error0) {
        if (error0.name !== 'CanceledError' && error0.name !== 'AbortError') {
          console.error(error0?.response?.data?.message || error0.message);
        }
      } finally {
        setStatusLoaded(true);
      }
    },
    [setStatuses]
  );

  useEffect(() => {
    if (!showStatusRail) return undefined;
    const abortCtrl = new AbortController();
    setStatusLoaded(false);
    loadStatuses(abortCtrl.signal);
    return () => abortCtrl.abort();
  }, [showStatusRail, refreshInbox, loadStatuses]);

  const statusGroups = React.useMemo(() => {
    const map = new Map();
    statuses.forEach((item) => {
      if (!item?.profile || !item?.userId) return;
      const group = map.get(item.userId) || {
        userId: item.userId,
        profile: item.profile,
        items: [],
      };
      group.items.push(item);
      map.set(item.userId, group);
    });

    const list = [...map.values()];
    list.forEach((group) => {
      group.items.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    });

    list.sort((a, b) => {
      const aTime = new Date(a.items[0]?.createdAt || 0).getTime();
      const bTime = new Date(b.items[0]?.createdAt || 0).getTime();
      return bTime - aTime;
    });

    return list;
  }, [statuses]);

  const myStatusGroup =
    statusGroups.find((group) => group.userId === master?._id) || null;
  const friendStatusGroups = statusGroups.filter(
    (group) => group.userId !== master?._id
  );

  const viewingStatusGroup =
    statusGroups.find((group) => group.userId === statusViewer.userId) || null;
  const viewingStatusItems = viewingStatusGroup?.items || [];
  const viewingStatusItem = viewingStatusItems[statusViewer.index] || null;

  const openStatusViewer = (userId, index = 0) => {
    setStatusReplyText('');
    setStatusActivity((prev) => ({ ...prev, open: false }));
    setStatusViewer({ open: true, userId, index });
  };

  const closeStatusViewer = () => {
    setStatusReplyText('');
    setStatusViewer({ open: false, userId: null, index: 0 });
  };

  const stepStatusViewer = (next) => {
    if (!viewingStatusItems.length) return;
    const max = viewingStatusItems.length - 1;
    const index = Math.max(0, Math.min(max, statusViewer.index + next));
    setStatusViewer((prev) => ({ ...prev, index }));
  };

  useEffect(() => {
    if (!statusViewer.open || !viewingStatusItem) return undefined;
    if (viewingStatusItem.type === 'video') return undefined;

    const timer = setTimeout(() => {
      if (statusViewer.index >= viewingStatusItems.length - 1) {
        closeStatusViewer();
      } else {
        stepStatusViewer(1);
      }
    }, 5000);

    return () => clearTimeout(timer);
  }, [
    statusViewer.open,
    statusViewer.index,
    viewingStatusItem,
    viewingStatusItems.length,
  ]);

  useEffect(() => {
    if (!statusViewer.open || !viewingStatusItem || viewingStatusItem.isMine) return;

    const markViewed = async () => {
      try {
        await axios.post(`/statuses/${viewingStatusItem._id}/view`);
        setStatuses((prev) =>
          prev.map((item) =>
            item._id === viewingStatusItem._id
              ? {
                  ...item,
                  hasViewed: true,
                  viewCount: Number(item.viewCount || 0) + (item.hasViewed ? 0 : 1),
                }
              : item
          )
        );
      } catch (error0) {
        console.error(error0?.response?.data?.message || error0.message);
      }
    };

    markViewed();
  }, [statusViewer.open, viewingStatusItem?._id]);

  useEffect(() => {
    const handleStatusUpdate = (payload) => {
      if (!payload?.statusId) return;
      setStatuses((prev) =>
        prev.map((item) => {
          if (item._id !== payload.statusId) return item;

          const nextItem = { ...item };
          if (typeof payload.reactionCount === 'number') {
            nextItem.reactionCount = payload.reactionCount;
          }
          if (typeof payload.replyCount === 'number') {
            nextItem.replyCount = payload.replyCount;
          }
          if (
            payload.type === 'react' &&
            payload.actorId === master?._id &&
            Object.prototype.hasOwnProperty.call(payload, 'myReaction')
          ) {
            nextItem.myReaction = payload.myReaction;
          }
          return nextItem;
        })
      );
    };

    const handleStatusNew = (payload) => {
      if (!payload?._id) return;
      setStatuses((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        if (list.some((item) => item._id === payload._id)) return list;
        return [payload, ...list];
      });
      setStatusLoaded(true);
    };

    socket.on('status/update', handleStatusUpdate);
    socket.on('status/new', handleStatusNew);
    return () => {
      socket.off('status/update', handleStatusUpdate);
      socket.off('status/new', handleStatusNew);
    };
  }, [master?._id]);

  const sendStatusReaction = async (emoji) => {
    if (!viewingStatusItem || viewingStatusItem.isMine) return;
    const burstId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const burstDuration = 900 + Math.floor(Math.random() * 500);
    const burstLeft = 42 + Math.random() * 16;
    const burstDrift = -10 + Math.random() * 20;
    setStatusReactionBursts((prev) => [
      ...prev,
      {
        id: burstId,
        emoji,
        left: burstLeft,
        drift: burstDrift,
        duration: burstDuration,
      },
    ]);
    setTimeout(() => {
      setStatusReactionBursts((prev) =>
        prev.filter((item) => item.id !== burstId)
      );
    }, burstDuration + 120);

    setStatusReactionPulse(emoji);
    setTimeout(() => {
      setStatusReactionPulse('');
    }, 220);
    try {
      const { data } = await axios.post(`/statuses/${viewingStatusItem._id}/react`, {
        emoji,
      });
      setStatuses((prev) =>
        prev.map((item) =>
          item._id === viewingStatusItem._id
            ? {
                ...item,
                reactionCount:
                  typeof data?.payload?.reactionCount === 'number'
                    ? data.payload.reactionCount
                    : item.reactionCount,
              }
            : item
        )
      );
    } catch (error0) {
      console.error(error0?.response?.data?.message || error0.message);
    }
  };

  const sendStatusReply = async () => {
    if (!viewingStatusItem || viewingStatusItem.isMine) return;
    const text = String(statusReplyText || '').trim();
    if (!text) return;
    try {
      const { data } = await axios.post(`/statuses/${viewingStatusItem._id}/reply`, {
        text,
      });
      setStatusReplyText('');
      setStatuses((prev) =>
        prev.map((item) =>
          item._id === viewingStatusItem._id
            ? {
                ...item,
                replyCount:
                  typeof data?.payload?.replyCount === 'number'
                    ? data.payload.replyCount
                    : Number(item.replyCount || 0) + 1,
              }
            : item
        )
      );
    } catch (error0) {
      console.error(error0?.response?.data?.message || error0.message);
    }
  };

  const openStatusActivity = async () => {
    if (!viewingStatusItem?.isMine) return;
    try {
      setStatusActivity((prev) => ({
        ...prev,
        open: true,
        loading: true,
        statusId: viewingStatusItem._id,
      }));
      const { data } = await axios.get(`/statuses/${viewingStatusItem._id}/activity`);
      setStatusActivity({
        open: true,
        loading: false,
        statusId: viewingStatusItem._id,
        counts: data?.payload?.counts || { views: 0, reactions: 0, replies: 0 },
        views: data?.payload?.views || [],
        reactions: data?.payload?.reactions || [],
        replies: data?.payload?.replies || [],
      });
    } catch (error0) {
      setStatusActivity((prev) => ({ ...prev, loading: false }));
      console.error(error0?.response?.data?.message || error0.message);
    }
  };

  const statusActivityRows = React.useMemo(() => {
    const rowMap = new Map();

    const ensureRow = (userId, profile) => {
      const key = userId || 'unknown';
      const prev = rowMap.get(key) || {
        userId: key,
        profile: profile || null,
        viewedAt: null,
        reactions: [],
        replies: [],
      };
      if (!prev.profile && profile) prev.profile = profile;
      rowMap.set(key, prev);
      return prev;
    };

    (statusActivity.views || []).forEach((entry) => {
      const row = ensureRow(entry.userId, entry.profile);
      row.viewedAt = entry.viewedAt || entry.createdAt || row.viewedAt;
    });

    (statusActivity.reactions || []).forEach((entry) => {
      const row = ensureRow(entry.userId, entry.profile);
      row.reactions.push({
        emoji: entry.emoji,
        createdAt: entry.createdAt,
      });
    });

    (statusActivity.replies || []).forEach((entry) => {
      const row = ensureRow(entry.userId, entry.profile);
      row.replies.push({
        text: entry.text,
        createdAt: entry.createdAt,
      });
    });

    return [...rowMap.values()].sort(
      (a, b) =>
        new Date(
          b.viewedAt ||
            b.reactions[0]?.createdAt ||
            b.replies[0]?.createdAt ||
            0
        ).getTime() -
        new Date(
          a.viewedAt ||
            a.reactions[0]?.createdAt ||
            a.replies[0]?.createdAt ||
            0
        ).getTime()
    );
  }, [statusActivity.views, statusActivity.reactions, statusActivity.replies]);

  const openInboxRoom = async (elem) => {
    const chatUnlocked = await verifyPrivateChatLockAccess(elem);
    if (!chatUnlocked) return false;
    const groupUnlocked = await verifyPrivateGroupAccess(elem);
    if (!groupUnlocked) return false;
    if (chatRoom.data?.roomId === elem.roomId) return true;

    if (elem.roomType === 'private') {
      const profile = elem.owners.find((x) => x.userId !== master._id);

      dispatch(
        setChatRoom({
          isOpen: true,
          refreshId: elem.roomId,
          data: {
            ...elem,
            profile: !profile
              ? {
                  avatar: 'assets/images/default-avatar.png',
                  fullname: '[inactive]',
                  updatedAt: new Date().toISOString(),
                  active: false,
                }
              : {
                  ...profile,
                  active: true,
                },
          },
        })
      );
      return true;
    }

    dispatch(
      setChatRoom({
        isOpen: true,
        refreshId: elem.roomId,
        data: {
          ...elem,
          group: elem.channel || elem.group || elem.group,
          channel: elem.channel || null,
        },
      })
    );

    return true;
  };

  const mergeActiveRoomFromInbox = React.useCallback(
    (payload) => {
      if (!payload?.roomId || chatRoom?.data?.roomId !== payload.roomId) return;

      if (payload.roomType === 'private') {
        const profile =
          payload.owners?.find((x) => x.userId !== master?._id) || null;

        dispatch(
          setChatRoom({
            ...chatRoom,
            data: {
              ...chatRoom.data,
              ...payload,
              secretSessionId:
                payload.secretSessionId || chatRoom.data?.secretSessionId || '',
              profile: !profile
                ? {
                    avatar: 'assets/images/default-avatar.png',
                    fullname: '[inactive]',
                    updatedAt: new Date().toISOString(),
                    active: false,
                  }
                : {
                    ...profile,
                    active: true,
                  },
            },
          })
        );
        return;
      }

      dispatch(
        setChatRoom({
          ...chatRoom,
          data: {
            ...chatRoom.data,
            ...payload,
            group: payload.channel || payload.group || chatRoom.data.group,
            channel: payload.channel || chatRoom.data.channel || null,
          },
        })
      );
    },
    [chatRoom, dispatch, master?._id]
  );

  const isFavouriteInbox = (inbox) =>
    !!(
      inbox?.isFavourite ||
      inbox?.isFavorite ||
      inbox?.favourite ||
      inbox?.favorite ||
      (Array.isArray(inbox?.favouriteBy) &&
        inbox.favouriteBy.includes(master?._id)) ||
      (Array.isArray(inbox?.favoriteBy) &&
        inbox.favoriteBy.includes(master?._id))
    );
  const isArchivedInbox = (inbox) =>
    Array.isArray(inbox?.archivedBy) && inbox.archivedBy.includes(master?._id);
  const isListedInbox = (inbox) =>
    Array.isArray(inbox?.listedBy) && inbox.listedBy.includes(master?._id);
  const isHiddenInbox = (inbox) =>
    Array.isArray(inbox?.hiddenBy) && inbox.hiddenBy.includes(master?._id);
  const isPinnedInbox = (inbox) =>
    Array.isArray(inbox?.pinnedBy) && inbox.pinnedBy.includes(master?._id);
  const isManuallyUnreadInbox = (inbox) =>
    Array.isArray(inbox?.markUnreadBy) &&
    inbox.markUnreadBy.includes(master?._id);
  const isMutedInbox = (inbox) =>
    Array.isArray(inbox?.mutedBy) && inbox.mutedBy.includes(master?._id);
  const isAdvancedPrivacyEnabled = (inbox) =>
    Array.isArray(inbox?.privacyShieldBy) &&
    inbox.privacyShieldBy.includes(master?._id);
  const getInboxTone = (inbox) =>
    inbox?.notificationToneBy?.[master?._id] || 'default-ringtone';
  const isPrivateChatLocked = (inbox) =>
    inbox?.roomType === 'private' &&
    Array.isArray(inbox?.chatLockBy) &&
    inbox.chatLockBy.includes(master?._id);
  const isPrivateLockedGroup = (inbox) => {
    if (inbox?.roomType !== 'group') return false;
    const accessType = inbox?.channel?.accessType || inbox?.group?.accessType;
    const requiresPassword =
      inbox?.channel?.requiresPassword || inbox?.group?.requiresPassword;
    return accessType === 'private' || !!requiresPassword;
  };

  const playTone = (toneKey) => {
    if (toneKey === 'default-ringtone') {
      const audio = new Audio('assets/sound/default-ringtone.mp3');
      audio.volume = 1;
      audio.play().catch(() => {});
      return;
    }

    const tonePatterns = {
      'classic-bell': [880, 660],
      'digital-pop': [740, 920, 740],
      'soft-chime': [520, 660, 780],
    };
    const sequence = tonePatterns[toneKey] || tonePatterns['soft-chime'];
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    sequence.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(ctx.destination);

      const start = ctx.currentTime + index * 0.17;
      const end = start + 0.12;
      gain.gain.exponentialRampToValueAtTime(0.16, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.start(start);
      osc.stop(end + 0.02);
    });
  };

  const closeUnlockDialog = (result = false) => {
    if (unlockResolverRef.current) {
      unlockResolverRef.current(result);
      unlockResolverRef.current = null;
    }
    setUnlockDialog({
      open: false,
      mode: 'group',
      inbox: null,
      password: '',
      error: '',
      loading: false,
    });
  };

  const requestUnlockDialog = (inbox, mode = 'group') =>
    new Promise((resolve) => {
      unlockResolverRef.current = resolve;
      setUnlockDialog({
        open: true,
        mode,
        inbox,
        password: '',
        error: '',
        loading: false,
      });
    });

  const closeLockChatDialog = () => {
    setLockChatDialog({
      password: '',
      oldPassword: '',
      newPassword: '',
      loading: false,
      error: '',
    });
    dispatch(setModal({ target: 'lockChat', data: false }));
  };

  const submitLockChatDialog = async () => {
    try {
      const lockState = modal.lockChat;
      if (!lockState?.inbox?.roomId) return;

      setLockChatDialog((prev) => ({
        ...prev,
        loading: true,
        error: '',
      }));

      if (lockState.type === 'lock') {
        if (String(lockChatDialog.password || '').length < 4) {
          throw new Error('Password must be at least 4 characters');
        }
        await axios.patch(`/inboxes/${lockState.inbox.roomId}/preferences`, {
          action: 'chatLock',
          value: { password: lockChatDialog.password },
        });
      } else {
        if (String(lockChatDialog.newPassword || '').length < 4) {
          throw new Error('New password must be at least 4 characters');
        }
        await axios.patch(`/inboxes/${lockState.inbox.roomId}/preferences`, {
          action: 'chatLockPassword',
          value: {
            oldPassword: lockChatDialog.oldPassword,
            newPassword: lockChatDialog.newPassword,
          },
        });
      }

      dispatch(setRefreshInbox(uuidv4()));
      closeLockChatDialog();
    } catch (error0) {
      setLockChatDialog((prev) => ({
        ...prev,
        loading: false,
        error: error0?.response?.data?.message || error0.message,
      }));
    }
  };

  const submitUnlockDialog = async () => {
    try {
      const targetInbox = unlockDialog.inbox;
      if (!targetInbox?.roomId) return;
      if (String(unlockDialog.password || '').length < 1) {
        setUnlockDialog((prev) => ({
          ...prev,
          error: 'Password is required',
        }));
        return;
      }

      setUnlockDialog((prev) => ({
        ...prev,
        loading: true,
        error: '',
      }));

      if (unlockDialog.mode === 'private-chat') {
        await axios.post(`/inboxes/${targetInbox.roomId}/verify-lock`, {
          password: unlockDialog.password,
        });
      } else if (unlockDialog.mode === 'channel') {
        if (!targetInbox?.channel?._id) return;
        await axios.post(`/channels/${targetInbox.channel._id}/verify-password`, {
          password: unlockDialog.password,
        });
      } else {
        if (!targetInbox?.group?._id) return;
        await axios.post(`/groups/${targetInbox.group._id}/verify-password`, {
          password: unlockDialog.password,
        });
      }

      closeUnlockDialog(true);
    } catch (error0) {
      setUnlockDialog((prev) => ({
        ...prev,
        loading: false,
        error: error0?.response?.data?.message || 'Invalid password',
      }));
    }
  };

  const verifyPrivateGroupAccess = async (inbox) => {
    if (!isPrivateLockedGroup(inbox)) return true;
    return requestUnlockDialog(inbox, inbox?.channel ? 'channel' : 'group');
  };

  const verifyPrivateChatLockAccess = async (inbox) => {
    if (inbox?.roomType !== 'private') return true;

    try {
      const { data } = await axios.post(`/inboxes/${inbox.roomId}/verify-lock`);
      if (data?.payload?.locked && !data?.payload?.verified) {
        return requestUnlockDialog(inbox, 'private-chat');
      }
      return true;
    } catch (error0) {
      if (isPrivateChatLocked(inbox)) {
        return requestUnlockDialog(inbox, 'private-chat');
      }
      return true;
    }
  };

  const baseInboxes = (inboxes || [])
    .filter((elem) => !elem.deletedBy.includes(master._id))
    .filter((elem) => !isHiddenInbox(elem))
    .filter((elem) =>
      page.archive ? isArchivedInbox(elem) : !isArchivedInbox(elem)
    )
    .filter((elem) => (page.list ? isListedInbox(elem) : true))
    .filter((elem) => {
      if (chatFilter === 'all') return true;
      if (chatFilter === 'unread') {
        const hasServerUnread =
          elem.content.from !== master._id && elem.unreadMessage > 0;
        return hasServerUnread || isManuallyUnreadInbox(elem);
      }
      if (chatFilter === 'favourite') return isFavouriteInbox(elem);
      if (chatFilter === 'group') return elem.roomType === 'group';
      return true;
    });
  const filteredInboxes = [...baseInboxes].sort((left, right) => {
    const leftPinned = isPinnedInbox(left);
    const rightPinned = isPinnedInbox(right);
    if (leftPinned !== rightPinned) return rightPinned - leftPinned;

    const leftTs = new Date(left.content?.time || 0).getTime();
    const rightTs = new Date(right.content?.time || 0).getTime();
    return rightTs - leftTs;
  });

  const startCallFromInbox = async (elem, mediaType) => {
    const opened = await openInboxRoom(elem);
    if (!opened) return;

    dispatch(
      setModal({
        target: 'callPanel',
        data: {
          mode: 'outgoing',
          roomId: elem.roomId,
          roomType: elem.roomType,
          mediaType,
          fromUserId: master._id,
          fromName: master.fullname,
          fromUsername: master.username,
        },
      })
    );
  };

  useEffect(() => {
    if (!modal.inboxMenu) return undefined;

    const handleOutsidePointerDown = (event) => {
      if (event.target?.closest?.('#inbox-context-menu')) return;
      dispatch(setModal({ target: 'inboxMenu', data: false }));
    };

    document.addEventListener('pointerdown', handleOutsidePointerDown);

    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointerDown);
    };
  }, [modal.inboxMenu]);

  useEffect(() => {
    const handleHide = (event) => {
      const roomId = event.detail?.roomId;
      if (!roomId) return;
      setInboxes((prev) =>
        (prev || []).map((elem) =>
          elem.roomId === roomId
            ? {
                ...elem,
                hiddenBy: Array.isArray(elem.hiddenBy)
                  ? [...new Set([...elem.hiddenBy, master?._id])]
                  : [master?._id],
              }
            : elem
        )
      );
      if (chatRoom?.data?.roomId === roomId) {
        dispatch(setChatRoom({ isOpen: false, data: false }));
      }
    };

    const handleUnhide = (event) => {
      const roomId = event.detail?.roomId;
      if (!roomId) return;
      setInboxes((prev) =>
        (prev || []).map((elem) =>
          elem.roomId === roomId
            ? {
                ...elem,
                hiddenBy: Array.isArray(elem.hiddenBy)
                  ? elem.hiddenBy.filter((id) => id !== master?._id)
                  : [],
              }
            : elem
        )
      );
    };

    window.addEventListener('syncchat:inbox-hide', handleHide);
    window.addEventListener('syncchat:inbox-unhide', handleUnhide);
    return () => {
      window.removeEventListener('syncchat:inbox-hide', handleHide);
      window.removeEventListener('syncchat:inbox-unhide', handleUnhide);
    };
  }, [chatRoom?.data?.roomId, dispatch, master?._id, setInboxes]);

  useEffect(() => {
    socket.on('inbox/read', (payload) => {
      setInboxes((prev) => {
        const index = prev.findIndex((elem) => elem._id === payload._id);
        prev.splice(index, 1, payload);

        return [...prev];
      });
    });

    socket.on('group/create', (payload) =>
      setInboxes((prev) => [payload, ...((prev || []).filter((elem) => elem._id !== payload?._id))])
    );
    socket.on('channel/create', (payload) =>
      setInboxes((prev) => [payload, ...((prev || []).filter((elem) => elem._id !== payload?._id))])
    );
    const handleLocalChannelCreate = (event) => {
      const payload = event?.detail?.inbox;
      if (!payload?._id) return;
      setInboxes((prev) => {
        const olds = (prev || []).filter((elem) => elem._id !== payload._id);
        return [payload, ...olds];
      });
    };
    window.addEventListener('syncchat:channel-create', handleLocalChannelCreate);
    socket.on('group/edit', (payload) => applyEntityRoomPatch(payload, 'group'));
    socket.on('channel/edit', (payload) =>
      applyEntityRoomPatch(payload, 'channel')
    );

    socket.on('inbox/delete', (roomsId) => {
      setInboxes((prev) =>
        prev.filter((elem) => !roomsId.includes(elem.roomId))
      );
    });
    const handleLocalInboxDelete = (event) => {
      const roomId = event?.detail?.roomId;
      if (!roomId) return;
      setInboxes((prev) => prev.filter((elem) => elem.roomId !== roomId));
    };
    window.addEventListener('syncchat:inbox-delete', handleLocalInboxDelete);

    socket.on('group/exit', (payload) => {
      setInboxes((prev) => [
        payload.inbox,
        ...prev.filter((elem) => elem.roomId !== payload.inbox.roomId),
      ]);
    });

    socket.on('group/avatar', (payload) => {
      if (!payload?.roomId || !payload?.avatar) return;

      setInboxes((prev) =>
        prev.map((elem) =>
          elem.roomType === 'group' && elem.roomId === payload.roomId
            ? {
                ...elem,
                group: {
                  ...elem.group,
                  avatar: payload.avatar,
                },
              }
            : elem
        )
      );

      if (
        chatRoom?.data?.roomType === 'group' &&
        chatRoom?.data?.roomId === payload.roomId
      ) {
        dispatch(
          setChatRoom({
            ...chatRoom,
            data: {
              ...chatRoom.data,
              group: {
                ...chatRoom.data.group,
                avatar: payload.avatar,
              },
            },
          })
        );
      }
    });

    socket.on('channel/avatar', (payload) => {
      if (!payload?.roomId || !payload?.avatar) return;

      setInboxes((prev) =>
        prev.map((elem) =>
          elem.roomType === 'group' && elem.roomId === payload.roomId
            ? {
                ...elem,
                channel: {
                  ...(elem.channel || {}),
                  avatar: payload.avatar,
                },
                group: {
                  ...(elem.group || {}),
                  avatar: payload.avatar,
                },
              }
            : elem
        )
      );
    });

    return () => {
      socket.off('group/create');
      socket.off('channel/create');
      window.removeEventListener(
        'syncchat:channel-create',
        handleLocalChannelCreate
      );
      socket.off('group/edit');
      socket.off('channel/edit');
      socket.off('group/exit');
      socket.off('inbox/read');
      socket.off('inbox/delete');
      socket.off('group/avatar');
      socket.off('channel/avatar');
      window.removeEventListener(
        'syncchat:inbox-delete',
        handleLocalInboxDelete
      );
    };
  }, [setting, chatRoom, applyEntityRoomPatch]);

  useEffect(() => {
    if (!page.calls) return undefined;

    const abortCtrl = new AbortController();
    const fetchCallLogs = async () => {
      try {
        setCallLogsLoading(true);
        const { data } = await axios.get('/chats/calls', {
          signal: abortCtrl.signal,
        });
        setCallLogs(Array.isArray(data?.payload) ? data.payload : []);
      } catch (error0) {
        if (error0.name !== 'CanceledError') {
          // eslint-disable-next-line no-console
          console.error(error0?.response?.data?.message || error0.message);
        }
      } finally {
        setCallLogsLoading(false);
      }
    };

    fetchCallLogs();

    return () => {
      abortCtrl.abort();
    };
  }, [page.calls, inboxes?.length]);

  useEffect(() => {
    if (!page.starred) return undefined;

    const abortCtrl = new AbortController();
    const fetchStarredMessages = async () => {
      try {
        setStarredLoading(true);
        const { data } = await axios.get('/chats/starred', {
          signal: abortCtrl.signal,
        });
        setStarredMessages(Array.isArray(data?.payload) ? data.payload : []);
      } catch (error0) {
        if (error0.name !== 'CanceledError') {
          // eslint-disable-next-line no-console
          console.error(error0?.response?.data?.message || error0.message);
        }
      } finally {
        setStarredLoading(false);
      }
    };

    fetchStarredMessages();

    return () => {
      abortCtrl.abort();
    };
  }, [page.starred, inboxes?.length]);

  useEffect(() => {
    socket.on('inbox/find', async (payload) => {
      // concat old inboxes data with new data
      setInboxes((prev) => {
        const olds = (prev || []).filter((elem) => elem._id !== payload._id);
        return [payload, ...olds];
      });
      mergeActiveRoomFromInbox(payload);

      const isNotSender = payload.content.from !== master._id;
      const isMuted = isMutedInbox(payload);

      if (isNotSender && !setting.mute && !isMuted) {
        playTone(getInboxTone(payload));

        const isGroup = payload.roomType === 'group';
        const sender = payload.owners.find(
          (elem) => elem.userId === payload.content.from
        ) || { fullname: 'Unknown sender', username: 'unknown', avatar: '' };
        const notificationBody = (() => {
          if (isPrivateLockedGroup(payload) || isPrivateChatLocked(payload)) {
            return 'Locked content';
          }
          if (isEventMessage(payload.content.text)) return 'Event';
          if (isPollMessage(payload.content.text)) return 'Poll';
          return payload.content.text;
        })();

        // browser notification
        notification({
          title: isGroup
            ? payload.channel?.name || payload.group?.name || 'Group'
            : `${sender.fullname} (@${sender.username})`,
          body: notificationBody,
          icon: resolveUploadUrl(
            isGroup
              ? payload.channel?.avatar || payload.group?.avatar
              : sender.avatar
          ),
        });
      }
    });

    socket.on('inbox/preferences', (payload) => {
      if (!payload?.roomId) return;
      setInboxes((prev) => {
        const olds = (prev || []).filter((elem) => elem.roomId !== payload.roomId);
        const current = (prev || []).find((elem) => elem.roomId === payload.roomId);
        return [{ ...current, ...payload }, ...olds];
      });
      mergeActiveRoomFromInbox(payload);
      window.dispatchEvent(
        new CustomEvent('syncchat:room-refresh-chats', {
          detail: { roomId: payload.roomId },
        })
      );
      dispatch(setRefreshInbox(uuidv4()));
    });

    const handleRoomInboxUpdate = (event) => {
      const payload = event?.detail?.inbox;
      if (!payload?._id && !payload?.roomId) return;
      setInboxes((prev) => {
        const olds = (prev || []).filter((elem) => elem.roomId !== payload.roomId);
        const current = (prev || []).find((elem) => elem.roomId === payload.roomId);
        return [{ ...current, ...payload }, ...olds];
      });
      mergeActiveRoomFromInbox(payload);
    };
    window.addEventListener('syncchat:room-inbox-update', handleRoomInboxUpdate);

    return () => {
      socket.off('inbox/find');
      socket.off('inbox/preferences');
      window.removeEventListener(
        'syncchat:room-inbox-update',
        handleRoomInboxUpdate
      );
    };
  }, [mergeActiveRoomFromInbox, setting.mute, master?._id]);

  useEffect(() => {
    if (!chatRoom?.isOpen || !chatRoom?.data) {
      setPrivacyShieldVisible(false);
      return undefined;
    }
    if (!isAdvancedPrivacyEnabled(chatRoom.data)) {
      setPrivacyShieldVisible(false);
      return undefined;
    }

    let hideTimer = null;
    const showShield = () => {
      setPrivacyShieldVisible(true);
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setPrivacyShieldVisible(false), 1200);
    };

    const onKeyDown = (event) => {
      if (event.key === 'PrintScreen') {
        showShield();
      }
    };
    const onHidden = () => {
      if (document.hidden) showShield();
    };
    const onBlur = () => showShield();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onHidden);

    return () => {
      if (hideTimer) clearTimeout(hideTimer);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onHidden);
      setPrivacyShieldVisible(false);
    };
  }, [chatRoom?.isOpen, chatRoom?.data, master?._id]);

  useEffect(
    () => () => {
      if (unlockResolverRef.current) {
        unlockResolverRef.current(false);
        unlockResolverRef.current = null;
      }
    },
    []
  );

  return (
    <div
      id="inbox"
      className="relative pb-[108px] md:pb-0 z-0 flex flex-col overflow-y-auto bg-white scrollbar-thin scrollbar-thumb-slate-300 hover:scrollbar-thumb-slate-400 dark:bg-spill-950 dark:scrollbar-thumb-spill-700 dark:hover:scrollbar-thumb-spill-600"
    >
      {privacyShieldVisible && (
        <div className="fixed inset-0 z-[990] bg-black pointer-events-none" />
      )}
      {unlockDialog.open && (
        <div
          className="absolute inset-0 z-[320] grid place-items-center bg-slate-900/50 px-4"
          aria-hidden
          onClick={() => closeUnlockDialog(false)}
        >
          <div
            aria-hidden
            className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-spill-700 dark:bg-spill-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-2">
              <i className="text-amber-600 dark:text-amber-400">
                <bi.BiLockAlt size={18} />
              </i>
              <h3 className="text-base font-semibold">
                {unlockDialog.mode === 'private-chat'
                  ? 'Enter Chat Password'
                  : unlockDialog.mode === 'channel'
                  ? 'Enter Channel Password'
                  : 'Enter Group Password'}
              </h3>
            </div>
            <p className="text-sm opacity-75 mb-3">
              {unlockDialog.mode === 'private-chat'
                ? 'This chat is locked for your account.'
                : unlockDialog.mode === 'channel'
                ? `${unlockDialog.inbox?.channel?.name || 'Private channel'} is locked.`
                : `${unlockDialog.inbox?.group?.name || 'Private group'} is locked.`}
            </p>
            <label
              htmlFor="group-unlock-password"
              className="h-10 px-3 rounded-lg border border-spill-300 dark:border-spill-700 bg-white dark:bg-spill-900 flex items-center"
            >
              <input
                id="group-unlock-password"
                name="unlock_password"
                type="password"
                value={unlockDialog.password}
                onChange={(e) =>
                  setUnlockDialog((prev) => ({
                    ...prev,
                    password: e.target.value,
                    error: '',
                  }))
                }
                placeholder={
                  unlockDialog.mode === 'private-chat'
                    ? 'Chat password'
                    : unlockDialog.mode === 'channel'
                    ? 'Channel password'
                    : 'Group password'
                }
                className="w-full bg-transparent text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submitUnlockDialog();
                  }
                }}
              />
            </label>
            {unlockDialog.error && (
              <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
                {unlockDialog.error}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="h-9 px-3 rounded-lg border border-spill-300 dark:border-spill-700 hover:bg-spill-100 dark:hover:bg-spill-800"
                onClick={() => closeUnlockDialog(false)}
                disabled={unlockDialog.loading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="h-9 px-3 rounded-lg bg-sky-600 text-white font-semibold hover:bg-sky-700 disabled:opacity-60"
                onClick={submitUnlockDialog}
                disabled={unlockDialog.loading}
              >
                {unlockDialog.loading ? 'Checking...' : 'Unlock'}
              </button>
            </div>
          </div>
        </div>
      )}
      {modal.lockChat &&
        createPortal(
          <div
            className="fixed inset-0 z-[980] grid place-items-center bg-slate-900/50 px-4"
            aria-hidden
            onClick={closeLockChatDialog}
          >
            <div
              aria-hidden
              className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-spill-700 dark:bg-spill-900"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-base font-semibold">
                {modal.lockChat?.type === 'lock'
                  ? 'Lock This Chat'
                  : 'Change Chat Lock Password'}
              </h3>
              <p className="mt-1 text-sm opacity-70">
                {modal.lockChat?.type === 'lock'
                  ? 'Set password to lock this chat on your side only.'
                  : 'Update your personal lock password for this chat.'}
              </p>
              <div className="mt-3 grid gap-2">
                {modal.lockChat?.type === 'lock' && (
                  <label className="h-10 px-3 rounded-lg border border-spill-300 dark:border-spill-700 bg-white dark:bg-spill-900 flex items-center">
                    <input
                      id="lock-chat-password"
                      name="lock_chat_password"
                      type="password"
                      value={lockChatDialog.password}
                      onChange={(e) =>
                        setLockChatDialog((prev) => ({
                          ...prev,
                          password: e.target.value,
                          error: '',
                        }))
                      }
                      placeholder="New password"
                      className="w-full bg-transparent text-sm"
                    />
                  </label>
                )}
                {modal.lockChat?.type === 'change' && (
                  <>
                    <label className="h-10 px-3 rounded-lg border border-spill-300 dark:border-spill-700 bg-white dark:bg-spill-900 flex items-center">
                      <input
                        id="lock-chat-old-password"
                        name="lock_chat_old_password"
                        type="password"
                        value={lockChatDialog.oldPassword}
                        onChange={(e) =>
                          setLockChatDialog((prev) => ({
                            ...prev,
                            oldPassword: e.target.value,
                            error: '',
                          }))
                        }
                        placeholder="Current password"
                        className="w-full bg-transparent text-sm"
                      />
                    </label>
                    <label className="h-10 px-3 rounded-lg border border-spill-300 dark:border-spill-700 bg-white dark:bg-spill-900 flex items-center">
                      <input
                        id="lock-chat-new-password"
                        name="lock_chat_new_password"
                        type="password"
                        value={lockChatDialog.newPassword}
                        onChange={(e) =>
                          setLockChatDialog((prev) => ({
                            ...prev,
                            newPassword: e.target.value,
                            error: '',
                          }))
                        }
                        placeholder="New password"
                        className="w-full bg-transparent text-sm"
                      />
                    </label>
                  </>
                )}
              </div>
              {lockChatDialog.error && (
                <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
                  {lockChatDialog.error}
                </p>
              )}
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  className="h-9 px-3 rounded-lg border border-spill-300 dark:border-spill-700 hover:bg-spill-100 dark:hover:bg-spill-800"
                  onClick={closeLockChatDialog}
                  disabled={lockChatDialog.loading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="h-9 px-3 rounded-lg bg-sky-600 text-white font-semibold hover:bg-sky-700 disabled:opacity-60"
                  onClick={submitLockChatDialog}
                  disabled={lockChatDialog.loading}
                >
                  {lockChatDialog.loading ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
      {modal.inboxMenu && <InboxMenu />}
      {page.calls && (
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-3 py-2 backdrop-blur-sm dark:border-spill-700 dark:bg-spill-900/95">
          <div className="flex items-center justify-between gap-2">
            <span>
              <p className="text-sm font-semibold text-slate-700 dark:text-spill-100">
                All Calls
              </p>
              <p className="text-xs opacity-70">
                Incoming, outgoing, rejected and missed
              </p>
            </span>
            <button
              type="button"
              className="h-8 w-8 rounded-full bg-sky-600 text-white grid place-items-center hover:bg-sky-700"
              title="Start new call"
              onClick={() =>
                dispatch(setModal({ target: 'callStart', data: true }))
              }
            >
              <bi.BiPlus />
            </button>
          </div>
        </div>
      )}
      {page.starred && (
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-3 py-2 backdrop-blur-sm dark:border-spill-700 dark:bg-spill-900/95">
          <div className="flex items-center justify-between gap-2">
            <span>
              <p className="text-sm font-semibold text-slate-700 dark:text-spill-100">
                Starred Messages
              </p>
              <p className="text-xs opacity-70">
                Messages you marked as important
              </p>
            </span>
            <i className="text-amber-500">
              <bi.BiStar size={18} />
            </i>
          </div>
        </div>
      )}
      {showStatusRail && (
        <div className="border-b border-slate-200 px-3 py-2 dark:border-spill-700">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700 dark:text-spill-100">
              Status
            </p>
            <button
              type="button"
              className="text-xs font-semibold text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300"
              onClick={() => dispatch(setPage({ target: 'status', data: true }))}
            >
              Open status
            </button>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
            <button
              type="button"
              className="w-[74px] shrink-0 grid gap-1 justify-items-center"
              onClick={() => dispatch(setPage({ target: 'status', data: true }))}
            >
              <span className="relative rounded-full p-[2px] bg-gradient-to-tr from-sky-500 via-cyan-400 to-emerald-400">
                <img
                  src={
                    resolveUploadUrl(master?.avatar) ||
                    'assets/images/default-avatar.png'
                  }
                  alt=""
                  className="h-14 w-14 rounded-full border-2 border-white object-cover dark:border-spill-900"
                />
                <span className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full bg-sky-600 text-white ring-2 ring-white dark:ring-spill-900">
                  <bi.BiPlus size={13} />
                </span>
              </span>
              <span className="truncate text-[11px] font-medium">Create</span>
            </button>

            {myStatusGroup && (
              <button
                type="button"
                className="w-[74px] shrink-0 grid gap-1 justify-items-center"
                onClick={() => openStatusViewer(myStatusGroup.userId)}
              >
                <span className="rounded-full p-[2px] bg-gradient-to-tr from-rose-500 via-orange-400 to-amber-300">
                  <img
                    src={
                      resolveUploadUrl(myStatusGroup.profile.avatar) ||
                      'assets/images/default-avatar.png'
                    }
                    alt=""
                    className="h-14 w-14 rounded-full border-2 border-white object-cover dark:border-spill-900"
                  />
                </span>
                <span className="truncate text-[11px] font-medium">My status</span>
              </button>
            )}

            {statusLoaded &&
              friendStatusGroups.map((group) => (
                <button
                  key={group.userId}
                  type="button"
                  className="w-[74px] shrink-0 grid gap-1 justify-items-center"
                  onClick={() => openStatusViewer(group.userId)}
                >
                  <span className="rounded-full p-[2px] bg-gradient-to-tr from-rose-500 via-orange-400 to-amber-300">
                    <img
                      src={
                        resolveUploadUrl(group.profile.avatar) ||
                        'assets/images/default-avatar.png'
                      }
                      alt=""
                      className="h-14 w-14 rounded-full border-2 border-white object-cover dark:border-spill-900"
                    />
                  </span>
                  <span className="w-full truncate text-[11px] font-medium">
                    {group.profile.fullname}
                  </span>
                </button>
              ))}
            {!statusLoaded && (
              <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-spill-800 dark:text-spill-300">
                <i className="animate-spin">
                  <bi.BiLoaderAlt size={17} />
                </i>
              </span>
            )}
          </div>
        </div>
      )}
      {page.calls &&
        callLogs.map((elem) => {
          const meta = getCallListMeta(elem.text, elem.userId);
          if (!meta) return null;
          const privateProfile =
            elem.roomType === 'private'
              ? elem.owners.find((x) => x.userId !== master._id)
              : null;
          const presence = getPresenceMeta(privateProfile);

          const friendOrName =
            elem.roomType === 'private'
              ? elem.owners.find((x) => x.userId !== master._id)?.fullname ||
                '[inactive]'
              : elem.group?.name || 'Group';
          const avatarUrl = resolveUploadUrl(
            elem.roomType === 'private'
              ? elem.owners.find((x) => x.userId !== master._id)?.avatar
              : elem.group?.avatar
          );

          return (
            <div
              key={`call-row-${elem._id}`}
              className="px-3 py-3 grid grid-cols-[auto_1fr] gap-3 border-0 border-b border-solid border-slate-200 hover:bg-slate-100 dark:border-spill-700 dark:hover:bg-spill-800/70"
            >
              <div className="relative">
                <img
                  src={
                    avatarUrl ||
                    (elem.roomType === 'private'
                      ? 'assets/images/default-avatar.png'
                      : 'assets/images/default-group-avatar.png')
                  }
                  alt=""
                  className="w-12 h-12 rounded-full object-cover border border-slate-200 dark:border-spill-700"
                />
                {elem.roomType === 'private' && presence.showDot && (
                  <span className="absolute right-0 bottom-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500 dark:border-spill-950" />
                )}
              </div>
              <div className="min-w-0 grid gap-1">
                <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
                  <p className="truncate font-medium text-slate-800 dark:text-spill-100">
                    {friendOrName}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-spill-400">
                    {moment(elem.createdAt).fromNow()}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <i className={meta.statusTone}>
                    <meta.icon size={15} />
                  </i>
                  <p className={`text-sm ${meta.statusTone}`}>
                    {meta.statusLabel}
                  </p>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <button
                    type="button"
                    className="h-8 px-2.5 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300"
                    onClick={() => {
                      const source =
                        (inboxes || []).find(
                          (inbox) => inbox.roomId === elem.roomId
                        ) || elem;
                      startCallFromInbox(source, 'audio');
                    }}
                    title="Audio call"
                  >
                    <bi.BiPhoneCall size={16} />
                  </button>
                  <button
                    type="button"
                    className="h-8 px-2.5 rounded-lg bg-sky-100 text-sky-700 hover:bg-sky-200 dark:bg-sky-900/30 dark:text-sky-300"
                    onClick={() => {
                      const source =
                        (inboxes || []).find(
                          (inbox) => inbox.roomId === elem.roomId
                        ) || elem;
                      startCallFromInbox(source, 'video');
                    }}
                    title="Video call"
                  >
                    <bi.BiVideo size={16} />
                  </button>
                  <button
                    type="button"
                    className="h-8 px-2.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-spill-800 dark:text-spill-200 dark:hover:bg-spill-700"
                    onClick={() => {
                      const source =
                        (inboxes || []).find(
                          (inbox) => inbox.roomId === elem.roomId
                        ) || elem;
                      openInboxRoom(source);
                    }}
                    title="Message"
                  >
                    <bi.BiMessageSquareDetail size={16} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      {page.starred &&
        starredMessages.map((item) => {
          const sourceInbox = (inboxes || []).find(
            (inbox) => inbox.roomId === item.roomId
          );
          const roomTitle =
            item?.room?.title ||
            (item.roomType === 'group' ? 'Group' : '[inactive]');
          const roomAvatar =
            resolveUploadUrl(item?.room?.avatar) ||
            (item.roomType === 'group'
              ? 'assets/images/default-group-avatar.png'
              : 'assets/images/default-avatar.png');
          const senderName =
            item?.profile?.fullname || item?.userId || 'Unknown sender';
          const starredFileType = item?.file?.type || '';
          const starredFileUrl = resolveUploadUrl(item?.file?.url || '');
          const isStarredImage =
            starredFileType === 'image' && !!starredFileUrl;
          const previewText =
            item?.text?.trim() ||
            (isStarredImage
              ? 'Photo'
              : starredFileType === 'video'
                ? 'Video'
                : starredFileType === 'audio'
                  ? 'Voice'
                  : item?.file?.originalname || '[attachment]');

          return (
            <div
              key={`starred-row-${item._id}`}
              className="px-3 py-3 grid grid-cols-[auto_1fr] gap-3 border-0 border-b border-solid border-slate-200 hover:bg-slate-100 dark:border-spill-700 dark:hover:bg-spill-800/70 cursor-pointer"
              aria-hidden
              onClick={() => {
                if (isStarredImage) {
                  dispatch(
                    setModal({
                      target: 'photoFull',
                      data: starredFileUrl,
                    })
                  );
                  return;
                }
                if (sourceInbox) {
                  openInboxRoom(sourceInbox);
                  return;
                }
                dispatch(
                  setChatRoom({
                    isOpen: true,
                    refreshId: item.roomId,
                    data: {
                      roomId: item.roomId,
                      roomType: item.roomType,
                      ownersId: item?.room?.ownersId || [],
                      group: item?.room?.group || null,
                      profile: item?.room?.friend || null,
                    },
                  })
                );
              }}
            >
              <img
                src={roomAvatar}
                alt=""
                className="w-12 h-12 rounded-full object-cover border border-slate-200 dark:border-spill-700"
              />
              <div className="min-w-0 grid gap-1">
                <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
                  <p className="truncate font-medium text-slate-800 dark:text-spill-100">
                    {roomTitle}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-spill-400">
                    {moment(item.createdAt).fromNow()}
                  </p>
                </div>
                <p className="text-xs opacity-70 truncate">by {senderName}</p>
                <div className="flex items-center gap-1">
                  <i className="text-amber-500">
                    <bi.BiStar size={14} />
                  </i>
                  {isStarredImage && (
                    <img
                      src={starredFileUrl}
                      alt=""
                      className="w-6 h-6 rounded object-cover border border-slate-200 dark:border-spill-700"
                    />
                  )}
                  <p className="text-sm truncate text-slate-700 dark:text-spill-200">
                    {previewText}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      {page.calls && callLogsLoading && (
        <div className="p-6 text-sm text-center text-slate-500 dark:text-spill-400">
          Loading call history...
        </div>
      )}
      {page.starred && starredLoading && (
        <div className="p-6 text-sm text-center text-slate-500 dark:text-spill-400">
          Loading starred messages...
        </div>
      )}
      {page.calls && !callLogsLoading && callLogs.length === 0 && (
        <div className="p-6 text-sm text-center text-slate-500 dark:text-spill-400">
          No call history yet.
        </div>
      )}
      {page.starred && !starredLoading && starredMessages.length === 0 && (
        <div className="p-6 text-sm text-center text-slate-500 dark:text-spill-400">
          No starred messages yet.
        </div>
      )}
      {!page.calls &&
        !page.starred &&
        filteredInboxes &&
        filteredInboxes.map((elem) => {
          const privateProfile =
            elem.roomType === 'private'
              ? elem.owners.find((x) => x.userId !== master._id)
              : null;
          const presence = getPresenceMeta(privateProfile);
          const selectModeActive = Array.isArray(selectedInboxes);
          const inboxSelected =
            selectModeActive && selectedInboxes.includes(elem.roomId);
          const lockedPrivate = isPrivateLockedGroup(elem);
          const lockedChat = isPrivateChatLocked(elem);
          const isLockedPreview = lockedPrivate || lockedChat;
          const showUnreadBadge =
            isManuallyUnreadInbox(elem) ||
            (elem.content.from !== master._id &&
              (elem.unreadMessage > 0 ||
                (lockedChat && !elem.content.readed)));
          const hasUnreadForMe = showUnreadBadge;
          const unreadBadgeCount = elem.unreadMessage > 0 ? elem.unreadMessage : 1;
          const callStatus = getCallStatusMeta(elem.content?.text);
          const eventStatus = isEventMessage(elem.content?.text);
          const pollStatus = isPollMessage(elem.content?.text);
          const oneTimeMatch = String(elem.content?.text || '').match(
            /^1-time (photo|video|message)$/i
          );
          const oneTimeType = oneTimeMatch ? oneTimeMatch[1].toLowerCase() : '';
          let previewContent = null;

          if (isLockedPreview) {
            previewContent = (
              <span
                className={`truncate text-sm flex items-center gap-1 text-amber-600 dark:text-amber-400 ${
                  hasUnreadForMe ? 'font-semibold' : ''
                }`}
              >
                <bi.BiLockAlt />
                <p className="truncate">Locked content</p>
              </span>
            );
          } else if (callStatus) {
            previewContent = (
              <span
                className={`truncate text-sm flex items-center gap-1 ${callStatus.toneClass} ${
                  hasUnreadForMe ? 'font-semibold' : ''
                }`}
              >
                <callStatus.icon />
                <p className="truncate">{callStatus.label}</p>
              </span>
            );
          } else if (eventStatus) {
            previewContent = (
              <span
                className={`truncate text-sm flex items-center gap-1 text-sky-600 dark:text-sky-400 ${
                  hasUnreadForMe ? 'font-semibold' : ''
                }`}
              >
                <bi.BiCalendarEvent />
                <p className="truncate">Event</p>
              </span>
            );
          } else if (pollStatus) {
            previewContent = (
              <span
                className={`truncate text-sm flex items-center gap-1 text-emerald-600 dark:text-emerald-400 ${
                  hasUnreadForMe ? 'font-semibold' : ''
                }`}
              >
                <bi.BiBarChartAlt2 />
                <p className="truncate">Poll</p>
              </span>
            );
          } else if (oneTimeType) {
            const OneTimeIcon =
              oneTimeType === 'photo'
                ? bi.BiImage
                : oneTimeType === 'video'
                  ? bi.BiVideo
                  : bi.BiLowVision;
            previewContent = (
              <span
                className={`truncate text-sm flex items-center gap-1 text-sky-600 dark:text-sky-400 ${
                  hasUnreadForMe ? 'font-semibold' : ''
                }`}
              >
                <OneTimeIcon />
                <p className="truncate capitalize">{`Sent a ${oneTimeType}`}</p>
              </span>
            );
          } else {
            previewContent = (
              <p
                className={`truncate text-sm ${
                  hasUnreadForMe
                    ? 'font-semibold text-slate-800 dark:text-spill-100'
                    : 'text-slate-600 dark:text-spill-300'
                }`}
              >
                {elem.file && isAudioFile(elem.file)
                  ? 'Voice'
                  : elem.content.text}
              </p>
            );
          }

          return (
            <div
              key={elem._id}
              aria-hidden
              className={`
              ${
                (chatRoom.data?.roomId === elem.roomId ||
                  modal.inboxMenu?.inboxId === elem._id ||
                  inboxSelected) &&
                'bg-slate-200 dark:bg-spill-700'
              }
              px-3 py-3 grid grid-cols-[auto_1fr] gap-3 items-center cursor-pointer
              border-0 border-b border-solid border-slate-200
              hover:bg-slate-100 dark:border-spill-700 dark:hover:bg-spill-800
            `}
              onClick={() => {
                if (selectModeActive) {
                  dispatch(setSelectedInboxes(elem.roomId));
                  return;
                }
                openInboxRoom(elem);
              }}
              onContextMenu={(e) => {
                if (selectModeActive) return;
                e.stopPropagation();
                e.preventDefault();

                handleContextMenu(e, elem);
              }}
              onTouchStart={(e) => {
                if (selectModeActive) return;
                touchAndHoldStart(() => handleContextMenu(e, elem));
              }}
              onTouchMove={() => touchAndHoldEnd()}
              onTouchEnd={() => touchAndHoldEnd()}
            >
              <div className="relative flex-none">
                <img
                  src={
                    resolveUploadUrl(
                      elem.roomType === 'private'
                        ? privateProfile?.avatar
                        : elem.channel?.avatar || elem.group?.avatar
                    ) ||
                    (elem.roomType === 'private'
                      ? 'assets/images/default-avatar.png'
                      : 'assets/images/default-group-avatar.png')
                  }
                  alt=""
                  className="w-14 h-14 rounded-full object-cover border border-slate-200 dark:border-spill-700"
                />
                {elem.roomType === 'private' && presence.showDot && (
                  <span className="absolute right-0 bottom-0 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500 dark:border-spill-950" />
                )}
              </div>
              <div className="overflow-hidden grid gap-0.5">
                <div className="grid grid-cols-[1fr_auto] gap-3">
                  <p
                    className={`text-[17px] truncate text-slate-800 dark:text-spill-100 ${
                      hasUnreadForMe ? 'font-semibold' : 'font-medium'
                    }`}
                  >
                    {elem?.channel?._id && (
                      <i className="mr-1 inline-flex align-middle text-sky-600 dark:text-sky-400">
                        <ri.RiBroadcastLine size={14} />
                      </i>
                    )}
                    {elem.roomType === 'group' &&
                      (elem?.channel?.accessType === 'private' ||
                        elem?.group?.accessType === 'private') && (
                        <i className="mr-1 inline-flex align-middle text-amber-600 dark:text-amber-400">
                          <bi.BiLockAlt size={14} />
                        </i>
                      )}
                    {lockedChat && (
                      <i className="mr-1 inline-flex align-middle text-amber-600 dark:text-amber-400">
                        <bi.BiLockAlt size={14} />
                      </i>
                    )}
                    {getInboxDisplayTitle(elem)}
                  </p>
                  <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-spill-400">
                    {callStatus && (
                      <i className={callStatus.toneClass}>
                        <callStatus.icon size={14} />
                      </i>
                    )}
                    {isPinnedInbox(elem) && (
                      <i className="text-sky-600 dark:text-sky-400">
                        <bi.BiPin size={14} />
                      </i>
                    )}
                    {isMutedInbox(elem) && (
                      <i className="text-slate-500 dark:text-spill-400">
                        <bi.BiBellOff size={14} />
                      </i>
                    )}
                    <p className={hasUnreadForMe ? 'font-semibold' : ''}>
                      {moment(elem.content.time).fromNow()}
                    </p>
                    <button
                      type="button"
                      className="p-1 rounded-full hover:bg-slate-200 dark:hover:bg-spill-700"
                      onClick={(e) => {
                        if (selectModeActive) return;
                        e.stopPropagation();
                        const inbox = document.querySelector('#inbox');
                        const inboxBounds = inbox?.getBoundingClientRect();
                        const rect = e.currentTarget.getBoundingClientRect();
                        openMenuForInbox({
                          elem,
                          x: inboxBounds
                            ? rect.right - inboxBounds.left
                            : rect.right,
                          y: inboxBounds
                            ? rect.bottom - inboxBounds.top + 6
                            : rect.bottom + 6,
                        });
                      }}
                    >
                      <bi.BiDotsVerticalRounded size={16} />
                    </button>
                    {selectModeActive && (
                      <span
                        className={`ml-1 w-5 h-5 rounded-full border grid place-items-center ${
                          inboxSelected
                            ? 'bg-sky-600 border-sky-600 text-white'
                            : 'border-slate-400 dark:border-spill-400'
                        }`}
                      >
                        {inboxSelected && <bi.BiCheck size={12} />}
                      </span>
                    )}
                  </span>
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
                  <span className="flex gap-1 items-center overflow-hidden">
                    {elem?.channel?._id && !isLockedPreview && (
                      <span className="flex-none text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-600 dark:text-sky-400">
                        Channel
                      </span>
                    )}
                    {elem.content.from === master._id && (
                      <i>
                        {(() => {
                          if (elem.content.readed) {
                            return (
                              <ri.RiCheckDoubleFill
                                size={20}
                                className="text-sky-600 dark:text-sky-400"
                              />
                            );
                          }
                          if (elem.content.delivered) {
                            return (
                              <ri.RiCheckDoubleFill
                                size={20}
                                className="text-slate-500 dark:text-spill-400"
                              />
                            );
                          }
                          return (
                            <ri.RiCheckFill
                              size={18}
                              className="text-slate-500 dark:text-spill-400"
                            />
                          );
                        })()}
                      </i>
                    )}
                    <span className="truncate flex gap-1 items-center">
                      {elem.roomType === 'group' && !isLockedPreview && (
                        <p>{`${elem.content.senderName}: `}</p>
                      )}
                      {elem.roomType === 'group' &&
                        (elem?.channel?.accessType === 'private' ||
                          elem?.group?.accessType === 'private') && (
                          <i className="text-amber-600 dark:text-amber-400">
                            <bi.BiLockAlt size={14} />
                          </i>
                        )}

                      {elem.file && elem.file.type === 'image' && !oneTimeType && (
                        <img
                          src={resolveUploadUrl(elem.file.url)}
                          alt=""
                          className="h-5"
                        />
                      )}
                      {elem.file && isAudioFile(elem.file) && !oneTimeType && (
                        <i>
                          <ri.RiMicFill size={20} />
                        </i>
                      )}
                      {elem.file &&
                        elem.file.type !== 'image' &&
                        elem.file.type !== 'video' &&
                        !isAudioFile(elem.file) && (
                          <i>
                            <ri.RiFileTextFill size={20} />
                          </i>
                        )}

                      {previewContent}
                    </span>
                  </span>
                  {showUnreadBadge && (
                    <span className="min-w-5 h-5 px-1 flex justify-center items-center rounded-full bg-gradient-to-r from-sky-500 via-cyan-500 to-teal-500">
                      <p className="text-[11px] text-white font-bold">
                        {unreadBadgeCount}
                      </p>
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      {statusViewer.open &&
        viewingStatusItem &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed inset-0 z-[960] bg-black/90 text-white grid grid-rows-[auto_1fr_auto]">
          <div className="px-3 pt-3 pb-2 border-b border-white/20">
            <div className="flex gap-1 mb-2">
              {viewingStatusItems.map((item, index) => (
                <span
                  key={item._id}
                  className="h-1 flex-1 rounded-full bg-white/20 overflow-hidden"
                >
                  <span
                    className={`h-full block ${
                      index < statusViewer.index
                        ? 'bg-white'
                        : index === statusViewer.index
                          ? 'bg-white/90 animate-pulse'
                          : 'bg-transparent'
                    }`}
                  />
                </span>
              ))}
            </div>
            <div className="h-10 flex justify-between items-center">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={
                    resolveUploadUrl(viewingStatusGroup?.profile?.avatar) ||
                    'assets/images/default-avatar.png'
                  }
                  alt=""
                  className="w-9 h-9 rounded-full object-cover"
                />
                <span className="min-w-0">
                  <p className="font-semibold truncate">
                    {viewingStatusGroup?.profile?.fullname}
                  </p>
                  <p className="text-xs opacity-75">
                    {moment(viewingStatusItem.createdAt).fromNow()}
                  </p>
                </span>
              </div>
              <div className="flex items-center gap-2">
                {viewingStatusItem.isMine && (
                  <button
                    type="button"
                    className="px-2 py-1 rounded-full text-xs bg-white/10 hover:bg-white/20"
                    onClick={openStatusActivity}
                  >
                    <span className="inline-flex items-center gap-1">
                      <bi.BiShow size={15} />
                      {viewingStatusItem.viewCount || 0}
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  className="p-2 rounded-full hover:bg-white/15"
                  onClick={closeStatusViewer}
                >
                  <bi.BiX size={20} />
                </button>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
              {statusReactionBursts.map((item) => (
                <span
                  key={item.id}
                  className="status-reaction-burst"
                  style={{
                    left: `${item.left}%`,
                    '--burst-drift': `${item.drift}px`,
                    '--burst-duration': `${item.duration}ms`,
                  }}
                >
                  {item.emoji}
                </span>
              ))}
            </div>
            <button
              type="button"
              aria-label="Previous status"
              className="absolute left-0 top-0 bottom-0 w-1/3 z-10"
              onClick={() => stepStatusViewer(-1)}
              disabled={statusViewer.index <= 0}
            />
            <button
              type="button"
              aria-label="Next status"
              className="absolute right-0 top-0 bottom-0 w-1/3 z-10"
              onClick={() => stepStatusViewer(1)}
              disabled={statusViewer.index >= viewingStatusItems.length - 1}
            />

            {viewingStatusItem.type === 'text' && (
              <div
                className="absolute inset-0 flex items-center justify-center p-8"
                style={{ backgroundColor: viewingStatusItem.bgColor || '#0ea5e9' }}
              >
                <p className="text-center text-xl font-semibold whitespace-pre-wrap break-words">
                  {viewingStatusItem.text}
                </p>
              </div>
            )}

            {viewingStatusItem.type === 'photo' && (
              <div className="absolute inset-0 grid grid-rows-[1fr_auto] bg-black">
                <div className="min-h-0 flex items-center justify-center px-3 py-3 md:px-8 md:py-6">
                  <div className="w-full max-w-[min(92vw,980px)] h-full flex items-center justify-center">
                    <img
                      src={resolveUploadUrl(viewingStatusItem.mediaUrl)}
                      alt=""
                      className="max-h-full max-w-full h-auto w-auto object-contain rounded-md"
                    />
                  </div>
                </div>
                {viewingStatusItem.text && (
                  <div className="w-full max-w-[min(92vw,980px)] mx-auto">
                    <p className="p-4 bg-black/60 text-sm whitespace-pre-wrap break-words">
                      {viewingStatusItem.text}
                    </p>
                  </div>
                )}
              </div>
            )}

            {viewingStatusItem.type === 'video' && (
              <div className="absolute inset-0 grid grid-rows-[1fr_auto] bg-black">
                <div className="min-h-0 flex items-center justify-center px-3 py-3 md:px-8 md:py-6">
                  <div className="w-full max-w-[min(92vw,980px)] h-full flex items-center justify-center">
                    <video
                      src={resolveUploadUrl(viewingStatusItem.mediaUrl)}
                      controls
                      autoPlay
                      onEnded={() => {
                        if (statusViewer.index >= viewingStatusItems.length - 1) {
                          closeStatusViewer();
                        } else {
                          stepStatusViewer(1);
                        }
                      }}
                      className="max-h-full max-w-full h-auto w-auto object-contain rounded-md"
                    >
                      <track kind="captions" />
                    </video>
                  </div>
                </div>
                {viewingStatusItem.text && (
                  <div className="w-full max-w-[min(92vw,980px)] mx-auto">
                    <p className="p-4 bg-black/60 text-sm whitespace-pre-wrap break-words">
                      {viewingStatusItem.text}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {viewingStatusItem.isMine ? (
            <div className="px-3 py-2 border-t border-white/20">
              <div className="w-full max-w-[min(92vw,980px)] mx-auto flex items-center justify-between">
                <p className="text-sm opacity-85">
                  Views {viewingStatusItem.viewCount || 0} | Replies{' '}
                  {viewingStatusItem.replyCount || 0}
                </p>
                <button
                  type="button"
                  className="h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 grid place-items-center"
                  onClick={openStatusActivity}
                  title="View details"
                >
                  <bi.BiListUl size={18} />
                </button>
              </div>
            </div>
          ) : (
            <div className="px-3 py-2 border-t border-white/20">
              <div className="w-full max-w-[min(92vw,980px)] mx-auto grid gap-2">
                <div className="flex items-center gap-2">
                  {[
                    '\u2764\uFE0F',
                    '\uD83D\uDD25',
                    '\uD83D\uDE02',
                    '\uD83D\uDE2E',
                    '\uD83D\uDE22',
                    '\uD83D\uDC4F',
                  ].map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className={`h-8 w-8 rounded-full text-lg grid place-items-center transition-all duration-150 bg-white/10 hover:bg-white/20 ${
                        statusReactionPulse === emoji ? 'scale-125 bg-sky-500/40' : ''
                      }`}
                      onClick={() => sendStatusReaction(emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <input
                    type="text"
                    value={statusReplyText}
                    onChange={(e) => setStatusReplyText(e.target.value)}
                    className="h-10 rounded-lg px-3 bg-white/10 text-sm placeholder:text-white/60"
                    placeholder="Reply to this status..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') sendStatusReply();
                    }}
                  />
                  <button
                    type="button"
                    className="h-10 w-10 rounded-lg bg-sky-600 hover:bg-sky-500 grid place-items-center"
                    onClick={sendStatusReply}
                    title="Send reply"
                  >
                    <bi.BiSend size={18} />
                  </button>
                </div>
              </div>
            </div>
          )}
          </div>,
          document.body
        )}

      {statusActivity.open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[970] bg-black/60"
            aria-hidden
            onClick={() => setStatusActivity((prev) => ({ ...prev, open: false }))}
          >
            <div
              className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-xl max-h-[78vh] overflow-y-auto rounded-t-3xl border border-white/10 bg-[#1f2329] px-4 pb-6 pt-2 text-white shadow-2xl status-activity-sheet"
              aria-hidden
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto mb-2 h-1.5 w-14 rounded-full bg-white/30" />
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-3xl font-bold leading-none">
                  {statusActivity.counts.views} viewers
                </h3>
                <button
                  type="button"
                  className="p-2 rounded-full hover:bg-white/10"
                  onClick={() =>
                    setStatusActivity((prev) => ({ ...prev, open: false }))
                  }
                >
                  <bi.BiX size={20} />
                </button>
              </div>

              {statusActivity.loading ? (
                <div className="py-8 flex justify-center">
                  <i className="animate-spin">
                    <bi.BiLoaderAlt size={22} />
                  </i>
                </div>
              ) : (
                <div className="grid gap-3">
                  {statusActivityRows.length === 0 && (
                    <p className="text-sm text-white/70">No viewers yet</p>
                  )}
                  {statusActivityRows.map((row) => (
                    <div
                      key={`status-activity-row-${row.userId}`}
                      className="grid grid-cols-[auto_1fr] gap-3 items-start"
                    >
                      <img
                        src={
                          resolveUploadUrl(row.profile?.avatar) ||
                          'assets/images/default-avatar.png'
                        }
                        alt=""
                        className="h-12 w-12 rounded-full object-cover"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-xl leading-tight">
                          {row.profile?.fullname || 'User'}
                        </p>
                        {row.reactions.length > 0 && (
                          <div className="mt-0.5 flex flex-wrap items-center gap-1">
                            {row.reactions.map((item, index) => (
                              <span
                                key={`reaction-${row.userId}-${index}`}
                                className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-white/10 px-1 text-base leading-none"
                              >
                                {item.emoji}
                              </span>
                            ))}
                          </div>
                        )}
                        {row.replies.length > 0 && (
                          <p className="mt-0.5 truncate text-base text-white/85">
                            {row.replies[0].text}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

export default Inbox;

