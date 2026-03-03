import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import * as bi from 'react-icons/bi';
import * as ri from 'react-icons/ri';
import * as md from 'react-icons/md';

import { touchAndHoldStart, touchAndHoldEnd } from '../helpers/touchAndHold';
import { setChatRoom } from '../redux/features/room';
import { setPage } from '../redux/features/page';
import { setModal } from '../redux/features/modal';

import GroupContextMenu from '../components/modals/groupContextMenu';
import socket from '../helpers/socket';

function GroupProfile() {
  const dispatch = useDispatch();
  const {
    chore: { refreshGroupAvatar },
    room: { chat: chatRoom },
    page: { groupProfile, addParticipant, groupParticipant },
    user: { master },
    modal,
  } = useSelector((state) => state);

  const [participants, setParticipants] = useState(null);
  const [group, setGroup] = useState(null);
  const [privacyForm, setPrivacyForm] = useState({
    accessType: 'public',
    password: '',
  });
  const [passwordForm, setPasswordForm] = useState({
    oldPassword: '',
    newPassword: '',
  });
  const [savingPrivacy, setSavingPrivacy] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [privacyRespond, setPrivacyRespond] = useState('');
  const [passwordRespond, setPasswordRespond] = useState('');
  const [inviteCopied, setInviteCopied] = useState(false);

  const inviteToken = String(group?.link || '').replace('/group/+', '');
  const inviteUrl = inviteToken
    ? `${window.location.origin}/chat?g=${encodeURIComponent(inviteToken)}`
    : '';

  const handleGetGroup = (signal) => {
    if (groupProfile && !addParticipant && !groupParticipant) {
      axios
        .all([
          axios.get(`/groups/${groupProfile}`, { signal }),
          axios.get(`/groups/${groupProfile}/participants`, {
            params: { skip: 0, limit: 10 },
            signal,
          }),
        ])
        .then(
          axios.spread(({ data: data1 }, { data: data2 }) => {
            setGroup(data1.payload);
            setParticipants(data2.payload);
          })
        )
        .catch((error0) => console.error(error0.message));
    } else {
      setTimeout(() => {
        setParticipants(null);
        setGroup(null);
      }, 150);
    }
  };

  const handleContextMenu = (e, elem) => {
    const active = group.participantsId.includes(master._id);
    const ex = elem.userId !== master._id;
    const admin = group.adminId === master._id;

    if (ex && admin && active) {
      const parent = document.querySelector('#group-profile');

      const y =
        e.clientY > window.innerHeight / 2 ? e.clientY - 136 : e.clientY;
      const x = e.clientX - (window.innerWidth - parent.clientWidth);

      dispatch(
        setModal({
          target: 'groupContextMenu',
          data: {
            user: elem,
            group,
            x: x > parent.clientWidth / 2 ? x - 160 : x,
            y,
          },
        })
      );
    }
  };

  useEffect(() => {
    const abortCtrl = new AbortController();
    handleGetGroup(abortCtrl.signal);

    return () => {
      abortCtrl.abort();
    };
  }, [groupProfile, addParticipant, !!groupParticipant]);

  useEffect(() => {
    socket.on('group/edit', (payload) => {
      if (groupProfile) {
        setGroup((prev) => ({ ...prev, ...payload }));
      }

      dispatch(
        setChatRoom({
          ...chatRoom,
          data: {
            ...chatRoom.data,
            group: {
              ...chatRoom.data.group,
              ...payload,
            },
          },
        })
      );
    });

    return () => {
      socket.off('group/edit');
    };
  }, [!!groupProfile]);

  useEffect(() => {
    socket.on('group/add-admin', ({ adminId }) => {
      if (groupProfile && group) {
        // update group
        setGroup((prev) => ({ ...prev, adminId }));
        return;
      }

      if (groupParticipant) {
        // update group participant
        dispatch(
          setPage({
            target: 'groupParticipant',
            data: {
              ...groupParticipant,
              adminId,
            },
          })
        );
      }
    });

    socket.on('group/remove-participant', ({ participantId }) => {
      const { group: chg } = chatRoom.data;
      const participantsId = chg.participantsId.filter(
        (el) => el !== participantId
      );

      if (groupProfile && group) {
        // update group
        setGroup((prev) => ({ ...prev, participantsId }));
        // update group participants
        setParticipants((prev) =>
          prev.filter((el) => el.userId !== participantId)
        );
      }

      dispatch(
        setChatRoom({
          ...chatRoom,
          data: {
            ...chatRoom.data,
            group: {
              ...chatRoom.data.group,
              participantsId,
            },
          },
        })
      );
    });

    return () => {
      socket.off('group/add-admin');
      socket.off('group/remove-participant');
    };
  }, [!!group]);

  useEffect(() => {
    if (!group) return;
    setPrivacyForm({
      accessType: group.accessType || 'public',
      password: '',
    });
  }, [group?._id, group?.accessType]);

  const submitPrivacy = async () => {
    try {
      if (!group) return;
      if (
        privacyForm.accessType === 'private' &&
        String(privacyForm.password || '').length < 4
      ) {
        setPrivacyRespond('Private group password must be at least 4 characters');
        return;
      }

      setSavingPrivacy(true);
      setPrivacyRespond('');

      const { data } = await axios.patch(`/groups/${group._id}/privacy`, {
        accessType: privacyForm.accessType,
        password: privacyForm.password,
      });

      setPrivacyRespond(data.message || 'Privacy updated');
      setPrivacyForm((prev) => ({ ...prev, password: '' }));
      setGroup((prev) => ({ ...prev, accessType: privacyForm.accessType }));
    } catch (error0) {
      setPrivacyRespond(error0?.response?.data?.message || error0.message);
    } finally {
      setSavingPrivacy(false);
    }
  };

  const submitPasswordChange = async () => {
    try {
      if (!group || group.accessType !== 'private') return;
      if (String(passwordForm.newPassword || '').length < 4) {
        setPasswordRespond('New password must be at least 4 characters');
        return;
      }

      setSavingPassword(true);
      setPasswordRespond('');

      const { data } = await axios.patch(`/groups/${group._id}/password`, {
        oldPassword: passwordForm.oldPassword,
        newPassword: passwordForm.newPassword,
      });

      setPasswordRespond(data.message || 'Password updated');
      setPasswordForm({ oldPassword: '', newPassword: '' });
    } catch (error0) {
      setPasswordRespond(error0?.response?.data?.message || error0.message);
    } finally {
      setSavingPassword(false);
    }
  };

  const copyInviteLink = async () => {
    try {
      if (!inviteUrl) return;
      await navigator.clipboard.writeText(inviteUrl);
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 1200);
    } catch (error0) {
      console.error(error0.message);
    }
  };

  return (
    <div
      className={`
        ${!groupProfile && 'translate-x-full'}
        transition absolute w-full sm:w-[380px] h-full right-0 z-0 grid grid-rows-[auto_1fr] overflow-hidden
        bg-white dark:bg-spill-900
      `}
      id="group-profile"
    >
      {
        // loading animation
        !group && (
          <div className="absolute w-full h-full flex justify-center items-center bg-white dark:bg-spill-900">
            <span className="flex gap-2 items-center">
              <i className="animate-spin">
                <bi.BiLoaderAlt size={18} />
              </i>
              <p>Loading</p>
            </span>
          </div>
        )
      }
      {/* group context menu */}
      {!groupParticipant && modal.groupContextMenu && <GroupContextMenu />}
      {/* header */}
      <div className="h-16 px-2 z-10 flex gap-6 justify-between items-center">
        <div className="flex gap-4 items-center">
          <button
            type="button"
            className="p-2 rounded-full hover:bg-spill-100 dark:hover:bg-spill-800"
            onClick={() => {
              dispatch(setPage({ target: 'groupProfile' }));
            }}
          >
            <bi.BiArrowBack className="block md:hidden" />
            <bi.BiX className="hidden md:block" />
          </button>
          <h1 className="text-2xl font-bold">Group Info</h1>
        </div>
        {group &&
          group.adminId === master._id &&
          group.participantsId.includes(master._id) && (
            <button
              type="button"
              className="p-2 rounded-full hover:bg-spill-100 dark:hover:bg-spill-800"
              onClick={(e) => {
                e.stopPropagation();

                dispatch(
                  setModal({
                    target: 'editGroup',
                    data: group,
                  })
                );
              }}
            >
              <i>
                <bi.BiPencil />
              </i>
            </button>
          )}
      </div>
      {group && (
        <div className="pb-16 md:pb-0 overflow-y-auto scrollbar-thin scrollbar-thumb-spill-200 hover:scrollbar-thumb-spill-300 dark:scrollbar-thumb-spill-700 dark:hover:scrollbar-thumb-spill-600">
          <div className="p-4 flex flex-col items-center">
            <button
              type="button"
              className="group relative w-28 h-28 rounded-full overflow-hidden cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();

                if (group.adminId !== master._id) {
                  dispatch(
                    setModal({
                      target: 'photoFull',
                      data:
                        group.avatar ||
                        'assets/images/default-group-avatar.png',
                    })
                  );
                } else {
                  dispatch(
                    setModal({
                      target: 'avatarUpload',
                      data: {
                        targetId: group._id,
                        isGroup: true,
                      },
                    })
                  );
                }
              }}
            >
              <span className="group-hover:opacity-100 bg-black/40 absolute w-full h-full z-10 opacity-0 flex justify-center items-center">
                {group.adminId === master._id && (
                  <i className="text-white">
                    <md.MdPhotoCamera size={40} />
                  </i>
                )}
              </span>
              <img
                src={
                  refreshGroupAvatar ||
                  group.avatar ||
                  'assets/images/default-group-avatar.png'
                }
                alt=""
                className="w-full h-full"
              />
            </button>
            <div className="w-full text-center mt-4 overflow-hidden">
              <h1 className="text-2xl font-bold break-all mb-1">
                {group.name}
              </h1>
              <p className="text-sm opacity-60 flex items-center justify-center gap-1">
                {group.accessType === 'private' ? (
                  <bi.BiLockAlt className="text-amber-600 dark:text-amber-400" />
                ) : (
                  <bi.BiLockOpenAlt className="text-emerald-600 dark:text-emerald-400" />
                )}
                {group.accessType === 'private' ? 'Private Group' : 'Public Group'}
              </p>
            </div>
          </div>
          <div className="grid">
            <div className="py-2 px-4 grid grid-cols-[auto_1fr_auto] gap-4 items-start border-0 border-b border-solid border-spill-100 dark:border-spill-800">
              <i>
                <bi.BiInfoCircle />
              </i>
              <span>
                <p className="text-sm opacity-60 mb-1">Description</p>
                <p className="break-all">{group.desc}</p>
              </span>
            </div>
            <div className="py-2 px-4 grid grid-cols-[auto_1fr_auto] gap-4 items-start border-0 border-b border-solid border-spill-100 dark:border-spill-800">
              <i>
                <bi.BiLinkAlt />
              </i>
              <span className="overflow-hidden">
                <p className="text-sm opacity-60 mb-1">Invite Link</p>
                <p className="break-all text-sm">{inviteUrl || group.link}</p>
              </span>
              <button
                type="button"
                className="mt-5 h-8 px-3 rounded-lg border border-spill-300 dark:border-spill-700 hover:bg-spill-100 dark:hover:bg-spill-800 text-xs font-semibold"
                onClick={copyInviteLink}
              >
                {inviteCopied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
          {group.adminId === master._id &&
            group.participantsId.includes(master._id) && (
              <div className="px-4 py-3 grid gap-2 border-0 border-b border-solid border-spill-100 dark:border-spill-800">
                <p className="text-sm font-semibold">Privacy Controls (Admin)</p>
                {privacyRespond && (
                  <p className="text-xs text-sky-600 dark:text-sky-400">
                    {privacyRespond}
                  </p>
                )}
                <label
                  htmlFor="privacy-type"
                  className="h-10 px-3 rounded-lg border border-spill-300 dark:border-spill-700 bg-white dark:bg-spill-900 flex items-center"
                >
                  <select
                    id="privacy-type"
                    value={privacyForm.accessType}
                    onChange={(e) =>
                      setPrivacyForm((prev) => ({
                        ...prev,
                        accessType: e.target.value,
                      }))
                    }
                    className="w-full bg-transparent text-sm"
                  >
                    <option value="public">Public Group</option>
                    <option value="private">Private Group</option>
                  </select>
                </label>
                {privacyForm.accessType === 'private' && (
                  <label
                    htmlFor="privacy-password"
                    className="h-10 px-3 rounded-lg border border-spill-300 dark:border-spill-700 bg-white dark:bg-spill-900 flex items-center"
                  >
                    <input
                      id="privacy-password"
                      type="password"
                      value={privacyForm.password}
                      onChange={(e) =>
                        setPrivacyForm((prev) => ({
                          ...prev,
                          password: e.target.value,
                        }))
                      }
                      placeholder="Set private password (min 4)"
                      className="w-full bg-transparent text-sm"
                    />
                  </label>
                )}
                <button
                  type="button"
                  className="h-10 rounded-lg bg-sky-600 text-white font-semibold hover:bg-sky-700 disabled:opacity-60"
                  onClick={submitPrivacy}
                  disabled={savingPrivacy}
                >
                  {savingPrivacy ? 'Saving...' : 'Update Privacy'}
                </button>
                <button
                  type="button"
                  className="h-10 rounded-lg border border-spill-300 dark:border-spill-700 hover:bg-spill-100 dark:hover:bg-spill-800"
                  onClick={() => {
                    const token = String(group.link || '').replace('/group/+', '');
                    dispatch(
                      setModal({
                        target: 'qr',
                        data: {
                          type: 'group',
                          fullname: group.name,
                          bio:
                            group.accessType === 'private'
                              ? 'Private group invite'
                              : 'Public group invite',
                          avatar:
                            group.avatar || 'assets/images/default-group-avatar.png',
                          shareUrl: `${window.location.origin}/chat?g=${encodeURIComponent(
                            token
                          )}`,
                        },
                      })
                    );
                  }}
                >
                  Show Invite QR
                </button>
                {group.accessType === 'private' && (
                  <div className="pt-2 grid gap-2">
                    <p className="text-sm font-semibold">Change Password</p>
                    {passwordRespond && (
                      <p className="text-xs text-sky-600 dark:text-sky-400">
                        {passwordRespond}
                      </p>
                    )}
                    <label
                      htmlFor="old-group-password"
                      className="h-10 px-3 rounded-lg border border-spill-300 dark:border-spill-700 bg-white dark:bg-spill-900 flex items-center"
                    >
                      <input
                        id="old-group-password"
                        type="password"
                        value={passwordForm.oldPassword}
                        onChange={(e) =>
                          setPasswordForm((prev) => ({
                            ...prev,
                            oldPassword: e.target.value,
                          }))
                        }
                        placeholder="Current password"
                        className="w-full bg-transparent text-sm"
                      />
                    </label>
                    <label
                      htmlFor="new-group-password"
                      className="h-10 px-3 rounded-lg border border-spill-300 dark:border-spill-700 bg-white dark:bg-spill-900 flex items-center"
                    >
                      <input
                        id="new-group-password"
                        type="password"
                        value={passwordForm.newPassword}
                        onChange={(e) =>
                          setPasswordForm((prev) => ({
                            ...prev,
                            newPassword: e.target.value,
                          }))
                        }
                        placeholder="New password"
                        className="w-full bg-transparent text-sm"
                      />
                    </label>
                    <button
                      type="button"
                      className="h-10 rounded-lg border border-spill-300 dark:border-spill-700 hover:bg-spill-100 dark:hover:bg-spill-800 disabled:opacity-60"
                      onClick={submitPasswordChange}
                      disabled={savingPassword}
                    >
                      {savingPassword ? 'Updating...' : 'Change Password'}
                    </button>
                  </div>
                )}
              </div>
            )}
          <div className="pt-6">
            <p className="px-4 opacity-60">{`${group.participantsId.length} participants`}</p>
            <div className="grid">
              {participants &&
                participants.map((elem) => (
                  <div
                    key={elem._id}
                    className={`
                        ${
                          modal.groupContextMenu?.user?.userId === elem.userId
                            ? 'bg-spill-100/60 dark:bg-spill-800/60'
                            : ''
                        }
                        p-4 grid grid-cols-[auto_1fr_auto] gap-4 items-center cursor-pointer
                        border-0 border-b border-solid border-spill-200 dark:border-spill-800
                        hover:bg-spill-100/60 dark:hover:bg-spill-800/60
                      `}
                    aria-hidden
                    onClick={() => {
                      if (master._id !== elem.userId) {
                        dispatch(
                          setPage({
                            target: 'friendProfile',
                            data: elem.userId,
                          })
                        );
                      }
                    }}
                    onContextMenu={(e) => {
                      e.stopPropagation();
                      e.preventDefault();

                      handleContextMenu(e, elem);
                    }}
                    onTouchStart={(e) => {
                      touchAndHoldStart(() => handleContextMenu(e, elem));
                    }}
                    onTouchMove={() => touchAndHoldEnd()}
                    onTouchEnd={() => touchAndHoldEnd()}
                  >
                    <img
                      src={elem.avatar || 'assets/images/default-avatar.png'}
                      alt=""
                      className="w-14 h-14 rounded-full"
                    />
                    <span className="truncate">
                      <h1 className="truncate text-lg font-bold">
                        {elem.fullname}
                        <sup className="ml-1 opacity-60">
                          {master._id === elem.userId && '~You'}
                        </sup>
                      </h1>
                      <p className="truncate mt-0.5 opacity-60">{elem.bio}</p>
                    </span>
                    {/* admin tag */}
                    {elem.userId === group.adminId && (
                      <span className="h-full">
                        <p className="font-bold text-xs py-0.5 px-2 rounded-full text-white bg-sky-600">
                          Admin
                        </p>
                      </span>
                    )}
                  </div>
                ))}
              {group.participantsId.length > participants.length && (
                <button
                  type="button"
                  className="mt-2 md:mb-4 py-2 px-4 flex gap-4 hover:bg-spill-100 dark:hover:bg-spill-800"
                  onClick={() => {
                    dispatch(
                      setPage({
                        target: 'groupParticipant',
                        data: group,
                      })
                    );
                  }}
                >
                  <i>
                    <bi.BiChevronDown />
                  </i>
                  <p>{`View all (${
                    group.participantsId.length - participants.length
                  } more)`}</p>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {group &&
        group.participantsId.includes(master._id) &&
        (group.accessType !== 'private' || group.adminId === master._id) && (
        <button
          type="button"
          className={`
              ${addParticipant && 'scale-0 opacity-0'}
              transition absolute z-10 bottom-0 right-0 -translate-x-6 -translate-y-6
              w-16 h-16 rounded-full flex justify-center items-center shadow-xl text-white bg-sky-600
              hover:brightness-110
            `}
          onClick={() => {
            dispatch(
              setPage({
                target: 'addParticipant',
                data: {
                  participantsId: group.participantsId,
                  groupId: group._id,
                  roomId: group.roomId,
                },
              })
            );
          }}
        >
          <i>
            <ri.RiUserAddFill size={28} />
          </i>
        </button>
      )}
    </div>
  );
}

export default GroupProfile;
