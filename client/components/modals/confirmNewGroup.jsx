import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDispatch, useSelector } from 'react-redux';
import * as bi from 'react-icons/bi';
import { setModal } from '../../redux/features/modal';
import { setPage } from '../../redux/features/page';
import { setSelectedParticipants } from '../../redux/features/chore';
import socket from '../../helpers/socket';
import resolveUploadUrl from '../../helpers/resolveUploadUrl';

const mapContactToCandidate = (item) => {
  const profile = item?.profile || {};
  return {
    userId: item.friendId || profile.userId,
    fullname: profile.fullname || '[inactive]',
    username: profile.username || '',
    email: profile.email || '',
    phone: profile.phone || '',
    avatar: profile.avatar || '',
  };
};

const mapSearchToCandidate = (item) => ({
  userId: item.userId,
  fullname: item.fullname || '[inactive]',
  username: item.username || '',
  email: item.email || '',
  phone: item.phone || '',
  avatar: item.avatar || '',
});

const uniqByUserId = (rows = []) => {
  const map = new Map();
  rows.forEach((row) => {
    if (row?.userId && !map.has(row.userId)) {
      map.set(row.userId, row);
    }
  });
  return [...map.values()];
};

function ConfirmNewGroup() {
  const dispatch = useDispatch();
  const {
    user: { master },
    chore: { selectedParticipants },
    modal,
  } = useSelector((state) => state);

  const [respond, setRespond] = useState({ success: true, message: null });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: '',
    desc: '',
    accessType: 'public',
    password: '',
  });
  const [contacts, setContacts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [avatarDataUri, setAvatarDataUri] = useState('');

  const closeModal = () => {
    dispatch(setModal({ target: 'newGroup', data: false }));
    dispatch(setPage({ target: 'selectParticipant', data: false }));
  };

  const resetForm = () => {
    setRespond({ success: true, message: null });
    setIsSubmitting(false);
    setForm({
      name: '',
      desc: '',
      accessType: 'public',
      password: '',
    });
    setSearchQuery('');
    setSearchResults([]);
    setSelectedUsers([]);
    setAvatarDataUri('');
    dispatch(setSelectedParticipants([]));
  };

  useEffect(() => {
    if (!modal.newGroup) return;

    const initial = uniqByUserId(
      (selectedParticipants || []).map(mapContactToCandidate)
    );
    setSelectedUsers(initial);
    setRespond({ success: true, message: null });
  }, [modal.newGroup, selectedParticipants]);

  useEffect(() => {
    if (!modal.newGroup) return undefined;

    const ctrl = new AbortController();

    const loadContacts = async () => {
      try {
        const { data } = await axios.get('/contacts', { signal: ctrl.signal });
        const mapped = (data?.payload || []).map(mapContactToCandidate);
        setContacts(uniqByUserId(mapped));
      } catch (error0) {
        if (error0.name !== 'CanceledError') {
          // eslint-disable-next-line no-console
          console.error(error0?.response?.data?.message || error0.message);
        }
      }
    };

    loadContacts();
    return () => ctrl.abort();
  }, [modal.newGroup]);

  useEffect(() => {
    if (!modal.newGroup) return undefined;

    const query = String(searchQuery || '').trim();
    if (query.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return undefined;
    }

    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        setIsSearching(true);
        const { data } = await axios.get('/contacts/search', {
          params: { q: query },
          signal: ctrl.signal,
        });
        setSearchResults(uniqByUserId((data?.payload || []).map(mapSearchToCandidate)));
      } catch (error0) {
        if (error0.name !== 'CanceledError') {
          // eslint-disable-next-line no-console
          console.error(error0?.response?.data?.message || error0.message);
        }
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [searchQuery, modal.newGroup]);

  const candidatePool = useMemo(() => {
    const query = String(searchQuery || '').trim();
    const base = query.length >= 2 ? searchResults : contacts;
    return uniqByUserId(base).filter((item) => item.userId !== master?._id);
  }, [searchQuery, searchResults, contacts, master?._id]);

  const selectedMap = useMemo(
    () => new Map(selectedUsers.map((item) => [item.userId, item])),
    [selectedUsers]
  );

  const availableCandidates = candidatePool.filter(
    (item) => !selectedMap.has(item.userId)
  );

  const handleSelectCandidate = (candidate) => {
    setSelectedUsers((prev) => uniqByUserId([...prev, candidate]));
  };

  const handleRemoveCandidate = (userId) => {
    setSelectedUsers((prev) => prev.filter((item) => item.userId !== userId));
  };

  const handleAvatarPick = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!String(file.type || '').startsWith('image/')) {
      setRespond({ success: false, message: 'Please choose an image file' });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setAvatarDataUri(String(reader.result || ''));
    };
    reader.onerror = () => {
      setRespond({ success: false, message: 'Failed to read selected image' });
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    const name = String(form.name || '').trim();
    const desc = String(form.desc || '').trim();
    const accessType = form.accessType === 'private' ? 'private' : 'public';
    const password = String(form.password || '');

    if (name.length < 3 || name.length > 32) {
      setRespond({
        success: false,
        message: 'Group name must be between 3 and 32 characters',
      });
      return;
    }
    if (desc.length > 300) {
      setRespond({
        success: false,
        message: 'Group description is too long (max 300)',
      });
      return;
    }
    if (accessType === 'private' && password.length < 4) {
      setRespond({
        success: false,
        message: 'Private group password must be at least 4 characters',
      });
      return;
    }

    setIsSubmitting(true);
    setRespond({ success: true, message: null });

    socket.emit(
      'group/create',
      {
        name,
        desc,
        avatar: avatarDataUri || null,
        accessType,
        password,
        adminId: master._id,
        participantsId: selectedUsers.map((item) => item.userId),
      },
      (res) => {
        const { success, message } = res || {};

        if (!success) {
          setIsSubmitting(false);
          setRespond({
            success: false,
            message: message || 'Failed to create group',
          });
          return;
        }

        setRespond({
          success: true,
          message: message || 'Group created successfully',
        });
        setIsSubmitting(false);

        setTimeout(() => {
          closeModal();
          resetForm();
        }, 500);
      }
    );
  };

  const modalView = (
    <div
      id="new-group"
      className={`
        ${modal.newGroup ? 'z-[700] opacity-100' : 'pointer-events-none opacity-0'}
        fixed inset-0 transition duration-200
        bg-slate-950/50 backdrop-blur-[2px]
      `}
      aria-hidden
      onClick={() => {
        closeModal();
        resetForm();
      }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(14,165,233,0.2),transparent_45%)]" />
      <div className="relative h-full w-full grid place-items-end sm:place-items-center p-0 sm:p-5">
        <div
          aria-hidden
          className={`
            ${!modal.newGroup && 'translate-y-4 sm:translate-y-0 sm:scale-95'}
            transition duration-200
            w-full h-full sm:h-auto sm:max-h-[92vh] sm:max-w-4xl
            rounded-none sm:rounded-2xl overflow-hidden
            border-0 sm:border border-slate-200/80 dark:border-spill-700
            shadow-none sm:shadow-2xl
            bg-slate-50 dark:bg-spill-900
            grid grid-rows-[auto_1fr_auto]
          `}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-spill-700 bg-white/90 dark:bg-spill-900/90 backdrop-blur sticky top-0 z-10">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
                  Create New Group
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-spill-300">
                  Set identity, privacy and members in one place
                </p>
                {respond.message && (
                  <p
                    className={`mt-2 text-xs sm:text-sm ${
                      respond.success
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {respond.message}
                  </p>
                )}
              </div>
              <button
                type="button"
                className="h-9 w-9 grid place-items-center rounded-full border border-slate-200 dark:border-spill-700 hover:bg-slate-100 dark:hover:bg-spill-800"
                onClick={() => {
                  closeModal();
                  resetForm();
                }}
              >
                <bi.BiX size={20} />
              </button>
            </div>
          </div>

          {modal.newGroup && (
            <form
              method="post"
              className="overflow-y-auto px-4 sm:px-6 py-4 sm:py-5 space-y-4 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-spill-700"
              onSubmit={handleSubmit}
            >
              <section className="rounded-xl border border-slate-200 dark:border-spill-700 bg-white dark:bg-spill-900 p-3 sm:p-4">
                <div className="grid gap-4 sm:grid-cols-[auto_1fr] items-start">
                  <div className="grid gap-2 justify-items-center">
                    <label
                      htmlFor="group-avatar-input"
                      className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden cursor-pointer ring-2 ring-sky-500/20"
                    >
                      <img
                        src={
                          avatarDataUri ||
                          'assets/images/default-group-avatar.png'
                        }
                        alt=""
                        className="w-full h-full object-cover"
                      />
                      <span className="absolute inset-0 bg-slate-900/40 opacity-0 hover:opacity-100 transition flex justify-center items-center text-white">
                        <bi.BiCamera size={22} />
                      </span>
                    </label>
                    <input
                      id="group-avatar-input"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarPick}
                    />
                    <p className="text-[11px] sm:text-xs text-slate-500 dark:text-spill-300">
                      Group Icon
                    </p>
                    {avatarDataUri && (
                      <button
                        type="button"
                        className="text-xs text-rose-600 dark:text-rose-400"
                        onClick={() => setAvatarDataUri('')}
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="grid gap-3">
                    <label htmlFor="group-name" className="grid gap-1">
                      <span className="text-xs font-semibold text-slate-600 dark:text-spill-300">
                        Group Name
                      </span>
                      <input
                        id="group-name"
                        type="text"
                        name="name"
                        autoComplete="off"
                        minLength={3}
                        maxLength={32}
                        required
                        value={form.name}
                        placeholder="Team, Family, Project..."
                        className="h-11 px-3 rounded-lg border border-slate-300 dark:border-spill-600 bg-slate-50 dark:bg-spill-950 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, name: e.target.value }))
                        }
                      />
                    </label>

                    <label htmlFor="group-desc" className="grid gap-1">
                      <span className="text-xs font-semibold text-slate-600 dark:text-spill-300">
                        Description
                      </span>
                      <textarea
                        id="group-desc"
                        name="desc"
                        rows={3}
                        maxLength={300}
                        value={form.desc}
                        placeholder="What this group is about..."
                        className="px-3 py-2 rounded-lg border border-slate-300 dark:border-spill-600 bg-slate-50 dark:bg-spill-950 resize-none focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, desc: e.target.value }))
                        }
                      />
                    </label>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 dark:border-spill-700 bg-white dark:bg-spill-900 p-3 sm:p-4 grid gap-3 sm:grid-cols-[1fr_auto] items-end">
                <label htmlFor="group-access-type" className="grid gap-1">
                  <span className="text-xs font-semibold text-slate-600 dark:text-spill-300">
                    Group Policy
                  </span>
                  <select
                    id="group-access-type"
                    name="accessType"
                    value={form.accessType}
                    className="h-11 px-3 rounded-lg border border-slate-300 dark:border-spill-600 bg-slate-50 dark:bg-spill-950 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        accessType: e.target.value,
                        password:
                          e.target.value === 'private' ? prev.password : '',
                      }))
                    }
                  >
                    <option value="public">Public</option>
                    <option value="private">Private</option>
                  </select>
                </label>
                {form.accessType === 'private' && (
                  <label htmlFor="group-password" className="grid gap-1">
                    <span className="text-xs font-semibold text-slate-600 dark:text-spill-300">
                      Password
                    </span>
                    <input
                      id="group-password"
                      type="password"
                      minLength={4}
                      maxLength={64}
                      required
                      value={form.password}
                      placeholder="Minimum 4 characters"
                      className="h-11 px-3 rounded-lg border border-slate-300 dark:border-spill-600 bg-slate-50 dark:bg-spill-950 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          password: e.target.value,
                        }))
                      }
                    />
                  </label>
                )}
              </section>

              <section className="rounded-xl border border-slate-200 dark:border-spill-700 bg-white dark:bg-spill-900 p-3 sm:p-4 space-y-3">
                <label htmlFor="group-member-search" className="grid gap-1">
                  <span className="text-xs font-semibold text-slate-600 dark:text-spill-300">
                    Add Members (username, mobile, email)
                  </span>
                  <div className="h-11 px-3 rounded-lg border border-slate-300 dark:border-spill-600 bg-slate-50 dark:bg-spill-950 flex items-center gap-2">
                    <bi.BiSearch className="opacity-70" />
                    <input
                      id="group-member-search"
                      type="text"
                      autoComplete="off"
                      value={searchQuery}
                      placeholder="Search people..."
                      className="w-full bg-transparent text-sm focus:outline-none"
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </label>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <div className="rounded-lg border border-slate-200 dark:border-spill-700 overflow-hidden">
                    <div className="px-3 py-2 text-xs font-semibold bg-slate-100 dark:bg-spill-800 text-slate-600 dark:text-spill-300">
                      Selected Members ({selectedUsers.length})
                    </div>
                    <div className="max-h-52 overflow-y-auto">
                      {selectedUsers.length === 0 && (
                        <p className="px-3 py-4 text-sm text-slate-500 dark:text-spill-400">
                          No members selected yet
                        </p>
                      )}
                      {selectedUsers.map((user) => (
                        <div
                          key={`selected-${user.userId}`}
                          className="px-3 py-2 border-b border-slate-200 dark:border-spill-700 grid grid-cols-[auto_1fr_auto] gap-2 items-center"
                        >
                          <img
                            src={
                              resolveUploadUrl(user.avatar) ||
                              'assets/images/default-avatar.png'
                            }
                            alt=""
                            className="w-9 h-9 rounded-full object-cover"
                          />
                          <span className="truncate">
                            <p className="text-sm font-medium truncate">{user.fullname}</p>
                            <p className="text-xs opacity-60 truncate">@{user.username || 'unknown'}</p>
                          </span>
                          <button
                            type="button"
                            className="h-8 w-8 grid place-items-center rounded-md hover:bg-slate-100 dark:hover:bg-spill-800"
                            onClick={() => handleRemoveCandidate(user.userId)}
                          >
                            <bi.BiX />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 dark:border-spill-700 overflow-hidden">
                    <div className="px-3 py-2 text-xs font-semibold bg-slate-100 dark:bg-spill-800 text-slate-600 dark:text-spill-300">
                      {searchQuery.trim().length >= 2
                        ? isSearching
                          ? 'Searching...'
                          : `Search Results (${availableCandidates.length})`
                        : `Suggested Contacts (${availableCandidates.length})`}
                    </div>
                    <div className="max-h-52 overflow-y-auto">
                      {availableCandidates.length === 0 && (
                        <p className="px-3 py-4 text-sm text-slate-500 dark:text-spill-400">
                          {searchQuery.trim().length >= 2
                            ? 'No user found'
                            : 'No suggested contacts'}
                        </p>
                      )}
                      {availableCandidates.map((user) => (
                        <button
                          key={`candidate-${user.userId}`}
                          type="button"
                          className="w-full px-3 py-2 text-left border-b border-slate-200 dark:border-spill-700 grid grid-cols-[auto_1fr_auto] gap-2 items-center hover:bg-slate-100 dark:hover:bg-spill-800"
                          onClick={() => handleSelectCandidate(user)}
                        >
                          <img
                            src={
                              resolveUploadUrl(user.avatar) ||
                              'assets/images/default-avatar.png'
                            }
                            alt=""
                            className="w-9 h-9 rounded-full object-cover"
                          />
                          <span className="truncate">
                            <p className="text-sm font-medium truncate">{user.fullname}</p>
                            <p className="text-xs opacity-60 truncate">
                              @{user.username || 'unknown'}
                              {user.phone ? ` - ${user.phone}` : ''}
                            </p>
                          </span>
                          <span className="h-7 w-7 grid place-items-center rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-300">
                            <bi.BiPlus />
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            </form>
          )}

          <div className="px-4 sm:px-6 py-3 border-t border-slate-200 dark:border-spill-700 bg-white dark:bg-spill-900 sticky bottom-0 z-10">
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
              <button
                type="button"
                className="h-11 px-4 rounded-lg border border-slate-300 dark:border-spill-600 hover:bg-slate-100 dark:hover:bg-spill-800"
                onClick={() => {
                  closeModal();
                  resetForm();
                }}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="h-11 px-5 rounded-lg bg-gradient-to-r from-sky-600 to-cyan-600 text-white font-semibold hover:brightness-110 disabled:opacity-60"
                disabled={isSubmitting}
                onClick={handleSubmit}
              >
                {isSubmitting ? 'Creating...' : 'Create Group'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalView, document.body);
}

export default ConfirmNewGroup;
