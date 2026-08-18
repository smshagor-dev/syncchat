import React from 'react';
import { createPortal } from 'react-dom';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import * as bi from 'react-icons/bi';
import { v4 as uuidv4 } from 'uuid';
import { setModal } from '../../redux/features/modal';
import { setRefreshInbox } from '../../redux/features/chore';
import notification from '../../helpers/notification';

function InboxMenu() {
  const dispatch = useDispatch();
  const menu = useSelector((state) => state.modal.inboxMenu);
  const master = useSelector((state) => state.user.master);
  const setting = useSelector((state) => state.user.setting);
  const [lockDialog, setLockDialog] = React.useState({
    open: false,
    mode: 'create',
    scope: 'self',
    password: '',
    oldPassword: '',
    newPassword: '',
    loading: false,
    error: '',
  });
  const [deleteDialog, setDeleteDialog] = React.useState({
    open: false,
    scope: 'self',
    loading: false,
    error: '',
  });

  if (!menu?.inbox) return null;

  const { inbox } = menu;
  const isGroup = inbox.roomType === 'group';
  const friend = (inbox.owners || []).find((x) => x.userId !== master?._id);
  const { userId: friendId } = friend || {};

  const hasForMe = (value) =>
    Array.isArray(value) && value.includes(master?._id);

  const sharedLock =
    !isGroup && inbox.chatLockScope === 'both' && hasForMe(inbox.chatLockBy);
  const sharedLockOwner = sharedLock && inbox.chatLockOwnerId === master?._id;
  const selfLock = !isGroup && !sharedLock && hasForMe(inbox.chatLockBy);

  const state = {
    archived: hasForMe(inbox.archivedBy),
    muted: hasForMe(inbox.mutedBy),
    pinned: hasForMe(inbox.pinnedBy),
    unread: hasForMe(inbox.markUnreadBy),
    favourite: hasForMe(inbox.favouriteBy),
    listed: hasForMe(inbox.listedBy),
    hidden: hasForMe(inbox.hiddenBy),
    blocked:
      !isGroup &&
      !!friendId &&
      Array.isArray(setting?.blockedUserIds) &&
      setting.blockedUserIds.includes(friendId),
    chatLocked: selfLock || sharedLock,
  };

  const closeMenu = () =>
    dispatch(setModal({ target: 'inboxMenu', data: false }));

  const refreshInbox = () => dispatch(setRefreshInbox(uuidv4()));
  const emitLocalInboxDelete = (roomId) => {
    window.dispatchEvent(
      new CustomEvent('syncchat:inbox-delete', {
        detail: { roomId },
      })
    );
  };
  const emitLocalInboxVisibility = (roomId, hidden) => {
    window.dispatchEvent(
      new CustomEvent(hidden ? 'syncchat:inbox-hide' : 'syncchat:inbox-unhide', {
        detail: { roomId },
      })
    );
  };

  const runAction = async (handler) => {
    try {
      await handler();
      closeMenu();
      refreshInbox();
    } catch (error0) {
      // eslint-disable-next-line no-console
      console.error(error0?.response?.data?.message || error0.message);
      notification({
        title: 'Action failed',
        body: error0?.response?.data?.message || error0.message,
      });
      closeMenu();
    }
  };

  const preferenceAction = (action, value = null) =>
    runAction(() =>
      axios.patch(`/inboxes/${inbox.roomId}/preferences`, {
        action,
        value,
      })
    );

  const openLockDialog = (mode) => {
    setLockDialog({
      open: true,
      mode,
      scope: mode === 'create' ? 'self' : sharedLock ? 'both' : 'self',
      password: '',
      oldPassword: '',
      newPassword: '',
      loading: false,
      error: '',
    });
  };

  const submitLockDialog = async () => {
    try {
      setLockDialog((prev) => ({ ...prev, loading: true, error: '' }));

      if (lockDialog.mode === 'create') {
        if (String(lockDialog.password || '').length < 4) {
          throw new Error('Password must be at least 4 characters');
        }
        await axios.post(`/inboxes/${inbox.roomId}/chat-lock`, {
          scope: lockDialog.scope,
          password: lockDialog.password,
        });
      } else if (lockDialog.mode === 'change') {
        if (String(lockDialog.newPassword || '').length < 4) {
          throw new Error('New password must be at least 4 characters');
        }
        await axios.patch(`/inboxes/${inbox.roomId}/chat-lock`, {
          oldPassword: lockDialog.oldPassword,
          newPassword: lockDialog.newPassword,
        });
      } else if (lockDialog.mode === 'remove') {
        await axios.delete(`/inboxes/${inbox.roomId}/chat-lock`);
      }

      setLockDialog((prev) => ({ ...prev, open: false, loading: false }));
      closeMenu();
      refreshInbox();
      notification({
        title: 'Chat lock updated',
        body:
          lockDialog.mode === 'create' && lockDialog.scope === 'both'
            ? 'The same password now locks this chat for both participants.'
            : lockDialog.mode === 'remove'
              ? 'Chat lock removed.'
              : lockDialog.mode === 'change'
                ? 'Lock password changed.'
                : 'Chat lock enabled.',
      });
    } catch (error0) {
      setLockDialog((prev) => ({
        ...prev,
        loading: false,
        error: error0?.response?.data?.message || error0.message,
      }));
    }
  };

  const submitDeleteDialog = async () => {
    try {
      setDeleteDialog((prev) => ({ ...prev, loading: true, error: '' }));
      await axios.delete(`/chats/${inbox.roomId}`, {
        data: { scope: deleteDialog.scope },
      });
      emitLocalInboxDelete(inbox.roomId);
      setDeleteDialog((prev) => ({ ...prev, open: false, loading: false }));
      closeMenu();
      refreshInbox();
    } catch (error0) {
      setDeleteDialog((prev) => ({
        ...prev,
        loading: false,
        error: error0?.response?.data?.message || error0.message,
      }));
    }
  };

  const options = [
    {
      key: 'archive',
      label: state.archived ? 'Unarchive chat' : 'Archive chat',
      icon: state.archived ? <bi.BiArchiveOut /> : <bi.BiArchiveIn />,
      onClick: () => preferenceAction('archive', !state.archived),
    },
    {
      key: 'mute',
      label: state.muted ? 'Unmute notification' : 'Mute notification',
      icon: state.muted ? <bi.BiBell /> : <bi.BiBellOff />,
      onClick: () => preferenceAction('mute', !state.muted),
    },
    {
      key: 'pin',
      label: state.pinned ? 'Unpin chat' : 'Pin chat',
      icon: <bi.BiPin />,
      onClick: () => preferenceAction('pin', !state.pinned),
    },
    {
      key: 'unread',
      label: state.unread ? 'Mark as read' : 'Mark as unread',
      icon: <bi.BiMessageAltCheck />,
      onClick: () => preferenceAction('markUnread', !state.unread),
    },
    {
      key: 'favourite',
      label: state.favourite ? 'Remove from favourite' : 'Add to favourite',
      icon: <bi.BiStar />,
      onClick: () => preferenceAction('favourite', !state.favourite),
    },
    {
      key: 'list',
      label: state.listed ? 'Remove from list' : 'Add to list',
      icon: <bi.BiListUl />,
      onClick: () => preferenceAction('list', !state.listed),
    },
    {
      key: 'hide',
      label: state.hidden ? 'Unhide chat' : 'Hide chat',
      icon: state.hidden ? <bi.BiShow /> : <bi.BiHide />,
      onClick: () =>
        runAction(async () => {
          await axios.patch(`/inboxes/${inbox.roomId}/preferences`, {
            action: 'hide',
            value: !state.hidden,
          });
          emitLocalInboxVisibility(inbox.roomId, !state.hidden);
        }),
    },
    {
      key: 'block',
      label: state.blocked ? 'Unblock' : 'Block',
      icon: <bi.BiBlock />,
      hidden: isGroup || !friendId,
      danger: true,
      onClick: () =>
        runAction(() =>
          axios.put(
            `/contacts/${friendId}/${state.blocked ? 'unblock' : 'block'}`
          )
        ),
    },
    {
      key: 'chat-lock',
      label: !state.chatLocked
        ? 'Lock chat'
        : sharedLock
          ? sharedLockOwner
            ? 'Remove shared lock'
            : 'Shared lock active'
          : 'Remove lock',
      icon: <bi.BiLockAlt />,
      hidden: isGroup,
      disabled: sharedLock && !sharedLockOwner,
      onClick: () => {
        if (!state.chatLocked) {
          openLockDialog('create');
        } else if (sharedLock && sharedLockOwner) {
          openLockDialog('remove');
        } else if (selfLock) {
          openLockDialog('remove');
        }
      },
    },
    {
      key: 'chat-lock-password',
      label: sharedLock ? 'Change shared lock password' : 'Change lock password',
      icon: <bi.BiKey />,
      hidden:
        isGroup ||
        !state.chatLocked ||
        (sharedLock && !sharedLockOwner),
      onClick: () => openLockDialog('change'),
    },
    {
      key: 'clear',
      label: 'Clear chat',
      icon: <bi.BiEraser />,
      danger: true,
      onClick: () =>
        runAction(() => axios.post(`/inboxes/${inbox.roomId}/clear`)),
    },
    {
      key: 'delete',
      label: 'Delete chat',
      icon: <bi.BiTrashAlt />,
      danger: true,
      onClick: () =>
        setDeleteDialog({
          open: true,
          scope: 'self',
          loading: false,
          error: '',
        }),
    },
  ].filter((item) => !item.hidden);

  const dialogShell = (children) =>
    createPortal(
      <div
        className="fixed inset-0 z-[900] grid place-items-center bg-slate-950/60 p-4 backdrop-blur-[2px]"
        aria-hidden
        onClick={() => {
          if (!lockDialog.loading && !deleteDialog.loading) closeMenu();
        }}
      >
        <div
          className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-spill-700 dark:bg-spill-900"
          aria-hidden
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>,
      document.body
    );

  const lockDialogView = lockDialog.open
    ? dialogShell(
        <>
          <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-spill-700">
            <div>
              <h2 className="text-lg font-bold">
                {lockDialog.mode === 'create'
                  ? 'Lock this chat'
                  : lockDialog.mode === 'change'
                    ? 'Change lock password'
                    : 'Remove chat lock'}
              </h2>
              <p className="mt-1 text-xs opacity-65">
                {lockDialog.mode === 'create'
                  ? 'Choose whether the password protects only your view or both participants.'
                  : sharedLock
                    ? 'Only the person who created the shared lock can change or remove it.'
                    : 'This lock only applies to your account.'}
              </p>
            </div>
            <button
              type="button"
              className="rounded-full p-2 hover:bg-slate-100 dark:hover:bg-spill-800"
              onClick={closeMenu}
              disabled={lockDialog.loading}
            >
              <bi.BiX size={20} />
            </button>
          </div>

          <div className="grid gap-4 px-5 py-5">
            {lockDialog.mode === 'create' && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className={`rounded-xl border p-3 text-left ${
                    lockDialog.scope === 'self'
                      ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/30'
                      : 'border-slate-200 dark:border-spill-700'
                  }`}
                  onClick={() =>
                    setLockDialog((prev) => ({ ...prev, scope: 'self' }))
                  }
                >
                  <div className="flex items-center gap-2 font-semibold">
                    <bi.BiUser /> Only me
                  </div>
                  <p className="mt-1 text-xs opacity-60">Your password, your chat list only.</p>
                </button>
                <button
                  type="button"
                  className={`rounded-xl border p-3 text-left ${
                    lockDialog.scope === 'both'
                      ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/30'
                      : 'border-slate-200 dark:border-spill-700'
                  }`}
                  onClick={() =>
                    setLockDialog((prev) => ({ ...prev, scope: 'both' }))
                  }
                >
                  <div className="flex items-center gap-2 font-semibold">
                    <bi.BiGroup /> Both
                  </div>
                  <p className="mt-1 text-xs opacity-60">One shared password for both users.</p>
                </button>
              </div>
            )}

            {lockDialog.mode === 'create' && (
              <label className="grid gap-1">
                <span className="text-xs font-semibold opacity-70">Password</span>
                <input
                  type="password"
                  autoFocus
                  minLength={4}
                  value={lockDialog.password}
                  className="h-11 rounded-xl border border-slate-300 bg-transparent px-3 outline-none focus:ring-2 focus:ring-sky-500/30 dark:border-spill-600"
                  onChange={(e) =>
                    setLockDialog((prev) => ({ ...prev, password: e.target.value }))
                  }
                />
              </label>
            )}

            {lockDialog.mode === 'change' && (
              <>
                <label className="grid gap-1">
                  <span className="text-xs font-semibold opacity-70">Current password</span>
                  <input
                    type="password"
                    autoFocus
                    value={lockDialog.oldPassword}
                    className="h-11 rounded-xl border border-slate-300 bg-transparent px-3 outline-none focus:ring-2 focus:ring-sky-500/30 dark:border-spill-600"
                    onChange={(e) =>
                      setLockDialog((prev) => ({ ...prev, oldPassword: e.target.value }))
                    }
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs font-semibold opacity-70">New password</span>
                  <input
                    type="password"
                    minLength={4}
                    value={lockDialog.newPassword}
                    className="h-11 rounded-xl border border-slate-300 bg-transparent px-3 outline-none focus:ring-2 focus:ring-sky-500/30 dark:border-spill-600"
                    onChange={(e) =>
                      setLockDialog((prev) => ({ ...prev, newPassword: e.target.value }))
                    }
                  />
                </label>
              </>
            )}

            {lockDialog.mode === 'remove' && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                {sharedLock
                  ? 'This will remove the shared password for both participants. Only the shared-lock owner can do this.'
                  : 'This will remove the password from your copy of this chat.'}
              </div>
            )}

            {lockDialog.error && (
              <p className="text-sm text-rose-600 dark:text-rose-400">{lockDialog.error}</p>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-spill-700">
            <button
              type="button"
              className="rounded-xl px-4 py-2 text-sm font-semibold hover:bg-slate-100 dark:hover:bg-spill-800"
              onClick={closeMenu}
              disabled={lockDialog.loading}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${
                lockDialog.mode === 'remove' ? 'bg-rose-600' : 'bg-sky-600'
              }`}
              onClick={submitLockDialog}
              disabled={lockDialog.loading}
            >
              {lockDialog.loading
                ? 'Saving...'
                : lockDialog.mode === 'remove'
                  ? 'Remove lock'
                  : lockDialog.mode === 'change'
                    ? 'Change password'
                    : 'Enable lock'}
            </button>
          </div>
        </>
      )
    : null;

  const deleteDialogView = deleteDialog.open
    ? dialogShell(
        <>
          <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-spill-700">
            <div>
              <h2 className="text-lg font-bold">Delete chat</h2>
              <p className="mt-1 text-xs opacity-65">
                Choose exactly where this conversation should be removed.
              </p>
            </div>
            <button
              type="button"
              className="rounded-full p-2 hover:bg-slate-100 dark:hover:bg-spill-800"
              onClick={closeMenu}
              disabled={deleteDialog.loading}
            >
              <bi.BiX size={20} />
            </button>
          </div>

          <div className="grid gap-2 px-5 py-5">
            <button
              type="button"
              className={`rounded-xl border p-4 text-left ${
                deleteDialog.scope === 'self'
                  ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/30'
                  : 'border-slate-200 dark:border-spill-700'
              }`}
              onClick={() =>
                setDeleteDialog((prev) => ({ ...prev, scope: 'self' }))
              }
            >
              <div className="flex items-center gap-2 font-semibold">
                <bi.BiUser /> Delete for me
              </div>
              <p className="mt-1 text-xs opacity-60">
                The other participant keeps their copy of the conversation.
              </p>
            </button>

            {!isGroup && (
              <button
                type="button"
                className={`rounded-xl border p-4 text-left ${
                  deleteDialog.scope === 'both'
                    ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/30'
                    : 'border-slate-200 dark:border-spill-700'
                }`}
                onClick={() =>
                  setDeleteDialog((prev) => ({ ...prev, scope: 'both' }))
                }
              >
                <div className="flex items-center gap-2 font-semibold text-rose-600 dark:text-rose-400">
                  <bi.BiGroup /> Delete for both
                </div>
                <p className="mt-1 text-xs opacity-60">
                  Permanently remove this conversation for you and {friend?.fullname || 'the other participant'}.
                </p>
              </button>
            )}

            {deleteDialog.error && (
              <p className="pt-2 text-sm text-rose-600 dark:text-rose-400">{deleteDialog.error}</p>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-spill-700">
            <button
              type="button"
              className="rounded-xl px-4 py-2 text-sm font-semibold hover:bg-slate-100 dark:hover:bg-spill-800"
              onClick={closeMenu}
              disabled={deleteDialog.loading}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              onClick={submitDeleteDialog}
              disabled={deleteDialog.loading}
            >
              {deleteDialog.loading
                ? 'Deleting...'
                : deleteDialog.scope === 'both'
                  ? 'Delete for both'
                  : 'Delete for me'}
            </button>
          </div>
        </>
      )
    : null;

  return (
    <>
      {!lockDialog.open && !deleteDialog.open && (
        <div
          id="inbox-context-menu"
          className="fixed left-0 top-0 z-[460] w-56 py-2 rounded-md shadow-2xl bg-white dark:bg-spill-700"
          aria-hidden
          onClick={(e) => e.stopPropagation()}
          style={{
            transform: `translate(${menu.x}px, ${menu.y}px)`,
            width: menu.width ? `${menu.width}px` : undefined,
          }}
        >
          <div className="grid">
            {options.map((item) => (
              <button
                key={item.key}
                type="button"
                disabled={item.disabled}
                className={`py-2 px-4 flex gap-4 items-center cursor-pointer hover:bg-spill-200 dark:hover:bg-spill-600 text-left disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent ${
                  item.danger ? 'text-rose-600 dark:text-rose-400' : ''
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!item.disabled) item.onClick();
                }}
              >
                <i
                  className={`opacity-80 ${
                    item.key === 'favourite' && state.favourite
                      ? 'text-amber-500'
                      : ''
                  }`}
                >
                  {item.icon}
                </i>
                <p className="text-sm">{item.label}</p>
              </button>
            ))}
          </div>
        </div>
      )}
      {lockDialogView}
      {deleteDialogView}
    </>
  );
}

export default InboxMenu;
