import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import * as bi from 'react-icons/bi';
import axios from 'axios';
import { setModal } from '../../redux/features/modal';
import { setPage } from '../../redux/features/page';
import { setChatRoom } from '../../redux/features/room';
import { setSelectedChats } from '../../redux/features/chore';

function RoomHeaderMenu() {
  const dispatch = useDispatch();

  const modal = useSelector((state) => state.modal);
  const chatData = useSelector((state) => state.room.chat.data);
  const {
    _id: inboxId,
    roomId,
    profile,
    group,
    roomType,
  } = useSelector((state) => state.room.chat.data);

  const isGroup = roomType === 'group';

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

  return (
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
            html: isGroup ? 'Group info' : 'Contact info',
            icon: <bi.BiInfoCircle />,
            action() {
              const query = {};

              if (!isGroup && !profile.active) {
                return;
              }

              query.target = isGroup ? 'groupProfile' : 'friendProfile';
              query.data = isGroup ? group._id : profile.userId;

              dispatch(setPage(query));
            },
            style: '',
          },
          {
            _key: 'k-02',
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
            _key: 'k-03',
            html: 'Select messages',
            icon: <bi.BiCheckCircle />,
            action() {
              dispatch(setSelectedChats([]));
            },
            style: '',
          },
          {
            _key: 'k-03a',
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
            _key: 'k-03b',
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
            _key: 'k-03c',
            html: 'Export chat history',
            icon: <bi.BiExport />,
            async action() {
              await exportChatHistory();
            },
            style: '',
          },
          {
            _key: 'k-03d',
            html: 'Clear history',
            icon: <bi.BiEraser />,
            async action() {
              await clearHistory();
            },
            style: 'text-rose-600 dark:text-rose-400',
          },
          {
            _key: 'k-04',
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
            style: isGroup
              ? 'hidden'
              : 'block text-rose-600 dark:text-rose-400',
          },
          {
            _key: 'k-05',
            html: 'Exit group',
            icon: <bi.BiExit />,
            action() {
              dispatch(
                setModal({
                  target: 'confirmExitGroup',
                  data: { groupId: group._id, name: group.name },
                })
              );
            },
            style: isGroup
              ? 'block text-rose-600 dark:text-rose-400'
              : 'hidden',
          },
        ].map((elem) => (
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
        ))}
      </div>
    </div>
  );
}

export default RoomHeaderMenu;
