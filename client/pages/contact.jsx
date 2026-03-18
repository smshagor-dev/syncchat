import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import * as bi from 'react-icons/bi';
import * as ri from 'react-icons/ri';
// redux actions
import { setPage } from '../redux/features/page';
import { setModal } from '../redux/features/modal';
import { setChatRoom } from '../redux/features/room';

import { setSetting } from '../redux/features/user';
import { setRefreshContact } from '../redux/features/chore';
import { getPresenceMeta } from '../helpers/presence';

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
  const [labels, setLabels] = useState([]);
  const [labelError, setLabelError] = useState('');
  const [labelForm, setLabelForm] = useState({
    open: false,
    name: '',
    color: '#2563eb',
    saving: false,
    error: '',
  });
  const [labelPickerFor, setLabelPickerFor] = useState(null);
  const labelPalette = [
    '#2563eb',
    '#16a34a',
    '#ef4444',
    '#f59e0b',
    '#8b5cf6',
    '#0ea5e9',
    '#14b8a6',
    '#64748b',
  ];

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

  const handleGetLabels = async (signal) => {
    try {
      if (!page.contact) {
        setLabels([]);
        return;
      }
      const { data } = await axios.get('/contacts/labels', { signal });
      setLabels(Array.isArray(data?.payload) ? data.payload : []);
      setLabelError('');
    } catch (error0) {
      const message = error0?.response?.data?.message || error0.message;
      setLabelError(message);
      console.error(message);
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

  const createLabel = async () => {
    if (!labelForm.name.trim() || labelForm.saving) return;
    try {
      setLabelForm((prev) => ({ ...prev, saving: true, error: '' }));
      const { data } = await axios.post('/contacts/labels', {
        name: labelForm.name.trim(),
        color: labelForm.color,
      });
      if (data?.payload) {
        setLabels((prev) => [...prev, data.payload]);
      }
      dispatch(setRefreshContact(Date.now()));
      setLabelForm((prev) => ({
        ...prev,
        open: false,
        name: '',
        saving: false,
        error: '',
      }));
    } catch (error0) {
      setLabelForm((prev) => ({
        ...prev,
        saving: false,
        error: error0?.response?.data?.message || error0.message,
      }));
    }
  };

  const deleteLabel = async (labelId) => {
    try {
      await axios.delete(`/contacts/labels/${labelId}`);
      setLabels((prev) => prev.filter((item) => item._id !== labelId));
      setContacts((prev) =>
        (prev || []).map((item) => ({
          ...item,
          labels: Array.isArray(item.labels)
            ? item.labels.filter((id) => id !== labelId)
            : [],
        }))
      );
      dispatch(setRefreshContact(Date.now()));
    } catch (error0) {
      setRespond(error0?.response?.data?.message || error0.message);
    }
  };

  const updateContactLabels = async (contact, nextLabels) => {
    if (!contact?.friendId) return;
    try {
      const { data } = await axios.put(
        `/contacts/${contact.friendId}/labels`,
        { labels: nextLabels }
      );
      const updated = data?.payload?.labels || nextLabels;
      setContacts((prev) =>
        (prev || []).map((item) =>
          item.friendId === contact.friendId
            ? { ...item, labels: updated }
            : item
        )
      );
      dispatch(setRefreshContact(Date.now()));
    } catch (error0) {
      setRespond(error0?.response?.data?.message || error0.message);
    }
  };

  const toggleContactLabel = async (contact, labelId) => {
    const current = Array.isArray(contact?.labels) ? contact.labels : [];
    const next = current.includes(labelId)
      ? current.filter((id) => id !== labelId)
      : [...current, labelId];
    await updateContactLabels(contact, next);
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
    handleGetLabels(ctrl.signal);

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

        <div className="border-0 border-b border-solid border-spill-200 dark:border-spill-800">
          <div className="px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Labels</p>
              <p className="text-xs opacity-70">
                Work, family, or custom folders
              </p>
            </div>
            <button
              type="button"
              className="h-8 px-3 rounded-full border border-slate-200 text-xs font-semibold hover:bg-slate-100 dark:border-spill-700 dark:hover:bg-spill-800"
              onClick={() =>
                setLabelForm((prev) => ({ ...prev, open: !prev.open }))
              }
            >
              {labelForm.open ? 'Close' : 'New label'}
            </button>
          </div>
          {labelForm.open && (
            <div className="px-4 pb-3 grid gap-2">
              <label className="h-10 px-3 rounded-lg border border-slate-200 bg-white flex items-center dark:border-spill-700 dark:bg-spill-900">
                <input
                  type="text"
                  placeholder="Label name"
                  className="w-full bg-transparent text-sm"
                  value={labelForm.name}
                  onChange={(e) =>
                    setLabelForm((prev) => ({
                      ...prev,
                      name: e.target.value,
                      error: '',
                    }))
                  }
                />
              </label>
              <div className="flex flex-wrap gap-2">
                {labelPalette.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`h-7 w-7 rounded-full border-2 ${
                      labelForm.color === color
                        ? 'border-slate-900 dark:border-white'
                        : 'border-transparent'
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() =>
                      setLabelForm((prev) => ({ ...prev, color }))
                    }
                    aria-label={`Pick ${color}`}
                  />
                ))}
              </div>
              {labelForm.error && (
                <p className="text-xs text-rose-600 dark:text-rose-400">
                  {labelForm.error}
                </p>
              )}
              <div className="flex justify-end">
                <button
                  type="button"
                  className="h-9 px-4 rounded-full bg-sky-600 text-white text-sm font-semibold hover:bg-sky-700 disabled:opacity-60"
                  onClick={createLabel}
                  disabled={labelForm.saving}
                >
                  {labelForm.saving ? 'Saving...' : 'Create'}
                </button>
              </div>
            </div>
          )}
          <div className="px-4 pb-3 flex flex-wrap gap-2">
            {labels.length === 0 && (
              <p className="text-xs opacity-60">No labels yet.</p>
            )}
            {labelError && (
              <p className="text-xs text-rose-600 dark:text-rose-400">
                {labelError}
              </p>
            )}
            {labels.map((label) => (
              <span
                key={label._id}
                className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold"
                style={{
                  borderColor: label.color,
                  color: label.color,
                }}
              >
                {label.name}
                {!label.isSystem && (
                  <button
                    type="button"
                    className="ml-1 text-[10px]"
                    onClick={() => deleteLabel(label._id)}
                    aria-label={`Delete ${label.name}`}
                  >
                    <bi.BiX />
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>

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
                {(() => {
                  const presence = getPresenceMeta(elem.profile);
                  return (
                    <>
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
                <div className="relative">
                  <img
                    src={
                      elem.profile?.avatar || 'assets/images/default-avatar.png'
                    }
                    alt=""
                    className="w-14 h-14 rounded-full"
                  />
                  {presence.showDot && (
                    <span className="absolute right-0.5 bottom-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500 dark:border-spill-900" />
                  )}
                </div>
                <span className="overflow-hidden">
                  <h1 className="truncate text-lg font-bold">
                    {elem.profile?.fullname ?? '[inactive]'}
                  </h1>
                  {!setting.sortContactByName ? (
                    <p className="truncate opacity-60 mt-0.5">
                      {presence.text
                        ? presence.text[0].toUpperCase() + presence.text.slice(1)
                        : ''}
                    </p>
                  ) : (
                    <p className="truncate opacity-60 mt-0.5">
                      {elem.profile.bio}
                    </p>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {Array.isArray(elem.labels) &&
                      elem.labels
                        .map((labelId) =>
                          labels.find((label) => label._id === labelId)
                        )
                        .filter(Boolean)
                        .map((label) => (
                          <span
                            key={`${elem._id}-${label._id}`}
                            className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                            style={{
                              borderColor: label.color,
                              color: label.color,
                            }}
                          >
                            {label.name}
                          </span>
                        ))}
                    <button
                      type="button"
                      className="ml-1 inline-flex items-center rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-100 dark:border-spill-700 dark:text-spill-300 dark:hover:bg-spill-800"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLabelPickerFor((prev) =>
                          prev === elem.friendId ? null : elem.friendId
                        );
                      }}
                    >
                      <bi.BiTag />
                      <span className="ml-1">Labels</span>
                    </button>
                  </div>
                  {labelPickerFor === elem.friendId && (
                    <div
                      className="mt-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm dark:border-spill-700 dark:bg-spill-900"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {labels.length === 0 ? (
                        <div className="grid gap-2 text-xs">
                          <p className="opacity-70">No labels yet.</p>
                          <button
                            type="button"
                            className="h-8 rounded-lg border border-slate-200 px-3 text-xs font-semibold hover:bg-slate-50 dark:border-spill-700 dark:hover:bg-spill-800"
                            onClick={() =>
                              setLabelForm((prev) => ({ ...prev, open: true }))
                            }
                          >
                            Create a label
                          </button>
                        </div>
                      ) : (
                        <div className="grid gap-1">
                          {labels.map((label) => {
                            const active =
                              Array.isArray(elem.labels) &&
                              elem.labels.includes(label._id);
                            return (
                              <button
                                key={`${elem.friendId}-${label._id}`}
                                type="button"
                                className={`flex items-center justify-between rounded-lg px-2 py-1 text-xs transition ${
                                  active
                                    ? 'bg-slate-100 dark:bg-spill-800'
                                    : 'hover:bg-slate-50 dark:hover:bg-spill-800/60'
                                }`}
                                onClick={() =>
                                  toggleContactLabel(elem, label._id)
                                }
                              >
                                <span className="inline-flex items-center gap-2">
                                  <span
                                    className="h-2.5 w-2.5 rounded-full"
                                    style={{ backgroundColor: label.color }}
                                  />
                                  <span className="font-medium">
                                    {label.name}
                                  </span>
                                </span>
                                {active && <bi.BiCheck />}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </span>
                    </>
                  );
                })()}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

export default Contact;
