import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import * as bi from 'react-icons/bi';
import { setModal } from '../../redux/features/modal';
import { callAllowed, getCallingConfig } from '../../helpers/callingConfig';

function CallStart() {
  const dispatch = useDispatch();
  const {
    modal: { callStart },
    user: { master },
  } = useSelector((state) => state);

  const active = !!callStart;
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState([]);
  const [callConfig, setCallConfig] = useState(null);
  const [configError, setConfigError] = useState('');

  const close = () => dispatch(setModal({ target: 'callStart', data: false }));

  useEffect(() => {
    if (!active) {
      setContacts([]);
      setSelected([]);
      setSearch('');
      setConfigError('');
      return () => {};
    }

    const abortCtrl = new AbortController();
    const load = async () => {
      try {
        setLoading(true);
        setConfigError('');
        const [contactsRes, runtimeConfig] = await Promise.all([
          axios.get('/contacts', { signal: abortCtrl.signal }),
          getCallingConfig(),
        ]);
        setContacts(
          Array.isArray(contactsRes?.data?.payload)
            ? contactsRes.data.payload
            : []
        );
        setCallConfig(runtimeConfig);
      } catch (error0) {
        if (error0.name !== 'CanceledError') {
          const message =
            error0?.response?.data?.message ||
            error0.message ||
            'Unable to load calling settings';
          setConfigError(message);
          // eslint-disable-next-line no-console
          console.error(message);
        }
      } finally {
        setLoading(false);
      }
    };

    load();
    return () => abortCtrl.abort();
  }, [active]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((item) => {
      const p = item.profile || {};
      const phone = `${p.dialCode || ''}${p.phone || ''}`;
      const hay = [
        p.fullname || '',
        p.username || '',
        p.email || '',
        p.phone || '',
        phone,
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [contacts, search]);

  const maxSelectable = Math.max(
    1,
    Number(callConfig?.maxGroupParticipants || 4) - 1
  );

  const toggleSelect = (friendId) => {
    setConfigError('');
    setSelected((prev) => {
      if (prev.includes(friendId)) {
        return prev.filter((id) => id !== friendId);
      }
      if (prev.length >= maxSelectable) {
        setConfigError(
          `This server allows up to ${callConfig?.maxGroupParticipants || 4} participants per call`
        );
        return prev;
      }
      return [...prev, friendId];
    });
  };

  const startCall = (mediaType) => {
    const picked = contacts.filter((item) => selected.includes(item.friendId));
    if (picked.length === 0 || !callConfig) return;

    const roomType = picked.length > 1 ? 'group' : 'private';
    const allowed = callAllowed(callConfig, {
      mediaType,
      roomType,
      participants: picked.length + 1,
    });
    if (!allowed.allowed) {
      setConfigError(allowed.message);
      return;
    }

    if (picked.length === 1) {
      const contact = picked[0];
      dispatch(
        setModal({
          target: 'callPanel',
          data: {
            mode: 'outgoing',
            roomId: contact.roomId,
            roomType: 'private',
            mediaType,
            fromUserId: master._id,
            fromName: master.fullname,
            fromUsername: master.username,
            peerName: contact.profile?.fullname || '[inactive]',
            peerSubLabel: contact.profile?.username
              ? `@${contact.profile.username}`
              : '',
            peerAvatar:
              contact.profile?.avatar || 'assets/images/default-avatar.png',
            recipientsId: [contact.friendId],
          },
        })
      );
      close();
      return;
    }

    const roomId = `group-call-${master._id}-${Date.now()}`;
    dispatch(
      setModal({
        target: 'callPanel',
        data: {
          mode: 'outgoing',
          roomId,
          roomType: 'group',
          mediaType,
          fromUserId: master._id,
          fromName: master.fullname,
          fromUsername: master.username,
          peerName: `${picked.length} participants`,
          peerSubLabel: 'Group call',
          peerAvatar: 'assets/images/default-group-avatar.png',
          recipientsId: picked.map((item) => item.friendId),
        },
      })
    );
    close();
  };

  if (!active) return null;

  const audioAllowed =
    !!callConfig &&
    callAllowed(callConfig, {
      mediaType: 'audio',
      roomType: selected.length > 1 ? 'group' : 'private',
      participants: selected.length + 1,
    }).allowed;
  const videoAllowed =
    !!callConfig &&
    callAllowed(callConfig, {
      mediaType: 'video',
      roomType: selected.length > 1 ? 'group' : 'private',
      participants: selected.length + 1,
    }).allowed;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/45"
      aria-hidden
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="w-[560px] max-w-[94vw] max-h-[82vh] rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-spill-700 dark:bg-spill-800">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-spill-700">
          <div>
            <h2 className="text-lg font-bold">Start Call</h2>
            <p className="text-xs opacity-70">
              Select contacts for an admin-managed audio/video call
            </p>
          </div>
          <button
            type="button"
            className="rounded-full p-2 hover:bg-slate-100 dark:hover:bg-spill-700"
            onClick={close}
          >
            <bi.BiX />
          </button>
        </div>

        {configError && (
          <div className="mx-4 mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
            {configError}
          </div>
        )}

        <div className="p-4 border-b border-slate-200 dark:border-spill-700">
          <label
            htmlFor="call-start-search"
            className="h-10 rounded-lg border border-slate-200 px-3 flex items-center gap-2 dark:border-spill-700"
          >
            <bi.BiSearch />
            <input
              id="call-start-search"
              type="text"
              className="w-full text-sm bg-transparent"
              placeholder="Search by username, email, number"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <p className="mt-2 text-xs opacity-60">
            Max participants: {callConfig?.maxGroupParticipants || 4}
          </p>
        </div>

        <div className="max-h-[46vh] overflow-y-auto">
          {loading && (
            <p className="p-4 text-sm opacity-70">Loading contacts and call settings...</p>
          )}
          {!loading && filtered.length === 0 && (
            <p className="p-4 text-sm opacity-70">No contacts found.</p>
          )}
          {!loading &&
            filtered.map((item) => {
              const isSelected = selected.includes(item.friendId);
              return (
                <button
                  key={item._id}
                  type="button"
                  className={`w-full px-4 py-3 grid grid-cols-[auto_1fr_auto] gap-3 items-center text-left border-0 border-b border-solid border-slate-200 dark:border-spill-700 ${
                    isSelected
                      ? 'bg-sky-50 dark:bg-sky-900/20'
                      : 'hover:bg-slate-50 dark:hover:bg-spill-700/40'
                  }`}
                  onClick={() => toggleSelect(item.friendId)}
                >
                  <img
                    src={
                      item.profile?.avatar || 'assets/images/default-avatar.png'
                    }
                    alt=""
                    className="w-10 h-10 rounded-full object-cover"
                  />
                  <span className="min-w-0">
                    <p className="truncate font-medium">
                      {item.profile?.fullname || '[inactive]'}
                    </p>
                    <p className="truncate text-xs opacity-70">
                      @{item.profile?.username || ''} •{' '}
                      {item.profile?.email || '-'}
                    </p>
                  </span>
                  <span
                    className={`w-5 h-5 rounded-full border grid place-items-center ${
                      isSelected
                        ? 'border-sky-500 bg-sky-500 text-white'
                        : 'border-slate-300 dark:border-spill-600'
                    }`}
                  >
                    {isSelected && <bi.BiCheck size={14} />}
                  </span>
                </button>
              );
            })}
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-spill-700">
          <p className="text-sm opacity-80">{selected.length} selected</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="h-9 px-3 rounded-lg bg-emerald-600 text-white disabled:opacity-50"
              disabled={selected.length === 0 || !audioAllowed}
              onClick={() => startCall('audio')}
            >
              <span className="inline-flex items-center gap-1">
                <bi.BiPhoneCall /> Audio
              </span>
            </button>
            <button
              type="button"
              className="h-9 px-3 rounded-lg bg-sky-600 text-white disabled:opacity-50"
              disabled={selected.length === 0 || !videoAllowed}
              onClick={() => startCall('video')}
            >
              <span className="inline-flex items-center gap-1">
                <bi.BiVideo /> Video
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CallStart;
