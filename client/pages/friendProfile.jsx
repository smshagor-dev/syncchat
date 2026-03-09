import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import moment from 'moment';
import axios from 'axios';
import * as bi from 'react-icons/bi';
import * as ri from 'react-icons/ri';
import { v4 as uuidv4 } from 'uuid';

import { setModal } from '../redux/features/modal';
import { setPage } from '../redux/features/page';
import resolveUploadUrl from '../helpers/resolveUploadUrl';
import {
  setRefreshContact,
  setRefreshFriendProfile,
  setRefreshInbox,
} from '../redux/features/chore';
import { setSetting } from '../redux/features/user';
import { setChatRoom } from '../redux/features/room';
import { getPresenceMeta } from '../helpers/presence';
import socket from '../helpers/socket';

const SOCIAL_LABELS = {
  facebook: 'Facebook',
  instagram: 'Instragram',
  whatsapp: 'Whatsapp',
  linkedin: 'Linkdln',
  x: 'X',
  buddy: 'Buddy',
  twitter: 'Twitter',
  rss: 'RSS',
  skype: 'Skype',
  pinterest: 'PINTRST',
  blogger: 'Blogger',
  vimeo: 'Vimo',
  youtube: 'Youtube',
  google_plus: 'Google +',
  website: 'Website',
  others: 'Others',
};

const SOCIAL_ICONS = {
  facebook: <ri.RiFacebookCircleFill size={17} />,
  instagram: <ri.RiInstagramFill size={17} />,
  whatsapp: <ri.RiWhatsappFill size={17} />,
  linkedin: <ri.RiLinkedinBoxFill size={17} />,
  x: <ri.RiTwitterFill size={17} />,
  buddy: (
    <span className="w-[17px] h-[17px] rounded-full bg-sky-600 text-white text-[10px] font-bold flex items-center justify-center">
      B
    </span>
  ),
  twitter: <ri.RiTwitterFill size={17} />,
  rss: <ri.RiRssFill size={17} />,
  skype: <ri.RiSkypeFill size={17} />,
  pinterest: <ri.RiPinterestFill size={17} />,
  blogger: <ri.RiArticleFill size={17} />,
  vimeo: <ri.RiVimeoFill size={17} />,
  youtube: <ri.RiYoutubeFill size={17} />,
  google_plus: <ri.RiGoogleFill size={17} />,
  website: <ri.RiGlobalFill size={17} />,
  others: <ri.RiShareLine size={17} />,
};

const normalizeSocialUrl = (rawUrl = '') => {
  const value = String(rawUrl).trim();
  if (!value) return '';

  const repaired = value.replace(/^(https?)\/\//i, '$1://');
  if (/^https?:\/\//i.test(repaired)) return repaired;
  return `https://${repaired}`;
};

const NOTIFICATION_TONES = [
  { value: 'default-ringtone', label: 'Default ringtone' },
  { value: 'classic-bell', label: 'Classic bell' },
  { value: 'digital-pop', label: 'Digital pop' },
  { value: 'soft-chime', label: 'Soft chime' },
];

function FriendProfile() {
  const dispatch = useDispatch();
  const {
    chore: { refreshFriendProfile, refreshInbox },
    page: { friendProfile },
    user: { setting, master },
    room: { chat: chatRoom },
  } = useSelector((state) => state);
  const friendProfileUserId =
    typeof friendProfile === 'object' && friendProfile !== null
      ? friendProfile.userId
      : friendProfile;
  const friendProfileRoomId =
    typeof friendProfile === 'object' && friendProfile !== null
      ? friendProfile.roomId || null
      : null;
  const resolvedFriendProfileRoomId =
    friendProfileRoomId ||
    (chatRoom?.data?.roomType === 'private' &&
    (chatRoom?.data?.profile?.userId === friendProfileUserId ||
      chatRoom?.data?.ownersId?.includes(friendProfileUserId))
      ? chatRoom.data.roomId
      : null);

  const [profile, setProfile] = useState(null);
  const [actionMessage, setActionMessage] = useState('');
  const [roomMedia, setRoomMedia] = useState({
    loaded: false,
    counts: { media: 0, link: 0, file: 0 },
    photos: [],
  });
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const [privacySubpageOpen, setPrivacySubpageOpen] = useState(false);
  const [encryptionPopupOpen, setEncryptionPopupOpen] = useState(false);
  const [inboxPrefs, setInboxPrefs] = useState({
    loading: false,
    muted: false,
    tone: 'default-ringtone',
    advancedPrivacy: false,
    favourite: false,
    listed: false,
    secretChatEnabled: false,
    secretDisappearSeconds: 0,
    secretScreenshotAlerts: true,
    secretSessionId: '',
    secretForwardBlocked: true,
    secretSaveBlocked: true,
    secretExportBlocked: true,
  });
  const [commonGroups, setCommonGroups] = useState([]);
  const [commonGroupsLoaded, setCommonGroupsLoaded] = useState(false);
  const [reportDialog, setReportDialog] = useState({
    open: false,
    reason: '',
    loading: false,
    error: '',
  });
  const secretSessionRepairRef = useRef('');
  const resolveSecretSessionId = (source, fallback = '') =>
    String(source?.secretSessionId || fallback || '');
  const profileAvatar =
    resolveUploadUrl(profile?.avatar) || 'assets/images/default-avatar.png';
  const displayName = profile?.fullname || profile?.username || '[inactive]';
  const presence = getPresenceMeta(profile);

  const handleAddContact = async () => {
    if (!profile?.username) return;

    try {
      await axios.post('/contacts', { identity: profile.username });
      setProfile((prev) => ({ ...prev, saved: true }));
      setActionMessage('Contact added');
      dispatch(setRefreshContact(uuidv4()));
    } catch (error0) {
      const message = error0?.response?.data?.message || error0.message;
      setActionMessage(message);
    }
  };

  const handleBlockToggle = async () => {
    if (!profile?.userId) return;
    try {
      const endpoint = profile.blocked ? 'unblock' : 'block';
      const { data } = await axios.put(
        `/contacts/${profile.userId}/${endpoint}`
      );

      setProfile((prev) => ({
        ...prev,
        blocked: !prev.blocked,
      }));
      dispatch(
        setSetting({
          ...setting,
          blockedUserIds: data.payload?.blockedUserIds || [],
        })
      );
      setActionMessage(
        profile.blocked ? 'Contact unblocked' : 'Contact blocked'
      );
    } catch (error0) {
      const message = error0?.response?.data?.message || error0.message;
      setActionMessage(message);
    }
  };

  const handleShareContact = () => {
    if (!profile) return;
    const payload = {
      userId: profile.userId,
      username: profile.username,
      fullname: displayName,
      avatar: profile.avatar,
      phone: profile.phone,
      email: profile.email,
    };

    dispatch(
      setModal({
        target: 'shareContact',
        data: payload,
      })
    );
    setTimeout(() => {
      dispatch(
        setModal({
          target: 'shareContact',
          data: payload,
        })
      );
    }, 0);
  };

  const handleDeleteContact = async () => {
    if (!profile?.userId) return;
    const ok = window.confirm('Are you sure you want to delete this contact?');
    if (!ok) return;

    try {
      await axios.delete(`/contacts/${profile.userId}`);
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              saved: false,
              blocked: false,
            }
          : prev
      );
      dispatch(setRefreshContact(uuidv4()));
      dispatch(setRefreshFriendProfile(uuidv4()));
      dispatch(
        setSetting({
          ...setting,
          blockedUserIds: (setting?.blockedUserIds || []).filter(
            (id) => id !== profile.userId
          ),
        })
      );
      setActionMessage('Contact deleted');
    } catch (error0) {
      const message = error0?.response?.data?.message || error0.message;
      setActionMessage(message);
    }
  };

  const handleGetProfile = async (signal) => {
    try {
      // get profile if profile page is opened
      if (friendProfileUserId) {
        const { data } = await axios.get(`/profiles/${friendProfileUserId}`, {
          signal,
        });
        setProfile(data.payload);
      } else {
        // reset when profile page is closed after 150ms
        setTimeout(() => setProfile(null), 150);
      }
    } catch (error0) {
      console.error(error0.message);
    }
  };

  const handleGetRoomMedia = async (signal) => {
    if (!resolvedFriendProfileRoomId) {
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
        params: { roomId: resolvedFriendProfileRoomId },
        signal,
      });
      const payload = Array.isArray(data?.payload) ? data.payload : [];
      const photos = payload
        .filter((item) => item.kind === 'photo' && item?.file?.url)
        .slice(0, 20);
      setRoomMedia({
        loaded: true,
        counts: {
          media: payload.filter((item) => ['photo', 'video'].includes(item.kind))
            .length,
          link: payload.filter((item) => item.kind === 'link').length,
          file: payload.filter((item) => item.kind === 'file').length,
        },
        photos,
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
    if (!resolvedFriendProfileRoomId || !master?._id) {
      setInboxPrefs((prev) => ({
        ...prev,
        loading: false,
      }));
      return;
    }

    try {
      setInboxPrefs((prev) => ({ ...prev, loading: true }));
      const { data } = await axios.get(`/inboxes/${resolvedFriendProfileRoomId}`, {
        signal,
      });
      const inbox = data?.payload || {};

      if (chatRoom?.data?.roomId === resolvedFriendProfileRoomId) {
        dispatch(
          setChatRoom({
            ...chatRoom,
            data: {
              ...chatRoom.data,
              ...inbox,
              secretSessionId: resolveSecretSessionId(
                inbox,
                chatRoom.data?.secretSessionId
              ),
              profile: chatRoom.data.profile,
              group: chatRoom.data.group,
              channel: chatRoom.data.channel,
            },
          })
        );
      }

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
        secretChatEnabled: !!inbox.secretChatEnabled,
        secretDisappearSeconds: Number(inbox.secretDisappearSeconds || 0),
        secretScreenshotAlerts: inbox.secretScreenshotAlerts !== false,
        secretSessionId: resolveSecretSessionId(inbox, chatRoom.data?.secretSessionId),
        secretForwardBlocked: inbox.secretForwardBlocked !== false,
        secretSaveBlocked: inbox.secretSaveBlocked !== false,
        secretExportBlocked: inbox.secretExportBlocked !== false,
      });
    } catch (error0) {
      setInboxPrefs((prev) => ({ ...prev, loading: false }));
      console.error(error0.message);
    }
  };

  const handleGetCommonGroups = async (signal) => {
    if (!friendProfileUserId) {
      setCommonGroups([]);
      setCommonGroupsLoaded(false);
      return;
    }

    try {
      setCommonGroupsLoaded(false);
      const { data } = await axios.get(
        `/profiles/${friendProfileUserId}/common-groups`,
        { signal }
      );
      setCommonGroups(Array.isArray(data?.payload) ? data.payload : []);
    } catch (error0) {
      setCommonGroups([]);
      console.error(error0.message);
    } finally {
      setCommonGroupsLoaded(true);
    }
  };

  const updateInboxPreference = async (action, value) => {
    if (!resolvedFriendProfileRoomId) return;

    try {
      const { data } = await axios.patch(
        `/inboxes/${resolvedFriendProfileRoomId}/preferences`,
        {
          action,
          value,
        }
      );

      const inbox = data?.payload || {};
      if (chatRoom?.data?.roomId === resolvedFriendProfileRoomId) {
        dispatch(
          setChatRoom({
            ...chatRoom,
            data: {
              ...chatRoom.data,
              ...inbox,
              secretSessionId: resolveSecretSessionId(
                inbox,
                chatRoom.data?.secretSessionId
              ),
              profile: chatRoom.data.profile,
              group: chatRoom.data.group,
              channel: chatRoom.data.channel,
            },
          })
        );
      }

      setInboxPrefs((prev) => ({
        ...prev,
        muted:
          Array.isArray(inbox.mutedBy) && inbox.mutedBy.includes(master._id),
        tone:
          inbox?.notificationToneBy?.[master._id] || prev.tone,
        advancedPrivacy:
          Array.isArray(inbox.privacyShieldBy) &&
          inbox.privacyShieldBy.includes(master._id),
        favourite:
          Array.isArray(inbox.favouriteBy) &&
          inbox.favouriteBy.includes(master._id),
        listed:
          Array.isArray(inbox.listedBy) &&
          inbox.listedBy.includes(master._id),
        secretChatEnabled: !!inbox.secretChatEnabled,
        secretDisappearSeconds: Number(inbox.secretDisappearSeconds || 0),
        secretScreenshotAlerts: inbox.secretScreenshotAlerts !== false,
        secretSessionId: resolveSecretSessionId(inbox, prev.secretSessionId),
        secretForwardBlocked: inbox.secretForwardBlocked !== false,
        secretSaveBlocked: inbox.secretSaveBlocked !== false,
        secretExportBlocked: inbox.secretExportBlocked !== false,
      }));

      window.dispatchEvent(
        new CustomEvent('syncchat:room-inbox-update', {
          detail: { roomId: resolvedFriendProfileRoomId, inbox },
        })
      );

      dispatch(setRefreshInbox(uuidv4()));
    } catch (error0) {
      const message = error0?.response?.data?.message || error0.message;
      setActionMessage(message);
    }
  };

  useEffect(() => {
    if (!resolvedFriendProfileRoomId) return;
    if (chatRoom?.data?.roomId !== resolvedFriendProfileRoomId) return;

    setInboxPrefs((prev) => ({
      ...prev,
      muted:
        Array.isArray(chatRoom.data?.mutedBy) &&
        chatRoom.data.mutedBy.includes(master._id),
      tone:
        chatRoom.data?.notificationToneBy?.[master._id] ||
        prev.tone ||
        'default-ringtone',
      advancedPrivacy:
        Array.isArray(chatRoom.data?.privacyShieldBy) &&
        chatRoom.data.privacyShieldBy.includes(master._id),
      favourite:
        Array.isArray(chatRoom.data?.favouriteBy) &&
        chatRoom.data.favouriteBy.includes(master._id),
      listed:
        Array.isArray(chatRoom.data?.listedBy) &&
        chatRoom.data.listedBy.includes(master._id),
      secretChatEnabled: !!chatRoom.data?.secretChatEnabled,
      secretDisappearSeconds: Number(
        chatRoom.data?.secretDisappearSeconds || 0
      ),
      secretScreenshotAlerts: chatRoom.data?.secretScreenshotAlerts !== false,
      secretSessionId: resolveSecretSessionId(chatRoom.data, prev.secretSessionId),
      secretForwardBlocked: chatRoom.data?.secretForwardBlocked !== false,
      secretSaveBlocked: chatRoom.data?.secretSaveBlocked !== false,
      secretExportBlocked: chatRoom.data?.secretExportBlocked !== false,
    }));
  }, [
    resolvedFriendProfileRoomId,
    chatRoom?.data?.roomId,
    chatRoom?.data?.mutedBy,
    chatRoom?.data?.notificationToneBy,
    chatRoom?.data?.privacyShieldBy,
    chatRoom?.data?.favouriteBy,
    chatRoom?.data?.listedBy,
    chatRoom?.data?.secretChatEnabled,
    chatRoom?.data?.secretDisappearSeconds,
    chatRoom?.data?.secretScreenshotAlerts,
    chatRoom?.data?.secretSessionId,
    chatRoom?.data?.secretForwardBlocked,
    chatRoom?.data?.secretSaveBlocked,
    chatRoom?.data?.secretExportBlocked,
    master._id,
  ]);

  useEffect(() => {
    const handleInboxPreferences = (payload) => {
      if (!payload?.roomId || payload.roomId !== resolvedFriendProfileRoomId) return;

      setInboxPrefs((prev) => ({
        ...prev,
        loading: false,
        muted:
          Array.isArray(payload.mutedBy) && payload.mutedBy.includes(master._id),
        tone:
          payload?.notificationToneBy?.[master._id] ||
          prev.tone ||
          'default-ringtone',
        advancedPrivacy:
          Array.isArray(payload.privacyShieldBy) &&
          payload.privacyShieldBy.includes(master._id),
        favourite:
          Array.isArray(payload.favouriteBy) &&
          payload.favouriteBy.includes(master._id),
        listed:
          Array.isArray(payload.listedBy) &&
          payload.listedBy.includes(master._id),
        secretChatEnabled: !!payload.secretChatEnabled,
        secretDisappearSeconds: Number(payload.secretDisappearSeconds || 0),
        secretScreenshotAlerts: payload.secretScreenshotAlerts !== false,
        secretSessionId: resolveSecretSessionId(payload, prev.secretSessionId),
        secretForwardBlocked: payload.secretForwardBlocked !== false,
        secretSaveBlocked: payload.secretSaveBlocked !== false,
        secretExportBlocked: payload.secretExportBlocked !== false,
      }));
    };

    socket.on('inbox/preferences', handleInboxPreferences);
    return () => {
      socket.off('inbox/preferences', handleInboxPreferences);
    };
  }, [resolvedFriendProfileRoomId, master._id]);

  useEffect(() => {
    if (!resolvedFriendProfileRoomId) return;

    const repairKey = `${resolvedFriendProfileRoomId}:${inboxPrefs.secretChatEnabled}:${inboxPrefs.secretSessionId}`;
    if (!inboxPrefs.secretChatEnabled || inboxPrefs.secretSessionId) {
      secretSessionRepairRef.current = '';
      return;
    }
    if (secretSessionRepairRef.current === repairKey) return;

    secretSessionRepairRef.current = repairKey;
    let canceled = false;

    const repairSecretSession = async () => {
      try {
        await axios.patch(`/inboxes/${resolvedFriendProfileRoomId}/preferences`, {
          action: 'secretRegenerateSession',
          value: true,
        });
        if (!canceled) {
          await handleGetInboxPreference();
        }
      } catch (error0) {
        if (!canceled) {
          setActionMessage(
            error0?.response?.data?.message || error0.message || 'Secret session repair failed'
          );
        }
      }
    };

    repairSecretSession();

    return () => {
      canceled = true;
    };
  }, [
    resolvedFriendProfileRoomId,
    inboxPrefs.secretChatEnabled,
    inboxPrefs.secretSessionId,
  ]);

  const SECRET_TIMER_OPTIONS = [
    { value: 0, label: 'Off' },
    { value: 10, label: '10 sec' },
    { value: 30, label: '30 sec' },
    { value: 60, label: '1 min' },
    { value: 300, label: '5 min' },
    { value: 3600, label: '1 hour' },
    { value: 86400, label: '1 day' },
  ];

  useEffect(() => {
    const abortCtrl = new AbortController();
    handleGetProfile(abortCtrl.signal);
    handleGetRoomMedia(abortCtrl.signal);
    handleGetInboxPreference(abortCtrl.signal);
    handleGetCommonGroups(abortCtrl.signal);

    return () => {
      abortCtrl.abort();
    };
  }, [
    friendProfileUserId,
    resolvedFriendProfileRoomId,
    refreshFriendProfile,
    refreshInbox,
    master?._id,
  ]);

  const renderToggle = ({ id, checked, onClick }) => (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      className={`${
        checked
          ? 'bg-gradient-to-r from-sky-500 via-cyan-500 to-teal-500 shadow-sky-500/30'
          : 'bg-slate-300 dark:bg-spill-700 shadow-transparent'
      } relative isolate inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-transparent px-1 shadow-inner transition-all duration-200 ease-out`}
      onClick={onClick}
    >
      <span
        className={`${
          checked ? 'translate-x-5' : 'translate-x-0'
        } pointer-events-none block h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 ease-out`}
      />
    </button>
  );

  const submitReportUser = async () => {
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
        roomId: resolvedFriendProfileRoomId,
        roomType: 'private',
        targetId: profile?.userId,
        reason: reason.slice(0, 500),
      });

      setActionMessage('User reported successfully');
      setReportDialog({
        open: false,
        reason: '',
        loading: false,
        error: '',
      });
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
        ${!friendProfileUserId && 'translate-x-full'}
        transition absolute w-full sm:w-[380px] h-full right-0 z-20 grid grid-rows-[auto_1fr] overflow-hidden
        bg-white dark:bg-spill-900
      `}
    >
      {
        // loading animation
        !profile && (
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
      {/* header */}
      <div className="h-16 px-2 z-10 flex gap-6 justify-between items-center">
        <div className="flex gap-4 items-center">
          {privacySubpageOpen ? (
            <>
              <button
                type="button"
                className="p-2 rounded-full hover:bg-spill-100 dark:hover:bg-spill-800"
                onClick={() => setPrivacySubpageOpen(false)}
              >
                <bi.BiArrowBack />
              </button>
              <h1 className="text-2xl font-bold">Advanced Privacy Chat</h1>
            </>
          ) : (
            <>
              <button
                type="button"
                className="p-2 rounded-full hover:bg-spill-100 dark:hover:bg-spill-800"
                onClick={() => {
                  dispatch(setPage({ target: 'friendProfile' }));
                }}
              >
                <bi.BiArrowBack className="block md:hidden" />
                <bi.BiX className="hidden md:block" />
              </button>
              <h1 className="text-2xl font-bold">Profile</h1>
            </>
          )}
        </div>
        {profile && !privacySubpageOpen && (
          <div className="flex items-center gap-1">
            {!profile.saved && (
              <button
                type="button"
                className="p-2 rounded-full hover:bg-spill-200 dark:hover:bg-spill-800"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddContact();
                }}
                title="Add contact"
              >
                <ri.RiUserAddLine />
              </button>
            )}
            <button
              type="button"
              className="p-2 rounded-full hover:bg-spill-200 dark:hover:bg-spill-800"
              onClick={(e) => {
                e.stopPropagation();
                handleShareContact();
              }}
              title="Share contact"
            >
              <ri.RiShareForwardLine />
            </button>
          </div>
        )}
      </div>
      {profile && !privacySubpageOpen && (
        <div className="pb-16 overflow-y-auto scrollbar-thin scrollbar-thumb-spill-200 hover:scrollbar-thumb-spill-300 dark:scrollbar-thumb-spill-700 dark:hover:scrollbar-thumb-spill-600">
          {actionMessage && (
            <p className="px-4 pt-1 text-xs text-sky-600 dark:text-sky-400">
              {actionMessage}
            </p>
          )}
          <div className="p-4 flex flex-col items-center">
            <img
              src={profileAvatar}
              alt=""
              className="w-28 h-28 rounded-full object-cover cursor-pointer hover:brightness-75"
              aria-hidden
              onClick={(e) => {
                e.stopPropagation();
                dispatch(
                  setModal({
                    target: 'photoFull',
                    data: profileAvatar,
                  })
                );
              }}
            />
            <div className="w-full text-center mt-4 overflow-hidden">
              <h1 className="text-2xl font-bold break-all mb-1">
                {displayName}
              </h1>
              <p className="text-sm opacity-60">{presence.text}</p>
            </div>
          </div>
          <div className="grid">
            {[
              { label: 'Username', data: profile.username, icon: <bi.BiAt /> },
              { label: 'Bio', data: profile.bio, icon: <bi.BiInfoCircle /> },
              { label: 'Phone', data: profile.phone, icon: <bi.BiPhone /> },
              { label: 'Email', data: profile.email, icon: <bi.BiEnvelope /> },
            ].map((elem) => (
              <div
                key={elem.label}
                className="py-2 px-4 grid grid-cols-[auto_1fr_auto] gap-4 items-start border-0 border-b border-solid border-spill-100 dark:border-spill-800"
              >
                <i>{elem.icon}</i>
                <span>
                  <p className="text-sm opacity-60 mb-1">{elem.label}</p>
                  <p className="break-all">{elem.data}</p>
                </span>
              </div>
            ))}
            <div className="py-2 px-4 border-0 border-b border-solid border-spill-100 dark:border-spill-800">
              <p className="text-sm opacity-60 mb-2">Social Account</p>
              {Array.isArray(profile.socialAccounts) &&
              profile.socialAccounts.length > 0 ? (
                <div className="grid gap-2">
                  {profile.socialAccounts.map((item) => (
                    <a
                      key={item.platform}
                      href={normalizeSocialUrl(item.url)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-sky-600 dark:text-sky-400 break-all hover:underline flex items-center gap-2"
                    >
                      <i>
                        {SOCIAL_ICONS[item.platform] || (
                          <ri.RiShareLine size={17} />
                        )}
                      </i>
                      <span>
                        {SOCIAL_LABELS[item.platform] || item.platform}
                      </span>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-sm opacity-60">No social link added</p>
              )}
            </div>
            <div className="py-3 px-4 border-0 border-b border-solid border-spill-100 dark:border-spill-800">
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
                      resolvedFriendProfileRoomId &&
                      dispatch(
                        setPage({
                          target: 'media',
                          data: {
                            roomId: resolvedFriendProfileRoomId,
                            title: displayName,
                            initialTab: item.tab,
                          },
                        })
                      )
                    }
                    disabled={!resolvedFriendProfileRoomId}
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
                    <p className="text-xs opacity-70">No photos in this Chat</p>
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
            <div className="py-3 px-4 border-0 border-b border-solid border-spill-100 dark:border-spill-800">
              <p className="text-sm opacity-60 mb-2">Common relation</p>
              {!commonGroupsLoaded && (
                <p className="text-xs opacity-70">Loading common groups...</p>
              )}
              {commonGroupsLoaded && commonGroups.length === 0 && (
                <p className="text-xs opacity-70">No common group</p>
              )}
              {commonGroupsLoaded && commonGroups.length > 0 && (
                <div className="grid gap-2">
                  {commonGroups.map((groupItem) => (
                    <button
                      key={groupItem._id}
                      type="button"
                      className="p-2 rounded-lg border border-spill-200 dark:border-spill-700 bg-spill-50 dark:bg-spill-900/40 grid grid-cols-[auto_1fr_auto] gap-2 items-center text-left hover:bg-spill-100 dark:hover:bg-spill-800"
                      onClick={() =>
                        dispatch(
                          setPage({
                            target: 'groupProfile',
                            data: {
                              groupId: groupItem._id,
                              roomId: groupItem.roomId,
                              title: groupItem.name,
                            },
                          })
                        )
                      }
                    >
                      <img
                        src={
                          groupItem.avatar ||
                          'assets/images/default-group-avatar.png'
                        }
                        alt=""
                        className="w-10 h-10 rounded-full object-cover"
                      />
                      <span className="truncate">
                        <p className="truncate font-semibold">{groupItem.name}</p>
                        <p className="text-xs opacity-70">
                          {groupItem.totalParticipants} members
                        </p>
                      </span>
                      <bi.BiChevronRight />
                    </button>
                  ))}
                </div>
              )}
            </div>
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
                    {renderToggle({
                      id: 'friend-mute-toggle',
                      checked: inboxPrefs.muted,
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
            <button
              type="button"
              className="py-3 px-4 grid grid-cols-[auto_1fr_auto] gap-3 items-center text-left border-0 border-b border-solid border-spill-100 dark:border-spill-800 hover:bg-spill-50 dark:hover:bg-spill-800/60"
              onClick={() => setPrivacySubpageOpen(true)}
            >
              <i>
                <bi.BiShieldQuarter />
              </i>
              <span className="text-sm">
                <p className="font-medium">Advanced Privacy Chat</p>
                <p className="opacity-70 text-xs">
                  Privacy shield, secret chat, timer, and screenshot alerts.
                </p>
              </span>
              <bi.BiChevronRight />
            </button>
          </div>
          <div className="mt-4 grid">
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
                  if (!resolvedFriendProfileRoomId) return;
                  await axios.post(`/inboxes/${resolvedFriendProfileRoomId}/clear`);
                  setActionMessage('Chat cleared successfully');
                },
              },
              {
                key: 'block',
                label: `${profile.blocked ? 'Unblock' : 'Block'} (${displayName})`,
                icon: profile.blocked ? <bi.BiLockOpenAlt /> : <bi.BiBlock />,
                onClick: handleBlockToggle,
                danger: true,
              },
              {
                key: 'report',
                label: `Report (${displayName})`,
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
              {
                key: 'delete-chat',
                label: 'Delete chat',
                icon: <bi.BiTrashAlt />,
                onClick: async () => {
                  if (!resolvedFriendProfileRoomId) return;
                  await axios.delete(`/chats/${resolvedFriendProfileRoomId}`);
                  setActionMessage('Chat deleted successfully');
                  dispatch(setRefreshInbox(uuidv4()));
                },
                danger: true,
              },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                className={`py-3 px-4 grid grid-cols-[auto_1fr] gap-3 text-left border-0 border-b border-solid border-spill-100 dark:border-spill-800 hover:bg-spill-100/60 dark:hover:bg-spill-800/60 ${
                  item.danger ? 'text-rose-600 dark:text-rose-400' : ''
                }`}
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    await item.onClick();
                  } catch (error0) {
                    setActionMessage(
                      error0?.response?.data?.message || error0.message
                    );
                  }
                }}
              >
                <i>{item.icon}</i>
                <span className="font-semibold">{item.label}</span>
              </button>
            ))}
          </div>
          {encryptionPopupOpen && (
            <div
              className="fixed inset-0 z-[240] bg-black/50 backdrop-blur-[1px] flex justify-center items-center px-3"
              aria-hidden
              onClick={() => setEncryptionPopupOpen(false)}
            >
              <div
                className="w-full max-w-md rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-sky-50 text-spill-900 shadow-2xl px-6 py-7 dark:border-spill-700 dark:bg-gradient-to-br dark:from-spill-900 dark:via-spill-900 dark:to-spill-950 dark:text-spill-50"
                aria-hidden
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex justify-end">
                  <button
                    type="button"
                    className="p-1.5 rounded-full text-spill-500 hover:text-spill-900 hover:bg-slate-100 dark:text-spill-300 dark:hover:text-white dark:hover:bg-spill-800"
                    onClick={() => setEncryptionPopupOpen(false)}
                  >
                    <bi.BiX />
                  </button>
                </div>
                <div className="grid justify-items-center text-center">
                  <div className="w-28 h-20 mb-4 relative">
                    <span className="absolute left-1 top-8 w-9 h-9 rounded-full border-[5px] border-slate-500 dark:border-spill-200" />
                    <span className="absolute left-6 top-11 w-9 h-[5px] bg-slate-500 rotate-45 origin-left rounded-full dark:bg-spill-200" />
                    <span className="absolute left-11 top-3 w-12 h-12 rounded-xl bg-sky-100 border-2 border-sky-200 flex items-center justify-center dark:bg-sky-500/15 dark:border-sky-500/25">
                      <bi.BiLockAlt size={24} className="text-sky-700 dark:text-sky-300" />
                    </span>
                    <span className="absolute right-2 top-8 w-10 h-10 rounded-full bg-gradient-to-br from-sky-500 to-cyan-500 border-2 border-sky-600 flex items-center justify-center dark:border-sky-400/50">
                      <bi.BiTime size={18} className="text-white" />
                    </span>
                    <span className="absolute right-0 bottom-2 w-12 h-3 rounded-full bg-slate-300 dark:bg-spill-300" />
                    <span className="absolute right-4 bottom-1 w-6 h-5 rounded-full bg-gradient-to-r from-sky-500 to-cyan-500 border border-sky-600 dark:border-sky-400/50" />
                  </div>
                  <h2 className="text-[37px] leading-10 font-semibold">
                    Your chats and calls are private
                  </h2>
                  <p className="mt-3 text-[17px] leading-7 text-slate-600 dark:text-spill-200/85">
                    End-to-end encryption keeps your personal messages and calls
                    between you and the people you choose. No one outside of
                    the chat, not even us, can read, listen to, or share them.
                    This includes:
                  </p>
                </div>
                <div className="mt-6 grid gap-4 text-[17px] text-spill-800 dark:text-spill-100">
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
                        <span className="text-sky-700 dark:text-sky-300">
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
                    className="h-11 px-4 rounded-full text-sky-700 flex items-center font-semibold hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-spill-800"
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
                    className="h-11 px-7 rounded-full bg-gradient-to-r from-sky-500 via-cyan-500 to-teal-500 text-white font-semibold hover:brightness-110"
                    onClick={() => setEncryptionPopupOpen(false)}
                  >
                    OK
                  </button>
                </div>
              </div>
            </div>
          )}
          {reportDialog.open && (
            <div
              className="fixed inset-0 z-[245] bg-black/40 backdrop-blur-[1px] flex justify-center items-center px-3"
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
                  <h2 className="text-lg font-bold">Report user</h2>
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
                    onClick={submitReportUser}
                    disabled={reportDialog.loading}
                  >
                    {reportDialog.loading ? 'Submitting...' : 'Submit Report'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {profile && privacySubpageOpen && (
        <div className="pb-10 overflow-y-auto scrollbar-thin scrollbar-thumb-spill-200 hover:scrollbar-thumb-spill-300 dark:scrollbar-thumb-spill-700 dark:hover:scrollbar-thumb-spill-600">
          <div className="px-4 py-3 border-0 border-b border-solid border-spill-100 dark:border-spill-800">
            <p className="text-sm text-slate-600 dark:text-spill-300">
              Choose how this chat protects privacy. Changes are shared in the
              conversation so both people know the protection state.
            </p>
          </div>
          <div className="py-3 px-4 border-0 border-b border-solid border-spill-100 dark:border-spill-800">
            <div className="flex items-center justify-between gap-3">
              <span className="grid grid-cols-[auto_1fr] gap-3 items-center">
                <i>
                  <bi.BiShieldQuarter />
                </i>
                <span className="text-sm">
                  <p className="font-medium">Advanced Privacy Chat</p>
                  <p className="opacity-70 text-xs">
                    Show a privacy shield when screenshot or screen recording is attempted.
                  </p>
                </span>
              </span>
              {renderToggle({
                id: 'friend-advanced-privacy-toggle',
                checked: inboxPrefs.advancedPrivacy,
                onClick: async () => {
                  const next = !inboxPrefs.advancedPrivacy;
                  setInboxPrefs((prev) => ({ ...prev, advancedPrivacy: next }));
                  await updateInboxPreference('advancedPrivacy', next);
                },
              })}
            </div>
          </div>
          <div className="py-3 px-4 border-0 border-b border-solid border-spill-100 dark:border-spill-800">
            <div className="rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-slate-50 p-4 shadow-sm dark:border-spill-700 dark:from-spill-900 dark:via-spill-900 dark:to-spill-950">
              <div className="flex items-start justify-between gap-3">
                <span className="grid grid-cols-[auto_1fr] gap-3 items-start">
                  <span className="mt-0.5 grid h-11 w-11 place-items-center rounded-2xl bg-sky-100 text-sky-700 shadow-inner dark:bg-sky-500/15 dark:text-sky-300">
                    <bi.BiGhost size={20} />
                  </span>
                  <span className="text-sm">
                    <span className="inline-flex items-center gap-2">
                      <p className="font-semibold text-spill-900 dark:text-spill-50">
                        Secret Chat
                      </p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          inboxPrefs.secretChatEnabled
                            ? 'bg-sky-600 text-white dark:bg-sky-500 dark:text-spill-950'
                            : 'bg-slate-200 text-slate-700 dark:bg-spill-800 dark:text-spill-200'
                        }`}
                      >
                        {inboxPrefs.secretChatEnabled ? 'ON' : 'OFF'}
                      </span>
                    </span>
                    <p className="mt-1 max-w-[240px] opacity-70 text-xs leading-5">
                      Uses a separate protected session with disappearing messages
                      and blocked forward, save, and export actions.
                    </p>
                  </span>
                </span>
                {renderToggle({
                  id: 'friend-secret-chat-toggle',
                  checked: inboxPrefs.secretChatEnabled,
                  onClick: async () => {
                    const next = !inboxPrefs.secretChatEnabled;
                    setInboxPrefs((prev) => ({
                      ...prev,
                      secretChatEnabled: next,
                      secretDisappearSeconds: next
                        ? prev.secretDisappearSeconds || 30
                        : 0,
                    }));
                    await updateInboxPreference('secretChat', {
                      enabled: next,
                      disappearSeconds: next
                        ? inboxPrefs.secretDisappearSeconds || 30
                        : 0,
                      screenshotAlerts: true,
                    });
                    await handleGetInboxPreference();
                    setActionMessage(
                      next ? 'Secret chat enabled' : 'Secret chat disabled'
                    );
                  },
                })}
              </div>
            </div>
            {inboxPrefs.secretChatEnabled && (
              <div className="mt-3 grid gap-3">
                <label className="h-10 px-3 rounded-lg border border-spill-200 dark:border-spill-700 bg-slate-50/80 dark:bg-spill-900/60 flex items-center gap-2">
                  <bi.BiTimer />
                  <select
                    id="friend-secret-timer"
                    name="friendSecretTimer"
                    value={inboxPrefs.secretDisappearSeconds}
                    className="w-full bg-transparent text-sm"
                    onChange={async (e) => {
                      const nextTimer = Number(e.target.value || 0);
                      setInboxPrefs((prev) => ({
                        ...prev,
                        secretDisappearSeconds: nextTimer,
                      }));
                      await updateInboxPreference(
                        'secretDisappearSeconds',
                        nextTimer
                      );
                    }}
                  >
                    {SECRET_TIMER_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="h-10 px-3 rounded-lg border border-spill-200 dark:border-spill-700 bg-slate-50/80 dark:bg-spill-900/60 flex items-center justify-between">
                  <span className="text-sm">Screenshot alerts</span>
                  {renderToggle({
                    id: 'friend-secret-alert-toggle',
                    checked: inboxPrefs.secretScreenshotAlerts,
                    onClick: async () => {
                      const next = !inboxPrefs.secretScreenshotAlerts;
                      setInboxPrefs((prev) => ({
                        ...prev,
                        secretScreenshotAlerts: next,
                      }));
                      await updateInboxPreference('secretScreenshotAlerts', next);
                    },
                  })}
                </div>
                <div className="rounded-lg border border-spill-200 bg-slate-50/80 px-3 py-2 text-xs dark:border-spill-700 dark:bg-spill-900/60">
                  <p className="font-semibold">Session ID</p>
                  <p className="mt-1 break-all opacity-80">
                    {inboxPrefs.secretSessionId || 'Pending session'}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="rounded-full bg-slate-200 px-2 py-1 dark:bg-spill-800">
                      Forward blocked
                    </span>
                    <span className="rounded-full bg-slate-200 px-2 py-1 dark:bg-spill-800">
                      Save blocked
                    </span>
                    <span className="rounded-full bg-slate-200 px-2 py-1 dark:bg-spill-800">
                      Export blocked
                    </span>
                  </div>
                  <button
                    type="button"
                    className="mt-3 rounded-full border border-sky-500 px-3 py-1.5 text-sm font-medium text-sky-700 hover:bg-sky-50 dark:border-sky-500 dark:text-sky-300 dark:hover:bg-sky-500/10"
                    onClick={async () => {
                      await updateInboxPreference('secretRegenerateSession', true);
                      await handleGetInboxPreference();
                      setActionMessage('Secret session regenerated');
                    }}
                  >
                    Regenerate session
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default FriendProfile;
