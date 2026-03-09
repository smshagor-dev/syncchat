import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import * as bi from 'react-icons/bi';
import { setPage } from '../../../redux/features/page';

function MobileNav() {
  const dispatch = useDispatch();
  const page = useSelector((state) => state.page);

  const isChatListActive =
    !page.contact &&
    !page.setting &&
    !page.status &&
    !page.calls &&
    !page.archive &&
    !page.list &&
    !page.communities &&
    !page.channels &&
    !page.media &&
    !page.policy &&
    !page.license &&
    !page.starred &&
    !page.profile &&
    !page.selectParticipant;

  const toggleTargets = [
    'contact',
    'setting',
    'status',
    'calls',
    'communities',
    'channels',
    'archive',
    'list',
    'media',
    'policy',
    'license',
    'starred',
    'profile',
    'selectParticipant',
  ];

  const showChatListArea = () => {
    toggleTargets.forEach((target) => {
      dispatch(setPage({ target, data: false }));
    });
  };

  const openPagePanel = (target) => {
    toggleTargets.forEach((key) => {
      dispatch(setPage({ target: key, data: key === target }));
    });
  };

  const items = [
    {
      key: 'chats',
      label: 'Chats',
      icon: bi.BiMessageSquareDetail,
      active: isChatListActive,
      onClick: showChatListArea,
    },
    {
      key: 'status',
      label: 'Status',
      icon: bi.BiPulse,
      active: !!page.status,
      onClick: () => openPagePanel('status'),
    },
    {
      key: 'groups',
      label: 'Communities',
      icon: bi.BiGroup,
      active: !!page.communities,
      onClick: () => openPagePanel('communities'),
    },
    {
      key: 'channels',
      label: 'Channels',
      icon: bi.BiBroadcast,
      active: !!page.channels,
      onClick: () => openPagePanel('channels'),
    },
    {
      key: 'calls',
      label: 'Calls',
      icon: bi.BiPhoneCall,
      active: !!page.calls,
      onClick: () => openPagePanel('calls'),
    },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-[110] bg-white/95 px-3 pb-[calc(0.55rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl md:hidden dark:bg-spill-900/95">
      <div className="grid grid-cols-5 gap-1.5 rounded-2xl border border-slate-200/80 bg-white/95 p-1.5 shadow-[0_14px_36px_-16px_rgba(15,23,42,0.45)] backdrop-blur-xl dark:border-spill-700/80 dark:bg-spill-900/95 dark:shadow-[0_14px_36px_-16px_rgba(2,6,23,0.7)]">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`group relative flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[11px] font-semibold transition ${
              item.active
                ? 'bg-gradient-to-b from-sky-500/20 to-sky-600/10 text-sky-700 dark:from-sky-500/25 dark:to-sky-500/10 dark:text-sky-300'
                : 'text-slate-500 hover:bg-slate-100 dark:text-spill-300 dark:hover:bg-spill-800/80'
            }`}
            onClick={item.onClick}
          >
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full transition ${
                item.active
                  ? 'bg-sky-500 text-white shadow-[0_8px_20px_-8px_rgba(14,165,233,0.9)]'
                  : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200 dark:bg-spill-800 dark:text-spill-300 dark:group-hover:bg-spill-700'
              }`}
            >
              <item.icon size={16} />
            </span>
            <span>{item.label}</span>
            {item.active && (
              <span className="absolute -top-1 h-1.5 w-8 rounded-full bg-sky-500/90 dark:bg-sky-400/90" />
            )}
          </button>
        ))}
      </div>
    </nav>
  );
}

export default MobileNav;
