import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import * as md from 'react-icons/md';

import {
  setEditingChat,
  setReplyingChat,
  setSelectedChats,
} from '../../redux/features/chore';
import socket from '../../helpers/socket';
import config from '../../config';

import * as comp from '../../components/chat/room';
import FriendProfile from '../../pages/friendProfile';
import GroupProfile from '../../pages/groupProfile';
import ChannelProfile from '../../pages/channelProfile';
import GroupParticipant from '../../pages/groupParticipant';
import AddParticipant from '../../pages/addParticipant';

import { setPage } from '../../redux/features/page';

function Room() {
  const dispatch = useDispatch();
  const {
    user: { master },
    room: { chat: chatRoom },
    page,
  } = useSelector((state) => state);

  const [prevRoom, setPrevRoom] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [chats, setChats] = useState(null);
  const [newMessage, setNewMessage] = useState(0);
  const [control, setControl] = useState({ skip: 0, limit: 20 });
  const [searchQuery, setSearchQuery] = useState('');
  const [pinsData, setPinsData] = useState({ roomId: null, pinned: [], history: [] });

  const refreshPins = async (roomId, signal) => {
    if (!roomId) {
      setPinsData({ roomId: null, pinned: [], history: [] });
      return;
    }
    try {
      const { data } = await axios.get(`/chats/${roomId}/pins`, { signal });
      setPinsData(data?.payload || { roomId, pinned: [], history: [] });
    } catch (error0) {
      setPinsData({ roomId, pinned: [], history: [] });
    }
  };

  const mergePendingRows = (serverRows, currentRows) => {
    const rows = Array.isArray(serverRows) ? serverRows : [];
    const pending = (currentRows || []).filter(
      (item) => item?.pending || item?.sendFailed
    );
    if (!pending.length) return rows;

    const serverIds = new Set(rows.map((item) => item?._id).filter(Boolean));
    const serverClientIds = new Set(
      rows.map((item) => item?.clientMessageId).filter(Boolean)
    );
    return [
      ...rows,
      ...pending.filter(
        (item) =>
          !serverIds.has(item?._id) &&
          !serverClientIds.has(item?.clientMessageId)
      ),
    ];
  };

  const handleGetChats = async (signal) => {
    try {
      const { data } = await axios.get(`/chats/${chatRoom.data.roomId}`, {
        params: { skip: 0, limit: control.limit },
        signal,
      });

      if (data.payload.length > 0) {
        setChats((prev) => mergePendingRows(data.payload, prev));

        const callback = (mutationlist, observer) => {
          const monitor = document.querySelector('#monitor');
          if (monitor) monitor.scrollTop = monitor.scrollHeight;

          setLoaded(true);

          observer.disconnect();
        };

        const observer = new MutationObserver(callback);

        const elem = document.querySelector('#monitor-content');
        if (elem) observer.observe(elem, { childList: true });
        else setLoaded(true);

        return;
      }

      setChats((prev) => mergePendingRows([], prev));
      setLoaded(true);
    } catch (error0) {
      console.error(error0?.response?.data?.message || error0.message);
    }
  };

  const handleOpenRoom = async (signal) => {
    setLoaded(false);
    setControl({ skip: 0, limit: 20 });
    setChats(null);
    setSearchQuery('');
    dispatch(setSelectedChats(null));
    dispatch(setReplyingChat(null));
    dispatch(setEditingChat(null));
    dispatch(setPage({ target: 'friendProfile', data: false }));
    dispatch(setPage({ target: 'groupProfile', data: false }));
    dispatch(setPage({ target: 'channelProfile', data: false }));
    dispatch(setPage({ target: 'groupParticipant', data: false }));
    dispatch(setPage({ target: 'addParticipant', data: false }));

    if (chatRoom.isOpen) {
      const { roomType, group, roomId } = chatRoom.data;
      const isGroup = roomType === 'group';

      if (!isGroup || (isGroup && group.participantsId.includes(master._id))) {
        socket.emit('room/open', { prevRoom, newRoom: roomId });
        // get messages
        await handleGetChats(signal);
        await refreshPins(roomId, signal);
      } else {
        await handleGetChats(signal);
        await refreshPins(roomId, signal);
      }
    }
  };

  useEffect(() => {
    const abortCtrl = new AbortController();
    handleOpenRoom(abortCtrl.signal);

    return () => {
      abortCtrl.abort();
    };
  }, [chatRoom.isOpen, chatRoom.refreshId]);

  useEffect(() => {
    const onPinsUpdate = ({ roomId }) => {
      if (!roomId || roomId !== chatRoom?.data?.roomId) return;
      refreshPins(roomId);
    };

    socket.on('room/open', (args) => setPrevRoom(args));
    socket.on('chat/pins', onPinsUpdate);

    return () => {
      socket.off('room/open');
      socket.off('chat/pins', onPinsUpdate);
    };
  }, [chatRoom?.data?.roomId]);

  useEffect(() => {
    const handleRefreshChats = async (event) => {
      const targetRoomId = event?.detail?.roomId;
      if (!targetRoomId || targetRoomId !== chatRoom?.data?.roomId) return;

      const abortCtrl = new AbortController();
      setLoaded(false);
      setControl((prev) => ({ ...prev, skip: 0 }));
      try {
        const { data } = await axios.get(`/chats/${targetRoomId}`, {
          params: { skip: 0, limit: control.limit },
          signal: abortCtrl.signal,
        });
        setChats((prev) =>
          mergePendingRows(Array.isArray(data?.payload) ? data.payload : [], prev)
        );
      } catch (error0) {
        console.error(error0?.response?.data?.message || error0.message);
      } finally {
        setLoaded(true);
      }
    };

    window.addEventListener('syncchat:room-refresh-chats', handleRefreshChats);
    return () => {
      window.removeEventListener(
        'syncchat:room-refresh-chats',
        handleRefreshChats
      );
    };
  }, [chatRoom?.data?.roomId, control.limit]);

  useEffect(() => {
    const roomId = chatRoom?.data?.roomId;
    if (!roomId) return undefined;

    const appendWithLimit = (list, payload) => {
      const current = Array.isArray(list) ? list : [];
      if (current.length >= control.limit) {
        return [...current.slice(1), payload];
      }
      return [...current, payload];
    };

    const onOptimistic = (event) => {
      const payload = event?.detail;
      if (!payload?.clientMessageId || payload.roomId !== roomId) return;

      setChats((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        if (
          list.some(
            (item) => item?.clientMessageId === payload.clientMessageId
          )
        ) {
          return list;
        }
        return appendWithLimit(list, payload);
      });
    };

    const onConfirmed = (event) => {
      const payload = event?.detail;
      if (!payload?._id || payload.roomId !== roomId) return;

      setChats((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        const index = list.findIndex(
          (item) =>
            item?._id === payload._id ||
            (payload.clientMessageId &&
              item?.clientMessageId === payload.clientMessageId)
        );

        if (index < 0) {
          return appendWithLimit(list, {
            ...payload,
            pending: false,
            sendFailed: false,
          });
        }

        const current = list[index];
        const preserveLocalEncryptedText =
          current?.pending &&
          payload?.e2eeEnvelope &&
          payload?.text === 'Encrypted message';
        const next = [...list];
        next[index] = {
          ...current,
          ...payload,
          text: preserveLocalEncryptedText ? current.text : payload.text,
          pending: false,
          sendFailed: false,
        };
        return next;
      });
    };

    const onFailed = (event) => {
      const payload = event?.detail || {};
      if (payload.roomId && payload.roomId !== roomId) return;
      if (!payload.clientMessageId) return;

      setChats((prev) =>
        (prev || []).map((item) =>
          item?.clientMessageId === payload.clientMessageId
            ? {
                ...item,
                pending: false,
                sendFailed: true,
                sendError:
                  payload.message || payload.code || payload.reason || 'Send failed',
              }
            : item
        )
      );
    };

    window.addEventListener('syncchat:optimistic-message', onOptimistic);
    window.addEventListener('syncchat:message-confirmed', onConfirmed);
    window.addEventListener('syncchat:optimistic-message-failed', onFailed);
    window.addEventListener('syncchat:outbox-failed', onFailed);

    return () => {
      window.removeEventListener('syncchat:optimistic-message', onOptimistic);
      window.removeEventListener('syncchat:message-confirmed', onConfirmed);
      window.removeEventListener('syncchat:optimistic-message-failed', onFailed);
      window.removeEventListener('syncchat:outbox-failed', onFailed);
    };
  }, [chatRoom?.data?.roomId, control.limit]);

  return (
    <div
      className={`
        ${!chatRoom.data && 'translate-x-full md:translate-x-0'}
        transition absolute md:relative flex z-10 w-full h-full overflow-hidden
        bg-slate-100 dark:bg-spill-950
      `}
    >
      {chatRoom.data && (
        <>
          <div
            className={`${
              (page.groupProfile || page.friendProfile) &&
              '-translate-x-full sm:translate-x-0 xl:mr-[380px]'
            } ${
              page.channelProfile && '-translate-x-full sm:translate-x-0 xl:mr-[380px]'
            } transition-all w-full h-full grid grid-rows-[auto_1fr_auto] overflow-hidden bg-slate-100 dark:bg-spill-900`}
          >
            <comp.header
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              pinsData={pinsData}
              onPinsRefresh={() => refreshPins(chatRoom?.data?.roomId)}
            />
            <comp.monitor
              newMessage={newMessage}
              setNewMessage={setNewMessage}
              chats={chats}
              setChats={setChats}
              control={control}
              setControl={setControl}
              loaded={loaded}
              searchQuery={searchQuery}
              pinsData={pinsData}
              onPinsRefresh={() => refreshPins(chatRoom?.data?.roomId)}
            />
            <comp.send
              setChats={setChats}
              setNewMessage={setNewMessage}
              control={control}
            />
          </div>
          <GroupProfile />
          <ChannelProfile />
          <FriendProfile />
          <GroupParticipant />
          <AddParticipant />
        </>
      )}
      {!chatRoom.data && (
        <div className="w-full h-full flex justify-center items-center bg-slate-200 text-slate-600 dark:bg-spill-800 dark:text-spill-300">
          <div className="w-[420px] flex flex-col items-center">
            <i className="opacity-70">
              <md.MdDevices size={140} />
            </i>
            <p className="mt-4 text-center text-sm leading-6">
              {'You can use '}
              {config.brandName}
              {' on other devices such as desktop, tablet, and mobile phone.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default Room;
