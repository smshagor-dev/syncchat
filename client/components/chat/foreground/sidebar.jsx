import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import * as bi from 'react-icons/bi';
import * as ri from 'react-icons/ri';
import { setModal } from '../../../redux/features/modal';
import { setPage } from '../../../redux/features/page';
import resolveUploadUrl from '../../../helpers/resolveUploadUrl';

function Sidebar({ inboxes }) {
  const dispatch = useDispatch();
  const master = useSelector((state) => state.user.master);
  const page = useSelector((state) => state.page);
  const refreshAvatar = useSelector((state) => state.chore.refreshAvatar);
  const sidebarAvatar = resolveUploadUrl(
    refreshAvatar || master?.avatar || 'assets/images/default-avatar.png'
  );

  const unreadChats = (inboxes || []).reduce((sum, item) => {
    const isIncoming = item?.content?.from && item.content.from !== master?._id;
    const hasServerUnread = isIncoming && (item?.unreadMessage || 0) > 0;
    const hasManualUnread =
      Array.isArray(item?.markUnreadBy) && item.markUnreadBy.includes(master?._id);
    return sum + (hasServerUnread || hasManualUnread ? 1 : 0);
  }, 0);
  const unreadCount = unreadChats > 99 ? '99+' : unreadChats;

  const isChatListActive =
    !page.contact &&
    !page.setting &&
    !page.status &&
    !page.calls &&
    !page.archive &&
    !page.list &&
    !page.communities &&
    !page.media &&
    !page.profile &&
    !page.selectParticipant;

  const showChatListArea = () => {
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
  };

  const openPagePanel = (target) => {
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
    ].forEach((key) => {
      dispatch(setPage({ target: key, data: key === target }));
    });
  };

  const quickActionsTop = [
    {
      target: 'chats',
      icon: <bi.BiMessageSquareDetail size={22} />,
      badge: unreadChats > 0 ? unreadCount : null,
      badgeTone: 'bg-emerald-500 text-emerald-950',
      active: isChatListActive,
      onClick: showChatListArea,
    },
    {
      target: 'calls',
      icon: <bi.BiPhoneCall size={21} />,
      badge: null,
      badgeTone: 'bg-rose-500 text-rose-50',
      active: !!page.calls,
      onClick: () => openPagePanel('calls'),
    },
    {
      target: 'status',
      icon: <ri.RiDonutChartLine size={21} />,
      badge: null,
      active: !!page.status,
      onClick: () => openPagePanel('status'),
    },
    {
      target: 'contacts',
      icon: <bi.BiGroup size={22} />,
      badge: null,
      active: !!page.contact,
      onClick: () => openPagePanel('contact'),
    },
    {
      target: 'communities',
      icon: <ri.RiCommunityLine size={21} />,
      badge: null,
      active: !!page.communities,
      onClick: () => openPagePanel('communities'),
    },
    {
      target: 'archive',
      icon: <bi.BiArchiveIn size={21} />,
      badge: null,
      active: !!page.archive,
      onClick: () => openPagePanel('archive'),
    },
    {
      target: 'list',
      icon: <bi.BiListUl size={21} />,
      badge: null,
      active: !!page.list,
      onClick: () => openPagePanel('list'),
    },
  ];

  const quickActionsBottom = [
    {
      target: 'media',
      icon: <bi.BiImageAlt size={20} />,
      onClick: () => dispatch(setPage({ target: 'media', data: true })),
    },
    {
      target: 'feedback',
      icon: <bi.BiMessageDetail size={20} />,
      onClick: () => dispatch(setModal({ target: 'feedback', data: true })),
    },
  ];

  return (
    <aside className="hidden md:flex h-full w-[72px] flex-col items-center border-r border-slate-700/70 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 py-3 text-slate-300 dark:border-spill-700 dark:from-spill-900 dark:via-spill-900 dark:to-spill-950">
      <div className="flex w-full flex-col items-center gap-2">
        {quickActionsTop.map((item) => (
          <button
            key={item.target}
            type="button"
            title={item.target}
            className={`relative flex h-10 w-10 items-center justify-center rounded-xl transition ${
              item.active
                ? 'bg-sky-600/25 text-white ring-1 ring-sky-400/70'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white dark:hover:bg-spill-700'
            }`}
            onClick={(e) => {
              e.stopPropagation();
              item.onClick();
            }}
          >
            {item.icon}
            {item.badge && (
              <span
                className={`absolute -right-1 -top-1 min-w-5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${item.badgeTone}`}
              >
                {item.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="my-4 h-px w-9 bg-slate-700 dark:bg-spill-700" />

      <div className="mt-auto flex w-full flex-col items-center gap-2">
        {quickActionsBottom.map((item) => (
          <button
            key={item.target}
            type="button"
            title={item.target}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-300 transition hover:bg-slate-800 hover:text-white dark:hover:bg-spill-700"
            onClick={(e) => {
              e.stopPropagation();
              item.onClick();
            }}
          >
            {item.icon}
          </button>
        ))}
        <button
          type="button"
          title="settings"
          className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-300 transition hover:bg-slate-800 hover:text-white dark:hover:bg-spill-700"
          onClick={(e) => {
            e.stopPropagation();
            dispatch(setPage({ target: 'setting' }));
          }}
        >
          <bi.BiCog size={20} />
        </button>
        <div className="my-2 h-px w-9 bg-slate-700 dark:bg-spill-700" />
        <button
          type="button"
          className="overflow-hidden rounded-full border-2 border-slate-700 transition hover:border-sky-400 dark:border-spill-600"
          onClick={(e) => {
            e.stopPropagation();
            dispatch(
              setPage({
                target: 'profile',
                data: master._id,
              })
            );
          }}
        >
          <img
            src={sidebarAvatar}
            alt=""
            className="h-9 w-9 rounded-full object-cover"
          />
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
