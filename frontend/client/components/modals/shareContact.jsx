import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import * as bi from 'react-icons/bi';
import socket from '../../helpers/socket';
import { setModal } from '../../redux/features/modal';
import resolveUploadUrl from '../../helpers/resolveUploadUrl';

function ShareContact() {
  const dispatch = useDispatch();
  const {
    modal: { shareContact },
    user: { master },
  } = useSelector((state) => state);

  const [inboxes, setInboxes] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [persistedShareContact, setPersistedShareContact] = useState(null);
  const openedAtRef = useRef(0);
  const activeShareContact = shareContact || persistedShareContact;
  const isForwardMode = activeShareContact?.mode === 'forward';

  const closeModal = () => {
    setPersistedShareContact(null);
    dispatch(setModal({ target: 'shareContact', data: false }));
  };

  const handleBackdropClose = () => {
    // Prevent accidental instant-close right after opening.
    if (Date.now() - openedAtRef.current < 250) return;
    closeModal();
  };

  useEffect(() => {
    if (shareContact) {
      setPersistedShareContact(shareContact);
      openedAtRef.current = Date.now();
    }
  }, [shareContact]);

  useEffect(() => {
    const abortCtrl = new AbortController();

    const loadInboxes = async () => {
      if (!activeShareContact) {
        setInboxes([]);
        setUsers([]);
        setSearch('');
        setStatus('');
        return;
      }

      try {
        setLoading(true);
        const { data } = await axios.get('/inboxes', {
          signal: abortCtrl.signal,
        });
        setInboxes(data.payload || []);
      } catch (error0) {
        setInboxes([]);
        setStatus(error0?.response?.data?.message || error0.message);
      } finally {
        setLoading(false);
      }
    };

    loadInboxes();

    return () => abortCtrl.abort();
  }, [!!activeShareContact]);

  useEffect(() => {
    const abortCtrl = new AbortController();

    const runUserSearch = async () => {
      const q = search.trim();
      if (!activeShareContact || q.length < 2) {
        setUsers([]);
        return;
      }

      try {
        const { data } = await axios.get('/contacts/search', {
          params: { q },
          signal: abortCtrl.signal,
        });
        setUsers(data.payload || []);
      } catch (error0) {
        setUsers([]);
      }
    };

    const t = setTimeout(runUserSearch, 300);
    return () => {
      clearTimeout(t);
      abortCtrl.abort();
    };
  }, [search, !!activeShareContact]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const source = isForwardMode
      ? inboxes.filter(
          (inbox) =>
            !(
              inbox?.secretChatEnabled &&
              (inbox?.secretForwardBlocked ?? true)
            )
        )
      : inboxes;
    if (!q) return source;

    return source.filter((inbox) => {
      if (inbox.roomType === 'group') {
        return (inbox.group?.name || '').toLowerCase().includes(q);
      }
      const friend = (inbox.owners || []).find(
        (item) => item.userId !== master._id
      );
      return (
        (friend?.fullname || '').toLowerCase().includes(q) ||
        (friend?.username || '').toLowerCase().includes(q)
      );
    });
  }, [inboxes, isForwardMode, search, master?._id]);

  const buildShareText = () =>
    `Shared contact:\n${activeShareContact.fullname}\n@${
      activeShareContact.username
    }${activeShareContact.phone ? `\nPhone: ${activeShareContact.phone}` : ''}${
      activeShareContact.email ? `\nEmail: ${activeShareContact.email}` : ''
    }`;

  const getLiveInbox = async (roomId) => {
    if (!roomId) return null;
    const { data } = await axios.get(`/inboxes/${roomId}`);
    return data?.payload || null;
  };

  const emitShare = ({ roomId, roomType, ownersId }) => {
    if (!activeShareContact) return;

    socket.emit('chat/insert', {
      text: buildShareText(),
      file: null,
      ownersId,
      roomType,
      userId: master._id,
      roomId,
    });
  };

  const handleShareToInbox = (inbox) => {
    (async () => {
      try {
        if (isForwardMode) {
          const [fromInbox, toInbox] = await Promise.all([
            getLiveInbox(activeShareContact.fromRoomId),
            getLiveInbox(inbox.roomId),
          ]);

          if (
            (fromInbox?.secretChatEnabled &&
              (fromInbox?.secretForwardBlocked ?? true)) ||
            (toInbox?.secretChatEnabled &&
              (toInbox?.secretForwardBlocked ?? true))
          ) {
            setStatus('Forward is blocked in secret chat');
            return;
          }

          socket.emit('chat/forward', {
            userId: master._id,
            fromRoomId: activeShareContact.fromRoomId,
            chatsId: activeShareContact.chatsId || [],
            toRoomId: inbox.roomId,
            toRoomType: inbox.roomType,
            toOwnersId: inbox.ownersId,
          });
          closeModal();
          return;
        }

        emitShare({
          roomId: inbox.roomId,
          roomType: inbox.roomType,
          ownersId: inbox.ownersId,
        });
        closeModal();
      } catch (error0) {
        setStatus(error0?.response?.data?.message || error0.message);
      }
    })();
  };

  const handleShareToUser = async (user) => {
    try {
      const { roomId: existingRoomId } = user;
      let roomId = existingRoomId;
      if (!roomId) {
        const { data } = await axios.post('/contacts', {
          identity: user.username,
        });
        roomId = data.payload?.roomId;
      }

      if (!roomId) {
        throw new Error('Could not open chat for this user');
      }

      const secretInbox = await getLiveInbox(roomId);
      if (
        isForwardMode &&
        secretInbox &&
        (secretInbox.secretForwardBlocked ?? true)
      ) {
        throw new Error('Forward is blocked in secret chat');
      }

      if (isForwardMode) {
        socket.emit('chat/forward', {
          userId: master._id,
          fromRoomId: activeShareContact.fromRoomId,
          chatsId: activeShareContact.chatsId || [],
          toRoomId: roomId,
          toRoomType: 'private',
          toOwnersId: [master._id, user.userId],
        });
      } else {
        emitShare({
          roomId,
          roomType: 'private',
          ownersId: [master._id, user.userId],
        });
      }
    } catch (error0) {
      setStatus(error0?.response?.data?.message || error0.message);
      return;
    }

    closeModal();
  };

  if (!activeShareContact) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex justify-center items-center bg-spill-600/40 dark:bg-black/60"
      aria-hidden
      onMouseDown={handleBackdropClose}
    >
      <div
        aria-hidden
        className="w-[520px] max-h-[80vh] m-6 p-4 grid grid-rows-[auto_auto_1fr] rounded-md bg-white dark:bg-spill-800"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-3">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">
              {isForwardMode ? 'Forward Message' : 'Share Contact'}
            </h1>
            <button
              type="button"
              className="p-2 rounded-full hover:bg-spill-100 dark:hover:bg-spill-700"
              onClick={closeModal}
            >
              <bi.BiX />
            </button>
          </div>
          {activeShareContact && !isForwardMode && (
            <p className="text-sm opacity-70 mt-1">
              {activeShareContact.fullname} (@{activeShareContact.username})
            </p>
          )}
          {isForwardMode && (
            <p className="text-sm opacity-70 mt-1">
              Forward {activeShareContact?.chatsId?.length || 0} message(s)
            </p>
          )}
          {status && (
            <p className="mt-1 text-xs text-sky-600 dark:text-sky-400">
              {status}
            </p>
          )}
        </div>

        <label
          htmlFor="share-contact-search"
          className="mb-3 h-10 px-3 rounded-md border border-spill-300 dark:border-spill-700 flex items-center gap-2"
        >
          <bi.BiSearch />
          <input
            id="share-contact-search"
            name="shareContactSearch"
            autoComplete="off"
            placeholder="Search chat..."
            className="w-full text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>

        <div className="overflow-y-auto scrollbar-thin scrollbar-thumb-spill-300 dark:scrollbar-thumb-spill-700">
          {loading && <p className="text-sm opacity-70">Loading chats...</p>}
          {!loading && filtered.length === 0 && (
            <p className="text-sm opacity-70">No chat found</p>
          )}

          {!loading &&
            filtered.map((inbox) => {
              const isGroup = inbox.roomType === 'group';
              const friend = (inbox.owners || []).find(
                (item) => item.userId !== master._id
              );

              const title = isGroup ? inbox.group?.name : friend?.fullname;
              const subtitle = isGroup
                ? `${inbox.group?.participantsId?.length || 0} members`
                : `@${friend?.username || ''}`;
              const avatar = resolveUploadUrl(
                isGroup ? inbox.group?.avatar : friend?.avatar
              );

              return (
                <button
                  key={inbox._id}
                  type="button"
                  className="w-full p-3 grid grid-cols-[auto_1fr_auto] gap-3 items-center text-left border-0 border-b border-solid border-spill-200 dark:border-spill-700 hover:bg-spill-100 dark:hover:bg-spill-700/40"
                  onClick={() => handleShareToInbox(inbox)}
                >
                  <img
                    src={
                      avatar ||
                      (isGroup
                        ? 'assets/images/default-group-avatar.png'
                        : 'assets/images/default-avatar.png')
                    }
                    alt=""
                    className="w-11 h-11 rounded-full object-cover"
                  />
                  <span className="overflow-hidden">
                    <p className="font-semibold truncate">
                      {title || '[inactive]'}
                    </p>
                    <p className="text-xs opacity-70 truncate">{subtitle}</p>
                  </span>
                  <bi.BiSend className="text-sky-600 dark:text-sky-400" />
                </button>
              );
            })}

          {!loading && users.length > 0 && (
            <>
              <p className="px-3 py-2 text-xs opacity-70">Search users</p>
              {users.map((user) => (
                <button
                  key={user.userId}
                  type="button"
                  className="w-full p-3 grid grid-cols-[auto_1fr_auto] gap-3 items-center text-left border-0 border-b border-solid border-spill-200 dark:border-spill-700 hover:bg-spill-100 dark:hover:bg-spill-700/40"
                  onClick={() => handleShareToUser(user)}
                >
                  <img
                    src={
                      resolveUploadUrl(user.avatar) ||
                      'assets/images/default-avatar.png'
                    }
                    alt=""
                    className="w-11 h-11 rounded-full object-cover"
                  />
                  <span className="overflow-hidden">
                    <p className="font-semibold truncate">{user.fullname}</p>
                    <p className="text-xs opacity-70 truncate">
                      @{user.username}
                    </p>
                  </span>
                  <bi.BiSend className="text-sky-600 dark:text-sky-400" />
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default ShareContact;
