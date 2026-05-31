import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import * as bi from 'react-icons/bi';
import * as md from 'react-icons/md';
import * as ri from 'react-icons/ri';
import { setPage } from '../redux/features/page';
import { setModal } from '../redux/features/modal';
import resolveUploadUrl from '../helpers/resolveUploadUrl';

const SOCIAL_OPTIONS = [
  {
    key: 'facebook',
    label: 'Facebook',
    icon: <ri.RiFacebookCircleFill size={18} />,
  },
  {
    key: 'instagram',
    label: 'Instragram',
    icon: <ri.RiInstagramFill size={18} />,
  },
  { key: 'whatsapp', label: 'Whatsapp', icon: <ri.RiWhatsappFill size={18} /> },
  {
    key: 'linkedin',
    label: 'Linkdln',
    icon: <ri.RiLinkedinBoxFill size={18} />,
  },
  { key: 'x', label: 'X', icon: <ri.RiTwitterFill size={18} /> },
  {
    key: 'buddy',
    label: 'Buddy',
    icon: (
      <span className="w-[18px] h-[18px] rounded-full bg-sky-600 text-white text-[11px] font-bold flex items-center justify-center">
        B
      </span>
    ),
  },
  { key: 'twitter', label: 'Twitter', icon: <ri.RiTwitterFill size={18} /> },
  { key: 'rss', label: 'RSS', icon: <ri.RiRssFill size={18} /> },
  { key: 'skype', label: 'Skype', icon: <ri.RiSkypeFill size={18} /> },
  {
    key: 'pinterest',
    label: 'PINTRST',
    icon: <ri.RiPinterestFill size={18} />,
  },
  { key: 'blogger', label: 'Blogger', icon: <ri.RiArticleFill size={18} /> },
  { key: 'vimeo', label: 'Vimo', icon: <ri.RiVimeoFill size={18} /> },
  { key: 'youtube', label: 'Youtube', icon: <ri.RiYoutubeFill size={18} /> },
  {
    key: 'google_plus',
    label: 'Google +',
    icon: <ri.RiGoogleFill size={18} />,
  },
  { key: 'website', label: 'Website', icon: <ri.RiGlobalFill size={18} /> },
  { key: 'others', label: 'Others', icon: <ri.RiShareLine size={18} /> },
];

function Profile() {
  const dispatch = useDispatch();

  const master = useSelector((state) => state.user.master);
  const page = useSelector((state) => state.page);
  const refreshAvatar = useSelector((state) => state.chore.refreshAvatar);

  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({
    fullname: '',
    username: '',
    bio: '',
    phone: '',
    email: '',
  });
  const [socialAccounts, setSocialAccounts] = useState([]);
  const [socialEditor, setSocialEditor] = useState({
    open: false,
    pickerOpen: false,
    platform: SOCIAL_OPTIONS[0].key,
    url: '',
    saving: false,
    error: '',
  });
  const currentAvatar = resolveUploadUrl(refreshAvatar || profile?.avatar);

  const normalizeSocialUrl = (rawUrl) => {
    const value = rawUrl.trim();
    if (!value) return '';

    // Fix common input like "https//example.com" (missing colon).
    const repaired = value.replace(/^(https?)\/\//i, '$1://');
    if (/^https?:\/\//i.test(repaired)) return repaired;

    // If protocol is missing, default to https.
    return `https://${repaired}`;
  };

  const handleGetProfile = async (signal) => {
    try {
      // get profile if profile page is opened
      if (page.profile) {
        const { data } = await axios.get(`/profiles/${page.profile}`, {
          signal,
        });
        setProfile(data.payload);
        setSocialAccounts(
          Array.isArray(data.payload.socialAccounts)
            ? data.payload.socialAccounts
            : []
        );
      } else {
        // destroy when profile page is closed after 150ms
        setTimeout(() => setProfile(null), 150);
      }
    } catch (error0) {
      console.error(error0.message);
    }
  };

  const handleEditBtn = async (e, elem) => {
    const field = elem.field || elem.label;
    const parent = e.target.parentElement;
    const ctrl = parent.querySelector('[data-edit-control]');
    const editable = ctrl.hasAttribute('contentEditable');

    if (editable) {
      const respond = parent.querySelector('[data-error-respond]');

      if (form[field] !== profile[field]) {
        try {
          // if username not valid
          if (
            field === 'username' &&
            !/^[a-z0-9_-]{3,24}$/.test(form.username)
          ) {
            const errData = {
              message: 'Username is invalid',
            };
            throw errData;
          }

          await axios.put('/profiles', { [field]: form[field] });
        } catch ({ message }) {
          if (respond) {
            respond.classList.remove('hidden');
            respond.innerHTML = message;
          }
          return;
        }
      }
      // remove contentEditable attr
      ctrl.removeAttribute('contentEditable');

      if (respond) {
        respond.classList.add('hidden');
      }
    } else {
      // set contentEditable attr
      ctrl.setAttribute('contentEditable', 'true');
      ctrl.focus();
      ctrl.selectionStart = ctrl.innerText.length;

      setForm((prev) => ({
        ...prev,
        [field]: elem.data,
      }));
    }

    // change border color
    parent.classList[!editable ? 'add' : 'remove'](
      'border-sky-600',
      'dark:border-sky-400'
    );
    // edit-btn icon
    [...e.target.children].forEach((c) => c.classList.toggle('hidden'));
  };

  useEffect(() => {
    const abortCtrl = new AbortController();
    handleGetProfile(abortCtrl.signal);

    return () => {
      abortCtrl.abort();
    };
  }, [page.profile]);

  const upsertSocialAccount = async () => {
    const normalizedUrl = normalizeSocialUrl(socialEditor.url);
    if (!normalizedUrl) {
      setSocialEditor((prev) => ({
        ...prev,
        error: 'URL is required',
      }));
      return;
    }

    try {
      let validUrl;
      try {
        validUrl = new URL(normalizedUrl);
      } catch (error0) {
        throw new Error('Please enter a valid URL');
      }

      setSocialEditor((prev) => ({ ...prev, saving: true, error: '' }));

      const existingIndex = socialAccounts.findIndex(
        (item) => item.platform === socialEditor.platform
      );
      const payloadItem = {
        platform: socialEditor.platform,
        url: validUrl.toString(),
      };

      const next =
        existingIndex > -1
          ? socialAccounts.map((item, index) =>
              index === existingIndex ? payloadItem : item
            )
          : [...socialAccounts, payloadItem];

      await axios.put('/profiles', { socialAccounts: next });
      setSocialAccounts(next);
      setProfile((prev) => ({ ...prev, socialAccounts: next }));
      setSocialEditor((prev) => ({
        ...prev,
        open: false,
        pickerOpen: false,
        url: '',
        saving: false,
        error: '',
      }));
    } catch (error0) {
      setSocialEditor((prev) => ({
        ...prev,
        saving: false,
        error: error0?.response?.data?.message || error0.message,
      }));
    }
  };

  const removeSocialAccount = async (platform) => {
    try {
      const next = socialAccounts.filter((item) => item.platform !== platform);
      await axios.put('/profiles', { socialAccounts: next });
      setSocialAccounts(next);
      setProfile((prev) => ({ ...prev, socialAccounts: next }));
    } catch (error0) {
      console.error(error0.message);
    }
  };

  const getSocialMeta = (platform) =>
    SOCIAL_OPTIONS.find((item) => item.key === platform) || {
      key: platform,
      label: platform,
      icon: <ri.RiShareLine size={18} />,
    };

  return (
    <div
      className={`
        ${page.profile ? 'delay-75' : '-translate-x-full'}
        transition duration-200 absolute w-full h-full z-20 grid grid-rows-[auto_1fr] overflow-hidden
        bg-white dark:bg-spill-900 dark:text-white/90
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
              dispatch(setPage({ target: 'profile' }));
            }}
          >
            <bi.BiArrowBack />
          </button>
          <h1 className="text-2xl font-bold">Profile</h1>
        </div>
        <button
          type="button"
          className="p-2 rounded-full hover:bg-spill-100 dark:hover:bg-spill-800"
          onClick={(e) => {
            e.stopPropagation();
            dispatch(
              setModal({
                target: 'qr',
                data: profile,
              })
            );
          }}
        >
          <bi.BiQr />
        </button>
      </div>
      {profile && (
        <div className="pb-16 overflow-y-auto scrollbar-thin scrollbar-thumb-spill-200 hover:scrollbar-thumb-spill-300 dark:scrollbar-thumb-spill-700 dark:hover:scrollbar-thumb-spill-600">
          <div className="p-4 flex flex-col items-center">
            <button
              type="button"
              className="group relative w-28 h-28 rounded-full overflow-hidden cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                const targetId = master?._id || profile?.userId || null;

                dispatch(
                  setModal({
                    target: 'avatarUpload',
                    data: {
                      targetId,
                      isGroup: false,
                    },
                  })
                );
              }}
            >
              <span className="group-hover:opacity-100 bg-black/40 absolute w-full h-full z-10 opacity-0 flex justify-center items-center">
                <i className="text-white">
                  <md.MdPhotoCamera size={40} />
                </i>
              </span>
              <img
                src={currentAvatar || 'assets/images/default-avatar.png'}
                alt=""
                className="w-full h-full"
              />
            </button>
            <div className="relative flex items-start mt-4 px-10 select-text cursor-text">
              <h1
                data-edit-control
                suppressContentEditableWarning
                className="break-all text-2xl font-bold text-center"
                onInput={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    fullname: e.target.innerText,
                  }))
                }
              >
                {profile.fullname}
              </h1>
              <button
                type="button"
                className="absolute right-0 p-1 rounded-full cursor-pointer hover:bg-spill-100 dark:hover:bg-spill-800"
                onClick={(e) =>
                  handleEditBtn(e, {
                    field: 'fullname',
                    label: 'fullname',
                    data: profile.fullname,
                  })
                }
              >
                <bi.BiPencil size={20} className="pointer-events-none" />
                <bi.BiCheck
                  size={20}
                  className="hidden pointer-events-none text-sky-600 dark:text-sky-400"
                />
              </button>
            </div>
          </div>
          <div className="grid">
            {[
              {
                field: 'username',
                label: 'username',
                data: profile.username,
                desc: 'People will be able to find you by this username and contact you.',
                icon: <bi.BiAt />,
              },
              {
                field: 'fullname',
                label: 'full name',
                data: profile.fullname,
                icon: <bi.BiUser />,
              },
              {
                field: 'bio',
                label: 'bio',
                data: profile.bio,
                icon: <bi.BiInfoCircle />,
              },
              {
                field: 'phone',
                label: 'phone',
                data: profile.phone,
                icon: <bi.BiPhone />,
              },
              {
                field: 'email',
                label: 'email',
                data: profile.email,
                icon: <bi.BiEnvelope />,
              },
            ].map((elem) => (
              <div
                key={elem.field}
                className="py-2 px-4 break-all grid grid-cols-[auto_1fr_auto] gap-4 items-start border-0 border-b border-solid border-spill-100 dark:border-spill-800"
              >
                <i>{elem.icon}</i>
                <span>
                  <p className="text-sm opacity-60 capitalize">{elem.label}</p>
                  <p
                    data-edit-control
                    className="mt-1 w-full select-text"
                    suppressContentEditableWarning
                    aria-hidden
                    onKeyPress={(e) => {
                      if (elem.field === 'phone') {
                        if (!'0123456789'.includes(e.key)) {
                          e.preventDefault();
                        }
                      }
                    }}
                    onInput={(e) => {
                      setForm((prev) => ({
                        ...prev,
                        [elem.field]: e.target.innerText,
                      }));
                    }}
                  >
                    {elem.data}
                  </p>
                  {elem.desc && (
                    <p className="mt-2 text-sm opacity-60">{elem.desc}</p>
                  )}
                  <p
                    data-error-respond
                    className="hidden mt-2 text-sm text-rose-600 dark:text-rose-400"
                  ></p>
                </span>
                {elem.field !== 'email' && (
                  <button
                    type="button"
                    className="p-1 rounded-full hover:bg-spill-100 dark:hover:bg-spill-800"
                    onClick={(e) => handleEditBtn(e, elem)}
                  >
                    <bi.BiPencil size={20} className="pointer-events-none" />
                    <bi.BiCheck
                      size={20}
                      className="hidden pointer-events-none text-sky-600 dark:text-sky-400"
                    />
                  </button>
                )}
              </div>
            ))}
            <div className="py-2 px-4 border-0 border-b border-solid border-spill-100 dark:border-spill-800">
              <div className="grid grid-cols-[1fr_auto] gap-3 items-center">
                <p className="text-sm font-semibold opacity-80">
                  Social Account
                </p>
                <button
                  type="button"
                  className="w-7 h-7 rounded-full flex items-center justify-center bg-sky-600 text-white hover:bg-sky-700"
                  onClick={() =>
                    setSocialEditor((prev) => ({
                      ...prev,
                      open: !prev.open,
                      pickerOpen: false,
                      error: '',
                    }))
                  }
                >
                  <bi.BiPlus />
                </button>
              </div>

              {socialEditor.open && (
                <div className="mt-3 grid gap-2">
                  <p className="text-xs opacity-70">Social Media</p>
                  <div className="relative">
                    <button
                      type="button"
                      className="w-full py-2 px-3 rounded-md border border-spill-300 bg-white dark:bg-spill-900 dark:border-spill-700 flex items-center justify-between gap-3"
                      onClick={() =>
                        setSocialEditor((prev) => ({
                          ...prev,
                          pickerOpen: !prev.pickerOpen,
                        }))
                      }
                    >
                      <span className="flex items-center gap-2 text-sm">
                        <i>{getSocialMeta(socialEditor.platform).icon}</i>
                        <span>
                          {getSocialMeta(socialEditor.platform).label}
                        </span>
                      </span>
                      <bi.BiChevronDown />
                    </button>
                    {socialEditor.pickerOpen && (
                      <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-md border border-spill-300 bg-white dark:bg-spill-900 dark:border-spill-700 shadow-lg">
                        {SOCIAL_OPTIONS.map((item) => (
                          <button
                            key={item.key}
                            type="button"
                            className="w-full px-3 py-2 text-left hover:bg-spill-100 dark:hover:bg-spill-800 flex items-center gap-2"
                            onClick={() =>
                              setSocialEditor((prev) => ({
                                ...prev,
                                platform: item.key,
                                pickerOpen: false,
                              }))
                            }
                          >
                            <i>{item.icon}</i>
                            <span className="text-sm">{item.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="text-xs opacity-70">URL</p>
                  <input
                    id="social-url"
                    name="socialUrl"
                    type="url"
                    placeholder="https://..."
                    className="w-full py-2 px-3 rounded-md border border-spill-300 bg-white dark:bg-spill-900 dark:border-spill-700"
                    value={socialEditor.url}
                    onChange={(e) =>
                      setSocialEditor((prev) => ({
                        ...prev,
                        url: e.target.value,
                      }))
                    }
                  />
                  {socialEditor.error && (
                    <p className="text-xs text-rose-600 dark:text-rose-400">
                      {socialEditor.error}
                    </p>
                  )}
                  <button
                    type="button"
                    className="justify-self-end px-4 py-2 rounded-md bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-60"
                    disabled={socialEditor.saving}
                    onClick={upsertSocialAccount}
                  >
                    {socialEditor.saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              )}

              <div className="mt-3 grid gap-2">
                {socialAccounts.length === 0 && (
                  <p className="text-sm opacity-60">No social account added.</p>
                )}
                {socialAccounts.map((item) => {
                  const meta = getSocialMeta(item.platform);
                  return (
                    <div
                      key={item.platform}
                      className="grid grid-cols-[1fr_auto] gap-3 items-center p-2 rounded-md bg-spill-50 dark:bg-spill-900/40"
                    >
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="min-w-0 flex items-center gap-2 text-sm text-sky-600 dark:text-sky-400"
                      >
                        <i>{meta.icon}</i>
                        <span className="truncate">{meta.label}</span>
                      </a>
                      <button
                        type="button"
                        className="p-1 rounded-full hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-600"
                        onClick={() => removeSocialAccount(item.platform)}
                      >
                        <bi.BiTrash size={16} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Profile;
