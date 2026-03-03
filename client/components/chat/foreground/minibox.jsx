import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import * as bi from 'react-icons/bi';
import { v4 as uuidv4 } from 'uuid';
import {
  setRefreshInbox,
  setSelectedChats,
} from '../../../redux/features/chore';
import { setPage } from '../../../redux/features/page';
import { setModal } from '../../../redux/features/modal';
import { setChatRoom } from '../../../redux/features/room';

function Minibox() {
  const dispatch = useDispatch();
  const { modal, room } = useSelector((state) => state);

  return (
    <div
      aria-hidden
      className={`
        ${modal.minibox ? 'opacity-100 z-20' : 'opacity-0 -z-50 scale-50'}
        transition duration-75 absolute right-0 w-56 translate-y-12 -translate-x-6 shadow-xl rounded-md
        bg-white dark:bg-spill-800 dark:text-white/90
      `}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="py-2 grid">
        {[
          {
            target: 'new-group',
            html: 'New group',
            icon: <bi.BiGroup />,
            action: () => dispatch(setModal({ target: 'newGroup' })),
          },
          {
            target: 'starred',
            html: 'Starred messages',
            icon: <bi.BiStar />,
            action: () => console.info('Starred messages: coming soon'),
          },
          {
            target: 'select-chats',
            html: 'Select chats',
            icon: <bi.BiCheckSquare />,
            action: () => {
              if (room.chat?.data) {
                dispatch(setSelectedChats([]));
              } else {
                console.info('Open a chat room to select chats');
              }
            },
          },
          {
            target: 'mark-read',
            html: 'Mark all as read',
            icon: <bi.BiDetail />,
            action: () => dispatch(setRefreshInbox(uuidv4())),
          },
          {
            target: 'media',
            html: 'Media',
            icon: <bi.BiImageAlt />,
            action: () => dispatch(setPage({ target: 'media', data: true })),
          },
          {
            target: 'feedback',
            html: 'Send feedback',
            icon: <bi.BiMessageDetail />,
            action: () =>
              dispatch(setModal({ target: 'feedback', data: true })),
          },
          {
            target: 'app-lock',
            html: 'App lock',
            icon: <bi.BiLockAlt />,
            dividerBefore: true,
            action: () => {
              dispatch(
                setChatRoom({
                  isOpen: false,
                  refreshId: null,
                  data: null,
                })
              );
              dispatch(setPage({ target: 'setting', data: true }));
            },
          },
          {
            target: 'logout',
            html: 'Log out',
            icon: <bi.BiLogOut />,
            action: () => dispatch(setModal({ target: 'signout' })),
          },
        ].map((elem) => (
          <React.Fragment key={elem.target}>
            {elem.dividerBefore && (
              <div className="my-1 h-px bg-slate-200 dark:bg-spill-700" />
            )}
            <button
              type="button"
              className="py-2 px-4 flex gap-4 items-center hover:bg-spill-100 dark:hover:bg-spill-700"
              onClick={() => {
                dispatch(setModal({ target: 'minibox' }));
                elem.action();
              }}
            >
              <i className="opacity-80">{elem.icon}</i>
              <p>{elem.html}</p>
            </button>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

export default Minibox;
