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

function App() {
  const dispatch = useDispatch();
  const { master } = useSelector((state) => state.user);

  const [inactive, setInactive] = useState(false);
  const [loaded, setLoaded] = useState(false);

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
    document.onvisibilitychange = (e) => {
      if (master) {
        const active = e.target.visibilityState === 'visible';
        socket.emit(active ? 'user/connect' : 'user/disconnect', master._id);
      }
    };
  }, [!!master]);

  useEffect(() => {
    if (!master) return undefined;

    // Personal message
    socket.on('message', (msg) => {
      if (document.hidden) {
        showLocalNotification('New Message', `${msg.senderName}: ${msg.text}`);
      }
    });

    // Group message
    socket.on('group-message', (msg) => {
      if (document.hidden) {
        showLocalNotification(
          `New message in ${msg.groupName}`,
          `${msg.senderName}: ${msg.text}`
        );
      }
    });

    // Optional: system notifications
    socket.on('system', (event) => {
      if (document.hidden) {
        showLocalNotification(
          'Notification',
          event.text || 'You have a new update'
        );
      }
    });

    return () => {
      socket.off('message');
      socket.off('group-message');
      socket.off('system');
    };
  }, [master]);

  return (
    <BrowserRouter>
      {loaded ? (
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
