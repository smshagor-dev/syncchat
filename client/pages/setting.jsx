import React from 'react';
import { createPortal } from 'react-dom';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import * as bi from 'react-icons/bi';
import * as ri from 'react-icons/ri';
import QRCode from 'qrcode';

import { setSetting } from '../redux/features/user';
import { setPage } from '../redux/features/page';
import { setModal } from '../redux/features/modal';
import { setRefreshInbox } from '../redux/features/chore';
import { getSetting } from '../api/services/setting.api';
import {
  WALLPAPER_PRESETS,
  getWallpaperStyle,
} from '../helpers/roomAppearance';
import { KEYBOARD_SHORTCUT_SECTIONS } from '../helpers/keyboardShortcuts';

const GOOGLE_DRIVE_SESSION_KEY = 'syncchat:google-drive-session';
const RESTORE_SECTION_OPTIONS = [
  {
    value: 'profile',
    title: 'Profile',
    desc: 'Restore fullname, bio, phone, social links, and avatar.',
  },
  {
    value: 'settings',
    title: 'Settings',
    desc: 'Restore privacy, notifications, chats, and device preferences.',
  },
  {
    value: 'contacts',
    title: 'Contacts',
    desc: 'Restore saved contacts that still exist on this server.',
  },
  {
    value: 'statuses',
    title: 'Statuses',
    desc: 'Restore statuses as fresh 24-hour posts.',
  },
];

const loadExternalScript = ({ id, src }) =>
  new Promise((resolve, reject) => {
    const existing = document.getElementById(id);
    if (existing) {
      if (existing.getAttribute('data-loaded') === '1') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => reject(new Error(`Failed to load script: ${src}`)),
        { once: true }
      );
      return;
    }

    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      script.setAttribute('data-loaded', '1');
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.body.appendChild(script);
  });

const readGoogleDriveSession = () => {
  try {
    const raw = localStorage.getItem(GOOGLE_DRIVE_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.accessToken || !parsed?.expiresAt) return null;
    if (new Date(parsed.expiresAt).getTime() <= Date.now()) return null;
    return parsed;
  } catch (error0) {
    return null;
  }
};

function Setting() {
  const dispatch = useDispatch();

  const setting = useSelector((state) => state.user.setting);
  const master = useSelector((state) => state.user.master);
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
  const [twoFactorDialog, setTwoFactorDialog] = React.useState({
    open: false,
    mode: 'enable',
    code: '',
    password: '',
    secret: '',
    qrCode: '',
    loading: false,
    error: '',
  });
  const [privacyDialog, setPrivacyDialog] = React.useState({
    open: false,
    loading: false,
    saving: '',
    error: '',
    blockedContacts: [],
    hiddenChats: [],
    view: 'overview',
  });
  const [accountDialog, setAccountDialog] = React.useState({
    open: false,
    loading: false,
    exportLoading: false,
    exportInfo: null,
    backupPassword: '',
    backupLoading: '',
    backupStatus: null,
    restorePassword: '',
    restoreSelections: RESTORE_SECTION_OPTIONS.map((item) => item.value),
    restoreFile: null,
    restoreLoading: false,
    restoreResult: null,
    error: '',
  });
  const [driveState, setDriveState] = React.useState(() => {
    const session = typeof window !== 'undefined' ? readGoogleDriveSession() : null;
    return {
      clientId: '',
      configured: false,
      loading: false,
      error: '',
      session,
    };
  });
  const [voiceVideoDialog, setVoiceVideoDialog] = React.useState({
    open: false,
    saving: '',
    error: '',
  });
  const [notificationDialog, setNotificationDialog] = React.useState({
    open: false,
    saving: '',
    error: '',
  });
  const [chatsDialog, setChatsDialog] = React.useState({
    open: false,
    saving: '',
    error: '',
  });
  const [shortcutDialog, setShortcutDialog] = React.useState({
    open: false,
  });
  const [deviceDialog, setDeviceDialog] = React.useState({
    open: false,
    loading: false,
    saving: '',
    error: '',
    sessions: [],
  });
  const [deviceLinkDialog, setDeviceLinkDialog] = React.useState({
    open: false,
    loading: false,
    error: '',
    token: '',
    shortCode: '',
    expiresAt: '',
    emailHint: '',
    qrImage: '',
    linkUrl: '',
  });
  const chatWallpaperInputRef = React.useRef(null);
  const restoreArchiveInputRef = React.useRef(null);
  const googleTokenClientRef = React.useRef(null);
  const privacyChoices = [
    { value: 'everyone', label: 'Everyone' },
    { value: 'my_contacts', label: 'My contacts' },
    { value: 'nobody', label: 'Nobody' },
  ];

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
          target: 'accountSettings',
          title: 'Account settings',
          desc: 'Security notifications, account info export, password and delete options.',
          toggle: false,
          icon: <bi.BiUserCircle />,
        },
        {
          target: 'deviceSessions',
          title: 'Devices',
          desc: 'Active devices, remote logout, device details, and suspicious login alerts.',
          toggle: false,
          icon: <bi.BiDevices />,
        },
      ],
    },
    {
      section: 'Privacy',
      child: [
        {
          target: 'privacy',
          title: 'Privacy',
          desc: 'Last seen, profile photo, read receipts, blocked contacts, and more.',
          toggle: false,
          icon: <bi.BiShieldAlt2 />,
        },
      ],
    },
    {
      section: 'Chat',
      child: [
        {
          target: 'chats',
          title: 'Chats',
          desc: 'Wallpaper, media quality, downloads, spell check and more.',
          toggle: false,
          icon: <bi.BiMessageSquareDetail />,
        },
      ],
    },
    {
      section: 'Notification',
      child: [
        {
          target: 'notifications',
          title: 'Notifications',
          desc: 'Banner, popup, push, previews, sound and mute controls.',
          toggle: false,
          icon: <bi.BiBell />,
        },
      ],
    },
    {
      section: 'Voice & Video',
      child: [
        {
          target: 'voiceVideo',
          title: 'Voice & Video',
          desc: 'Auto permission for camera, microphone and speaker.',
          toggle: false,
          icon: <bi.BiVideoRecording />,
        },
      ],
    },
    {
      section: 'Apps setting',
      child: [
        {
          target: 'twoFactorEnabled',
          title: 'Google 2FA',
          desc: 'Use Google Authenticator after login.',
          toggle: true,
          icon: <bi.BiShieldQuarter />,
        },
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
          target: 'keyboardShortcuts',
          title: 'Keyboard shortcuts',
          desc: 'See every supported shortcut and what it does in chat.',
          toggle: false,
          icon: <bi.BiCommand />,
        },
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

  const closeTwoFactorDialog = () => {
    setTwoFactorDialog({
      open: false,
      mode: 'enable',
      code: '',
      password: '',
      secret: '',
      qrCode: '',
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

  const syncDriveSession = React.useCallback((session) => {
    if (session) {
      localStorage.setItem(GOOGLE_DRIVE_SESSION_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(GOOGLE_DRIVE_SESSION_KEY);
    }
    setDriveState((prev) => ({
      ...prev,
      session,
      error: '',
      loading: false,
    }));
  }, []);

  const loadGoogleDriveConfig = React.useCallback(async () => {
    try {
      setDriveState((prev) => ({
        ...prev,
        loading: true,
        error: '',
      }));
      const { data } = await axios.get('/users/social-config');
      setDriveState((prev) => ({
        ...prev,
        loading: false,
        clientId: data?.payload?.googleClientId || '',
        configured: !!data?.payload?.googleClientId,
      }));
    } catch (error0) {
      setDriveState((prev) => ({
        ...prev,
        loading: false,
        configured: false,
        error: error0?.response?.data?.message || error0.message,
      }));
    }
  }, []);

  const ensureGoogleDriveToken = React.useCallback(
    async (interactive = true) => {
      const currentSession = readGoogleDriveSession();
      if (currentSession?.accessToken) {
        setDriveState((prev) => ({
          ...prev,
          session: currentSession,
          error: '',
        }));
        return currentSession.accessToken;
      }

      if (!driveState.clientId) {
        throw new Error('Google Drive is not configured on this server');
      }

      await loadExternalScript({
        id: 'google-identity-services',
        src: 'https://accounts.google.com/gsi/client',
      });

      if (!window.google?.accounts?.oauth2) {
        throw new Error('Google Drive connect is unavailable right now');
      }

      const token = await new Promise((resolve, reject) => {
        const client =
          googleTokenClientRef.current ||
          window.google.accounts.oauth2.initTokenClient({
            client_id: driveState.clientId,
            scope:
              'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email',
            callback: () => {},
          });
        googleTokenClientRef.current = client;

        client.callback = async (response) => {
          if (response?.error) {
            reject(new Error(response.error));
            return;
          }

          try {
            const profileResponse = await fetch(
              'https://www.googleapis.com/oauth2/v3/userinfo',
              {
                headers: {
                  Authorization: `Bearer ${response.access_token}`,
                },
              }
            );
            const profile = await profileResponse.json();
            const session = {
              accessToken: response.access_token,
              expiresAt: new Date(
                Date.now() + Number(response.expires_in || 3600) * 1000
              ).toISOString(),
              email: profile?.email || '',
            };
            syncDriveSession(session);
            resolve(response.access_token);
          } catch (error0) {
            reject(error0);
          }
        };

        client.requestAccessToken({
          prompt: interactive ? 'consent' : '',
        });
      });

      return token;
    },
    [driveState.clientId, syncDriveSession]
  );

  const uploadBackupToGoogleDrive = React.useCallback(
    async ({ blob, fileName }) => {
      const accessToken = await ensureGoogleDriveToken(true);
      const formData = new FormData();
      formData.append(
        'metadata',
        new Blob(
          [
            JSON.stringify({
              name: fileName,
              mimeType: 'application/octet-stream',
            }),
          ],
          { type: 'application/json' }
        )
      );
      formData.append(
        'file',
        new Blob([blob], { type: 'application/octet-stream' }),
        fileName
      );

      const response0 = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          body: formData,
        }
      );

      if (!response0.ok) {
        const errorText = await response0.text();
        throw new Error(errorText || 'Google Drive upload failed');
      }

      return response0.json();
    },
    [ensureGoogleDriveToken]
  );

  const closeAccountDialog = () => {
    if (restoreArchiveInputRef.current) {
      restoreArchiveInputRef.current.value = '';
    }
    setAccountDialog({
      open: false,
      loading: false,
      exportLoading: false,
      exportInfo: null,
      backupPassword: '',
      backupLoading: '',
      backupStatus: null,
      restorePassword: '',
      restoreSelections: RESTORE_SECTION_OPTIONS.map((item) => item.value),
      restoreFile: null,
      restoreLoading: false,
      restoreResult: null,
      error: '',
    });
  };

  const openAccountDialog = async () => {
    try {
      setAccountDialog((prev) => ({
        ...prev,
        open: true,
        loading: true,
        error: '',
      }));
      const { data } = await axios.get('/settings/account-export');
      await loadGoogleDriveConfig();
      setAccountDialog((prev) => ({
        ...prev,
        loading: false,
        exportInfo: data?.payload || null,
      }));
    } catch (error0) {
      setAccountDialog((prev) => ({
        ...prev,
        loading: false,
        error: error0?.response?.data?.message || error0.message,
      }));
    }
  };

  const updateAccountDialogValue = (key, value) => {
    setAccountDialog((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const toggleRestoreSelection = (value) => {
    setAccountDialog((prev) => ({
      ...prev,
      restoreSelections: prev.restoreSelections.includes(value)
        ? prev.restoreSelections.filter((item) => item !== value)
        : [...prev.restoreSelections, value],
    }));
  };

  const disconnectGoogleDrive = () => {
    syncDriveSession(null);
  };

  const connectGoogleDrive = async () => {
    try {
      setDriveState((prev) => ({
        ...prev,
        loading: true,
        error: '',
      }));
      await ensureGoogleDriveToken(true);
    } catch (error0) {
      setDriveState((prev) => ({
        ...prev,
        loading: false,
        error: error0?.message || 'Google Drive connect failed',
      }));
    }
  };

  const parseDownloadFileName = (headerValue = '') => {
    const match = String(headerValue || '').match(/filename="?([^"]+)"?/i);
    return match?.[1] || `syncchat-backup-${Date.now()}.syncbackup`;
  };

  const triggerBrowserDownload = async ({ blob, fileName }) => {
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  };

  const createEncryptedBackup = async (target = 'download') => {
    try {
      if (String(accountDialog.backupPassword || '').length < 8) {
        throw new Error('Backup password must be at least 8 characters');
      }

      setAccountDialog((prev) => ({
        ...prev,
        backupLoading: target,
        backupStatus: null,
        error: '',
      }));

      const response0 = await axios.post(
        '/settings/account-backup',
        {
          passphrase: accountDialog.backupPassword,
        },
        {
          responseType: 'blob',
        }
      );

      const fileName = parseDownloadFileName(
        response0.headers['content-disposition']
      );
      const blob = new Blob([response0.data], {
        type: 'application/octet-stream',
      });

      if (target === 'drive') {
        const driveFile = await uploadBackupToGoogleDrive({ blob, fileName });
        setAccountDialog((prev) => ({
          ...prev,
          backupLoading: '',
          backupStatus: {
            type: 'drive',
            name: driveFile?.name || fileName,
            link: driveFile?.webViewLink || '',
          },
        }));
        return;
      }

      await triggerBrowserDownload({ blob, fileName });
      setAccountDialog((prev) => ({
        ...prev,
        backupLoading: '',
        backupStatus: {
          type: 'download',
          name: fileName,
          link: '',
        },
      }));
    } catch (error0) {
      let message = error0?.response?.data?.message || error0.message;
      if (
        error0?.response?.data instanceof Blob &&
        typeof error0.response.data.text === 'function'
      ) {
        try {
          const parsed = JSON.parse(await error0.response.data.text());
          message = parsed?.message || message;
        } catch (error1) {
          message = message || 'Backup failed';
        }
      }
      setAccountDialog((prev) => ({
        ...prev,
        backupLoading: '',
        error: message,
      }));
    }
  };

  const restoreEncryptedBackup = async () => {
    try {
      if (!accountDialog.restoreFile) {
        throw new Error('Select an encrypted backup archive first');
      }
      if (String(accountDialog.restorePassword || '').length < 8) {
        throw new Error('Backup password must be at least 8 characters');
      }
      if (accountDialog.restoreSelections.length === 0) {
        throw new Error('Select at least one restore section');
      }

      setAccountDialog((prev) => ({
        ...prev,
        restoreLoading: true,
        restoreResult: null,
        error: '',
      }));

      const formData = new FormData();
      formData.append('archive', accountDialog.restoreFile);
      formData.append('passphrase', accountDialog.restorePassword);
      formData.append('selections', accountDialog.restoreSelections.join(','));

      const { data } = await axios.post('/settings/account-restore', formData);
      await refreshSettings();
      setAccountDialog((prev) => ({
        ...prev,
        restoreLoading: false,
        restoreResult: data?.payload || null,
      }));
    } catch (error0) {
      setAccountDialog((prev) => ({
        ...prev,
        restoreLoading: false,
        error: error0?.response?.data?.message || error0.message,
      }));
    }
  };

  const requestAccountInfo = async () => {
    try {
      setAccountDialog((prev) => ({
        ...prev,
        exportLoading: true,
        error: '',
      }));
      const { data } = await axios.post('/settings/account-export');
      setAccountDialog((prev) => ({
        ...prev,
        exportLoading: false,
        exportInfo: {
          email: data?.payload?.email || '',
          expiresAt: data?.payload?.expiresAt || null,
          fileUrl: data?.payload?.fileUrl || '',
        },
      }));
    } catch (error0) {
      setAccountDialog((prev) => ({
        ...prev,
        exportLoading: false,
        error: error0?.response?.data?.message || error0.message,
      }));
    }
  };

  const closePrivacyDialog = () => {
    setPrivacyDialog({
      open: false,
      loading: false,
      saving: '',
      error: '',
      blockedContacts: [],
      hiddenChats: [],
      view: 'overview',
    });
  };

  const closeVoiceVideoDialog = () => {
    setVoiceVideoDialog({
      open: false,
      saving: '',
      error: '',
    });
  };

  const openVoiceVideoDialog = () => {
    setVoiceVideoDialog({
      open: true,
      saving: '',
      error: '',
    });
  };

  const closeNotificationDialog = () => {
    setNotificationDialog({
      open: false,
      saving: '',
      error: '',
    });
  };

  const openNotificationDialog = () => {
    setNotificationDialog({
      open: true,
      saving: '',
      error: '',
    });
  };

  const closeChatsDialog = () => {
    setChatsDialog({
      open: false,
      saving: '',
      error: '',
    });
  };

  const openChatsDialog = () => {
    setChatsDialog({
      open: true,
      saving: '',
      error: '',
    });
  };

  const closeShortcutDialog = () => {
    setShortcutDialog({
      open: false,
    });
  };

  const openShortcutDialog = () => {
    closeAccountDialog();
    closePrivacyDialog();
    closeVoiceVideoDialog();
    closeNotificationDialog();
    closeChatsDialog();
    closeDeviceDialog();
    setShortcutDialog({
      open: true,
    });
  };

  const closeDeviceDialog = () => {
    setDeviceDialog({
      open: false,
      loading: false,
      saving: '',
      error: '',
      sessions: [],
    });
    setDeviceLinkDialog({
      open: false,
      loading: false,
      error: '',
      token: '',
      shortCode: '',
      expiresAt: '',
      emailHint: '',
      qrImage: '',
      linkUrl: '',
    });
  };

  const closeDeviceLinkDialog = () => {
    setDeviceLinkDialog({
      open: false,
      loading: false,
      error: '',
      token: '',
      shortCode: '',
      expiresAt: '',
      emailHint: '',
      qrImage: '',
      linkUrl: '',
    });
  };

  const loadDeviceSessions = async () => {
    const { data } = await axios.get('/settings/device-sessions');
    return Array.isArray(data?.payload) ? data.payload : [];
  };

  const openDeviceDialog = async () => {
    try {
      closeAccountDialog();
      closePrivacyDialog();
      closeVoiceVideoDialog();
      closeNotificationDialog();
      closeChatsDialog();
      closeShortcutDialog();
      setDeviceDialog({
        open: true,
        loading: true,
        saving: '',
        error: '',
        sessions: [],
      });
      const sessions = await loadDeviceSessions();
      setDeviceDialog((prev) => ({
        ...prev,
        loading: false,
        sessions,
      }));
    } catch (error0) {
      setDeviceDialog((prev) => ({
        ...prev,
        loading: false,
        error: error0?.response?.data?.message || error0.message,
      }));
    }
  };

  const logoutDeviceSession = async (sessionId) => {
    try {
      setDeviceDialog((prev) => ({
        ...prev,
        saving: sessionId,
        error: '',
      }));
      await axios.delete(`/settings/device-sessions/${sessionId}`);
      const sessions = await loadDeviceSessions();
      setDeviceDialog((prev) => ({
        ...prev,
        saving: '',
        sessions,
      }));
    } catch (error0) {
      setDeviceDialog((prev) => ({
        ...prev,
        saving: '',
        error: error0?.response?.data?.message || error0.message,
      }));
    }
  };

  const logoutOtherDevices = async () => {
    try {
      setDeviceDialog((prev) => ({
        ...prev,
        saving: 'logout-others',
        error: '',
      }));
      await axios.post('/settings/device-sessions/logout-others');
      const sessions = await loadDeviceSessions();
      setDeviceDialog((prev) => ({
        ...prev,
        saving: '',
        sessions,
      }));
    } catch (error0) {
      setDeviceDialog((prev) => ({
        ...prev,
        saving: '',
        error: error0?.response?.data?.message || error0.message,
      }));
    }
  };

  const signOutCurrentDevice = async () => {
    try {
      setDeviceDialog((prev) => ({
        ...prev,
        saving: 'current',
        error: '',
      }));
      await axios.delete('/settings/device-sessions/current');
    } catch (error0) {
      // fall through to local sign-out
    } finally {
      localStorage.removeItem('token');
      window.location.reload();
    }
  };

  const openDeviceLinkDialog = async () => {
    try {
      setDeviceLinkDialog({
        open: true,
        loading: true,
        error: '',
        token: '',
        shortCode: '',
        expiresAt: '',
        emailHint: '',
        qrImage: '',
        linkUrl: '',
      });
      const { data } = await axios.post('/settings/device-link-request');
      let token = data?.payload?.token || '';
      const shortCode = data?.payload?.shortCode || '';
      let expiresAt = data?.payload?.expiresAt || '';
      let emailHint = data?.payload?.emailHint || '';
      let linkUrl =
        data?.payload?.linkUrl ||
        (token
          ? `${window.location.origin}/?link=${encodeURIComponent(token)}`
          : '');
      let qrImage = data?.payload?.qrImage || '';

      if ((!token || !linkUrl || !qrImage) && shortCode) {
        const infoRes = await axios.post('/users/device-link/info', {
          shortCode,
        });
        token = token || infoRes?.data?.payload?.token || '';
        expiresAt = expiresAt || infoRes?.data?.payload?.expiresAt || '';
        emailHint = emailHint || infoRes?.data?.payload?.emailHint || '';
        linkUrl =
          linkUrl ||
          infoRes?.data?.payload?.linkUrl ||
          (token
            ? `${window.location.origin}/?link=${encodeURIComponent(token)}`
            : '');
        qrImage = qrImage || infoRes?.data?.payload?.qrImage || '';
      }

      if (!qrImage && linkUrl) {
        qrImage = await QRCode.toDataURL(linkUrl, {
          width: 260,
          margin: 2,
        });
      }

      setDeviceLinkDialog({
        open: true,
        loading: false,
        error: '',
        token,
        shortCode,
        expiresAt,
        emailHint,
        qrImage,
        linkUrl,
      });
    } catch (error0) {
      setDeviceLinkDialog((prev) => ({
        ...prev,
        open: true,
        loading: false,
        error: error0?.response?.data?.message || error0.message,
      }));
    }
  };

  const openPrivacyDialog = async () => {
    try {
      setPrivacyDialog((prev) => ({
        ...prev,
        open: true,
        loading: true,
        error: '',
      }));
      const [blockedResponse, hiddenResponse] = await Promise.all([
        axios.get('/settings/blocked-contacts'),
        axios.get('/settings/hidden-chats'),
      ]);
      setPrivacyDialog((prev) => ({
        ...prev,
        loading: false,
        blockedContacts: Array.isArray(blockedResponse?.data?.payload)
          ? blockedResponse.data.payload
          : [],
        hiddenChats: Array.isArray(hiddenResponse?.data?.payload)
          ? hiddenResponse.data.payload
          : [],
        view: 'overview',
      }));
    } catch (error0) {
      setPrivacyDialog((prev) => ({
        ...prev,
        loading: false,
        error: error0?.response?.data?.message || error0.message,
      }));
    }
  };

  React.useEffect(() => {
    if (!page.setting) {
      closeShortcutDialog();
      closeDeviceDialog();
    }
  }, [page.setting]);

  React.useEffect(() => {
    const openFromShortcut = () => {
      if (!page.setting) {
        dispatch(setPage({ target: 'setting', data: true }));
      }
      openShortcutDialog();
    };

    window.addEventListener('syncchat:open-shortcuts', openFromShortcut);
    return () => {
      window.removeEventListener('syncchat:open-shortcuts', openFromShortcut);
    };
  }, [dispatch, page.setting]);

  const updatePrivacySetting = async (update) => {
    const key = Object.keys(update || {})[0] || '';
    const nextSetting = { ...setting, ...update };
    dispatch(setSetting(nextSetting));
    setPrivacyDialog((prev) => ({
      ...prev,
      saving: key,
      error: '',
    }));

    try {
      await axios.put('/settings', update);
      await refreshSettings(nextSetting);
      setPrivacyDialog((prev) => ({
        ...prev,
        saving: '',
      }));
    } catch (error0) {
      dispatch(setSetting(setting));
      setPrivacyDialog((prev) => ({
        ...prev,
        saving: '',
        error: error0?.response?.data?.message || error0.message,
      }));
    }
  };

  const updateVoiceVideoSetting = async (update) => {
    const key = Object.keys(update || {})[0] || '';
    const nextSetting = { ...setting, ...update };
    dispatch(setSetting(nextSetting));
    setVoiceVideoDialog((prev) => ({
      ...prev,
      saving: key,
      error: '',
    }));

    try {
      await axios.put('/settings', update);
      await refreshSettings(nextSetting);
      setVoiceVideoDialog((prev) => ({
        ...prev,
        saving: '',
      }));
    } catch (error0) {
      dispatch(setSetting(setting));
      setVoiceVideoDialog((prev) => ({
        ...prev,
        saving: '',
        error: error0?.response?.data?.message || error0.message,
      }));
    }
  };

  const updateNotificationSetting = async (update) => {
    const key = Object.keys(update || {})[0] || '';
    const nextSetting = { ...setting, ...update };
    dispatch(setSetting(nextSetting));
    setNotificationDialog((prev) => ({
      ...prev,
      saving: key,
      error: '',
    }));

    try {
      await axios.put('/settings', update);
      await refreshSettings(nextSetting);
      setNotificationDialog((prev) => ({
        ...prev,
        saving: '',
      }));
    } catch (error0) {
      dispatch(setSetting(setting));
      setNotificationDialog((prev) => ({
        ...prev,
        saving: '',
        error: error0?.response?.data?.message || error0.message,
      }));
    }
  };

  const updateChatSetting = async (update) => {
    const key = Object.keys(update || {})[0] || '';
    const nextSetting = { ...setting, ...update };
    dispatch(setSetting(nextSetting));
    setChatsDialog((prev) => ({
      ...prev,
      saving: key,
      error: '',
    }));

    try {
      await axios.put('/settings', update);
      await refreshSettings(nextSetting);
      setChatsDialog((prev) => ({
        ...prev,
        saving: '',
      }));
    } catch (error0) {
      dispatch(setSetting(setting));
      setChatsDialog((prev) => ({
        ...prev,
        saving: '',
        error: error0?.response?.data?.message || error0.message,
      }));
    }
  };

  const handleChatWallpaperUpload = (file) => {
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = () => {
      const wallpaperImage = String(reader.result || '');
      if (!wallpaperImage) return;
      updateChatSetting({
        chatWallpaperPreset: 'custom-image',
        chatWallpaperImage: wallpaperImage,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleUnblockContact = async (userId) => {
    try {
      setPrivacyDialog((prev) => ({
        ...prev,
        saving: `unblock-${userId}`,
        error: '',
      }));
      const { data } = await axios.put(`/contacts/${userId}/unblock`);
      const nextBlocked = data?.payload?.blockedUserIds || [];
      const nextSetting = {
        ...setting,
        blockedUserIds: nextBlocked,
      };
      dispatch(setSetting(nextSetting));
      setPrivacyDialog((prev) => ({
        ...prev,
        saving: '',
        blockedContacts: prev.blockedContacts.filter(
          (item) => item.userId !== userId
        ),
      }));
      await refreshSettings(nextSetting);
    } catch (error0) {
      setPrivacyDialog((prev) => ({
        ...prev,
        saving: '',
        error: error0?.response?.data?.message || error0.message,
      }));
    }
  };

  const handleUnhideChat = async (roomId) => {
    try {
      setPrivacyDialog((prev) => ({
        ...prev,
        saving: `unhide-${roomId}`,
        error: '',
      }));
      await axios.patch(`/inboxes/${roomId}/preferences`, {
        action: 'hide',
        value: false,
      });
      window.dispatchEvent(
        new CustomEvent('syncchat:inbox-unhide', {
          detail: { roomId },
        })
      );
      setPrivacyDialog((prev) => ({
        ...prev,
        saving: '',
        hiddenChats: prev.hiddenChats.filter((item) => item.roomId !== roomId),
      }));
      dispatch(setRefreshInbox(crypto.randomUUID()));
    } catch (error0) {
      setPrivacyDialog((prev) => ({
        ...prev,
        saving: '',
        error: error0?.response?.data?.message || error0.message,
      }));
    }
  };

  const openTwoFactorDialog = async (mode) => {
    try {
      if (mode === 'enable') {
        const { data } = await axios.post('/settings/two-factor/setup');
        setTwoFactorDialog({
          open: true,
          mode,
          code: '',
          password: '',
          secret: data.payload.secret,
          qrCode: data.payload.qrCode,
          loading: false,
          error: '',
        });
        return;
      }

      setTwoFactorDialog({
        open: true,
        mode,
        code: '',
        password: '',
        secret: '',
        qrCode: '',
        loading: false,
        error: '',
      });
    } catch (error0) {
      console.log(error0.message);
    }
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

  const submitTwoFactorDialog = async () => {
    try {
      setTwoFactorDialog((prev) => ({
        ...prev,
        loading: true,
        error: '',
      }));

      if (twoFactorDialog.mode === 'enable') {
        await axios.post('/settings/two-factor/enable', {
          code: twoFactorDialog.code,
        });
      } else {
        await axios.post('/settings/two-factor/disable', {
          password: twoFactorDialog.password,
          code: twoFactorDialog.code,
        });
      }

      await refreshSettings();
      closeTwoFactorDialog();
    } catch (error0) {
      setTwoFactorDialog((prev) => ({
        ...prev,
        loading: false,
        error: error0?.response?.data?.message || error0.message,
      }));
    }
  };

  const getHiddenChatTitle = React.useCallback(
    (inbox) => {
      if (inbox?.roomType === 'group') {
        return inbox?.channel?.name || inbox?.group?.name || 'Group';
      }

      const friend = (inbox?.owners || []).find(
        (owner) => owner.userId !== master?._id
      );
      return friend?.fullname || friend?.username || 'Private chat';
    },
    [master?._id]
  );

  const formatSessionDate = React.useCallback((value) => {
    if (!value) return 'Unknown';
    return new Date(value).toLocaleString();
  }, []);

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
                        id="app-lock-password"
                        name="app_lock_password"
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
                          id="app-lock-old-password"
                          name="app_lock_old_password"
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
                          id="app-lock-new-password"
                          name="app_lock_new_password"
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
        {twoFactorDialog.open &&
          createPortal(
            <div
              className="fixed inset-0 z-[980] grid place-items-center bg-slate-900/45 px-4"
              aria-hidden
              onClick={closeTwoFactorDialog}
            >
              <div
                aria-hidden
                className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-spill-700 dark:bg-spill-900"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="text-base font-semibold">
                  {twoFactorDialog.mode === 'enable'
                    ? 'Enable Google 2FA'
                    : 'Disable Google 2FA'}
                </h3>
                <p className="mt-1 text-sm opacity-70">
                  {twoFactorDialog.mode === 'enable'
                    ? 'Scan the QR code with Google Authenticator and enter the 6-digit code.'
                    : 'Enter your password and current authenticator code to disable 2FA.'}
                </p>
                {twoFactorDialog.mode === 'enable' && (
                  <div className="mt-3 grid gap-3 rounded-xl border border-spill-200 p-3 dark:border-spill-700">
                    {twoFactorDialog.qrCode && (
                      <img
                        src={twoFactorDialog.qrCode}
                        alt="Google Authenticator QR"
                        className="mx-auto h-44 w-44 rounded-xl bg-white p-2"
                      />
                    )}
                    <div className="rounded-lg bg-spill-100 px-3 py-2 text-xs dark:bg-spill-800">
                      Secret key: {twoFactorDialog.secret}
                    </div>
                  </div>
                )}
                <div className="mt-3 grid gap-2">
                  {twoFactorDialog.mode === 'disable' && (
                    <label className="h-10 px-3 rounded-lg border border-spill-300 dark:border-spill-700 bg-white dark:bg-spill-900 flex items-center">
                      <input
                        id="two-factor-password"
                        name="two_factor_password"
                        type="password"
                        value={twoFactorDialog.password}
                        onChange={(e) =>
                          setTwoFactorDialog((prev) => ({
                            ...prev,
                            password: e.target.value,
                            error: '',
                          }))
                        }
                        placeholder="Current account password"
                        className="w-full bg-transparent text-sm"
                      />
                    </label>
                  )}
                  <label className="h-10 px-3 rounded-lg border border-spill-300 dark:border-spill-700 bg-white dark:bg-spill-900 flex items-center">
                    <input
                      id="two-factor-code"
                      name="two_factor_code"
                      type="text"
                      inputMode="numeric"
                      value={twoFactorDialog.code}
                      onChange={(e) =>
                        setTwoFactorDialog((prev) => ({
                          ...prev,
                          code: e.target.value.replace(/\D+/g, '').slice(0, 6),
                          error: '',
                        }))
                      }
                      placeholder="6-digit code"
                      className="w-full bg-transparent text-sm"
                    />
                  </label>
                </div>
                {twoFactorDialog.error && (
                  <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
                    {twoFactorDialog.error}
                  </p>
                )}
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    className="h-9 px-3 rounded-lg border border-spill-300 dark:border-spill-700 hover:bg-spill-100 dark:hover:bg-spill-800"
                    onClick={closeTwoFactorDialog}
                    disabled={twoFactorDialog.loading}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="h-9 px-3 rounded-lg bg-sky-600 text-white font-semibold hover:bg-sky-700 disabled:opacity-60"
                    onClick={submitTwoFactorDialog}
                    disabled={twoFactorDialog.loading}
                  >
                    {twoFactorDialog.loading ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}
        <div
          className={`${
            deviceDialog.open ? 'translate-x-0' : '-translate-x-full'
          } absolute inset-0 z-30 grid grid-rows-[auto_1fr] bg-white transition duration-200 dark:bg-spill-900 dark:text-white/90`}
          aria-hidden={!deviceDialog.open}
        >
          <div className="h-16 px-2 flex gap-4 items-center">
            <button
              type="button"
              className="p-2 rounded-full hover:bg-spill-100 dark:hover:bg-spill-800"
              onClick={closeDeviceDialog}
            >
              <bi.BiArrowBack className="text-2xl" />
            </button>
            <h1 className="text-2xl font-bold">Devices</h1>
          </div>
          <div className="pb-16 md:pb-0 overflow-y-auto bg-slate-100 dark:bg-spill-950">
            <div className="mx-auto grid max-w-3xl gap-4 px-3 py-4">
              {deviceDialog.error && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
                  {deviceDialog.error}
                </div>
              )}
              <div className="overflow-hidden rounded-[26px] border border-slate-200 bg-slate-900 text-white shadow-sm dark:border-spill-800 dark:bg-spill-900">
                <div className="px-5 py-5">
                  <p className="text-sm font-semibold uppercase tracking-[0.22em] text-sky-300">
                    Session Manager
                  </p>
                  <h2 className="mt-2 max-w-[14ch] text-3xl font-semibold leading-tight sm:max-w-none sm:text-[29px] sm:leading-8">
                    Control Every Signed in device
                  </h2>
                  <p className="mt-3 max-w-2xl text-[15px] leading-6 text-white/75">
                    Review active devices, remove old sessions remotely, and
                    check suspicious logins based on new devices or new
                    networks.
                  </p>
                </div>
              </div>

              <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm dark:border-spill-800 dark:bg-spill-900">
                <div className="grid gap-3 px-5 py-5 sm:grid-cols-2">
                  <button
                    type="button"
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-sky-500 px-5 text-sm font-semibold text-white hover:bg-sky-600"
                    onClick={openDeviceLinkDialog}
                  >
                    <bi.BiQrScan />
                    Link new device
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-spill-800 dark:hover:bg-spill-700"
                    onClick={logoutOtherDevices}
                    disabled={deviceDialog.saving === 'logout-others'}
                  >
                    {deviceDialog.saving === 'logout-others' ? (
                      <bi.BiLoaderAlt className="animate-spin" />
                    ) : (
                      <bi.BiExit />
                    )}
                    Logout others device
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-rose-500 px-5 text-sm font-semibold text-white hover:bg-rose-600 disabled:opacity-60 sm:col-span-2"
                    onClick={signOutCurrentDevice}
                    disabled={deviceDialog.saving === 'current'}
                  >
                    {deviceDialog.saving === 'current' ? (
                      <bi.BiLoaderAlt className="animate-spin" />
                    ) : (
                      <bi.BiLogOut />
                    )}
                    Signout This Device
                  </button>
                </div>
              </div>

              {deviceDialog.loading ? (
                <div className="rounded-[24px] border border-slate-200 bg-white px-5 py-10 text-center text-sm text-slate-500 shadow-sm dark:border-spill-800 dark:bg-spill-900 dark:text-white/60">
                  <span className="inline-flex items-center gap-2">
                    <bi.BiLoaderAlt className="animate-spin" />
                    Loading active devices...
                  </span>
                </div>
              ) : deviceDialog.sessions.length === 0 ? (
                <div className="rounded-[24px] border border-slate-200 bg-white px-5 py-8 text-sm text-slate-500 shadow-sm dark:border-spill-800 dark:bg-spill-900 dark:text-white/60">
                  No device sessions found.
                </div>
              ) : (
                deviceDialog.sessions.map((session) => (
                  <div
                    key={session._id}
                    className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm dark:border-spill-800 dark:bg-spill-900"
                  >
                    <div className="grid gap-4 px-5 py-4 md:grid-cols-[1fr_auto] md:items-start">
                      <div className="grid gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-lg font-semibold">{session.deviceName}</p>
                          {session.isCurrent && (
                            <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-700 dark:bg-sky-500/20 dark:text-sky-300">
                              This device
                            </span>
                          )}
                          {session.isActive ? (
                            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                              Active
                            </span>
                          ) : (
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-white/10 dark:text-white/65">
                              Logged out
                            </span>
                          )}
                          {session.suspicious && (
                            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                              Suspicious
                            </span>
                          )}
                        </div>
                        <div className="grid gap-1 text-sm text-slate-500 dark:text-white/60">
                          <p>
                            {session.browser || 'Browser'} / {session.os || 'Unknown OS'} /{' '}
                            {session.deviceType || 'device'}
                          </p>
                          <p>
                            {session.locationLabel || 'Unknown location'}
                            {session.ipAddress ? ` (${session.ipAddress})` : ''}
                          </p>
                          <p>Signed in: {formatSessionDate(session.createdAt)}</p>
                          <p>Last active: {formatSessionDate(session.lastSeenAt)}</p>
                          {session.suspiciousReason && (
                            <p className="text-amber-600 dark:text-amber-300">
                              Alert: {session.suspiciousReason}
                            </p>
                          )}
                          {!session.isActive && session.revokedAt && (
                            <p>Logged out: {formatSessionDate(session.revokedAt)}</p>
                          )}
                        </div>
                      </div>
                      {!session.isCurrent && session.isActive ? (
                        <button
                          type="button"
                          className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-rose-200 px-4 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-60 dark:border-rose-900/60 dark:text-rose-300 dark:hover:bg-rose-950/30"
                          onClick={() => logoutDeviceSession(session._id)}
                          disabled={deviceDialog.saving === session._id}
                        >
                          {deviceDialog.saving === session._id ? (
                            <bi.BiLoaderAlt className="animate-spin" />
                          ) : (
                            <bi.BiPowerOff />
                          )}
                          Remote logout
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        {typeof document !== 'undefined'
          ? createPortal(
              <div
                className={`${
                  deviceLinkDialog.open
                    ? 'pointer-events-auto opacity-100'
                    : 'pointer-events-none opacity-0'
                } fixed inset-0 z-[1100] flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-sm transition duration-200`}
                aria-hidden={!deviceLinkDialog.open}
                onClick={closeDeviceLinkDialog}
              >
                <div
                  aria-hidden
                  className={`${
                    deviceLinkDialog.open
                      ? 'translate-y-0 scale-100'
                      : 'translate-y-4 scale-95'
                  } max-h-[calc(100vh-1.5rem)] w-full max-w-4xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl transition duration-200 dark:border-spill-700 dark:bg-spill-900`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-4 dark:border-spill-800 sm:px-5">
                    <div>
                      <h1 className="text-xl font-bold sm:text-2xl">
                        Link a device
                      </h1>
                      <p className="mt-1 text-sm text-slate-500 dark:text-white/60">
                        QR scan + email code + SyncChat Support chat code
                      </p>
                    </div>
                    <button
                      type="button"
                      className="grid h-10 w-10 place-items-center rounded-full hover:bg-slate-100 dark:hover:bg-spill-800"
                      onClick={closeDeviceLinkDialog}
                    >
                      <bi.BiX className="text-2xl" />
                    </button>
                  </div>
                  <div className="max-h-[calc(100vh-6rem)] overflow-y-auto bg-slate-100 px-3 py-4 dark:bg-spill-950 sm:px-4">
                    <div className="mx-auto grid max-w-4xl gap-4">
                      {deviceLinkDialog.error && (
                        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
                          {deviceLinkDialog.error}
                        </div>
                      )}
                      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(280px,0.95fr)]">
                        <div className="overflow-hidden rounded-[26px] border border-slate-200 bg-slate-900 text-white shadow-sm dark:border-spill-800 dark:bg-spill-900">
                          <div className="px-5 py-5">
                            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-sky-300">
                              Companion login
                            </p>
                            <h2 className="mt-2 text-3xl font-semibold leading-tight">
                              Scan QR on the new device
                            </h2>
                            <p className="mt-3 max-w-xl text-[15px] leading-6 text-white/75">
                              Open SyncChat on the new device, scan this QR,
                              then finish verification with one email code and
                              one support-chat code.
                            </p>
                            <div className="mt-6 flex justify-center rounded-[28px] bg-white p-4">
                              {deviceLinkDialog.loading ? (
                                <div className="grid h-[220px] w-[220px] place-items-center text-slate-500 sm:h-[260px] sm:w-[260px]">
                                  <bi.BiLoaderAlt className="animate-spin text-2xl" />
                                </div>
                              ) : deviceLinkDialog.qrImage ? (
                                <img
                                  src={deviceLinkDialog.qrImage}
                                  alt="Link device QR"
                                  className="h-[220px] w-[220px] rounded-2xl sm:h-[260px] sm:w-[260px]"
                                />
                              ) : (
                                <div className="grid h-[220px] w-[220px] place-items-center text-slate-500 sm:h-[260px] sm:w-[260px]">
                                  QR unavailable
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="grid gap-4">
                          <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm dark:border-spill-800 dark:bg-spill-900">
                            <div className="border-b border-slate-200 px-5 py-4 dark:border-spill-800">
                              <p className="text-lg font-semibold">
                                Verification steps
                              </p>
                            </div>
                            <div className="grid gap-4 px-5 py-4 text-sm text-slate-600 dark:text-white/65">
                              <div>
                                <p className="font-semibold text-slate-900 dark:text-white/90">
                                  1. Scan or open the QR link
                                </p>
                                <p className="mt-1 break-all">
                                  {deviceLinkDialog.linkUrl ||
                                    'Preparing secure link...'}
                                </p>
                              </div>
                              <div>
                                <p className="font-semibold text-slate-900 dark:text-white/90">
                                  2. Email code
                                </p>
                                <p className="mt-1">
                                  Sent to{' '}
                                  {deviceLinkDialog.emailHint ||
                                    'your account email'}
                                  .
                                </p>
                              </div>
                              <div>
                                <p className="font-semibold text-slate-900 dark:text-white/90">
                                  3. SyncChat Support chat code
                                </p>
                                <p className="mt-1">
                                  A second code is delivered in your regular
                                  chat list from SyncChat Support.
                                </p>
                              </div>
                            </div>
                          </div>
                          <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm dark:border-spill-800 dark:bg-spill-900">
                            <div className="border-b border-slate-200 px-5 py-4 dark:border-spill-800">
                              <p className="text-lg font-semibold">
                                Short code
                              </p>
                            </div>
                            <div className="px-5 py-5">
                              <div className="rounded-2xl bg-slate-100 px-4 py-4 text-center dark:bg-spill-950">
                                <p className="text-2xl font-bold tracking-[0.22em] text-slate-900 dark:text-white/90 sm:text-3xl sm:tracking-[0.28em]">
                                  {deviceLinkDialog.shortCode || '------'}
                                </p>
                              </div>
                              <p className="mt-3 text-sm text-slate-500 dark:text-white/60">
                                Expires at{' '}
                                {deviceLinkDialog.expiresAt
                                  ? new Date(
                                      deviceLinkDialog.expiresAt
                                    ).toLocaleString()
                                  : '...'}
                              </p>
                              <button
                                type="button"
                                className="mt-4 inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 px-4 text-sm font-semibold hover:bg-slate-50 dark:border-spill-700 dark:hover:bg-spill-800"
                                onClick={openDeviceLinkDialog}
                                disabled={deviceLinkDialog.loading}
                              >
                                {deviceLinkDialog.loading ? (
                                  <bi.BiLoaderAlt className="animate-spin" />
                                ) : (
                                  <bi.BiRefresh />
                                )}
                                Refresh QR and codes
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>,
              document.body
            )
          : null}
        <div
          className={`${
            accountDialog.open ? 'translate-x-0' : '-translate-x-full'
          } absolute inset-0 z-30 grid grid-rows-[auto_1fr] bg-white transition duration-200 dark:bg-spill-900 dark:text-white/90`}
        >
          <div className="h-16 px-2 flex gap-4 items-center">
            <button
              type="button"
              className="p-2 rounded-full hover:bg-spill-100 dark:hover:bg-spill-800"
              onClick={closeAccountDialog}
            >
              <bi.BiArrowBack className="text-2xl" />
            </button>
            <h1 className="text-2xl font-bold">Account settings</h1>
          </div>
          <div className="pb-16 md:pb-0 overflow-y-auto bg-slate-100 dark:bg-spill-950">
            <div className="mx-auto grid max-w-2xl gap-4 px-3 py-4">
              {accountDialog.error && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
                  {accountDialog.error}
                </div>
              )}
              <div className="overflow-hidden rounded-[26px] border border-slate-200 bg-slate-900 text-white shadow-sm dark:border-spill-800 dark:bg-spill-900">
                <div className="px-5 py-5">
                  <div className="mb-5 flex items-start gap-4">
                    <div className="relative h-20 w-24 flex-none">
                      <span className="absolute left-0 top-2 h-11 w-16 rounded-2xl bg-sky-100 dark:bg-sky-100" />
                      <span className="absolute left-3 top-0 h-12 w-16 rounded-tl-3xl rounded-tr-xl rounded-br-2xl rounded-bl-xl bg-sky-100 dark:bg-sky-100" />
                      <span className="absolute left-7 top-8 h-0.5 w-10 bg-sky-900/45" />
                      <span className="absolute left-7 top-[42px] h-0.5 w-8 bg-sky-900/45" />
                      <span className="absolute right-1 top-4 grid h-12 w-12 place-items-center rounded-2xl bg-sky-500">
                        <bi.BiLockAlt size={26} className="text-white" />
                      </span>
                    </div>
                    <div>
                      <h2 className="text-[29px] font-semibold leading-8">
                        Your chats and calls are private
                      </h2>
                      <p className="mt-3 text-[15px] leading-6 text-white/80">
                        End-to-end encryption keeps your personal messages and
                        calls between you and the people you choose.
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-4 text-[15px] text-white/92">
                    {[
                      ['Text and voice messages', bi.BiMessageDetail],
                      ['Audio and video calls', bi.BiPhoneCall],
                      ['Photos, videos and documents', bi.BiImage],
                      ['Location sharing', bi.BiMapPin],
                      ['Status updates', bi.BiInfoCircle],
                    ].map(([label, Icon]) => (
                      <div
                        key={label}
                        className="grid grid-cols-[20px_1fr] items-center gap-3"
                      >
                        <Icon size={18} />
                        <p>{label}</p>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="mt-6 text-[15px] font-semibold text-sky-300 hover:underline dark:text-sky-400"
                    onClick={() =>
                      dispatch(
                        setPage({
                          target: 'policy',
                          data: { tab: 'privacy' },
                        })
                      )
                    }
                  >
                    Learn more
                  </button>
                </div>
                <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 border-t border-white/10 px-5 py-5">
                  <i className="text-white/85">
                    <bi.BiLockAlt size={22} />
                  </i>
                  <span>
                    <p className="font-medium">
                      Show security notifications on this computer
                    </p>
                    <p className="mt-1 text-sm text-white/60">
                      Get notified when your security code changes for a contact&apos;s
                      phone.
                    </p>
                  </span>
                  <button
                    type="button"
                    className={`${
                      setting?.securityNotificationsEnabled
                        ? 'bg-sky-500'
                        : 'bg-white/25 dark:bg-white/20'
                    } relative h-8 w-14 rounded-full p-1 transition`}
                    onClick={() =>
                      updatePrivacySetting({
                        securityNotificationsEnabled:
                          !setting?.securityNotificationsEnabled,
                      })
                    }
                  >
                    <span
                      className={`${
                        setting?.securityNotificationsEnabled
                          ? 'translate-x-6 bg-white'
                          : 'translate-x-0 bg-slate-100'
                      } block h-6 w-6 rounded-full transition`}
                    />
                  </button>
                </div>
              </div>

              <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm dark:border-spill-800 dark:bg-[#202c33]">
                <div className="border-b border-slate-100 px-5 py-4 dark:border-spill-800">
                  <div className="grid gap-2 md:grid-cols-[1fr_auto] md:items-center">
                    <span>
                      <p className="font-medium">Encrypted backup</p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-[#8696a0]">
                        Create a password-protected backup archive and download it or send it to your own Google Drive.
                      </p>
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 px-4 text-sm font-medium hover:bg-slate-50 dark:border-spill-700 dark:hover:bg-spill-800"
                        onClick={
                          driveState.session?.accessToken
                            ? disconnectGoogleDrive
                            : connectGoogleDrive
                        }
                        disabled={!driveState.configured || driveState.loading}
                      >
                        {driveState.loading ? (
                          <bi.BiLoaderAlt className="animate-spin" />
                        ) : (
                          <bi.BiCloud />
                        )}
                        {driveState.session?.accessToken
                          ? 'Disconnect Drive'
                          : 'Connect Drive'}
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3">
                    <label className="grid gap-2">
                      <span className="text-sm font-medium">
                        Backup password
                      </span>
                      <input
                        type="password"
                        value={accountDialog.backupPassword}
                        onChange={(e) =>
                          updateAccountDialogValue(
                            'backupPassword',
                            e.target.value
                          )
                        }
                        placeholder="At least 8 characters"
                        className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-sky-400 dark:border-spill-700 dark:bg-spill-950"
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="inline-flex h-10 items-center gap-2 rounded-full bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
                        onClick={() => createEncryptedBackup('download')}
                        disabled={!!accountDialog.backupLoading}
                      >
                        {accountDialog.backupLoading === 'download' ? (
                          <bi.BiLoaderAlt className="animate-spin" />
                        ) : (
                          <bi.BiDownload />
                        )}
                        Download backup
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 px-4 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60 dark:border-spill-700 dark:hover:bg-spill-800"
                        onClick={() => createEncryptedBackup('drive')}
                        disabled={
                          !!accountDialog.backupLoading || !driveState.configured
                        }
                      >
                        {accountDialog.backupLoading === 'drive' ? (
                          <bi.BiLoaderAlt className="animate-spin" />
                        ) : (
                          <ri.RiGoogleFill />
                        )}
                        Save to Google Drive
                      </button>
                    </div>
                    <div className="grid gap-1 text-xs">
                      <p className="text-slate-500 dark:text-[#8696a0]">
                        {driveState.configured
                          ? driveState.session?.email
                            ? `Drive connected for this session as ${driveState.session.email}.`
                            : 'Connect Drive to upload the backup directly to your Google Drive.'
                          : 'Google Drive connect is unavailable until GOOGLE_CLIENT_ID is configured on the server.'}
                      </p>
                      {accountDialog.backupStatus?.type === 'download' && (
                        <p className="text-emerald-600 dark:text-emerald-400">
                          Encrypted backup downloaded as {accountDialog.backupStatus.name}.
                        </p>
                      )}
                      {accountDialog.backupStatus?.type === 'drive' && (
                        <p className="text-emerald-600 dark:text-emerald-400">
                          Backup uploaded to Google Drive as{' '}
                          {accountDialog.backupStatus.link ? (
                            <a
                              href={accountDialog.backupStatus.link}
                              target="_blank"
                              rel="noreferrer"
                              className="font-semibold underline"
                            >
                              {accountDialog.backupStatus.name}
                            </a>
                          ) : (
                            accountDialog.backupStatus.name
                          )}
                          .
                        </p>
                      )}
                      {driveState.error && (
                        <p className="text-rose-600 dark:text-rose-400">
                          {driveState.error}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="border-b border-slate-100 px-5 py-4 dark:border-spill-800">
                  <div className="grid gap-2">
                    <p className="font-medium">Restore from uploaded archive</p>
                    <p className="text-sm text-slate-500 dark:text-[#8696a0]">
                      Upload an encrypted backup archive, enter its password, and choose which parts to restore.
                    </p>
                  </div>
                  <div className="mt-4 grid gap-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        ref={restoreArchiveInputRef}
                        type="file"
                        accept=".syncbackup,.json,.bin,.backup"
                        className="hidden"
                        onChange={(e) =>
                          updateAccountDialogValue(
                            'restoreFile',
                            e.target.files?.[0] || null
                          )
                        }
                      />
                      <button
                        type="button"
                        className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 px-4 text-sm font-medium hover:bg-slate-50 dark:border-spill-700 dark:hover:bg-spill-800"
                        onClick={() => restoreArchiveInputRef.current?.click()}
                      >
                        <bi.BiUpload />
                        Choose archive
                      </button>
                      {accountDialog.restoreFile && (
                        <span className="text-sm text-slate-500 dark:text-[#8696a0]">
                          {accountDialog.restoreFile.name}
                        </span>
                      )}
                    </div>

                    <label className="grid gap-2">
                      <span className="text-sm font-medium">
                        Backup password
                      </span>
                      <input
                        type="password"
                        value={accountDialog.restorePassword}
                        onChange={(e) =>
                          updateAccountDialogValue(
                            'restorePassword',
                            e.target.value
                          )
                        }
                        placeholder="Enter the archive password"
                        className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-sky-400 dark:border-spill-700 dark:bg-spill-950"
                      />
                    </label>

                    <div className="grid gap-3 md:grid-cols-2">
                      {RESTORE_SECTION_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={`rounded-[22px] border px-4 py-4 text-left transition ${
                            accountDialog.restoreSelections.includes(option.value)
                              ? 'border-sky-300 bg-sky-50 dark:border-sky-500/50 dark:bg-sky-500/10'
                              : 'border-slate-200 bg-slate-50 hover:bg-slate-100 dark:border-spill-700 dark:bg-spill-950 dark:hover:bg-spill-800'
                          }`}
                          onClick={() => toggleRestoreSelection(option.value)}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <span>
                              <p className="font-medium">{option.title}</p>
                              <p className="mt-1 text-sm text-slate-500 dark:text-[#8696a0]">
                                {option.desc}
                              </p>
                            </span>
                            <span
                              className={`mt-1 grid h-5 w-5 place-items-center rounded-full border ${
                                accountDialog.restoreSelections.includes(option.value)
                                  ? 'border-sky-500 bg-sky-500 text-white'
                                  : 'border-slate-300'
                              }`}
                            >
                              {accountDialog.restoreSelections.includes(
                                option.value
                              ) && <bi.BiCheck size={14} />}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      className="inline-flex h-10 w-fit items-center gap-2 rounded-full bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                      onClick={restoreEncryptedBackup}
                      disabled={accountDialog.restoreLoading}
                    >
                      {accountDialog.restoreLoading ? (
                        <bi.BiLoaderAlt className="animate-spin" />
                      ) : (
                        <bi.BiRefresh />
                      )}
                      Restore selected data
                    </button>

                    {accountDialog.restoreResult && (
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-300">
                        <p className="font-medium">
                          Restored: {accountDialog.restoreResult.restored?.join(', ') || 'Nothing'}
                        </p>
                        {accountDialog.restoreResult.exportedAt && (
                          <p className="mt-1 opacity-80">
                            Backup created on{' '}
                            {new Date(
                              accountDialog.restoreResult.exportedAt
                            ).toLocaleString()}
                            .
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  className="grid w-full grid-cols-[auto_1fr_auto] gap-4 px-5 py-4 text-left hover:bg-spill-100/50 dark:hover:bg-[#182229]"
                  onClick={requestAccountInfo}
                  disabled={accountDialog.exportLoading}
                >
                  <i className="text-sky-600 dark:text-sky-400">
                    <bi.BiCloudDownload size={22} />
                  </i>
                  <span>
                    <p className="font-medium">Request account info export</p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-[#8696a0]">
                      Existing export flow for a server-generated ZIP link sent to your email.
                    </p>
                    {accountDialog.loading && (
                      <p className="mt-2 text-xs text-slate-500 dark:text-[#8696a0]">
                        Checking latest export status...
                      </p>
                    )}
                    {accountDialog.exportInfo?.expiresAt && (
                      <p className="mt-2 text-xs text-sky-700 dark:text-sky-400">
                        Latest export available until{' '}
                        {new Date(accountDialog.exportInfo.expiresAt).toLocaleString()}
                        {accountDialog.exportInfo?.email
                          ? ` at ${accountDialog.exportInfo.email}`
                          : ''}
                      </p>
                    )}
                    {accountDialog.exportInfo?.fileUrl && (
                      <div className="mt-3">
                        <a
                          href={accountDialog.exportInfo.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-9 items-center gap-2 rounded-full bg-sky-600 px-3 text-xs font-semibold text-white hover:bg-sky-700"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <bi.BiDownload />
                          Download available file
                        </a>
                      </div>
                    )}
                  </span>
                  <span className="self-center">
                    {accountDialog.exportLoading ? (
                      <bi.BiLoaderAlt className="animate-spin text-xl opacity-70" />
                    ) : (
                      <bi.BiChevronRight className="opacity-60" />
                    )}
                  </span>
                </button>
                <button
                  type="button"
                  className="grid w-full grid-cols-[auto_1fr_auto] gap-4 border-t border-slate-100 px-5 py-4 text-left hover:bg-spill-100/50 dark:border-spill-800 dark:hover:bg-[#182229]"
                  onClick={() =>
                    dispatch(setModal({ target: 'changePass', data: true }))
                  }
                >
                  <i>
                    <bi.BiKey />
                  </i>
                  <span>
                    <p className="font-medium">Change password</p>
                  </span>
                  <bi.BiChevronRight className="self-center opacity-60" />
                </button>
                <button
                  type="button"
                  className="grid w-full grid-cols-[auto_1fr_auto] gap-4 border-t border-slate-100 px-5 py-4 text-left text-rose-600 hover:bg-rose-50/70 dark:border-spill-800 dark:text-rose-400 dark:hover:bg-rose-950/20"
                  onClick={() =>
                    dispatch(setModal({ target: 'deleteAcc', data: true }))
                  }
                >
                  <i>
                    <bi.BiTrash />
                  </i>
                  <span>
                    <p className="font-medium">Delete account</p>
                  </span>
                  <bi.BiChevronRight className="self-center opacity-60" />
                </button>
              </div>
            </div>
          </div>
        </div>
        <div
          className={`${
            privacyDialog.open ? 'translate-x-0' : '-translate-x-full'
          } absolute inset-0 z-30 flex h-full w-full flex-col overflow-hidden bg-white text-slate-900 transition duration-200 dark:bg-spill-900 dark:text-white/90`}
          aria-hidden={!privacyDialog.open}
        >
                <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-4 dark:border-spill-700 dark:bg-spill-900">
                  <button
                    type="button"
                    className="grid h-10 w-10 place-items-center rounded-full hover:bg-spill-100 dark:hover:bg-spill-800"
                    onClick={closePrivacyDialog}
                  >
                    <bi.BiArrowBack size={20} />
                  </button>
                  <div>
                    <h2 className="text-xl font-semibold">Privacy</h2>
                    <p className="text-sm text-slate-500 dark:text-white/60">
                      Manage who can see your info and contact you.
                    </p>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto bg-slate-100 px-3 py-4 dark:bg-spill-950">
                  <div className="mx-auto grid max-w-2xl gap-4">
                    {privacyDialog.error && (
                      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
                        {privacyDialog.error}
                      </div>
                    )}
                    <div className="rounded-[24px] border border-slate-200 bg-white shadow-sm dark:border-spill-800 dark:bg-spill-900">
                      <div className="border-b border-slate-200 px-5 py-4 dark:border-spill-800">
                        <p className="text-lg font-semibold">Last seen and online</p>
                        <p className="mt-1 text-sm text-slate-500 dark:text-white/60">
                          Choose who can see your presence across the app.
                        </p>
                      </div>
                      {[
                        ['lastSeenVisibility', 'Who can see my last seen'],
                        ['onlineVisibility', 'Who can see when I am online'],
                      ].map(([key, label]) => (
                        <div
                          key={key}
                          className="border-b border-slate-100 px-5 py-4 last:border-b-0 dark:border-spill-800"
                        >
                          <p className="mb-3 font-medium">{label}</p>
                          <div className="grid gap-2 sm:grid-cols-3">
                            {privacyChoices.map((choice) => (
                              <button
                                key={`${key}-${choice.value}`}
                                type="button"
                                className={`rounded-2xl border px-4 py-3 text-left transition ${
                                  setting?.[key] === choice.value
                                    ? 'border-sky-500 bg-sky-50 text-sky-800 dark:border-sky-500 dark:bg-sky-500/10 dark:text-sky-200'
                                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100 dark:border-spill-700 dark:bg-spill-950 dark:hover:bg-spill-800'
                                }`}
                                onClick={() =>
                                  updatePrivacySetting({ [key]: choice.value })
                                }
                                disabled={privacyDialog.saving === key}
                              >
                                <span className="flex items-center justify-between gap-2">
                                  <span>{choice.label}</span>
                                  {setting?.[key] === choice.value && (
                                    <bi.BiCheckCircle className="text-lg" />
                                  )}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="rounded-[24px] border border-slate-200 bg-white shadow-sm dark:border-spill-800 dark:bg-spill-900">
                      <div className="border-b border-slate-200 px-5 py-4 dark:border-spill-800">
                        <p className="text-lg font-semibold">Visible profile info</p>
                      </div>
                      {[
                        ['profilePhotoVisibility', 'Profile picture'],
                        ['statusVisibility', 'Status'],
                        ['groupsVisibility', 'Groups'],
                      ].map(([key, label]) => (
                        <div
                          key={key}
                          className="border-b border-slate-100 px-5 py-4 last:border-b-0 dark:border-spill-800"
                        >
                          <p className="mb-3 font-medium">{label}</p>
                          <div className="grid gap-2 sm:grid-cols-3">
                            {privacyChoices.map((choice) => (
                              <button
                                key={`${key}-${choice.value}`}
                                type="button"
                                className={`rounded-2xl border px-4 py-3 text-left transition ${
                                  setting?.[key] === choice.value
                                    ? 'border-sky-500 bg-sky-50 text-sky-800 dark:border-sky-500 dark:bg-sky-500/10 dark:text-sky-200'
                                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100 dark:border-spill-700 dark:bg-spill-950 dark:hover:bg-spill-800'
                                }`}
                                onClick={() =>
                                  updatePrivacySetting({ [key]: choice.value })
                                }
                                disabled={privacyDialog.saving === key}
                              >
                                <span className="flex items-center justify-between gap-2">
                                  <span>{choice.label}</span>
                                  {setting?.[key] === choice.value && (
                                    <bi.BiCheckCircle className="text-lg" />
                                  )}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="rounded-[24px] border border-slate-200 bg-white shadow-sm dark:border-spill-800 dark:bg-spill-900">
                      {[
                        [
                          'readReceiptsEnabled',
                          'Read receipts',
                          'When off, people will not see when you read messages.',
                        ],
                        [
                          'messageRequestsEnabled',
                          'Message requests from unknown accounts',
                          'Allow messages from users who are not in contacts.',
                        ],
                        [
                          'disableLinkPreviews',
                          'Disable link previews',
                          'Hide automatic preview rendering when links appear in chat.',
                        ],
                      ].map(([key, title, desc], index) => (
                        <div
                          key={key}
                          className={`grid grid-cols-[1fr_auto] gap-4 px-5 py-4 ${
                            index < 2 ? 'border-b border-slate-100 dark:border-spill-800' : ''
                          }`}
                        >
                          <span>
                            <p className="font-medium">{title}</p>
                            <p className="mt-1 text-sm text-slate-500 dark:text-white/60">
                              {desc}
                            </p>
                          </span>
                          <button
                            type="button"
                            className={`${
                              setting?.[key]
                                ? 'bg-sky-200 dark:bg-sky-500/30'
                                : 'bg-slate-300 dark:bg-spill-700'
                            } relative mt-1 h-7 w-12 rounded-full p-1 transition`}
                            onClick={() =>
                              updatePrivacySetting({ [key]: !setting?.[key] })
                            }
                            disabled={privacyDialog.saving === key}
                          >
                            <span
                              className={`${
                                setting?.[key]
                                  ? 'translate-x-5 bg-sky-700 dark:bg-sky-400'
                                  : 'translate-x-0 bg-slate-600 dark:bg-slate-200'
                              } block h-5 w-5 rounded-full transition`}
                            />
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm dark:border-spill-800 dark:bg-spill-900">
                      <button
                        type="button"
                        className="grid w-full grid-cols-[1fr_auto] gap-4 border-b border-slate-100 px-5 py-4 text-left hover:bg-slate-50 dark:border-spill-800 dark:hover:bg-spill-800/70"
                        onClick={() =>
                          setPrivacyDialog((prev) => ({
                            ...prev,
                            view: 'blocked',
                          }))
                        }
                      >
                        <span>
                          <p className="font-medium">
                            Blocked contacts ({privacyDialog.blockedContacts.length})
                          </p>
                          <p className="mt-1 text-sm text-slate-500 dark:text-white/60">
                            Blocked contacts cannot message or call you.
                          </p>
                        </span>
                        <span className="flex items-center gap-3">
                          {privacyDialog.loading && (
                            <bi.BiLoaderAlt className="animate-spin text-xl opacity-70" />
                          )}
                          <bi.BiChevronRight className="opacity-60" />
                        </span>
                      </button>
                      <button
                        type="button"
                        className="grid w-full grid-cols-[1fr_auto] gap-4 px-5 py-4 text-left hover:bg-slate-50 dark:hover:bg-spill-800/70"
                        onClick={() =>
                          setPrivacyDialog((prev) => ({
                            ...prev,
                            view: 'hidden',
                          }))
                        }
                      >
                        <span>
                          <p className="font-medium">
                            Hidden chats ({privacyDialog.hiddenChats.length})
                          </p>
                          <p className="mt-1 text-sm text-slate-500 dark:text-white/60">
                            Hidden chats stay out of your main chat list until you unhide them.
                          </p>
                        </span>
                        <bi.BiChevronRight className="self-center opacity-60" />
                      </button>
                    </div>
                  </div>
                </div>
                <div
                  className={`${
                    privacyDialog.view === 'blocked'
                      ? 'translate-x-0'
                      : '-translate-x-full'
                  } absolute inset-0 z-40 flex h-full w-full flex-col overflow-hidden bg-white text-slate-900 transition duration-200 dark:bg-spill-900 dark:text-white/90`}
                  aria-hidden={privacyDialog.view !== 'blocked'}
                >
                  <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-4 dark:border-spill-700 dark:bg-spill-900">
                    <button
                      type="button"
                      className="grid h-10 w-10 place-items-center rounded-full hover:bg-spill-100 dark:hover:bg-spill-800"
                      onClick={() =>
                        setPrivacyDialog((prev) => ({ ...prev, view: 'overview' }))
                      }
                    >
                      <bi.BiArrowBack size={20} />
                    </button>
                    <div>
                      <h2 className="text-xl font-semibold">Blocked contacts</h2>
                      <p className="text-sm text-slate-500 dark:text-white/60">
                        Manage contacts you blocked from messages and calls.
                      </p>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto bg-slate-100 px-3 py-4 dark:bg-spill-950">
                    <div className="mx-auto overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm dark:border-spill-800 dark:bg-spill-900">
                      {!privacyDialog.loading &&
                        privacyDialog.blockedContacts.length === 0 && (
                          <p className="px-5 py-5 text-sm text-slate-500 dark:text-white/60">
                            No blocked contacts.
                          </p>
                        )}
                      {privacyDialog.blockedContacts.map((item) => (
                        <div
                          key={item.userId}
                          className="grid grid-cols-[auto_1fr_auto] gap-3 border-b border-slate-100 px-5 py-4 last:border-b-0 dark:border-spill-800"
                        >
                          <img
                            src={item.avatar || 'assets/images/default-avatar.png'}
                            alt=""
                            className="h-12 w-12 rounded-full object-cover"
                          />
                          <span className="min-w-0">
                            <p className="truncate font-medium">
                              {item.fullname || item.username}
                            </p>
                            <p className="truncate text-sm text-slate-500 dark:text-white/60">
                              @{item.username}
                            </p>
                          </span>
                          <button
                            type="button"
                            className="self-center rounded-full border border-sky-500 px-3 py-1.5 text-sm font-medium text-sky-700 hover:bg-sky-50 dark:border-sky-500 dark:text-sky-300 dark:hover:bg-sky-500/10"
                            onClick={() => handleUnblockContact(item.userId)}
                            disabled={
                              privacyDialog.saving === `unblock-${item.userId}`
                            }
                          >
                            {privacyDialog.saving === `unblock-${item.userId}`
                              ? '...'
                              : 'Unblock'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div
                  className={`${
                    privacyDialog.view === 'hidden'
                      ? 'translate-x-0'
                      : '-translate-x-full'
                  } absolute inset-0 z-40 flex h-full w-full flex-col overflow-hidden bg-white text-slate-900 transition duration-200 dark:bg-spill-900 dark:text-white/90`}
                  aria-hidden={privacyDialog.view !== 'hidden'}
                >
                  <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-4 dark:border-spill-700 dark:bg-spill-900">
                    <button
                      type="button"
                      className="grid h-10 w-10 place-items-center rounded-full hover:bg-spill-100 dark:hover:bg-spill-800"
                      onClick={() =>
                        setPrivacyDialog((prev) => ({ ...prev, view: 'overview' }))
                      }
                    >
                      <bi.BiArrowBack size={20} />
                    </button>
                    <div>
                      <h2 className="text-xl font-semibold">Hidden chats</h2>
                      <p className="text-sm text-slate-500 dark:text-white/60">
                        Unhide conversations you want back in the main chat list.
                      </p>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto bg-slate-100 px-3 py-4 dark:bg-spill-950">
                    <div className="mx-auto overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm dark:border-spill-800 dark:bg-spill-900">
                      {!privacyDialog.loading &&
                        privacyDialog.hiddenChats.length === 0 && (
                          <p className="px-5 py-5 text-sm text-slate-500 dark:text-white/60">
                            No hidden chats.
                          </p>
                        )}
                      {privacyDialog.hiddenChats.map((item) => (
                        <div
                          key={item.roomId}
                          className="grid grid-cols-[auto_1fr_auto] gap-3 border-b border-slate-100 px-5 py-4 last:border-b-0 dark:border-spill-800"
                        >
                          <img
                            src={
                              item?.channel?.avatar ||
                              item?.group?.avatar ||
                              item?.owners?.find((owner) => owner.userId !== master?._id)?.avatar ||
                              'assets/images/default-avatar.png'
                            }
                            alt=""
                            className="h-12 w-12 rounded-full object-cover"
                          />
                          <span className="min-w-0">
                            <p className="truncate font-medium">
                              {getHiddenChatTitle(item)}
                            </p>
                            <p className="truncate text-sm text-slate-500 dark:text-white/60">
                              {item.roomType === 'group'
                                ? item?.channel
                                  ? 'Channel chat'
                                  : 'Group chat'
                                : 'Private chat'}
                            </p>
                          </span>
                          <button
                            type="button"
                            className="self-center rounded-full border border-sky-500 px-3 py-1.5 text-sm font-medium text-sky-700 hover:bg-sky-50 dark:border-sky-500 dark:text-sky-300 dark:hover:bg-sky-500/10"
                            onClick={() => handleUnhideChat(item.roomId)}
                            disabled={
                              privacyDialog.saving === `unhide-${item.roomId}`
                            }
                          >
                            {privacyDialog.saving === `unhide-${item.roomId}`
                              ? '...'
                              : 'Unhide'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
        </div>
        <div
          className={`${
            notificationDialog.open ? 'translate-x-0' : '-translate-x-full'
          } absolute inset-0 z-30 flex h-full w-full flex-col overflow-hidden bg-white text-slate-900 transition duration-200 dark:bg-spill-900 dark:text-white/90`}
          aria-hidden={!notificationDialog.open}
        >
          <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-4 dark:border-spill-700 dark:bg-spill-900">
            <button
              type="button"
              className="grid h-10 w-10 place-items-center rounded-full hover:bg-spill-100 dark:hover:bg-spill-800"
              onClick={closeNotificationDialog}
            >
              <bi.BiArrowBack size={20} />
            </button>
            <div>
              <h2 className="text-xl font-semibold">Notifications</h2>
              <p className="text-sm text-slate-500 dark:text-white/60">
                Control notification delivery, previews, sounds and mute.
              </p>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto bg-slate-100 px-3 py-4 dark:bg-spill-950">
            <div className="mx-auto grid max-w-2xl gap-4">
              {notificationDialog.error && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
                  {notificationDialog.error}
                </div>
              )}
              <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm dark:border-spill-800 dark:bg-spill-900">
                {[
                  [
                    'mute',
                    'Mute notifications',
                    'Turn off banner, popup, push and notification sounds everywhere.',
                  ],
                  [
                    'showNotificationBanner',
                    'Show notification banner',
                    'Display a top banner inside the app.',
                  ],
                  [
                    'showPopupNotification',
                    'Show popup notification',
                    'Display a larger popup card inside the app.',
                  ],
                  [
                    'showPushNotification',
                    'Show push notification',
                    'Use browser desktop notifications when the app is hidden.',
                  ],
                  [
                    'showNotificationPreviews',
                    'Show previews',
                    'Include sender names and message previews in notifications.',
                  ],
                  [
                    'outgoingMessageSoundEnabled',
                    'Play sound for outgoing message',
                    'Play a short sound when your message is sent.',
                  ],
                ].map(([key, title, desc], index) => (
                  <div
                    key={key}
                    className={`grid grid-cols-[1fr_auto] gap-4 px-5 py-4 ${
                      index < 5 ? 'border-b border-slate-100 dark:border-spill-800' : ''
                    }`}
                  >
                    <span>
                      <p className="font-medium">{title}</p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-white/60">
                        {desc}
                      </p>
                    </span>
                    <button
                      type="button"
                      className={`${
                        setting?.[key]
                          ? 'bg-sky-200 dark:bg-sky-500/30'
                          : 'bg-slate-300 dark:bg-spill-700'
                      } relative mt-1 h-7 w-12 rounded-full p-1 transition`}
                      onClick={() =>
                        updateNotificationSetting({ [key]: !setting?.[key] })
                      }
                      disabled={notificationDialog.saving === key}
                    >
                      <span
                        className={`${
                          setting?.[key]
                            ? 'translate-x-5 bg-sky-700 dark:bg-sky-400'
                            : 'translate-x-0 bg-slate-600 dark:bg-slate-200'
                        } block h-5 w-5 rounded-full transition`}
                      />
                    </button>
                  </div>
                ))}
              </div>

              <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm dark:border-spill-800 dark:bg-spill-900">
                <div className="border-b border-slate-200 px-5 py-4 dark:border-spill-800">
                  <p className="text-lg font-semibold">Notify me about</p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-white/60">
                    Choose which activities can trigger notifications.
                  </p>
                </div>
                {[
                  ['notifyMessages', 'Messages'],
                  ['notifyGroups', 'Groups'],
                  ['notifyStatus', 'Status'],
                  ['notifyCalls', 'Calls'],
                ].map(([key, title], index) => (
                  <div
                    key={key}
                    className={`grid grid-cols-[1fr_auto] gap-4 px-5 py-4 ${
                      index < 3 ? 'border-b border-slate-100 dark:border-spill-800' : ''
                    }`}
                  >
                    <span>
                      <p className="font-medium">{title}</p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-white/60">
                        Receive notifications for {String(title).toLowerCase()} activity.
                      </p>
                    </span>
                    <button
                      type="button"
                      className={`${
                        setting?.[key]
                          ? 'bg-sky-200 dark:bg-sky-500/30'
                          : 'bg-slate-300 dark:bg-spill-700'
                      } relative mt-1 h-7 w-12 rounded-full p-1 transition`}
                      onClick={() =>
                        updateNotificationSetting({ [key]: !setting?.[key] })
                      }
                      disabled={notificationDialog.saving === key}
                    >
                      <span
                        className={`${
                          setting?.[key]
                            ? 'translate-x-5 bg-sky-700 dark:bg-sky-400'
                            : 'translate-x-0 bg-slate-600 dark:bg-slate-200'
                        } block h-5 w-5 rounded-full transition`}
                      />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div
          className={`${
            chatsDialog.open ? 'translate-x-0' : '-translate-x-full'
          } absolute inset-0 z-30 flex h-full w-full flex-col overflow-hidden bg-white text-slate-900 transition duration-200 dark:bg-spill-900 dark:text-white/90`}
          aria-hidden={!chatsDialog.open}
        >
          <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-4 dark:border-spill-700 dark:bg-spill-900">
            <button
              type="button"
              className="grid h-10 w-10 place-items-center rounded-full hover:bg-spill-100 dark:hover:bg-spill-800"
              onClick={closeChatsDialog}
            >
              <bi.BiArrowBack size={20} />
            </button>
            <div>
              <h2 className="text-xl font-semibold">Chats</h2>
              <p className="text-sm text-slate-500 dark:text-white/60">
                Manage wallpaper, media behavior and message composer settings.
              </p>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto bg-slate-100 px-3 py-4 dark:bg-spill-950">
            <div className="mx-auto grid max-w-2xl gap-4">
              {chatsDialog.error && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
                  {chatsDialog.error}
                </div>
              )}
              <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm dark:border-spill-800 dark:bg-spill-900">
                <div className="border-b border-slate-200 px-5 py-4 dark:border-spill-800">
                  <p className="text-lg font-semibold">Wallpaper</p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-white/60">
                    This wallpaper will apply across all your chat rooms.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 px-5 py-4 sm:grid-cols-3">
                  {WALLPAPER_PRESETS.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className={`rounded-2xl border p-2.5 text-left transition ${
                        setting?.chatWallpaperPreset === item.key
                          ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/20'
                          : 'border-slate-200 hover:bg-slate-50 dark:border-spill-700 dark:hover:bg-spill-800'
                      }`}
                      onClick={() =>
                        updateChatSetting({
                          chatWallpaperPreset: item.key,
                          chatWallpaperImage:
                            item.key === 'custom-image'
                              ? setting?.chatWallpaperImage || ''
                              : null,
                        })
                      }
                      disabled={chatsDialog.saving === 'chatWallpaperPreset'}
                    >
                      <span
                        className={`mb-2 block h-14 w-full rounded-xl border border-slate-200 dark:border-spill-700 ${
                          item.key === 'whatsapp' ? 'whatsapp-wallpaper' : ''
                        }`}
                        style={getWallpaperStyle({
                          wallpaperPreset: item.key,
                          wallpaperImage:
                            item.key === 'custom-image'
                              ? setting?.chatWallpaperImage || ''
                              : '',
                        })}
                      />
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-[11px] opacity-70">{item.subtitle}</p>
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`rounded-2xl border p-2.5 text-left transition ${
                      setting?.chatWallpaperPreset === 'custom-image'
                        ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/20'
                        : 'border-slate-200 hover:bg-slate-50 dark:border-spill-700 dark:hover:bg-spill-800'
                    }`}
                    onClick={() => chatWallpaperInputRef.current?.click()}
                  >
                    <span
                      className="mb-2 block h-14 w-full rounded-xl border border-dashed border-slate-300 dark:border-spill-600"
                      style={getWallpaperStyle({
                        wallpaperPreset: 'custom-image',
                        wallpaperImage: setting?.chatWallpaperImage || '',
                      })}
                    />
                    <p className="text-sm font-medium">Custom image</p>
                    <p className="text-[11px] opacity-70">Upload wallpaper</p>
                  </button>
                </div>
                <input
                  ref={chatWallpaperInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleChatWallpaperUpload(e.target.files?.[0])}
                />
              </div>

              <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm dark:border-spill-800 dark:bg-spill-900">
                <div className="border-b border-slate-200 px-5 py-4 dark:border-spill-800">
                  <p className="text-lg font-semibold">Media quality</p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-white/60">
                    Standard compresses sent images. HD keeps higher image quality.
                  </p>
                </div>
                <div className="grid gap-3 px-5 py-4 sm:grid-cols-2">
                  {[
                    ['standard', 'Standard', 'Smaller size and faster sending.'],
                    ['hd', 'HD', 'Higher image quality and larger uploads.'],
                  ].map(([value, title, desc]) => (
                    <button
                      key={value}
                      type="button"
                      className={`rounded-2xl border px-4 py-3 text-left transition ${
                        setting?.mediaQuality === value
                          ? 'border-sky-500 bg-sky-50 text-sky-800 dark:border-sky-500 dark:bg-sky-500/10 dark:text-sky-200'
                          : 'border-slate-200 bg-slate-50 hover:bg-slate-100 dark:border-spill-700 dark:bg-spill-950 dark:hover:bg-spill-800'
                      }`}
                      onClick={() => updateChatSetting({ mediaQuality: value })}
                      disabled={chatsDialog.saving === 'mediaQuality'}
                    >
                      <p className="font-medium">{title}</p>
                      <p className="mt-1 text-sm opacity-75">{desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm dark:border-spill-800 dark:bg-spill-900">
                <div className="border-b border-slate-200 px-5 py-4 dark:border-spill-800">
                  <p className="text-lg font-semibold">Media auto-download</p>
                </div>
                {[
                  ['autoDownloadPhotos', 'Photos'],
                  ['autoDownloadAudio', 'Audio'],
                  ['autoDownloadVideos', 'Videos'],
                  ['autoDownloadDocuments', 'Documents'],
                ].map(([key, title], index) => (
                  <div
                    key={key}
                    className={`grid grid-cols-[1fr_auto] gap-4 px-5 py-4 ${
                      index < 3 ? 'border-b border-slate-100 dark:border-spill-800' : ''
                    }`}
                  >
                    <span>
                      <p className="font-medium">{title}</p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-white/60">
                        Automatically load and download incoming {title.toLowerCase()}.
                      </p>
                    </span>
                    <button
                      type="button"
                      className={`${
                        setting?.[key]
                          ? 'bg-sky-200 dark:bg-sky-500/30'
                          : 'bg-slate-300 dark:bg-spill-700'
                      } relative mt-1 h-7 w-12 rounded-full p-1 transition`}
                      onClick={() => updateChatSetting({ [key]: !setting?.[key] })}
                      disabled={chatsDialog.saving === key}
                    >
                      <span
                        className={`${
                          setting?.[key]
                            ? 'translate-x-5 bg-sky-700 dark:bg-sky-400'
                            : 'translate-x-0 bg-slate-600 dark:bg-slate-200'
                        } block h-5 w-5 rounded-full transition`}
                      />
                    </button>
                  </div>
                ))}
              </div>

              <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm dark:border-spill-800 dark:bg-spill-900">
                {[
                  [
                    'spellCheckEnabled',
                    'Spell check',
                    'Enable browser spell check in the message composer.',
                  ],
                  [
                    'replaceTextWithEmoji',
                    'Replace text with emoji',
                    'Convert common text emoticons like :) and <3 before sending.',
                  ],
                  [
                    'enterToSend',
                    'Enter to send',
                    'Press Enter to send messages from the composer.',
                  ],
                  [
                    'keepArchived',
                    'Keep archived',
                    'Archived chats stay archived when new messages arrive.',
                  ],
                ].map(([key, title, desc], index) => (
                  <div
                    key={key}
                    className={`grid grid-cols-[1fr_auto] gap-4 px-5 py-4 ${
                      index < 3 ? 'border-b border-slate-100 dark:border-spill-800' : ''
                    }`}
                  >
                    <span>
                      <p className="font-medium">{title}</p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-white/60">
                        {desc}
                      </p>
                    </span>
                    <button
                      type="button"
                      className={`${
                        setting?.[key]
                          ? 'bg-sky-200 dark:bg-sky-500/30'
                          : 'bg-slate-300 dark:bg-spill-700'
                      } relative mt-1 h-7 w-12 rounded-full p-1 transition`}
                      onClick={() => updateChatSetting({ [key]: !setting?.[key] })}
                      disabled={chatsDialog.saving === key}
                    >
                      <span
                        className={`${
                          setting?.[key]
                            ? 'translate-x-5 bg-sky-700 dark:bg-sky-400'
                            : 'translate-x-0 bg-slate-600 dark:bg-slate-200'
                        } block h-5 w-5 rounded-full transition`}
                      />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div
          className={`${
            voiceVideoDialog.open ? 'translate-x-0' : '-translate-x-full'
          } absolute inset-0 z-30 flex h-full w-full flex-col overflow-hidden bg-white text-slate-900 transition duration-200 dark:bg-spill-900 dark:text-white/90`}
          aria-hidden={!voiceVideoDialog.open}
        >
          <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-4 dark:border-spill-700 dark:bg-spill-900">
            <button
              type="button"
              className="grid h-10 w-10 place-items-center rounded-full hover:bg-spill-100 dark:hover:bg-spill-800"
              onClick={closeVoiceVideoDialog}
            >
              <bi.BiArrowBack size={20} />
            </button>
            <div>
              <h2 className="text-xl font-semibold">Voice & Video</h2>
              <p className="text-sm text-slate-500 dark:text-white/60">
                Manage device auto permissions for calls.
              </p>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto bg-slate-100 px-3 py-4 dark:bg-spill-950">
            <div className="mx-auto grid max-w-2xl gap-4">
              {voiceVideoDialog.error && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
                  {voiceVideoDialog.error}
                </div>
              )}
              <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm dark:border-spill-800 dark:bg-[#202c33]">
                <div className="border-b border-slate-200 px-5 py-4 dark:border-spill-800">
                  <p className="text-lg font-semibold">Auto permission</p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-[#8696a0]">
                    Control which devices SyncChat can prepare automatically when you start or receive a call.
                  </p>
                </div>
                {[
                  [
                    'cameraEnabled',
                    'Camera',
                    'Allow camera access for video calls.',
                    bi.BiCamera,
                  ],
                  [
                    'microphoneEnabled',
                    'Microphone',
                    'Allow microphone access for voice and video calls.',
                    bi.BiMicrophone,
                  ],
                  [
                    'speakerEnabled',
                    'Speaker',
                    'Allow speaker output for call audio.',
                    bi.BiVolumeFull,
                  ],
                ].map(([key, title, desc, Icon], index) => (
                  <div
                    key={key}
                    className={`grid grid-cols-[auto_1fr_auto] gap-4 px-5 py-4 ${
                      index < 2 ? 'border-b border-slate-100 dark:border-spill-800' : ''
                    }`}
                  >
                    <i className="mt-1 text-sky-600 dark:text-sky-400">
                      <Icon size={22} />
                    </i>
                    <span>
                      <p className="font-medium">{title}</p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-[#8696a0]">
                        {desc}
                      </p>
                    </span>
                    <button
                      type="button"
                      className={`${
                        setting?.[key]
                          ? 'bg-sky-200 dark:bg-sky-500/30'
                          : 'bg-slate-300 dark:bg-spill-700'
                      } relative mt-1 h-7 w-12 rounded-full p-1 transition`}
                      onClick={() =>
                        updateVoiceVideoSetting({ [key]: !setting?.[key] })
                      }
                      disabled={voiceVideoDialog.saving === key}
                    >
                      <span
                        className={`${
                          setting?.[key]
                            ? 'translate-x-5 bg-sky-700 dark:bg-sky-400'
                            : 'translate-x-0 bg-slate-600 dark:bg-slate-200'
                        } block h-5 w-5 rounded-full transition`}
                      />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div
          className={`${
            shortcutDialog.open ? 'translate-x-0' : '-translate-x-full'
          } absolute inset-0 z-30 flex h-full w-full flex-col overflow-hidden bg-white text-slate-900 transition duration-200 dark:bg-spill-900 dark:text-white/90`}
          aria-hidden={!shortcutDialog.open}
        >
          <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-4 dark:border-spill-700 dark:bg-spill-900">
            <button
              type="button"
              className="grid h-10 w-10 place-items-center rounded-full hover:bg-spill-100 dark:hover:bg-spill-800"
              onClick={closeShortcutDialog}
            >
              <bi.BiArrowBack size={20} />
            </button>
            <div>
              <h2 className="text-xl font-semibold">Keyboard shortcuts</h2>
              <p className="text-sm text-slate-500 dark:text-white/60">
                Faster ways to move around SyncChat on desktop.
              </p>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto bg-slate-100 px-3 py-4 dark:bg-spill-950">
            <div className="mx-auto grid max-w-3xl gap-4">
              <div className="rounded-[24px] border border-slate-200 bg-white px-5 py-4 shadow-sm dark:border-spill-800 dark:bg-spill-900">
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-sky-700 dark:text-sky-300">
                  Desktop only
                </p>
                <p className="mt-2 text-sm text-slate-500 dark:text-white/60">
                  Shortcuts work while the browser focus is inside SyncChat. Typing
                  fields ignore most shortcuts so message entry stays uninterrupted.
                </p>
              </div>

              {KEYBOARD_SHORTCUT_SECTIONS.map((section) => (
                <div
                  key={section.title}
                  className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm dark:border-spill-800 dark:bg-spill-900"
                >
                  <div className="border-b border-slate-200 px-5 py-4 dark:border-spill-800">
                    <p className="text-lg font-semibold">{section.title}</p>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-spill-800">
                    {section.items.map((item) => (
                      <div
                        key={item.id}
                        className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_auto]"
                      >
                        <span>
                          <p className="font-medium">{item.label}</p>
                          <p className="mt-1 text-sm text-slate-500 dark:text-white/60">
                            {item.description}
                          </p>
                        </span>
                        <span className="flex flex-wrap items-center justify-start gap-2 md:justify-end">
                          {item.keys.map((key) => (
                            <kbd
                              key={`${item.id}-${key}`}
                              className="min-w-8 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1 text-center text-xs font-semibold text-slate-600 shadow-sm dark:border-spill-700 dark:bg-spill-950 dark:text-white/80"
                            >
                              {key}
                            </kbd>
                          ))}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        {setting &&
          structure.map((struct, index) => (
            <div key={struct.section || `section-${index}`} className="grid">
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
                    } else if (child.target === 'twoFactorEnabled') {
                      openTwoFactorDialog(
                        setting.twoFactorEnabled ? 'disable' : 'enable'
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
                    } else if (child.target === 'license') {
                      dispatch(setPage({ target: 'license', data: true }));
                    } else if (child.target === 'accountSettings') {
                      openAccountDialog();
                    } else if (child.target === 'deviceSessions') {
                      openDeviceDialog();
                    } else if (child.target === 'notifications') {
                      openNotificationDialog();
                    } else if (child.target === 'chats') {
                      openChatsDialog();
                    } else if (child.target === 'privacy') {
                      openPrivacyDialog();
                    } else if (child.target === 'voiceVideo') {
                      openVoiceVideoDialog();
                    } else if (child.target === 'keyboardShortcuts') {
                      openShortcutDialog();
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
                            if (child.target === 'twoFactorEnabled') {
                              spinner.classList.add('invisible');
                              openTwoFactorDialog(
                                setting.twoFactorEnabled ? 'disable' : 'enable'
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
                    {!child.toggle && <bi.BiChevronRight className="opacity-60" />}
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
