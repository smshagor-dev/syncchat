import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import * as bi from 'react-icons/bi';
import { v4 as uuidv4 } from 'uuid';
import socket from '../helpers/socket';
import { setPage } from '../redux/features/page';
import { setRefreshInbox } from '../redux/features/chore';
import { setChatRoom } from '../redux/features/room';
import resolveUploadUrl from '../helpers/resolveUploadUrl';

function Channels() {
  const dispatch = useDispatch();
  const { page, user } = useSelector((state) => state);
  const master = user.master;
  const isOpen = !!page.channels;
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: '',
    desc: '',
    accessType: 'public',
    password: '',
  });
  const [avatarDataUri, setAvatarDataUri] = useState('');
  const [error, setError] = useState('');
  const passwordResolverRef = React.useRef(null);
  const [passwordDialog, setPasswordDialog] = useState({
    open: false,
    mode: 'open',
    channel: null,
    password: '',
    error: '',
  });

  const loadChannels = async (signal) => {
    try {
      setLoading(true);
      const { data } = await axios.get('/channels', { signal });
      setChannels(data?.payload || []);
    } catch (error0) {
      setError(error0?.response?.data?.message || error0.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return undefined;
    const abortCtrl = new AbortController();
    loadChannels(abortCtrl.signal);
    return () => abortCtrl.abort();
  }, [isOpen]);

  useEffect(() => {
    const handleCreate = () => dispatch(setRefreshInbox(uuidv4()));
    const handleEdit = () => loadChannels().catch?.(() => {});
    socket.on('channel/create', handleCreate);
    socket.on('channel/edit', handleEdit);
    return () => {
      socket.off('channel/create', handleCreate);
      socket.off('channel/edit', handleEdit);
    };
  }, []);

  const joinedChannels = useMemo(
    () => channels.filter((item) => item.subscribed),
    [channels]
  );
  const discoverChannels = useMemo(
    () => channels.filter((item) => !item.subscribed),
    [channels]
  );

  const resetForm = () => {
    setForm({
      name: '',
      desc: '',
      accessType: 'public',
      password: '',
    });
    setAvatarDataUri('');
    setError('');
  };

  const closePasswordDialog = (value = null) => {
    if (passwordResolverRef.current) {
      passwordResolverRef.current(value);
      passwordResolverRef.current = null;
    }
    setPasswordDialog({
      open: false,
      mode: 'open',
      channel: null,
      password: '',
      error: '',
    });
  };

  const requestChannelPassword = (channel, mode = 'open') =>
    new Promise((resolve) => {
      passwordResolverRef.current = resolve;
      setPasswordDialog({
        open: true,
        mode,
        channel,
        password: '',
        error: '',
      });
    });

  const submitPasswordDialog = () => {
    const password = String(passwordDialog.password || '');
    if (!password) {
      setPasswordDialog((prev) => ({
        ...prev,
        error: 'Password is required',
      }));
      return;
    }
    closePasswordDialog(password);
  };

  const handleCreate = () => {
    const name = String(form.name || '').trim();
    const desc = String(form.desc || '').trim();
    const password = String(form.password || '');

    if (name.length < 3 || name.length > 32) {
      setError('Channel name must be between 3 and 32 characters');
      return;
    }
    if (desc.length > 300) {
      setError('Channel description is too long');
      return;
    }
    if (form.accessType === 'private' && password.length < 4) {
      setError('Private channel password must be at least 4 characters');
      return;
    }

    setCreating(true);
    setError('');
    socket.emit(
      'channel/create',
      {
        name,
        desc,
        avatar: avatarDataUri || null,
        accessType: form.accessType,
        password,
        adminId: master._id,
        participantsId: [],
      },
      (res) => {
        if (!res?.success) {
          setCreating(false);
          setError(res?.message || 'Failed to create channel');
          return;
        }

        dispatch(setRefreshInbox(uuidv4()));
        resetForm();
        loadChannels().catch?.(() => {});
        setCreating(false);
      }
    );
  };

  const isPrivateChannel = (channel) =>
    channel?.accessType === 'private' || !!channel?.requiresPassword;

  const handleSubscribe = async (channel) => {
    const run = (password = '') =>
      socket.emit(
        'channel/subscribe',
        {
          channelId: channel._id,
          userId: master._id,
          password,
        },
        (res) => {
          if (!res?.success) {
            setError(res?.message || 'Failed to subscribe');
            return;
          }
          if (res?.payload?.inbox) {
            window.dispatchEvent(
              new CustomEvent('syncchat:channel-create', {
                detail: { inbox: res.payload.inbox },
              })
            );
            dispatch(
              setChatRoom({
                isOpen: true,
                refreshId: res.payload.inbox.roomId,
                data: {
                  ...res.payload.inbox,
                  roomId: res.payload.inbox.roomId,
                  roomType: 'group',
                  group:
                    res.payload.inbox.channel ||
                    res.payload.inbox.group ||
                    null,
                  channel: res.payload.inbox.channel || null,
                },
              })
            );
            dispatch(setPage({ target: 'channels', data: false }));
          }
          dispatch(setRefreshInbox(uuidv4()));
          loadChannels().catch?.(() => {});
        }
      );

    if (isPrivateChannel(channel)) {
      const password = await requestChannelPassword(channel, 'join');
      if (!password) return;
      run(password);
      return;
    }

    run('');
  };

  const verifyChannelAccess = async (channel) => {
    if (!isPrivateChannel(channel)) return true;
    const password = await requestChannelPassword(channel, 'open');
    if (!password) return false;

    try {
      await axios.post(`/channels/${channel._id}/verify-password`, {
        password,
      });
      return true;
    } catch (error0) {
      setError(error0?.response?.data?.message || 'Invalid password');
      return false;
    }
  };

  const openChannelInfo = async (channel) => {
    const unlocked = await verifyChannelAccess(channel);
    if (!unlocked) return;

    dispatch(
      setChatRoom({
        isOpen: true,
        refreshId: channel.roomId,
        data: {
          roomId: channel.roomId,
          roomType: 'group',
          ownersId: channel.participantsId || [],
          group: channel,
          channel,
        },
      })
    );
    dispatch(setPage({ target: 'channels', data: false }));
    window.setTimeout(() => {
      dispatch(
        setPage({
          target: 'channelProfile',
          data: {
            channelId: channel._id,
            roomId: channel.roomId || null,
            title: channel.name,
          },
        })
      );
    }, 0);
  };

  const openChannelRoom = async (channel) => {
    const unlocked = await verifyChannelAccess(channel);
    if (!unlocked) return;

    dispatch(
      setChatRoom({
        isOpen: true,
        refreshId: channel.roomId,
        data: {
          roomId: channel.roomId,
          roomType: 'group',
          ownersId: channel.participantsId || [],
          group: channel,
          channel,
        },
      })
    );
    dispatch(setPage({ target: 'channels', data: false }));
  };

  const handleAvatarPick = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setAvatarDataUri(String(reader.result || ''));
    reader.readAsDataURL(file);
  };

  return (
    <section
      className={`
        ${isOpen ? 'delay-75' : '-translate-x-full'}
        transition duration-200 absolute w-full h-full z-20 grid grid-rows-[auto_auto_1fr] overflow-hidden
        border-0 border-r border-solid border-slate-200 bg-white dark:border-spill-700 dark:bg-spill-900
      `}
    >
        <div className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-full p-2 hover:bg-slate-100 dark:hover:bg-spill-800"
              onClick={() => dispatch(setPage({ target: 'channels', data: false }))}
            >
              <bi.BiArrowBack />
            </button>
            <div>
              <h1 className="text-xl font-bold">Channels</h1>
              <p className="text-xs opacity-70">Broadcast-style rooms with subscriber controls</p>
            </div>
          </div>
        </div>

        <div className="border-y border-slate-200 bg-slate-50 px-4 py-3 dark:border-spill-700 dark:bg-spill-950/60">
          <div className="grid gap-3">
            <div className="grid grid-cols-[auto_1fr] gap-3">
              <label
                htmlFor="channel-avatar"
                className="relative h-16 w-16 overflow-hidden rounded-2xl ring-2 ring-sky-500/20"
              >
                <img
                  src={resolveUploadUrl(avatarDataUri) || 'assets/images/default-group-avatar.png'}
                  alt=""
                  className="h-full w-full object-cover"
                />
                <span className="absolute inset-0 grid place-items-center bg-black/35 text-white">
                  <bi.BiCamera />
                </span>
              </label>
              <div className="grid gap-2">
                <input
                  id="channel-avatar"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarPick}
                />
                <input
                  id="channel-name"
                  name="channel_name"
                  type="text"
                  value={form.name}
                  placeholder="Channel name"
                  className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-spill-700 dark:bg-spill-900"
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                />
                <textarea
                  id="channel-description"
                  name="channel_description"
                  value={form.desc}
                  rows={2}
                  placeholder="Description"
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-spill-700 dark:bg-spill-900"
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, desc: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <select
                id="channel-access-type"
                name="channel_access_type"
                value={form.accessType}
                className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-spill-700 dark:bg-spill-900"
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    accessType: e.target.value,
                    password: e.target.value === 'private' ? prev.password : '',
                  }))
                }
              >
                <option value="public">Public channel</option>
                <option value="private">Private channel</option>
              </select>
              <button
                type="button"
                className="h-10 rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white disabled:opacity-60"
                onClick={handleCreate}
                disabled={creating}
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
            {form.accessType === 'private' && (
              <input
                id="channel-password"
                name="channel_password"
                type="password"
                value={form.password}
                placeholder="Channel password"
                className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-spill-700 dark:bg-spill-900"
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, password: e.target.value }))
                }
              />
            )}
            {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
          </div>
        </div>

        <div className="overflow-y-auto">
          <div className="border-b border-slate-200 px-4 py-3 dark:border-spill-700">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] opacity-60">
              Joined
            </p>
            {loading && <p className="text-sm opacity-70">Loading channels...</p>}
            {!loading && joinedChannels.length === 0 && (
              <p className="text-sm opacity-70">No subscribed channels yet</p>
            )}
            <div className="grid gap-2">
              {joinedChannels.map((channel) => (
                <button
                  key={channel._id}
                  type="button"
                  className="grid grid-cols-[auto_1fr_auto] gap-3 rounded-2xl border border-slate-200 px-3 py-3 text-left hover:bg-slate-50 dark:border-spill-700 dark:hover:bg-spill-800/70"
                  onClick={() => openChannelRoom(channel)}
                >
                  <img
                    src={
                      resolveUploadUrl(channel.avatar) ||
                      'assets/images/default-group-avatar.png'
                    }
                    alt=""
                    className="h-12 w-12 rounded-2xl object-cover"
                  />
                  <span className="min-w-0">
                    <p className="truncate font-semibold">
                      {channel.accessType === 'private' && <bi.BiLockAlt className="mr-1 inline" />}
                      {channel.name}
                    </p>
                    <p className="truncate text-sm opacity-70">{channel.desc || 'No description yet'}</p>
                  </span>
                  <span className="flex items-center gap-2">
                    <button
                      type="button"
                      className="rounded-full p-2 hover:bg-slate-100 dark:hover:bg-spill-700"
                      onClick={(e) => {
                        e.stopPropagation();
                        openChannelInfo(channel);
                      }}
                    >
                      <bi.BiInfoCircle />
                    </button>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="px-4 py-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] opacity-60">
              Discover
            </p>
            {discoverChannels.length === 0 && (
              <p className="text-sm opacity-70">No discoverable channels available</p>
            )}
            <div className="grid gap-2">
              {discoverChannels.map((channel) => (
                <div
                  key={channel._id}
                  className="grid grid-cols-[auto_1fr_auto] gap-3 rounded-2xl border border-slate-200 px-3 py-3 dark:border-spill-700"
                >
                  <img
                    src={
                      resolveUploadUrl(channel.avatar) ||
                      'assets/images/default-group-avatar.png'
                    }
                    alt=""
                    className="h-12 w-12 rounded-2xl object-cover"
                  />
                  <span className="min-w-0">
                    <p className="truncate font-semibold">
                      {channel.accessType === 'private' && <bi.BiLockAlt className="mr-1 inline" />}
                      {channel.name}
                    </p>
                    <p className="truncate text-sm opacity-70">
                      {channel.totalSubscribers || 0} subscribers
                    </p>
                  </span>
                  <button
                    type="button"
                    className="rounded-xl bg-sky-600 px-3 text-sm font-semibold text-white"
                    onClick={() => handleSubscribe(channel)}
                  >
                    Join
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
        {passwordDialog.open && (
          <div className="absolute inset-0 z-30 bg-slate-900/35 px-4 py-6">
            <div
              aria-hidden
              className="absolute inset-0"
              onClick={() => closePasswordDialog(null)}
            />
            <div className="relative mx-auto mt-20 grid max-w-md gap-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-2xl dark:border-spill-700 dark:bg-spill-900">
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-sky-100 text-sky-700 dark:bg-spill-800 dark:text-sky-300">
                  <bi.BiLockAlt size={20} />
                </span>
                <div>
                  <h3 className="text-lg font-semibold">
                    {passwordDialog.mode === 'join'
                      ? 'Join private channel'
                      : 'Open private channel'}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-white/60">
                    Enter the password for{' '}
                    {passwordDialog.channel?.name || 'this channel'}.
                  </p>
                </div>
              </div>
              <label className="grid gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-white/45">
                  Channel password
                </span>
                <input
                  id="channel-access-password"
                  name="channel_access_password"
                  type="password"
                  value={passwordDialog.password}
                  autoFocus
                  className="h-11 rounded-2xl border border-slate-300 bg-white px-4 text-sm outline-none focus:border-sky-500 dark:border-spill-700 dark:bg-spill-950"
                  placeholder="Type password"
                  onChange={(e) =>
                    setPasswordDialog((prev) => ({
                      ...prev,
                      password: e.target.value,
                      error: '',
                    }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      submitPasswordDialog();
                    }
                  }}
                />
              </label>
              {passwordDialog.error && (
                <p className="text-xs text-rose-600 dark:text-rose-400">
                  {passwordDialog.error}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="h-10 rounded-xl border border-slate-300 px-4 text-sm font-medium hover:bg-slate-50 dark:border-spill-700 dark:hover:bg-spill-800"
                  onClick={() => closePasswordDialog(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="h-10 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700"
                  onClick={submitPasswordDialog}
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        )}
    </section>
  );
}

export default Channels;
