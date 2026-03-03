import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import * as bi from 'react-icons/bi';
import * as fg from '../../components/chat/foreground';
import * as page from '../../pages';
import Sidebar from '../../components/chat/foreground/sidebar';
import { setChatRoom } from '../../redux/features/room';
import { setRefreshInbox } from '../../redux/features/chore';

function ForeGround() {
  const dispatch = useDispatch();
  const chatRoom = useSelector((state) => state.room.chat);
  const master = useSelector((state) => state.user.master);
  const refreshInbox = useSelector((state) => state.chore.refreshInbox);

  const [inboxes, setInboxes] = useState(null);
  const [search, setSearch] = useState('');
  const [deepLink, setDeepLink] = useState({
    username: null,
    started: false,
    completed: false,
  });

  const openPrivateInbox = (elem) => {
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
  };

  const clearDeepLinkParam = () => {
    const params = new URLSearchParams(window.location.search);
    params.delete('u');
    const next = `${window.location.pathname}${
      params.toString() ? `?${params.toString()}` : ''
    }${window.location.hash || ''}`;
    window.history.replaceState({}, '', next);
  };

  const handleGetInboxes = async (signal) => {
    try {
      setInboxes(null);

      const { data } = await axios.get('/inboxes', {
        params: { search },
        signal,
      });
      setInboxes(data.payload);
    } catch (error0) {
      console.error(error0.response.data.message);
    }
  };

  useEffect(() => {
    const abortCtrl = new AbortController();
    handleGetInboxes(abortCtrl.signal);

    return () => {
      abortCtrl.abort();
    };
  }, [refreshInbox, search]);

  useEffect(() => {
    const username = (new URLSearchParams(window.location.search).get('u') || '')
      .trim()
      .toLowerCase();

    if (username) {
      setDeepLink({
        username,
        started: false,
        completed: false,
      });
    }
  }, []);

  useEffect(() => {
    const username = deepLink.username;
    if (!username || deepLink.completed || !master) return;

    if ((master.username || '').toLowerCase() === username) {
      setDeepLink((prev) => ({ ...prev, completed: true }));
      clearDeepLinkParam();
      return;
    }

    if (inboxes && inboxes.length > 0) {
      const directInbox = inboxes.find(
        (elem) =>
          elem.roomType === 'private' &&
          elem.owners.some(
            (owner) => (owner.username || '').toLowerCase() === username
          )
      );

      if (directInbox) {
        openPrivateInbox(directInbox);
        setDeepLink((prev) => ({ ...prev, completed: true }));
        clearDeepLinkParam();
        return;
      }
    }

    if (deepLink.started) return;

    const openByContact = async () => {
      setDeepLink((prev) => ({ ...prev, started: true }));

      try {
        await axios.post('/contacts', { username });
      } catch (error0) {
        const message = error0?.response?.data?.message || '';
        if (
          message !== 'You have saved this contact' &&
          message !== 'User not found'
        ) {
          console.error(message);
        }
      }

      try {
        const { data } = await axios.get('/contacts');
        const contact = (data.payload || []).find(
          (elem) => (elem.profile?.username || '').toLowerCase() === username
        );

        if (contact) {
          dispatch(
            setChatRoom({
              isOpen: true,
              refreshId: contact.roomId,
              data: {
                roomId: contact.roomId,
                roomType: 'private',
                ownersId: [master._id, contact.friendId],
                profile: {
                  ...contact.profile,
                  active: true,
                },
              },
            })
          );
          setDeepLink((prev) => ({ ...prev, completed: true }));
          clearDeepLinkParam();
          return;
        }
      } catch (error0) {
        console.error(error0.message);
      }

      dispatch(setRefreshInbox(uuidv4()));
    };

    openByContact();
  }, [deepLink, master, inboxes]);

  return (
    <div
      className={`${
        chatRoom.isOpen && '-translate-x-full md:translate-x-0'
      } transition w-full h-full relative z-10 grid md:grid-cols-[72px_1fr] overflow-hidden border-r border-sky-800 bg-sky-900 dark:border-spill-800 dark:bg-spill-950`}
    >
      {
        // loading animation
        !inboxes && (
          <div className="absolute w-full h-full z-0 flex justify-center items-center bg-sky-900 text-sky-100 dark:bg-spill-950 dark:text-spill-300">
            <span className="flex gap-2 items-center">
              <i className="animate-spin">
                <bi.BiLoaderAlt size={18} />
              </i>
              <p>Loading</p>
            </span>
          </div>
        )
      }
      <page.setting />
      <page.status />
      <page.media />
      <page.contact />
      <page.profile />
      <page.newGroup />

      <fg.minibox />
      <fg.openContact />
      <Sidebar inboxes={inboxes} />
      <div className="grid grid-rows-[auto_1fr] overflow-hidden">
        <fg.header setSearch={setSearch} />
        <fg.inbox inboxes={inboxes} setInboxes={setInboxes} />
      </div>
    </div>
  );
}

export default ForeGround;
