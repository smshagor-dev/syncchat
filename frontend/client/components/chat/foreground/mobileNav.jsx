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
      label: 'Community',
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
    <nav
      data-syncchat-mobile-nav
      aria-label="Primary mobile navigation"
      className="fixed inset-x-0 bottom-0 z-[110] md:hidden"
    >
      <div className="grid grid-cols-5 border-t border-slate-200 bg-white/98 px-1 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1 shadow-[0_-8px_24px_-20px_rgba(15,23,42,0.5)] backdrop-blur-xl dark:border-spill-700 dark:bg-spill-900/98">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-current={item.active ? 'page' : undefined}
            className={`group relative flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 py-1.5 text-[10px] font-semibold transition-colors ${
              item.active
                ? 'text-sky-600 dark:text-sky-400'
                : 'text-slate-500 active:bg-slate-100 dark:text-spill-300 dark:active:bg-spill-800'
            }`}
            onClick={item.onClick}
          >
            <span
              className={`grid h-8 min-w-11 place-items-center rounded-full px-2 transition-colors ${
                item.active
                  ? 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300'
                  : 'text-slate-500 group-active:bg-slate-100 dark:text-spill-300 dark:group-active:bg-spill-800'
              }`}
            >
              <item.icon size={19} />
            </span>
            <span className="max-w-full truncate leading-4">{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

export default MobileNav;
