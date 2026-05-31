import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import * as bi from 'react-icons/bi';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { setModal } from '../../redux/features/modal';
import { setPage } from '../../redux/features/page';
import { setChatRoom } from '../../redux/features/room';
import { setRefreshInbox, setSelectedChats } from '../../redux/features/chore';
import { setSetting } from '../../redux/features/user';
import notification from '../../helpers/notification';

function RoomHeaderMenu() {
  const dispatch = useDispatch();
  const [reportDialog, setReportDialog] = React.useState({
    open: false,
    reason: '',
    loading: false,
    error: '',
  });

  const modal = useSelector((state) => state.modal);
  const chatData = useSelector((state) => state.room.chat.data);
  const master = useSelector((state) => state.user.master);
  const setting = useSelector((state) => state.user.setting);
  const {
    _id: inboxId,
    roomId,
    profile,
    group,
    roomType,
  } = useSelector((state) => state.room.chat.data);

  const isGroup = roomType === 'group';
  const isChannel = !!chatData?.channel;
  const isSecretChat =
    roomType === 'private' && !!chatData?.secretChatEnabled;
  const hasForMe = (value) =>
    Array.isArray(value) && value.includes(master?._id);
  const isMuted = hasForMe(chatData?.mutedBy);
  const isFavourite = hasForMe(chatData?.favouriteBy);
  const isListed = hasForMe(chatData?.listedBy);
  const friendId = profile?.userId;
  const isBlocked =
    !isGroup &&
    !!friendId &&
    Array.isArray(setting?.blockedUserIds) &&
    setting.blockedUserIds.includes(friendId);

  const fetchAllChats = async (targetRoomId) => {
    const limit = 200;
    let skip = 0;
    let all = [];

    // paginate until exhausted
    // backend returns ascending chunks from latest windows
    // we sort once at end for export consistency
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // eslint-disable-next-line no-await-in-loop
      const { data } = await axios.get(`/chats/${targetRoomId}`, {
        params: { skip, limit },
      });
      const chunk = Array.isArray(data?.payload) ? data.payload : [];
      all = all.concat(chunk);
      if (chunk.length < limit) break;
      skip += limit;
    }

    return all.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  };

  const exportChatHistory = async () => {
    const { data } = await axios.get(`/inboxes/${roomId}`);
    const liveInbox = data?.payload || {};
    const liveSecretChat =
      liveInbox?.roomType === 'private' && !!liveInbox?.secretChatEnabled;

    if (liveSecretChat && liveInbox?.secretExportBlocked !== false) {
      notification({
        title: 'Export blocked',
        body: 'Export is blocked in secret chat',
      });
      return;
    }
    const chats = await fetchAllChats(roomId);
    const title = isGroup
      ? group?.name || 'group'
      : profile?.fullname || 'chat';
    const lines = chats.map((chat) => {
      const at = new Date(chat.createdAt).toLocaleString();
      const sender = chat?.profile?.fullname || chat?.userId || 'unknown';
      const text = chat?.text || chat?.file?.originalname || '[attachment]';
      return `[${at}] ${sender}: ${text}`;
    });
    const blob = new Blob([lines.join('\n')], {
      type: 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${String(title).replace(/[^\w-]+/g, '_')}_history.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const clearHistory = async () => {
    // eslint-disable-next-line no-alert
    if (!window.confirm('Clear this chat history from your account?')) return;
    await axios.delete(`/chats/${roomId}`);
    dispatch(
      setChatRoom({
        isOpen: true,
        refreshId: Date.now(),
        data: chatData,
      })
    );
  };

  const closeMenu = () => dispatch(setModal({ target: 'roomHeaderMenu', data: false }));
  const refreshInbox = () => dispatch(setRefreshInbox(uuidv4()));

  const runMenuAction = async (handler, { refresh = false, close = true } = {}) => {
    try {
      await handler();
      if (refresh) refreshInbox();
    } catch (error0) {
      notification({
        title: 'Action failed',
        body: error0?.response?.data?.message || error0.message,
      });
    } finally {
      if (close) closeMenu();
    }
  };

  const togglePreference = (action, value) =>
    runMenuAction(
      () =>
        axios.patch(`/inboxes/${roomId}/preferences`, {
          action,
          value,
        }),
      { refresh: true, close: true }
    );

  const openReportDialog = () =>
    setReportDialog({
      open: true,
      reason: '',
      loading: false,
      error: '',
    });

  const closeReportDialog = () =>
    setReportDialog({
      open: false,
      reason: '',
      loading: false,
      error: '',
    });

  const submitReport = async () => {
    try {
      const reason = String(reportDialog.reason || '').trim();
      if (reason.length < 3) {
        setReportDialog((prev) => ({
          ...prev,
          error: 'Reason must be at least 3 characters',
        }));
        return;
      }

      setReportDialog((prev) => ({
        ...prev,
        loading: true,
        error: '',
      }));

      await axios.post('/reports/chat', {
        roomId,
        roomType,
        targetId: isGroup ? group?._id : profile?.userId,
        reason: reason.slice(0, 500),
      });

      notification({
        title: 'Report submitted',
        body: 'Thanks. We received your report.',
      });
      closeReportDialog();
    } catch (error0) {
      setReportDialog((prev) => ({
        ...prev,
        loading: false,
        error: error0?.response?.data?.message || error0.message,
      }));
    }
  };

  return (
    <>
      <div
        className={`${
          modal.roomHeaderMenu ? 'z-10' : 'scale-0 -z-10'
        } transition absolute right-0 top-0 w-64 max-h-[70vh] overflow-y-auto py-2 rounded-md shadow-xl -translate-x-6 translate-y-14 bg-white dark:bg-spill-700`}
        aria-hidden
        onClick={(e) => e.stopPropagation()}
      >
        <div className="grid">
          {[
          {
            _key: 'k-01',
            html: isGroup
              ? isChannel
                ? 'Channel info'
                : 'Group info'
              : 'Contact info',
            icon: <bi.BiInfoCircle />,
            action() {
              if (!isGroup && !profile.active) {
                return;
              }
              dispatch(
                setPage({
                  target: isGroup
                    ? isChannel
                      ? 'channelProfile'
                      : 'groupProfile'
                    : 'friendProfile',
                  data: isGroup
                    ? isChannel
                      ? {
                          channelId: chatData.channel._id,
                          roomId,
                          title: chatData.channel?.name || 'Channel',
                        }
                      : {
                          groupId: group._id,
                          roomId,
                          title: group?.name || 'Group',
                        }
                    : {
                        userId: profile.userId,
                        roomId,
                        title: profile?.fullname || 'Contact',
                      },
                })
              );
            },
            style: '',
          },
          {
            _key: 'k-01a',
            html: 'Secret chat settings',
            icon: <bi.BiShieldQuarter />,
            action() {
              if (isGroup || !profile?.active) return;
              dispatch(
                setPage({
                  target: 'friendProfile',
                  data: {
                    userId: profile.userId,
                    roomId,
                    title: profile?.fullname || 'Contact',
                  },
                })
              );
            },
            style: isGroup ? 'hidden' : 'block',
          },
          {
            _key: 'k-02',
            html: 'Select message',
            icon: <bi.BiCheckCircle />,
            action() {
              dispatch(setSelectedChats([]));
            },
            style: '',
          },
          {
            _key: 'k-03',
            html: isMuted ? 'Unmute Notification' : 'Mute Notification',
            icon: isMuted ? <bi.BiBell /> : <bi.BiBellOff />,
            action() {
              togglePreference('mute', !isMuted);
            },
            style: '',
          },
          {
            _key: 'k-03a',
            html: isFavourite ? 'Remove from favourite' : 'Add to favourite',
            icon: <bi.BiStar />,
            action() {
              togglePreference('favourite', !isFavourite);
            },
            style: '',
          },
          {
            _key: 'k-03b',
            html: isListed ? 'Remove from list' : 'Add to list',
            icon: <bi.BiListUl />,
            action() {
              togglePreference('list', !isListed);
            },
            style: '',
          },
          {
            _key: 'k-04',
            html: 'Close chat',
            icon: <bi.BiArrowBack />,
            action() {
              dispatch(
                setChatRoom({
                  isOpen: false,
                  refreshId: null,
                  data: null,
                })
              );
            },
            style: '',
          },
          {
            _key: 'k-hr-1',
            divider: true,
          },
          {
            _key: 'k-05',
            html: 'Report',
            icon: <bi.BiErrorCircle />,
            action() {
              openReportDialog();
            },
            style: '',
          },
          {
            _key: 'k-06',
            html: isBlocked ? 'Unblock' : 'Block',
            icon: <bi.BiBlock />,
            action() {
              runMenuAction(
                async () => {
                  const { data } = await axios.put(
                    `/contacts/${friendId}/${isBlocked ? 'unblock' : 'block'}`
                  );
                  dispatch(
                    setSetting({
                      ...setting,
                      blockedUserIds: data?.payload?.blockedUserIds || [],
                    })
                  );
                },
                { close: true, refresh: false }
              );
            },
            style: isGroup ? 'hidden' : 'text-rose-600 dark:text-rose-400',
          },
          {
            _key: 'k-07',
            html: 'Clear chat',
            icon: <bi.BiEraser />,
            async action() {
              await runMenuAction(
                () => axios.post(`/inboxes/${roomId}/clear`),
                { refresh: true, close: true }
              );
            },
            style: 'text-rose-600 dark:text-rose-400',
          },
          {
            _key: 'k-08',
            html: 'Delete chat',
            icon: <bi.BiTrashAlt />,
            action() {
              dispatch(
                setModal({
                  target: 'confirmDeleteChatAndInbox',
                  data: { inboxId, roomId },
                })
              );
            },
            style: 'text-rose-600 dark:text-rose-400',
          },
          {
            _key: 'k-hr-2',
            divider: true,
          },
          {
            _key: 'k-09',
            html: 'Share contact',
            icon: <bi.BiShareAlt />,
            action() {
              if (isGroup || !profile?.active) return;
              const payload = {
                userId: profile.userId,
                username: profile.username,
                fullname: profile.fullname,
                avatar: profile.avatar,
                phone: profile.phone,
                email: profile.email,
              };

              dispatch(
                setModal({
                  target: 'shareContact',
                  data: payload,
                })
              );
              setTimeout(() => {
                dispatch(
                  setModal({
                    target: 'shareContact',
                    data: payload,
                  })
                );
              }, 0);
            },
            style: isGroup ? 'hidden' : 'block',
          },
          {
            _key: 'k-10',
            html: 'Set wallpaper',
            icon: <bi.BiImage />,
            action() {
              dispatch(
                setModal({
                  target: 'roomAppearance',
                  data: roomId,
                })
              );
            },
            style: '',
          },
          {
            _key: 'k-11',
            html: isSecretChat ? 'Export blocked in secret chat' : 'Export chat history',
            icon: <bi.BiExport />,
            async action() {
              await exportChatHistory();
            },
            style: isSecretChat
              ? 'text-slate-400 dark:text-spill-500'
              : '',
          },
          {
            _key: 'k-12',
            html: 'Clear history',
            icon: <bi.BiEraser />,
            async action() {
              await clearHistory();
            },
            style: 'text-rose-600 dark:text-rose-400',
          },
          {
            _key: 'k-13',
            html: isChannel ? 'Exit channel' : 'Exit group',
            icon: <bi.BiExit />,
            action() {
              dispatch(
                setModal({
                  target: 'confirmExitGroup',
                  data: {
                    groupId: group._id,
                    channelId: isChannel ? chatData.channel._id : null,
                    name: chatData.channel?.name || group.name,
                  },
                })
              );
            },
            style: isGroup
              ? 'block text-rose-600 dark:text-rose-400'
              : 'hidden',
          },
          ].map((elem) =>
            elem.divider ? (
              <hr
                key={elem._key}
                className="my-1 border-0 border-t border-slate-200 dark:border-spill-600"
              />
            ) : (
              <button
                key={elem._key}
                type="button"
                className={`${elem.style} py-2 px-4 flex gap-4 items-center cursor-pointer hover:bg-spill-200 dark:hover:bg-spill-600`}
                onClick={() => {
                  dispatch(
                    setModal({ target: 'roomHeaderMenu', data: false })
                  );
                  elem.action();
                }}
              >
                <i className="opacity-80">{elem.icon}</i>
                <p>{elem.html}</p>
              </button>
            )
          )}
        </div>
      </div>

      {reportDialog.open && (
        <div
          className="fixed inset-0 z-[160] bg-black/40 backdrop-blur-[1px] flex justify-center items-center px-3"
          aria-hidden
          onClick={closeReportDialog}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-spill-200 bg-white p-4 shadow-2xl dark:bg-spill-900 dark:border-spill-700"
            aria-hidden
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Report chat</h2>
              <button
                type="button"
                className="p-2 rounded-full hover:bg-spill-100 dark:hover:bg-spill-800"
                onClick={closeReportDialog}
                disabled={reportDialog.loading}
              >
                <bi.BiX />
              </button>
            </div>
            <p className="mt-2 text-sm opacity-80">
              Tell us what happened. Your report will be reviewed.
            </p>
            <textarea
              value={reportDialog.reason}
              onChange={(e) =>
                setReportDialog((prev) => ({
                  ...prev,
                  reason: e.target.value,
                }))
              }
              placeholder="Write report reason..."
              rows={5}
              className="mt-3 w-full rounded-xl border border-spill-300 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500 dark:border-spill-700 dark:bg-spill-950"
            />
            {reportDialog.error && (
              <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
                {reportDialog.error}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="h-10 px-4 rounded-lg border border-spill-300 dark:border-spill-700 hover:bg-spill-100 dark:hover:bg-spill-800"
                onClick={closeReportDialog}
                disabled={reportDialog.loading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="h-10 px-4 rounded-lg bg-rose-600 text-white font-semibold hover:bg-rose-700 disabled:opacity-60"
                onClick={submitReport}
                disabled={reportDialog.loading}
              >
                {reportDialog.loading ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default RoomHeaderMenu;
