import React from 'react';
import { createPortal } from 'react-dom';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import * as bi from 'react-icons/bi';

import { setSetting } from '../redux/features/user';
import { setPage } from '../redux/features/page';
import { setModal } from '../redux/features/modal';
import { getSetting } from '../api/services/setting.api';

function Setting() {
  const dispatch = useDispatch();

  const setting = useSelector((state) => state.user.setting);
  const page = useSelector((state) => state.page);
  const [appLockDialog, setAppLockDialog] = React.useState({
    open: false,
    mode: 'enable',
    password: '',
    oldPassword: '',
    newPassword: '',
    loading: false,
    error: '',
  });

  const structure = [
    {
      section: '',
      child: [
        {
          target: 'dark',
          title: 'Dark mode',
          desc: null,
          toggle: true,
          icon: <bi.BiBrightnessHalf />,
        },
      ],
    },
    {
      section: 'Account',
      child: [
        {
          target: 'changePass',
          title: 'Change password',
          desc: null,
          toggle: false,
          icon: <bi.BiKey />,
        },
        {
          target: 'deleteAcc',
          title: 'Delete account',
          desc: null,
          toggle: false,
          icon: <bi.BiTrash />,
        },
      ],
    },
    {
      section: 'Chat',
      child: [
        {
          target: 'enterToSend',
          title: 'Enter to send message',
          desc: 'Enter key will send your message.',
          toggle: true,
          icon: <bi.BiPaperPlane />,
        },
        {
          target: 'keepArchived',
          title: 'Keep archived',
          desc: 'Archived chats will remain archived when you receive a new messages.',
          toggle: true,
          icon: <bi.BiArchive />,
        },
      ],
    },
    {
      section: 'Notification',
      child: [
        {
          target: 'mute',
          title: 'Mute',
          desc: 'Turn off notifications for everyone',
          toggle: true,
          icon: <bi.BiBellOff />,
        },
      ],
    },
    {
      section: 'Apps setting',
      child: [
        {
          target: 'appLockEnabled',
          title: 'App lock',
          desc: 'Ask for app password after login before opening chats.',
          toggle: true,
          icon: <bi.BiLockAlt />,
        },
        {
          target: 'appLockPassword',
          title: 'Change app lock password',
          desc: null,
          toggle: false,
          hide: !setting?.appLockEnabled,
          icon: <bi.BiKey />,
        },
      ],
    },
    {
      section: 'Help',
      child: [
        {
          target: 'media',
          title: 'Media',
          desc: 'View all your shared photos, videos, links, and files',
          toggle: false,
          icon: <bi.BiImageAlt />,
        },
        {
          target: 'feedback',
          title: 'Feedback',
          desc: null,
          toggle: false,
          icon: <bi.BiMessageDetail />,
        },
        {
          target: 'terms',
          title: 'Terms & privacy policy',
          desc: null,
          toggle: false,
          icon: <bi.BiCheckShield />,
        },
        {
          target: 'license',
          title: 'License',
          desc: null,
          toggle: false,
          icon: <bi.BiInfoCircle />,
        },
      ],
    },
    {
      section: '',
      child: [
        {
          target: 'logout',
          title: 'Log out',
          desc: null,
          toggle: false,
          icon: <bi.BiLogOut />,
        },
      ],
    },
  ];

  const closeAppLockDialog = () => {
    setAppLockDialog({
      open: false,
      mode: 'enable',
      password: '',
      oldPassword: '',
      newPassword: '',
      loading: false,
      error: '',
    });
  };

  const openAppLockDialog = (mode) => {
    setAppLockDialog({
      open: true,
      mode,
      password: '',
      oldPassword: '',
      newPassword: '',
      loading: false,
      error: '',
    });
  };

  const refreshSettings = async (fallback = null) => {
    const refresh = await getSetting();
    dispatch(setSetting(refresh ?? fallback ?? setting));
  };

  const submitAppLockDialog = async () => {
    try {
      setAppLockDialog((prev) => ({
        ...prev,
        loading: true,
        error: '',
      }));

      if (appLockDialog.mode === 'enable') {
        if (String(appLockDialog.password || '').length < 4) {
          throw new Error('Password must be at least 4 characters');
        }
        await axios.post('/settings/app-lock', {
          password: appLockDialog.password,
        });
      } else if (appLockDialog.mode === 'remove') {
        if (String(appLockDialog.password || '').length < 1) {
          throw new Error('Password is required');
        }
        await axios.delete('/settings/app-lock', {
          data: { password: appLockDialog.password },
        });
      } else {
        if (String(appLockDialog.newPassword || '').length < 4) {
          throw new Error('New password must be at least 4 characters');
        }
        await axios.put('/settings/app-lock/password', {
          oldPassword: appLockDialog.oldPassword,
          newPassword: appLockDialog.newPassword,
        });
      }

      await refreshSettings();
      closeAppLockDialog();
    } catch (error0) {
      setAppLockDialog((prev) => ({
        ...prev,
        loading: false,
        error: error0?.response?.data?.message || error0.message,
      }));
    }
  };

  return (
    <div
      className={`
        ${page.setting ? 'delay-75' : '-translate-x-full'}
        transition duration-200 absolute w-full h-full z-20 select-none grid grid-rows-[auto_1fr] overflow-hidden
        bg-white dark:bg-spill-900 dark:text-white/90
      `}
      id="setting"
    >
      {/* header */}
      <div className="h-16 px-2 flex gap-4 items-center">
        <button
          type="button"
          className="p-2 rounded-full hover:bg-spill-100 dark:hover:bg-spill-800"
          onClick={() => {
            dispatch(setPage({ target: 'setting' }));
          }}
        >
          <bi.BiArrowBack className="text-2xl" />
        </button>
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>
      <div className="pb-16 md:pb-0 grid gap-6 overflow-y-auto scrollbar-thin scrollbar-thumb-spill-200 hover:scrollbar-thumb-spill-300 dark:scrollbar-thumb-spill-700 dark:hover:scrollbar-thumb-spill-600">
        {appLockDialog.open &&
          createPortal(
            <div
              className="fixed inset-0 z-[980] grid place-items-center bg-slate-900/45 px-4"
              aria-hidden
              onClick={closeAppLockDialog}
            >
              <div
                aria-hidden
                className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-spill-700 dark:bg-spill-900"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="text-base font-semibold">
                  {appLockDialog.mode === 'enable' && 'Enable App Lock'}
                  {appLockDialog.mode === 'remove' && 'Remove App Lock'}
                  {appLockDialog.mode === 'change' &&
                    'Change App Lock Password'}
                </h3>
                <p className="mt-1 text-sm opacity-70">
                  {appLockDialog.mode === 'enable' &&
                    'Set a password to unlock app after login.'}
                  {appLockDialog.mode === 'remove' &&
                    'Enter current app lock password to remove lock.'}
                  {appLockDialog.mode === 'change' &&
                    'Update your app lock password.'}
                </p>
                <div className="mt-3 grid gap-2">
                  {(appLockDialog.mode === 'enable' ||
                    appLockDialog.mode === 'remove') && (
                    <label className="h-10 px-3 rounded-lg border border-spill-300 dark:border-spill-700 bg-white dark:bg-spill-900 flex items-center">
                      <input
                        type="password"
                        value={appLockDialog.password}
                        onChange={(e) =>
                          setAppLockDialog((prev) => ({
                            ...prev,
                            password: e.target.value,
                            error: '',
                          }))
                        }
                        placeholder={
                          appLockDialog.mode === 'enable'
                            ? 'New password'
                            : 'Current password'
                        }
                        className="w-full bg-transparent text-sm"
                      />
                    </label>
                  )}
                  {appLockDialog.mode === 'change' && (
                    <>
                      <label className="h-10 px-3 rounded-lg border border-spill-300 dark:border-spill-700 bg-white dark:bg-spill-900 flex items-center">
                        <input
                          type="password"
                          value={appLockDialog.oldPassword}
                          onChange={(e) =>
                            setAppLockDialog((prev) => ({
                              ...prev,
                              oldPassword: e.target.value,
                              error: '',
                            }))
                          }
                          placeholder="Current password"
                          className="w-full bg-transparent text-sm"
                        />
                      </label>
                      <label className="h-10 px-3 rounded-lg border border-spill-300 dark:border-spill-700 bg-white dark:bg-spill-900 flex items-center">
                        <input
                          type="password"
                          value={appLockDialog.newPassword}
                          onChange={(e) =>
                            setAppLockDialog((prev) => ({
                              ...prev,
                              newPassword: e.target.value,
                              error: '',
                            }))
                          }
                          placeholder="New password"
                          className="w-full bg-transparent text-sm"
                        />
                      </label>
                    </>
                  )}
                </div>
                {appLockDialog.error && (
                  <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
                    {appLockDialog.error}
                  </p>
                )}
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    className="h-9 px-3 rounded-lg border border-spill-300 dark:border-spill-700 hover:bg-spill-100 dark:hover:bg-spill-800"
                    onClick={closeAppLockDialog}
                    disabled={appLockDialog.loading}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="h-9 px-3 rounded-lg bg-sky-600 text-white font-semibold hover:bg-sky-700 disabled:opacity-60"
                    onClick={submitAppLockDialog}
                    disabled={appLockDialog.loading}
                  >
                    {appLockDialog.loading ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}
        {setting &&
          structure.map((struct) => (
            <div key={struct.section} className="grid">
              <h1 className="font-bold ml-4">{struct.section}</h1>
              {struct.child.filter((child) => !child.hide).map((child) => (
                <div
                  key={child.target}
                  aria-hidden
                  className="p-4 grid grid-cols-[auto_1fr_auto] items-start gap-6 cursor-pointer border-0 border-b border-solid border-spill-200 dark:border-spill-800 hover:bg-spill-100/60 dark:hover:bg-spill-800/60"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (child.target === 'appLockEnabled') {
                      openAppLockDialog(
                        setting.appLockEnabled ? 'remove' : 'enable'
                      );
                    } else if (child.target === 'appLockPassword') {
                      openAppLockDialog('change');
                    } else if (child.target === 'media') {
                      dispatch(setPage({ target: 'media', data: true }));
                    } else if (child.target === 'terms') {
                      dispatch(
                        setPage({
                          target: 'policy',
                          data: { tab: 'terms' },
                        })
                      );
                    } else if (child.target === 'logout') {
                      dispatch(setModal({ target: 'signout', data: true }));
                    } else {
                      dispatch(setModal({ target: child.target, data: true }));
                    }
                  }}
                >
                  <i>{child.icon}</i>
                  <span>
                    <p>{child.title}</p>
                    {child.desc && (
                      <p className="mt-1 text-sm opacity-60">{child.desc}</p>
                    )}
                  </span>
                  <span className="grid grid-cols-[auto_auto] gap-2 items-center">
                    <i id="spinner" className="animate-spin invisible">
                      <bi.BiLoaderAlt size={18} />
                    </i>
                    {child.toggle && (
                      <button
                        type="button"
                        className={`
                              ${
                                setting[child.target]
                                  ? 'bg-sky-200 dark:bg-sky-400'
                                  : 'bg-spill-200 dark:bg-spill-700'
                              }
                              flex relative p-1 w-10 rounded-full
                            `}
                        onClick={async (e) => {
                          try {
                            e.stopPropagation();
                            const spinner =
                              e.target.parentElement.querySelector('#spinner');
                            spinner.classList.remove('invisible');

                            if (child.target === 'appLockEnabled') {
                              spinner.classList.add('invisible');
                              openAppLockDialog(
                                setting.appLockEnabled ? 'remove' : 'enable'
                              );
                              return;
                            }

                            const update = {
                              [child.target]: !setting[child.target],
                            };

                            dispatch(setSetting({ ...setting, ...update }));

                            await axios.put('/settings', update);

                            await refreshSettings({ ...setting, ...update });

                            spinner.classList.add('invisible');
                          } catch (error0) {
                            console.log(error0.message);
                          }
                        }}
                      >
                        <span
                          className={`
                                ${
                                  setting[child.target]
                                    ? 'bg-sky-600 dark:bg-sky-900 translate-x-4'
                                    : 'bg-spill-600 dark:bg-spill-300'
                                }
                                transition block w-4 h-4 rounded-full pointer-events-none
                              `}
                        ></span>
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          ))}
      </div>
    </div>
  );
}

export default Setting;
