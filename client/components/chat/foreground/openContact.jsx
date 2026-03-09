import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import * as bi from 'react-icons/bi';
import { setPage } from '../../../redux/features/page';
import { setModal } from '../../../redux/features/modal';

function OpenContact() {
  const dispatch = useDispatch();
  const page = useSelector((state) => state.page);
  const modal = useSelector((state) => state.modal);
  const roomOpen = useSelector((state) => state.room?.chat?.isOpen);
  const [menuOpen, setMenuOpen] = useState(false);
  const actionRef = useRef(null);

  const somePageIsOpened = Object.entries(page)
    .filter(
      (e) =>
        ![
          'friendProfile',
          'groupProfile',
          'channelProfile',
          'groupParticipant',
          'addParticipant',
        ].includes(e[0])
    )
    .some((elem) => !!elem[1]);

  useEffect(() => {
    if (!menuOpen) return undefined;

    const handleOutside = (event) => {
      if (!actionRef.current?.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', handleOutside);
    return () => {
      document.removeEventListener('pointerdown', handleOutside);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (roomOpen) setMenuOpen(false);
  }, [roomOpen]);

  const actions = [
    {
      key: 'create-chat',
      label: 'Create chat',
      icon: bi.BiMessageSquareAdd,
      onClick: () => dispatch(setPage({ target: 'contact' })),
    },
    {
      key: 'create-channel',
      label: 'Create channel',
      icon: bi.BiBroadcast,
      onClick: () => dispatch(setPage({ target: 'channels', data: true })),
    },
    {
      key: 'create-group',
      label: 'Create group',
      icon: bi.BiGroup,
      onClick: () => dispatch(setModal({ target: 'newGroup', data: true })),
    },
  ];
  const someModalIsOpened = Object.values(modal || {}).some((value) => !!value);
  const hideOnMobile = somePageIsOpened || roomOpen;
  const hideOnDesktop = somePageIsOpened || someModalIsOpened;

  useEffect(() => {
    if (hideOnMobile || hideOnDesktop) {
      setMenuOpen(false);
    }
  }, [hideOnMobile, hideOnDesktop]);

  return (
    <div
      ref={actionRef}
      className={`
        ${
          hideOnMobile &&
          'scale-0 opacity-0 pointer-events-none md:scale-100 md:opacity-100 md:pointer-events-auto'
        }
        ${hideOnDesktop && 'md:scale-0 md:opacity-0 md:pointer-events-none'}
        transition z-[115] right-6 bottom-[calc(6rem+env(safe-area-inset-bottom))] md:right-8 md:bottom-8 flex flex-col items-end fixed md:absolute
      `}
    >
      {menuOpen && (
        <div className="absolute bottom-full right-0 mb-3 w-44 origin-bottom-right rounded-2xl border border-slate-200 bg-white/98 p-1.5 shadow-[0_16px_36px_-14px_rgba(15,23,42,0.45)] backdrop-blur-sm animate-[fadein_.16s_ease-out] dark:border-spill-700 dark:bg-spill-900/95 dark:shadow-[0_16px_36px_-14px_rgba(2,6,23,0.72)]">
          {actions.map((item) => (
            <button
              key={item.key}
              type="button"
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:text-spill-100 dark:hover:bg-spill-800"
              onClick={() => {
                item.onClick();
                setMenuOpen(false);
              }}
            >
              <item.icon size={17} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        className="h-14 w-14 rounded-2xl bg-sky-600 text-white shadow-[0_14px_34px_-12px_rgba(2,132,199,0.9)] transition hover:bg-sky-500 dark:bg-sky-500 dark:hover:bg-sky-400"
        onClick={() => setMenuOpen((prev) => !prev)}
      >
        <span className="grid place-items-center">
          <bi.BiMessageSquareAdd size={24} />
        </span>
      </button>
    </div>
  );
}

export default OpenContact;
