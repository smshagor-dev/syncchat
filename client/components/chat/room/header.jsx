import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import moment from 'moment';
import * as bi from 'react-icons/bi';
import axios from 'axios';
import { setChatRoom } from '../../../redux/features/room';
import { setPage } from '../../../redux/features/page';
import { setSelectedChats } from '../../../redux/features/chore';
import { setModal } from '../../../redux/features/modal';
import socket from '../../../helpers/socket';
import RoomHeaderMenu from '../../modals/roomHeaderMenu';

function Header({ searchQuery, setSearchQuery }) {
  const dispatch = useDispatch();
  const {
    room: { chat: chatRoom },
    user: { master },
    chore: { selectedChats, refreshGroupAvatar },
    page,
  } = useSelector((state) => state);

  const isGroup = chatRoom.data.roomType === 'group';

  const [subhead, setSubhead] = useState('');
  const [statusTimeout, setStatusTimeout] = useState(null);
  const [typing, setTyping] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);

  const handleGetParticipantsName = async (signal) => {
    try {
      const { data } = await axios.get(
        `/groups/${chatRoom.data.group._id}/participants/name`,
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
      isGroup ? 'click here for group info' : 'click here for contact info'
    );

    clearTimeout(statusTimeout);

    setStatusTimeout(
      setTimeout(() => {
        if (isGroup) {
          handleGetParticipantsName(signal);
        } else {
          const lastSeen = moment(chatRoom.data.profile.updatedAt).fromNow();
          setSubhead(
            chatRoom.data.profile.online ? 'online' : `last seen ${lastSeen}`
          );
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
      // user online
      socket.on('user/connect', (userId) => {
        if (userId === chatRoom.data.profile.userId) {
          setSubhead('online');
          setOnlineStatus({ online: true });
        }
      });

      // user offline
      socket.on('user/disconnect', (userId) => {
        if (userId === chatRoom.data.profile.userId) {
          const updatedAt = new Date().toISOString();

          setSubhead(`last seen ${moment(updatedAt).fromNow()}`);
          setOnlineStatus({
            online: false,
            updatedAt,
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

  return (
    <nav className="h-16 grid grid-cols-[1fr_auto] gap-4 justify-between items-center bg-white dark:bg-spill-900">
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
                className="grid grid-cols-[auto_1fr] gap-4 items-center cursor-pointer min-w-0"
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

                  if (isGroup && !page.groupProfile) {
                    dispatch(
                      setPage({
                        target: 'groupProfile',
                        data: chatRoom.data.group._id,
                      })
                    );
                  }
                }}
              >
                <img
                  src={
                    isGroup
                      ? refreshGroupAvatar ||
                        chatRoom.data.group.avatar ||
                        'assets/images/default-group-avatar.png'
                      : chatRoom.data.profile.avatar ||
                        'assets/images/default-avatar.png'
                  }
                  alt=""
                  className="w-10 h-10 rounded-full"
                />
                <span className="overflow-hidden">
                  <p className="font-bold truncate flex items-center">
                    {isGroup && (
                      <i className="mr-1 inline-flex align-middle text-sky-600 dark:text-sky-400">
                        <bi.BiGroup size={14} />
                      </i>
                    )}
                    {isGroup &&
                      chatRoom?.data?.group?.accessType === 'private' && (
                        <i className="mr-1 inline-flex align-middle text-amber-600 dark:text-amber-400">
                          <bi.BiLockAlt size={14} />
                        </i>
                      )}
                    {isGroup
                      ? chatRoom.data.group.name
                      : chatRoom.data.profile.fullname}
                  </p>
                  <p className="text-sm opacity-60 truncate">
                    {typing ?? subhead}
                    {isGroup &&
                      chatRoom?.data?.group?.accessType === 'private' &&
                      !typing &&
                      ' • secure content'}
                  </p>
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
