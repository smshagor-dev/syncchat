import React, { useEffect, useState } from 'react';
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
} from '../redux/features/chore';
import { setSetting } from '../redux/features/user';

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

function FriendProfile() {
  const dispatch = useDispatch();
  const {
    chore: { refreshFriendProfile },
    page: { friendProfile },
    user: { setting },
  } = useSelector((state) => state);

  const [profile, setProfile] = useState(null);
  const [actionMessage, setActionMessage] = useState('');
  const profileAvatar =
    resolveUploadUrl(profile?.avatar) || 'assets/images/default-avatar.png';
  const displayName = profile?.fullname || profile?.username || '[inactive]';

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
      if (friendProfile) {
        const { data } = await axios.get(`/profiles/${friendProfile}`, {
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

  useEffect(() => {
    const abortCtrl = new AbortController();
    handleGetProfile(abortCtrl.signal);

    return () => {
      abortCtrl.abort();
    };
  }, [friendProfile, refreshFriendProfile]);

  return (
    <div
      className={`
        ${!friendProfile && 'translate-x-full'}
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
        </div>
        {profile && (
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
      {profile && (
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
              <p className="text-sm opacity-60">
                {profile.online
                  ? 'online'
                  : `last seen ${moment(profile.updatedAt).fromNow()}`}
              </p>
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
          </div>
          <div className="mt-6 grid">
            <button
              type="button"
              className={`py-2 px-4 grid grid-cols-[auto_1fr] gap-4 text-left ${
                profile.blocked
                  ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-600/10 hover:bg-emerald-600/20'
                  : 'text-amber-700 dark:text-amber-300 bg-amber-600/10 hover:bg-amber-600/20'
              }`}
              onClick={(e) => {
                e.stopPropagation();
                handleBlockToggle();
              }}
            >
              <i>{profile.blocked ? <bi.BiLockOpenAlt /> : <bi.BiBlock />}</i>
              <p className="font-bold">
                {profile.blocked ? 'Unblock Contact' : 'Block Contact'}
              </p>
            </button>
            <button
              type="button"
              className="py-2 px-4 grid grid-cols-[auto_1fr] gap-4 text-left text-sky-700 dark:text-sky-300 bg-sky-600/10 hover:bg-sky-600/20"
              onClick={(e) => {
                e.stopPropagation();
                handleShareContact();
              }}
            >
              <i>
                <ri.RiShareForwardLine />
              </i>
              <p className="font-bold">Share Contact</p>
            </button>
            {profile.saved && (
              <button
                type="button"
                className="py-2 px-4 grid grid-cols-[auto_1fr] gap-4 text-left text-rose-600 dark:text-rose-400 bg-rose-600/10 hover:bg-rose-600/20 dark:bg-rose-400/10 dark:hover:bg-rose-400/20"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteContact();
                }}
              >
                <i>
                  <bi.BiTrashAlt />
                </i>
                <p className="font-bold">Delete Contact</p>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default FriendProfile;
