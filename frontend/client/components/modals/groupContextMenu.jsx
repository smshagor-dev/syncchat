import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import * as bi from 'react-icons/bi';
import { setPage } from '../../redux/features/page';
import { setModal } from '../../redux/features/modal';
import socket from '../../helpers/socket';
import { isGroupAdmin } from '../../helpers/groupAdmins';

function GroupContextMenu() {
  const dispatch = useDispatch();

  const menu = useSelector((state) => state.modal.groupContextMenu);
  const master = useSelector((state) => state.user.master);
  const targetIsAdmin = isGroupAdmin(menu.group, menu.user.userId);

  const actions = [
    {
      _key: 'B-01',
      html: `View ${menu.user.fullname.split(' ')[0]}`,
      icon: <bi.BiUser />,
      className: '',
      func() {
        const data = menu.user.userId;
        dispatch(setPage({ target: 'friendProfile', data }));
      },
    },
    targetIsAdmin
      ? {
          _key: 'B-02',
          html: 'Remove from admin',
          icon: <bi.BiShieldX />,
          className: 'text-amber-700 dark:text-amber-300',
          func() {
            socket.emit('group/remove-admin', {
              participantId: menu.user.userId,
              userId: master._id,
              groupId: menu.group._id,
            });
          },
        }
      : {
          _key: 'B-02',
          html: 'Make as admin',
          icon: <bi.BiShieldAlt2 />,
          className: 'text-emerald-700 dark:text-emerald-300',
          func() {
            socket.emit('group/add-admin', {
              participantId: menu.user.userId,
              userId: master._id,
              groupId: menu.group._id,
            });
          },
        },
    {
      _key: 'B-03',
      html: `Remove ${menu.user.fullname.split(' ')[0]}`,
      icon: <bi.BiTrashAlt />,
      className: 'text-rose-700 dark:text-rose-300',
      func() {
        socket.emit('group/remove-participant', {
          participantId: menu.user.userId,
          userId: master._id,
          groupId: menu.group._id,
        });
      },
    },
  ];

  return (
    <div
      id="group-context-menu"
      className="absolute left-0 top-0 z-10 w-56 p-2 rounded-xl shadow-2xl border border-slate-200/90 bg-white/95 backdrop-blur-sm dark:bg-spill-800/95 dark:border-spill-700"
      aria-hidden
      onClick={(e) => e.stopPropagation()}
      style={{
        transform: `translate(${menu.x}px, ${menu.y}px)`,
      }}
    >
      <div className="grid">
        {actions.map((elem) => (
          <button
            key={elem._key}
            type="button"
            className={`h-10 px-3 rounded-lg overflow-hidden flex gap-3 items-center cursor-pointer text-sm hover:bg-slate-100 dark:hover:bg-spill-700 ${elem.className}`}
            onClick={() => {
              dispatch(setModal({ target: 'groupContextMenu', data: false }));

              setTimeout(() => elem.func(), 150);
            }}
          >
            <span className="opacity-90">{elem.icon}</span>
            <p className="truncate font-medium">{elem.html}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

export default GroupContextMenu;
