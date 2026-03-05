import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import moment from 'moment';
import * as bi from 'react-icons/bi';
import { setPage } from '../redux/features/page';
import base64Encode from '../helpers/base64Encode';
import resolveUploadUrl from '../helpers/resolveUploadUrl';
import socket from '../helpers/socket';

const TEXT_BG_COLORS = [
  '#0ea5e9',
  '#06b6d4',
  '#14b8a6',
  '#22c55e',
  '#f59e0b',
  '#ef4444',
  '#ec4899',
  '#8b5cf6',
  '#334155',
];

const parseMentionsFromText = (value = '') => [
  ...new Set(
    String(value)
      .match(/@[a-z0-9_]{3,24}/gi)
      ?.map((x) => x.slice(1).toLowerCase()) || []
  ),
];

function Status() {
  const dispatch = useDispatch();
  const page = useSelector((state) => state.page);
  const master = useSelector((state) => state.user.master);

  const [statuses, setStatuses] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [viewer, setViewer] = useState({
    open: false,
    userId: null,
    index: 0,
  });
  const [form, setForm] = useState({
    type: 'text',
    text: '',
    bgColor: TEXT_BG_COLORS[0],
    mediaDataUrl: '',
    mediaName: '',
    saving: false,
    error: '',
  });

  const closePage = () => dispatch(setPage({ target: 'status', data: false }));

  const loadStatuses = async (signal) => {
    if (!page.status) {
      setStatuses([]);
      return;
    }

    try {
      const { data } = await axios.get('/statuses', { signal });
      setStatuses(data.payload || []);
    } catch (error0) {
      setStatuses([]);
      console.error(error0?.response?.data?.message || error0.message);
    }
  };

  const loadContacts = async (signal) => {
    try {
      const { data } = await axios.get('/contacts', { signal });
      setContacts(data.payload || []);
    } catch (error0) {
      setContacts([]);
      console.error(error0?.response?.data?.message || error0.message);
    }
  };

  useEffect(() => {
    const abortCtrl = new AbortController();

    const boot = async () => {
      if (!page.status) return;
      setLoaded(false);
      await Promise.all([
        loadStatuses(abortCtrl.signal),
        loadContacts(abortCtrl.signal),
      ]);
      setLoaded(true);
    };

    boot();
    return () => abortCtrl.abort();
  }, [page.status]);

  useEffect(() => {
    const handleStatusUpdate = (payload) => {
      if (!payload?.statusId) return;
      setStatuses((prev) =>
        prev.map((item) => {
          if (item._id !== payload.statusId) return item;

          const nextItem = { ...item };
          if (typeof payload.reactionCount === 'number') {
            nextItem.reactionCount = payload.reactionCount;
          }
          if (typeof payload.replyCount === 'number') {
            nextItem.replyCount = payload.replyCount;
          }
          if (
            payload.type === 'react' &&
            payload.actorId === master?._id &&
            Object.prototype.hasOwnProperty.call(payload, 'myReaction')
          ) {
            nextItem.myReaction = payload.myReaction;
          }
          return nextItem;
        })
      );
    };

    const handleStatusNew = (payload) => {
      if (!payload?._id) return;
      setStatuses((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        if (list.some((item) => item._id === payload._id)) return list;
        return [payload, ...list];
      });
      setLoaded(true);
    };

    socket.on('status/update', handleStatusUpdate);
    socket.on('status/new', handleStatusNew);

    return () => {
      socket.off('status/update', handleStatusUpdate);
      socket.off('status/new', handleStatusNew);
    };
  }, [master?._id]);

  const statusGroups = useMemo(() => {
    const map = new Map();
    statuses.forEach((item) => {
      if (!item.profile) return;
      const group = map.get(item.userId) || {
        userId: item.userId,
        profile: item.profile,
        items: [],
      };
      group.items.push(item);
      map.set(item.userId, group);
    });

    const list = [...map.values()];
    list.forEach((group) => {
      group.items.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    });

    list.sort((a, b) => {
      const aTime = new Date(a.items[0]?.createdAt || 0).getTime();
      const bTime = new Date(b.items[0]?.createdAt || 0).getTime();
      return bTime - aTime;
    });

    return list;
  }, [statuses]);

  const myGroup =
    statusGroups.find((group) => group.userId === master?._id) || null;
  const otherGroups = statusGroups.filter(
    (group) => group.userId !== master?._id
  );

  const mentionableUsers = useMemo(
    () =>
      contacts
        .map((item) => item.profile)
        .filter(Boolean)
        .map((profile) => ({
          userId: profile.userId,
          username: profile.username,
          fullname: profile.fullname,
        })),
    [contacts]
  );

  const appendMention = (username) => {
    setForm((prev) => {
      const nextText = `${prev.text}${
        prev.text.endsWith(' ') || prev.text.length === 0 ? '' : ' '
      }@${username} `;
      return { ...prev, text: nextText };
    });
  };

  const handleMediaChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const mediaDataUrl = await base64Encode(file);
      setForm((prev) => ({
        ...prev,
        mediaDataUrl,
        mediaName: file.name,
        error: '',
      }));
    } catch (error0) {
      setForm((prev) => ({
        ...prev,
        error: error0.message,
      }));
    }
  };

  const handlePostStatus = async () => {
    if (form.saving) return;

    if (form.type === 'text' && !form.text.trim()) {
      setForm((prev) => ({
        ...prev,
        error: 'Write something for text status',
      }));
      return;
    }

    if (['photo', 'video'].includes(form.type) && !form.mediaDataUrl) {
      setForm((prev) => ({ ...prev, error: 'Please select a media file' }));
      return;
    }

    try {
      setForm((prev) => ({ ...prev, saving: true, error: '' }));
      const mentions = parseMentionsFromText(form.text);

      const payload = {
        type: form.type,
        text: form.text.trim(),
        bgColor: form.bgColor,
        mediaDataUrl: form.mediaDataUrl || null,
        originalname: form.mediaName || '',
        mentions,
      };

      const { data } = await axios.post('/statuses', payload);

      setStatuses((prev) => [data.payload, ...prev]);
      setForm((prev) => ({
        ...prev,
        text: '',
        mediaDataUrl: '',
        mediaName: '',
        saving: false,
        error: '',
      }));
    } catch (error0) {
      setForm((prev) => ({
        ...prev,
        saving: false,
        error: error0?.response?.data?.message || error0.message,
      }));
    }
  };

  const openViewer = (userId, index = 0) => {
    setViewer({ open: true, userId, index });
  };

  const closeViewer = () => {
    setViewer({ open: false, userId: null, index: 0 });
  };

  const viewingGroup =
    statusGroups.find((group) => group.userId === viewer.userId) || null;
  const viewingItems = viewingGroup?.items || [];
  const viewingItem = viewingItems[viewer.index] || null;

  const stepViewer = (next) => {
    if (!viewingItems.length) return;
    const max = viewingItems.length - 1;
    const index = Math.max(0, Math.min(max, viewer.index + next));
    setViewer((prev) => ({ ...prev, index }));
  };

  useEffect(() => {
    if (!viewer.open || !viewingItem) return undefined;
    if (viewingItem.type === 'video') return undefined;

    const timer = setTimeout(() => {
      if (viewer.index >= viewingItems.length - 1) {
        closeViewer();
      } else {
        stepViewer(1);
      }
    }, 5000);

    return () => clearTimeout(timer);
  }, [viewer.open, viewer.index, viewingItem, viewingItems.length]);

  const handleDeleteStatus = async (statusId) => {
    try {
      await axios.delete(`/statuses/${statusId}`);
      setStatuses((prev) => prev.filter((item) => item._id !== statusId));

      if (viewer.open) {
        const nextItems = viewingItems.filter((item) => item._id !== statusId);
        if (nextItems.length === 0) {
          closeViewer();
        } else {
          setViewer((prev) => ({
            ...prev,
            index: Math.min(prev.index, nextItems.length - 1),
          }));
        }
      }
    } catch (error0) {
      console.error(error0?.response?.data?.message || error0.message);
    }
  };

  return (
    <div
      className={`
        ${page.status ? 'delay-75' : '-translate-x-full'}
        transition duration-200 absolute w-full h-full z-20 grid grid-rows-[auto_1fr] overflow-hidden
        bg-white dark:bg-spill-900 dark:text-white/90
      `}
      id="status-page"
    >
      <div className="h-16 px-2 grid grid-cols-[1fr_auto] gap-4 border-b border-spill-200 dark:border-spill-800">
        <div className="flex gap-4 items-center">
          <button
            type="button"
            className="p-2 rounded-full hover:bg-spill-100 dark:hover:bg-spill-800"
            onClick={closePage}
          >
            <bi.BiArrowBack className="text-2xl" />
          </button>
          <h1 className="text-2xl font-bold">Status</h1>
        </div>
        <div className="flex items-center">
          <button
            type="button"
            className="p-2 rounded-full hover:bg-spill-100 dark:hover:bg-spill-800"
            onClick={() => loadStatuses()}
          >
            <bi.BiRefresh className="text-xl" />
          </button>
        </div>
      </div>

      <div className="overflow-y-auto scrollbar-thin scrollbar-thumb-spill-200 hover:scrollbar-thumb-spill-300 dark:scrollbar-thumb-spill-700 dark:hover:scrollbar-thumb-spill-600">
        <div className="p-4 border-b border-spill-200 dark:border-spill-800 bg-gradient-to-b from-sky-50/70 to-transparent dark:from-sky-950/20">
          <div className="mb-3 p-3 rounded-xl border border-sky-200/70 dark:border-sky-900/60 bg-white/80 dark:bg-spill-900/80 backdrop-blur-sm grid grid-cols-[auto_1fr] gap-3 items-center">
            <div className="relative">
              <img
                src={
                  resolveUploadUrl(master?.avatar) ||
                  'assets/images/default-avatar.png'
                }
                alt=""
                className="w-12 h-12 rounded-full object-cover ring-2 ring-sky-500/80"
              />
              <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-sky-600 text-white grid place-items-center text-xs font-bold">
                +
              </span>
            </div>
            <span className="min-w-0">
              <p className="font-semibold truncate">Share a status</p>
              <p className="text-xs opacity-70 truncate">
                Photos, videos, and text disappear after 24 hours
              </p>
            </span>
          </div>

          <div className="flex gap-2 mb-3 p-1 rounded-full bg-spill-100/80 dark:bg-spill-800/80 w-fit">
            {[
              { key: 'text', label: 'Text' },
              { key: 'photo', label: 'Photo' },
              { key: 'video', label: 'Video' },
            ].map((type) => (
              <button
                key={type.key}
                type="button"
                className={`px-4 py-1.5 rounded-full text-sm transition ${
                  form.type === type.key
                    ? 'bg-sky-600 text-white shadow'
                    : 'text-spill-700 dark:text-spill-200'
                }`}
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    type: type.key,
                    mediaDataUrl: '',
                    mediaName: '',
                    error: '',
                  }))
                }
              >
                {type.label}
              </button>
            ))}
          </div>

          {form.type === 'text' && (
            <div className="grid gap-2">
              <textarea
                id="status-text"
                name="statusText"
                rows={4}
                placeholder="Write your status... use @username to mention"
                className="w-full rounded-xl border border-spill-300 dark:border-spill-700 p-4 text-white placeholder:text-white/70 shadow-sm"
                style={{ backgroundColor: form.bgColor }}
                value={form.text}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, text: e.target.value }))
                }
              />
              <div
                className="rounded-xl p-4 min-h-[88px] text-white border border-white/20 shadow-inner"
                style={{ backgroundColor: form.bgColor }}
              >
                <p className="text-sm opacity-90 mb-1">Preview</p>
                <p className="font-semibold whitespace-pre-wrap break-words">
                  {form.text.trim() || 'Your text story preview'}
                </p>
              </div>
            </div>
          )}

          {['photo', 'video'].includes(form.type) && (
            <div className="grid gap-2">
              <label
                htmlFor="status-media"
                className="w-full h-12 px-3 rounded-xl border border-spill-300 dark:border-spill-700 flex items-center gap-2 cursor-pointer hover:bg-spill-100 dark:hover:bg-spill-800"
              >
                <bi.BiUpload />
                <span className="text-sm truncate">
                  {form.mediaName || `Select a ${form.type} file`}
                </span>
                <input
                  id="status-media"
                  name="statusMedia"
                  type="file"
                  accept={form.type === 'photo' ? 'image/*' : 'video/*'}
                  className="hidden"
                  onChange={handleMediaChange}
                />
              </label>
              {form.mediaDataUrl && form.type === 'photo' && (
                <img
                  src={form.mediaDataUrl}
                  alt=""
                  className="w-full max-h-72 object-cover rounded-xl border border-spill-200 dark:border-spill-700"
                />
              )}
              {form.mediaDataUrl && form.type === 'video' && (
                <video
                  src={form.mediaDataUrl}
                  controls
                  className="w-full max-h-72 object-contain rounded-xl border border-spill-200 dark:border-spill-700 bg-black"
                >
                  <track kind="captions" />
                </video>
              )}
              <textarea
                id="status-caption"
                name="statusCaption"
                rows={3}
                placeholder="Add caption... use @username to mention"
                className="w-full rounded-xl border border-spill-300 dark:border-spill-700 p-3 bg-white dark:bg-spill-900"
                value={form.text}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, text: e.target.value }))
                }
              />
            </div>
          )}

          <div className="mt-3">
            <p className="text-xs opacity-70 mb-2">Text background</p>
            <div className="flex flex-wrap gap-2">
              {TEXT_BG_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Set text background ${color}`}
                  className={`w-8 h-8 rounded-full border-2 shadow-sm ${
                    form.bgColor === color
                      ? 'border-slate-900 dark:border-white'
                      : 'border-transparent'
                  }`}
                  style={{ backgroundColor: color }}
                  onClick={() =>
                    setForm((prev) => ({ ...prev, bgColor: color }))
                  }
                />
              ))}
            </div>
          </div>

          <div className="mt-3">
            <p className="text-xs opacity-70 mb-2">Quick mentions</p>
            <div className="flex flex-wrap gap-2">
              {mentionableUsers.length === 0 && (
                <p className="text-xs opacity-60">
                  No contacts found for mention
                </p>
              )}
              {mentionableUsers.slice(0, 12).map((user) => (
                <button
                  key={user.userId}
                  type="button"
                  className="px-2.5 py-1 rounded-full text-xs bg-spill-100 hover:bg-spill-200 dark:bg-spill-800 dark:hover:bg-spill-700"
                  onClick={() => appendMention(user.username)}
                >
                  @{user.username}
                </button>
              ))}
            </div>
          </div>

          {form.error && (
            <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">
              {form.error}
            </p>
          )}
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              className="px-5 py-2 rounded-full bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-60 shadow"
              disabled={form.saving}
              onClick={handlePostStatus}
            >
              {form.saving ? 'Posting...' : 'Post Status'}
            </button>
          </div>
        </div>

        {!loaded && (
          <div className="h-44 flex justify-center items-center">
            <i className="animate-spin">
              <bi.BiLoaderAlt size={24} />
            </i>
          </div>
        )}

        {loaded && (
          <div className="p-4 grid gap-4">
            <div>
              <p className="text-sm opacity-70 mb-2">My status</p>
              {myGroup ? (
                <button
                  type="button"
                  className="w-full p-3 rounded-xl border border-spill-200 dark:border-spill-700 hover:bg-spill-50 dark:hover:bg-spill-800/60 grid grid-cols-[auto_1fr_auto] gap-3 items-center"
                  onClick={() => openViewer(myGroup.userId)}
                >
                  <span className="p-[2px] rounded-full bg-gradient-to-tr from-emerald-500 via-sky-500 to-blue-600">
                    <img
                      src={
                        resolveUploadUrl(myGroup.profile.avatar) ||
                        'assets/images/default-avatar.png'
                      }
                      alt=""
                      className="w-12 h-12 rounded-full object-cover border-2 border-white dark:border-spill-900"
                    />
                  </span>
                  <span className="text-left overflow-hidden">
                    <p className="font-semibold truncate">
                      {myGroup.profile.fullname}
                    </p>
                    <p className="text-xs opacity-70 truncate">
                      {myGroup.items.length} story | Last{' '}
                      {moment(myGroup.items[0].createdAt).fromNow()}
                    </p>
                  </span>
                  <bi.BiChevronRight />
                </button>
              ) : (
                <p className="text-sm opacity-60">No story yet</p>
              )}
            </div>

            <div>
              <p className="text-sm opacity-70 mb-2">Recent updates</p>
              {otherGroups.length === 0 && (
                <p className="text-sm opacity-60">
                  No status from your contacts yet
                </p>
              )}
              <div className="grid gap-2">
                {otherGroups.map((group) => (
                  <button
                    key={group.userId}
                    type="button"
                    className="w-full p-3 rounded-xl border border-spill-200 dark:border-spill-700 hover:bg-spill-50 dark:hover:bg-spill-800/60 grid grid-cols-[auto_1fr_auto] gap-3 items-center"
                    onClick={() => openViewer(group.userId)}
                  >
                    <span className="p-[2px] rounded-full bg-gradient-to-tr from-emerald-500 via-sky-500 to-blue-600">
                      <img
                        src={
                          resolveUploadUrl(group.profile.avatar) ||
                          'assets/images/default-avatar.png'
                        }
                        alt=""
                        className="w-12 h-12 rounded-full object-cover border-2 border-white dark:border-spill-900"
                      />
                    </span>
                    <span className="text-left overflow-hidden">
                      <p className="font-semibold truncate">
                        {group.profile.fullname}
                      </p>
                      <p className="text-xs opacity-70 truncate">
                        {group.items.length} story |{' '}
                        {moment(group.items[0].createdAt).fromNow()}
                      </p>
                    </span>
                    <bi.BiChevronRight />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {viewer.open && viewingItem && (
        <div className="absolute inset-0 z-30 bg-black/85 text-white grid grid-rows-[auto_1fr_auto]">
          <div className="px-3 pt-3 pb-2 border-b border-white/20">
            <div className="flex gap-1 mb-2">
              {viewingItems.map((item, index) =>
                (() => {
                  let progressTone = 'bg-transparent';
                  if (index < viewer.index) progressTone = 'bg-white';
                  if (index === viewer.index)
                    progressTone = 'bg-white/90 animate-pulse';

                  return (
                    <span
                      key={item._id}
                      className="h-1 flex-1 rounded-full bg-white/20 overflow-hidden"
                    >
                      <span className={`h-full block ${progressTone}`} />
                    </span>
                  );
                })()
              )}
            </div>
            <div className="h-10 flex justify-between items-center">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={
                    resolveUploadUrl(viewingGroup?.profile?.avatar) ||
                    'assets/images/default-avatar.png'
                  }
                  alt=""
                  className="w-9 h-9 rounded-full object-cover"
                />
                <span className="min-w-0">
                  <p className="font-semibold truncate">
                    {viewingGroup?.profile?.fullname}
                  </p>
                  <p className="text-xs opacity-75">
                    {moment(viewingItem.createdAt).fromNow()}
                  </p>
                </span>
              </div>
              <div className="flex items-center gap-2">
                {viewingItem.isMine && (
                  <button
                    type="button"
                    className="p-2 rounded-full hover:bg-rose-500/30 text-rose-300"
                    onClick={() => handleDeleteStatus(viewingItem._id)}
                    title="Delete status"
                  >
                    <bi.BiTrash />
                  </button>
                )}
                <button
                  type="button"
                  className="p-2 rounded-full hover:bg-white/15"
                  onClick={closeViewer}
                >
                  <bi.BiX size={20} />
                </button>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden">
            <button
              type="button"
              aria-label="Previous status"
              className="absolute left-0 top-0 bottom-0 w-1/3 z-10"
              onClick={() => stepViewer(-1)}
              disabled={viewer.index <= 0}
            />
            <button
              type="button"
              aria-label="Next status"
              className="absolute right-0 top-0 bottom-0 w-1/3 z-10"
              onClick={() => stepViewer(1)}
              disabled={viewer.index >= viewingItems.length - 1}
            />

            {viewingItem.type === 'text' && (
              <div
                className="absolute inset-0 flex items-center justify-center p-8"
                style={{ backgroundColor: viewingItem.bgColor || '#0ea5e9' }}
              >
                <p className="text-center text-xl font-semibold whitespace-pre-wrap break-words">
                  {viewingItem.text}
                </p>
              </div>
            )}

            {viewingItem.type === 'photo' && (
              <div className="absolute inset-0 grid grid-rows-[1fr_auto]">
                <img
                  src={resolveUploadUrl(viewingItem.mediaUrl)}
                  alt=""
                  className="w-full h-full object-contain bg-black"
                />
                {viewingItem.text && (
                  <p className="p-4 bg-black/60 text-sm whitespace-pre-wrap break-words">
                    {viewingItem.text}
                  </p>
                )}
              </div>
            )}

            {viewingItem.type === 'video' && (
              <div className="absolute inset-0 grid grid-rows-[1fr_auto]">
                <video
                  src={resolveUploadUrl(viewingItem.mediaUrl)}
                  controls
                  autoPlay
                  onEnded={() => {
                    if (viewer.index >= viewingItems.length - 1) {
                      closeViewer();
                    } else {
                      stepViewer(1);
                    }
                  }}
                  className="w-full h-full object-contain bg-black"
                >
                  <track kind="captions" />
                </video>
                {viewingItem.text && (
                  <p className="p-4 bg-black/60 text-sm whitespace-pre-wrap break-words">
                    {viewingItem.text}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="h-14 px-4 border-t border-white/20 flex items-center justify-between">
            <button
              type="button"
              className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-40"
              onClick={() => stepViewer(-1)}
              disabled={viewer.index <= 0}
            >
              Prev
            </button>
            <p className="text-sm opacity-80">
              {viewer.index + 1} / {viewingItems.length}
            </p>
            <button
              type="button"
              className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-40"
              onClick={() => stepViewer(1)}
              disabled={viewer.index >= viewingItems.length - 1}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Status;
