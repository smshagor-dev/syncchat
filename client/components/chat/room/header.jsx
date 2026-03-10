import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import * as bi from 'react-icons/bi';
import axios from 'axios';
import { setChatRoom } from '../../../redux/features/room';
import { setPage } from '../../../redux/features/page';
import { setSelectedChats } from '../../../redux/features/chore';
import { setModal } from '../../../redux/features/modal';
import socket from '../../../helpers/socket';
import RoomHeaderMenu from '../../modals/roomHeaderMenu';
import { getPresenceMeta } from '../../../helpers/presence';
import resolveUploadUrl from '../../../helpers/resolveUploadUrl';

function Header({ searchQuery, setSearchQuery, pinsData, onPinsRefresh }) {
  const dispatch = useDispatch();
  const {
    room: { chat: chatRoom },
    user: { master },
    chore: { selectedChats, refreshGroupAvatar },
    page,
  } = useSelector((state) => state);

  const isGroup = chatRoom.data.roomType === 'group';
  const isChannel = !!chatRoom.data.channel;

  const [subhead, setSubhead] = useState('');
  const [statusTimeout, setStatusTimeout] = useState(null);
  const [typing, setTyping] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [pinsExpanded, setPinsExpanded] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const pinnedItems = useMemo(
    () => (Array.isArray(pinsData?.pinned) ? pinsData.pinned : []),
    [pinsData]
  );

  const pinHistory = useMemo(
    () => (Array.isArray(pinsData?.history) ? pinsData.history : []),
    [pinsData]
  );

  const getPinPreview = (entry) => {
    if (!entry?.chat) return '[message unavailable]';
    const text = String(entry.chat.text || '').trim();
    if (text) return text;
    const fileName = String(entry.chat.file?.originalname || '').trim();
    if (fileName) return fileName;
    return '[attachment]';
  };

  const jumpToChat = (chatId) => {
    if (!chatId) return;
    window.dispatchEvent(
      new CustomEvent('syncchat:jump-to-chat', {
        detail: { chatId },
      })
    );
  };

  const handleUnpin = async (chatId) => {
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

  const handleGetParticipantsName = async (signal) => {
    try {
      const entityPath = isChannel ? 'channels' : 'groups';
      const { data } = await axios.get(
        `/${entityPath}/${chatRoom.data.group._id}/participants/name`,
        { signal }
      );
      setSubhead(data.payload.join(', '));
    } catch (error0) {
      console.error(error0.message);
    }
  };

  const handleSubhead = (signal) => {
    setTyping(null);
    setSubhead(
      isGroup
        ? `click here for ${isChannel ? 'channel' : 'group'} info`
        : 'click here for contact info'
    );

    clearTimeout(statusTimeout);

    setStatusTimeout(
      setTimeout(() => {
        if (isGroup) {
          handleGetParticipantsName(signal);
        } else {
          setSubhead(getPresenceMeta(chatRoom.data.profile).text);
        }
      }, 3000)
    );
  };

  useEffect(() => {
    const abortCtrl = new AbortController();
    handleSubhead(abortCtrl.signal);

    return () => {
      abortCtrl.abort();
    };
  }, [chatRoom.isOpen, chatRoom.refreshId]);

  const setOnlineStatus = (args) => {
    dispatch(
      setChatRoom({
        isOpen: true,
        refreshId: chatRoom.refreshId,
        data: {
          ...chatRoom.data,
          profile: {
            ...chatRoom.data.profile,
            ...args,
          },
        },
      })
    );
  };

  useEffect(() => {
    if (!isGroup) {
      socket.on('user/connect', (userId) => {
        if (userId === chatRoom.data.profile.userId) {
          const nextProfile = {
            ...chatRoom.data.profile,
            online: true,
          };
          setSubhead(getPresenceMeta(nextProfile).text);
          setOnlineStatus({ online: true });
        }
      });

      socket.on('user/disconnect', (userId) => {
        if (userId === chatRoom.data.profile.userId) {
          const updatedAt = new Date().toISOString();
          const nextProfile = {
            ...chatRoom.data.profile,
            online: false,
            updatedAt,
            lastSeenAt: updatedAt,
          };
          setSubhead(getPresenceMeta(nextProfile).text);
          setOnlineStatus({
            online: false,
            updatedAt,
            lastSeenAt: updatedAt,
          });
        }
      });
    }

    socket.on('chat/typing', (message) => setTyping(message));
    socket.on('chat/typing-ends', () => setTyping(null));

    return () => {
      socket.off('user/connect');
      socket.off('user/disconnect');
      socket.off('chat/typing');
      socket.off('chat/typing-ends');
    };
  }, []);

  useEffect(() => {
    if (!searchOpen && searchQuery) {
      setSearchQuery('');
    }
  }, [searchOpen, searchQuery, setSearchQuery]);

  useEffect(() => {
    setPinsExpanded(false);
    setHistoryOpen(false);
  }, [chatRoom?.data?.roomId]);

  return (
    <nav className="min-h-16 py-2 grid grid-cols-[1fr_auto] gap-4 justify-between items-start bg-white dark:bg-spill-900">
      <RoomHeaderMenu />
      {!selectedChats && (
        <>
          <div className="pl-2 md:pl-4 flex gap-2 items-center min-w-0">
            <button
              type="button"
              className="block md:hidden p-2 rounded-full hover:bg-spill-100 dark:hover:bg-spill-800"
              onClick={() =>
                dispatch(
                  setChatRoom({
                    isOpen: false,
                    refreshId: null,
                    data: null,
                  })
                )
              }
            >
              <i>
                <bi.BiArrowBack />
              </i>
            </button>
            {!searchOpen && (
              <div
                className="grid w-full flex-1 grid-cols-[auto_1fr] gap-4 items-start cursor-pointer min-w-0"
                aria-hidden
                onClick={() => {
                  if (
                    !isGroup &&
                    chatRoom.data.profile.active &&
                    !page.friendProfile
                  ) {
                    dispatch(
                      setPage({
                        target: 'friendProfile',
                        data: chatRoom.data.profile.userId,
                      })
                    );
                    return;
                  }

                  if (isGroup) {
                    dispatch(
                      setPage({
                        target: isChannel ? 'channelProfile' : 'groupProfile',
                        data: isChannel
                          ? {
                              channelId:
                                chatRoom.data.channel?._id ||
                                chatRoom.data.group?._id ||
                                null,
                              roomId: chatRoom.data.roomId || null,
                              title:
                                chatRoom.data.channel?.name ||
                                chatRoom.data.group?.name ||
                                'Channel',
                            }
                          : chatRoom.data.group._id,
                      })
                    );
                  }
                }}
              >
                <div className="relative flex-none">
                  <img
                    src={
                      isGroup
                        ? refreshGroupAvatar ||
                          chatRoom.data.channel?.avatar ||
                          chatRoom.data.group.avatar ||
                          'assets/images/default-group-avatar.png'
                        : chatRoom.data.profile.avatar ||
                          'assets/images/default-avatar.png'
                    }
                    alt=""
                    className="w-10 h-10 rounded-full"
                  />
                  {!isGroup && getPresenceMeta(chatRoom.data.profile).showDot && (
                    <span className="absolute right-0 bottom-0 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500 dark:border-spill-900" />
                  )}
                </div>
                <span className="block w-full overflow-hidden">
                  <p className="font-bold truncate flex items-center">
                    {isGroup && (
                      <i className="mr-1 inline-flex align-middle text-sky-600 dark:text-sky-400">
                        {isChannel ? <bi.BiBroadcast size={14} /> : <bi.BiGroup size={14} />}
                      </i>
                    )}
                    {isGroup &&
                      chatRoom?.data?.group?.accessType === 'private' && (
                        <i className="mr-1 inline-flex align-middle text-amber-600 dark:text-amber-400">
                          <bi.BiLockAlt size={14} />
                        </i>
                      )}
                    {isGroup
                      ? chatRoom.data.channel?.name || chatRoom.data.group.name
                      : chatRoom.data.profile.fullname}
                  </p>
                  <p className="text-sm opacity-60 truncate">
                    {typing ?? subhead}
                    {isGroup &&
                      chatRoom?.data?.group?.accessType === 'private' &&
                      !typing &&
                      ' | secure content'}
                  </p>
                  {!typing && !searchOpen && pinnedItems.length > 0 && (
                    <div
                      className="relative mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50/95 px-2 py-1.5 text-xs dark:border-spill-700 dark:bg-spill-800/90"
                      onClick={(e) => e.stopPropagation()}
                      aria-hidden
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1 font-semibold text-sky-700 dark:text-sky-300">
                          <bi.BiPin />
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-slate-200 dark:hover:bg-spill-700"
                            onClick={() => setPinsExpanded((prev) => !prev)}
                          >
                            <span>Pinned Messages ({pinnedItems.length})</span>
                            {pinsExpanded ? (
                              <bi.BiChevronUp size={14} />
                            ) : (
                              <bi.BiChevronDown size={14} />
                            )}
                          </button>
                        </span>
                        <button
                          type="button"
                          className="rounded p-1 hover:bg-slate-200 dark:hover:bg-spill-700"
                          title="Pin history"
                          onClick={() => setHistoryOpen((prev) => !prev)}
                        >
                          <bi.BiDotsVerticalRounded size={16} />
                        </button>
                      </div>
                      {pinsExpanded && (
                        <div className="mt-1 grid gap-1.5">
                          {pinnedItems.map((item) => (
                            <div
                              key={item.chatId}
                              className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-md bg-white/80 px-2 py-1.5 dark:bg-spill-900/60"
                            >
                              <img
                                src={
                                  resolveUploadUrl(item.pinnedByProfile?.avatar) ||
                                  'assets/images/default-avatar.png'
                                }
                                alt=""
                                className="h-7 w-7 rounded-full object-cover"
                              />
                              <button
                                type="button"
                                className="min-w-0 text-left hover:opacity-90"
                                onClick={() => jumpToChat(item.chatId)}
                              >
                                <p className="truncate font-semibold text-slate-700 dark:text-spill-100">
                                  {item.pinnedByProfile?.fullname || 'Unknown user'}
                                </p>
                                <p className="truncate opacity-80">
                                  {getPinPreview(item)}
                                </p>
                              </button>
                              <button
                                type="button"
                                className="rounded px-1.5 py-0.5 text-[11px] font-medium text-rose-600 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-900/20"
                                onClick={() => handleUnpin(item.chatId)}
                              >
                                Unpin
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      {historyOpen && (
                        <div className="absolute right-2 top-8 z-20 w-[320px] rounded-md border border-slate-200 bg-white p-1.5 shadow-md dark:border-spill-700 dark:bg-spill-900">
                          <div className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide opacity-70">
                            Pin History
                          </div>
                          <div className="max-h-44 overflow-y-auto">
                            {pinHistory.length === 0 && (
                              <p className="px-1 text-[11px] opacity-70">
                                No history
                              </p>
                            )}
                            {pinHistory.map((item) => (
                              <button
                                key={`${item.chatId}-${item.at}-${item.action}`}
                                type="button"
                                className="mb-1 w-full rounded px-1 py-1 text-left hover:bg-slate-100 dark:hover:bg-spill-800 last:mb-0"
                                onClick={() => jumpToChat(item.chatId)}
                              >
                                <p className="truncate text-[11px] font-medium">
                                  {item.actorProfile?.fullname || 'Unknown'} {item.action}ed
                                </p>
                                <p className="truncate text-[11px] opacity-70">
                                  {new Date(item.at).toLocaleString()}
                                </p>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </span>
              </div>
            )}
            {searchOpen && (
              <label
                htmlFor="chat-search"
                className="h-10 w-full max-w-md rounded-full border border-slate-200 px-3 bg-slate-100 dark:bg-spill-800 dark:border-spill-700 grid grid-cols-[auto_1fr_auto] items-center gap-2"
              >
                <bi.BiSearch className="opacity-70" />
                <input
                  id="chat-search"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search in chat..."
                  className="bg-transparent text-sm outline-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="p-1 rounded-full hover:bg-slate-200 dark:hover:bg-spill-700"
                    onClick={() => setSearchQuery('')}
                  >
                    <bi.BiX />
                  </button>
                )}
              </label>
            )}
          </div>
          <div className="pr-2 flex items-center">
            <button
              type="button"
              className="p-2 rounded-full hover:bg-spill-100 dark:hover:bg-spill-800"
              onClick={(e) => {
                e.stopPropagation();
                setSearchOpen((prev) => !prev);
              }}
            >
              <i>{searchOpen ? <bi.BiX /> : <bi.BiSearch />}</i>
            </button>
            <>
              <button
                type="button"
                className="p-2 rounded-full hover:bg-spill-100 dark:hover:bg-spill-800"
                onClick={(e) => {
                  e.stopPropagation();
                  dispatch(
                    setModal({
                      target: 'callPanel',
                      data: {
                        mode: 'outgoing',
                        roomId: chatRoom.data.roomId,
                        roomType: chatRoom.data.roomType,
                        mediaType: 'audio',
                        fromUserId: master._id,
                        fromName: master.fullname,
                        fromUsername: master.username,
                      },
                    })
                  );
                }}
              >
                <i>
                  <bi.BiPhone />
                </i>
              </button>
              <button
                type="button"
                className="p-2 rounded-full hover:bg-spill-100 dark:hover:bg-spill-800"
                onClick={(e) => {
                  e.stopPropagation();
                  dispatch(
                    setModal({
                      target: 'callPanel',
                      data: {
                        mode: 'outgoing',
                        roomId: chatRoom.data.roomId,
                        roomType: chatRoom.data.roomType,
                        mediaType: 'video',
                        fromUserId: master._id,
                        fromName: master.fullname,
                        fromUsername: master.username,
                      },
                    })
                  );
                }}
              >
                <i>
                  <bi.BiVideo />
                </i>
              </button>
            </>
            <button
              type="button"
              className="p-2 rounded-full hover:bg-spill-100 dark:hover:bg-spill-800"
              onClick={(e) => {
                e.stopPropagation();
                dispatch(setModal({ target: 'roomHeaderMenu' }));
              }}
            >
              <i>
                <bi.BiDotsVerticalRounded />
              </i>
            </button>
          </div>
        </>
      )}
      {selectedChats && (
        <>
          <div className="pl-2 grid grid-cols-[auto_1fr] gap-4 items-center">
            <button
              type="button"
              className="p-2 rounded-full hover:bg-spill-100 dark:hover:bg-spill-800"
              onClick={() => dispatch(setSelectedChats(null))}
            >
              <i>
                <bi.BiArrowBack />
              </i>
            </button>
            <p className="font-bold">{selectedChats.length}</p>
          </div>
          {((isGroup &&
            chatRoom.data.group.participantsId.includes(master._id)) ||
            (!isGroup && chatRoom.data.profile.active)) && (
            <div className="pr-2 flex items-center">
              {[
                {
                  target: 'delete',
                  icon: <bi.BiTrashAlt />,
                  async action() {
                    dispatch(setModal({ target: 'confirmDeleteChat' }));
                  },
                },
              ].map((elem) => (
                <button
                  key={elem.target}
                  type="button"
                  className="p-2 rounded-full hover:bg-spill-100 dark:hover:bg-spill-800"
                  onClick={(e) => {
                    e.stopPropagation();
                    const { group } = chatRoom.data;

                    if (
                      !isGroup ||
                      (isGroup && group.participantsId.includes(master._id))
                    ) {
                      elem.action();
                    }
                  }}
                >
                  <i>{elem.icon}</i>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </nav>
  );
}

export default Header;
