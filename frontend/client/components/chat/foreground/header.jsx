import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import * as bi from 'react-icons/bi';
import { setModal } from '../../../redux/features/modal';
import { setPage } from '../../../redux/features/page';

import config from '../../../config';

function Header({
  searchState,
  setSearchState,
  chatFilter,
  setChatFilter,
  filterCounts,
  onOpenMobileSidebar = () => {},
  isInboxSelectMode = false,
  selectedInboxCount = 0,
  onExitSelectMode,
  onBulkMarkUnread,
  onBulkMute,
  onBulkClear,
  onBulkDelete,
}) {
  const dispatch = useDispatch();
  const page = useSelector((state) => state.page);
  const selectMenuRef = useRef(null);
  const [selectMenuOpen, setSelectMenuOpen] = useState(false);
  const normalizedSearch = {
    query: String(searchState?.query || ''),
  };
  const hasSelectModeHandlers =
    typeof onExitSelectMode === 'function' &&
    typeof onBulkMarkUnread === 'function' &&
    typeof onBulkMute === 'function' &&
    typeof onBulkClear === 'function' &&
    typeof onBulkDelete === 'function';
  const selectModeActive = hasSelectModeHandlers && isInboxSelectMode;
  const showFilters =
    !selectModeActive &&
    !page.calls &&
    !page.contact &&
    !page.setting &&
    !page.status &&
    !page.communities &&
    !page.channels &&
    !page.media &&
    !page.policy &&
    !page.starred &&
    !page.profile &&
    !page.selectParticipant;

  useEffect(() => {
    if (!selectModeActive) {
      setSelectMenuOpen(false);
      return undefined;
    }

    const handleOutside = (event) => {
      if (!selectMenuRef.current?.contains(event.target)) {
        setSelectMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', handleOutside);
    return () => {
      document.removeEventListener('pointerdown', handleOutside);
    };
  }, [selectModeActive]);

  const iconButton =
    'grid h-9 w-9 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-spill-300 dark:hover:bg-spill-700 dark:hover:text-white';

  return (
    <div
      data-syncchat-desktop-inbox-header
      className="z-10 grid items-center border-b border-slate-200 bg-white text-slate-800 dark:border-spill-700 dark:bg-spill-900 dark:text-spill-100"
    >
      <div className="flex h-14 items-center justify-between gap-4 px-3">
        {!selectModeActive ? (
          <>
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                className="md:hidden grid h-9 w-9 place-items-center rounded-full text-slate-500 hover:bg-slate-100 dark:text-spill-300 dark:hover:bg-spill-700"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenMobileSidebar();
                }}
              >
                <bi.BiMenu size={22} />
              </button>
              {config.brandLogo ? (
                <img
                  src={config.brandLogo}
                  alt={config.brandName}
                  className="h-8 w-8 rounded-lg object-cover md:hidden"
                />
              ) : null}
              <h1 className="truncate text-lg font-semibold tracking-tight md:text-[19px]">
                <span className="md:hidden">{config.brandName}</span>
                <span className="hidden md:inline">Chats</span>
              </h1>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                title="New chat"
                aria-label="New chat"
                className={iconButton}
                onClick={() => dispatch(setPage({ target: 'contact', data: true }))}
              >
                <bi.BiMessageSquareAdd size={20} />
              </button>
              <button
                type="button"
                title="More"
                aria-label="More"
                className={iconButton}
                onClick={(e) => {
                  e.stopPropagation();
                  dispatch(setModal({ target: 'minibox' }));
                }}
              >
                <bi.BiDotsVerticalRounded size={21} />
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                className={iconButton}
                onClick={onExitSelectMode}
              >
                <bi.BiArrowBack size={20} />
              </button>
              <h1 className="truncate text-base font-semibold sm:text-lg">
                {selectedInboxCount} chat{selectedInboxCount > 1 ? 's' : ''} selected
              </h1>
            </div>
            <div className="relative" ref={selectMenuRef}>
              <button
                type="button"
                className={iconButton}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectMenuOpen((prev) => !prev);
                }}
              >
                <bi.BiDotsVerticalRounded size={20} />
              </button>
              {selectMenuOpen && (
                <div className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1.5 shadow-xl dark:border-spill-700 dark:bg-spill-800">
                  {[
                    {
                      key: 'mark-unread',
                      icon: <bi.BiMessageAltCheck />,
                      label: 'Mark as unread',
                      action: onBulkMarkUnread,
                    },
                    {
                      key: 'mute',
                      icon: <bi.BiBellOff />,
                      label: 'Mute notification',
                      action: onBulkMute,
                    },
                    {
                      key: 'clear',
                      icon: <bi.BiEraser />,
                      label: 'Clear selected chat',
                      action: onBulkClear,
                    },
                    {
                      key: 'delete',
                      icon: <bi.BiTrashAlt />,
                      label: 'Delete selected chat',
                      action: onBulkDelete,
                      danger: true,
                    },
                  ].map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition hover:bg-slate-100 dark:hover:bg-spill-700 ${
                        item.danger ? 'text-rose-600 dark:text-rose-400' : ''
                      }`}
                      onClick={async () => {
                        setSelectMenuOpen(false);
                        await item.action();
                      }}
                    >
                      <i>{item.icon}</i>
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {!selectModeActive && (
        <div className="border-t border-slate-100 bg-white px-3 pb-2.5 pt-2 dark:border-spill-800 dark:bg-spill-900">
          <label
            htmlFor="search"
            className="flex h-9 items-center gap-2.5 rounded-full bg-slate-100 px-3 text-slate-500 ring-1 ring-transparent transition focus-within:bg-white focus-within:ring-sky-500/40 dark:bg-spill-800 dark:text-spill-300 dark:focus-within:bg-spill-800"
          >
            <bi.BiSearchAlt size={17} />
            <input
              type="text"
              name="search"
              id="search"
              autoComplete="off"
              className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400 dark:text-spill-100 dark:placeholder:text-spill-400"
              placeholder="Search chats"
              value={normalizedSearch.query}
              onChange={(e) =>
                setSearchState((prev) => ({
                  ...(prev || {}),
                  query: e.target.value,
                }))
              }
            />
            {normalizedSearch.query && (
              <button
                type="button"
                className="grid h-6 w-6 place-items-center rounded-full hover:bg-slate-200 dark:hover:bg-spill-700"
                onClick={() => setSearchState({ query: '' })}
              >
                <bi.BiX size={16} />
              </button>
            )}
          </label>

          {showFilters && (
            <div className="mt-2 overflow-x-auto scrollbar-none">
              <div className="inline-flex min-w-full gap-1.5">
                {[
                  { key: 'all', label: 'All', count: filterCounts?.all || 0 },
                  { key: 'unread', label: 'Unread', count: filterCounts?.unread || 0 },
                  {
                    key: 'favourite',
                    label: 'Favourites',
                    count: filterCounts?.favouriteUnread || 0,
                  },
                  { key: 'group', label: 'Groups', count: filterCounts?.groupUnread || 0 },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                      chatFilter === item.key
                        ? 'border-sky-500 bg-sky-50 text-sky-700 dark:border-sky-500/70 dark:bg-sky-500/15 dark:text-sky-300'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-spill-700 dark:bg-spill-900 dark:text-spill-300 dark:hover:bg-spill-800'
                    }`}
                    onClick={() => setChatFilter(item.key)}
                  >
                    {item.label}
                    {item.key !== 'all' && item.count > 0 ? ` ${item.count}` : ''}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Header;
