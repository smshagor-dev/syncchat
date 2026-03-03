import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import moment from 'moment';
import * as ri from 'react-icons/ri';
import * as bi from 'react-icons/bi';
import axios from 'axios';
import socket from '../../../helpers/socket';
import { setChatRoom } from '../../../redux/features/room';
import InboxMenu from '../../modals/inboxMenu';
import { setModal } from '../../../redux/features/modal';
import resolveUploadUrl from '../../../helpers/resolveUploadUrl';

import {
  touchAndHoldStart,
  touchAndHoldEnd,
} from '../../../helpers/touchAndHold';
import notification from '../../../helpers/notification';

const EVENT_PREFIX = '__event__::';
const POLL_PREFIX = '__poll__::';

function Inbox({ inboxes, setInboxes }) {
  const dispatch = useDispatch();
  const {
    user: { master, setting },
    room: { chat: chatRoom },
    modal,
    page,
  } = useSelector((state) => state);
  const [callLogs, setCallLogs] = React.useState([]);
  const [callLogsLoading, setCallLogsLoading] = React.useState(false);

  const handleContextMenu = (e, elem) => {
    const inbox = document.querySelector('#inbox');

    const x = e.clientX > inbox.clientWidth / 2 ? e.clientX - 160 : e.clientX;
    const y = e.clientY > inbox.clientHeight / 2 ? e.clientY - 56 : e.clientY;

    dispatch(
      setModal({
        target: 'inboxMenu',
        data: {
          inbox: elem,
          x,
          y,
        },
      })
    );
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

  const openInboxRoom = (elem) => {
    if (chatRoom.data?.roomId === elem.roomId) return;

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
      return;
    }

    dispatch(
      setChatRoom({
        isOpen: true,
        refreshId: elem.roomId,
        data: elem,
      })
    );
  };

  const startCallFromInbox = (elem, mediaType) => {
    openInboxRoom(elem);
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

      if (isNotSender && !setting.mute) {
        const audio = new Audio('assets/sound/default-ringtone.mp3');
        audio.volume = 1;

        audio.play();

        const isGroup = payload.roomType === 'group';
        const sender = payload.owners.find(
          (elem) => elem.userId === payload.content.from
        );
        const notificationBody = (() => {
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

  return (
    <div
      id="inbox"
      className="pb-16 md:pb-0 z-0 flex flex-col overflow-y-auto bg-white scrollbar-thin scrollbar-thumb-slate-300 hover:scrollbar-thumb-slate-400 dark:bg-spill-950 dark:scrollbar-thumb-spill-700 dark:hover:scrollbar-thumb-spill-600"
    >
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
        inboxes &&
        inboxes
          .filter((elem) => !elem.deletedBy.includes(master._id))
          .map((elem) => {
            const callStatus = getCallStatusMeta(elem.content?.text);
            const eventStatus = isEventMessage(elem.content?.text);
            const pollStatus = isPollMessage(elem.content?.text);
            let previewContent = null;

            if (callStatus) {
              previewContent = (
                <span
                  className={`truncate text-sm flex items-center gap-1 ${callStatus.toneClass}`}
                >
                  <callStatus.icon />
                  <p className="truncate">{callStatus.label}</p>
                </span>
              );
            } else if (eventStatus) {
              previewContent = (
                <span className="truncate text-sm flex items-center gap-1 text-sky-600 dark:text-sky-400">
                  <bi.BiCalendarEvent />
                  <p className="truncate">Event</p>
                </span>
              );
            } else if (pollStatus) {
              previewContent = (
                <span className="truncate text-sm flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <bi.BiBarChartAlt2 />
                  <p className="truncate">Poll</p>
                </span>
              );
            } else {
              previewContent = (
                <p className="truncate text-sm text-slate-600 dark:text-spill-300">
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
                        ? elem.owners.find((x) => x.userId !== master._id)
                            ?.avatar
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
                    <p className="text-[17px] font-medium truncate text-slate-800 dark:text-spill-100">
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
                      <p>{moment(elem.content.time).fromNow()}</p>
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
                        {elem.roomType === 'group' && (
                          <p>{`${elem.content.senderName}: `}</p>
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
                    {elem.content.from !== master._id &&
                      elem.unreadMessage > 0 && (
                        <span className="min-w-5 h-5 px-1 flex justify-center items-center rounded-full bg-gradient-to-r from-sky-500 via-cyan-500 to-teal-500">
                          <p className="text-[11px] text-white font-bold">
                            {elem.unreadMessage}
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
