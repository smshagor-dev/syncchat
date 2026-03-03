import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import * as bi from 'react-icons/bi';
import { setModal } from '../../redux/features/modal';
import socket from '../../helpers/socket';
import resolveUploadUrl from '../../helpers/resolveUploadUrl';

function AttachContact() {
  const dispatch = useDispatch();
  const {
    modal: { attachContact },
    room: { chat: chatRoom },
    user: { master, setting },
  } = useSelector((state) => state);

  const [contacts, setContacts] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  const closeModal = () => {
    setSearch('');
    setStatus('');
    dispatch(setModal({ target: 'attachContact', data: false }));
  };

  useEffect(() => {
    const abortCtrl = new AbortController();

    const loadContacts = async () => {
      if (!attachContact) return;
      try {
        setLoading(true);
        setStatus('');
        const { data } = await axios.get('/contacts', {
          signal: abortCtrl.signal,
        });
        setContacts(data.payload || []);
      } catch (error0) {
        setStatus(error0?.response?.data?.message || error0.message);
        setContacts([]);
      } finally {
        setLoading(false);
      }
    };

    loadContacts();
    return () => abortCtrl.abort();
  }, [attachContact]);

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((contact) => {
      const fullname = (contact.profile?.fullname || '').toLowerCase();
      const username = (contact.profile?.username || '').toLowerCase();
      return fullname.includes(q) || username.includes(q);
    });
  }, [contacts, search]);

  const canSendNow = () => {
    if (!chatRoom?.data) return false;
    const isGroup = chatRoom.data.roomType === 'group';
    const isBlocked =
      !isGroup &&
      setting?.blockedUserIds?.includes(chatRoom.data?.profile?.userId);
    const allowed =
      (!isGroup && chatRoom.data.profile?.active) ||
      (isGroup && chatRoom.data.group?.participantsId?.includes(master._id));
    return allowed && !isBlocked;
  };

  const sendContact = (contact) => {
    if (!canSendNow()) {
      setStatus('You cannot send messages in this room right now.');
      return;
    }

    const profile = contact?.profile || {};
    const lines = [
      '👤 Contact',
      `Name: ${profile.fullname || '[unknown]'}`,
      profile.username ? `Username: @${profile.username}` : '',
      profile.phone ? `Phone: ${profile.phone}` : '',
      profile.email ? `Email: ${profile.email}` : '',
    ].filter(Boolean);

    socket.emit('chat/insert', {
      roomId: chatRoom.data.roomId,
      userId: master._id,
      ownersId: chatRoom.data.ownersId,
      roomType: chatRoom.data.roomType,
      text: lines.join('\n'),
      file: null,
      replyTo: null,
    });

    closeModal();
  };

  return (
    <div
      className={`${
        attachContact ? 'delay-75 z-50' : '-z-50 opacity-0 delay-300'
      } absolute inset-0 flex justify-center items-center bg-spill-600/40 dark:bg-black/60`}
      aria-hidden
      onClick={closeModal}
    >
      <div
        aria-hidden
        className={`${
          !attachContact && 'scale-0'
        } transition relative w-[520px] max-h-[78vh] m-6 rounded-md overflow-hidden bg-white dark:bg-spill-800 grid grid-rows-[auto_auto_1fr]`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-14 px-4 flex items-center justify-between border-b border-spill-200 dark:border-spill-700">
          <h1 className="text-lg font-bold">Share Contact</h1>
          <button
            type="button"
            className="p-2 rounded-full hover:bg-spill-100 dark:hover:bg-spill-700"
            onClick={closeModal}
          >
            <bi.BiX />
          </button>
        </div>

        <label
          htmlFor="attach-contact-search"
          className="m-3 h-10 px-3 rounded-md border border-spill-300 dark:border-spill-700 flex items-center gap-2"
        >
          <bi.BiSearch />
          <input
            id="attach-contact-search"
            name="attachContactSearch"
            autoComplete="off"
            placeholder="Search contact..."
            className="w-full text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>

        <div className="pb-3 px-3 overflow-y-auto scrollbar-thin scrollbar-thumb-spill-300 dark:scrollbar-thumb-spill-700">
          {status && (
            <p className="mb-2 text-xs text-rose-600 dark:text-rose-400">
              {status}
            </p>
          )}
          {loading && <p className="text-sm opacity-70">Loading contacts...</p>}
          {!loading && filteredContacts.length === 0 && (
            <p className="text-sm opacity-70">No contact found</p>
          )}

          {!loading &&
            filteredContacts.map((contact) => (
              <button
                key={contact._id}
                type="button"
                className="w-full p-3 grid grid-cols-[auto_1fr_auto] gap-3 items-center text-left border-0 border-b border-solid border-spill-200 dark:border-spill-700 hover:bg-spill-100 dark:hover:bg-spill-700/40"
                onClick={() => sendContact(contact)}
              >
                <img
                  src={
                    resolveUploadUrl(contact.profile?.avatar) ||
                    'assets/images/default-avatar.png'
                  }
                  alt=""
                  className="w-10 h-10 rounded-full object-cover"
                />
                <span className="overflow-hidden">
                  <p className="font-semibold truncate">
                    {contact.profile?.fullname || '[inactive]'}
                  </p>
                  <p className="text-xs opacity-70 truncate">
                    @{contact.profile?.username || 'unknown'}
                  </p>
                </span>
                <bi.BiSend className="text-sky-600 dark:text-sky-400" />
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}

export default AttachContact;
