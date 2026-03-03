import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import * as bi from 'react-icons/bi';

import { setPage } from '../redux/features/page';
import { setSelectedParticipants } from '../redux/features/chore';

function AddParticipant() {
  const dispatch = useDispatch();
  const {
    page,
    chore: { selectedParticipants },
    user: { master },
  } = useSelector((state) => state);
  const [contacts, setContacts] = useState(null);
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [respond, setRespond] = useState('');

  const handleGetContacts = async (signal) => {
    try {
      // get contacts if contact page is opened
      if (page.addParticipant) {
        const { data } = await axios.get('/contacts', { signal });
        setContacts(data.payload);
      } else {
        // reset when page is closed
        setTimeout(() => {
          setContacts(null);
          dispatch(setSelectedParticipants([]));
        }, 150);
      }
    } catch (error0) {
      console.error(error0.response.data.message);
    }
  };

  useEffect(() => {
    const abortCtrl = new AbortController();
    handleGetContacts(abortCtrl.signal);

    return () => {
      abortCtrl.abort();
    };
  }, [page.addParticipant]);

  useEffect(() => {
    const timeout = setTimeout(async () => {
      try {
        const q = String(search || '').trim();
      if (!page.addParticipant || q.length < 2) {
        setSearchResult([]);
        return;
      }

        setSearching(true);
        const { data } = await axios.get('/contacts/search', {
          params: { q },
        });

        const normalized = (data.payload || []).map((user) => ({
          _id: `search-${user.userId}`,
          friendId: user.userId,
          profile: user,
        }));
        setSearchResult(normalized);
      } catch (error0) {
        console.error(error0?.response?.data?.message || error0.message);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [search, page.addParticipant]);

  const handleAddParticipants = async () => {
    try {
      if (!page.addParticipant?.groupId) return;
      if (selectedParticipants.length === 0) {
        setRespond('Select at least one participant');
        return;
      }

      setSubmitting(true);
      setRespond('');
      await axios.post(`/groups/${page.addParticipant.groupId}/participants`, {
        userId: master._id,
        roomId: page.addParticipant.roomId,
        friendsId: selectedParticipants.map(
          (elem) => elem.friendId || elem.userId
        ),
      });

      dispatch(setSelectedParticipants([]));
      dispatch(setPage({ target: 'addParticipant', data: false }));
    } catch (error0) {
      setRespond(error0?.response?.data?.message || error0.message);
    } finally {
      setSubmitting(false);
    }
  };

  const isSelectedParticipant = (elem) => {
    const friendId = elem.friendId || elem.userId;
    return selectedParticipants.some(
      (x) => (x.friendId || x.userId) === friendId
    );
  };

  const toggleSelectedParticipant = (elem) => {
    const friendId = elem.friendId || elem.userId;
    const isSelected = isSelectedParticipant(elem);

    dispatch(
      setSelectedParticipants(
        isSelected
          ? selectedParticipants.filter(
              (x) => (x.friendId || x.userId) !== friendId
            )
          : [...selectedParticipants, elem]
      )
    );

    if (selectedParticipants.length > 1) {
      setTimeout(() => {
        const preview = document.querySelector('#participants-preview');
        if (!preview) return;
        preview.scrollTo({
          left: preview.scrollWidth + 56,
          behavior: 'smooth',
        });
      }, 150);
    }
  };

  return (
    <div
      id="select-participant"
      className={`
        ${page.addParticipant ? 'delay-75' : 'translate-x-full'}
        transition absolute w-full sm:w-[380px] h-full right-0 z-20 grid grid-rows-[auto_auto_1fr] overflow-hidden
        bg-white dark:bg-spill-900
      `}
    >
      {/* header */}
      <div className="h-16 px-2 grid gap-4 grid-cols-[1fr_auto] items-center">
        <div className="flex gap-4 items-center">
          <button
            type="button"
            className="p-2 rounded-full hover:bg-spill-100 dark:hover:bg-spill-800"
            onClick={() => {
              dispatch(setPage({ target: 'addParticipant' }));
            }}
          >
            <bi.BiArrowBack className="text-2xl" />
          </button>
          <h1 className="text-2xl font-bold">Add Participants</h1>
        </div>
      </div>
      {/* participants */}
      <div className="overflow-hidden bg-spill-100/60 dark:bg-black/20">
        <p className="text-sm px-4 py-2 opacity-80">Select participants</p>
        {respond && (
          <p className="px-4 pb-2 text-xs text-rose-600 dark:text-rose-400">
            {respond}
          </p>
        )}
        <div className="px-4 pb-2">
          <label
            htmlFor="participant-search"
            className="h-10 px-3 rounded-lg border border-spill-300 dark:border-spill-700 bg-white dark:bg-spill-900 flex items-center gap-2"
          >
            <bi.BiSearch />
            <input
              id="participant-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by username, email, mobile"
              className="w-full bg-transparent text-sm"
            />
          </label>
          <p className="mt-1 text-xs opacity-60">
            {searching ? 'Searching...' : 'You can add non-contact users too'}
          </p>
        </div>
        {selectedParticipants.length > 0 && (
          <div className="relative flex items-center">
            {/* previous button for participants preview */}
            <button
              type="button"
              className="absolute left-0 z-10 p-1 rounded-full translate-x-2 shadow-lg bg-white dark:bg-spill-700"
              onClick={() => {
                const preview = document.querySelector(
                  '#select-participant #participants-preview'
                );
                preview.scrollTo({
                  left: preview.scrollLeft - 112,
                  behavior: 'smooth',
                });
              }}
            >
              <i className="pointer-events-none">
                <bi.BiChevronLeft />
              </i>
            </button>
            {/* preview */}
            <div
              id="participants-preview"
              className="py-2 px-4 flex gap-4 items-center overflow-x-auto scrollbar-none border-0 border-b border-solid border-spill-200 dark:border-spill-800"
            >
                {selectedParticipants.map((elem) => (
                  <div
                    key={elem._id || elem.friendId || elem.userId}
                    className="flex-none flex flex-col items-center"
                  >
                    <img
                    src={
                      elem.profile.avatar || 'assets/images/default-avatar.png'
                    }
                    alt=""
                    className="w-14 h-14 rounded-full"
                  />
                  <p className="mt-1 text-sm opacity-60">
                    {(() => {
                      const name = elem.profile.fullname;
                      const shortName = name.slice(0, 6).trim();

                      return shortName;
                    })()}
                  </p>
                </div>
              ))}
            </div>
            {/* next button for participants preview */}
            <button
              type="button"
              className="absolute right-0 z-10 p-1 rounded-full -translate-x-2 shadow-lg bg-white dark:bg-spill-700"
              onClick={() => {
                const preview = document.querySelector(
                  '#select-participant #participants-preview'
                );
                preview.scrollTo({
                  left: preview.scrollLeft + 112,
                  behavior: 'smooth',
                });
              }}
            >
              <i className="pointer-events-none">
                <bi.BiChevronRight />
              </i>
            </button>
          </div>
        )}
      </div>
      {/* content */}
      <div className="pb-16 md:pb-0 overflow-y-auto scrollbar-thin scrollbar-thumb-spill-200 hover:scrollbar-thumb-spill-300 dark:scrollbar-thumb-spill-700 dark:hover:scrollbar-thumb-spill-600">
        {page.addParticipant &&
          search.trim().length >= 2 &&
          searchResult
            .filter(
              (elem) =>
                !page.addParticipant.participantsId.includes(elem.friendId)
            )
            .map((elem) => (
              <div
                key={elem._id}
                aria-hidden
                className="w-full grid grid-cols-[auto_1fr_auto] gap-4 p-4 pr-2 items-center cursor-pointer border-0 border-b border-solid border-spill-200 dark:border-spill-800 hover:bg-spill-100/60 dark:hover:bg-spill-800/60"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleSelectedParticipant(elem);
                }}
              >
                <span className="relative">
                  <img
                    src={
                      elem.profile.avatar || 'assets/images/default-avatar.png'
                    }
                    alt=""
                    className="w-14 h-14 rounded-full"
                  />
                  {isSelectedParticipant(elem) && (
                    <span className="absolute bottom-0 right-0 text-white p-1 rounded-full shadow-xl translate-x-1 translate-y-1 bg-sky-600">
                      <i>
                        <bi.BiCheck size={20} />
                      </i>
                    </span>
                  )}
                </span>
                <span className="overflow-hidden">
                  <h1 className="truncate text-lg font-bold">
                    {elem.profile?.fullname ?? '[inactive]'}
                  </h1>
                  <p className="truncate opacity-60 mt-0.5">
                    @{elem.profile?.username} {elem.profile?.email}
                  </p>
                </span>
              </div>
            ))}

        {page.addParticipant &&
          contacts &&
          contacts
            .filter(
              (elem) =>
                !page.addParticipant.participantsId.includes(elem.friendId)
            )
            .map((elem) => (
              <div
                key={elem._id}
                aria-hidden
                className="w-full grid grid-cols-[auto_1fr_auto] gap-4 p-4 pr-2 items-center cursor-pointer border-0 border-b border-solid border-spill-200 dark:border-spill-800 hover:bg-spill-100/60 dark:hover:bg-spill-800/60"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleSelectedParticipant(elem);
                }}
              >
                <span className="relative">
                  <img
                    src={
                      elem.profile.avatar || 'assets/images/default-avatar.png'
                    }
                    alt=""
                    className="w-14 h-14 rounded-full"
                  />
                  {isSelectedParticipant(elem) && (
                    <span className="absolute bottom-0 right-0 text-white p-1 rounded-full shadow-xl translate-x-1 translate-y-1 bg-sky-600">
                      <i>
                        <bi.BiCheck size={20} />
                      </i>
                    </span>
                  )}
                </span>
                <span className="overflow-hidden">
                  <h1 className="truncate text-lg font-bold">
                    {elem.profile?.fullname ?? '[inactive]'}
                  </h1>
                  {elem.profile.bio.length > 0 && (
                    <p className="truncate opacity-60 mt-0.5">
                      {elem.profile.bio}
                    </p>
                  )}
                </span>
              </div>
            ))}
      </div>
      <button
        type="button"
        className={`
          ${selectedParticipants.length <= 0 && 'scale-0 opacity-0 -z-10'}
          transition absolute z-10 bottom-0 right-0 -translate-x-6 -translate-y-6
          w-16 h-16 rounded-full flex justify-center items-center shadow-xl text-white bg-sky-600
          hover:brightness-110
        `}
        onClick={(e) => {
          e.stopPropagation();
          handleAddParticipants();
        }}
        disabled={submitting}
      >
        <i>
          {submitting ? <bi.BiLoaderAlt size={24} className="animate-spin" /> : <bi.BiRightArrowAlt size={28} />}
        </i>
      </button>
    </div>
  );
}

export default AddParticipant;
