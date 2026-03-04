import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import * as bi from 'react-icons/bi';
import * as fg from '../../components/chat/foreground';
import * as page from '../../pages';
import Sidebar from '../../components/chat/foreground/sidebar';
import { setChatRoom } from '../../redux/features/room';
import {
  setRefreshInbox,
  setSelectedInboxes,
} from '../../redux/features/chore';

function ForeGround() {
  const dispatch = useDispatch();
  const chatRoom = useSelector((state) => state.room.chat);
  const master = useSelector((state) => state.user.master);
  const refreshInbox = useSelector((state) => state.chore.refreshInbox);
  const selectedInboxes = useSelector((state) => state.chore.selectedInboxes);

  const [inboxes, setInboxes] = useState(null);
  const [search, setSearch] = useState('');
  const [chatFilter, setChatFilter] = useState('all');
  const [deepLink, setDeepLink] = useState({
    username: null,
    groupToken: null,
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
    params.delete('g');
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
    setChatFilter('all');
  }, [search]);

  const selectedInboxRows =
    Array.isArray(selectedInboxes) && selectedInboxes.length > 0
      ? (inboxes || []).filter((item) => selectedInboxes.includes(item.roomId))
      : [];
  const isInboxSelectMode = Array.isArray(selectedInboxes);

  const runBulkInboxAction = async (runner) => {
    if (selectedInboxRows.length === 0) return;
    try {
      await Promise.allSettled(selectedInboxRows.map((row) => runner(row)));
      dispatch(setRefreshInbox(uuidv4()));
    } finally {
      dispatch(setSelectedInboxes(null));
    }
  };

  const handleBulkMarkUnread = async () => {
    await runBulkInboxAction((row) =>
      axios.patch(`/inboxes/${row.roomId}/preferences`, {
        action: 'markUnread',
        value: true,
      })
    );
  };

  const handleBulkMute = async () => {
    await runBulkInboxAction((row) =>
      axios.patch(`/inboxes/${row.roomId}/preferences`, {
        action: 'mute',
        value: true,
      })
    );
  };

  const handleBulkClear = async () => {
    await runBulkInboxAction((row) => axios.post(`/inboxes/${row.roomId}/clear`));
  };

  const handleBulkDelete = async () => {
    await runBulkInboxAction((row) => axios.delete(`/chats/${row.roomId}`));
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

  const visibleInboxes = (inboxes || []).filter(
    (elem) => !elem.deletedBy.includes(master._id)
  );

  const hasUnreadForMe = (elem) => {
    const isIncoming = elem?.content?.from !== master?._id;
    const manualUnread =
      Array.isArray(elem?.markUnreadBy) && elem.markUnreadBy.includes(master?._id);
    return manualUnread || (isIncoming && (elem?.unreadMessage || 0) > 0);
  };

  const unreadCount = visibleInboxes.filter((elem) => hasUnreadForMe(elem)).length;

  const favouriteUnreadCount = visibleInboxes.filter(
    (elem) => isFavouriteInbox(elem) && hasUnreadForMe(elem)
  ).length;

  const groupUnreadCount = visibleInboxes.filter(
    (elem) => elem.roomType === 'group' && hasUnreadForMe(elem)
  ).length;

  useEffect(() => {
    const username = (
      new URLSearchParams(window.location.search).get('u') || ''
    )
      .trim()
      .toLowerCase();
    const groupToken = (
      new URLSearchParams(window.location.search).get('g') || ''
    )
      .trim()
      .toLowerCase();

    if (username || groupToken) {
      setDeepLink({
        username: username || null,
        groupToken: groupToken || null,
        started: false,
        completed: false,
      });
    }
  }, []);

  useEffect(() => {
    const token = deepLink.groupToken;
    if (!token || deepLink.completed || !master) return;

    if (deepLink.started) return;

    const joinGroupByLink = async () => {
      setDeepLink((prev) => ({ ...prev, started: true }));

      try {
        const { data: metaData } = await axios.get(`/groups/link/${token}/meta`);
        let password = '';
        if (metaData?.payload?.requiresPassword) {
          // eslint-disable-next-line no-alert
          password = window.prompt('Enter private group password') || '';
          if (!password) {
            clearDeepLinkParam();
            setDeepLink((prev) => ({ ...prev, completed: true }));
            return;
          }
        }

        await axios.post('/groups/join-link', { token, password });
        dispatch(setRefreshInbox(uuidv4()));

        setTimeout(() => {
          setDeepLink((prev) => ({ ...prev, completed: true }));
          clearDeepLinkParam();
        }, 400);
      } catch (error0) {
        console.error(error0?.response?.data?.message || error0.message);
        setDeepLink((prev) => ({ ...prev, completed: true }));
        clearDeepLinkParam();
      }
    };

    joinGroupByLink();
  }, [deepLink.groupToken, deepLink.started, deepLink.completed, master]);

  useEffect(() => {
    const token = deepLink.groupToken;
    if (!token || deepLink.completed || !Array.isArray(inboxes)) return;

    const groupInbox = inboxes.find(
      (elem) =>
        elem.roomType === 'group' &&
        String(elem?.group?.link || '').replace('/group/+', '').toLowerCase() ===
          token
    );

    if (!groupInbox) return;

    dispatch(
      setChatRoom({
        isOpen: true,
        refreshId: groupInbox.roomId,
        data: groupInbox,
      })
    );

    setDeepLink((prev) => ({ ...prev, completed: true }));
    clearDeepLinkParam();
  }, [deepLink.groupToken, deepLink.completed, inboxes]);

  useEffect(() => {
    const { username, groupToken } = deepLink;
    if (groupToken) return;
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
      <page.communities />
      <page.profile />
      <page.newGroup />

      <fg.minibox />
      <fg.openContact />
      <Sidebar inboxes={inboxes} />
      <div className="grid grid-rows-[auto_1fr] overflow-hidden">
        <fg.header
          setSearch={setSearch}
          chatFilter={chatFilter}
          setChatFilter={setChatFilter}
          filterCounts={{
            all: visibleInboxes.length,
            unread: unreadCount,
            favouriteUnread: favouriteUnreadCount,
            groupUnread: groupUnreadCount,
          }}
          selectedInboxCount={selectedInboxRows.length}
          isInboxSelectMode={isInboxSelectMode}
          onExitSelectMode={() => dispatch(setSelectedInboxes(null))}
          onBulkMarkUnread={handleBulkMarkUnread}
          onBulkMute={handleBulkMute}
          onBulkClear={handleBulkClear}
          onBulkDelete={handleBulkDelete}
        />
        <fg.inbox
          inboxes={inboxes}
          setInboxes={setInboxes}
          chatFilter={chatFilter}
        />
      </div>
    </div>
  );
}

export default ForeGround;
