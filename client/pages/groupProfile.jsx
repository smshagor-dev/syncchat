import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import * as bi from 'react-icons/bi';
import * as ri from 'react-icons/ri';
import * as md from 'react-icons/md';
import { v4 as uuidv4 } from 'uuid';

import { touchAndHoldStart, touchAndHoldEnd } from '../helpers/touchAndHold';
import { setChatRoom } from '../redux/features/room';
import { setPage } from '../redux/features/page';
import { setModal } from '../redux/features/modal';
import { setRefreshInbox } from '../redux/features/chore';
import { getGroupAdmins, isGroupAdmin } from '../helpers/groupAdmins';
import resolveUploadUrl from '../helpers/resolveUploadUrl';

import GroupContextMenu from '../components/modals/groupContextMenu';
import socket from '../helpers/socket';

const NOTIFICATION_TONES = [
  { value: 'default-ringtone', label: 'Default ringtone' },
  { value: 'classic-bell', label: 'Classic bell' },
  { value: 'digital-pop', label: 'Digital pop' },
  { value: 'soft-chime', label: 'Soft chime' },
];

function GroupProfile() {
  const dispatch = useDispatch();
  const {
    chore: { refreshGroupAvatar },
    room: { chat: chatRoom },
    page: { groupProfile, addParticipant, groupParticipant },
    user: { master },
    modal,
  } = useSelector((state) => state);
  const groupProfileId =
    typeof groupProfile === 'object' && groupProfile !== null
      ? groupProfile.groupId
      : groupProfile;
  const groupProfileRoomIdFromPage =
    typeof groupProfile === 'object' && groupProfile !== null
      ? groupProfile.roomId || null
      : null;

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
  const [savingPermissions, setSavingPermissions] = useState(false);
  const [permissionModalOpen, setPermissionModalOpen] = useState(false);
  const [pendingListModalOpen, setPendingListModalOpen] = useState(false);
  const [privacyRespond, setPrivacyRespond] = useState('');
  const [passwordRespond, setPasswordRespond] = useState('');
  const [permissionRespond, setPermissionRespond] = useState('');
  const [permissionForm, setPermissionForm] = useState({
    memberCanEditInfo: false,
    memberCanSendMessage: true,
    memberCanAddMember: false,
    memberCanInviteViaLink: false,
    adminApprovalRequired: false,
  });
  const [pendingProfiles, setPendingProfiles] = useState([]);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [roomMedia, setRoomMedia] = useState({
    loaded: false,
    counts: { media: 0, link: 0, file: 0 },
    photos: [],
  });
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const [encryptionPopupOpen, setEncryptionPopupOpen] = useState(false);
  const [inboxPrefs, setInboxPrefs] = useState({
    loading: false,
    muted: false,
    tone: 'default-ringtone',
    advancedPrivacy: false,
    favourite: false,
    listed: false,
  });
  const [memberSearch, setMemberSearch] = useState('');
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [memberModalLoading, setMemberModalLoading] = useState(false);
  const [allParticipants, setAllParticipants] = useState([]);
  const [groupActionMessage, setGroupActionMessage] = useState('');
  const [reportDialog, setReportDialog] = useState({
    open: false,
    reason: '',
    loading: false,
    error: '',
  });

  const inviteToken = String(group?.link || '').replace('/group/+', '');
  const inviteUrl = inviteToken
    ? `${window.location.origin}/chat?g=${encodeURIComponent(inviteToken)}`
    : '';
  const isAdmin = !!group && isGroupAdmin(group, master._id);
  const adminIds = getGroupAdmins(group);
  const isMember = !!group && group.participantsId.includes(master._id);
  const normalizedPermissions = {
    memberCanEditInfo: !!group?.permissions?.memberCanEditInfo,
    memberCanSendMessage:
      group?.permissions?.memberCanSendMessage === undefined
        ? true
        : !!group?.permissions?.memberCanSendMessage,
    memberCanAddMember: !!group?.permissions?.memberCanAddMember,
    memberCanInviteViaLink: !!group?.permissions?.memberCanInviteViaLink,
    adminApprovalRequired: !!group?.permissions?.adminApprovalRequired,
  };
  const canEditGroupInfo =
    isAdmin || (isMember && normalizedPermissions.memberCanEditInfo);
  const canAddParticipants =
    isAdmin || (isMember && normalizedPermissions.memberCanAddMember);
  const inviteLinkEnabled = normalizedPermissions.memberCanInviteViaLink;
  const pendingRequestCount = Array.isArray(group?.pendingMembersId)
    ? group.pendingMembersId.length
    : pendingProfiles.length;
  const memberPermissionItems = [
    {
      key: 'memberCanEditInfo',
      label: 'Edit Group info',
    },
    {
      key: 'memberCanSendMessage',
      label: 'Send message',
    },
    {
      key: 'memberCanAddMember',
      label: 'Add other member',
    },
    {
      key: 'memberCanInviteViaLink',
      label: 'Invite via link',
    },
  ];

  const handleGetGroup = (signal) => {
    if (groupProfileId && !addParticipant && !groupParticipant) {
      axios
        .all([
          axios.get(`/groups/${groupProfileId}`, { signal }),
          axios.get(`/groups/${groupProfileId}/participants`, {
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

  const handleGetRoomMedia = async (signal) => {
    const targetRoomId = groupProfileRoomIdFromPage || group?.roomId || null;
    if (!targetRoomId) {
      setRoomMedia({
        loaded: true,
        counts: { media: 0, link: 0, file: 0 },
        photos: [],
      });
      return;
    }

    try {
      setRoomMedia((prev) => ({ ...prev, loaded: false }));
      const { data } = await axios.get('/chats/media', {
        params: { roomId: targetRoomId },
        signal,
      });
      const payload = Array.isArray(data?.payload) ? data.payload : [];
      setRoomMedia({
        loaded: true,
        counts: {
          media: payload.filter((item) => ['photo', 'video'].includes(item.kind))
            .length,
          link: payload.filter((item) => item.kind === 'link').length,
          file: payload.filter((item) => item.kind === 'file').length,
        },
        photos: payload
          .filter((item) => item.kind === 'photo' && item?.file?.url)
          .slice(0, 20),
      });
    } catch (error0) {
      setRoomMedia({
        loaded: true,
        counts: { media: 0, link: 0, file: 0 },
        photos: [],
      });
      console.error(error0.message);
    }
  };

  const handleGetInboxPreference = async (signal) => {
    const roomId = groupProfileRoomIdFromPage || group?.roomId;
    if (!roomId || !master?._id) {
      setInboxPrefs((prev) => ({ ...prev, loading: false }));
      return;
    }

    try {
      setInboxPrefs((prev) => ({ ...prev, loading: true }));
      const { data } = await axios.get(`/inboxes/${roomId}`, { signal });
      const inbox = data?.payload || {};
      setInboxPrefs({
        loading: false,
        muted:
          Array.isArray(inbox.mutedBy) && inbox.mutedBy.includes(master._id),
        tone:
          inbox?.notificationToneBy?.[master._id] || 'default-ringtone',
        advancedPrivacy:
          Array.isArray(inbox.privacyShieldBy) &&
          inbox.privacyShieldBy.includes(master._id),
        favourite:
          Array.isArray(inbox.favouriteBy) &&
          inbox.favouriteBy.includes(master._id),
        listed:
          Array.isArray(inbox.listedBy) &&
          inbox.listedBy.includes(master._id),
      });
    } catch (error0) {
      setInboxPrefs((prev) => ({ ...prev, loading: false }));
      console.error(error0.message);
    }
  };

  const updateInboxPreference = async (action, value) => {
    const roomId = groupProfileRoomIdFromPage || group?.roomId;
    if (!roomId) return false;

    try {
      await axios.patch(`/inboxes/${roomId}/preferences`, {
        action,
        value,
      });
      dispatch(setRefreshInbox(uuidv4()));
      return true;
    } catch (error0) {
      setPrivacyRespond(error0?.response?.data?.message || error0.message);
      return false;
    }
  };

  const handleContextMenu = (e, elem) => {
    const active = group.participantsId.includes(master._id);
    const ex = elem.userId !== master._id;
    const admin = isGroupAdmin(group, master._id);

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
    handleGetRoomMedia(abortCtrl.signal);
    handleGetInboxPreference(abortCtrl.signal);

    return () => {
      abortCtrl.abort();
    };
  }, [
    groupProfileId,
    groupProfileRoomIdFromPage,
    group?.roomId,
    addParticipant,
    !!groupParticipant,
    master?._id,
  ]);

  useEffect(() => {
    socket.on('group/edit', (payload) => {
      if (groupProfileId) {
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
  }, [!!groupProfileId]);

  useEffect(() => {
    socket.on('group/add-admin', ({ adminId, adminsId }) => {
      dispatch(
        setChatRoom({
          ...chatRoom,
          data: {
            ...chatRoom.data,
            group: {
              ...chatRoom.data.group,
              adminId,
              adminsId,
            },
          },
        })
      );

      if (groupProfile && group) {
        // update group
        setGroup((prev) => ({ ...prev, adminId, adminsId }));
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
              adminsId,
            },
          })
        );
      }
    });

    socket.on('group/remove-admin', ({ adminId, adminsId }) => {
      dispatch(
        setChatRoom({
          ...chatRoom,
          data: {
            ...chatRoom.data,
            group: {
              ...chatRoom.data.group,
              adminId,
              adminsId,
            },
          },
        })
      );

      if (groupProfile && group) {
        setGroup((prev) => ({ ...prev, adminId, adminsId }));
        return;
      }

      if (groupParticipant) {
        dispatch(
          setPage({
            target: 'groupParticipant',
            data: {
              ...groupParticipant,
              adminId,
              adminsId,
            },
          })
        );
      }
    });

    socket.on('group/remove-participant', ({ participantId, adminsId }) => {
      const { group: chg } = chatRoom.data;
      const participantsId = chg.participantsId.filter(
        (el) => el !== participantId
      );

      if (groupProfile && group) {
        // update group
        setGroup((prev) => ({
          ...prev,
          participantsId,
          adminsId: adminsId || prev?.adminsId || [],
        }));
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
              adminsId:
                adminsId || chatRoom.data.group.adminsId || [],
            },
          },
        })
      );
    });

    return () => {
      socket.off('group/add-admin');
      socket.off('group/remove-admin');
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

  useEffect(() => {
    if (!group) return;
    setPermissionForm({
      memberCanEditInfo: !!group?.permissions?.memberCanEditInfo,
      memberCanSendMessage:
        group?.permissions?.memberCanSendMessage === undefined
          ? true
          : !!group?.permissions?.memberCanSendMessage,
      memberCanAddMember: !!group?.permissions?.memberCanAddMember,
      memberCanInviteViaLink: !!group?.permissions?.memberCanInviteViaLink,
      adminApprovalRequired: !!group?.permissions?.adminApprovalRequired,
    });
  }, [group?._id, JSON.stringify(group?.permissions || {})]);

  useEffect(() => {
    if (!groupProfileId) {
      setPermissionModalOpen(false);
      setPendingListModalOpen(false);
    }
  }, [groupProfileId]);

  useEffect(() => {
    if (!permissionForm.adminApprovalRequired) {
      setPendingListModalOpen(false);
    }
  }, [permissionForm.adminApprovalRequired]);

  useEffect(() => {
    const pendingIds = Array.isArray(group?.pendingMembersId)
      ? group.pendingMembersId
      : [];
    if (!group || !isAdmin || pendingIds.length === 0) {
      setPendingProfiles([]);
      return;
    }

    axios
      .get(`/groups/${group._id}/pending-members`)
      .then(({ data }) => {
        const pendingPayload = (data?.payload || []).map((item) => ({
          userId: item.userId,
          fullname: item.fullname || item.userId,
          avatar: item.avatar || 'assets/images/default-avatar.png',
        }));
        setPendingProfiles(pendingPayload);
      })
      .catch(() => {
        setPendingProfiles(
          pendingIds.map((id) => ({
            userId: id,
            fullname: id,
            avatar: 'assets/images/default-avatar.png',
          }))
        );
      });
  }, [group?._id, JSON.stringify(group?.pendingMembersId || []), isAdmin]);

  const submitPrivacy = async () => {
    try {
      if (!group) return;
      if (
        privacyForm.accessType === 'private' &&
        String(privacyForm.password || '').length < 4
      ) {
        setPrivacyRespond(
          'Private group password must be at least 4 characters'
        );
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

  const submitPermissions = async () => {
    try {
      if (!group || !isAdmin) return;
      setSavingPermissions(true);
      setPermissionRespond('');
      const { data } = await axios.patch(`/groups/${group._id}/permissions`, {
        permissions: permissionForm,
      });
      setPermissionRespond(data.message || 'Permissions updated');
      setGroup((prev) => ({
        ...prev,
        permissions: {
          ...permissionForm,
        },
      }));
    } catch (error0) {
      setPermissionRespond(error0?.response?.data?.message || error0.message);
    } finally {
      setSavingPermissions(false);
    }
  };

  const approvePendingMember = async (memberId) => {
    try {
      if (!group || !isAdmin) return;
      await axios.post(
        `/groups/${group._id}/pending-members/${memberId}/approve`
      );
      setGroup((prev) => ({
        ...prev,
        participantsId: [
          ...new Set([...(prev?.participantsId || []), memberId]),
        ],
        pendingMembersId: (prev?.pendingMembersId || []).filter(
          (item) => item !== memberId
        ),
      }));
    } catch (error0) {
      setPermissionRespond(error0?.response?.data?.message || error0.message);
    }
  };

  const rejectPendingMember = async (memberId) => {
    try {
      if (!group || !isAdmin) return;
      await axios.post(
        `/groups/${group._id}/pending-members/${memberId}/reject`
      );
      setGroup((prev) => ({
        ...prev,
        pendingMembersId: (prev?.pendingMembersId || []).filter(
          (item) => item !== memberId
        ),
      }));
    } catch (error0) {
      setPermissionRespond(error0?.response?.data?.message || error0.message);
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

  const renderPermissionToggle = ({ checked, onClick, id }) => (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      className={`${
        checked
          ? 'bg-sky-600 shadow-sky-500/40'
          : 'bg-slate-300 dark:bg-spill-700 shadow-transparent'
      } relative h-8 w-14 rounded-full p-1 shadow-inner transition-all duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400`}
      onClick={onClick}
    >
      <span
        className={`${
          checked ? 'translate-x-6' : 'translate-x-0'
        } pointer-events-none absolute top-1 left-1 h-6 w-6 rounded-full bg-white shadow-md transition-transform duration-200 ease-out`}
      />
      <span className="sr-only">{checked ? 'On' : 'Off'}</span>
    </button>
  );

  const previewParticipants = (participants || []).filter((member) =>
    String(member?.fullname || member?.username || member?.userId || '')
      .toLowerCase()
      .includes(memberSearch.trim().toLowerCase())
  );

  const modalParticipants = (allParticipants || []).filter((member) =>
    String(member?.fullname || member?.username || member?.userId || '')
      .toLowerCase()
      .includes(memberSearch.trim().toLowerCase())
  );

  const openMemberModal = async () => {
    try {
      if (!group?._id) return;
      setMemberModalOpen(true);
      setMemberModalLoading(true);
      let skip = 0;
      const limit = 50;
      let rows = [];

      // Load all members so modal search can work on full list
      // eslint-disable-next-line no-constant-condition
      while (true) {
        // eslint-disable-next-line no-await-in-loop
        const { data } = await axios.get(`/groups/${group._id}/participants`, {
          params: { skip, limit },
        });
        const chunk = Array.isArray(data?.payload) ? data.payload : [];
        rows = rows.concat(chunk);
        if (chunk.length < limit) break;
        skip += limit;
      }

      setAllParticipants(rows);
    } catch (error0) {
      setGroupActionMessage(error0?.response?.data?.message || error0.message);
    } finally {
      setMemberModalLoading(false);
    }
  };

  const handleExitGroup = () => {
    if (!group?._id) return;
    dispatch(
      setModal({
        target: 'confirmExitGroup',
        data: { groupId: group._id, name: group.name },
      })
    );
  };

  const submitReportGroup = async () => {
    try {
      const reason = String(reportDialog.reason || '').trim();
      if (reason.length < 3) {
        setReportDialog((prev) => ({
          ...prev,
          error: 'Reason must be at least 3 characters',
        }));
        return;
      }

      setReportDialog((prev) => ({
        ...prev,
        loading: true,
        error: '',
      }));

      await axios.post('/reports/chat', {
        roomId: groupProfileRoomIdFromPage || group?.roomId,
        roomType: 'group',
        targetId: group?._id,
        reason: reason.slice(0, 500),
      });

      setReportDialog({
        open: false,
        reason: '',
        loading: false,
        error: '',
      });
      setGroupActionMessage('Group reported successfully');
    } catch (error0) {
      setReportDialog((prev) => ({
        ...prev,
        loading: false,
        error: error0?.response?.data?.message || error0.message,
      }));
    }
  };

  return (
    <div
      className={`
        ${!groupProfileId && 'translate-x-full'}
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
        {group && canEditGroupInfo && (
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

                if (!isGroupAdmin(group, master._id)) {
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
                {isGroupAdmin(group, master._id) && (
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
                {group.accessType === 'private'
                  ? 'Private Group'
                  : 'Public Group'}
              </p>
            </div>
          </div>
          <div className="px-4 pb-3 border-0 border-b border-solid border-spill-100 dark:border-spill-800">
            <p className="text-sm opacity-60 mb-2">Media, links and docs</p>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {[
                {
                  key: 'media',
                  label: 'Media',
                  value: roomMedia.counts.media,
                  tab: 'media',
                },
                {
                  key: 'link',
                  label: 'Links',
                  value: roomMedia.counts.link,
                  tab: 'link',
                },
                {
                  key: 'file',
                  label: 'Docs',
                  value: roomMedia.counts.file,
                  tab: 'file',
                },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className="py-2 rounded-lg border border-spill-200 dark:border-spill-700 hover:bg-spill-50 dark:hover:bg-spill-800"
                  onClick={() =>
                    (groupProfileRoomIdFromPage || group?.roomId) &&
                    dispatch(
                      setPage({
                        target: 'media',
                        data: {
                          roomId: groupProfileRoomIdFromPage || group?.roomId,
                          title: group?.name || 'Group',
                          initialTab: item.tab,
                        },
                      })
                    )
                  }
                  disabled={!(groupProfileRoomIdFromPage || group?.roomId)}
                >
                  <p className="text-base font-semibold">{item.value}</p>
                  <p className="text-xs opacity-70">{item.label}</p>
                </button>
              ))}
            </div>
            <div className="overflow-x-auto">
              <div className="flex gap-2 pb-1 min-w-max">
                {!roomMedia.loaded && (
                  <p className="text-xs opacity-70">Loading media...</p>
                )}
                {roomMedia.loaded && roomMedia.photos.length === 0 && (
                  <p className="text-xs opacity-70">No photos in this Group</p>
                )}
                {roomMedia.photos.map((item) => (
                  <button
                    key={item._id}
                    type="button"
                    className="w-16 h-16 rounded-md overflow-hidden border border-spill-200 dark:border-spill-700"
                    onClick={() =>
                      dispatch(
                        setModal({
                          target: 'photoFull',
                          data: resolveUploadUrl(item.file.url),
                        })
                      )
                    }
                  >
                    <img
                      src={resolveUploadUrl(item.file.url)}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="grid">
            <div className="px-4 py-2 border-0 border-b border-solid border-spill-100 dark:border-spill-800">
              <hr className="border-0 border-t border-solid border-spill-200 dark:border-spill-700" />
            </div>
            <button
              type="button"
              className="py-3 px-4 grid grid-cols-[auto_1fr_auto] gap-3 items-center text-left border-0 border-b border-solid border-spill-100 dark:border-spill-800 hover:bg-spill-50 dark:hover:bg-spill-800/60"
              onClick={() => dispatch(setPage({ target: 'starred', data: true }))}
            >
              <i>
                <bi.BiStar />
              </i>
              <span>Starred Message</span>
              <bi.BiChevronRight />
            </button>
            <div className="border-0 border-b border-solid border-spill-100 dark:border-spill-800">
              <button
                type="button"
                className="w-full py-3 px-4 grid grid-cols-[auto_1fr_auto] gap-3 items-center text-left hover:bg-spill-50 dark:hover:bg-spill-800/60"
                onClick={() => setSettingsExpanded((prev) => !prev)}
              >
                <i>
                  <bi.BiBell />
                </i>
                <span>Notification setting</span>
                <bi.BiChevronDown
                  className={`${settingsExpanded ? 'rotate-180' : ''} transition`}
                />
              </button>
              {settingsExpanded && (
                <div className="px-4 pb-3 grid gap-3">
                  <div className="h-10 px-3 rounded-lg border border-spill-200 dark:border-spill-700 bg-slate-50/80 dark:bg-spill-900/60 flex items-center justify-between">
                    <span className="text-sm">Mute notification</span>
                    {renderPermissionToggle({
                      checked: inboxPrefs.muted,
                      id: 'group-mute-toggle',
                      onClick: async () => {
                        const next = !inboxPrefs.muted;
                        setInboxPrefs((prev) => ({ ...prev, muted: next }));
                        await updateInboxPreference('mute', next);
                      },
                    })}
                  </div>
                  <label className="h-10 px-3 rounded-lg border border-spill-200 dark:border-spill-700 bg-slate-50/80 dark:bg-spill-900/60 flex items-center gap-2">
                    <bi.BiMusic />
                    <select
                      value={inboxPrefs.tone}
                      className="w-full bg-transparent text-sm"
                      onChange={async (e) => {
                        const nextTone = e.target.value;
                        setInboxPrefs((prev) => ({ ...prev, tone: nextTone }));
                        await updateInboxPreference('notificationTone', nextTone);
                      }}
                    >
                      {NOTIFICATION_TONES.map((tone) => (
                        <option key={tone.value} value={tone.value}>
                          {tone.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {inboxPrefs.loading && (
                    <p className="text-xs opacity-70">Loading settings...</p>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              className="py-3 px-4 grid grid-cols-[auto_1fr_auto] gap-3 items-center text-left border-0 border-b border-solid border-spill-100 dark:border-spill-800 hover:bg-spill-50 dark:hover:bg-spill-800/60"
              onClick={() => setEncryptionPopupOpen(true)}
            >
              <i>
                <bi.BiLockAlt />
              </i>
              <span>Encription</span>
              <bi.BiChevronRight />
            </button>
            <div className="py-3 px-4 grid grid-cols-[auto_1fr_auto] gap-3 items-center border-0 border-b border-solid border-spill-100 dark:border-spill-800">
              <i>
                <bi.BiShieldQuarter />
              </i>
              <span className="text-sm">
                <p className="font-medium">Advance privecy chat</p>
                <p className="opacity-70 text-xs">
                  On thakle screenshot/screen video try korle privacy shield
                  show hobe.
                </p>
              </span>
              {renderPermissionToggle({
                checked: inboxPrefs.advancedPrivacy,
                id: 'group-advanced-privacy-toggle',
                onClick: async () => {
                  const next = !inboxPrefs.advancedPrivacy;
                  setInboxPrefs((prev) => ({ ...prev, advancedPrivacy: next }));
                  await updateInboxPreference('advancedPrivacy', next);
                },
              })}
            </div>
            <div className="py-2 px-4 grid grid-cols-[auto_1fr_auto] gap-4 items-start border-0 border-b border-solid border-spill-100 dark:border-spill-800">
              <i>
                <bi.BiInfoCircle />
              </i>
              <span>
                <p className="text-sm opacity-60 mb-1">Description</p>
                <p className="break-all">{group.desc}</p>
              </span>
            </div>
            {inviteLinkEnabled && (
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
            )}
          </div>
          {isAdmin && isMember && (
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
                  const token = String(group.link || '').replace(
                    '/group/+',
                    ''
                  );
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
                          group.avatar ||
                          'assets/images/default-group-avatar.png',
                        shareUrl: `${
                          window.location.origin
                        }/chat?g=${encodeURIComponent(token)}`,
                      },
                    })
                  );
                }}
              >
                Show Invite QR
              </button>
              <button
                type="button"
                className="mt-1 h-11 px-3 rounded-xl border border-spill-300 dark:border-spill-700 flex items-center justify-between bg-slate-50/80 dark:bg-spill-900/50 hover:bg-slate-100 dark:hover:bg-spill-800"
                onClick={() => setPermissionModalOpen(true)}
              >
                <span className="flex items-center gap-2">
                  <bi.BiLockAlt className="text-sky-600 dark:text-sky-400" />
                  <span className="text-sm font-semibold">
                    Group Permission Settings
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  {permissionForm.adminApprovalRequired && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                      Pending {pendingRequestCount}
                    </span>
                  )}
                  <bi.BiChevronRight />
                </span>
              </button>
              {permissionForm.adminApprovalRequired && (
                <button
                  type="button"
                  className="h-11 px-3 rounded-xl border border-spill-300 dark:border-spill-700 flex items-center justify-between bg-slate-50/80 dark:bg-spill-900/50 hover:bg-slate-100 dark:hover:bg-spill-800"
                  onClick={() => setPendingListModalOpen(true)}
                >
                  <span className="flex items-center gap-2">
                    <bi.BiUserCheck className="text-amber-600 dark:text-amber-400" />
                    <span className="text-sm font-semibold">
                      Pending User Requests
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                      {pendingRequestCount}
                    </span>
                    <bi.BiChevronRight />
                  </span>
                </button>
              )}
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
            <div className="px-4 pb-3 grid gap-2 border-0 border-b border-solid border-spill-100 dark:border-spill-800">
              <p className="opacity-60">{`${group.participantsId.length} participants`}</p>
              <label className="h-10 px-3 rounded-lg border border-spill-300 dark:border-spill-700 bg-white dark:bg-spill-900 flex items-center gap-2">
                <bi.BiSearch />
                <input
                  type="text"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="Search member"
                  className="w-full bg-transparent text-sm"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="h-10 rounded-lg border border-spill-300 dark:border-spill-700 hover:bg-spill-100 dark:hover:bg-spill-800 flex items-center justify-center gap-2 text-sm font-medium"
                  onClick={() =>
                    canAddParticipants &&
                    dispatch(
                      setPage({
                        target: 'addParticipant',
                        data: {
                          participantsId: group.participantsId,
                          groupId: group._id,
                          roomId: group.roomId,
                        },
                      })
                    )
                  }
                  disabled={!canAddParticipants}
                >
                  <ri.RiUserAddFill />
                  Add new member
                </button>
                <button
                  type="button"
                  className="h-10 rounded-lg border border-spill-300 dark:border-spill-700 hover:bg-spill-100 dark:hover:bg-spill-800 flex items-center justify-center gap-2 text-sm font-medium"
                  onClick={copyInviteLink}
                  disabled={!inviteLinkEnabled}
                >
                  <bi.BiLinkAlt />
                  {inviteCopied ? 'Copied' : 'Invite via link'}
                </button>
              </div>
            </div>

            <div className="grid">
              {previewParticipants.slice(0, 10).map((elem) => (
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
                  {adminIds.includes(elem.userId) && (
                    <span className="h-full">
                      <p className="font-bold text-xs py-0.5 px-2 rounded-full text-white bg-sky-600">
                        Admin
                      </p>
                    </span>
                  )}
                </div>
              ))}
              {group.participantsId.length > 10 && (
                <button
                  type="button"
                  className="mt-2 md:mb-4 py-2 px-4 flex gap-4 hover:bg-spill-100 dark:hover:bg-spill-800"
                  onClick={openMemberModal}
                >
                  <i>
                    <bi.BiChevronDown />
                  </i>
                  <p>{`View all (${group.participantsId.length - 10} more)`}</p>
                </button>
              )}
            </div>
          </div>

          <div className="mt-2 grid border-0 border-t border-solid border-spill-100 dark:border-spill-800">
            {groupActionMessage && (
              <p className="px-4 pt-2 text-xs text-sky-600 dark:text-sky-400">
                {groupActionMessage}
              </p>
            )}
            {[
              {
                key: 'favourite',
                label: inboxPrefs.favourite
                  ? 'Remove from favourite'
                  : 'Add to favourite',
                icon: <bi.BiStar />,
                onClick: async () => {
                  const next = !inboxPrefs.favourite;
                  setInboxPrefs((prev) => ({ ...prev, favourite: next }));
                  await updateInboxPreference('favourite', next);
                },
              },
              {
                key: 'list',
                label: inboxPrefs.listed ? 'Remove from list' : 'Add to list',
                icon: <bi.BiListUl />,
                onClick: async () => {
                  const next = !inboxPrefs.listed;
                  setInboxPrefs((prev) => ({ ...prev, listed: next }));
                  await updateInboxPreference('list', next);
                },
              },
              {
                key: 'clear',
                label: 'Clear chat',
                icon: <bi.BiEraser />,
                onClick: async () => {
                  const roomId = groupProfileRoomIdFromPage || group?.roomId;
                  if (!roomId) return;
                  try {
                    await axios.post(`/inboxes/${roomId}/clear`);
                    dispatch(setRefreshInbox(uuidv4()));
                    setGroupActionMessage('Chat cleared successfully');
                  } catch (error0) {
                    setGroupActionMessage(
                      error0?.response?.data?.message || error0.message
                    );
                  }
                },
              },
              {
                key: 'exit',
                label: 'Exit group',
                icon: <bi.BiExit />,
                onClick: handleExitGroup,
                danger: true,
              },
              {
                key: 'report',
                label: 'Report group',
                icon: <bi.BiErrorCircle />,
                onClick: () =>
                  setReportDialog({
                    open: true,
                    reason: '',
                    loading: false,
                    error: '',
                  }),
                danger: true,
              },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                className={`py-3 px-4 grid grid-cols-[auto_1fr] gap-3 text-left border-0 border-b border-solid border-spill-100 dark:border-spill-800 hover:bg-spill-100/60 dark:hover:bg-spill-800/60 ${
                  item.danger ? 'text-rose-600 dark:text-rose-400' : ''
                }`}
                onClick={item.onClick}
              >
                <i>{item.icon}</i>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {group && encryptionPopupOpen && (
        <div
          className="fixed inset-0 z-[240] bg-black/50 backdrop-blur-[1px] flex justify-center items-center px-3"
          aria-hidden
          onClick={() => setEncryptionPopupOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-spill-200 bg-white text-spill-900 shadow-2xl px-6 py-7 dark:border-[#20252c] dark:bg-[#12171d] dark:text-[#eef1f4]"
            aria-hidden
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-end">
              <button
                type="button"
                className="p-1.5 rounded-full text-spill-500 hover:text-spill-900 hover:bg-spill-100 dark:text-white/70 dark:hover:text-white dark:hover:bg-white/10"
                onClick={() => setEncryptionPopupOpen(false)}
              >
                <bi.BiX />
              </button>
            </div>
            <div className="grid justify-items-center text-center">
              <div className="w-28 h-20 mb-4 relative">
                <span className="absolute left-1 top-8 w-9 h-9 rounded-full border-[5px] border-spill-700 dark:border-white/90" />
                <span className="absolute left-6 top-11 w-9 h-[5px] bg-spill-700 rotate-45 origin-left rounded-full dark:bg-white/90" />
                <span className="absolute left-11 top-3 w-12 h-12 rounded-xl bg-emerald-100 border-2 border-emerald-300 flex items-center justify-center dark:bg-[#dff5d2] dark:border-[#0f151b]">
                  <bi.BiLockAlt size={24} className="text-emerald-800 dark:text-[#24311f]" />
                </span>
                <span className="absolute right-2 top-8 w-10 h-10 rounded-full bg-[#23d366] border-2 border-emerald-600 flex items-center justify-center dark:border-[#0f151b]">
                  <bi.BiTime size={18} className="text-emerald-900 dark:text-[#0f151b]" />
                </span>
                <span className="absolute right-0 bottom-2 w-12 h-3 rounded-full bg-spill-300 dark:bg-white/90" />
                <span className="absolute right-4 bottom-1 w-6 h-5 rounded-full bg-[#23d366] border border-emerald-600 dark:border-[#0f151b]" />
              </div>
              <h2 className="text-[37px] leading-10 font-semibold">
                Your chats and calls are private
              </h2>
              <p className="mt-3 text-[17px] leading-7 text-spill-700 dark:text-white/85">
                End-to-end encryption keeps your personal messages and calls
                between you and the people you choose. No one outside of the
                chat, not even us, can read, listen to, or share them. This
                includes:
              </p>
            </div>
            <div className="mt-6 grid gap-4 text-[17px] text-spill-800 dark:text-white/92">
              <div className="w-full max-w-[320px] mx-auto grid gap-4">
                {[
                  {
                    icon: <bi.BiMessageDetail />,
                    text: 'Text and voice messages',
                  },
                  {
                    icon: <bi.BiPhoneCall />,
                    text: 'Audio and video calls',
                  },
                  {
                    icon: <bi.BiImage />,
                    text: 'Photos, videos and Documents',
                  },
                  {
                    icon: <bi.BiMapPin />,
                    text: 'Location Sharing',
                  },
                  {
                    icon: <bi.BiInfoCircle />,
                    text: 'Status updates',
                  },
                ].map((item) => (
                  <div
                    key={item.text}
                    className="grid grid-cols-[20px_1fr] gap-3 items-center"
                  >
                    <span className="text-spill-700 dark:text-white/90">
                      {item.icon}
                    </span>
                    <p className="text-left">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-7 flex justify-end gap-3">
              <button
                type="button"
                className="h-11 px-4 rounded-full text-emerald-600 flex items-center font-semibold hover:bg-emerald-50 dark:text-[#23d366] dark:hover:bg-[#1a2027]"
                onClick={() => {
                  setEncryptionPopupOpen(false);
                  dispatch(
                    setPage({
                      target: 'policy',
                      data: { tab: 'privacy' },
                    })
                  );
                }}
              >
                Learn more
              </button>
              <button
                type="button"
                className="h-11 px-7 rounded-full bg-[#23d366] text-white font-semibold hover:brightness-110 dark:text-[#0d1b12]"
                onClick={() => setEncryptionPopupOpen(false)}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
      {group && memberModalOpen && (
        <div
          className="fixed inset-0 z-[180] bg-black/40 backdrop-blur-[1px] flex justify-center items-center px-3"
          aria-hidden
          onClick={() => setMemberModalOpen(false)}
        >
          <div
            className="w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-2xl border border-spill-200 bg-white shadow-2xl dark:bg-spill-900 dark:border-spill-700"
            aria-hidden
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-14 px-4 border-b border-spill-200 dark:border-spill-700 flex items-center justify-between">
              <h2 className="text-base font-bold">Member list</h2>
              <button
                type="button"
                className="p-2 rounded-full hover:bg-spill-100 dark:hover:bg-spill-800"
                onClick={() => setMemberModalOpen(false)}
              >
                <bi.BiX />
              </button>
            </div>
            <div className="p-4 grid gap-3">
              <label className="h-10 px-3 rounded-lg border border-spill-300 dark:border-spill-700 bg-white dark:bg-spill-900 flex items-center gap-2">
                <bi.BiSearch />
                <input
                  type="text"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="Search member"
                  className="w-full bg-transparent text-sm"
                />
              </label>
              {memberModalLoading && (
                <p className="text-sm opacity-70">Loading members...</p>
              )}
              {!memberModalLoading && modalParticipants.length === 0 && (
                <p className="text-sm opacity-70">No member found</p>
              )}
              {!memberModalLoading &&
                modalParticipants.map((elem) => (
                  <div
                    key={`modal-member-${elem.userId}`}
                    className="p-2 rounded-lg border border-spill-200 dark:border-spill-700 grid grid-cols-[auto_1fr_auto] gap-2 items-center cursor-pointer hover:bg-spill-100/50 dark:hover:bg-spill-800/50"
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
                  >
                    <img
                      src={elem.avatar || 'assets/images/default-avatar.png'}
                      alt=""
                      className="w-10 h-10 rounded-full"
                    />
                    <p className="truncate">{elem.fullname}</p>
                    {adminIds.includes(elem.userId) && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full text-white bg-sky-600">
                        Admin
                      </span>
                    )}
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
      {group && reportDialog.open && (
        <div
          className="fixed inset-0 z-[190] bg-black/40 backdrop-blur-[1px] flex justify-center items-center px-3"
          aria-hidden
          onClick={() =>
            setReportDialog({
              open: false,
              reason: '',
              loading: false,
              error: '',
            })
          }
        >
          <div
            className="w-full max-w-md rounded-2xl border border-spill-200 bg-white p-4 shadow-2xl dark:bg-spill-900 dark:border-spill-700"
            aria-hidden
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Report group</h2>
              <button
                type="button"
                className="p-2 rounded-full hover:bg-spill-100 dark:hover:bg-spill-800"
                onClick={() =>
                  setReportDialog({
                    open: false,
                    reason: '',
                    loading: false,
                    error: '',
                  })
                }
              >
                <bi.BiX />
              </button>
            </div>
            <p className="mt-2 text-sm opacity-80">
              Tell us what happened. Your report will be reviewed.
            </p>
            <textarea
              value={reportDialog.reason}
              onChange={(e) =>
                setReportDialog((prev) => ({
                  ...prev,
                  reason: e.target.value,
                }))
              }
              placeholder="Write report reason..."
              rows={5}
              className="mt-3 w-full rounded-xl border border-spill-300 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500 dark:border-spill-700 dark:bg-spill-950"
            />
            {reportDialog.error && (
              <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
                {reportDialog.error}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="h-10 px-4 rounded-lg border border-spill-300 dark:border-spill-700 hover:bg-spill-100 dark:hover:bg-spill-800"
                onClick={() =>
                  setReportDialog({
                    open: false,
                    reason: '',
                    loading: false,
                    error: '',
                  })
                }
                disabled={reportDialog.loading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="h-10 px-4 rounded-lg bg-rose-600 text-white font-semibold hover:bg-rose-700 disabled:opacity-60"
                onClick={submitReportGroup}
                disabled={reportDialog.loading}
              >
                {reportDialog.loading ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          </div>
        </div>
      )}
      {group && permissionModalOpen && (
        <div
          className="fixed inset-0 z-[140] bg-black/40 backdrop-blur-[1px] flex justify-center items-center px-3"
          onClick={() => setPermissionModalOpen(false)}
          aria-hidden
        >
          <div
            className="w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-2xl border border-spill-200 bg-white shadow-2xl dark:bg-spill-900 dark:border-spill-700"
            onClick={(e) => e.stopPropagation()}
            aria-hidden
          >
            <div className="h-14 px-4 border-b border-spill-200 dark:border-spill-700 flex items-center justify-between">
              <h2 className="text-base font-bold">Group Permission Setting</h2>
              <button
                type="button"
                className="p-2 rounded-full hover:bg-spill-100 dark:hover:bg-spill-800"
                onClick={() => setPermissionModalOpen(false)}
              >
                <bi.BiX />
              </button>
            </div>
            <div className="p-4 grid gap-4">
              {permissionRespond && (
                <p className="text-xs text-sky-600 dark:text-sky-400">
                  {permissionRespond}
                </p>
              )}

              <section className="p-3 rounded-xl border border-spill-200 dark:border-spill-700 grid gap-2 bg-slate-50/70 dark:bg-spill-800/60">
                <h3 className="text-sm font-semibold">Member can:</h3>
                {memberPermissionItems.map((item) => (
                  <div
                    key={item.key}
                    className="h-11 px-3 rounded-lg border border-spill-300 dark:border-spill-700 flex items-center justify-between bg-white dark:bg-spill-900"
                  >
                    <span className="text-sm">{item.label}</span>
                    {renderPermissionToggle({
                      checked: !!permissionForm[item.key],
                      id: `permission-toggle-${item.key}`,
                      onClick: () =>
                        setPermissionForm((prev) => ({
                          ...prev,
                          [item.key]: !prev[item.key],
                        })),
                    })}
                  </div>
                ))}
              </section>

              <section className="p-3 rounded-xl border border-spill-200 dark:border-spill-700 grid gap-2 bg-slate-50/70 dark:bg-spill-800/60">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Admin Can:</h3>
                  {permissionForm.adminApprovalRequired && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                      Pending {pendingRequestCount}
                    </span>
                  )}
                </div>
                <div className="h-11 px-3 rounded-lg border border-spill-300 dark:border-spill-700 flex items-center justify-between bg-white dark:bg-spill-900">
                  <span className="text-sm">Approved new Member</span>
                  {renderPermissionToggle({
                    checked: !!permissionForm.adminApprovalRequired,
                    id: 'permission-toggle-admin-approval',
                    onClick: () =>
                      setPermissionForm((prev) => ({
                        ...prev,
                        adminApprovalRequired: !prev.adminApprovalRequired,
                      })),
                  })}
                </div>
              </section>

              <button
                type="button"
                className="h-11 rounded-lg bg-sky-600 text-white font-semibold hover:bg-sky-700 disabled:opacity-60"
                onClick={submitPermissions}
                disabled={savingPermissions}
              >
                {savingPermissions ? 'Saving...' : 'Update Permission'}
              </button>
            </div>
          </div>
        </div>
      )}
      {group &&
        pendingListModalOpen &&
        permissionForm.adminApprovalRequired && (
          <div
            className="fixed inset-0 z-[150] bg-black/40 backdrop-blur-[1px] flex justify-center items-center px-3"
            onClick={() => setPendingListModalOpen(false)}
            aria-hidden
          >
            <div
              className="w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-2xl border border-spill-200 bg-white shadow-2xl dark:bg-spill-900 dark:border-spill-700"
              onClick={(e) => e.stopPropagation()}
              aria-hidden
            >
              <div className="h-14 px-4 border-b border-spill-200 dark:border-spill-700 flex items-center justify-between">
                <h2 className="text-base font-bold">
                  Pending User Requests ({pendingRequestCount})
                </h2>
                <button
                  type="button"
                  className="p-2 rounded-full hover:bg-spill-100 dark:hover:bg-spill-800"
                  onClick={() => setPendingListModalOpen(false)}
                >
                  <bi.BiX />
                </button>
              </div>
              <div className="p-4 grid gap-2">
                {pendingProfiles.length === 0 && (
                  <p className="text-sm opacity-70">No pending users</p>
                )}
                {pendingProfiles.map((pendingUser) => (
                  <div
                    key={pendingUser.userId}
                    className="p-2 rounded-lg border border-spill-300 dark:border-spill-700 grid grid-cols-[auto_1fr_auto] gap-2 items-center"
                  >
                    <img
                      src={pendingUser.avatar}
                      alt=""
                      className="w-10 h-10 rounded-full"
                    />
                    <p className="text-sm truncate">{pendingUser.fullname}</p>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        className="h-8 px-2 rounded-md text-xs bg-emerald-600 text-white"
                        onClick={() => approvePendingMember(pendingUser.userId)}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="h-8 px-2 rounded-md text-xs border border-spill-300 dark:border-spill-700"
                        onClick={() => rejectPendingMember(pendingUser.userId)}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      {group && isMember && canAddParticipants && (
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
