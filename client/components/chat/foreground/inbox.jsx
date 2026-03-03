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
import { setRefreshInbox } from '../../../redux/features/chore';
import resolveUploadUrl from '../../../helpers/resolveUploadUrl';

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
    modal,
    page,
  } = useSelector((state) => state);
  const [callLogs, setCallLogs] = React.useState([]);
  const [callLogsLoading, setCallLogsLoading] = React.useState(false);
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
  const unlockResolverRef = React.useRef(null);

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
        data: elem,
      })
    );

    return true;
  };

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
  const isPinnedInbox = (inbox) =>
    Array.isArray(inbox?.pinnedBy) && inbox.pinnedBy.includes(master?._id);
  const isManuallyUnreadInbox = (inbox) =>
    Array.isArray(inbox?.markUnreadBy) &&
    inbox.markUnreadBy.includes(master?._id);
  const isMutedInbox = (inbox) =>
    Array.isArray(inbox?.mutedBy) && inbox.mutedBy.includes(master?._id);
  const isPrivateChatLocked = (inbox) =>
    inbox?.roomType === 'private' &&
    Array.isArray(inbox?.chatLockBy) &&
    inbox.chatLockBy.includes(master?._id);
  const isPrivateLockedGroup = (inbox) =>
    inbox?.roomType === 'group' && inbox?.group?.accessType === 'private';

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
    return requestUnlockDialog(inbox, 'group');
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
    socket.on('inbox/read', (payload) => {
      setInboxes((prev) => {
        const index = prev.findIndex((elem) => elem._id === payload._id);
        prev.splice(index, 1, payload);

        return [...prev];
      });
    });

    socket.on('group/create', (payload) =>
      setInboxes((prev) => [payload, ...prev])
    );

    socket.on('inbox/delete', (roomsId) => {
      setInboxes((prev) =>
        prev.filter((elem) => !roomsId.includes(elem.roomId))
      );
    });

    socket.on('group/exit', (payload) => {
      setInboxes((prev) => [
        payload.inbox,
        ...prev.filter((elem) => elem.roomId !== payload.inbox.roomId),
      ]);
    });

    return () => {
      socket.off('group/create');
      socket.off('group/exit');
      socket.off('inbox/read');
      socket.off('inbox/delete');
    };
  }, [setting]);

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
    socket.on('inbox/find', async (payload) => {
      // concat old inboxes data with new data
      setInboxes((prev) => {
        const olds = prev.filter((elem) => elem._id !== payload._id);
        return [payload, ...olds];
      });

      const isNotSender = payload.content.from !== master._id;
      const isMuted = isMutedInbox(payload);

      if (isNotSender && !setting.mute && !isMuted) {
        const audio = new Audio('assets/sound/default-ringtone.mp3');
        audio.volume = 1;

        audio.play();

        const isGroup = payload.roomType === 'group';
        const sender = payload.owners.find(
          (elem) => elem.userId === payload.content.from
        );
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
          title: `${isGroup ? payload.group.name : sender.fullname} (@${
            sender.username
          })`,
          body: notificationBody,
          icon: resolveUploadUrl(
            isGroup ? payload.group.avatar : sender.avatar
          ),
        });
      }
    });

    return () => {
      socket.off('inbox/find');
    };
  }, [setting.mute]);

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
      className="relative pb-16 md:pb-0 z-0 flex flex-col overflow-y-auto bg-white scrollbar-thin scrollbar-thumb-slate-300 hover:scrollbar-thumb-slate-400 dark:bg-spill-950 dark:scrollbar-thumb-spill-700 dark:hover:scrollbar-thumb-spill-600"
    >
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
                  : 'Enter Group Password'}
              </h3>
            </div>
            <p className="text-sm opacity-75 mb-3">
              {unlockDialog.mode === 'private-chat'
                ? 'This chat is locked for your account.'
                : `${unlockDialog.inbox?.group?.name || 'Private group'} is locked.`}
            </p>
            <label
              htmlFor="group-unlock-password"
              className="h-10 px-3 rounded-lg border border-spill-300 dark:border-spill-700 bg-white dark:bg-spill-900 flex items-center"
            >
              <input
                id="group-unlock-password"
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
      {page.calls &&
        callLogs.map((elem) => {
          const meta = getCallListMeta(elem.text, elem.userId);
          if (!meta) return null;

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
      {page.calls && callLogsLoading && (
        <div className="p-6 text-sm text-center text-slate-500 dark:text-spill-400">
          Loading call history...
        </div>
      )}
      {page.calls && !callLogsLoading && callLogs.length === 0 && (
        <div className="p-6 text-sm text-center text-slate-500 dark:text-spill-400">
          No call history yet.
        </div>
      )}
      {!page.calls &&
        filteredInboxes &&
        filteredInboxes.map((elem) => {
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
                  modal.inboxMenu?.inboxId === elem._id) &&
                'bg-slate-200 dark:bg-spill-700'
              }
              px-3 py-3 grid grid-cols-[auto_1fr] gap-3 items-center cursor-pointer
              border-0 border-b border-solid border-slate-200
              hover:bg-slate-100 dark:border-spill-700 dark:hover:bg-spill-800
            `}
              onClick={() => openInboxRoom(elem)}
              onContextMenu={(e) => {
                e.stopPropagation();
                e.preventDefault();

                handleContextMenu(e, elem);
              }}
              onTouchStart={(e) => {
                touchAndHoldStart(() => handleContextMenu(e, elem));
              }}
              onTouchMove={() => touchAndHoldEnd()}
              onTouchEnd={() => touchAndHoldEnd()}
            >
              <img
                src={
                  resolveUploadUrl(
                    elem.roomType === 'private'
                      ? elem.owners.find((x) => x.userId !== master._id)?.avatar
                      : elem.group.avatar
                  ) ||
                  (elem.roomType === 'private'
                    ? 'assets/images/default-avatar.png'
                    : 'assets/images/default-group-avatar.png')
                }
                alt=""
                className="w-14 h-14 rounded-full object-cover flex-none border border-slate-200 dark:border-spill-700"
              />
              <div className="overflow-hidden grid gap-0.5">
                <div className="grid grid-cols-[1fr_auto] gap-3">
                  <p
                    className={`text-[17px] truncate text-slate-800 dark:text-spill-100 ${
                      hasUnreadForMe ? 'font-semibold' : 'font-medium'
                    }`}
                  >
                    {elem.roomType === 'group' &&
                      elem?.group?.accessType === 'private' && (
                        <i className="mr-1 inline-flex align-middle text-amber-600 dark:text-amber-400">
                          <bi.BiLockAlt size={14} />
                        </i>
                      )}
                    {lockedChat && (
                      <i className="mr-1 inline-flex align-middle text-amber-600 dark:text-amber-400">
                        <bi.BiLockAlt size={14} />
                      </i>
                    )}
                    {elem.roomType === 'private'
                      ? elem.owners.find((x) => x.userId !== master._id)
                          ?.fullname || '[inactive]'
                      : elem.group.name}
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
                  </span>
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
                  <span className="flex gap-1 items-center overflow-hidden">
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
                        elem?.group?.accessType === 'private' && (
                          <i className="text-amber-600 dark:text-amber-400">
                            <bi.BiLockAlt size={14} />
                          </i>
                        )}

                      {elem.file && elem.file.type === 'image' && (
                        <img
                          src={resolveUploadUrl(elem.file.url)}
                          alt=""
                          className="h-5"
                        />
                      )}
                      {elem.file && isAudioFile(elem.file) && (
                        <i>
                          <ri.RiMicFill size={20} />
                        </i>
                      )}
                      {elem.file &&
                        elem.file.type !== 'image' &&
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
    </div>
  );
}

export default Inbox;
