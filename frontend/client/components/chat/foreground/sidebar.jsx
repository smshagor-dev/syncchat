import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import * as bi from 'react-icons/bi';
import * as ri from 'react-icons/ri';
import { setModal } from '../../../redux/features/modal';
import { setPage } from '../../../redux/features/page';
import resolveUploadUrl from '../../../helpers/resolveUploadUrl';

function Sidebar({
  inboxes,
  mobileOpen = false,
  onCloseMobile = () => {},
}) {
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
  const unreadChannels = (inboxes || []).reduce((sum, item) => {
    const isChannelRoom =
      item?.roomType === 'group' &&
      (!!item?.channel ||
        String(item?.group?.roomId || item?.roomId || '').startsWith('channel-') ||
        String(item?.group?.link || '').startsWith('/channel/+'));
    if (!isChannelRoom) return sum;

    const isIncoming = item?.content?.from && item.content.from !== master?._id;
    const hasServerUnread = isIncoming && (item?.unreadMessage || 0) > 0;
    const hasManualUnread =
      Array.isArray(item?.markUnreadBy) &&
      item.markUnreadBy.includes(master?._id);

    return sum + (hasServerUnread || hasManualUnread ? 1 : 0);
  }, 0);
  const unreadCount = unreadChats > 99 ? '99+' : unreadChats;
  const unreadChannelCount = unreadChannels > 99 ? '99+' : unreadChannels;

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

  const showChatListArea = () => {
    [
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
      'channels',
      'archive',
      'list',
      'media',
      'policy',
      'license',
      'starred',
      'profile',
      'selectParticipant',
    ].forEach((key) => {
      dispatch(setPage({ target: key, data: key === target }));
    });
  };

  const quickActionsTop = [
    {
      target: 'chats',
      label: 'Chats',
      icon: <bi.BiMessageSquareDetail size={22} />,
      badge: unreadChats > 0 ? unreadCount : null,
      badgeTone: 'bg-emerald-500 text-emerald-950',
      active: isChatListActive,
      onClick: showChatListArea,
    },
    {
      target: 'calls',
      label: 'Calls',
      icon: <bi.BiPhoneCall size={21} />,
      badge: null,
      badgeTone: 'bg-rose-500 text-rose-50',
      active: !!page.calls,
      onClick: () => openPagePanel('calls'),
    },
    {
      target: 'status',
      label: 'Status',
      icon: <ri.RiDonutChartLine size={21} />,
      badge: null,
      active: !!page.status,
      onClick: () => openPagePanel('status'),
    },
    {
      target: 'contacts',
      label: 'Contacts',
      icon: <bi.BiGroup size={22} />,
      badge: null,
      active: !!page.contact,
      onClick: () => openPagePanel('contact'),
    },
    {
      target: 'communities',
      label: 'Communities',
      icon: <ri.RiCommunityLine size={21} />,
      badge: null,
      active: !!page.communities,
      onClick: () => openPagePanel('communities'),
    },
    {
      target: 'channels',
      label: 'Channels',
      icon: <ri.RiBroadcastLine size={21} />,
      badge: unreadChannels > 0 ? unreadChannelCount : null,
      badgeTone: 'bg-sky-400 text-sky-950',
      active: !!page.channels,
      onClick: () => openPagePanel('channels'),
    },
    {
      target: 'archive',
      label: 'Archive',
      icon: <bi.BiArchiveIn size={21} />,
      badge: null,
      active: !!page.archive,
      onClick: () => openPagePanel('archive'),
    },
    {
      target: 'list',
      label: 'Lists',
      icon: <bi.BiListUl size={21} />,
      badge: null,
      active: !!page.list,
      onClick: () => openPagePanel('list'),
    },
  ];

  const quickActionsBottom = [
    {
      target: 'media',
      label: 'Media',
      icon: <bi.BiImageAlt size={20} />,
      active: !!page.media,
      onClick: () => dispatch(setPage({ target: 'media', data: true })),
    },
    {
      target: 'feedback',
      label: 'Feedback',
      icon: <bi.BiMessageDetail size={20} />,
      active: false,
      onClick: () => dispatch(setModal({ target: 'feedback', data: true })),
    },
  ];

  const runSidebarAction = (action) => {
    action();
    if (mobileOpen) onCloseMobile();
  };

  const menuButtonClass = (active = false, mobile = false) =>
    `relative flex ${mobile ? 'min-h-[52px] w-[78px]' : 'min-h-[50px] w-[72px]'} flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-center transition ${
      active
        ? 'bg-sky-600/25 text-white ring-1 ring-sky-400/70'
        : 'text-slate-300 hover:bg-slate-800 hover:text-white dark:hover:bg-spill-700'
    }`;

  const menuLabelClass =
    'block max-w-full truncate text-[10px] font-medium leading-none tracking-tight';

  return (
    <>
      <aside className="hidden md:flex h-full w-[84px] shrink-0 flex-col items-center overflow-y-auto border-r border-slate-700/70 bg-slate-900 py-2 text-slate-300 dark:border-spill-700 dark:bg-spill-900">
        <div className="flex w-full flex-col items-center gap-1.5 px-1">
          {quickActionsTop.map((item) => (
            <button
              key={item.target}
              type="button"
              title={item.label}
              aria-label={item.label}
              className={menuButtonClass(item.active)}
              onClick={(e) => {
                e.stopPropagation();
                item.onClick();
              }}
            >
              {item.icon}
              <span className={menuLabelClass}>{item.label}</span>
              {item.badge && (
                <span
                  className={`absolute right-1.5 top-1 min-w-5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${item.badgeTone}`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="my-2 h-px w-10 shrink-0 bg-slate-700 dark:bg-spill-700" />

        <div className="mt-auto flex w-full flex-col items-center gap-1.5 px-1">
          {quickActionsBottom.map((item) => (
            <button
              key={item.target}
              type="button"
              title={item.label}
              aria-label={item.label}
              className={menuButtonClass(item.active)}
              onClick={(e) => {
                e.stopPropagation();
                item.onClick();
              }}
            >
              {item.icon}
              <span className={menuLabelClass}>{item.label}</span>
            </button>
          ))}
          <button
            type="button"
            title="Settings"
            aria-label="Settings"
            className={menuButtonClass(!!page.setting)}
            onClick={(e) => {
              e.stopPropagation();
              dispatch(setPage({ target: 'setting' }));
            }}
          >
            <bi.BiCog size={20} />
            <span className={menuLabelClass}>Settings</span>
          </button>
          <div className="my-1 h-px w-10 shrink-0 bg-slate-700 dark:bg-spill-700" />
          <button
            type="button"
            title="Profile"
            aria-label="Profile"
            className={menuButtonClass(!!page.profile)}
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
            <span className="overflow-hidden rounded-full border-2 border-slate-700 transition group-hover:border-sky-400 dark:border-spill-600">
              <img
                src={sidebarAvatar}
                alt=""
                className="h-8 w-8 rounded-full object-cover"
              />
            </span>
            <span className={menuLabelClass}>Profile</span>
          </button>
        </div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-[120] md:hidden" aria-hidden>
          <div
            className="absolute inset-0 bg-black/45"
            aria-hidden
            onClick={onCloseMobile}
          />
          <aside
            data-syncchat-mobile-sidebar
            className="absolute left-0 top-0 flex h-[100dvh] max-h-[100dvh] min-h-0 w-[94px] flex-col items-center overflow-y-auto border-r border-slate-700/70 bg-slate-900 py-2 text-slate-300 dark:border-spill-700 dark:bg-spill-900"
          >
            <div className="mb-1 flex w-full justify-end px-2">
              <button
                type="button"
                aria-label="Close menu"
                className="rounded-full p-2 text-slate-300 hover:bg-slate-800 dark:hover:bg-spill-700"
                onClick={onCloseMobile}
              >
                <bi.BiX size={18} />
              </button>
            </div>
            <div className="flex w-full flex-col items-center gap-1.5 px-1">
              {quickActionsTop.map((item) => (
                <button
                  key={`mobile-${item.target}`}
                  type="button"
                  title={item.label}
                  aria-label={item.label}
                  className={menuButtonClass(item.active, true)}
                  onClick={(e) => {
                    e.stopPropagation();
                    runSidebarAction(item.onClick);
                  }}
                >
                  {item.icon}
                  <span className={menuLabelClass}>{item.label}</span>
                  {item.badge && (
                    <span
                      className={`absolute right-2 top-1 min-w-5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${item.badgeTone}`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div className="my-2 h-px w-10 shrink-0 bg-slate-700 dark:bg-spill-700" />
            <div className="mt-auto flex w-full flex-col items-center gap-1.5 px-1">
              {quickActionsBottom.map((item) => (
                <button
                  key={`mobile-${item.target}`}
                  type="button"
                  title={item.label}
                  aria-label={item.label}
                  className={menuButtonClass(item.active, true)}
                  onClick={(e) => {
                    e.stopPropagation();
                    runSidebarAction(item.onClick);
                  }}
                >
                  {item.icon}
                  <span className={menuLabelClass}>{item.label}</span>
                </button>
              ))}
              <button
                type="button"
                title="Settings"
                aria-label="Settings"
                className={menuButtonClass(!!page.setting, true)}
                onClick={(e) => {
                  e.stopPropagation();
                  runSidebarAction(() =>
                    dispatch(setPage({ target: 'setting' }))
                  );
                }}
              >
                <bi.BiCog size={20} />
                <span className={menuLabelClass}>Settings</span>
              </button>
              <div className="my-1 h-px w-10 shrink-0 bg-slate-700 dark:bg-spill-700" />
              <button
                type="button"
                title="Profile"
                aria-label="Profile"
                className={menuButtonClass(!!page.profile, true)}
                onClick={(e) => {
                  e.stopPropagation();
                  runSidebarAction(() =>
                    dispatch(
                      setPage({
                        target: 'profile',
                        data: master._id,
                      })
                    )
                  );
                }}
              >
                <span className="overflow-hidden rounded-full border-2 border-slate-700 transition dark:border-spill-600">
                  <img
                    src={sidebarAvatar}
                    alt=""
                    className="h-8 w-8 rounded-full object-cover"
                  />
                </span>
                <span className={menuLabelClass}>Profile</span>
              </button>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

export default Sidebar;
