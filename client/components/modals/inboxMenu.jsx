import React from 'react';
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
  if (!menu?.inbox) return null;

  const { inbox } = menu;
  const isGroup = inbox.roomType === 'group';
  const friend = (inbox.owners || []).find((x) => x.userId !== master?._id);
  const { userId: friendId } = friend || {};

  const hasForMe = (value) =>
    Array.isArray(value) && value.includes(master?._id);

  const state = {
    archived: hasForMe(inbox.archivedBy),
    muted: hasForMe(inbox.mutedBy),
    pinned: hasForMe(inbox.pinnedBy),
    unread: hasForMe(inbox.markUnreadBy),
    favourite: hasForMe(inbox.favouriteBy),
    listed: hasForMe(inbox.listedBy),
    blocked:
      !isGroup &&
      !!friendId &&
      Array.isArray(setting?.blockedUserIds) &&
      setting.blockedUserIds.includes(friendId),
    chatLocked:
      !isGroup &&
      hasForMe(inbox.chatLockBy),
  };

  const closeMenu = () =>
    dispatch(setModal({ target: 'inboxMenu', data: false }));

  const refreshInbox = () => dispatch(setRefreshInbox(uuidv4()));

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
      icon: state.pinned ? <bi.BiPin /> : <bi.BiPin />,
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
      label: state.chatLocked ? 'Remove lock' : 'Lock chat',
      icon: <bi.BiLockAlt />,
      hidden: isGroup,
      onClick: () => {
        if (state.chatLocked) {
          preferenceAction('chatUnlock');
        } else {
          dispatch(
            setModal({
              target: 'lockChat',
              data: {
                type: 'lock',
                inbox,
              },
            })
          );
        }
      },
    },
    {
      key: 'chat-lock-password',
      label: 'Change lock password',
      icon: <bi.BiKey />,
      hidden: isGroup || !state.chatLocked,
      onClick: () =>
        dispatch(
          setModal({
            target: 'lockChat',
            data: {
              type: 'change',
              inbox,
            },
          })
        ),
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
      onClick: () => runAction(() => axios.delete(`/chats/${inbox.roomId}`)),
    },
  ].filter((item) => !item.hidden);

  return (
    <>
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
              className={`py-2 px-4 flex gap-4 items-center cursor-pointer hover:bg-spill-200 dark:hover:bg-spill-600 text-left ${
                item.danger ? 'text-rose-600 dark:text-rose-400' : ''
              }`}
              onClick={(e) => {
                e.stopPropagation();
                item.onClick();
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
    </>
  );
}

export default InboxMenu;
