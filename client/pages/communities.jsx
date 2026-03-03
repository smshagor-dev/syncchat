import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import moment from 'moment';
import { v4 as uuidv4 } from 'uuid';
import * as bi from 'react-icons/bi';
import * as ri from 'react-icons/ri';

import { setPage } from '../redux/features/page';
import { setChatRoom } from '../redux/features/room';
import { setRefreshInbox } from '../redux/features/chore';
import resolveUploadUrl from '../helpers/resolveUploadUrl';
import base64Encode from '../helpers/base64Encode';
import config from '../config';

const emptyGroupForm = {
  open: false,
  community: null,
  name: '',
  desc: '',
  search: '',
  searching: false,
  results: [],
  selected: [],
  submitting: false,
};

const defaultGroupName = (communityName = '') => {
  const base = `${String(communityName || '').trim()} Group`.trim();
  if (!base) return 'New Group';
  return base.length > 32 ? base.slice(0, 32).trim() : base;
};

function Communities() {
  const dispatch = useDispatch();
  const {
    page,
    chore: { refreshInbox },
  } = useSelector((state) => state);

  const [communities, setCommunities] = useState(null);
  const [respond, setRespond] = useState('');
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    avatar: null,
    avatarPreview: '',
  });
  const [expanded, setExpanded] = useState({});
  const [expandedChats, setExpandedChats] = useState({});
  const [loadingChats, setLoadingChats] = useState({});
  const [groupForm, setGroupForm] = useState(emptyGroupForm);
  const fileInputRef = useRef(null);

  const handleGetCommunities = async (signal) => {
    try {
      if (!page.communities) {
        setCommunities(null);
        setCreating(false);
        setGroupForm(emptyGroupForm);
        return;
      }

      const { data } = await axios.get('/communities', { signal });
      setCommunities(data.payload || []);
    } catch (error0) {
      setRespond(error0?.response?.data?.message || error0.message);
    }
  };

  const openCommunityChat = (chat) => {
    if (!chat?.roomId || !chat?.group) return;

    dispatch(
      setChatRoom({
        isOpen: true,
        refreshId: chat.roomId,
        data: {
          ownersId: chat.ownersId || [],
          roomId: chat.roomId,
          roomType: 'group',
          group: chat.group,
        },
      })
    );
  };

  const handleAvatarChange = async (e) => {
    try {
      const file = e.target.files?.[0];
      if (!file) return;

      if (file.size >= config.avatarUploadLimit) {
        const maxMb = Math.round(config.avatarUploadLimit / (1024 * 1024));
        throw new Error(`Image too large (max ${maxMb} MB)`);
      }

      const base64 = await base64Encode(file);
      setCreateForm((prev) => ({
        ...prev,
        avatar: base64,
        avatarPreview: base64,
      }));
      setRespond('');
      e.target.value = '';
    } catch (error0) {
      setRespond(error0.message);
    }
  };

  const handleCreateCommunity = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setRespond('');

      const body = {
        name: createForm.name.trim(),
      };
      if (createForm.avatar) body.avatar = createForm.avatar;

      const { data } = await axios.post('/communities', body);
      setCommunities((prev) => [data.payload, ...(prev || [])]);
      dispatch(setRefreshInbox(uuidv4()));
      setCreateForm({ name: '', avatar: null, avatarPreview: '' });
      setCreating(false);
    } catch (error0) {
      setRespond(error0?.response?.data?.message || error0.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleViewAll = async (communityId) => {
    try {
      if (expanded[communityId]) {
        setExpanded((prev) => ({ ...prev, [communityId]: false }));
        return;
      }

      if (!expandedChats[communityId]) {
        setLoadingChats((prev) => ({ ...prev, [communityId]: true }));
        const { data } = await axios.get(`/communities/${communityId}/chats`);
        setExpandedChats((prev) => ({
          ...prev,
          [communityId]: data.payload || [],
        }));
      }

      setExpanded((prev) => ({ ...prev, [communityId]: true }));
    } catch (error0) {
      setRespond(error0?.response?.data?.message || error0.message);
    } finally {
      setLoadingChats((prev) => ({ ...prev, [communityId]: false }));
    }
  };

  const handleOpenGroupCreator = (community) => {
    setGroupForm({
      ...emptyGroupForm,
      open: true,
      community,
      name: defaultGroupName(community.name),
    });
    setRespond('');
  };

  const handleSearchUsers = async (q) => {
    try {
      const query = String(q || '').trim();
      if (query.length < 2) {
        setGroupForm((prev) => ({ ...prev, results: [] }));
        return;
      }

      setGroupForm((prev) => ({ ...prev, searching: true }));
      const { data } = await axios.get('/contacts/search', {
        params: { q: query },
      });
      setGroupForm((prev) => ({ ...prev, results: data.payload || [] }));
    } catch (error0) {
      setRespond(error0?.response?.data?.message || error0.message);
    } finally {
      setGroupForm((prev) => ({ ...prev, searching: false }));
    }
  };

  const toggleSelectedUser = (user) => {
    setGroupForm((prev) => {
      const exists = prev.selected.some((item) => item.userId === user.userId);
      return {
        ...prev,
        selected: exists
          ? prev.selected.filter((item) => item.userId !== user.userId)
          : [...prev.selected, user],
      };
    });
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    try {
      if (!groupForm.community?._id) return;
      const safeName = String(groupForm.name || '').trim().slice(0, 32);
      if (safeName.length < 3) {
        setRespond('Group name must be at least 3 characters');
        return;
      }
      setGroupForm((prev) => ({ ...prev, submitting: true }));
      setRespond('');

      const selectedUsers = groupForm.selected.filter(
        (item) => !!item?.userId
      );

      await axios.post(`/communities/${groupForm.community._id}/groups`, {
        name: safeName,
        desc: groupForm.desc.trim(),
        participantsId: selectedUsers.map((item) => item.userId),
        identities: selectedUsers
          .flatMap((item) => [item.username, item.email, item.phone])
          .filter(Boolean),
      });

      dispatch(setRefreshInbox(uuidv4()));
      setGroupForm(emptyGroupForm);

      const { data } = await axios.get('/communities');
      setCommunities(data.payload || []);
    } catch (error0) {
      setRespond(error0?.response?.data?.message || error0.message);
    } finally {
      setGroupForm((prev) => ({ ...prev, submitting: false }));
    }
  };

  useEffect(() => {
    const ctrl = new AbortController();
    handleGetCommunities(ctrl.signal);

    return () => ctrl.abort();
  }, [page.communities, refreshInbox]);

  useEffect(() => {
    if (!groupForm.open) return undefined;
    const timeout = setTimeout(() => {
      handleSearchUsers(groupForm.search);
    }, 300);

    return () => clearTimeout(timeout);
  }, [groupForm.search, groupForm.open]);

  return (
    <div
      className={`
        ${page.communities ? 'delay-75' : '-translate-x-full'}
        transition duration-200 absolute w-full h-full z-20 grid grid-rows-[auto_1fr] overflow-hidden
        bg-white dark:bg-spill-900 dark:text-white/90
      `}
    >
      <div className="h-16 px-2 grid grid-cols-[1fr_auto] gap-4 items-center border-0 border-b border-solid border-spill-200 dark:border-spill-800">
        <div className="flex gap-4 items-center">
          <button
            type="button"
            className="p-2 rounded-full hover:bg-spill-100 dark:hover:bg-spill-800"
            onClick={() =>
              dispatch(setPage({ target: 'communities', data: false }))
            }
          >
            <bi.BiArrowBack className="text-2xl" />
          </button>
          <h1 className="text-2xl font-bold">Communities</h1>
        </div>
        <button
          type="button"
          className="mr-2 h-9 px-3 rounded-full bg-sky-600 text-white hover:bg-sky-700 text-sm font-semibold"
          onClick={() => {
            setCreating((prev) => !prev);
            setRespond('');
          }}
        >
          {creating ? 'Close' : 'Create New'}
        </button>
      </div>

      <div className="overflow-y-auto pb-16 md:pb-0 scrollbar-thin scrollbar-thumb-spill-200 hover:scrollbar-thumb-spill-300 dark:scrollbar-thumb-spill-700 dark:hover:scrollbar-thumb-spill-600">
        {creating && (
          <form
            method="post"
            onSubmit={handleCreateCommunity}
            className="m-3 rounded-2xl border border-spill-200 dark:border-spill-700 bg-gradient-to-br from-slate-50 to-sky-50 dark:from-spill-900 dark:to-spill-800 p-4 grid gap-4"
          >
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="w-16 h-16 rounded-2xl overflow-hidden border border-spill-300 dark:border-spill-600 bg-spill-100 dark:bg-spill-800 grid place-items-center"
                onClick={() => fileInputRef.current?.click()}
              >
                {createForm.avatarPreview ? (
                  <img
                    src={createForm.avatarPreview}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <ri.RiCameraLensLine size={22} />
                )}
              </button>
              <div className="min-w-0">
                <p className="font-semibold">Create New Community</p>
                <p className="text-xs opacity-70">
                  Community name and profile photo
                </p>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              className="hidden"
              onChange={handleAvatarChange}
            />
            <label htmlFor="community-name" className="grid gap-1">
              <span className="text-xs opacity-70">Community name</span>
              <input
                id="community-name"
                name="name"
                type="text"
                required
                minLength={3}
                maxLength={64}
                value={createForm.name}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, name: e.target.value }))
                }
                className="h-11 px-3 rounded-xl border border-spill-300 dark:border-spill-700 bg-white dark:bg-spill-900"
                placeholder="Type community name"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="h-10 px-4 rounded-lg bg-spill-100 dark:bg-spill-800 hover:bg-spill-200 dark:hover:bg-spill-700"
                onClick={() => {
                  setCreating(false);
                  setCreateForm({ name: '', avatar: null, avatarPreview: '' });
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="h-10 px-4 rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-70"
              >
                {submitting ? 'Creating...' : 'Create'}
              </button>
            </div>
          </form>
        )}

        {groupForm.open && (
          <form
            method="post"
            noValidate
            onSubmit={handleCreateGroup}
            className="m-3 rounded-2xl border border-sky-200 dark:border-sky-700 bg-gradient-to-br from-sky-50 to-cyan-50 dark:from-spill-900 dark:to-spill-800 p-4 grid gap-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold truncate">
                  New Group in {groupForm.community?.name}
                </p>
                <p className="text-xs opacity-70">
                  Add people by username, email, mobile number (optional)
                </p>
              </div>
              <button
                type="button"
                className="p-2 rounded-full hover:bg-white/70 dark:hover:bg-spill-700"
                onClick={() => setGroupForm(emptyGroupForm)}
              >
                <bi.BiX size={20} />
              </button>
            </div>

            <input
              type="text"
              className="h-10 px-3 rounded-xl border border-spill-300 dark:border-spill-700 bg-white dark:bg-spill-900"
              placeholder="Group name"
              value={groupForm.name}
              onChange={(e) =>
                setGroupForm((prev) => ({ ...prev, name: e.target.value }))
              }
            />
            <input
              type="text"
              maxLength={300}
              className="h-10 px-3 rounded-xl border border-spill-300 dark:border-spill-700 bg-white dark:bg-spill-900"
              placeholder="Description (optional)"
              value={groupForm.desc}
              onChange={(e) =>
                setGroupForm((prev) => ({ ...prev, desc: e.target.value }))
              }
            />

            <label className="h-10 px-3 rounded-xl border border-spill-300 dark:border-spill-700 bg-white dark:bg-spill-900 flex items-center gap-2">
              <bi.BiSearch />
              <input
                type="text"
                className="w-full bg-transparent text-sm"
                placeholder="Search people by username, email, mobile"
                value={groupForm.search}
                onChange={(e) =>
                  setGroupForm((prev) => ({ ...prev, search: e.target.value }))
                }
              />
            </label>

            {groupForm.selected.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {groupForm.selected.map((item) => (
                  <button
                    key={item.userId}
                    type="button"
                    className="flex-none px-2 py-1 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 text-xs flex items-center gap-1"
                    onClick={() => toggleSelectedUser(item)}
                  >
                    <span>{item.fullname}</span>
                    <bi.BiX />
                  </button>
                ))}
              </div>
            )}

            <div className="max-h-52 overflow-y-auto rounded-xl border border-spill-200 dark:border-spill-700 bg-white/80 dark:bg-spill-900/80">
              {groupForm.searching && (
                <p className="px-3 py-2 text-xs opacity-70">Searching...</p>
              )}
              {!groupForm.searching &&
                groupForm.results.map((item) => {
                  const isSelected = groupForm.selected.some(
                    (x) => x.userId === item.userId
                  );
                  return (
                    <button
                      key={item.userId}
                      type="button"
                      className="w-full px-3 py-2 grid grid-cols-[auto_1fr_auto] gap-2 items-center text-left border-0 border-b border-solid border-spill-100 dark:border-spill-800 hover:bg-spill-100/70 dark:hover:bg-spill-800/70"
                      onClick={() => toggleSelectedUser(item)}
                    >
                      <img
                        src={
                          resolveUploadUrl(item.avatar) ||
                          'assets/images/default-avatar.png'
                        }
                        alt=""
                        className="w-9 h-9 rounded-full object-cover"
                      />
                      <span className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {item.fullname}
                        </p>
                        <p className="truncate text-xs opacity-70">
                          @{item.username} - {item.email}
                          {item.phone ? ` - ${item.phone}` : ''}
                        </p>
                      </span>
                      <i
                        className={
                          isSelected
                            ? 'text-sky-600 dark:text-sky-400'
                            : 'text-spill-400'
                        }
                      >
                        {isSelected ? <bi.BiCheckCircle /> : <bi.BiCircle />}
                      </i>
                    </button>
                  );
                })}
              {!groupForm.searching &&
                groupForm.search.trim().length >= 2 &&
                groupForm.results.length === 0 && (
                  <p className="px-3 py-3 text-xs opacity-70">No user found</p>
                )}
            </div>

            <div className="flex items-center justify-between">
              <p className="text-xs opacity-70">
                Participants: {groupForm.selected.length}
              </p>
              <button
                type="submit"
                disabled={groupForm.submitting}
                className="h-9 px-4 rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-70"
              >
                {groupForm.submitting ? 'Creating...' : 'Create Group'}
              </button>
            </div>
          </form>
        )}

        {respond && (
          <p className="mx-4 mb-3 text-sm text-rose-600 dark:text-rose-400">
            {respond}
          </p>
        )}

        {!communities && (
          <p className="px-4 py-3 text-sm opacity-70">Loading communities...</p>
        )}

        {communities && communities.length === 0 && (
          <div className="px-4 py-10 grid place-items-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 grid place-items-center">
              <ri.RiCommunityLine size={24} />
            </div>
            <p className="mt-3 font-semibold">No community yet</p>
            <p className="text-sm opacity-70 mt-1">
              Create New Community to start grouped chats.
            </p>
          </div>
        )}

        <div className="grid gap-3 p-3">
          {(communities || []).map((community) => {
            const chats = expanded[community._id]
              ? expandedChats[community._id] || []
              : community.previewChats || [];
            const unreadRooms = chats.filter((chat) => chat.unreadRooms).length;

            return (
              <div
                key={community._id}
                className="rounded-2xl border border-spill-200 dark:border-spill-700 overflow-hidden bg-white dark:bg-spill-900"
              >
                <div className="px-3 py-3 grid grid-cols-[auto_1fr_auto] gap-3 items-center bg-gradient-to-r from-slate-50 to-sky-50 dark:from-spill-900 dark:to-spill-800 border-0 border-b border-solid border-spill-200 dark:border-spill-700">
                  <img
                    src={
                      resolveUploadUrl(community.avatar) ||
                      'assets/images/default-group-avatar.png'
                    }
                    alt=""
                    className="w-12 h-12 rounded-2xl object-cover border border-spill-200 dark:border-spill-700"
                  />
                  <div className="min-w-0">
                    <p className="font-bold truncate">{community.name}</p>
                    <p className="text-xs opacity-70 truncate">
                      {community.totalChats} chats
                    </p>
                  </div>
                  <span className="px-2 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    unread {community.unreadTotal || 0}
                  </span>
                </div>

                <div className="px-3 py-2 flex items-center justify-between border-0 border-b border-solid border-spill-100 dark:border-spill-800">
                  <p className="text-xs opacity-70">Community actions</p>
                  <button
                    type="button"
                    className="h-8 px-3 rounded-full bg-sky-600 text-white text-xs font-semibold hover:bg-sky-700"
                    onClick={() => handleOpenGroupCreator(community)}
                  >
                    + New Group
                  </button>
                </div>

                <div className="grid">
                  {chats.length === 0 && (
                    <p className="px-3 py-3 text-sm opacity-70">
                      No chats found in this community.
                    </p>
                  )}

                  {chats.map((chat) => (
                    <button
                      key={chat.inboxId}
                      type="button"
                      className="w-full px-3 py-2 grid grid-cols-[1fr_auto] gap-2 items-center text-left border-0 border-b border-solid border-spill-100 dark:border-spill-800 hover:bg-spill-100/60 dark:hover:bg-spill-800/60"
                      onClick={() => openCommunityChat(chat)}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">
                          {chat.group?.name || 'Group'}
                        </p>
                        <p className="text-xs opacity-70 truncate">
                          {chat.content?.senderName || chat.senderName}:{' '}
                          {chat.content?.text || ''}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] opacity-60">
                          {chat.content?.time
                            ? moment(chat.content.time).fromNow()
                            : ''}
                        </p>
                        {chat.unreadRooms && (
                          <span className="mt-1 inline-flex min-w-5 h-5 px-1 items-center justify-center rounded-full bg-sky-600 text-white text-[11px] font-bold">
                            {chat.unreadMessage > 0 ? chat.unreadMessage : 1}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>

                <div className="px-3 py-2 flex items-center justify-between bg-spill-50 dark:bg-spill-900/40">
                  <p className="text-xs opacity-70">
                    Showing {chats.length}{' '}
                    {expanded[community._id] ? 'all' : 'preview'} chats
                  </p>
                  <button
                    type="button"
                    className="text-sm font-semibold text-sky-700 dark:text-sky-400 hover:underline"
                    onClick={() => handleToggleViewAll(community._id)}
                    disabled={loadingChats[community._id]}
                  >
                    {loadingChats[community._id]
                      ? 'Loading...'
                      : expanded[community._id]
                      ? 'Show less'
                      : 'View all'}
                  </button>
                </div>

                {!expanded[community._id] && unreadRooms >= 3 && (
                  <p className="px-3 pb-3 text-xs text-emerald-700 dark:text-emerald-400">
                    Showing unread top 3 chats.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default Communities;

