import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import moment from 'moment';
import axios from 'axios';
import * as bi from 'react-icons/bi';
import * as ri from 'react-icons/ri';
// redux actions
import { setPage } from '../redux/features/page';
import { setModal } from '../redux/features/modal';
import { setChatRoom } from '../redux/features/room';

import { setSetting } from '../redux/features/user';

function Contact() {
  const dispatch = useDispatch();
  const setting = useSelector((state) => state.user.setting);
  const master = useSelector((state) => state.user.master);
  const page = useSelector((state) => state.page);
  const refreshContact = useSelector((state) => state.chore.refreshContact);
  const chatRoom = useSelector((state) => state.room.chat);

  const [contacts, setContacts] = useState(null);
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState([]);
  const [syncingPhone, setSyncingPhone] = useState(false);
  const [phoneMatched, setPhoneMatched] = useState([]);
  const [phoneInvite, setPhoneInvite] = useState([]);
  const [respond, setRespond] = useState('');

  const handleGetContacts = async (signal) => {
    try {
      // get contacts if contact page is opened
      if (page.contact) {
        const { data } = await axios.get('/contacts', { signal });
        setContacts(data.payload);
      } else {
        // reset when page is closed
        setContacts(null);
      }
    } catch (error0) {
      console.error(error0.message);
    }
  };

  const handleSortToggle = async () => {
    try {
      setContacts(null);
      await axios.put('/settings', {
        sortContactByName: !setting.sortContactByName,
      });

      dispatch(
        setSetting({
          ...setting,
          sortContactByName: !setting.sortContactByName,
        })
      );

      await handleGetContacts();
    } catch (error0) {
      console.error(error0.message);
    }
  };

  const openPrivateChat = (profile, roomId) => {
    if (!profile || !roomId) return;

    dispatch(
      setChatRoom({
        isOpen: true,
        refreshId: roomId,
        data: {
          ownersId: [master._id, profile.userId],
          roomId,
          roomType: 'private',
          profile: {
            ...profile,
            active: true,
          },
        },
      })
    );
  };

  const addContact = async (profile, openChat = false) => {
    if (!profile?.username) return;

    try {
      const { data } = await axios.post('/contacts', {
        identity: profile.username,
      });

      const nextRoomId = data.payload?.roomId || null;
      setRespond('Contact added successfully');

      if (openChat && nextRoomId) {
        openPrivateChat(profile, nextRoomId);
      }

      await handleGetContacts();
    } catch (error0) {
      const message = error0?.response?.data?.message || error0.message;

      if (/already saved/i.test(message) && openChat) {
        const row = contacts?.find((item) => item.friendId === profile.userId);
        if (row) {
          openPrivateChat(profile, row.roomId);
          return;
        }
      }

      setRespond(message);
    }
  };

  const handleSearchUsers = async (q) => {
    const query = String(q || '').trim();
    if (query.length < 2) {
      setSearchResult([]);
      return;
    }

    try {
      setSearching(true);
      const { data } = await axios.get('/contacts/search', {
        params: { q: query },
      });
      setSearchResult(data.payload || []);
    } catch (error0) {
      setSearchResult([]);
      setRespond(error0?.response?.data?.message || error0.message);
    } finally {
      setSearching(false);
    }
  };

  const handleSyncMobileContacts = async () => {
    if (!navigator.contacts?.select) {
      setRespond('Mobile contact access is not supported in this browser');
      return;
    }

    try {
      setSyncingPhone(true);
      setRespond('');

      const picked = await navigator.contacts.select(['name', 'tel'], {
        multiple: true,
      });

      if (!picked || picked.length === 0) {
        setRespond('No phone contacts selected');
        return;
      }

      const contactsPayload = picked
        .map((item) => ({
          name: item.name?.[0] || '',
          phones: item.tel || [],
        }))
        .filter((item) => item.phones.length > 0);

      const { data } = await axios.post('/contacts/mobile-sync', {
        contacts: contactsPayload,
      });

      setPhoneMatched(data.payload?.registered || []);
      setPhoneInvite(data.payload?.unregistered || []);
    } catch (error0) {
      setRespond(error0?.response?.data?.message || error0.message);
    } finally {
      setSyncingPhone(false);
    }
  };

  const handleInvite = async (item) => {
    const name = item?.name || 'friend';
    const shareText = `Hi ${name}, join me on SyncChat: ${window.location.origin}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Join SyncChat',
          text: shareText,
        });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareText);
        setRespond('Invite link copied to clipboard');
      } else {
        setRespond(shareText);
      }
    } catch (error0) {
      setRespond(error0.message);
    }
  };

  const charTag = (name, prev = null) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const upper = name[0].toUpperCase();

    if (chars.includes(upper) && (!prev || upper !== prev[0].toUpperCase())) {
      return upper;
    }

    if (!chars.includes(upper) && !prev) {
      return '#';
    }

    return null;
  };

  useEffect(() => {
    const ctrl = new AbortController();
    handleGetContacts(ctrl.signal);

    return () => {
      ctrl.abort();
    };
  }, [page.contact, refreshContact]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      handleSearchUsers(search);
    }, 300);

    return () => clearTimeout(timeout);
  }, [search]);

  return (
    <div
      className={`
        ${page.contact ? 'delay-75' : '-translate-x-full'}
        transition duration-200 absolute w-full h-full z-20 grid grid-rows-[auto_1fr] overflow-hidden
        bg-white dark:bg-spill-900 dark:text-white/90
      `}
    >
      {/* header */}
      <div className="h-16 px-2 grid grid-cols-[1fr_auto] gap-4">
        <div className="flex gap-4 items-center">
          <button
            type="button"
            className="p-2 rounded-full hover:bg-spill-100 dark:hover:bg-spill-800"
            onClick={() => {
              dispatch(setPage({ target: 'contact' }));
            }}
          >
            <bi.BiArrowBack className="text-2xl" />
          </button>
          <h1 className="text-2xl font-bold">Contacts</h1>
        </div>
        <div className="flex items-center">
          {page.contact && (
            <button
              type="button"
              className="p-2 rounded-full hover:bg-spill-100 dark:hover:bg-spill-800"
              onClick={handleSortToggle}
            >
              <i className="text-2xl">
                {setting && setting.sortContactByName ? (
                  <bi.BiSortDown />
                ) : (
                  <bi.BiSortAZ />
                )}
              </i>
            </button>
          )}
        </div>
      </div>
      {/* content */}
      <div className="overflow-y-auto scrollbar-thin scrollbar-thumb-spill-200 hover:scrollbar-thumb-spill-300 dark:scrollbar-thumb-spill-700 dark:hover:scrollbar-thumb-spill-600">
        <div className="p-4 border-0 border-b border-solid border-spill-200 dark:border-spill-800 grid gap-3">
          <label
            htmlFor="contact-search-all"
            className="w-full h-10 px-3 rounded-md border border-spill-300 dark:border-spill-700 flex items-center gap-2"
          >
            <bi.BiSearch />
            <input
              id="contact-search-all"
              name="contactSearchAll"
              type="text"
              autoComplete="off"
              placeholder="Search user by username, email or phone"
              className="w-full text-sm bg-transparent"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setRespond('');
              }}
            />
          </label>
          <div className="text-xs opacity-70 flex justify-between items-center">
            <p>
              {searching
                ? 'Searching...'
                : `${searchResult.length} users found`}
            </p>
            <button
              type="button"
              className="py-1 px-2 rounded-md bg-spill-100 dark:bg-spill-800 hover:bg-spill-200 dark:hover:bg-spill-700"
              onClick={handleSyncMobileContacts}
              disabled={syncingPhone}
            >
              {syncingPhone
                ? 'Reading phone contacts...'
                : 'Sync Mobile Contacts'}
            </button>
          </div>
          {respond && (
            <p className="text-xs text-sky-700 dark:text-sky-400 break-all">
              {respond}
            </p>
          )}
        </div>

        {searchResult.length > 0 && (
          <div className="border-0 border-b border-solid border-spill-200 dark:border-spill-800">
            <p className="px-4 py-2 text-sm bg-spill-100/60 dark:bg-black/20">
              Search Result
            </p>
            <div className="grid">
              {searchResult.map((item) => (
                <div
                  key={item.userId}
                  className="grid grid-cols-[auto_1fr_auto] gap-3 p-3 border-0 border-b border-solid border-spill-200 dark:border-spill-800"
                >
                  <img
                    src={item.avatar || 'assets/images/default-avatar.png'}
                    alt=""
                    className="w-12 h-12 rounded-full"
                  />
                  <span className="overflow-hidden">
                    <p className="font-bold truncate">{item.fullname}</p>
                    <p className="text-sm opacity-70 truncate">
                      @{item.username}
                    </p>
                    <p className="text-xs opacity-60 truncate">
                      {item.email} {item.phone && `• ${item.phone}`}
                    </p>
                  </span>
                  <div className="flex items-center">
                    {item.isSaved ? (
                      <button
                        type="button"
                        className="px-2 py-1 rounded-md text-xs bg-sky-600 text-white hover:bg-sky-700"
                        onClick={() => openPrivateChat(item, item.roomId)}
                      >
                        Chat now
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="px-2 py-1 rounded-md text-xs bg-spill-100 dark:bg-spill-800 hover:bg-spill-200 dark:hover:bg-spill-700"
                        onClick={() => addContact(item, false)}
                      >
                        Add
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {(phoneMatched.length > 0 || phoneInvite.length > 0) && (
          <div className="border-0 border-b border-solid border-spill-200 dark:border-spill-800">
            <p className="px-4 py-2 text-sm bg-spill-100/60 dark:bg-black/20">
              From Phone Contacts
            </p>
            <div className="grid">
              {phoneMatched.map((item) => (
                <div
                  key={item.profile.userId}
                  className="grid grid-cols-[auto_1fr_auto] gap-3 p-3 border-0 border-b border-solid border-spill-200 dark:border-spill-800"
                >
                  <img
                    src={
                      item.profile.avatar || 'assets/images/default-avatar.png'
                    }
                    alt=""
                    className="w-12 h-12 rounded-full"
                  />
                  <span className="overflow-hidden">
                    <p className="font-bold truncate">{item.contactName}</p>
                    <p className="text-sm opacity-70 truncate">
                      @{item.profile.username}
                    </p>
                    <p className="text-xs opacity-60 truncate">
                      {item.contactPhone}
                    </p>
                  </span>
                  <button
                    type="button"
                    className="h-8 self-center px-2 py-1 rounded-md text-xs bg-sky-600 text-white hover:bg-sky-700"
                    onClick={() =>
                      item.isSaved
                        ? openPrivateChat(item.profile, item.roomId)
                        : addContact(item.profile, true)
                    }
                  >
                    Chat now
                  </button>
                </div>
              ))}
              {phoneInvite.map((item) => (
                <div
                  key={`${item.name}-${(item.phones || []).join('-')}`}
                  className="grid grid-cols-[1fr_auto] gap-3 p-3 border-0 border-b border-solid border-spill-200 dark:border-spill-800"
                >
                  <span className="overflow-hidden">
                    <p className="font-bold truncate">
                      {item.name || '[Unknown]'}
                    </p>
                    <p className="text-xs opacity-60 truncate">
                      {(item.phones || []).join(', ')}
                    </p>
                  </span>
                  <button
                    type="button"
                    className="h-8 self-center px-2 py-1 rounded-md text-xs bg-emerald-600 text-white hover:bg-emerald-700"
                    onClick={() => handleInvite(item)}
                  >
                    Invite
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid">
          {[
            {
              target: 'selectParticipant',
              text: 'Create a new Group',
              icon: <ri.RiGroupLine />,
            },
            {
              target: 'newcontact',
              text: 'New Contact',
              icon: <ri.RiUserAddLine />,
            },
          ].map((elem) => (
            <div
              key={elem.target}
              className="grid grid-cols-[auto_1fr] gap-6 p-4 items-center cursor-pointer border-0 border-b border-solid border-spill-200 dark:border-spill-800 hover:bg-spill-100/60 dark:hover:bg-spill-800/60"
              aria-hidden
              onClick={(e) => {
                e.stopPropagation();

                if (elem.target === 'newcontact') {
                  dispatch(
                    setModal({ target: elem.target, data: { username: '' } })
                  );
                } else {
                  dispatch(setPage({ target: elem.target }));
                }
              }}
            >
              <i>{elem.icon}</i>
              <p className="font-bold">{elem.text}</p>
            </div>
          ))}
        </div>
        <div className="pb-16 md:pb-0 grid">
          <div className="py-2 px-4 text-sm bg-spill-100/60 dark:bg-black/20">
            {contacts ? (
              <div className="pr-2 opacity-80 flex justify-between">
                <p>
                  {setting?.sortContactByName
                    ? 'Sorted by name'
                    : 'Sorted by last seen time'}
                </p>
                <p className="font-bold">{contacts.length}</p>
              </div>
            ) : (
              <p className="opacity-80">Loading...</p>
            )}
          </div>
          {contacts &&
            contacts.map((elem, i, arr) => (
              <div
                key={elem._id}
                aria-hidden
                className={`${
                  chatRoom.data?.roomId === elem.roomId &&
                  'bg-spill-100/60 dark:bg-spill-800/60'
                } grid grid-cols-[auto_auto_1fr] gap-4 p-4 items-center cursor-pointer border-0 border-b border-solid border-spill-200 dark:border-spill-800 hover:bg-spill-100/60 dark:hover:bg-spill-800/60`}
                onClick={(e) => {
                  e.stopPropagation();

                  dispatch(
                    setChatRoom({
                      isOpen: true,
                      refreshId: elem.roomId,
                      data: {
                        ownersId: [elem.userId, elem.friendId],
                        roomId: elem.roomId,
                        roomType: 'private',
                        profile: !elem.profile
                          ? {
                              avatar: 'default-avatar.png',
                              fullname: '[inactive]',
                              updatedAt: new Date().toISOString(),
                              active: false,
                            }
                          : {
                              ...elem.profile,
                              active: true,
                            },
                      },
                    })
                  );
                }}
              >
                {setting && setting.sortContactByName && (
                  <span className="flex justify-center">
                    {charTag(
                      elem.profile.fullname,
                      arr[i - 1]?.profile.fullname
                    ) ? (
                      <h1 className="font-bold text-lg">
                        {charTag(
                          elem.profile.fullname,
                          arr[i - 1]?.profile.fullname
                        ) ?? ''}
                      </h1>
                    ) : (
                      <h1 className="invisible">$</h1>
                    )}
                  </span>
                )}
                <img
                  src={
                    elem.profile?.avatar || 'assets/images/default-avatar.png'
                  }
                  alt=""
                  className="w-14 h-14 rounded-full"
                />
                <span className="overflow-hidden">
                  <h1 className="truncate text-lg font-bold">
                    {elem.profile?.fullname ?? '[inactive]'}
                  </h1>
                  {!setting.sortContactByName ? (
                    <p className="truncate opacity-60 mt-0.5">
                      {elem.profile.online
                        ? 'online'
                        : `Last seen ${moment(
                            elem.profile.updatedAt
                          ).fromNow()}`}
                    </p>
                  ) : (
                    <p className="truncate opacity-60 mt-0.5">
                      {elem.profile.bio}
                    </p>
                  )}
                </span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

export default Contact;
