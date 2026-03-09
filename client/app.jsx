import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import * as bi from 'react-icons/bi';
import './style.css';
import * as route from './routes';
import { setMaster, setSetting } from './redux/features/user';
import socket from './helpers/socket';
import config from './config';
import { getSetting } from './api/services/setting.api';
import { showLocalNotification } from './pwa/notifications';

const authDebug = (...args) => {
  if (config.isDev) console.log('[AuthDebug]', ...args);
};

const getAppLockSessionKey = (userId) => `app-lock-unlocked:${userId}`;

function App() {
  const dispatch = useDispatch();
  const { master, setting } = useSelector((state) => state.user);

  const [inactive, setInactive] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [appLockVerified, setAppLockVerified] = useState(true);
  const [bannerNotice, setBannerNotice] = useState(null);
  const [popupNotice, setPopupNotice] = useState(null);
  const [appLockForm, setAppLockForm] = useState({
    password: '',
    loading: false,
    error: '',
  });

  // get access token from localStorage
  const token = localStorage.getItem('token');

  const handleGetMaster = async (signal) => {
    try {
      authDebug('handleGetMaster:start', { hasToken: !!token });

      if (token) {
        // set default authorization
        axios.defaults.headers.Authorization = `Bearer ${token}`;
        authDebug('Authorization header set');
        // get account setting
        const setting = await getSetting({ signal });
        authDebug('settings:response', setting);

        if (setting) {
          dispatch(setSetting(setting));
          authDebug('settings:dispatched');

          const { data } = await axios.get('/users', { signal });
          authDebug('users:response', {
            success: data?.success,
            hasPayload: !!data?.payload,
          });
          // set master
          dispatch(setMaster(data.payload));
          authDebug('master:dispatched', data?.payload?._id);

          if (data?.payload?._id) {
            socket.emit('user/connect', data.payload._id);
            authDebug('socket:user/connect emitted', data.payload._id);
          }
        } else {
          authDebug('settings missing, skipping /users fetch');
        }
      } else {
        authDebug('no token found, routing to auth');
      }
    } catch (error0) {
      console.error(
        '[AuthDebug] handleGetMaster:error',
        error0?.response?.status,
        error0?.response?.data?.message || error0.message
      );
      localStorage.removeItem('token');
      dispatch(setMaster(null));
      authDebug('token cleared, master reset');
    } finally {
      setLoaded(true);
      authDebug('handleGetMaster:done -> loaded=true');
    }
  };

  useEffect(() => {
    const abortCtrl = new AbortController();
    // set default base url
    axios.defaults.baseURL = config.apiBaseUrl;
    if (token) {
      socket.connect();
      authDebug('socket:connect requested');
    } else {
      socket.disconnect();
      authDebug('socket:disconnect (no token)');
    }
    handleGetMaster(abortCtrl.signal);

    socket.on('user/inactivate', () => {
      authDebug('socket:user/inactivate received');
      setInactive(true);
      dispatch(setMaster(null));
    });

    return () => {
      abortCtrl.abort();
      socket.off('user/inactivate');
    };
  }, []);

  useEffect(() => {
    if (!master?._id) return undefined;

    const handleSocketConnect = () => {
      socket.emit('user/connect', master._id);
      authDebug('socket:user/connect emitted on reconnect', master._id);
    };

    socket.on('connect', handleSocketConnect);
    if (socket.connected) {
      handleSocketConnect();
    }

    return () => {
      socket.off('connect', handleSocketConnect);
    };
  }, [master?._id]);

  useEffect(() => {
    document.onvisibilitychange = (e) => {
      if (master) {
        const active = e.target.visibilityState === 'visible';
        socket.emit(active ? 'user/connect' : 'user/disconnect', master._id);
      }
    };
    return undefined;
  }, [!!master]);

  useEffect(() => {
    if (!master) return undefined;
    let bannerTimer = null;
    let popupTimer = null;

    const previewsEnabled = setting?.showNotificationPreviews !== false;
    const muted = setting?.mute === true;
    const canNotifyCategory = (category) => {
      if (muted) return false;
      if (category === 'message') return setting?.notifyMessages !== false;
      if (category === 'group') return setting?.notifyGroups !== false;
      if (category === 'status') return setting?.notifyStatus !== false;
      if (category === 'call') return setting?.notifyCalls !== false;
      return true;
    };
    const emitNotice = ({ category, title, preview, fallback }) => {
      if (!canNotifyCategory(category)) return;

      const body = previewsEnabled ? preview : fallback || 'Open SyncChat to view';

      if (setting?.showPushNotification !== false && document.hidden) {
        showLocalNotification(title, body);
      }

      if (setting?.showNotificationBanner !== false) {
        setBannerNotice({ title, text: body });
        if (bannerTimer) clearTimeout(bannerTimer);
        bannerTimer = setTimeout(() => {
          setBannerNotice(null);
        }, 4500);
      }

      if (setting?.showPopupNotification !== false) {
        setPopupNotice({ title, text: body });
        if (popupTimer) clearTimeout(popupTimer);
        popupTimer = setTimeout(() => {
          setPopupNotice(null);
        }, 5200);
      }
    };

    // Personal message
    socket.on('message', (msg) => {
      emitNotice({
        category: 'message',
        title: 'New message',
        preview: `${msg.senderName}: ${msg.text}`,
        fallback: 'You received a new message',
      });
    });

    // Group message
    socket.on('group-message', (msg) => {
      emitNotice({
        category: 'group',
        title: `New message in ${msg.groupName}`,
        preview: `${msg.senderName}: ${msg.text}`,
        fallback: 'You received a new group message',
      });
    });

    socket.on('status/new', (status) => {
      if (status?.userId === master?._id) return;
      const name = status?.profile?.fullname || status?.profile?.username || 'Someone';
      emitNotice({
        category: 'status',
        title: 'New status',
        preview: `${name} shared a new status`,
        fallback: 'A contact shared a new status',
      });
    });

    socket.on('call/incoming', (call) => {
      if (call?.fromUserId === master?._id) return;
      const fromName = call?.fromName || call?.fromUsername || 'Unknown';
      emitNotice({
        category: 'call',
        title: `${call?.mediaType === 'video' ? 'Video' : 'Voice'} call`,
        preview: `${fromName} is calling you`,
        fallback: 'You have an incoming call',
      });
    });

    // Optional: system notifications
    socket.on('system', (event) => {
      const title =
        event?.type === 'security-notice' ? 'Security notification' : 'Notification';
      emitNotice({
        category: 'system',
        title,
        preview: event.text || 'You have a new update',
        fallback: 'You have a new update',
      });
    });

    return () => {
      if (bannerTimer) clearTimeout(bannerTimer);
      if (popupTimer) clearTimeout(popupTimer);
      socket.off('message');
      socket.off('group-message');
      socket.off('status/new');
      socket.off('call/incoming');
      socket.off('system');
    };
  }, [master, setting]);

  useEffect(() => {
    if (master?.verified && setting?.appLockEnabled) {
      const unlockedInSession =
        sessionStorage.getItem(getAppLockSessionKey(master._id)) === '1';
      setAppLockVerified(unlockedInSession);
    } else {
      setAppLockVerified(true);
      if (master?._id) {
        sessionStorage.removeItem(getAppLockSessionKey(master._id));
      }
    }
  }, [master?._id, master?.verified, setting?.appLockEnabled]);

  const submitAppLock = async (e) => {
    try {
      e.preventDefault();
      setAppLockForm((prev) => ({
        ...prev,
        loading: true,
        error: '',
      }));

      await axios.post('/settings/app-lock/verify', {
        password: appLockForm.password,
      });

      if (master?._id) {
        sessionStorage.setItem(getAppLockSessionKey(master._id), '1');
      }
      setAppLockForm({
        password: '',
        loading: false,
        error: '',
      });
      setAppLockVerified(true);
    } catch (error0) {
      setAppLockForm((prev) => ({
        ...prev,
        loading: false,
        error: error0?.response?.data?.message || error0.message,
      }));
    }
  };

  const needsAppLock =
    !inactive &&
    !!master &&
    !!master.verified &&
    !!setting?.appLockEnabled &&
    !appLockVerified;

  return (
    <BrowserRouter>
      {loaded ? (
        needsAppLock ? (
          <div className="absolute inset-0 grid place-items-center bg-slate-950 px-4 text-slate-100">
            <form
              className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
              onSubmit={submitAppLock}
            >
              <h1 className="text-xl font-bold">App Lock</h1>
              <p className="mt-1 text-sm text-slate-300">
                Enter your app lock password to continue.
              </p>
              <label className="mt-4 flex h-11 items-center rounded-lg border border-slate-600 bg-slate-950 px-3">
                <input
                  type="password"
                  value={appLockForm.password}
                  onChange={(e) =>
                    setAppLockForm((prev) => ({
                      ...prev,
                      password: e.target.value,
                      error: '',
                    }))
                  }
                  placeholder="App lock password"
                  className="w-full bg-transparent text-sm"
                  minLength={4}
                  required
                />
              </label>
              {appLockForm.error && (
                <p className="mt-2 text-xs text-rose-400">{appLockForm.error}</p>
              )}
              <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
                <button
                  type="submit"
                  className="h-10 rounded-lg bg-sky-600 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
                  disabled={appLockForm.loading}
                >
                  {appLockForm.loading ? 'Checking...' : 'Unlock app'}
                </button>
                <button
                  type="button"
                  className="h-10 rounded-lg border border-slate-600 px-3 text-sm hover:bg-slate-800"
                  onClick={() => {
                    if (master?._id) {
                      sessionStorage.removeItem(getAppLockSessionKey(master._id));
                    }
                    localStorage.removeItem('token');
                    window.location.reload();
                  }}
                >
                  Sign out
                </button>
              </div>
            </form>
          </div>
        ) : (
          <>
            {bannerNotice ? (
              <div className="pointer-events-none fixed right-4 top-4 z-[1100] w-[min(360px,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white/95 p-4 text-slate-900 shadow-2xl backdrop-blur dark:border-spill-700 dark:bg-spill-900/95 dark:text-white/90">
                <p className="text-sm font-semibold">{bannerNotice.title}</p>
                <p className="mt-1 text-sm text-slate-600 dark:text-white/65">
                  {bannerNotice.text}
                </p>
              </div>
            ) : null}
            {popupNotice ? (
              <div className="pointer-events-none fixed bottom-4 right-4 z-[1099] w-[min(400px,calc(100vw-2rem))] rounded-3xl border border-slate-200 bg-white p-5 text-slate-900 shadow-[0_18px_40px_rgba(15,23,42,0.22)] dark:border-spill-700 dark:bg-spill-900 dark:text-white/90">
                <p className="text-base font-semibold">{popupNotice.title}</p>
                <p className="mt-2 text-sm text-slate-600 dark:text-white/65">
                  {popupNotice.text}
                </p>
              </div>
            ) : null}
            <Routes>
              {inactive && <Route exact path="*" element={<route.inactive />} />}
              {!inactive && master ? (
                <Route
                  exact
                  path="*"
                  element={master.verified ? <route.chat /> : <route.verify />}
                />
              ) : (
                <Route exact path="*" element={<route.auth />} />
              )}
            </Routes>
          </>
        )
      ) : (
        <div className="absolute w-full h-full flex justify-center items-center bg-white dark:text-white/90 dark:bg-spill-900">
          <div className="flex gap-2 items-center">
            <i className="animate-spin">
              <bi.BiLoaderAlt />
            </i>
            <p>Loading</p>
          </div>
        </div>
      )}
    </BrowserRouter>
  );
}

export default App;
