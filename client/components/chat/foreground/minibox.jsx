import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import * as bi from 'react-icons/bi';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import {
  setRefreshInbox,
  setSelectedInboxes,
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
            action: () => {
              dispatch(setPage({ target: 'selectParticipant', data: false }));
              dispatch(setModal({ target: 'newGroup', data: true }));
            },
          },
          {
            target: 'starred',
            html: 'Starred messages',
            icon: <bi.BiStar />,
            action: () => {
              [
                'contact',
                'setting',
                'status',
                'calls',
                'communities',
                'archive',
                'list',
                'media',
                'profile',
                'selectParticipant',
              ].forEach((target) => {
                dispatch(setPage({ target, data: false }));
              });
              dispatch(setPage({ target: 'starred', data: true }));
            },
          },
          {
            target: 'select-chats',
            html: 'Select chats',
            icon: <bi.BiCheckSquare />,
            action: () => {
              dispatch(setSelectedChats(null));
              dispatch(setSelectedInboxes([]));
            },
          },
          {
            target: 'mark-read',
            html: 'Mark all as read',
            icon: <bi.BiDetail />,
            action: async () => {
              await axios.post('/inboxes/read-all');
              dispatch(setRefreshInbox(uuidv4()));
            },
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
            action: () => dispatch(setModal({ target: 'signout', data: true })),
          },
        ].map((elem) => (
          <React.Fragment key={elem.target}>
            {elem.dividerBefore && (
              <div className="my-1 h-px bg-slate-200 dark:bg-spill-700" />
            )}
            <button
              type="button"
              className="py-2 px-4 flex gap-4 items-center hover:bg-spill-100 dark:hover:bg-spill-700"
              onClick={(e) => {
                e.stopPropagation();
                if (elem.target === 'new-group') {
                  Promise.resolve(elem.action()).catch((error0) =>
                    // eslint-disable-next-line no-console
                    console.error(error0?.response?.data?.message || error0.message)
                  );
                  return;
                }
                dispatch(setModal({ target: 'minibox', data: false }));
                Promise.resolve(elem.action()).catch((error0) =>
                  // eslint-disable-next-line no-console
                  console.error(error0?.response?.data?.message || error0.message)
                );
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
