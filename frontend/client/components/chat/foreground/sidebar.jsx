import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import * as bi from 'react-icons/bi';
import * as ri from 'react-icons/ri';
import { setModal } from '../../../redux/features/modal';
import { setPage } from '../../../redux/features/page';
import resolveUploadUrl from '../../../helpers/resolveUploadUrl';
import config from '../../../config';

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
      Array.isArray(item?.markUnreadBy) && item.markUnreadBy.includes(master?._id);

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

  const pageTargets = [
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
    pageTargets.forEach((target) => {
      dispatch(setPage({ target, data: false }));
    });
  };

  const openPagePanel = (target, data = true) => {
    pageTargets.forEach((key) => {
      dispatch(setPage({ target: key, data: key === target ? data : false }));
    });
  };

  const chatsAction = {
    target: 'chats',
    label: 'Chats',
    icon: <bi.BiMessageSquareDetail size={20} />,
    badge: unreadChats > 0 ? unreadCount : null,
    active: isChatListActive,
    onClick: showChatListArea,
  };
  const callsAction = {
    target: 'calls',
    label: 'Calls',
    icon: <bi.BiPhoneCall size={20} />,
    active: !!page.calls,
    onClick: () => openPagePanel('calls'),
  };
  const statusAction = {
    target: 'status',
    label: 'Status',
    icon: <ri.RiDonutChartLine size={20} />,
    active: !!page.status,
    onClick: () => openPagePanel('status'),
  };
  const contactsAction = {
    target: 'contacts',
    label: 'Contacts',
    icon: <bi.BiGroup size={20} />,
    active: !!page.contact,
    onClick: () => openPagePanel('contact'),
  };
  const communitiesAction = {
    target: 'communities',
    label: 'Communities',
    icon: <ri.RiCommunityLine size={20} />,
    active: !!page.communities,
    onClick: () => openPagePanel('communities'),
  };
  const channelsAction = {
    target: 'channels',
    label: 'Channels',
    icon: <ri.RiBroadcastLine size={20} />,
    badge: unreadChannels > 0 ? unreadChannelCount : null,
    active: !!page.channels,
    onClick: () => openPagePanel('channels'),
  };
  const archiveAction = {
    target: 'archive',
    label: 'Archive',
    icon: <bi.BiArchiveIn size={20} />,
    active: !!page.archive,
    onClick: () => openPagePanel('archive'),
  };
  const listsAction = {
    target: 'list',
    label: 'Lists',
    icon: <bi.BiListUl size={20} />,
    active: !!page.list,
    onClick: () => openPagePanel('list'),
  };
  const mediaAction = {
    target: 'media',
    label: 'Media',
    icon: <bi.BiImageAlt size={20} />,
    active: !!page.media,
    onClick: () => openPagePanel('media'),
  };
  const feedbackAction = {
    target: 'feedback',
    label: 'Feedback',
    icon: <bi.BiMessageDetail size={20} />,
    active: false,
    onClick: () => dispatch(setModal({ target: 'feedback', data: true })),
  };
  const savedMessagesAction = {
    target: 'starred',
    label: 'Saved Messages',
    icon: <bi.BiBookmark size={20} />,
    active: !!page.starred,
    onClick: () => openPagePanel('starred'),
  };
  const settingsAction = {
    target: 'setting',
    label: 'Settings',
    icon: <bi.BiCog size={20} />,
    active: !!page.setting,
    onClick: () => openPagePanel('setting'),
  };

  // Desktop follows the approved reference order. Less-frequent existing tools
  // remain available under More so no functionality is removed.
  const desktopPrimaryActions = [
    chatsAction,
    statusAction,
    communitiesAction,
    channelsAction,
    callsAction,
    contactsAction,
    savedMessagesAction,
    settingsAction,
  ];
  const desktopMoreActions = [
    archiveAction,
    listsAction,
    mediaAction,
    feedbackAction,
  ];

  // Keep the established mobile drawer feature set/order untouched.
  const quickActionsTop = [
    chatsAction,
    callsAction,
    statusAction,
    contactsAction,
    communitiesAction,
    channelsAction,
    archiveAction,
    listsAction,
  ];
  const quickActionsBottom = [mediaAction, feedbackAction];

  const runSidebarAction = (action) => {
    action();
    if (mobileOpen) onCloseMobile();
  };

  const desktopButtonClass = (active = false) =>
    `syncchat-desktop-nav-button relative flex min-h-[38px] w-full items-center gap-3 rounded-lg px-3 text-left text-[13px] font-medium transition ${
      active
        ? 'bg-violet-600 text-white shadow-sm'
        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-spill-300 dark:hover:bg-spill-800 dark:hover:text-white'
    }`;

  const mobileButtonClass = (active = false) =>
    `relative flex min-h-[52px] w-[78px] flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-center transition ${
      active
        ? 'bg-sky-600/25 text-white ring-1 ring-sky-400/70'
        : 'text-slate-300 hover:bg-slate-800 hover:text-white dark:hover:bg-spill-700'
    }`;

  const mobileLabelClass =
    'block max-w-full truncate text-[10px] font-medium leading-none tracking-tight';

  const desktopAction = (item) => (
    <button
      key={item.target}
      type="button"
      title={item.label}
      aria-label={item.label}
      className={desktopButtonClass(item.active)}
      onClick={(e) => {
        e.stopPropagation();
        item.onClick();
      }}
    >
      <span className="syncchat-desktop-nav-icon grid h-5 w-5 shrink-0 place-items-center">
        {item.icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.badge && (
        <span
          className={`min-w-[19px] rounded-full px-1.5 py-0.5 text-center text-[9px] font-bold leading-none ${
            item.active
              ? 'bg-white/20 text-white'
              : 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300'
          }`}
        >
          {item.badge}
        </span>
      )}
    </button>
  );

  return (
    <>
      <aside
        data-syncchat-desktop-sidebar
        className="hidden md:flex h-full shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white text-slate-700 dark:border-spill-700 dark:bg-spill-950 dark:text-spill-200"
      >
        <div className="syncchat-desktop-brand flex h-14 shrink-0 items-center gap-2.5 border-b border-slate-100 px-3 dark:border-spill-800">
          {config.brandLogo ? (
            <img
              src={config.brandLogo}
              alt=""
              className="h-7 w-7 rounded-lg object-cover"
            />
          ) : (
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-violet-600 text-white">
              <bi.BiMessageRoundedDots size={18} />
            </span>
          )}
          <span className="truncate text-[14px] font-bold tracking-tight text-slate-900 dark:text-white">
            {config.brandName}
          </span>
        </div>

        <nav className="flex w-full flex-col gap-1 px-2.5 py-3" aria-label="Desktop navigation">
          {desktopPrimaryActions.map(desktopAction)}

          <details className="group mt-1">
            <summary className="syncchat-desktop-nav-button flex min-h-[38px] w-full cursor-pointer list-none items-center gap-3 rounded-lg px-3 text-[13px] font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-spill-400 dark:hover:bg-spill-800 dark:hover:text-white [&::-webkit-details-marker]:hidden">
              <span className="grid h-5 w-5 shrink-0 place-items-center">
                <bi.BiDotsHorizontalRounded size={20} />
              </span>
              <span className="flex-1">More</span>
              <bi.BiChevronDown className="transition group-open:rotate-180" size={16} />
            </summary>
            <div className="mt-1 grid gap-1 border-l border-slate-200 pl-2 dark:border-spill-700">
              {desktopMoreActions.map(desktopAction)}
            </div>
          </details>
        </nav>

        <div className="mt-auto border-t border-slate-100 p-2.5 dark:border-spill-800">
          <button
            type="button"
            className={`flex w-full items-center gap-2.5 rounded-xl p-2 text-left transition hover:bg-slate-100 dark:hover:bg-spill-800 ${
              page.profile ? 'bg-violet-50 dark:bg-violet-500/10' : ''
            }`}
            onClick={(e) => {
              e.stopPropagation();
              openPagePanel('profile', master._id);
            }}
          >
            <span className="relative shrink-0">
              <img
                src={sidebarAvatar}
                alt=""
                className={`h-9 w-9 rounded-full object-cover ring-2 ${
                  page.profile
                    ? 'ring-violet-500'
                    : 'ring-slate-200 dark:ring-spill-600'
                }`}
              />
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500 dark:border-spill-950" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-semibold text-slate-900 dark:text-white">
                {master?.fullname || master?.username || 'Profile'}
              </span>
              <span className="block truncate text-[10px] text-slate-400 dark:text-spill-400">
                Online
              </span>
            </span>
            <bi.BiChevronDown size={15} className="text-slate-400" />
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
                  className={mobileButtonClass(item.active)}
                  onClick={(e) => {
                    e.stopPropagation();
                    runSidebarAction(item.onClick);
                  }}
                >
                  {item.icon}
                  <span className={mobileLabelClass}>{item.label}</span>
                  {item.badge && (
                    <span className="absolute right-2 top-1 min-w-5 rounded-full bg-sky-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
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
                  className={mobileButtonClass(item.active)}
                  onClick={(e) => {
                    e.stopPropagation();
                    runSidebarAction(item.onClick);
                  }}
                >
                  {item.icon}
                  <span className={mobileLabelClass}>{item.label}</span>
                </button>
              ))}
              <button
                type="button"
                title="Settings"
                aria-label="Settings"
                className={mobileButtonClass(!!page.setting)}
                onClick={(e) => {
                  e.stopPropagation();
                  runSidebarAction(() => openPagePanel('setting'));
                }}
              >
                <bi.BiCog size={20} />
                <span className={mobileLabelClass}>Settings</span>
              </button>
              <div className="my-1 h-px w-10 shrink-0 bg-slate-700 dark:bg-spill-700" />
              <button
                type="button"
                title="Profile"
                aria-label="Profile"
                className={mobileButtonClass(!!page.profile)}
                onClick={(e) => {
                  e.stopPropagation();
                  runSidebarAction(() => openPagePanel('profile', master._id));
                }}
              >
                <img
                  src={sidebarAvatar}
                  alt=""
                  className="h-8 w-8 rounded-full object-cover ring-2 ring-slate-700 dark:ring-spill-600"
                />
                <span className={mobileLabelClass}>Profile</span>
              </button>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

export default Sidebar;
