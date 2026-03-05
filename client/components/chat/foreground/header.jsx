import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import * as bi from 'react-icons/bi';
import { v4 as uuidv4 } from 'uuid';
import { setModal } from '../../../redux/features/modal';
import { setPage } from '../../../redux/features/page';
import { setRefreshInbox } from '../../../redux/features/chore';

import config from '../../../config';

function Header({
  setSearch,
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
  const inputTimeout = useRef(null);
  const selectMenuRef = useRef(null);
  const [selectMenuOpen, setSelectMenuOpen] = useState(false);
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

  return (
    <div className="grid items-center z-10 bg-slate-100 text-slate-800 border-b border-slate-200 dark:bg-spill-800 dark:text-spill-100 dark:border-spill-700">
      <div className="h-16 pl-4 pr-2 flex gap-5 justify-between items-center">
        {!selectModeActive ? (
          <>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="md:hidden p-2 rounded-full text-slate-500 hover:bg-slate-200 dark:text-spill-300 dark:hover:bg-spill-700"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenMobileSidebar();
                }}
              >
                <bi.BiMenu size={22} />
              </button>
              {/* brand name */}
              <h1 className="text-xl font-bold">{config.brandName}</h1>
            </div>
            <div className="flex">
              {[
                {
                  target: 'refresh-inbox',
                  icon: <bi.BiRotateRight />,
                  action() {
                    dispatch(setRefreshInbox(uuidv4()));
                  },
                },
                {
                  target: 'contact',
                  icon: <bi.BiMessageSquareDots />,
                  action() {
                    dispatch(setPage({ target: 'contact' }));
                  },
                },
                {
                  target: 'minibox',
                  icon: <bi.BiDotsVerticalRounded />,
                  action(e) {
                    e.stopPropagation();
                    dispatch(setModal({ target: 'minibox' }));
                  },
                },
              ].map((elem) => (
                <button
                  type="button"
                  key={elem.target}
                  className="p-2 rounded-full text-slate-500 hover:bg-slate-200 dark:text-spill-300 dark:hover:bg-spill-700"
                  onClick={elem.action}
                >
                  {elem.icon}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                className="p-2 rounded-full text-slate-500 hover:bg-slate-200 dark:text-spill-300 dark:hover:bg-spill-700"
                onClick={onExitSelectMode}
              >
                <bi.BiArrowBack size={20} />
              </button>
              <h1 className="text-base sm:text-lg font-bold truncate">
                {selectedInboxCount} chat
                {selectedInboxCount > 1 ? 's' : ''} selected
              </h1>
            </div>
            <div className="relative" ref={selectMenuRef}>
              <button
                type="button"
                className="p-2 rounded-full text-slate-500 hover:bg-slate-200 dark:text-spill-300 dark:hover:bg-spill-700"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectMenuOpen((prev) => !prev);
                }}
              >
                <bi.BiDotsVerticalRounded size={20} />
              </button>
              {selectMenuOpen && (
                <div className="absolute right-0 mt-1 w-56 py-2 rounded-md shadow-xl bg-white dark:bg-spill-800 border border-slate-200 dark:border-spill-700 z-20">
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
                      className={`w-full px-4 py-2 text-left flex items-center gap-3 hover:bg-slate-100 dark:hover:bg-spill-700 ${
                        item.danger ? 'text-rose-600 dark:text-rose-400' : ''
                      }`}
                      onClick={async () => {
                        setSelectMenuOpen(false);
                        await item.action();
                      }}
                    >
                      <i>{item.icon}</i>
                      <span className="text-sm">{item.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
      {!selectModeActive && (
        <div className="px-3 py-2 bg-white border-t border-slate-200 dark:bg-spill-900 dark:border-spill-700">
          <label
            htmlFor="search"
            className="flex gap-3 items-center rounded-lg px-3 h-10 bg-slate-100 text-slate-500 border border-slate-200 dark:bg-spill-800 dark:text-spill-300 dark:border-spill-700"
          >
            <bi.BiSearchAlt size={18} />
            <input
              type="text"
              name="search"
              id="search"
              autoComplete="off"
              className="w-full text-sm text-slate-700 placeholder:text-slate-400 dark:text-spill-100 dark:placeholder:text-spill-400"
              placeholder="Search chats..."
              onChange={(e) => {
                clearTimeout(inputTimeout.current);

                inputTimeout.current = setTimeout(() => {
                  if (e.target.value.length < 3) {
                    setSearch('');
                  } else {
                    setSearch(e.target.value);
                  }
                }, 1000);
              }}
            />
          </label>
          {showFilters && (
            <div className="mt-2 overflow-x-auto scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-spill-700">
              <div className="inline-flex min-w-full gap-2">
                {[
                  { key: 'all', label: 'All' },
                  {
                    key: 'unread',
                    label: `Unread (${filterCounts?.unread || 0})`,
                  },
                  {
                    key: 'favourite',
                    label: `Favourite (${filterCounts?.favouriteUnread || 0})`,
                  },
                  {
                    key: 'group',
                    label: `Group (${filterCounts?.groupUnread || 0})`,
                  },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition ${
                      chatFilter === item.key
                        ? 'bg-sky-600 text-white border-sky-600'
                        : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200 dark:bg-spill-800 dark:text-spill-200 dark:border-spill-700 dark:hover:bg-spill-700'
                    }`}
                    onClick={() => setChatFilter(item.key)}
                  >
                    {item.label}
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
