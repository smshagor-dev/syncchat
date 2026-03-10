import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import * as bi from 'react-icons/bi';
import * as fg from '../../components/chat/foreground';
import * as page from '../../pages';
import Sidebar from '../../components/chat/foreground/sidebar';
import MobileNav from '../../components/chat/foreground/mobileNav';
import { setChatRoom } from '../../redux/features/room';
import { setSetting } from '../../redux/features/user';
import { setPage } from '../../redux/features/page';
import { setModal } from '../../redux/features/modal';
import {
  setRefreshInbox,
  setSelectedInboxes,
  setSelectedChats,
} from '../../redux/features/chore';

const getDefaultChatListSearch = () => ({
  query: '',
});

function ForeGround() {
  const dispatch = useDispatch();
  const chatRoom = useSelector((state) => state.room.chat);
  const master = useSelector((state) => state.user.master);
  const setting = useSelector((state) => state.user.setting);
  const refreshInbox = useSelector((state) => state.chore.refreshInbox);
  const selectedInboxes = useSelector((state) => state.chore.selectedInboxes);
  const modal = useSelector((state) => state.modal);
  const pageState = useSelector((state) => state.page);

  const [inboxes, setInboxes] = useState(null);
  const [searchState, setSearchState] = useState(getDefaultChatListSearch);
  const [chatFilter, setChatFilter] = useState('all');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [deepLink, setDeepLink] = useState({
    username: null,
    groupToken: null,
    channelToken: null,
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

  const pageTargets = [
    'contact',
    'setting',
    'status',
    'calls',
    'communities',
    'channels',
    'archive',
    'list',
    'media',
    'policy',
    'license',
    'starred',
    'profile',
    'selectParticipant',
  ];

  const showChatListArea = () => {
    pageTargets.forEach((target) => {
      dispatch(setPage({ target, data: false }));
    });
  };

  const openPagePanel = (target, data = true) => {
    pageTargets.forEach((key) => {
      dispatch(setPage({ target: key, data: key === target ? data : false }));
    });
  };

  const clearDeepLinkParam = () => {
    const params = new URLSearchParams(window.location.search);
    params.delete('u');
    params.delete('g');
    params.delete('c');
    const next = `${window.location.pathname}${
      params.toString() ? `?${params.toString()}` : ''
    }${window.location.hash || ''}`;
    window.history.replaceState({}, '', next);
  };

  const handleGetInboxes = async (signal) => {
    try {
      setInboxes(null);

      const { data } = await axios.get('/inboxes', { signal });
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
  }, [refreshInbox]);

  useEffect(() => {
    setChatFilter('all');
  }, [searchState.query]);

  useEffect(() => {
    const isEditableTarget = (target) => {
      if (!(target instanceof HTMLElement)) return false;
      return !!target.closest(
        'input, textarea, select, [contenteditable="true"], [contenteditable="plaintext-only"]'
      );
    };

    const focusElement = (selector) => {
      const element = document.querySelector(selector);
      if (element instanceof HTMLElement) {
        element.focus();
        if (
          element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement
        ) {
          element.select();
        }
      }
    };

    const isMatch = (event, { key, shift = false, alt = false, mod = true }) =>
      event.key.toLowerCase() === key &&
      !!event.shiftKey === shift &&
      !!event.altKey === alt &&
      (!!event.ctrlKey || !!event.metaKey) === mod;

    const toggleMuteNotifications = async () => {
      const nextValue = !setting?.mute;
      dispatch(
        setSetting({
          ...setting,
          mute: nextValue,
        })
      );

      try {
        await axios.put('/settings', { mute: nextValue });
      } catch (error0) {
        dispatch(setSetting(setting));
        console.error(error0?.response?.data?.message || error0.message);
      }
    };

    const closeCurrentLayer = () => {
      if (Object.values(modal || {}).some(Boolean)) {
        dispatch(setModal({ target: '*' }));
        return true;
      }

      if (Array.isArray(selectedInboxes)) {
        dispatch(setSelectedInboxes(null));
        return true;
      }

      const openPageTarget = [
        'license',
        'policy',
        'media',
        'setting',
        'status',
        'calls',
        'contact',
        'communities',
        'archive',
        'list',
        'starred',
        'selectParticipant',
        'profile',
      ].find((target) => !!pageState[target]);

      if (openPageTarget) {
        dispatch(setPage({ target: openPageTarget, data: false }));
        return true;
      }

      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }

      return false;
    };

    const handleKeyDown = (event) => {
      const key = event.key.toLowerCase();
      const hasModifier = event.ctrlKey || event.metaKey || event.altKey;
      const editableTarget = isEditableTarget(event.target);

      if (key === 'escape') {
        if (closeCurrentLayer()) {
          event.preventDefault();
        }
        return;
      }

      if (editableTarget && !hasModifier) {
        return;
      }

      if (isMatch(event, { key: '/', shift: false })) {
        event.preventDefault();
        dispatch(setPage({ target: 'setting', data: true }));
        window.dispatchEvent(new Event('syncchat:open-shortcuts'));
        return;
      }

      if (isMatch(event, { key: ',', shift: false })) {
        event.preventDefault();
        dispatch(setPage({ target: 'setting', data: true }));
        return;
      }

      if (isMatch(event, { key: 'k', shift: false })) {
        event.preventDefault();
        showChatListArea();
        setTimeout(() => focusElement('#search'), 40);
        return;
      }

      if (isMatch(event, { key: 'm', shift: true })) {
        event.preventDefault();
        if (chatRoom?.isOpen) {
          setTimeout(() => focusElement('#new-message'), 40);
        }
        return;
      }

      if (isMatch(event, { key: 'n', shift: true })) {
        event.preventDefault();
        dispatch(setPage({ target: 'selectParticipant', data: false }));
        dispatch(setModal({ target: 'newGroup', data: true }));
        return;
      }

      if (isMatch(event, { key: 'x', shift: true })) {
        event.preventDefault();
        dispatch(setSelectedChats(null));
        dispatch(setSelectedInboxes([]));
        return;
      }

      if (isMatch(event, { key: 'u', shift: true })) {
        event.preventDefault();
        toggleMuteNotifications();
        return;
      }

      if (isMatch(event, { key: 'j', shift: true })) {
        event.preventDefault();
        showChatListArea();
        return;
      }

      if (isMatch(event, { key: 'l', shift: true })) {
        event.preventDefault();
        openPagePanel('calls');
        return;
      }

      if (isMatch(event, { key: 's', shift: true })) {
        event.preventDefault();
        openPagePanel('status');
        return;
      }

      if (isMatch(event, { key: 'c', shift: true })) {
        event.preventDefault();
        openPagePanel('contact');
        return;
      }

      if (isMatch(event, { key: 'g', shift: true })) {
        event.preventDefault();
        openPagePanel('communities');
        return;
      }

      if (isMatch(event, { key: 'a', shift: true })) {
        event.preventDefault();
        openPagePanel('archive');
        return;
      }

      if (isMatch(event, { key: 'i', shift: true })) {
        event.preventDefault();
        openPagePanel('list');
        return;
      }

      if (isMatch(event, { key: 't', shift: true })) {
        event.preventDefault();
        openPagePanel('starred');
        return;
      }

      if (isMatch(event, { key: 'p', shift: true }) && master?._id) {
        event.preventDefault();
        openPagePanel('profile', master._id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    chatRoom?.isOpen,
    dispatch,
    master?._id,
    modal,
    pageState,
    selectedInboxes,
    setting,
  ]);

  useEffect(() => {
    if (chatRoom?.isOpen) {
      setMobileSidebarOpen(false);
    }
  }, [chatRoom?.isOpen]);

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
    const channelToken = (
      new URLSearchParams(window.location.search).get('c') || ''
    )
      .trim()
      .toLowerCase();

    if (username || groupToken || channelToken) {
      setDeepLink({
        username: username || null,
        groupToken: groupToken || null,
        channelToken: channelToken || null,
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
      <page.policy />
      <page.license />
      <page.contact />
      <page.communities />
      <page.channels />
      <page.profile />
      <page.newGroup />

      <fg.minibox />
      <fg.openContact />
      <MobileNav />
      <Sidebar
        inboxes={inboxes}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />
      <div className="grid grid-rows-[auto_1fr] overflow-hidden">
        <fg.header
          searchState={searchState}
          setSearchState={setSearchState}
          chatFilter={chatFilter}
          setChatFilter={setChatFilter}
          onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
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
          searchState={searchState}
        />
      </div>
    </div>
  );
}

export default ForeGround;
