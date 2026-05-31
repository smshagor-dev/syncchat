import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import {
  BiBarChartAlt2,
  BiLockAlt,
  BiKey,
  BiUserCircle,
  BiShieldQuarter,
  BiLayer,
  BiTimer,
  BiUser,
  BiCloudDownload,
  BiCog,
} from 'react-icons/bi';
import './style.css';
import config from './config';
import socket from './helpers/socket';
import resolveUploadUrl from './helpers/resolveUploadUrl';

axios.defaults.baseURL = config.apiBaseUrl;

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Tooltip,
  Legend
);

const getToken = () => localStorage.getItem('admin_token');
const setToken = (token) => {
  if (token) {
    localStorage.setItem('admin_token', token);
    axios.defaults.headers.Authorization = `Bearer ${token}`;
  } else {
    localStorage.removeItem('admin_token');
    delete axios.defaults.headers.Authorization;
  }
};

const normalizeAdminPermissions = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];

    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        return normalizeAdminPermissions(JSON.parse(trimmed));
      } catch (error0) {
        return [trimmed];
      }
    }

    return trimmed
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (value && typeof value === 'object') {
    return normalizeAdminPermissions(Object.values(value));
  }

  return [];
};

const sections = [
  { id: 'overview', label: 'Overview', icon: BiBarChartAlt2 },
  { id: 'analytics', label: 'Analytics', icon: BiBarChartAlt2 },
  { id: 'app-config', label: 'App Config', icon: BiCog },
  { id: 'users', label: 'User Management', icon: BiUser },
  { id: 'exports', label: 'Account Exports', icon: BiCloudDownload },
  { id: 'groups', label: 'Group Management', icon: BiLayer },
  { id: 'channels', label: 'Channel Management', icon: BiLayer },
  { id: 'moderation', label: 'Moderation Center', icon: BiShieldQuarter },
  { id: 'content', label: 'Content Controls', icon: BiShieldQuarter },
  { id: 'security', label: 'Security & Compliance', icon: BiShieldQuarter },
];

const adminManagementSections = [
  { id: 'admins', label: 'Admins & Roles', icon: BiShieldQuarter },
  { id: 'admin-create', label: 'Create Admin', icon: BiUserCircle },
  { id: 'permissions', label: 'Permissions', icon: BiLayer },
  { id: 'sessions', label: 'Sessions', icon: BiTimer },
  { id: 'keys', label: 'Access Keys', icon: BiKey },
  { id: 'audit', label: 'Audit Logs', icon: BiLockAlt },
  { id: 'profile', label: 'Profile', icon: BiUserCircle },
];

const DEFAULT_APP_CONFIG_FORM = {
  appName: 'SyncChat',
  appLogo: '',
  supportEmail: '',
  featureFlags: {
    uploads: true,
    status: true,
    calls: true,
    groups: true,
    channels: true,
    communities: true,
  },
  uploadLimits: {
    chatMb: 100,
    avatarMb: 10,
    allowedTypes: ['image', 'video', 'audio', 'document'],
  },
  mediaProfile: {
    defaultQuality: 'standard',
    hdEnabled: true,
  },
  maintenance: {
    enabled: false,
    message: '',
  },
  seo: {
    title: '',
    description: '',
    keywords: '',
    image: '',
    ogType: 'website',
    twitterCard: 'summary_large_image',
  },
  defaultPrivacy: {
    lastSeenVisibility: 'everyone',
    onlineVisibility: 'everyone',
    profilePhotoVisibility: 'everyone',
    statusVisibility: 'everyone',
    groupsVisibility: 'everyone',
    readReceiptsEnabled: true,
    messageRequestsEnabled: true,
    disableLinkPreviews: false,
    securityNotificationsEnabled: true,
  },
  defaultChat: {
    enterToSend: true,
    mediaQuality: 'standard',
    autoDownloadPhotos: true,
    autoDownloadAudio: true,
    autoDownloadVideos: true,
    autoDownloadDocuments: false,
    spellCheckEnabled: true,
    replaceTextWithEmoji: true,
    keepArchived: false,
  },
  defaultNotifications: {
    showNotificationBanner: true,
    showPopupNotification: true,
    showPushNotification: true,
    notifyMessages: true,
    notifyGroups: true,
    notifyStatus: true,
    notifyCalls: true,
    showNotificationPreviews: true,
    outgoingMessageSoundEnabled: true,
  },
  smtp: {
    host: '',
    port: 587,
    secure: false,
    user: '',
    pass: '',
    fromName: '',
    fromEmail: '',
    passSet: false,
  },
};

function App() {
  const [booting, setBooting] = useState(true);
  const [hasAdmin, setHasAdmin] = useState(null);
  const [admin, setAdmin] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [view, setView] = useState('login');
  const [section, setSection] = useState('overview');
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const [reportMenuOpen, setReportMenuOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    email: '',
    password: '',
  });

  const [roles, setRoles] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [accessKeys, setAccessKeys] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [permissionList, setPermissionList] = useState([]);
  const [users, setUsers] = useState([]);
  const [userFilters, setUserFilters] = useState({
    query: '',
    status: 'all',
    verified: 'all',
    lastSeen: 'any',
  });
  const [userLoading, setUserLoading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [userDetail, setUserDetail] = useState(null);
  const [exportsFilter, setExportsFilter] = useState('pending');
  const [exportRequests, setExportRequests] = useState([]);
  const [exportsLoading, setExportsLoading] = useState(false);
  const [groups, setGroups] = useState([]);
  const [groupFilters, setGroupFilters] = useState({
    query: '',
    status: 'all',
    accessType: 'all',
  });
  const [groupLoading, setGroupLoading] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [groupDetail, setGroupDetail] = useState(null);
  const [groupForm, setGroupForm] = useState({
    name: '',
    desc: '',
    accessType: 'public',
    password: '',
  });
  const [groupPermissionsForm, setGroupPermissionsForm] = useState({
    memberCanEditInfo: false,
    memberCanSendMessage: true,
    memberCanAddMember: false,
    memberCanInviteViaLink: false,
    adminApprovalRequired: false,
  });
  const [groupModerationForm, setGroupModerationForm] = useState({
    slowModeSeconds: 0,
    bannedWords: '',
    blockedMediaTypes: [],
    autoReportViolations: true,
  });
  const [groupSaving, setGroupSaving] = useState(false);
  const [channels, setChannels] = useState([]);
  const [channelFilters, setChannelFilters] = useState({
    query: '',
    status: 'all',
    accessType: 'all',
  });
  const [channelLoading, setChannelLoading] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState('');
  const [channelDetail, setChannelDetail] = useState(null);
  const [channelForm, setChannelForm] = useState({
    name: '',
    desc: '',
    accessType: 'public',
    password: '',
  });
  const [channelPermissionsForm, setChannelPermissionsForm] = useState({
    memberCanEditInfo: false,
    memberCanSendMessage: false,
    memberCanAddMember: false,
    memberCanInviteViaLink: false,
    adminApprovalRequired: false,
  });
  const [channelModerationForm, setChannelModerationForm] = useState({
    slowModeSeconds: 0,
    bannedWords: '',
    blockedMediaTypes: [],
    autoReportViolations: true,
  });
  const [channelSaving, setChannelSaving] = useState(false);
  const [channelReviewStats, setChannelReviewStats] = useState({
    ratingAvg: 0,
    ratingCount: 0,
  });
  const [channelReviews, setChannelReviews] = useState([]);
  const [channelReviewLoading, setChannelReviewLoading] = useState(false);
  const [channelReviewFilter, setChannelReviewFilter] = useState('visible');
  const [reports, setReports] = useState([]);
  const [reportNewCount, setReportNewCount] = useState(0);
  const [reportFilters, setReportFilters] = useState({
    status: 'open',
    roomType: 'all',
    source: 'all',
    kind: 'all',
  });
  const [selectedReportId, setSelectedReportId] = useState('');
  const [moderationLoading, setModerationLoading] = useState(false);
  const [reportActionForm, setReportActionForm] = useState({
    action: 'warn',
    note: '',
    durationMinutes: 60,
  });
  const [moderationConfig, setModerationConfig] = useState({
    bannedWords: '',
    blockedMediaTypes: [],
    slowModePresets: '0, 10, 30, 60, 120',
    autoReportViolations: true,
  });
  const [moderationActions, setModerationActions] = useState([]);
  const [contentChats, setContentChats] = useState([]);
  const [contentFilters, setContentFilters] = useState({
    query: '',
    roomId: '',
    userId: '',
    hasMedia: 'any',
    fileType: 'all',
  });
  const [contentLoading, setContentLoading] = useState(false);
  const [selectedContentChatIds, setSelectedContentChatIds] = useState([]);
  const [contentStatuses, setContentStatuses] = useState([]);
  const [statusFilters, setStatusFilters] = useState({
    userId: '',
    type: 'all',
  });
  const [contentConfig, setContentConfig] = useState({
    blockedPreviewDomains: '',
  });
  const [pinRemovalForm, setPinRemovalForm] = useState({
    roomId: '',
    chatId: '',
  });
  const [securityConfig, setSecurityConfig] = useState({
    blockedIps: '',
    blockedFingerprints: '',
    rateLimitsEnabled: false,
    rateLimitWindow: 60,
    rateLimitMax: 120,
  });
  const [appConfigForm, setAppConfigForm] = useState(DEFAULT_APP_CONFIG_FORM);
  const [appConfigLoading, setAppConfigLoading] = useState(false);
  const [appConfigSaving, setAppConfigSaving] = useState(false);
  const [appLogoPreview, setAppLogoPreview] = useState('');
  const [appConfigLoaded, setAppConfigLoaded] = useState(false);
  const [seoImagePreview, setSeoImagePreview] = useState('');
  const [publicBrand, setPublicBrand] = useState({
    appName: 'SyncChat Admin',
    appLogo: '',
  });
  const [securitySessions, setSecuritySessions] = useState([]);
  const [securityUserId, setSecurityUserId] = useState('');
  const [suspiciousSessions, setSuspiciousSessions] = useState([]);
  const [suspiciousFilter, setSuspiciousFilter] = useState('unreviewed');
  const [pushStatus, setPushStatus] = useState(null);
  const [eraseRequests, setEraseRequests] = useState([]);
  const [eraseFilters, setEraseFilters] = useState({ status: 'all' });
  const [eraseForm, setEraseForm] = useState({ userId: '', note: '' });
  const [analyticsSummary, setAnalyticsSummary] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsRefreshedAt, setAnalyticsRefreshedAt] = useState('');
  const [analyticsAutoRefresh, setAnalyticsAutoRefresh] = useState(true);
  const [analyticsRange, setAnalyticsRange] = useState({
    start: '',
    end: '',
  });
  const [analyticsRangeData, setAnalyticsRangeData] = useState(null);
  const [analyticsRangeLoading, setAnalyticsRangeLoading] = useState(false);
  const [adminSocketConnected, setAdminSocketConnected] = useState(false);

  const [roleForm, setRoleForm] = useState({ name: '', description: '', permissions: [] });
  const [profileForm, setProfileForm] = useState({ fullname: '', email: '', avatar: '' });
  const [keyLabel, setKeyLabel] = useState('');
  const [createdKey, setCreatedKey] = useState(null);
  const [profilePreview, setProfilePreview] = useState('');
  const [createAdminForm, setCreateAdminForm] = useState({
    fullname: '',
    email: '',
    password: '',
    roleId: '',
    avatar: '',
  });
  const [createPreview, setCreatePreview] = useState('');

  const clearMessages = () => {
    setNotice('');
    setError('');
  };

  const applyView = (next) => {
    clearMessages();
    setView(next);
  };

  const normalizedEmail = useMemo(
    () => String(form.email || '').trim().toLowerCase(),
    [form.email]
  );
  const permissionKey = useMemo(
    () => normalizeAdminPermissions(permissions).join(','),
    [permissions]
  );

  const can = (perm) => {
    const list = normalizeAdminPermissions(permissions);
    return list.includes('*') || list.includes(perm);
  };
  const formatDate = (value) => (value ? new Date(value).toLocaleString() : '—');
  const formatBytes = (bytes = 0) => {
    const value = Number(bytes || 0);
    if (!Number.isFinite(value) || value <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let index = 0;
    let temp = value;
    while (temp >= 1024 && index < units.length - 1) {
      temp /= 1024;
      index += 1;
    }
    return `${temp.toFixed(temp >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
  };
  const formatUptime = (seconds = 0) => {
    const total = Math.max(0, Number(seconds) || 0);
    const minutes = Math.floor(total / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);

    if (years > 0) return `${years}y ${months % 12}m`;
    if (months > 0) return `${months}m ${days % 30}d`;
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${Math.floor(total)}s`;
  };
  const getLastSeriesValue = (series = []) => {
    if (!Array.isArray(series) || series.length === 0) return 0;
    return Number(series[series.length - 1] || 0);
  };
  const REPORT_SEEN_KEY = 'admin_reports_last_seen';
  const getLastReportSeenAt = () => {
    const raw = localStorage.getItem(REPORT_SEEN_KEY);
    const value = raw ? new Date(raw).getTime() : 0;
    return Number.isFinite(value) ? value : 0;
  };
  const setLastReportSeenAt = (iso) => {
    if (iso) localStorage.setItem(REPORT_SEEN_KEY, iso);
  };

  const loadBootstrap = async ({ hasSession = false } = {}) => {
    const { data } = await axios.get('/admin/bootstrap');
    const nextHasAdmin = Boolean(data?.payload?.hasAdmin);
    setHasAdmin(nextHasAdmin);
    if (!hasSession) {
      applyView('login');
    }
  };

  const loadSession = async () => {
    const token = getToken();
    if (!token) return false;
    setToken(token);

    try {
      const { data } = await axios.get('/admin/me');
      setAdmin(data?.payload || null);
      setPermissions(normalizeAdminPermissions(data?.payload?.permissions));
      setProfileForm({
        fullname: data?.payload?.fullname || '',
        email: data?.payload?.email || '',
        avatar: '',
      });
      setProfilePreview(resolveUploadUrl(data?.payload?.avatar || ''));
      setView('dashboard');
      return true;
    } catch (error0) {
      setToken(null);
      return false;
    }
  };

  useEffect(() => {
    let active = true;

    const init = async () => {
      try {
        axios
          .get('/app-config')
          .then(({ data }) => {
            const payload = data?.payload || {};
            if (!active) return;
            if (payload?.appName || payload?.appLogo) {
              setPublicBrand({
                appName: payload.appName || 'SyncChat Admin',
                appLogo: resolveUploadUrl(payload.appLogo || ''),
              });
            }
          })
          .catch(() => {});
        const hasSession = await loadSession();
        await loadBootstrap({ hasSession });
      } catch (error0) {
        if (active) {
          setError(error0?.response?.data?.message || error0.message || 'Failed to load admin');
        }
      } finally {
        if (active) setBooting(false);
      }
    };

    init();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!admin || !token) {
      socket.disconnect();
      setAdminSocketConnected(false);
      return undefined;
    }

    socket.connect();

    const handleConnect = () => {
      socket.emit('admin/connect', { token });
      setAdminSocketConnected(true);
    };

    const handleDisconnect = () => {
      setAdminSocketConnected(false);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    if (socket.connected) {
      handleConnect();
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, [admin?._id]);

  useEffect(() => {
    const handleAnalytics = (payload) => {
      if (!payload || !analyticsAutoRefresh) return;
      setAnalyticsSummary(payload);
      setAnalyticsRefreshedAt(
        payload.refreshedAt || payload.system?.time || new Date().toISOString()
      );
    };

    socket.on('admin/analytics', handleAnalytics);
    return () => {
      socket.off('admin/analytics', handleAnalytics);
    };
  }, [analyticsAutoRefresh]);

  useEffect(() => {
    if (!admin || !can('analytics.read')) return undefined;
    if (!adminSocketConnected) return undefined;

    if (analyticsAutoRefresh) {
      socket.emit('admin/analytics/subscribe');
    } else {
      socket.emit('admin/analytics/unsubscribe');
    }

    return () => {
      socket.emit('admin/analytics/unsubscribe');
    };
  }, [admin?._id, adminSocketConnected, analyticsAutoRefresh, permissionKey]);

  useEffect(() => {
    if (!can('analytics.read')) return undefined;
    if (!analyticsAutoRefresh) return undefined;
    if (adminSocketConnected) return undefined;
    if (section !== 'overview' && section !== 'analytics') return undefined;

    const timer = setInterval(() => {
      loadAnalyticsSummary({ force: false });
    }, 60000);

    return () => clearInterval(timer);
  }, [section, analyticsAutoRefresh, adminSocketConnected, permissionKey]);

  useEffect(() => {
    if (view !== 'dashboard') return undefined;
    if (!can('app_config.read')) return undefined;
    if (appConfigLoaded) return undefined;
    loadAppConfig().finally(() => setAppConfigLoaded(true));
    return undefined;
  }, [view, appConfigLoaded, permissionKey]);

  useEffect(() => {
    if (section !== 'analytics') return undefined;
    if (!can('analytics.read')) return undefined;
    if (!analyticsRange.start || !analyticsRange.end) return undefined;
    loadAnalyticsRange();
    return undefined;
  }, [section, analyticsRange.start, analyticsRange.end, permissionKey]);

  useEffect(() => {
    if (section !== 'channels') return undefined;
    if (!selectedChannelId) return undefined;
    loadChannelReviews(selectedChannelId);
    return undefined;
  }, [section, selectedChannelId, channelReviewFilter, permissionKey]);

  const handleChange = (key) => (event) => {
    clearMessages();
    setForm((prev) => ({ ...prev, [key]: event.target.value }));
  };

  const submitLogin = async (event) => {
    event.preventDefault();
    clearMessages();

    try {
      setLoading(true);
      const { data } = await axios.post('/admin/login', {
        email: normalizedEmail,
        password: form.password,
      });

      setToken(data?.payload?.token);
      setAdmin(data?.payload?.admin || null);
      setNotice('Welcome back');
      setView('dashboard');
      setForm({ email: '', password: '' });
      await loadSession();
    } catch (error0) {
      setError(error0?.response?.data?.message || error0.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await axios.post('/admin/logout');
    } catch (error0) {
      // ignore
    }
    socket.disconnect();
    setToken(null);
    setAdmin(null);
    setPermissions([]);
    setAppConfigLoaded(false);
    applyView('login');
  };

  const loadAdminData = async (nextSection) => {
    if (!nextSection) return;
    clearMessages();
    try {
      if (nextSection === 'admins' && can('admin.read')) {
        const [rolesRes, adminsRes, permissionsRes] = await Promise.all([
          axios.get('/admin/roles'),
          axios.get('/admin/admins'),
          axios.get('/admin/permissions'),
        ]);
        setRoles(rolesRes.data?.payload || []);
        setAdmins(adminsRes.data?.payload || []);
        setPermissionList(permissionsRes.data?.payload || []);
      }
      if (nextSection === 'admin-create' && can('admin.manage')) {
        const { data } = await axios.get('/admin/roles');
        setRoles(data?.payload || []);
      }
      if (nextSection === 'permissions' && can('roles.read')) {
        const [rolesRes, permissionsRes] = await Promise.all([
          axios.get('/admin/roles'),
          axios.get('/admin/permissions'),
        ]);
        setRoles(rolesRes.data?.payload || []);
        setPermissionList(permissionsRes.data?.payload || []);
      }
      if (nextSection === 'sessions' && can('sessions.read')) {
        const { data } = await axios.get('/admin/sessions');
        setSessions(data?.payload || []);
      }
      if (nextSection === 'keys' && can('access_keys.read')) {
        const { data } = await axios.get('/admin/access-keys');
        setAccessKeys(data?.payload || []);
      }
      if (nextSection === 'audit' && can('audit.read')) {
        const { data } = await axios.get('/admin/audit-logs');
        setAuditLogs(data?.payload || []);
      }
      if (nextSection === 'overview' && can('analytics.read')) {
        await loadAnalyticsSummary({ force: false });
      }
      if (nextSection === 'analytics' && can('analytics.read')) {
        await loadAnalyticsSummary({ force: false });
        if (!analyticsRange.start || !analyticsRange.end) {
          const end = new Date();
          const start = new Date();
          start.setDate(end.getDate() - 6);
          const toIso = (date) => date.toISOString().slice(0, 10);
          setAnalyticsRange({ start: toIso(start), end: toIso(end) });
        }
      }
      if (nextSection === 'app-config' && can('app_config.read')) {
        await loadAppConfig();
      }
    } catch (error0) {
      setError(error0?.response?.data?.message || error0.message || 'Failed to load data');
      setAnalyticsLoading(false);
    }
  };

  const loadUsers = async () => {
    if (!can('users.read')) return;
    setUserLoading(true);
    clearMessages();
    try {
      const params = {
        q: userFilters.query || undefined,
        status: userFilters.status !== 'all' ? userFilters.status : undefined,
        verified: userFilters.verified !== 'all' ? userFilters.verified : undefined,
        lastSeen: userFilters.lastSeen !== 'any' ? userFilters.lastSeen : undefined,
        limit: 100,
      };
      const { data } = await axios.get('/admin/users', { params });
      setUsers(data?.payload?.users || []);
      if (selectedUserId) {
        const exists = (data?.payload?.users || []).some(
          (item) => item._id === selectedUserId
        );
        if (!exists) {
          setSelectedUserId('');
          setUserDetail(null);
        }
      }
    } catch (error0) {
      setError(error0?.response?.data?.message || error0.message || 'Failed to load users');
    } finally {
      setUserLoading(false);
    }
  };

  const loadUserDetail = async (userId) => {
    if (!userId) return;
    clearMessages();
    try {
      const { data } = await axios.get(`/admin/users/${userId}`);
      setUserDetail(data?.payload || null);
    } catch (error0) {
      setError(error0?.response?.data?.message || error0.message || 'Failed to load user');
    }
  };

  const loadAccountExports = async () => {
    if (!can('data.export')) return;
    setExportsLoading(true);
    clearMessages();
    try {
      const params = {
        status: exportsFilter !== 'all' ? exportsFilter : undefined,
        limit: 100,
      };
      const { data } = await axios.get('/admin/account-exports', { params });
      setExportRequests(data?.payload?.exports || []);
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to load exports'
      );
    } finally {
      setExportsLoading(false);
    }
  };

  const loadGroups = async () => {
    if (!can('groups.read')) return;
    setGroupLoading(true);
    clearMessages();
    try {
      const params = {
        q: groupFilters.query || undefined,
        status: groupFilters.status !== 'all' ? groupFilters.status : undefined,
        accessType: groupFilters.accessType !== 'all' ? groupFilters.accessType : undefined,
        limit: 100,
      };
      const { data } = await axios.get('/admin/groups', { params });
      setGroups(data?.payload?.groups || []);
      if (selectedGroupId) {
        const exists = (data?.payload?.groups || []).some(
          (item) => item._id === selectedGroupId
        );
        if (!exists) {
          setSelectedGroupId('');
          setGroupDetail(null);
        }
      }
    } catch (error0) {
      setError(error0?.response?.data?.message || error0.message || 'Failed to load groups');
    } finally {
      setGroupLoading(false);
    }
  };

  const loadGroupDetail = async (groupId) => {
    if (!groupId) return;
    clearMessages();
    try {
      const { data } = await axios.get(`/admin/groups/${groupId}`);
      const payload = data?.payload || null;
      setGroupDetail(payload);
      if (payload?.group) {
        setGroupForm({
          name: payload.group.name || '',
          desc: payload.group.desc || '',
          accessType: payload.group.accessType || 'public',
          password: '',
        });
        setGroupPermissionsForm({
          memberCanEditInfo: !!payload.group.permissions?.memberCanEditInfo,
          memberCanSendMessage: !!payload.group.permissions?.memberCanSendMessage,
          memberCanAddMember: !!payload.group.permissions?.memberCanAddMember,
          memberCanInviteViaLink: !!payload.group.permissions?.memberCanInviteViaLink,
          adminApprovalRequired: !!payload.group.permissions?.adminApprovalRequired,
        });
        setGroupModerationForm({
          slowModeSeconds: payload.group.moderation?.slowModeSeconds || 0,
          bannedWords: Array.isArray(payload.group.moderation?.bannedWords)
            ? payload.group.moderation.bannedWords.join(', ')
            : '',
          blockedMediaTypes: Array.isArray(payload.group.moderation?.blockedMediaTypes)
            ? payload.group.moderation.blockedMediaTypes
            : [],
          autoReportViolations:
            payload.group.moderation?.autoReportViolations !== false,
        });
      }
    } catch (error0) {
      setError(error0?.response?.data?.message || error0.message || 'Failed to load group');
    }
  };

  const handleUpdateGroup = async () => {
    if (!selectedGroupId) return;
    setGroupSaving(true);
    clearMessages();
    try {
      const { data } = await axios.patch(`/admin/groups/${selectedGroupId}`, {
        name: groupForm.name,
        desc: groupForm.desc,
        accessType: groupForm.accessType,
        password: groupForm.password || undefined,
      });
      setNotice(data?.message || 'Group updated');
      await loadGroups();
      await loadGroupDetail(selectedGroupId);
      setGroupForm((prev) => ({ ...prev, password: '' }));
    } catch (error0) {
      setError(error0?.response?.data?.message || error0.message || 'Failed to update group');
    } finally {
      setGroupSaving(false);
    }
  };

  const handleUpdateGroupPermissions = async () => {
    if (!selectedGroupId) return;
    setGroupSaving(true);
    clearMessages();
    try {
      const { data } = await axios.patch(`/admin/groups/${selectedGroupId}/permissions`, {
        permissions: groupPermissionsForm,
      });
      setNotice(data?.message || 'Permissions updated');
      await loadGroupDetail(selectedGroupId);
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to update permissions'
      );
    } finally {
      setGroupSaving(false);
    }
  };

  const handleUpdateGroupModeration = async () => {
    if (!selectedGroupId) return;
    setGroupSaving(true);
    clearMessages();
    try {
      const moderation = {
        slowModeSeconds: Number(groupModerationForm.slowModeSeconds || 0),
        bannedWords: groupModerationForm.bannedWords
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
        blockedMediaTypes: groupModerationForm.blockedMediaTypes,
        autoReportViolations: !!groupModerationForm.autoReportViolations,
      };
      const { data } = await axios.patch(`/admin/groups/${selectedGroupId}/moderation`, {
        moderation,
      });
      setNotice(data?.message || 'Moderation updated');
      await loadGroupDetail(selectedGroupId);
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to update moderation'
      );
    } finally {
      setGroupSaving(false);
    }
  };

  const handlePromoteGroupAdmin = async (userId) => {
    try {
      const { data } = await axios.post(`/admin/groups/${selectedGroupId}/promote-admin`, {
        userId,
      });
      setNotice(data?.message || 'Admin promoted');
      await loadGroupDetail(selectedGroupId);
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to promote admin'
      );
    }
  };

  const handleDemoteGroupAdmin = async (userId) => {
    try {
      const { data } = await axios.post(`/admin/groups/${selectedGroupId}/demote-admin`, {
        userId,
      });
      setNotice(data?.message || 'Admin demoted');
      await loadGroupDetail(selectedGroupId);
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to demote admin'
      );
    }
  };

  const handleRemoveGroupMember = async (userId) => {
    try {
      const { data } = await axios.post(`/admin/groups/${selectedGroupId}/remove-member`, {
        userId,
      });
      setNotice(data?.message || 'Member removed');
      await loadGroupDetail(selectedGroupId);
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to remove member'
      );
    }
  };

  const handleApproveGroupMember = async (userId) => {
    try {
      const { data } = await axios.post(`/admin/groups/${selectedGroupId}/approve-member`, {
        userId,
      });
      setNotice(data?.message || 'Member approved');
      await loadGroupDetail(selectedGroupId);
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to approve member'
      );
    }
  };

  const handleRejectGroupMember = async (userId) => {
    try {
      const { data } = await axios.post(`/admin/groups/${selectedGroupId}/reject-member`, {
        userId,
      });
      setNotice(data?.message || 'Member rejected');
      await loadGroupDetail(selectedGroupId);
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to reject member'
      );
    }
  };

  const handleBanGroup = async () => {
    try {
      const { data } = await axios.post(`/admin/groups/${selectedGroupId}/ban`);
      setNotice(data?.message || 'Group banned');
      await loadGroups();
      await loadGroupDetail(selectedGroupId);
    } catch (error0) {
      setError(error0?.response?.data?.message || error0.message || 'Failed to ban group');
    }
  };

  const handleUnbanGroup = async () => {
    try {
      const { data } = await axios.post(`/admin/groups/${selectedGroupId}/unban`);
      setNotice(data?.message || 'Group unbanned');
      await loadGroups();
      await loadGroupDetail(selectedGroupId);
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to unban group'
      );
    }
  };

  const handleDeleteGroup = async (mode) => {
    try {
      const { data } = await axios.delete(`/admin/groups/${selectedGroupId}`, {
        params: { mode },
      });
      setNotice(data?.message || 'Group deleted');
      await loadGroups();
      setSelectedGroupId('');
      setGroupDetail(null);
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to delete group'
      );
    }
  };

  const loadChannels = async () => {
    if (!can('channels.read')) return;
    setChannelLoading(true);
    clearMessages();
    try {
      const params = {
        q: channelFilters.query || undefined,
        status: channelFilters.status !== 'all' ? channelFilters.status : undefined,
        accessType:
          channelFilters.accessType !== 'all' ? channelFilters.accessType : undefined,
        limit: 100,
      };
      const { data } = await axios.get('/admin/channels', { params });
      setChannels(data?.payload?.channels || []);
      if (selectedChannelId) {
        const exists = (data?.payload?.channels || []).some(
          (item) => item._id === selectedChannelId
        );
        if (!exists) {
          setSelectedChannelId('');
          setChannelDetail(null);
        }
      }
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to load channels'
      );
    } finally {
      setChannelLoading(false);
    }
  };

  const loadChannelDetail = async (channelId) => {
    if (!channelId) return;
    clearMessages();
    try {
      const { data } = await axios.get(`/admin/channels/${channelId}`);
      const payload = data?.payload || null;
      setChannelDetail(payload);
      if (payload?.channel) {
        setChannelForm({
          name: payload.channel.name || '',
          desc: payload.channel.desc || '',
          accessType: payload.channel.accessType || 'public',
          password: '',
        });
        setChannelPermissionsForm({
          memberCanEditInfo: !!payload.channel.permissions?.memberCanEditInfo,
          memberCanSendMessage: !!payload.channel.permissions?.memberCanSendMessage,
          memberCanAddMember: !!payload.channel.permissions?.memberCanAddMember,
          memberCanInviteViaLink: !!payload.channel.permissions?.memberCanInviteViaLink,
          adminApprovalRequired: !!payload.channel.permissions?.adminApprovalRequired,
        });
        setChannelModerationForm({
          slowModeSeconds: payload.channel.moderation?.slowModeSeconds || 0,
          bannedWords: Array.isArray(payload.channel.moderation?.bannedWords)
            ? payload.channel.moderation.bannedWords.join(', ')
            : '',
          blockedMediaTypes: Array.isArray(payload.channel.moderation?.blockedMediaTypes)
            ? payload.channel.moderation.blockedMediaTypes
            : [],
          autoReportViolations:
            payload.channel.moderation?.autoReportViolations !== false,
        });
      }
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to load channel'
      );
    }
  };

  const loadChannelReviews = async (channelId = selectedChannelId) => {
    if (!channelId || !can('channels.read')) return;
    setChannelReviewLoading(true);
    try {
      const { data } = await axios.get(`/admin/channels/${channelId}/reviews`, {
        params: {
          status: channelReviewFilter,
          limit: 50,
        },
      });
      const payload = data?.payload || {};
      setChannelReviewStats(payload.stats || { ratingAvg: 0, ratingCount: 0 });
      setChannelReviews(Array.isArray(payload.reviews) ? payload.reviews : []);
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to load reviews'
      );
    } finally {
      setChannelReviewLoading(false);
    }
  };

  const handleChannelReviewAction = async (reviewId, action) => {
    if (!selectedChannelId || !reviewId) return;
    try {
      const { data } = await axios.patch(
        `/admin/channels/${selectedChannelId}/reviews/${reviewId}`,
        { action }
      );
      setNotice(data?.message || 'Review updated');
      await loadChannelReviews(selectedChannelId);
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to update review'
      );
    }
  };

  const handleUpdateChannel = async () => {
    if (!selectedChannelId) return;
    setChannelSaving(true);
    clearMessages();
    try {
      const { data } = await axios.patch(`/admin/channels/${selectedChannelId}`, {
        name: channelForm.name,
        desc: channelForm.desc,
        accessType: channelForm.accessType,
        password: channelForm.password || undefined,
      });
      setNotice(data?.message || 'Channel updated');
      await loadChannels();
      await loadChannelDetail(selectedChannelId);
      setChannelForm((prev) => ({ ...prev, password: '' }));
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to update channel'
      );
    } finally {
      setChannelSaving(false);
    }
  };

  const handleUpdateChannelPermissions = async () => {
    if (!selectedChannelId) return;
    setChannelSaving(true);
    clearMessages();
    try {
      const { data } = await axios.patch(
        `/admin/channels/${selectedChannelId}/permissions`,
        {
          permissions: channelPermissionsForm,
        }
      );
      setNotice(data?.message || 'Permissions updated');
      await loadChannelDetail(selectedChannelId);
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to update permissions'
      );
    } finally {
      setChannelSaving(false);
    }
  };

  const handleUpdateChannelModeration = async () => {
    if (!selectedChannelId) return;
    setChannelSaving(true);
    clearMessages();
    try {
      const moderation = {
        slowModeSeconds: Number(channelModerationForm.slowModeSeconds || 0),
        bannedWords: channelModerationForm.bannedWords
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
        blockedMediaTypes: channelModerationForm.blockedMediaTypes,
        autoReportViolations: !!channelModerationForm.autoReportViolations,
      };
      const { data } = await axios.patch(
        `/admin/channels/${selectedChannelId}/moderation`,
        { moderation }
      );
      setNotice(data?.message || 'Moderation updated');
      await loadChannelDetail(selectedChannelId);
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to update moderation'
      );
    } finally {
      setChannelSaving(false);
    }
  };

  const handlePromoteChannelAdmin = async (userId) => {
    try {
      const { data } = await axios.post(
        `/admin/channels/${selectedChannelId}/promote-admin`,
        { userId }
      );
      setNotice(data?.message || 'Admin promoted');
      await loadChannelDetail(selectedChannelId);
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to promote admin'
      );
    }
  };

  const handleDemoteChannelAdmin = async (userId) => {
    try {
      const { data } = await axios.post(
        `/admin/channels/${selectedChannelId}/demote-admin`,
        { userId }
      );
      setNotice(data?.message || 'Admin demoted');
      await loadChannelDetail(selectedChannelId);
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to demote admin'
      );
    }
  };

  const handleRemoveChannelSubscriber = async (userId) => {
    try {
      const { data } = await axios.post(
        `/admin/channels/${selectedChannelId}/remove-subscriber`,
        { userId }
      );
      setNotice(data?.message || 'Subscriber removed');
      await loadChannelDetail(selectedChannelId);
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to remove subscriber'
      );
    }
  };

  const handleApproveChannelSubscriber = async (userId) => {
    try {
      const { data } = await axios.post(
        `/admin/channels/${selectedChannelId}/approve-subscriber`,
        { userId }
      );
      setNotice(data?.message || 'Subscriber approved');
      await loadChannelDetail(selectedChannelId);
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to approve subscriber'
      );
    }
  };

  const handleRejectChannelSubscriber = async (userId) => {
    try {
      const { data } = await axios.post(
        `/admin/channels/${selectedChannelId}/reject-subscriber`,
        { userId }
      );
      setNotice(data?.message || 'Subscriber rejected');
      await loadChannelDetail(selectedChannelId);
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to reject subscriber'
      );
    }
  };

  const handleBanChannel = async () => {
    try {
      const { data } = await axios.post(`/admin/channels/${selectedChannelId}/ban`);
      setNotice(data?.message || 'Channel banned');
      await loadChannels();
      await loadChannelDetail(selectedChannelId);
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to ban channel'
      );
    }
  };

  const handleUnbanChannel = async () => {
    try {
      const { data } = await axios.post(`/admin/channels/${selectedChannelId}/unban`);
      setNotice(data?.message || 'Channel unbanned');
      await loadChannels();
      await loadChannelDetail(selectedChannelId);
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to unban channel'
      );
    }
  };

  const handleDeleteChannel = async (mode) => {
    try {
      const { data } = await axios.delete(`/admin/channels/${selectedChannelId}`, {
        params: { mode },
      });
      setNotice(data?.message || 'Channel deleted');
      await loadChannels();
      setSelectedChannelId('');
      setChannelDetail(null);
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to delete channel'
      );
    }
  };

  const loadReports = async () => {
    if (!can('reports.read')) return;
    setModerationLoading(true);
    clearMessages();
    try {
      const params = {
        status: reportFilters.status !== 'all' ? reportFilters.status : undefined,
        roomType: reportFilters.roomType !== 'all' ? reportFilters.roomType : undefined,
        source: reportFilters.source !== 'all' ? reportFilters.source : undefined,
        limit: 100,
      };
      const { data } = await axios.get('/admin/reports', { params });
      const list = data?.payload || [];
      setReports(list);
      const lastSeenAt = getLastReportSeenAt();
      const newCount = list.filter((item) => {
        const createdAt = new Date(item?.createdAt || 0).getTime();
        return createdAt > lastSeenAt;
      }).length;
      setReportNewCount(newCount);
      if (selectedReportId) {
        const exists = list.some((item) => item._id === selectedReportId);
        if (!exists) {
          setSelectedReportId('');
        }
      }
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to load reports'
      );
    } finally {
      setModerationLoading(false);
    }
  };

  const loadModerationConfig = async () => {
    if (!can('reports.read')) return;
    try {
      const { data } = await axios.get('/admin/moderation/config');
      const payload = data?.payload || {};
      setModerationConfig({
        bannedWords: Array.isArray(payload.bannedWords) ? payload.bannedWords.join(', ') : '',
        blockedMediaTypes: Array.isArray(payload.blockedMediaTypes)
          ? payload.blockedMediaTypes
          : [],
        slowModePresets: Array.isArray(payload.slowModePresets)
          ? payload.slowModePresets.join(', ')
          : '0, 10, 30, 60, 120',
        autoReportViolations: payload.autoReportViolations !== false,
      });
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to load config'
      );
    }
  };

  const loadModerationActions = async () => {
    if (!can('reports.read')) return;
    try {
      const { data } = await axios.get('/admin/moderation/actions', {
        params: { limit: 120 },
      });
      setModerationActions(data?.payload || []);
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to load history'
      );
    }
  };

  const handleReportAction = async () => {
    if (!selectedReportId) return;
    try {
      const payload = {
        action: reportActionForm.action,
        note: reportActionForm.note,
        durationMinutes: reportActionForm.durationMinutes,
      };
      const { data } = await axios.post(`/admin/reports/${selectedReportId}/action`, payload);
      setNotice(data?.message || 'Report updated');
      await loadReports();
      await loadModerationActions();
      setReportActionForm((prev) => ({ ...prev, note: '' }));
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to apply action'
      );
    }
  };

  const handleUpdateModerationConfig = async () => {
    try {
      const payload = {
        bannedWords: moderationConfig.bannedWords
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
        blockedMediaTypes: moderationConfig.blockedMediaTypes,
        slowModePresets: moderationConfig.slowModePresets
          .split(',')
          .map((item) => Number(item.trim()))
          .filter((item) => Number.isFinite(item)),
        autoReportViolations: moderationConfig.autoReportViolations,
      };
      const { data } = await axios.patch('/admin/moderation/config', payload);
      setNotice(data?.message || 'Moderation config updated');
      await loadModerationConfig();
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to update config'
      );
    }
  };

  const loadContentChats = async () => {
    if (!can('content.delete')) return;
    setContentLoading(true);
    clearMessages();
    try {
      const params = {
        q: contentFilters.query || undefined,
        roomId: contentFilters.roomId || undefined,
        userId: contentFilters.userId || undefined,
        hasMedia: contentFilters.hasMedia !== 'any' ? contentFilters.hasMedia : undefined,
        fileType: contentFilters.fileType !== 'all' ? contentFilters.fileType : undefined,
        limit: 120,
      };
      const { data } = await axios.get('/admin/content/chats', { params });
      setContentChats(data?.payload || []);
      setSelectedContentChatIds((prev) =>
        prev.filter((id) => (data?.payload || []).some((item) => item._id === id))
      );
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to load messages'
      );
    } finally {
      setContentLoading(false);
    }
  };

  const handleDeleteContentChats = async (chatIds) => {
    if (!chatIds || chatIds.length === 0) return;
    try {
      const { data } = await axios.delete('/admin/content/chats', {
        data: { chatIds },
      });
      setNotice(data?.message || 'Messages deleted');
      setSelectedContentChatIds([]);
      await loadContentChats();
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to delete messages'
      );
    }
  };

  const loadContentStatuses = async () => {
    if (!can('content.delete')) return;
    clearMessages();
    try {
      const params = {
        userId: statusFilters.userId || undefined,
        type: statusFilters.type !== 'all' ? statusFilters.type : undefined,
        limit: 120,
      };
      const { data } = await axios.get('/admin/content/statuses', { params });
      setContentStatuses(data?.payload || []);
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to load statuses'
      );
    }
  };

  const handleDeleteStatus = async (statusId) => {
    if (!statusId) return;
    try {
      const { data } = await axios.delete(`/admin/content/statuses/${statusId}`);
      setNotice(data?.message || 'Status removed');
      await loadContentStatuses();
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to delete status'
      );
    }
  };

  const loadContentConfig = async () => {
    if (!can('content.delete')) return;
    try {
      const { data } = await axios.get('/admin/content/config');
      setContentConfig({
        blockedPreviewDomains: Array.isArray(data?.payload?.blockedPreviewDomains)
          ? data.payload.blockedPreviewDomains.join(', ')
          : '',
      });
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to load content config'
      );
    }
  };

  const handleUpdateContentConfig = async () => {
    try {
      const payload = {
        blockedPreviewDomains: contentConfig.blockedPreviewDomains
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      };
      const { data } = await axios.patch('/admin/content/config', payload);
      setNotice(data?.message || 'Content config updated');
      await loadContentConfig();
    } catch (error0) {
      setError(
        error0?.response?.data?.message ||
          error0.message ||
          'Failed to update content config'
      );
    }
  };

  const handleRemovePinnedMessage = async () => {
    if (!pinRemovalForm.roomId || !pinRemovalForm.chatId) return;
    try {
      const { data } = await axios.post('/admin/content/pins/remove', pinRemovalForm);
      setNotice(data?.message || 'Pinned message removed');
      setPinRemovalForm({ roomId: '', chatId: '' });
    } catch (error0) {
      setError(
        error0?.response?.data?.message ||
          error0.message ||
          'Failed to remove pinned message'
      );
    }
  };

  const handleTakedownPoll = async (chatId) => {
    if (!chatId) return;
    try {
      const { data } = await axios.post('/admin/content/polls/remove', { chatId });
      setNotice(data?.message || 'Poll removed');
      await loadContentChats();
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to remove poll'
      );
    }
  };

  const loadSecurityConfig = async () => {
    if (!can('security.read')) return;
    try {
      const { data } = await axios.get('/admin/security/config');
      const payload = data?.payload || {};
      const rate = payload.rateLimits || {};
      setSecurityConfig({
        blockedIps: Array.isArray(payload.blockedIps)
          ? payload.blockedIps.join(', ')
          : '',
        blockedFingerprints: Array.isArray(payload.blockedFingerprints)
          ? payload.blockedFingerprints.join(', ')
          : '',
        rateLimitsEnabled: rate.enabled === true,
        rateLimitWindow: Number(rate.windowSeconds || 60),
        rateLimitMax: Number(rate.maxRequests || 120),
      });
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to load security config'
      );
    }
  };

  const handleUpdateSecurityConfig = async () => {
    try {
      const payload = {
        blockedIps: securityConfig.blockedIps
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
        blockedFingerprints: securityConfig.blockedFingerprints
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
        rateLimits: {
          enabled: securityConfig.rateLimitsEnabled,
          windowSeconds: Number(securityConfig.rateLimitWindow || 60),
          maxRequests: Number(securityConfig.rateLimitMax || 120),
        },
      };
      const { data } = await axios.patch('/admin/security/config', payload);
      setNotice(data?.message || 'Security config updated');
      await loadSecurityConfig();
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to update security config'
      );
    }
  };

  const loadAppConfig = async () => {
    if (!can('app_config.read')) return;
    setAppConfigLoading(true);
    try {
      const { data } = await axios.get('/admin/app-config');
      const payload = data?.payload || {};
      setAppConfigForm({
        ...DEFAULT_APP_CONFIG_FORM,
        ...payload,
        appLogo: payload.appLogo || '',
        seo: {
          ...DEFAULT_APP_CONFIG_FORM.seo,
          ...(payload.seo || {}),
        },
        featureFlags: {
          ...DEFAULT_APP_CONFIG_FORM.featureFlags,
          ...(payload.featureFlags || {}),
        },
        uploadLimits: {
          ...DEFAULT_APP_CONFIG_FORM.uploadLimits,
          ...(payload.uploadLimits || {}),
        },
        mediaProfile: {
          ...DEFAULT_APP_CONFIG_FORM.mediaProfile,
          ...(payload.mediaProfile || {}),
        },
        maintenance: {
          ...DEFAULT_APP_CONFIG_FORM.maintenance,
          ...(payload.maintenance || {}),
        },
        defaultPrivacy: {
          ...DEFAULT_APP_CONFIG_FORM.defaultPrivacy,
          ...(payload.defaultPrivacy || {}),
        },
        defaultChat: {
          ...DEFAULT_APP_CONFIG_FORM.defaultChat,
          ...(payload.defaultChat || {}),
        },
        defaultNotifications: {
          ...DEFAULT_APP_CONFIG_FORM.defaultNotifications,
          ...(payload.defaultNotifications || {}),
        },
        smtp: {
          ...DEFAULT_APP_CONFIG_FORM.smtp,
          ...(payload.smtp || {}),
          pass: '',
          passSet: payload?.smtp?.passSet || false,
        },
      });
      setAppLogoPreview(resolveUploadUrl(payload.appLogo || ''));
      setSeoImagePreview(payload.seo?.image || '');
      if (payload.appName || payload.appLogo) {
        setPublicBrand({
          appName: payload.appName || 'SyncChat Admin',
          appLogo: resolveUploadUrl(payload.appLogo || ''),
        });
      }
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to load app config'
      );
    } finally {
      setAppConfigLoading(false);
    }
  };

  const loadAnalyticsSummary = async ({ force = false } = {}) => {
    if (!can('analytics.read')) return;
    setAnalyticsLoading(true);
    try {
      const { data } = await axios.get('/admin/analytics/summary', {
        params: force ? { force: 1 } : undefined,
      });
      setAnalyticsSummary(data?.payload || null);
      setAnalyticsRefreshedAt(data?.payload?.refreshedAt || '');
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to load analytics'
      );
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const loadAnalyticsRange = async () => {
    if (!can('analytics.read')) return;
    if (!analyticsRange.start || !analyticsRange.end) return;
    setAnalyticsRangeLoading(true);
    try {
      const { data } = await axios.get('/admin/analytics/range', {
        params: {
          start: analyticsRange.start,
          end: analyticsRange.end,
        },
      });
      setAnalyticsRangeData(data?.payload || null);
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to load range analytics'
      );
    } finally {
      setAnalyticsRangeLoading(false);
    }
  };

  const handleSaveAppConfig = async (event) => {
    if (event?.preventDefault) event.preventDefault();
    if (!can('app_config.write')) return;
    setAppConfigSaving(true);
    clearMessages();
    try {
      const appLogoValue = String(appConfigForm.appLogo || '').trim();
      const seoImageValue = String(appConfigForm.seo?.image || '').trim();
      const payload = {
        appName: String(appConfigForm.appName || '').trim(),
        supportEmail: String(appConfigForm.supportEmail || '').trim(),
        featureFlags: appConfigForm.featureFlags,
        seo: {
          title: String(appConfigForm.seo?.title || '').trim(),
          description: String(appConfigForm.seo?.description || '').trim(),
          keywords: String(appConfigForm.seo?.keywords || '').trim(),
          ogType: String(appConfigForm.seo?.ogType || 'website'),
          twitterCard: String(appConfigForm.seo?.twitterCard || 'summary_large_image'),
          ...(seoImageValue.startsWith('data:') ? { image: seoImageValue } : {}),
          ...(seoImageValue === '' && seoImagePreview === '' ? { image: '' } : {}),
        },
        uploadLimits: {
          chatMb: Number(appConfigForm.uploadLimits?.chatMb || 0),
          avatarMb: Number(appConfigForm.uploadLimits?.avatarMb || 0),
          allowedTypes: appConfigForm.uploadLimits?.allowedTypes || [],
        },
        mediaProfile: {
          defaultQuality: appConfigForm.mediaProfile?.defaultQuality || 'standard',
          hdEnabled: !!appConfigForm.mediaProfile?.hdEnabled,
        },
        maintenance: {
          enabled: !!appConfigForm.maintenance?.enabled,
          message: String(appConfigForm.maintenance?.message || ''),
        },
        defaultPrivacy: appConfigForm.defaultPrivacy,
        defaultChat: appConfigForm.defaultChat,
        defaultNotifications: appConfigForm.defaultNotifications,
        smtp: {
          host: String(appConfigForm.smtp?.host || ''),
          port: Number(appConfigForm.smtp?.port || 587),
          secure: !!appConfigForm.smtp?.secure,
          user: String(appConfigForm.smtp?.user || ''),
          fromName: String(appConfigForm.smtp?.fromName || ''),
          fromEmail: String(appConfigForm.smtp?.fromEmail || ''),
          ...(appConfigForm.smtp?.pass ? { pass: appConfigForm.smtp.pass } : {}),
        },
        ...(appLogoValue.startsWith('data:') ? { appLogo: appLogoValue } : {}),
        ...(appLogoValue === '' && appLogoPreview === '' ? { appLogo: '' } : {}),
      };

      const { data } = await axios.patch('/admin/app-config', payload);
      setNotice(data?.message || 'App config updated');
      setAppConfigForm((prev) => ({
        ...prev,
        ...data?.payload,
        smtp: {
          ...(data?.payload?.smtp || prev.smtp),
          pass: '',
          passSet: data?.payload?.smtp?.passSet || prev.smtp?.passSet || false,
        },
      }));
      if (data?.payload?.appName) {
        setPublicBrand((prev) => ({ ...prev, appName: data.payload.appName }));
      }
      if (data?.payload?.appLogo) {
        setAppLogoPreview(resolveUploadUrl(data.payload.appLogo));
        setPublicBrand((prev) => ({
          ...prev,
          appLogo: resolveUploadUrl(data.payload.appLogo),
        }));
      } else if (data?.payload?.appLogo === '') {
        setAppLogoPreview('');
        setPublicBrand((prev) => ({ ...prev, appLogo: '' }));
      }
      if (data?.payload?.seo?.image) {
        setSeoImagePreview(data.payload.seo.image);
      } else if (data?.payload?.seo?.image === '') {
        setSeoImagePreview('');
      }
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to update app config'
      );
    } finally {
      setAppConfigSaving(false);
    }
  };

  const loadUserSessions = async () => {
    if (!can('security.read') || !securityUserId) return;
    try {
      const { data } = await axios.get(`/admin/users/${securityUserId}/sessions`);
      setSecuritySessions(data?.payload || []);
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to load sessions'
      );
    }
  };

  const handleRevokeUserSession = async (sessionId) => {
    try {
      const { data } = await axios.post(
        `/admin/users/${securityUserId}/sessions/${sessionId}/revoke`
      );
      setNotice(data?.message || 'Session revoked');
      setSecuritySessions((prev) =>
        prev.map((item) => (item._id === sessionId ? data?.payload || item : item))
      );
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to revoke session'
      );
    }
  };

  const loadSuspiciousSessions = async () => {
    if (!can('security.read')) return;
    try {
      const params = {
        reviewed:
          suspiciousFilter === 'all'
            ? undefined
            : suspiciousFilter === 'reviewed'
              ? 'true'
              : 'false',
        limit: 120,
      };
      const { data } = await axios.get('/admin/security/suspicious-sessions', { params });
      setSuspiciousSessions(data?.payload || []);
    } catch (error0) {
      setError(
        error0?.response?.data?.message ||
          error0.message ||
          'Failed to load suspicious sessions'
      );
    }
  };

  const handleReviewSuspiciousSession = async (sessionId, action = 'review') => {
    try {
      const { data } = await axios.post(
        `/admin/security/suspicious-sessions/${sessionId}/review`,
        { action }
      );
      setNotice(data?.message || 'Suspicious session reviewed');
      await loadSuspiciousSessions();
    } catch (error0) {
      setError(
        error0?.response?.data?.message ||
          error0.message ||
          'Failed to review session'
      );
    }
  };

  const handleReportUserStatus = async (userId, action) => {
    if (!userId) return;
    try {
      const { data } = await axios.post(`/admin/users/${userId}/${action}`);
      setNotice(data?.message || 'User updated');
      await loadReports();
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to update user'
      );
    }
  };

  const handleReportGroupAction = async (groupId, action) => {
    if (!groupId) return;
    try {
      const { data } = await axios.post(`/admin/groups/${groupId}/${action}`);
      setNotice(data?.message || 'Group updated');
      await loadReports();
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to update group'
      );
    }
  };

  const handleReportChannelAction = async (channelId, action) => {
    if (!channelId) return;
    try {
      const { data } = await axios.post(`/admin/channels/${channelId}/${action}`);
      setNotice(data?.message || 'Channel updated');
      await loadReports();
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to update channel'
      );
    }
  };

  const handleReportRemoveMember = async ({ groupId, channelId, userId }) => {
    if (!userId || (!groupId && !channelId)) return;
    try {
      const url = groupId
        ? `/admin/groups/${groupId}/remove-member`
        : `/admin/channels/${channelId}/remove-subscriber`;
      const { data } = await axios.post(url, { userId });
      setNotice(data?.message || 'Member removed');
      await loadReports();
    } catch (error0) {
      setError(
        error0?.response?.data?.message ||
          error0.message ||
          'Failed to remove member'
      );
    }
  };

  const loadPushStatus = async () => {
    if (!can('security.read')) return;
    try {
      const { data } = await axios.get('/admin/security/push-status');
      setPushStatus(data?.payload || null);
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to load push status'
      );
    }
  };

  const loadEraseRequests = async () => {
    if (!can('security.read')) return;
    try {
      const params = {
        status: eraseFilters.status !== 'all' ? eraseFilters.status : undefined,
        limit: 120,
      };
      const { data } = await axios.get('/admin/gdpr/erase-requests', { params });
      setEraseRequests(data?.payload || []);
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to load erase requests'
      );
    }
  };

  const handleCreateEraseRequest = async () => {
    if (!eraseForm.userId) return;
    try {
      const { data } = await axios.post('/admin/gdpr/erase-requests', eraseForm);
      setNotice(data?.message || 'Erase request created');
      setEraseForm({ userId: '', note: '' });
      await loadEraseRequests();
    } catch (error0) {
      setError(
        error0?.response?.data?.message ||
          error0.message ||
          'Failed to create erase request'
      );
    }
  };

  const handleUpdateEraseRequest = async (requestId, status) => {
    try {
      const { data } = await axios.patch(`/admin/gdpr/erase-requests/${requestId}`, {
        status,
      });
      setNotice(data?.message || 'Erase request updated');
      setEraseRequests((prev) =>
        prev.map((item) => (item._id === requestId ? data?.payload || item : item))
      );
    } catch (error0) {
      setError(
        error0?.response?.data?.message ||
          error0.message ||
          'Failed to update erase request'
      );
    }
  };

  const toggleContentChatSelection = (chatId) => {
    setSelectedContentChatIds((prev) =>
      prev.includes(chatId) ? prev.filter((id) => id !== chatId) : [...prev, chatId]
    );
  };

  const handleBlockUser = async (userId) => {
    try {
      const { data } = await axios.post(`/admin/users/${userId}/block`);
      setNotice(data?.message || 'User blocked');
      await loadUsers();
      await loadUserDetail(userId);
    } catch (error0) {
      setError(error0?.response?.data?.message || error0.message || 'Failed to block user');
    }
  };

  const handleUnblockUser = async (userId) => {
    try {
      const { data } = await axios.post(`/admin/users/${userId}/unblock`);
      setNotice(data?.message || 'User unblocked');
      await loadUsers();
      await loadUserDetail(userId);
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to unblock user'
      );
    }
  };

  const handleBanUser = async (userId) => {
    try {
      const { data } = await axios.post(`/admin/users/${userId}/ban`);
      setNotice(data?.message || 'User banned');
      await loadUsers();
      await loadUserDetail(userId);
    } catch (error0) {
      setError(error0?.response?.data?.message || error0.message || 'Failed to ban user');
    }
  };

  const handleUnbanUser = async (userId) => {
    try {
      const { data } = await axios.post(`/admin/users/${userId}/unban`);
      setNotice(data?.message || 'User unbanned');
      await loadUsers();
      await loadUserDetail(userId);
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to unban user'
      );
    }
  };

  const handleForceLogoutUser = async (userId) => {
    try {
      const { data } = await axios.post(`/admin/users/${userId}/force-logout`);
      setNotice(data?.message || 'User sessions revoked');
      await loadUserDetail(userId);
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to logout sessions'
      );
    }
  };

  const handleResetTwoFactor = async (userId) => {
    try {
      const { data } = await axios.post(`/admin/users/${userId}/reset-2fa`);
      setNotice(data?.message || 'Two-factor reset');
      await loadUserDetail(userId);
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to reset 2FA'
      );
    }
  };

  const handleDeleteUser = async (userId, mode) => {
    try {
      const { data } = await axios.delete(`/admin/users/${userId}`, {
        params: { mode },
      });
      setNotice(data?.message || 'User deleted');
      await loadUsers();
      setSelectedUserId('');
      setUserDetail(null);
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to delete user'
      );
    }
  };

  const handleMarkExportDelivered = async (exportId) => {
    try {
      const { data } = await axios.post(
        `/admin/account-exports/${exportId}/mark-delivered`
      );
      setNotice(data?.message || 'Export marked as delivered');
      await loadAccountExports();
    } catch (error0) {
      setError(
        error0?.response?.data?.message || error0.message || 'Failed to update export'
      );
    }
  };

  useEffect(() => {
    if (view !== 'dashboard') return;
    loadAdminData(section);
  }, [section, view, permissionKey]);

  useEffect(() => {
    if (view !== 'dashboard' || section !== 'users') return;
    if (!can('users.read')) return;
    const handle = setTimeout(() => {
      loadUsers();
    }, 350);
    return () => clearTimeout(handle);
  }, [section, view, permissionKey, userFilters]);

  useEffect(() => {
    if (view !== 'dashboard' || section !== 'exports') return;
    if (!can('data.export')) return;
    loadAccountExports();
  }, [section, view, permissionKey, exportsFilter]);

  useEffect(() => {
    if (!selectedUserId || section !== 'users') return;
    loadUserDetail(selectedUserId);
  }, [selectedUserId, section]);

  useEffect(() => {
    if (view !== 'dashboard' || section !== 'groups') return;
    if (!can('groups.read')) return;
    const handle = setTimeout(() => {
      loadGroups();
    }, 350);
    return () => clearTimeout(handle);
  }, [section, view, permissionKey, groupFilters]);

  useEffect(() => {
    if (!selectedGroupId || section !== 'groups') return;
    loadGroupDetail(selectedGroupId);
  }, [selectedGroupId, section]);

  useEffect(() => {
    if (view !== 'dashboard' || section !== 'channels') return;
    if (!can('channels.read')) return;
    const handle = setTimeout(() => {
      loadChannels();
    }, 350);
    return () => clearTimeout(handle);
  }, [section, view, permissionKey, channelFilters]);

  useEffect(() => {
    if (!selectedChannelId || section !== 'channels') return;
    loadChannelDetail(selectedChannelId);
  }, [selectedChannelId, section]);

  useEffect(() => {
    if (view !== 'dashboard' || section !== 'moderation') return;
    if (!can('reports.read')) return;
    loadReports();
    loadModerationConfig();
    loadModerationActions();
  }, [section, view, permissionKey, reportFilters]);

  useEffect(() => {
    if (view !== 'dashboard' || section !== 'moderation') return;
    if (!can('reports.read')) return;
    if (!reports.length) return;
    const latest = reports
      .map((item) => new Date(item?.createdAt || 0).getTime())
      .filter((time) => Number.isFinite(time))
      .sort((a, b) => b - a)[0];
    if (latest) {
      setLastReportSeenAt(new Date(latest).toISOString());
      setReportNewCount(0);
    }
  }, [reports, section, view, permissionKey]);

  useEffect(() => {
    if (view !== 'dashboard' || section !== 'content') return;
    if (!can('content.delete')) return;
    const handle = setTimeout(() => {
      loadContentChats();
    }, 350);
    return () => clearTimeout(handle);
  }, [section, view, permissionKey, contentFilters]);

  useEffect(() => {
    if (view !== 'dashboard' || section !== 'content') return;
    if (!can('content.delete')) return;
    loadContentStatuses();
    loadContentConfig();
  }, [section, view, permissionKey, statusFilters]);

  useEffect(() => {
    if (view !== 'dashboard' || section !== 'security') return;
    if (!can('security.read')) return;
    loadSecurityConfig();
    loadSuspiciousSessions();
    loadPushStatus();
    loadEraseRequests();
  }, [section, view, permissionKey, suspiciousFilter, eraseFilters]);

  useEffect(() => {
    if (view !== 'dashboard' || section !== 'security') return;
    if (!can('data.export')) return;
    loadAccountExports();
  }, [section, view, permissionKey]);

  const handleCreateRole = async (event) => {
    event.preventDefault();
    clearMessages();
    try {
      const payload = {
        name: roleForm.name.trim().toLowerCase(),
        description: roleForm.description.trim(),
        permissions: roleForm.permissions,
      };
      const { data } = await axios.post('/admin/roles', payload);
      setRoles((prev) => [data.payload, ...prev]);
      setRoleForm({ name: '', description: '', permissions: [] });
      setNotice('Role created');
    } catch (error0) {
      setError(error0?.response?.data?.message || error0.message || 'Failed to create role');
    }
  };

  const handleAssignRole = async (adminId, roleId) => {
    try {
      const { data } = await axios.patch(`/admin/admins/${adminId}/role`, { roleId });
      setAdmins((prev) =>
        prev.map((item) => (item._id === adminId ? data.payload : item))
      );
      setNotice('Admin role updated');
    } catch (error0) {
      setError(error0?.response?.data?.message || error0.message || 'Failed to update role');
    }
  };

  const handleRevokeSession = async (sessionId) => {
    try {
      await axios.delete(`/admin/sessions/${sessionId}`);
      setSessions((prev) => prev.filter((item) => item._id !== sessionId));
      setNotice('Session revoked');
    } catch (error0) {
      setError(error0?.response?.data?.message || error0.message || 'Failed to revoke session');
    }
  };

  const handleCreateKey = async (event) => {
    event.preventDefault();
    clearMessages();
    try {
      const { data } = await axios.post('/admin/access-keys', { label: keyLabel.trim() });
      setAccessKeys((prev) => [
        {
          _id: data.payload?._id,
          label: data.payload?.label,
          active: true,
          createdAt: new Date().toISOString(),
          lastUsedAt: null,
        },
        ...prev,
      ]);
      setCreatedKey(data?.payload?.key || null);
      setKeyLabel('');
      setNotice('Access key created');
    } catch (error0) {
      setError(error0?.response?.data?.message || error0.message || 'Failed to create key');
    }
  };

  const handleRevokeKey = async (keyId) => {
    try {
      await axios.delete(`/admin/access-keys/${keyId}`);
      setAccessKeys((prev) =>
        prev.map((item) => (item._id === keyId ? { ...item, active: false } : item))
      );
      setNotice('Access key revoked');
    } catch (error0) {
      setError(error0?.response?.data?.message || error0.message || 'Failed to revoke key');
    }
  };

  const handleUpdateProfile = async (event) => {
    event.preventDefault();
    clearMessages();
    try {
      const avatarValue = profileForm.avatar.trim();
      const { data } = await axios.patch('/admin/profile', {
        fullname: profileForm.fullname.trim(),
        email: profileForm.email.trim(),
        avatar: avatarValue.startsWith('data:') ? avatarValue : undefined,
      });
      setAdmin(data?.payload || admin);
      setProfilePreview(
        resolveUploadUrl(data?.payload?.avatar || profileForm.avatar || '')
      );
      setNotice('Profile updated');
    } catch (error0) {
      setError(error0?.response?.data?.message || error0.message || 'Failed to update profile');
    }
  };

  const handleCreateAdmin = async (event) => {
    event.preventDefault();
    clearMessages();
    try {
      const avatarValue = createAdminForm.avatar.trim();
      const { data } = await axios.post('/admin/admins', {
        fullname: createAdminForm.fullname.trim(),
        email: createAdminForm.email.trim().toLowerCase(),
        password: createAdminForm.password,
        roleId: createAdminForm.roleId || undefined,
        avatar: avatarValue.startsWith('data:') ? avatarValue : undefined,
      });
      setAdmins((prev) => [data?.payload, ...prev]);
      setCreateAdminForm({
        fullname: '',
        email: '',
        password: '',
        roleId: '',
        avatar: '',
      });
      setCreatePreview('');
      setNotice('Admin created');
    } catch (error0) {
      setError(error0?.response?.data?.message || error0.message || 'Failed to create admin');
    }
  };

  const handleAvatarFile = (file, setter, previewSetter) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === 'string' ? reader.result : '';
      setter((prev) => ({ ...prev, avatar: value }));
      previewSetter(value);
    };
    reader.readAsDataURL(file);
  };

  const handleLogoFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === 'string' ? reader.result : '';
      setAppConfigForm((prev) => ({ ...prev, appLogo: value }));
      setAppLogoPreview(value);
    };
    reader.readAsDataURL(file);
  };

  const clearLogo = () => {
    setAppConfigForm((prev) => ({ ...prev, appLogo: '' }));
    setAppLogoPreview('');
  };

  const handleSeoImageFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === 'string' ? reader.result : '';
      setAppConfigForm((prev) => ({
        ...prev,
        seo: {
          ...(prev.seo || {}),
          image: value,
        },
      }));
      setSeoImagePreview(value);
    };
    reader.readAsDataURL(file);
  };

  const clearSeoImage = () => {
    setAppConfigForm((prev) => ({
      ...prev,
      seo: { ...(prev.seo || {}), image: '' },
    }));
    setSeoImagePreview('');
  };

  if (booting) {
    return (
      <div className="admin-boot">
        <div className="boot-card">
          <div className="boot-indicator" />
          <div>
            <p className="boot-title">Loading admin console</p>
            <p className="boot-sub">Checking access and configuration</p>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'dashboard') {
    return (
      <div className="admin-shell">
        <aside className="admin-sidebar">
          <div className="admin-brand">
            <div className="brand-mark">
              {appLogoPreview ? (
                <img src={appLogoPreview} alt="App logo" />
              ) : (
                'SC'
              )}
            </div>
            <div className="brand-text">
              <p className="brand-title">{appConfigForm.appName || 'SyncChat'}</p>
              <p className="brand-sub">Admin Console</p>
            </div>
            <div className="brand-admin">
                <div className="admin-avatar small">
                {admin?.avatar ? (
                  <img src={resolveUploadUrl(admin.avatar)} alt="Admin avatar" />
                ) : (
                  admin?.fullname?.trim()?.slice(0, 1)?.toUpperCase() || 'A'
                )}
              </div>
            </div>
          </div>

          <div className="admin-nav-scroll">
            <nav className="admin-nav">
            {sections.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`nav-item ${section === item.id ? 'active' : ''}`}
                  onClick={() => setSection(item.id)}
                >
                  <span className="nav-label">
                    <Icon />
                    {item.label}
                  </span>
                </button>
              );
            })}

            <div className="nav-group">
              <button
                type="button"
                className={`nav-item group ${reportMenuOpen ? 'open' : ''}`}
                onClick={() => setReportMenuOpen((prev) => !prev)}
              >
                <span className="nav-label">
                  <BiShieldQuarter />
                  User Reports
                </span>
                {reportNewCount > 0 && (
                  <span className="nav-badge">{reportNewCount}</span>
                )}
              </button>
              {reportMenuOpen && (
                <div className="nav-submenu">
                  {[
                    { id: 'chat', label: 'Chat report' },
                    { id: 'contact', label: 'Contact report' },
                    { id: 'group', label: 'Group report' },
                    { id: 'channel', label: 'Channel report' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`nav-item sub ${
                        section === 'moderation' && reportFilters.kind === item.id
                          ? 'active'
                          : ''
                      }`}
                      onClick={() => {
                        setSection('moderation');
                        setReportFilters((prev) => ({
                          ...prev,
                          kind: item.id,
                        }));
                      }}
                    >
                      <span className="nav-label">{item.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="nav-group">
              <button
                type="button"
                className={`nav-item group ${adminMenuOpen ? 'open' : ''}`}
                onClick={() => setAdminMenuOpen((prev) => !prev)}
              >
                <span className="nav-label">
                  <BiShieldQuarter />
                  Admin Management
                </span>
              </button>
              {adminMenuOpen && (
                <div className="nav-submenu">
                  {adminManagementSections.map((item) => {
                    const Icon = item.icon;
                    const badge =
                      item.id === 'admins'
                        ? admins.length || null
                        : item.id === 'sessions'
                          ? sessions.filter((row) => row.isActive).length || null
                          : item.id === 'audit'
                            ? auditLogs.length || null
                            : null;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`nav-item sub ${section === item.id ? 'active' : ''}`}
                        onClick={() => setSection(item.id)}
                      >
                        <span className="nav-label">
                          <Icon />
                          {item.label}
                        </span>
                        {badge ? <span className="nav-badge">{badge}</span> : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            </nav>
          </div>

          <div className="admin-footer">
            <div className="admin-mini">
              <div className="admin-avatar">
                {admin?.avatar ? (
                  <img src={resolveUploadUrl(admin.avatar)} alt="Admin avatar" />
                ) : (
                  admin?.fullname?.trim()?.slice(0, 1)?.toUpperCase() || 'A'
                )}
              </div>
              <div>
                <p className="admin-name">{admin?.fullname || 'Admin'}</p>
                <p className="admin-role">{admin?.role || 'super-admin'}</p>
              </div>
            </div>
            <button type="button" className="ghost-btn" onClick={handleLogout}>
              Sign out
            </button>
          </div>
        </aside>

        <main className="admin-content">
          <header className="content-header">
            <div>
              <p className="content-kicker">Admin</p>
              <h1>
                {sections.find((item) => item.id === section)?.label
                  || adminManagementSections.find((item) => item.id === section)?.label
                  || 'Dashboard'}
              </h1>
            </div>
            <div className="status-chip status-ready">
              <span className="status-dot" />
              System active
            </div>
          </header>

          {error && <div className="banner error">{error}</div>}
          {notice && <div className="banner success">{notice}</div>}

          {section === 'overview' && null}

          {section === 'overview' && (
            <section className="panel-card">
              <div className="panel-header">
                <div>
                  <h3>Analytics & Monitoring</h3>
                  <p className="muted">User growth, usage, storage, and moderation health.</p>
                  {analyticsRefreshedAt && (
                    <p className="muted">
                      Last refreshed: {formatDate(analyticsRefreshedAt)}
                    </p>
                  )}
                </div>
                <div className="panel-actions">
                  <label className="field checkbox-field">
                    <input
                      type="checkbox"
                      checked={analyticsAutoRefresh}
                      onChange={(event) => setAnalyticsAutoRefresh(event.target.checked)}
                    />
                    <span>Auto-refresh</span>
                  </label>
                  <button
                    type="button"
                    className="ghost-btn small"
                    onClick={() => loadAnalyticsSummary({ force: true })}
                    disabled={analyticsLoading}
                  >
                    {analyticsLoading ? 'Refreshing...' : 'Refresh'}
                  </button>
                  <span className="status-chip small">
                    {analyticsLoading ? 'Loading...' : 'Live'}
                  </span>
                </div>
              </div>
              {!can('analytics.read') && (
                <p className="muted">You do not have permission to view analytics.</p>
              )}
              {can('analytics.read') && analyticsSummary && (
                <div className="overview-grid">
                  <div className="overview-card">
                    <p className="overview-title">Total users</p>
                    <p className="overview-value">{analyticsSummary.users?.total || 0}</p>
                    <p className="overview-sub">
                      +{analyticsSummary.users?.new7d || 0} in last 7 days
                    </p>
                  </div>
                  <div className="overview-card">
                    <p className="overview-title">Active users</p>
                    <p className="overview-value">{analyticsSummary.users?.active24h || 0}</p>
                    <p className="overview-sub">
                      {analyticsSummary.users?.active7d || 0} active in last 7 days
                    </p>
                  </div>
                  <div className="overview-card">
                    <p className="overview-title">Messages</p>
                    <p className="overview-value">{analyticsSummary.messages?.total || 0}</p>
                    <p className="overview-sub">
                      {analyticsSummary.messages?.last7d || 0} in last 7 days
                    </p>
                  </div>
                  <div className="overview-card">
                    <p className="overview-title">Media uploads</p>
                    <p className="overview-value">{analyticsSummary.media?.filesTotal || 0}</p>
                    <p className="overview-sub">
                      {analyticsSummary.media?.files7d || 0} in last 7 days
                    </p>
                  </div>
                  <div className="overview-card">
                    <p className="overview-title">Voice notes</p>
                    <p className="overview-value">{analyticsSummary.media?.audioTotal || 0}</p>
                    <p className="overview-sub">
                      {analyticsSummary.media?.audio7d || 0} in last 7 days
                    </p>
                  </div>
                  <div className="overview-card">
                    <p className="overview-title">Video uploads</p>
                    <p className="overview-value">{analyticsSummary.media?.videoTotal || 0}</p>
                    <p className="overview-sub">
                      {analyticsSummary.media?.video7d || 0} in last 7 days
                    </p>
                  </div>
                  <div className="overview-card">
                    <p className="overview-title">Storage usage</p>
                    <p className="overview-value">
                      {formatBytes(analyticsSummary.storage?.bytesTotal || 0)}
                    </p>
                    <p className="overview-sub">
                      {formatBytes(analyticsSummary.storage?.bytes30d || 0)} added in 30 days
                    </p>
                  </div>
                  <div className="overview-card">
                    <p className="overview-title">Reports</p>
                    <p className="overview-value">{analyticsSummary.reports?.total || 0}</p>
                    <p className="overview-sub">
                      {analyticsSummary.reports?.open || 0} open ·{' '}
                      {analyticsSummary.reports?.reviewed7d || 0} reviewed (7d)
                    </p>
                  </div>
                  <div className="overview-card">
                    <p className="overview-title">Avg resolution</p>
                    <p className="overview-value">
                      {analyticsSummary.reports?.avgResolutionMs
                        ? `${Math.round(analyticsSummary.reports.avgResolutionMs / 3600000)}h`
                        : '—'}
                    </p>
                    <p className="overview-sub">Average review time (30d).</p>
                  </div>
                  <div className="overview-card">
                    <p className="overview-title">System health</p>
                    <p className="overview-value">
                      {formatBytes(analyticsSummary.system?.memory?.rss || 0)}
                    </p>
                    <p className="overview-sub">
                      Node {analyticsSummary.system?.node || '—'} ·{' '}
                      {analyticsSummary.system?.env || '—'}
                    </p>
                  </div>
                </div>
              )}
              {can('analytics.read') && analyticsSummary && (
                <div className="chart-grid">
                  <div className="chart-card">
                    <p className="overview-title">Last 7 Days Activity</p>
                    <div className="chart-canvas">
                      <Line
                        data={{
                          labels: analyticsSummary.series?.labels || [],
                          datasets: [
                            {
                              label: 'New users',
                              data: analyticsSummary.series?.newUsers || [],
                              borderColor: '#38bdf8',
                              backgroundColor: 'rgba(56, 189, 248, 0.2)',
                              tension: 0.3,
                            },
                            {
                              label: 'Messages',
                              data: analyticsSummary.series?.messages || [],
                              borderColor: '#22c55e',
                              backgroundColor: 'rgba(34, 197, 94, 0.2)',
                              tension: 0.3,
                            },
                          ],
                        }}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          plugins: { legend: { position: 'bottom' } },
                        }}
                      />
                    </div>
                  </div>

                  <div className="chart-card">
                    <p className="overview-title">Uploads & Reports (7d)</p>
                    <div className="chart-canvas">
                      <Bar
                        data={{
                          labels: analyticsSummary.series?.labels || [],
                          datasets: [
                            {
                              label: 'Uploads',
                              data: analyticsSummary.series?.uploads || [],
                              backgroundColor: 'rgba(59, 130, 246, 0.6)',
                            },
                            {
                              label: 'Reports',
                              data: analyticsSummary.series?.reports || [],
                              backgroundColor: 'rgba(249, 115, 22, 0.6)',
                            },
                          ],
                        }}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          plugins: { legend: { position: 'bottom' } },
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
              {can('analytics.read') && analyticsSummary && (
                <div className="panel-card section-gap">
                  <div className="panel-header">
                    <div>
                      <h3>System Widgets</h3>
                      <p className="muted">Live cards from analytics data.</p>
                    </div>
                  </div>
                  <div className="widget-grid">
                    <div className="widget-card">
                      <p className="widget-title">New users today</p>
                      <p className="widget-value">
                        {getLastSeriesValue(analyticsSummary.series?.newUsers)}
                      </p>
                      <p className="widget-sub">Last point (7d series)</p>
                    </div>
                    <div className="widget-card">
                      <p className="widget-title">Messages today</p>
                      <p className="widget-value">
                        {getLastSeriesValue(analyticsSummary.series?.messages)}
                      </p>
                      <p className="widget-sub">Last point (7d series)</p>
                    </div>
                    <div className="widget-card">
                      <p className="widget-title">Uploads today</p>
                      <p className="widget-value">
                        {getLastSeriesValue(analyticsSummary.series?.uploads)}
                      </p>
                      <p className="widget-sub">Last point (7d series)</p>
                    </div>
                    <div className="widget-card">
                      <p className="widget-title">Reports today</p>
                      <p className="widget-value">
                        {getLastSeriesValue(analyticsSummary.series?.reports)}
                      </p>
                      <p className="widget-sub">Last point (7d series)</p>
                    </div>
                    <div className="widget-card">
                      <p className="widget-title">Active users (24h)</p>
                      <p className="widget-value">
                        {analyticsSummary.users?.active24h || 0}
                      </p>
                      <p className="widget-sub">Rolling 24h</p>
                    </div>
                    <div className="widget-card">
                      <p className="widget-title">Open reports</p>
                      <p className="widget-value">
                        {analyticsSummary.reports?.open || 0}
                      </p>
                      <p className="widget-sub">Needs review</p>
                    </div>
                  </div>
                </div>
              )}
              {can('analytics.read') && analyticsSummary && (
                <div className="panel-card section-gap">
                  <div className="panel-header">
                    <div>
                      <h3>Server Status</h3>
                      <p className="muted">Real-time monitoring, load, and uptime.</p>
                    </div>
                    {can('system.manage') && (
                      <button
                        type="button"
                        className="danger-btn"
                        onClick={() => {
                          if (
                            window.confirm(
                              'Restart the server now? Active sessions may be interrupted.'
                            )
                          ) {
                            axios
                              .post('/admin/system/restart')
                              .then((res) => setNotice(res?.data?.message || 'Server restarting'))
                              .catch((error0) =>
                                setError(
                                  error0?.response?.data?.message ||
                                    error0.message ||
                                    'Failed to restart server'
                                )
                              );
                          }
                        }}
                      >
                        Reset server
                      </button>
                    )}
                  </div>
                  <div className="overview-grid">
                    <div className="overview-card">
                      <p className="overview-title">Uptime</p>
                      <p className="overview-value">
                        {formatUptime(analyticsSummary.system?.uptimeSeconds || 0)}
                      </p>
                      <p className="overview-sub">Minutes, hours, days, months, years.</p>
                    </div>
                    <div className="overview-card">
                      <p className="overview-title">Load avg</p>
                      <p className="overview-value">
                        {(Array.isArray(analyticsSummary.system?.load)
                          ? analyticsSummary.system.load
                          : []
                        )
                          .map((item) => Number(item || 0).toFixed(2))
                          .join(' · ') || '—'}
                      </p>
                      <p className="overview-sub">1m / 5m / 15m</p>
                    </div>
                    <div className="overview-card">
                      <p className="overview-title">Memory (RSS)</p>
                      <p className="overview-value">
                        {formatBytes(analyticsSummary.system?.memory?.rss || 0)}
                      </p>
                      <p className="overview-sub">
                        Heap {formatBytes(analyticsSummary.system?.memory?.heapUsed || 0)}
                      </p>
                    </div>
                    <div className="overview-card">
                      <p className="overview-title">Node</p>
                      <p className="overview-value">
                        {analyticsSummary.system?.node || '—'}
                      </p>
                      <p className="overview-sub">
                        {analyticsSummary.system?.env || '—'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}

          {section === 'analytics' && (
            <section className="panel-stack">
              <div className="panel-card">
                <div className="panel-header">
                  <div>
                    <h3>Analytics Explorer</h3>
                    <p className="muted">Filter and visualize usage trends.</p>
                  </div>
                  <div className="panel-actions">
                    <label className="field checkbox-field">
                      <input
                        type="checkbox"
                        checked={analyticsAutoRefresh}
                        onChange={(event) => setAnalyticsAutoRefresh(event.target.checked)}
                      />
                      <span>Auto-refresh</span>
                    </label>
                    <button
                      type="button"
                      className="ghost-btn small"
                      onClick={() => loadAnalyticsSummary({ force: true })}
                      disabled={analyticsLoading}
                    >
                      {analyticsLoading ? 'Refreshing...' : 'Refresh'}
                    </button>
                  </div>
                </div>

                {!can('analytics.read') && (
                  <p className="muted">You do not have permission to view analytics.</p>
                )}
                {can('analytics.read') && (
                  <div className="form-grid">
                    <label className="field">
                      <span>Start date</span>
                      <input
                        type="date"
                        value={analyticsRange.start}
                        onChange={(event) =>
                          setAnalyticsRange((prev) => ({
                            ...prev,
                            start: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span>End date</span>
                      <input
                        type="date"
                        value={analyticsRange.end}
                        onChange={(event) =>
                          setAnalyticsRange((prev) => ({
                            ...prev,
                            end: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={loadAnalyticsRange}
                      disabled={analyticsRangeLoading}
                    >
                      {analyticsRangeLoading ? 'Loading...' : 'Apply range'}
                    </button>
                  </div>
                )}
              </div>

              {can('analytics.read') && analyticsRangeData && (
                <section className="panel-grid">
                  <div className="panel-card">
                    <h3>Daily Activity (Stacked)</h3>
                    <div className="chart-canvas">
                      <Bar
                        data={{
                          labels: analyticsRangeData.labels || [],
                          datasets: [
                            {
                              label: 'Messages',
                              data: analyticsRangeData.series?.messages || [],
                              backgroundColor: 'rgba(34, 197, 94, 0.65)',
                              stack: 'activity',
                            },
                            {
                              label: 'Uploads',
                              data: analyticsRangeData.series?.uploads || [],
                              backgroundColor: 'rgba(59, 130, 246, 0.65)',
                              stack: 'activity',
                            },
                            {
                              label: 'Reports',
                              data: analyticsRangeData.series?.reports || [],
                              backgroundColor: 'rgba(249, 115, 22, 0.65)',
                              stack: 'activity',
                            },
                          ],
                        }}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          plugins: { legend: { position: 'bottom' } },
                          scales: {
                            x: { stacked: true },
                            y: { stacked: true },
                          },
                        }}
                      />
                    </div>
                  </div>

                  <div className="panel-card">
                    <h3>New Users Trend</h3>
                    <div className="chart-canvas">
                      <Line
                        data={{
                          labels: analyticsRangeData.labels || [],
                          datasets: [
                            {
                              label: 'New users',
                              data: analyticsRangeData.series?.newUsers || [],
                              borderColor: '#0ea5e9',
                              backgroundColor: 'rgba(14, 165, 233, 0.2)',
                              tension: 0.3,
                            },
                          ],
                        }}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          plugins: { legend: { position: 'bottom' } },
                        }}
                      />
                    </div>
                  </div>

                  <div className="panel-card">
                    <h3>Report Status</h3>
                    <div className="chart-canvas">
                      <Doughnut
                        data={{
                          labels: Object.keys(analyticsRangeData.reportStatus || {}),
                          datasets: [
                            {
                              data: Object.values(analyticsRangeData.reportStatus || {}),
                              backgroundColor: [
                                'rgba(239, 68, 68, 0.7)',
                                'rgba(34, 197, 94, 0.7)',
                                'rgba(59, 130, 246, 0.7)',
                                'rgba(148, 163, 184, 0.7)',
                              ],
                              borderWidth: 0,
                            },
                          ],
                        }}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          plugins: { legend: { position: 'bottom' } },
                        }}
                      />
                    </div>
                  </div>
                </section>
              )}
            </section>
          )}

          {section === 'app-config' && (
            <form className="panel-grid app-config-grid" onSubmit={handleSaveAppConfig}>
              <div className="panel-card">
                <h3>App Identity</h3>
                {!can('app_config.read') && (
                  <p className="muted">You do not have permission to view app config.</p>
                )}
                {can('app_config.read') && (
                  <div className="form-grid">
                    <div className="field">
                      <span>App logo</span>
                      <div className="logo-upload">
                        <div className="avatar-preview">
                          {appLogoPreview ? (
                            <img src={resolveUploadUrl(appLogoPreview)} alt="App logo" />
                          ) : (
                            <span className="table-avatar">SC</span>
                          )}
                        </div>
                        <label className="pill checkbox">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(event) => handleLogoFile(event.target.files?.[0])}
                          />
                          <span>Upload logo</span>
                        </label>
                        {appLogoPreview && (
                          <button type="button" className="clear-btn" onClick={clearLogo}>
                            Clear logo
                          </button>
                        )}
                      </div>
                    </div>
                    <label className="field">
                      <span>App name</span>
                      <input
                        value={appConfigForm.appName}
                        onChange={(event) =>
                          setAppConfigForm((prev) => ({
                            ...prev,
                            appName: event.target.value,
                          }))
                        }
                        placeholder="SyncChat"
                      />
                    </label>
                    <label className="field">
                      <span>Support email</span>
                      <input
                        type="email"
                        value={appConfigForm.supportEmail}
                        onChange={(event) =>
                          setAppConfigForm((prev) => ({
                            ...prev,
                            supportEmail: event.target.value,
                          }))
                        }
                        placeholder="support@syncchat.app"
                      />
                    </label>
                  </div>
                )}
              </div>

              <div className="panel-card">
                <h3>Maintenance Mode</h3>
                {can('app_config.read') && (
                  <div className="form-grid">
                    <label className="field checkbox-field">
                      <input
                        type="checkbox"
                        checked={!!appConfigForm.maintenance?.enabled}
                        onChange={(event) =>
                          setAppConfigForm((prev) => ({
                            ...prev,
                            maintenance: {
                              ...(prev.maintenance || {}),
                              enabled: event.target.checked,
                            },
                          }))
                        }
                      />
                      <span>Enable maintenance banner for users</span>
                    </label>
                    <label className="field">
                      <span>Maintenance message</span>
                      <input
                        value={appConfigForm.maintenance?.message || ''}
                        onChange={(event) =>
                          setAppConfigForm((prev) => ({
                            ...prev,
                            maintenance: {
                              ...(prev.maintenance || {}),
                              message: event.target.value,
                            },
                          }))
                        }
                        placeholder="We'll be back shortly."
                      />
                    </label>
                  </div>
                )}
              </div>

              <div className="panel-card">
                <h3>Upload Limits</h3>
                {can('app_config.read') && (
                  <div className="form-grid">
                    <label className="field">
                      <span>Chat upload limit (MB)</span>
                      <input
                        type="number"
                        min="1"
                        value={appConfigForm.uploadLimits?.chatMb || 0}
                        onChange={(event) =>
                          setAppConfigForm((prev) => ({
                            ...prev,
                            uploadLimits: {
                              ...(prev.uploadLimits || {}),
                              chatMb: Number(event.target.value || 0),
                            },
                          }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Avatar upload limit (MB)</span>
                      <input
                        type="number"
                        min="1"
                        value={appConfigForm.uploadLimits?.avatarMb || 0}
                        onChange={(event) =>
                          setAppConfigForm((prev) => ({
                            ...prev,
                            uploadLimits: {
                              ...(prev.uploadLimits || {}),
                              avatarMb: Number(event.target.value || 0),
                            },
                          }))
                        }
                      />
                    </label>
                    <div className="field">
                      <span>Allowed file types</span>
                      <div className="pill-wrap">
                        {['image', 'video', 'audio', 'document'].map((type) => {
                          const allowed =
                            appConfigForm.uploadLimits?.allowedTypes?.includes(type);
                          return (
                            <label key={type} className="pill checkbox">
                              <input
                                type="checkbox"
                                checked={!!allowed}
                                onChange={(event) =>
                                  setAppConfigForm((prev) => {
                                    const current =
                                      Array.isArray(prev.uploadLimits?.allowedTypes)
                                        ? prev.uploadLimits.allowedTypes
                                        : [];
                                    const next = event.target.checked
                                      ? [...new Set([...current, type])]
                                      : current.filter((item) => item !== type);
                                    return {
                                      ...prev,
                                      uploadLimits: {
                                        ...(prev.uploadLimits || {}),
                                        allowedTypes: next,
                                      },
                                    };
                                  })
                                }
                              />
                              <span>{type}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="panel-card">
                <h3>Media Profile</h3>
                {can('app_config.read') && (
                  <div className="form-grid">
                    <label className="field">
                      <span>Default media quality</span>
                      <select
                        className="select"
                        value={appConfigForm.mediaProfile?.defaultQuality || 'standard'}
                        onChange={(event) =>
                          setAppConfigForm((prev) => ({
                            ...prev,
                            mediaProfile: {
                              ...(prev.mediaProfile || {}),
                              defaultQuality: event.target.value,
                            },
                          }))
                        }
                      >
                        <option value="standard">Standard</option>
                        <option value="hd">HD</option>
                      </select>
                    </label>
                    <label className="field checkbox-field">
                      <input
                        type="checkbox"
                        checked={!!appConfigForm.mediaProfile?.hdEnabled}
                        onChange={(event) =>
                          setAppConfigForm((prev) => ({
                            ...prev,
                            mediaProfile: {
                              ...(prev.mediaProfile || {}),
                              hdEnabled: event.target.checked,
                            },
                          }))
                        }
                      />
                      <span>Allow HD processing</span>
                    </label>
                  </div>
                )}
              </div>

              <div className="panel-card">
                <h3>Feature Flags</h3>
                {can('app_config.read') && (
                  <div className="form-grid">
                    {Object.entries(appConfigForm.featureFlags || {}).map(
                      ([key, value]) => (
                        <label className="field checkbox-field" key={key}>
                          <input
                            type="checkbox"
                            checked={!!value}
                            onChange={(event) =>
                              setAppConfigForm((prev) => ({
                                ...prev,
                                featureFlags: {
                                  ...(prev.featureFlags || {}),
                                  [key]: event.target.checked,
                                },
                              }))
                            }
                          />
                          <span>{key.replace(/_/g, ' ')}</span>
                        </label>
                      )
                    )}
                  </div>
                )}
              </div>

              <div className="panel-card">
                <h3>SMTP Settings</h3>
                {can('app_config.read') && (
                  <div className="form-grid">
                    <label className="field">
                      <span>SMTP host</span>
                      <input
                        value={appConfigForm.smtp?.host || ''}
                        onChange={(event) =>
                          setAppConfigForm((prev) => ({
                            ...prev,
                            smtp: {
                              ...(prev.smtp || {}),
                              host: event.target.value,
                            },
                          }))
                        }
                        placeholder="smtp.mailprovider.com"
                      />
                    </label>
                    <label className="field">
                      <span>SMTP port</span>
                      <input
                        type="number"
                        min="1"
                        value={appConfigForm.smtp?.port || 587}
                        onChange={(event) =>
                          setAppConfigForm((prev) => ({
                            ...prev,
                            smtp: {
                              ...(prev.smtp || {}),
                              port: Number(event.target.value || 587),
                            },
                          }))
                        }
                      />
                    </label>
                    <label className="field checkbox-field">
                      <input
                        type="checkbox"
                        checked={!!appConfigForm.smtp?.secure}
                        onChange={(event) =>
                          setAppConfigForm((prev) => ({
                            ...prev,
                            smtp: {
                              ...(prev.smtp || {}),
                              secure: event.target.checked,
                            },
                          }))
                        }
                      />
                      <span>Use TLS/SSL</span>
                    </label>
                    <label className="field">
                      <span>SMTP username</span>
                      <input
                        value={appConfigForm.smtp?.user || ''}
                        onChange={(event) =>
                          setAppConfigForm((prev) => ({
                            ...prev,
                            smtp: {
                              ...(prev.smtp || {}),
                              user: event.target.value,
                            },
                          }))
                        }
                        placeholder="mailer@syncchat.app"
                      />
                    </label>
                    <label className="field">
                      <span>SMTP password</span>
                      <input
                        type="password"
                        value={appConfigForm.smtp?.pass || ''}
                        onChange={(event) =>
                          setAppConfigForm((prev) => ({
                            ...prev,
                            smtp: {
                              ...(prev.smtp || {}),
                              pass: event.target.value,
                            },
                          }))
                        }
                        placeholder={
                          appConfigForm.smtp?.passSet
                            ? 'Password saved'
                            : 'Enter SMTP password'
                        }
                      />
                    </label>
                    <label className="field">
                      <span>From name</span>
                      <input
                        value={appConfigForm.smtp?.fromName || ''}
                        onChange={(event) =>
                          setAppConfigForm((prev) => ({
                            ...prev,
                            smtp: {
                              ...(prev.smtp || {}),
                              fromName: event.target.value,
                            },
                          }))
                        }
                        placeholder="SyncChat"
                      />
                    </label>
                    <label className="field">
                      <span>From email</span>
                      <input
                        value={appConfigForm.smtp?.fromEmail || ''}
                        onChange={(event) =>
                          setAppConfigForm((prev) => ({
                            ...prev,
                            smtp: {
                              ...(prev.smtp || {}),
                              fromEmail: event.target.value,
                            },
                          }))
                        }
                        placeholder="no-reply@syncchat.app"
                      />
                    </label>
                  </div>
                )}
              </div>

              <div className="panel-card">
                <h3>Default Privacy</h3>
                {can('app_config.read') && (
                  <div className="form-grid">
                    {[
                      { key: 'lastSeenVisibility', label: 'Last seen' },
                      { key: 'onlineVisibility', label: 'Online' },
                      { key: 'profilePhotoVisibility', label: 'Profile photo' },
                      { key: 'statusVisibility', label: 'Status' },
                      { key: 'groupsVisibility', label: 'Groups' },
                    ].map((item) => (
                      <label className="field" key={item.key}>
                        <span>{item.label}</span>
                        <select
                          className="select"
                          value={appConfigForm.defaultPrivacy?.[item.key] || 'everyone'}
                          onChange={(event) =>
                            setAppConfigForm((prev) => ({
                              ...prev,
                              defaultPrivacy: {
                                ...(prev.defaultPrivacy || {}),
                                [item.key]: event.target.value,
                              },
                            }))
                          }
                        >
                          <option value="everyone">Everyone</option>
                          <option value="my_contacts">My contacts</option>
                          <option value="nobody">Nobody</option>
                        </select>
                      </label>
                    ))}
                    {[
                      { key: 'readReceiptsEnabled', label: 'Read receipts' },
                      { key: 'messageRequestsEnabled', label: 'Message requests' },
                      { key: 'disableLinkPreviews', label: 'Disable link previews' },
                      {
                        key: 'securityNotificationsEnabled',
                        label: 'Security notifications',
                      },
                    ].map((item) => (
                      <label className="field checkbox-field" key={item.key}>
                        <input
                          type="checkbox"
                          checked={!!appConfigForm.defaultPrivacy?.[item.key]}
                          onChange={(event) =>
                            setAppConfigForm((prev) => ({
                              ...prev,
                              defaultPrivacy: {
                                ...(prev.defaultPrivacy || {}),
                                [item.key]: event.target.checked,
                              },
                            }))
                          }
                        />
                        <span>{item.label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="panel-card">
                <h3>SEO Settings</h3>
                {can('app_config.read') && (
                  <div className="form-grid">
                    <div className="field">
                      <span>SEO image</span>
                      <div className="logo-upload">
                        <div className="avatar-preview">
                          {seoImagePreview ? (
                            <img src={seoImagePreview} alt="SEO preview" />
                          ) : (
                            <span className="table-avatar">OG</span>
                          )}
                        </div>
                        <label className="pill checkbox">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(event) => handleSeoImageFile(event.target.files?.[0])}
                          />
                          <span>Upload image</span>
                        </label>
                        {seoImagePreview && (
                          <button type="button" className="clear-btn" onClick={clearSeoImage}>
                            Clear image
                          </button>
                        )}
                      </div>
                    </div>
                    <label className="field">
                      <span>SEO title</span>
                      <input
                        value={appConfigForm.seo?.title || ''}
                        onChange={(event) =>
                          setAppConfigForm((prev) => ({
                            ...prev,
                            seo: { ...(prev.seo || {}), title: event.target.value },
                          }))
                        }
                        placeholder="SyncChat - Secure Messaging"
                      />
                    </label>
                    <label className="field">
                      <span>SEO description</span>
                      <textarea
                        value={appConfigForm.seo?.description || ''}
                        onChange={(event) =>
                          setAppConfigForm((prev) => ({
                            ...prev,
                            seo: { ...(prev.seo || {}), description: event.target.value },
                          }))
                        }
                        placeholder="Short description for search engines."
                      />
                    </label>
                    <label className="field">
                      <span>SEO keywords</span>
                      <input
                        value={appConfigForm.seo?.keywords || ''}
                        onChange={(event) =>
                          setAppConfigForm((prev) => ({
                            ...prev,
                            seo: { ...(prev.seo || {}), keywords: event.target.value },
                          }))
                        }
                        placeholder="chat, messaging, secure"
                      />
                    </label>
                    <label className="field">
                      <span>OpenGraph type</span>
                      <select
                        className="select"
                        value={appConfigForm.seo?.ogType || 'website'}
                        onChange={(event) =>
                          setAppConfigForm((prev) => ({
                            ...prev,
                            seo: { ...(prev.seo || {}), ogType: event.target.value },
                          }))
                        }
                      >
                        <option value="website">Website</option>
                        <option value="article">Article</option>
                        <option value="profile">Profile</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>Twitter card</span>
                      <select
                        className="select"
                        value={appConfigForm.seo?.twitterCard || 'summary_large_image'}
                        onChange={(event) =>
                          setAppConfigForm((prev) => ({
                            ...prev,
                            seo: { ...(prev.seo || {}), twitterCard: event.target.value },
                          }))
                        }
                      >
                        <option value="summary_large_image">Summary large image</option>
                        <option value="summary">Summary</option>
                      </select>
                    </label>
                  </div>
                )}
              </div>

              <div className="panel-card">
                <h3>Default Chat Settings</h3>
                {can('app_config.read') && (
                  <div className="form-grid">
                    <label className="field checkbox-field">
                      <input
                        type="checkbox"
                        checked={!!appConfigForm.defaultChat?.enterToSend}
                        onChange={(event) =>
                          setAppConfigForm((prev) => ({
                            ...prev,
                            defaultChat: {
                              ...(prev.defaultChat || {}),
                              enterToSend: event.target.checked,
                            },
                          }))
                        }
                      />
                      <span>Enter to send</span>
                    </label>
                    <label className="field">
                      <span>Default media quality</span>
                      <select
                        className="select"
                        value={appConfigForm.defaultChat?.mediaQuality || 'standard'}
                        onChange={(event) =>
                          setAppConfigForm((prev) => ({
                            ...prev,
                            defaultChat: {
                              ...(prev.defaultChat || {}),
                              mediaQuality: event.target.value,
                            },
                          }))
                        }
                      >
                        <option value="standard">Standard</option>
                        <option value="hd">HD</option>
                      </select>
                    </label>
                    {[
                      { key: 'autoDownloadPhotos', label: 'Auto-download photos' },
                      { key: 'autoDownloadAudio', label: 'Auto-download audio' },
                      { key: 'autoDownloadVideos', label: 'Auto-download videos' },
                      { key: 'autoDownloadDocuments', label: 'Auto-download documents' },
                      { key: 'spellCheckEnabled', label: 'Spell check' },
                      { key: 'replaceTextWithEmoji', label: 'Replace text with emoji' },
                      { key: 'keepArchived', label: 'Keep archived chats' },
                    ].map((item) => (
                      <label className="field checkbox-field" key={item.key}>
                        <input
                          type="checkbox"
                          checked={!!appConfigForm.defaultChat?.[item.key]}
                          onChange={(event) =>
                            setAppConfigForm((prev) => ({
                              ...prev,
                              defaultChat: {
                                ...(prev.defaultChat || {}),
                                [item.key]: event.target.checked,
                              },
                            }))
                          }
                        />
                        <span>{item.label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="panel-card">
                <h3>Default Notifications</h3>
                {can('app_config.read') && (
                  <div className="form-grid">
                    {[
                      { key: 'showNotificationBanner', label: 'Banner notifications' },
                      { key: 'showPopupNotification', label: 'Popup notifications' },
                      { key: 'showPushNotification', label: 'Push notifications' },
                      { key: 'notifyMessages', label: 'Message alerts' },
                      { key: 'notifyGroups', label: 'Group alerts' },
                      { key: 'notifyStatus', label: 'Status alerts' },
                      { key: 'notifyCalls', label: 'Call alerts' },
                      { key: 'showNotificationPreviews', label: 'Notification previews' },
                      {
                        key: 'outgoingMessageSoundEnabled',
                        label: 'Outgoing message sounds',
                      },
                    ].map((item) => (
                      <label className="field checkbox-field" key={item.key}>
                        <input
                          type="checkbox"
                          checked={!!appConfigForm.defaultNotifications?.[item.key]}
                          onChange={(event) =>
                            setAppConfigForm((prev) => ({
                              ...prev,
                              defaultNotifications: {
                                ...(prev.defaultNotifications || {}),
                                [item.key]: event.target.checked,
                              },
                            }))
                          }
                        />
                        <span>{item.label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="panel-card app-config-save">
                <h3>Save change</h3>
                {!can('app_config.write') && (
                  <p className="muted">You do not have permission to update app config.</p>
                )}
                {can('app_config.write') && (
                  <button type="submit" className="primary-btn" disabled={appConfigSaving}>
                    {appConfigSaving ? 'Saving...' : 'Save change'}
                  </button>
                )}
                {appConfigLoading && (
                  <p className="muted">Loading app config...</p>
                )}
              </div>
            </form>
          )}

          {section === 'users' && (
            <section className="users-layout">
              <div className="panel-card users-panel">
                <div className="panel-header">
                  <div>
                    <h3>Users</h3>
                    <p className="muted">Search, filter, and manage user accounts.</p>
                  </div>
                  <span className="status-chip small">
                    {userLoading ? 'Loading...' : `${users.length} results`}
                  </span>
                </div>
                {!can('users.read') && (
                  <p className="muted">You do not have permission to view users.</p>
                )}
                {can('users.read') && (
                  <>
                    <div className="filter-grid">
                      <label className="field">
                        <span>Search</span>
                        <input
                          value={userFilters.query}
                          onChange={(event) =>
                            setUserFilters((prev) => ({
                              ...prev,
                              query: event.target.value,
                            }))
                          }
                          placeholder="Search by username, name, or email"
                        />
                      </label>
                      <label className="field">
                        <span>Status</span>
                        <select
                          className="select"
                          value={userFilters.status}
                          onChange={(event) =>
                            setUserFilters((prev) => ({
                              ...prev,
                              status: event.target.value,
                            }))
                          }
                        >
                          <option value="all">All</option>
                          <option value="active">Active</option>
                          <option value="blocked">Blocked</option>
                          <option value="banned">Banned</option>
                          <option value="deleted">Deleted</option>
                        </select>
                      </label>
                      <label className="field">
                        <span>Verification</span>
                        <select
                          className="select"
                          value={userFilters.verified}
                          onChange={(event) =>
                            setUserFilters((prev) => ({
                              ...prev,
                              verified: event.target.value,
                            }))
                          }
                        >
                          <option value="all">All</option>
                          <option value="true">Verified</option>
                          <option value="false">Unverified</option>
                        </select>
                      </label>
                      <label className="field">
                        <span>Last Seen</span>
                        <select
                          className="select"
                          value={userFilters.lastSeen}
                          onChange={(event) =>
                            setUserFilters((prev) => ({
                              ...prev,
                              lastSeen: event.target.value,
                            }))
                          }
                        >
                          <option value="any">Any time</option>
                          <option value="online">Online now</option>
                          <option value="offline">Offline</option>
                          <option value="7d">Last 7 days</option>
                          <option value="30d">Last 30 days</option>
                          <option value="90d">Last 90 days</option>
                          <option value="never">Never seen</option>
                        </select>
                      </label>
                    </div>
                    <div className="user-list">
                      {users.map((user) => (
                        <button
                          key={user._id}
                          type="button"
                          className={`user-row ${selectedUserId === user._id ? 'active' : ''}`}
                          onClick={() => {
                            setSelectedUserId(user._id);
                            setUserDetail(null);
                          }}
                        >
                          <div className="user-meta">
                            <div className="user-avatar">
                              {user.avatar ? (
                                <img src={user.avatar} alt={user.fullname || user.username} />
                              ) : (
                                (user.fullname || user.username || 'U')
                                  .slice(0, 1)
                                  .toUpperCase()
                              )}
                            </div>
                            <div>
                              <p className="user-name">{user.fullname || user.username}</p>
                              <p className="user-email">{user.email}</p>
                            </div>
                          </div>
                          <div className="user-tags">
                            <span className={`status-pill ${user.status || 'active'}`}>
                              {user.status || 'active'}
                            </span>
                            <span
                              className={`status-pill ${user.verified ? 'verified' : 'unverified'}`}
                            >
                              {user.verified ? 'Verified' : 'Unverified'}
                            </span>
                          </div>
                          <div className="user-last">
                            {user.online ? 'Online now' : `Last seen ${formatDate(user.lastSeenAt)}`}
                          </div>
                        </button>
                      ))}
                      {users.length === 0 && (
                        <div className="empty-state">
                          <p className="muted">
                            {userLoading ? 'Loading users...' : 'No users found.'}
                          </p>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="panel-card user-detail">
                <div className="panel-header">
                  <div>
                    <h3>User Profile</h3>
                    <p className="muted">Review activity and apply actions.</p>
                  </div>
                </div>
                {!selectedUserId && (
                  <p className="muted">Select a user to view full profile details.</p>
                )}
                {selectedUserId && !userDetail && (
                  <p className="muted">Loading user profile...</p>
                )}
                {selectedUserId && userDetail && (
                  <div className="detail-stack">
                    <div className="detail-hero">
                      <div className="user-avatar large">
                        {userDetail.profile?.avatar ? (
                          <img
                            src={userDetail.profile.avatar}
                            alt={userDetail.user?.fullname || userDetail.user?.username}
                          />
                        ) : (
                          (userDetail.user?.fullname || userDetail.user?.username || 'U')
                            .slice(0, 1)
                            .toUpperCase()
                        )}
                      </div>
                      <div>
                        <p className="user-name">
                          {userDetail.user?.fullname || userDetail.user?.username}
                        </p>
                        <p className="user-email">{userDetail.user?.email}</p>
                        <div className="user-tags">
                          <span
                            className={`status-pill ${userDetail.user?.status || 'active'}`}
                          >
                            {userDetail.user?.status || 'active'}
                          </span>
                          <span
                            className={`status-pill ${
                              userDetail.user?.verified ? 'verified' : 'unverified'
                            }`}
                          >
                            {userDetail.user?.verified ? 'Verified' : 'Unverified'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="detail-grid">
                      <div>
                        <p className="detail-label">Username</p>
                        <p className="detail-value">{userDetail.user?.username || '—'}</p>
                      </div>
                      <div>
                        <p className="detail-label">Phone</p>
                        <p className="detail-value">{userDetail.profile?.phone || '—'}</p>
                      </div>
                      <div>
                        <p className="detail-label">Last seen</p>
                        <p className="detail-value">
                          {formatDate(userDetail.activity?.lastSeenAt)}
                        </p>
                      </div>
                      <div>
                        <p className="detail-label">Active sessions</p>
                        <p className="detail-value">
                          {userDetail.activity?.activeSessions ?? '—'}
                        </p>
                      </div>
                      <div>
                        <p className="detail-label">Total sessions</p>
                        <p className="detail-value">
                          {userDetail.activity?.totalSessions ?? '—'}
                        </p>
                      </div>
                      <div>
                        <p className="detail-label">2FA status</p>
                        <p className="detail-value">
                          {userDetail.settings?.twoFactorEnabled ? 'Enabled' : 'Disabled'}
                        </p>
                      </div>
                      <div>
                        <p className="detail-label">Recovery codes</p>
                        <p className="detail-value">
                          {userDetail.settings?.twoFactorRecoveryRemaining ?? '—'}
                        </p>
                      </div>
                    </div>

                    <div className="detail-actions">
                      {can('users.ban') && userDetail.user?.status !== 'blocked' && (
                        <button
                          type="button"
                          className="warning-btn"
                          onClick={() => handleBlockUser(userDetail.user._id)}
                        >
                          Block user
                        </button>
                      )}
                      {can('users.ban') && userDetail.user?.status === 'blocked' && (
                        <button
                          type="button"
                          className="primary-btn"
                          onClick={() => handleUnblockUser(userDetail.user._id)}
                        >
                          Unblock user
                        </button>
                      )}
                      {can('users.ban') && userDetail.user?.status !== 'banned' && (
                        <button
                          type="button"
                          className="danger-btn"
                          onClick={() => handleBanUser(userDetail.user._id)}
                        >
                          Ban user
                        </button>
                      )}
                      {can('users.ban') && userDetail.user?.status === 'banned' && (
                        <button
                          type="button"
                          className="primary-btn"
                          onClick={() => handleUnbanUser(userDetail.user._id)}
                        >
                          Unban user
                        </button>
                      )}
                      {can('users.write') && (
                        <button
                          type="button"
                          className="ghost-btn dark"
                          onClick={() => handleForceLogoutUser(userDetail.user._id)}
                        >
                          Force logout sessions
                        </button>
                      )}
                      {can('users.write') && (
                        <button
                          type="button"
                          className="ghost-btn dark"
                          onClick={() => handleResetTwoFactor(userDetail.user._id)}
                        >
                          Reset 2FA & recovery
                        </button>
                      )}
                      {can('users.write') && (
                        <button
                          type="button"
                          className="danger-btn"
                          onClick={() => {
                            if (window.confirm('Soft delete this user account?')) {
                              handleDeleteUser(userDetail.user._id, 'soft');
                            }
                          }}
                        >
                          Soft delete
                        </button>
                      )}
                      {can('users.write') && (
                        <button
                          type="button"
                          className="danger-btn outline"
                          onClick={() => {
                            if (
                              window.confirm(
                                'Hard delete this user? This permanently removes data.'
                              )
                            ) {
                              handleDeleteUser(userDetail.user._id, 'hard');
                            }
                          }}
                        >
                          Hard delete
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {section === 'exports' && (
            <section className="panel-card">
              <div className="panel-header">
                <div>
                  <h3>Account Export Requests</h3>
                  <p className="muted">Review data export requests from users.</p>
                </div>
                <div className="panel-actions">
                  <select
                    className="select"
                    value={exportsFilter}
                    onChange={(event) => setExportsFilter(event.target.value)}
                  >
                    <option value="pending">Pending</option>
                    <option value="delivered">Delivered</option>
                    <option value="expired">Expired</option>
                    <option value="all">All</option>
                  </select>
                  <button type="button" className="ghost-btn dark" onClick={loadAccountExports}>
                    Refresh
                  </button>
                </div>
              </div>
              {!can('data.export') && (
                <p className="muted">
                  You do not have permission to review account export requests.
                </p>
              )}
              {can('data.export') && (
                <div className="table">
                  <div className="table-row header cols-6">
                    <span>User</span>
                    <span>Email</span>
                    <span>Requested</span>
                    <span>Expires</span>
                    <span>Status</span>
                    <span>Action</span>
                  </div>
                  {exportRequests.map((row) => {
                    const statusLabel = row.deliveredAt
                      ? 'Delivered'
                      : row.expiresAt && new Date(row.expiresAt) < new Date()
                        ? 'Expired'
                        : 'Pending';
                    return (
                      <div className="table-row cols-6" key={row._id}>
                        <span>{row.user?.fullname || row.user?.username || row.userId}</span>
                        <span>{row.user?.email || '—'}</span>
                        <span>{formatDate(row.requestedAt)}</span>
                        <span>{formatDate(row.expiresAt)}</span>
                        <span>
                          <span className={`status-pill ${statusLabel.toLowerCase()}`}>
                            {statusLabel}
                          </span>
                        </span>
                        <span className="action-stack">
                          {row.fileUrl && (
                            <a
                              className="ghost-link inline"
                              href={row.fileUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Download
                            </a>
                          )}
                          {!row.deliveredAt && (
                            <button
                              type="button"
                              className="ghost-btn small dark"
                              onClick={() => handleMarkExportDelivered(row._id)}
                            >
                              Mark delivered
                            </button>
                          )}
                        </span>
                      </div>
                    );
                  })}
                  {exportRequests.length === 0 && (
                    <div className="empty-state">
                      <p className="muted">
                        {exportsLoading
                          ? 'Loading export requests...'
                          : 'No export requests found.'}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {section === 'groups' && (
            <section className="users-layout">
              <div className="panel-card users-panel">
                <div className="panel-header">
                  <div>
                    <h3>Groups</h3>
                    <p className="muted">Search, review, and manage group settings.</p>
                  </div>
                  <span className="status-chip small">
                    {groupLoading ? 'Loading...' : `${groups.length} results`}
                  </span>
                </div>
                {!can('groups.read') && (
                  <p className="muted">You do not have permission to view groups.</p>
                )}
                {can('groups.read') && (
                  <>
                    <div className="filter-grid">
                      <label className="field">
                        <span>Search</span>
                        <input
                          value={groupFilters.query}
                          onChange={(event) =>
                            setGroupFilters((prev) => ({
                              ...prev,
                              query: event.target.value,
                            }))
                          }
                          placeholder="Search by group name or link"
                        />
                      </label>
                      <label className="field">
                        <span>Status</span>
                        <select
                          className="select"
                          value={groupFilters.status}
                          onChange={(event) =>
                            setGroupFilters((prev) => ({
                              ...prev,
                              status: event.target.value,
                            }))
                          }
                        >
                          <option value="all">All</option>
                          <option value="active">Active</option>
                          <option value="banned">Banned</option>
                          <option value="deleted">Deleted</option>
                        </select>
                      </label>
                      <label className="field">
                        <span>Access</span>
                        <select
                          className="select"
                          value={groupFilters.accessType}
                          onChange={(event) =>
                            setGroupFilters((prev) => ({
                              ...prev,
                              accessType: event.target.value,
                            }))
                          }
                        >
                          <option value="all">All</option>
                          <option value="public">Public</option>
                          <option value="private">Private</option>
                        </select>
                      </label>
                    </div>
                    <div className="user-list">
                      {groups.map((group) => (
                        <button
                          key={group._id}
                          type="button"
                          className={`user-row ${selectedGroupId === group._id ? 'active' : ''}`}
                          onClick={() => {
                            setSelectedGroupId(group._id);
                            setGroupDetail(null);
                          }}
                        >
                          <div className="user-meta">
                            <div className="user-avatar">
                              {group.avatar ? (
                                <img src={group.avatar} alt={group.name} />
                              ) : (
                                (group.name || 'G').slice(0, 1).toUpperCase()
                              )}
                            </div>
                            <div>
                              <p className="user-name">{group.name}</p>
                              <p className="user-email">
                                {group.accessType} · {group.memberCount || 0} members
                              </p>
                            </div>
                          </div>
                          <div className="user-tags">
                            <span className={`status-pill ${group.status || 'active'}`}>
                              {group.status || 'active'}
                            </span>
                            <span className="status-pill">
                              {group.pendingCount || 0} pending
                            </span>
                          </div>
                        </button>
                      ))}
                      {groups.length === 0 && (
                        <div className="empty-state">
                          <p className="muted">
                            {groupLoading ? 'Loading groups...' : 'No groups found.'}
                          </p>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="panel-card user-detail">
                <div className="panel-header">
                  <div>
                    <h3>Group Profile</h3>
                    <p className="muted">Manage group settings and members.</p>
                  </div>
                </div>
                {!selectedGroupId && (
                  <p className="muted">Select a group to view full details.</p>
                )}
                {selectedGroupId && !groupDetail && (
                  <p className="muted">Loading group profile...</p>
                )}
                {selectedGroupId && groupDetail && (
                  <div className="detail-stack">
                    <div className="detail-hero">
                      <div className="user-avatar large">
                        {groupDetail.group?.avatar ? (
                          <img src={groupDetail.group.avatar} alt={groupDetail.group?.name} />
                        ) : (
                          (groupDetail.group?.name || 'G').slice(0, 1).toUpperCase()
                        )}
                      </div>
                      <div>
                        <p className="user-name">{groupDetail.group?.name}</p>
                        <p className="user-email">{groupDetail.group?.link}</p>
                        <div className="user-tags">
                          <span
                            className={`status-pill ${groupDetail.group?.status || 'active'}`}
                          >
                            {groupDetail.group?.status || 'active'}
                          </span>
                          <span className="status-pill">
                            {groupDetail.group?.accessType || 'public'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="detail-grid">
                      <div>
                        <p className="detail-label">Members</p>
                        <p className="detail-value">{groupDetail.members?.length || 0}</p>
                      </div>
                      <div>
                        <p className="detail-label">Admins</p>
                        <p className="detail-value">{groupDetail.admins?.length || 0}</p>
                      </div>
                      <div>
                        <p className="detail-label">Pending</p>
                        <p className="detail-value">{groupDetail.pending?.length || 0}</p>
                      </div>
                    </div>

                    <div className="form-grid">
                      <h4 className="section-title">Group Settings</h4>
                      <label className="field">
                        <span>Name</span>
                        <input
                          value={groupForm.name}
                          onChange={(event) =>
                            setGroupForm((prev) => ({ ...prev, name: event.target.value }))
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Description</span>
                        <input
                          value={groupForm.desc}
                          onChange={(event) =>
                            setGroupForm((prev) => ({ ...prev, desc: event.target.value }))
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Access Type</span>
                        <select
                          className="select"
                          value={groupForm.accessType}
                          onChange={(event) =>
                            setGroupForm((prev) => ({
                              ...prev,
                              accessType: event.target.value,
                            }))
                          }
                        >
                          <option value="public">Public</option>
                          <option value="private">Private</option>
                        </select>
                      </label>
                      {groupForm.accessType === 'private' && (
                        <label className="field">
                          <span>New Password</span>
                          <input
                            type="password"
                            value={groupForm.password}
                            onChange={(event) =>
                              setGroupForm((prev) => ({
                                ...prev,
                                password: event.target.value,
                              }))
                            }
                            placeholder="Leave blank to keep existing"
                          />
                        </label>
                      )}
                      <button
                        type="button"
                        className="primary-btn"
                        onClick={handleUpdateGroup}
                        disabled={groupSaving || !can('groups.write')}
                      >
                        Save group settings
                      </button>
                    </div>

                    <div className="form-grid">
                      <h4 className="section-title">Permissions</h4>
                      <label className="toggle-row">
                        <input
                          type="checkbox"
                          checked={groupPermissionsForm.memberCanSendMessage}
                          onChange={(event) =>
                            setGroupPermissionsForm((prev) => ({
                              ...prev,
                              memberCanSendMessage: event.target.checked,
                            }))
                          }
                        />
                        <span>Members can send messages</span>
                      </label>
                      <label className="toggle-row">
                        <input
                          type="checkbox"
                          checked={groupPermissionsForm.memberCanEditInfo}
                          onChange={(event) =>
                            setGroupPermissionsForm((prev) => ({
                              ...prev,
                              memberCanEditInfo: event.target.checked,
                            }))
                          }
                        />
                        <span>Members can edit group info</span>
                      </label>
                      <label className="toggle-row">
                        <input
                          type="checkbox"
                          checked={groupPermissionsForm.memberCanAddMember}
                          onChange={(event) =>
                            setGroupPermissionsForm((prev) => ({
                              ...prev,
                              memberCanAddMember: event.target.checked,
                            }))
                          }
                        />
                        <span>Members can add participants</span>
                      </label>
                      <label className="toggle-row">
                        <input
                          type="checkbox"
                          checked={groupPermissionsForm.memberCanInviteViaLink}
                          onChange={(event) =>
                            setGroupPermissionsForm((prev) => ({
                              ...prev,
                              memberCanInviteViaLink: event.target.checked,
                            }))
                          }
                        />
                        <span>Members can invite via link</span>
                      </label>
                      <label className="toggle-row">
                        <input
                          type="checkbox"
                          checked={groupPermissionsForm.adminApprovalRequired}
                          onChange={(event) =>
                            setGroupPermissionsForm((prev) => ({
                              ...prev,
                              adminApprovalRequired: event.target.checked,
                            }))
                          }
                        />
                        <span>Admin approval required for joins</span>
                      </label>
                      <button
                        type="button"
                        className="primary-btn"
                        onClick={handleUpdateGroupPermissions}
                        disabled={groupSaving || !can('groups.write')}
                      >
                        Save permissions
                      </button>
                    </div>

                    <div className="form-grid">
                      <h4 className="section-title">Moderation</h4>
                      <label className="field">
                        <span>Slow mode (seconds)</span>
                        <input
                          type="number"
                          min={0}
                          max={3600}
                          value={groupModerationForm.slowModeSeconds}
                          onChange={(event) =>
                            setGroupModerationForm((prev) => ({
                              ...prev,
                              slowModeSeconds: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Banned words (comma separated)</span>
                        <input
                          value={groupModerationForm.bannedWords}
                          onChange={(event) =>
                            setGroupModerationForm((prev) => ({
                              ...prev,
                              bannedWords: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <div className="toggle-grid">
                        {['image', 'video', 'audio', 'document'].map((type) => (
                          <label className="toggle-row" key={type}>
                            <input
                              type="checkbox"
                              checked={groupModerationForm.blockedMediaTypes.includes(type)}
                              onChange={(event) =>
                                setGroupModerationForm((prev) => ({
                                  ...prev,
                                  blockedMediaTypes: event.target.checked
                                    ? [...prev.blockedMediaTypes, type]
                                    : prev.blockedMediaTypes.filter((item) => item !== type),
                                }))
                              }
                            />
                            <span>Block {type}</span>
                          </label>
                        ))}
                      </div>
                      <label className="toggle-row">
                        <input
                          type="checkbox"
                          checked={groupModerationForm.autoReportViolations}
                          onChange={(event) =>
                            setGroupModerationForm((prev) => ({
                              ...prev,
                              autoReportViolations: event.target.checked,
                            }))
                          }
                        />
                        <span>Auto report violations</span>
                      </label>
                      <button
                        type="button"
                        className="primary-btn"
                        onClick={handleUpdateGroupModeration}
                        disabled={groupSaving || !can('groups.write')}
                      >
                        Save moderation
                      </button>
                    </div>

                    <div className="form-grid">
                      <h4 className="section-title">Admins</h4>
                      <div className="stack-list">
                        {groupDetail.admins?.map((adminUser) => (
                          <div className="stack-row" key={`admin-${adminUser.userId}`}>
                            <span>{adminUser.fullname || adminUser.username || adminUser.userId}</span>
                            {can('groups.write') && (
                              <button
                                type="button"
                                className="ghost-btn small dark"
                                onClick={() => handleDemoteGroupAdmin(adminUser.userId)}
                              >
                                Demote
                              </button>
                            )}
                          </div>
                        ))}
                        {groupDetail.admins?.length === 0 && (
                          <p className="muted">No admins found.</p>
                        )}
                      </div>
                    </div>

                    <div className="form-grid">
                      <h4 className="section-title">Members</h4>
                      <div className="stack-list">
                        {groupDetail.members?.map((member) => {
                          const isAdmin = groupDetail.admins?.some(
                            (adminUser) => adminUser.userId === member.userId
                          );
                          return (
                            <div className="stack-row" key={`member-${member.userId}`}>
                              <span>{member.fullname || member.username || member.userId}</span>
                              <div className="action-stack">
                                {can('groups.write') && !isAdmin && (
                                  <button
                                    type="button"
                                    className="ghost-btn small dark"
                                    onClick={() => handlePromoteGroupAdmin(member.userId)}
                                  >
                                    Promote
                                  </button>
                                )}
                                {can('groups.write') && (
                                  <button
                                    type="button"
                                    className="ghost-btn small dark"
                                    onClick={() => handleRemoveGroupMember(member.userId)}
                                  >
                                    Remove
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {groupDetail.members?.length === 0 && (
                          <p className="muted">No members found.</p>
                        )}
                      </div>
                    </div>

                    <div className="form-grid">
                      <h4 className="section-title">Join Requests</h4>
                      <div className="stack-list">
                        {groupDetail.pending?.map((member) => (
                          <div className="stack-row" key={`pending-${member.userId}`}>
                            <span>{member.fullname || member.username || member.userId}</span>
                            <div className="action-stack">
                              {can('groups.write') && (
                                <button
                                  type="button"
                                  className="ghost-btn small dark"
                                  onClick={() => handleApproveGroupMember(member.userId)}
                                >
                                  Approve
                                </button>
                              )}
                              {can('groups.write') && (
                                <button
                                  type="button"
                                  className="ghost-btn small dark"
                                  onClick={() => handleRejectGroupMember(member.userId)}
                                >
                                  Reject
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                        {groupDetail.pending?.length === 0 && (
                          <p className="muted">No pending requests.</p>
                        )}
                      </div>
                    </div>

                    <div className="detail-actions">
                      {can('groups.ban') && groupDetail.group?.status !== 'banned' && (
                        <button type="button" className="danger-btn" onClick={handleBanGroup}>
                          Ban group
                        </button>
                      )}
                      {can('groups.ban') && groupDetail.group?.status === 'banned' && (
                        <button type="button" className="primary-btn" onClick={handleUnbanGroup}>
                          Unban group
                        </button>
                      )}
                      {can('groups.write') && (
                        <button
                          type="button"
                          className="danger-btn"
                          onClick={() => {
                            if (window.confirm('Soft delete this group?')) {
                              handleDeleteGroup('soft');
                            }
                          }}
                        >
                          Soft delete
                        </button>
                      )}
                      {can('groups.write') && (
                        <button
                          type="button"
                          className="danger-btn outline"
                          onClick={() => {
                            if (
                              window.confirm(
                                'Hard delete this group? This permanently removes group data.'
                              )
                            ) {
                              handleDeleteGroup('hard');
                            }
                          }}
                        >
                          Hard delete
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {section === 'channels' && (
            <section className="users-layout">
              <div className="panel-card users-panel">
                <div className="panel-header">
                  <div>
                    <h3>Channels</h3>
                    <p className="muted">Search, review, and manage channel settings.</p>
                  </div>
                  <span className="status-chip small">
                    {channelLoading ? 'Loading...' : `${channels.length} results`}
                  </span>
                </div>
                {!can('channels.read') && (
                  <p className="muted">You do not have permission to view channels.</p>
                )}
                {can('channels.read') && (
                  <>
                    <div className="filter-grid">
                      <label className="field">
                        <span>Search</span>
                        <input
                          value={channelFilters.query}
                          onChange={(event) =>
                            setChannelFilters((prev) => ({
                              ...prev,
                              query: event.target.value,
                            }))
                          }
                          placeholder="Search by channel name or link"
                        />
                      </label>
                      <label className="field">
                        <span>Status</span>
                        <select
                          className="select"
                          value={channelFilters.status}
                          onChange={(event) =>
                            setChannelFilters((prev) => ({
                              ...prev,
                              status: event.target.value,
                            }))
                          }
                        >
                          <option value="all">All</option>
                          <option value="active">Active</option>
                          <option value="banned">Banned</option>
                          <option value="deleted">Deleted</option>
                        </select>
                      </label>
                      <label className="field">
                        <span>Access</span>
                        <select
                          className="select"
                          value={channelFilters.accessType}
                          onChange={(event) =>
                            setChannelFilters((prev) => ({
                              ...prev,
                              accessType: event.target.value,
                            }))
                          }
                        >
                          <option value="all">All</option>
                          <option value="public">Public</option>
                          <option value="private">Private</option>
                        </select>
                      </label>
                    </div>
                    <div className="user-list">
                      {channels.map((channel) => (
                        <button
                          key={channel._id}
                          type="button"
                          className={`user-row ${
                            selectedChannelId === channel._id ? 'active' : ''
                          }`}
                          onClick={() => {
                            setSelectedChannelId(channel._id);
                            setChannelDetail(null);
                          }}
                        >
                          <div className="user-meta">
                            <div className="user-avatar">
                              {channel.avatar ? (
                                <img src={channel.avatar} alt={channel.name} />
                              ) : (
                                (channel.name || 'C').slice(0, 1).toUpperCase()
                              )}
                            </div>
                            <div>
                              <p className="user-name">{channel.name}</p>
                              <p className="user-email">
                                {channel.accessType} · {channel.subscriberCount || 0} subscribers
                              </p>
                            </div>
                          </div>
                          <div className="user-tags">
                            <span className={`status-pill ${channel.status || 'active'}`}>
                              {channel.status || 'active'}
                            </span>
                            <span className="status-pill">
                              {channel.pendingCount || 0} pending
                            </span>
                          </div>
                        </button>
                      ))}
                      {channels.length === 0 && (
                        <div className="empty-state">
                          <p className="muted">
                            {channelLoading ? 'Loading channels...' : 'No channels found.'}
                          </p>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="panel-card user-detail">
                <div className="panel-header">
                  <div>
                    <h3>Channel Profile</h3>
                    <p className="muted">Manage channel settings and subscribers.</p>
                  </div>
                </div>
                {!selectedChannelId && (
                  <p className="muted">Select a channel to view full details.</p>
                )}
                {selectedChannelId && !channelDetail && (
                  <p className="muted">Loading channel profile...</p>
                )}
                {selectedChannelId && channelDetail && (
                  <div className="detail-stack">
                    <div className="detail-hero">
                      <div className="user-avatar large">
                        {channelDetail.channel?.avatar ? (
                          <img
                            src={channelDetail.channel.avatar}
                            alt={channelDetail.channel?.name}
                          />
                        ) : (
                          (channelDetail.channel?.name || 'C').slice(0, 1).toUpperCase()
                        )}
                      </div>
                      <div>
                        <p className="user-name">{channelDetail.channel?.name}</p>
                        <p className="user-email">{channelDetail.channel?.link}</p>
                        <div className="user-tags">
                          <span
                            className={`status-pill ${
                              channelDetail.channel?.status || 'active'
                            }`}
                          >
                            {channelDetail.channel?.status || 'active'}
                          </span>
                          <span className="status-pill">
                            {channelDetail.channel?.accessType || 'public'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="detail-grid">
                      <div>
                        <p className="detail-label">Subscribers</p>
                        <p className="detail-value">
                          {channelDetail.subscribers?.length || 0}
                        </p>
                      </div>
                      <div>
                        <p className="detail-label">Admins</p>
                        <p className="detail-value">{channelDetail.admins?.length || 0}</p>
                      </div>
                      <div>
                        <p className="detail-label">Pending</p>
                        <p className="detail-value">{channelDetail.pending?.length || 0}</p>
                      </div>
                    </div>

                    <div className="form-grid">
                      <h4 className="section-title">Reviews</h4>
                      <div className="detail-grid">
                        <div>
                          <p className="detail-label">Average rating</p>
                          <p className="detail-value">
                            {Number(channelReviewStats.ratingAvg || 0).toFixed(1)}
                            /5
                          </p>
                        </div>
                        <div>
                          <p className="detail-label">Total reviews</p>
                          <p className="detail-value">
                            {channelReviewStats.ratingCount || 0}
                          </p>
                        </div>
                      </div>
                      <label className="field">
                        <span>Filter</span>
                        <select
                          className="select"
                          value={channelReviewFilter}
                          onChange={(event) => setChannelReviewFilter(event.target.value)}
                        >
                          <option value="visible">Visible</option>
                          <option value="hidden">Hidden</option>
                          <option value="all">All</option>
                        </select>
                      </label>
                      {channelReviewLoading && (
                        <p className="muted">Loading reviews...</p>
                      )}
                      {!channelReviewLoading && channelReviews.length === 0 && (
                        <p className="muted">No reviews found.</p>
                      )}
                      {!channelReviewLoading && channelReviews.length > 0 && (
                        <div className="stack-list">
                          {channelReviews.map((review) => (
                            <div key={review._id} className="stack-row">
                              <div>
                                <p className="detail-label">
                                  {review.profile?.fullname ||
                                    review.profile?.username ||
                                    review.userId}
                                </p>
                                <p className="detail-value">
                                  Rating {review.rating}/5
                                </p>
                                {review.review ? (
                                  <p className="muted">{review.review}</p>
                                ) : null}
                              </div>
                              <div className="stack-actions">
                                {review.status === 'visible' ? (
                                  <button
                                    type="button"
                                    className="ghost-btn"
                                    disabled={!can('channels.write')}
                                    onClick={() =>
                                      handleChannelReviewAction(review._id, 'hide')
                                    }
                                  >
                                    Hide
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="ghost-btn"
                                    disabled={!can('channels.write')}
                                    onClick={() =>
                                      handleChannelReviewAction(review._id, 'show')
                                    }
                                  >
                                    Show
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="ghost-btn danger"
                                  disabled={!can('channels.write')}
                                  onClick={() =>
                                    handleChannelReviewAction(review._id, 'delete')
                                  }
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="form-grid">
                      <h4 className="section-title">Channel Settings</h4>
                      <label className="field">
                        <span>Name</span>
                        <input
                          value={channelForm.name}
                          onChange={(event) =>
                            setChannelForm((prev) => ({ ...prev, name: event.target.value }))
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Description</span>
                        <input
                          value={channelForm.desc}
                          onChange={(event) =>
                            setChannelForm((prev) => ({ ...prev, desc: event.target.value }))
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Access Type</span>
                        <select
                          className="select"
                          value={channelForm.accessType}
                          onChange={(event) =>
                            setChannelForm((prev) => ({
                              ...prev,
                              accessType: event.target.value,
                            }))
                          }
                        >
                          <option value="public">Public</option>
                          <option value="private">Private</option>
                        </select>
                      </label>
                      {channelForm.accessType === 'private' && (
                        <label className="field">
                          <span>New Password</span>
                          <input
                            type="password"
                            value={channelForm.password}
                            onChange={(event) =>
                              setChannelForm((prev) => ({
                                ...prev,
                                password: event.target.value,
                              }))
                            }
                            placeholder="Leave blank to keep existing"
                          />
                        </label>
                      )}
                      <button
                        type="button"
                        className="primary-btn"
                        onClick={handleUpdateChannel}
                        disabled={channelSaving || !can('channels.write')}
                      >
                        Save channel settings
                      </button>
                    </div>

                    <div className="form-grid">
                      <h4 className="section-title">Permissions</h4>
                      <label className="toggle-row">
                        <input
                          type="checkbox"
                          checked={channelPermissionsForm.memberCanSendMessage}
                          onChange={(event) =>
                            setChannelPermissionsForm((prev) => ({
                              ...prev,
                              memberCanSendMessage: event.target.checked,
                            }))
                          }
                        />
                        <span>Subscribers can send messages</span>
                      </label>
                      <label className="toggle-row">
                        <input
                          type="checkbox"
                          checked={channelPermissionsForm.memberCanEditInfo}
                          onChange={(event) =>
                            setChannelPermissionsForm((prev) => ({
                              ...prev,
                              memberCanEditInfo: event.target.checked,
                            }))
                          }
                        />
                        <span>Subscribers can edit channel info</span>
                      </label>
                      <label className="toggle-row">
                        <input
                          type="checkbox"
                          checked={channelPermissionsForm.memberCanAddMember}
                          onChange={(event) =>
                            setChannelPermissionsForm((prev) => ({
                              ...prev,
                              memberCanAddMember: event.target.checked,
                            }))
                          }
                        />
                        <span>Subscribers can add others</span>
                      </label>
                      <label className="toggle-row">
                        <input
                          type="checkbox"
                          checked={channelPermissionsForm.memberCanInviteViaLink}
                          onChange={(event) =>
                            setChannelPermissionsForm((prev) => ({
                              ...prev,
                              memberCanInviteViaLink: event.target.checked,
                            }))
                          }
                        />
                        <span>Subscribers can invite via link</span>
                      </label>
                      <label className="toggle-row">
                        <input
                          type="checkbox"
                          checked={channelPermissionsForm.adminApprovalRequired}
                          onChange={(event) =>
                            setChannelPermissionsForm((prev) => ({
                              ...prev,
                              adminApprovalRequired: event.target.checked,
                            }))
                          }
                        />
                        <span>Admin approval required for joins</span>
                      </label>
                      <button
                        type="button"
                        className="primary-btn"
                        onClick={handleUpdateChannelPermissions}
                        disabled={channelSaving || !can('channels.write')}
                      >
                        Save permissions
                      </button>
                    </div>

                    <div className="form-grid">
                      <h4 className="section-title">Moderation</h4>
                      <label className="field">
                        <span>Slow mode (seconds)</span>
                        <input
                          type="number"
                          min={0}
                          max={3600}
                          value={channelModerationForm.slowModeSeconds}
                          onChange={(event) =>
                            setChannelModerationForm((prev) => ({
                              ...prev,
                              slowModeSeconds: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Banned words (comma separated)</span>
                        <input
                          value={channelModerationForm.bannedWords}
                          onChange={(event) =>
                            setChannelModerationForm((prev) => ({
                              ...prev,
                              bannedWords: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <div className="toggle-grid">
                        {['image', 'video', 'audio', 'document'].map((type) => (
                          <label className="toggle-row" key={type}>
                            <input
                              type="checkbox"
                              checked={channelModerationForm.blockedMediaTypes.includes(type)}
                              onChange={(event) =>
                                setChannelModerationForm((prev) => ({
                                  ...prev,
                                  blockedMediaTypes: event.target.checked
                                    ? [...prev.blockedMediaTypes, type]
                                    : prev.blockedMediaTypes.filter((item) => item !== type),
                                }))
                              }
                            />
                            <span>Block {type}</span>
                          </label>
                        ))}
                      </div>
                      <label className="toggle-row">
                        <input
                          type="checkbox"
                          checked={channelModerationForm.autoReportViolations}
                          onChange={(event) =>
                            setChannelModerationForm((prev) => ({
                              ...prev,
                              autoReportViolations: event.target.checked,
                            }))
                          }
                        />
                        <span>Auto report violations</span>
                      </label>
                      <button
                        type="button"
                        className="primary-btn"
                        onClick={handleUpdateChannelModeration}
                        disabled={channelSaving || !can('channels.write')}
                      >
                        Save moderation
                      </button>
                    </div>

                    <div className="form-grid">
                      <h4 className="section-title">Admins</h4>
                      <div className="stack-list">
                        {channelDetail.admins?.map((adminUser) => (
                          <div className="stack-row" key={`channel-admin-${adminUser.userId}`}>
                            <span>
                              {adminUser.fullname || adminUser.username || adminUser.userId}
                            </span>
                            {can('channels.write') && (
                              <button
                                type="button"
                                className="ghost-btn small dark"
                                onClick={() => handleDemoteChannelAdmin(adminUser.userId)}
                              >
                                Demote
                              </button>
                            )}
                          </div>
                        ))}
                        {channelDetail.admins?.length === 0 && (
                          <p className="muted">No admins found.</p>
                        )}
                      </div>
                    </div>

                    <div className="form-grid">
                      <h4 className="section-title">Subscribers</h4>
                      <div className="stack-list">
                        {channelDetail.subscribers?.map((member) => {
                          const isAdmin = channelDetail.admins?.some(
                            (adminUser) => adminUser.userId === member.userId
                          );
                          return (
                            <div className="stack-row" key={`subscriber-${member.userId}`}>
                              <span>{member.fullname || member.username || member.userId}</span>
                              <div className="action-stack">
                                {can('channels.write') && !isAdmin && (
                                  <button
                                    type="button"
                                    className="ghost-btn small dark"
                                    onClick={() => handlePromoteChannelAdmin(member.userId)}
                                  >
                                    Promote
                                  </button>
                                )}
                                {can('channels.write') && (
                                  <button
                                    type="button"
                                    className="ghost-btn small dark"
                                    onClick={() => handleRemoveChannelSubscriber(member.userId)}
                                  >
                                    Remove
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {channelDetail.subscribers?.length === 0 && (
                          <p className="muted">No subscribers found.</p>
                        )}
                      </div>
                    </div>

                    <div className="form-grid">
                      <h4 className="section-title">Join Requests</h4>
                      <div className="stack-list">
                        {channelDetail.pending?.map((member) => (
                          <div className="stack-row" key={`channel-pending-${member.userId}`}>
                            <span>{member.fullname || member.username || member.userId}</span>
                            <div className="action-stack">
                              {can('channels.write') && (
                                <button
                                  type="button"
                                  className="ghost-btn small dark"
                                  onClick={() => handleApproveChannelSubscriber(member.userId)}
                                >
                                  Approve
                                </button>
                              )}
                              {can('channels.write') && (
                                <button
                                  type="button"
                                  className="ghost-btn small dark"
                                  onClick={() => handleRejectChannelSubscriber(member.userId)}
                                >
                                  Reject
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                        {channelDetail.pending?.length === 0 && (
                          <p className="muted">No pending requests.</p>
                        )}
                      </div>
                    </div>

                    <div className="detail-actions">
                      {can('channels.ban') && channelDetail.channel?.status !== 'banned' && (
                        <button type="button" className="danger-btn" onClick={handleBanChannel}>
                          Ban channel
                        </button>
                      )}
                      {can('channels.ban') && channelDetail.channel?.status === 'banned' && (
                        <button type="button" className="primary-btn" onClick={handleUnbanChannel}>
                          Unban channel
                        </button>
                      )}
                      {can('channels.write') && (
                        <button
                          type="button"
                          className="danger-btn"
                          onClick={() => {
                            if (window.confirm('Soft delete this channel?')) {
                              handleDeleteChannel('soft');
                            }
                          }}
                        >
                          Soft delete
                        </button>
                      )}
                      {can('channels.write') && (
                        <button
                          type="button"
                          className="danger-btn outline"
                          onClick={() => {
                            if (
                              window.confirm(
                                'Hard delete this channel? This permanently removes channel data.'
                              )
                            ) {
                              handleDeleteChannel('hard');
                            }
                          }}
                        >
                          Hard delete
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {section === 'moderation' && (
            <section className="panel-stack">
              <div className="users-layout">
                <div className="panel-card users-panel">
                  <div className="panel-header">
                    <div>
                      <h3>Reports</h3>
                      <p className="muted">Review user and auto moderation reports.</p>
                    </div>
                    <span className="status-chip small">
                      {moderationLoading ? 'Loading...' : `${reports.length} reports`}
                    </span>
                  </div>
                  {!can('reports.read') && (
                    <p className="muted">You do not have permission to view reports.</p>
                  )}
                  {can('reports.read') && (
                    <>
                      <div className="filter-grid">
                        <label className="field">
                          <span>Status</span>
                          <select
                            className="select"
                            value={reportFilters.status}
                            onChange={(event) =>
                              setReportFilters((prev) => ({
                                ...prev,
                                status: event.target.value,
                              }))
                            }
                          >
                            <option value="all">All</option>
                            <option value="open">Open</option>
                            <option value="resolved">Resolved</option>
                            <option value="dismissed">Dismissed</option>
                          </select>
                        </label>
                        <label className="field">
                          <span>Report type</span>
                          <select
                            className="select"
                            value={reportFilters.kind}
                            onChange={(event) =>
                              setReportFilters((prev) => ({
                                ...prev,
                                kind: event.target.value,
                              }))
                            }
                          >
                            <option value="all">All</option>
                            <option value="chat">Chat report</option>
                            <option value="contact">Contact report</option>
                            <option value="group">Group report</option>
                            <option value="channel">Channel report</option>
                          </select>
                        </label>
                        <label className="field">
                          <span>Room type</span>
                          <select
                            className="select"
                            value={reportFilters.roomType}
                            onChange={(event) =>
                              setReportFilters((prev) => ({
                                ...prev,
                                roomType: event.target.value,
                              }))
                            }
                          >
                            <option value="all">All</option>
                            <option value="private">Private</option>
                            <option value="group">Group/Channel</option>
                          </select>
                        </label>
                        <label className="field">
                          <span>Source</span>
                          <select
                            className="select"
                            value={reportFilters.source}
                            onChange={(event) =>
                              setReportFilters((prev) => ({
                                ...prev,
                                source: event.target.value,
                              }))
                            }
                          >
                            <option value="all">All</option>
                            <option value="user">User</option>
                            <option value="auto">Auto</option>
                          </select>
                        </label>
                      </div>
                      <div className="user-list">
                        {reports
                          .filter((report) =>
                            reportFilters.kind === 'all'
                              ? true
                              : report.kind === reportFilters.kind
                          )
                          .map((report) => (
                          <button
                            key={report._id}
                            type="button"
                            className={`user-row ${
                              selectedReportId === report._id ? 'active' : ''
                            }`}
                            onClick={() => setSelectedReportId(report._id)}
                          >
                            <div className="user-meta">
                              <div className="user-avatar">
                                {(report.reporter?.fullname || 'R').slice(0, 1).toUpperCase()}
                              </div>
                              <div>
                                <p className="user-name">
                                  {(report.kind || report.category || 'general').toString()} ·{' '}
                                  {report.roomType}
                                </p>
                                <p className="user-email">
                                  {report.roomEntity?.name
                                    ? `${report.roomEntity.name} · `
                                    : ''}
                                  {report.reason?.slice(0, 80) || 'No reason provided'}
                                </p>
                              </div>
                            </div>
                            <div className="user-tags">
                              <span className={`status-pill ${report.status || 'open'}`}>
                                {report.status || 'open'}
                              </span>
                              <span className="status-pill">{report.source || 'user'}</span>
                            </div>
                          </button>
                        ))}
                        {reports.filter((report) =>
                          reportFilters.kind === 'all'
                            ? true
                            : report.kind === reportFilters.kind
                        ).length === 0 && (
                          <div className="empty-state">
                            <p className="muted">
                              {moderationLoading ? 'Loading reports...' : 'No reports found.'}
                            </p>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>

                <div className="panel-card user-detail">
                  <div className="panel-header">
                    <div>
                      <h3>Report Detail</h3>
                      <p className="muted">Take action and resolve reports.</p>
                    </div>
                  </div>
                  {!selectedReportId && (
                    <p className="muted">Select a report to view details.</p>
                  )}
                  {selectedReportId && (
                    <>
                      {(() => {
                        const report = reports.find((row) => row._id === selectedReportId);
                        if (!report) return <p className="muted">Report not found.</p>;
                        const reportKind = report.kind || report.category || 'general';
                        const roomEntity = report.roomEntity || null;
                        return (
                          <div className="detail-stack">
                            <div className="detail-grid">
                              <div>
                                <p className="detail-label">Reporter</p>
                                <p className="detail-value">
                                  {report.reporter?.fullname || report.reporterId || '—'}
                                </p>
                              </div>
                              <div>
                                <p className="detail-label">Reported</p>
                                <p className="detail-value">
                                  {report.reportedUser?.fullname || report.reportedUserId || '—'}
                                </p>
                              </div>
                              <div>
                                <p className="detail-label">Room</p>
                                <p className="detail-value">
                                  {roomEntity?.name || report.roomId || '—'}
                                </p>
                              </div>
                              <div>
                                <p className="detail-label">Chat</p>
                                <p className="detail-value">{report.chatId || '—'}</p>
                              </div>
                            </div>
                            <div className="detail-card">
                              <p className="detail-label">Report type</p>
                              <p className="detail-value">{reportKind}</p>
                            </div>
                            <div className="detail-card">
                              <p className="detail-label">Reported profile</p>
                              <div className="user-meta">
                                <div className="user-avatar">
                                  {report.reportedUser?.avatar ? (
                                    <img
                                      src={report.reportedUser.avatar}
                                      alt={report.reportedUser.fullname || 'User'}
                                    />
                                  ) : (
                                    (report.reportedUser?.fullname || 'U')
                                      .slice(0, 1)
                                      .toUpperCase()
                                  )}
                                </div>
                                <div>
                                  <p className="user-name">
                                    {report.reportedUser?.fullname || 'Unknown user'}
                                  </p>
                                  <p className="user-email">
                                    @{report.reportedUser?.username || report.reportedUserId}
                                  </p>
                                  <p className="user-email">
                                    Status: {report.reportedUser?.status || '—'}
                                  </p>
                                </div>
                              </div>
                              <div className="panel-actions">
                                {can('users.ban') &&
                                  report.reportedUserId &&
                                  report.reportedUser?.status !== 'banned' && (
                                    <button
                                      type="button"
                                      className="danger-btn"
                                      onClick={() =>
                                        handleReportUserStatus(report.reportedUserId, 'ban')
                                      }
                                    >
                                      Ban user
                                    </button>
                                  )}
                                {can('users.ban') &&
                                  report.reportedUserId &&
                                  report.reportedUser?.status === 'banned' && (
                                    <button
                                      type="button"
                                      className="primary-btn"
                                      onClick={() =>
                                        handleReportUserStatus(report.reportedUserId, 'unban')
                                      }
                                    >
                                      Unban user
                                    </button>
                                  )}
                              </div>
                            </div>
                            {roomEntity && (
                              <div className="detail-card">
                                <p className="detail-label">
                                  {roomEntity.type === 'channel' ? 'Channel' : 'Group'}
                                </p>
                                <div className="user-meta">
                                  <div className="user-avatar">
                                    {roomEntity.avatar ? (
                                      <img
                                        src={roomEntity.avatar}
                                        alt={roomEntity.name || 'Room'}
                                      />
                                    ) : (
                                      (roomEntity.name || 'R').slice(0, 1).toUpperCase()
                                    )}
                                  </div>
                                  <div>
                                    <p className="user-name">{roomEntity.name || '—'}</p>
                                    <p className="user-email">
                                      Status: {roomEntity.status || 'active'}
                                    </p>
                                  </div>
                                </div>
                                <div className="panel-actions">
                                  {roomEntity.type === 'group' &&
                                    can('groups.ban') &&
                                    roomEntity.status !== 'banned' && (
                                      <button
                                        type="button"
                                        className="danger-btn"
                                        onClick={() =>
                                          handleReportGroupAction(roomEntity._id, 'ban')
                                        }
                                      >
                                        Ban group
                                      </button>
                                    )}
                                  {roomEntity.type === 'group' &&
                                    can('groups.ban') &&
                                    roomEntity.status === 'banned' && (
                                      <button
                                        type="button"
                                        className="primary-btn"
                                        onClick={() =>
                                          handleReportGroupAction(roomEntity._id, 'unban')
                                        }
                                      >
                                        Unban group
                                      </button>
                                    )}
                                  {roomEntity.type === 'channel' &&
                                    can('channels.ban') &&
                                    roomEntity.status !== 'banned' && (
                                      <button
                                        type="button"
                                        className="danger-btn"
                                        onClick={() =>
                                          handleReportChannelAction(roomEntity._id, 'ban')
                                        }
                                      >
                                        Ban channel
                                      </button>
                                    )}
                                  {roomEntity.type === 'channel' &&
                                    can('channels.ban') &&
                                    roomEntity.status === 'banned' && (
                                      <button
                                        type="button"
                                        className="primary-btn"
                                        onClick={() =>
                                          handleReportChannelAction(roomEntity._id, 'unban')
                                        }
                                      >
                                        Unban channel
                                      </button>
                                    )}
                                  {report.reportedUserId &&
                                    (roomEntity.type === 'group'
                                      ? can('groups.write')
                                      : can('channels.write')) && (
                                      <button
                                        type="button"
                                        className="danger-btn outline"
                                        onClick={() =>
                                          handleReportRemoveMember({
                                            groupId:
                                              roomEntity.type === 'group'
                                                ? roomEntity._id
                                                : null,
                                            channelId:
                                              roomEntity.type === 'channel'
                                                ? roomEntity._id
                                                : null,
                                            userId: report.reportedUserId,
                                          })
                                        }
                                      >
                                        Remove user
                                      </button>
                                    )}
                                </div>
                              </div>
                            )}
                            <div className="detail-card">
                              <p className="detail-label">Reason</p>
                              <p className="detail-value">{report.reason || '—'}</p>
                            </div>

                            <div className="form-grid">
                              <h4 className="section-title">Action</h4>
                              <label className="field">
                                <span>Action</span>
                                <select
                                  className="select"
                                  value={reportActionForm.action}
                                  onChange={(event) =>
                                    setReportActionForm((prev) => ({
                                      ...prev,
                                      action: event.target.value,
                                    }))
                                  }
                                >
                                  <option value="warn">Warn user</option>
                                  <option value="mute">Mute in room</option>
                                  <option value="ban">Ban user</option>
                                  <option value="delete_content">Delete content</option>
                                  <option value="resolve">Resolve only</option>
                                  <option value="dismiss">Dismiss</option>
                                </select>
                              </label>
                              {reportActionForm.action === 'mute' && (
                                <label className="field">
                                  <span>Mute duration (minutes)</span>
                                  <input
                                    type="number"
                                    min={0}
                                    value={reportActionForm.durationMinutes}
                                    onChange={(event) =>
                                      setReportActionForm((prev) => ({
                                        ...prev,
                                        durationMinutes: event.target.value,
                                      }))
                                    }
                                  />
                                </label>
                              )}
                              <label className="field">
                                <span>Resolution note</span>
                                <textarea
                                  value={reportActionForm.note}
                                  onChange={(event) =>
                                    setReportActionForm((prev) => ({
                                      ...prev,
                                      note: event.target.value,
                                    }))
                                  }
                                  rows={3}
                                  placeholder="Optional note to include in history"
                                />
                              </label>
                              <button
                                type="button"
                                className="primary-btn"
                                onClick={handleReportAction}
                                disabled={!can('reports.write')}
                              >
                                Apply action
                              </button>
                            </div>

                            {Array.isArray(report.actions) && report.actions.length > 0 && (
                              <div className="form-grid">
                                <h4 className="section-title">Actions</h4>
                                <div className="stack-list">
                                  {report.actions.map((action) => (
                                    <div
                                      className="stack-row"
                                      key={`${action._id}-${action.actionType}`}
                                    >
                                      <span>{action.actionType}</span>
                                      <span className="muted">
                                        {formatDate(action.createdAt)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </>
                  )}
                </div>
              </div>

              <div className="panel-grid">
                <div className="panel-card">
                  <h3>Auto-moderation Rules</h3>
                  <div className="form-grid">
                    <label className="field">
                      <span>Banned words</span>
                      <textarea
                        value={moderationConfig.bannedWords}
                        onChange={(event) =>
                          setModerationConfig((prev) => ({
                            ...prev,
                            bannedWords: event.target.value,
                          }))
                        }
                        rows={3}
                        placeholder="word1, word2, word3"
                      />
                    </label>
                    <div className="toggle-grid">
                      {['image', 'video', 'audio', 'document'].map((type) => (
                        <label className="toggle-row" key={`moderation-media-${type}`}>
                          <input
                            type="checkbox"
                            checked={moderationConfig.blockedMediaTypes.includes(type)}
                            onChange={(event) =>
                              setModerationConfig((prev) => ({
                                ...prev,
                                blockedMediaTypes: event.target.checked
                                  ? [...prev.blockedMediaTypes, type]
                                  : prev.blockedMediaTypes.filter((item) => item !== type),
                              }))
                            }
                          />
                          <span>Block {type} globally</span>
                        </label>
                      ))}
                    </div>
                    <label className="field">
                      <span>Slow mode presets (seconds)</span>
                      <input
                        value={moderationConfig.slowModePresets}
                        onChange={(event) =>
                          setModerationConfig((prev) => ({
                            ...prev,
                            slowModePresets: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="toggle-row">
                      <input
                        type="checkbox"
                        checked={moderationConfig.autoReportViolations}
                        onChange={(event) =>
                          setModerationConfig((prev) => ({
                            ...prev,
                            autoReportViolations: event.target.checked,
                          }))
                        }
                      />
                      <span>Auto report violations</span>
                    </label>
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={handleUpdateModerationConfig}
                      disabled={!can('reports.write')}
                    >
                      Save rules
                    </button>
                  </div>
                </div>

                <div className="panel-card">
                  <h3>Moderation History</h3>
                  <div className="stack-list">
                    {moderationActions.map((action) => (
                      <div className="stack-row" key={action._id}>
                        <span>{action.actionType}</span>
                        <span className="muted">{formatDate(action.createdAt)}</span>
                      </div>
                    ))}
                    {moderationActions.length === 0 && (
                      <p className="muted">No moderation actions recorded.</p>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          {section === 'content' && (
            <section className="panel-stack">
              <div className="users-layout">
                <div className="panel-card users-panel">
                  <div className="panel-header">
                    <div>
                      <h3>Messages</h3>
                      <p className="muted">Search and remove chat content.</p>
                    </div>
                    <span className="status-chip small">
                      {contentLoading ? 'Loading...' : `${contentChats.length} results`}
                    </span>
                  </div>
                  {!can('content.delete') && (
                    <p className="muted">You do not have permission to manage content.</p>
                  )}
                  <div className="filter-grid">
                    <label className="field">
                      <span>Search text</span>
                      <input
                        value={contentFilters.query}
                        onChange={(event) =>
                          setContentFilters((prev) => ({
                            ...prev,
                            query: event.target.value,
                          }))
                        }
                        placeholder="Search message text"
                        disabled={!can('content.delete')}
                      />
                    </label>
                    <label className="field">
                      <span>Room ID</span>
                      <input
                        value={contentFilters.roomId}
                        onChange={(event) =>
                          setContentFilters((prev) => ({
                            ...prev,
                            roomId: event.target.value,
                          }))
                        }
                        placeholder="roomId"
                        disabled={!can('content.delete')}
                      />
                    </label>
                    <label className="field">
                      <span>User ID</span>
                      <input
                        value={contentFilters.userId}
                        onChange={(event) =>
                          setContentFilters((prev) => ({
                            ...prev,
                            userId: event.target.value,
                          }))
                        }
                        placeholder="userId"
                        disabled={!can('content.delete')}
                      />
                    </label>
                    <label className="field">
                      <span>Has media</span>
                      <select
                        className="select"
                        value={contentFilters.hasMedia}
                        onChange={(event) =>
                          setContentFilters((prev) => ({
                            ...prev,
                            hasMedia: event.target.value,
                          }))
                        }
                        disabled={!can('content.delete')}
                      >
                        <option value="any">Any</option>
                        <option value="true">Only media</option>
                        <option value="false">No media</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>Media type</span>
                      <select
                        className="select"
                        value={contentFilters.fileType}
                        onChange={(event) =>
                          setContentFilters((prev) => ({
                            ...prev,
                            fileType: event.target.value,
                          }))
                        }
                        disabled={!can('content.delete')}
                      >
                        <option value="all">All</option>
                        <option value="image">Image</option>
                        <option value="video">Video</option>
                        <option value="audio">Audio</option>
                        <option value="document">Document</option>
                      </select>
                    </label>
                  </div>

                  <div className="user-list">
                    {contentChats.map((chat) => (
                      <button
                        key={chat._id}
                        type="button"
                        className={`user-row ${
                          selectedContentChatIds.includes(chat._id) ? 'active' : ''
                        }`}
                        onClick={() => toggleContentChatSelection(chat._id)}
                        disabled={!can('content.delete')}
                      >
                        <div className="user-meta">
                          <div className="user-avatar">
                            {(chat.profile?.fullname || 'U').slice(0, 1).toUpperCase()}
                          </div>
                          <div>
                            <p className="user-name">
                              {chat.profile?.fullname || chat.userId || 'Unknown'} ·{' '}
                              {chat.room?.type || 'room'}
                            </p>
                            <p className="user-email">
                              {chat.text?.slice(0, 70) ||
                                chat.file?.originalname ||
                                'Media message'}
                            </p>
                          </div>
                        </div>
                        <div className="user-tags">
                          {chat.file?.type && (
                            <span className="status-pill">{chat.file.type}</span>
                          )}
                          {chat.poll && (
                            <span className="status-pill">{chat.poll.mode || 'poll'}</span>
                          )}
                        </div>
                      </button>
                    ))}
                    {contentChats.length === 0 && (
                      <div className="empty-state">
                        <p className="muted">
                          {contentLoading ? 'Loading messages...' : 'No messages found.'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="panel-card user-detail">
                  <div className="panel-header">
                    <div>
                      <h3>Message Actions</h3>
                      <p className="muted">Delete messages, media, and polls.</p>
                    </div>
                  </div>
                  {selectedContentChatIds.length === 0 && (
                    <p className="muted">Select a message to manage content.</p>
                  )}
                  {selectedContentChatIds.length > 0 && (
                    <div className="detail-stack">
                      <div className="detail-grid">
                        <div>
                          <p className="detail-label">Selected</p>
                          <p className="detail-value">{selectedContentChatIds.length}</p>
                        </div>
                        <div>
                          <p className="detail-label">Media only</p>
                          <p className="detail-value">
                            {contentChats
                              .filter((item) => selectedContentChatIds.includes(item._id))
                              .every((item) => !!item.file)
                              ? 'Yes'
                              : 'No'}
                          </p>
                        </div>
                      </div>
                      <div className="detail-actions">
                        <button
                          type="button"
                          className="danger-btn"
                          onClick={() => handleDeleteContentChats(selectedContentChatIds)}
                          disabled={!can('content.delete')}
                        >
                          Delete selected
                        </button>
                        {selectedContentChatIds.length === 1 &&
                          contentChats.find((item) => item._id === selectedContentChatIds[0])
                            ?.poll && (
                            <button
                              type="button"
                              className="warning-btn"
                              onClick={() => handleTakedownPoll(selectedContentChatIds[0])}
                              disabled={!can('content.delete')}
                            >
                              Takedown poll/quiz
                            </button>
                          )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="panel-grid">
                <div className="panel-card">
                  <h3>Status takedown</h3>
                  <div className="form-grid">
                    <label className="field">
                      <span>User ID</span>
                      <input
                        value={statusFilters.userId}
                        onChange={(event) =>
                          setStatusFilters((prev) => ({
                            ...prev,
                            userId: event.target.value,
                          }))
                        }
                        placeholder="userId"
                        disabled={!can('content.delete')}
                      />
                    </label>
                    <label className="field">
                      <span>Status type</span>
                      <select
                        className="select"
                        value={statusFilters.type}
                        onChange={(event) =>
                          setStatusFilters((prev) => ({
                            ...prev,
                            type: event.target.value,
                          }))
                        }
                        disabled={!can('content.delete')}
                      >
                        <option value="all">All</option>
                        <option value="text">Text</option>
                        <option value="photo">Photo</option>
                        <option value="video">Video</option>
                      </select>
                    </label>
                  </div>
                  <div className="stack-list">
                    {contentStatuses.map((status) => (
                      <div className="stack-row" key={status._id}>
                        <span>
                          {status.profile?.fullname || status.userId} · {status.type}
                        </span>
                        <button
                          type="button"
                          className="danger-btn outline"
                          onClick={() => handleDeleteStatus(status._id)}
                          disabled={!can('content.delete')}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    {contentStatuses.length === 0 && (
                      <p className="muted">No statuses found.</p>
                    )}
                  </div>
                </div>

                <div className="panel-card">
                  <h3>Link preview blocklist</h3>
                  <div className="form-grid">
                    <label className="field">
                      <span>Blocked domains</span>
                      <textarea
                        value={contentConfig.blockedPreviewDomains}
                        onChange={(event) =>
                          setContentConfig((prev) => ({
                            ...prev,
                            blockedPreviewDomains: event.target.value,
                          }))
                        }
                        rows={3}
                        placeholder="example.com, bad-domain.net"
                        disabled={!can('content.delete')}
                      />
                    </label>
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={handleUpdateContentConfig}
                      disabled={!can('content.delete')}
                    >
                      Save blocklist
                    </button>
                  </div>
                  <div className="form-grid" style={{ marginTop: '18px' }}>
                    <h4 className="section-title">Pinned removal</h4>
                    <label className="field">
                      <span>Room ID</span>
                      <input
                        value={pinRemovalForm.roomId}
                        onChange={(event) =>
                          setPinRemovalForm((prev) => ({
                            ...prev,
                            roomId: event.target.value,
                          }))
                        }
                        placeholder="roomId"
                        disabled={!can('content.delete')}
                      />
                    </label>
                    <label className="field">
                      <span>Chat ID</span>
                      <input
                        value={pinRemovalForm.chatId}
                        onChange={(event) =>
                          setPinRemovalForm((prev) => ({
                            ...prev,
                            chatId: event.target.value,
                          }))
                        }
                        placeholder="chatId"
                        disabled={!can('content.delete')}
                      />
                    </label>
                    <button
                      type="button"
                      className="warning-btn"
                      onClick={handleRemovePinnedMessage}
                      disabled={!can('content.delete')}
                    >
                      Remove pin
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}

          {section === 'security' && (
            <section className="panel-stack">
              <div className="panel-grid">
                <div className="panel-card">
                  <h3>Security Config</h3>
                  {!can('security.read') && (
                    <p className="muted">You do not have permission to view security settings.</p>
                  )}
                  {can('security.read') && (
                    <div className="form-grid">
                      <label className="field">
                        <span>Blocked IPs</span>
                        <textarea
                          value={securityConfig.blockedIps}
                          onChange={(event) =>
                            setSecurityConfig((prev) => ({
                              ...prev,
                              blockedIps: event.target.value,
                            }))
                          }
                          rows={3}
                          placeholder="1.2.3.4, 10.0.0.0"
                          disabled={!can('security.write')}
                        />
                      </label>
                      <label className="field">
                        <span>Blocked device fingerprints</span>
                        <textarea
                          value={securityConfig.blockedFingerprints}
                          onChange={(event) =>
                            setSecurityConfig((prev) => ({
                              ...prev,
                              blockedFingerprints: event.target.value,
                            }))
                          }
                          rows={3}
                          placeholder="fingerprint hashes, comma separated"
                          disabled={!can('security.write')}
                        />
                      </label>
                      <div className="detail-grid">
                        <label className="toggle-row">
                          <input
                            type="checkbox"
                            checked={securityConfig.rateLimitsEnabled}
                            onChange={(event) =>
                              setSecurityConfig((prev) => ({
                                ...prev,
                                rateLimitsEnabled: event.target.checked,
                              }))
                            }
                            disabled={!can('security.write')}
                          />
                          <span>Enable rate limiting</span>
                        </label>
                        <label className="field">
                          <span>Window (seconds)</span>
                          <input
                            type="number"
                            min={10}
                            value={securityConfig.rateLimitWindow}
                            onChange={(event) =>
                              setSecurityConfig((prev) => ({
                                ...prev,
                                rateLimitWindow: event.target.value,
                              }))
                            }
                            disabled={!can('security.write')}
                          />
                        </label>
                        <label className="field">
                          <span>Max requests</span>
                          <input
                            type="number"
                            min={10}
                            value={securityConfig.rateLimitMax}
                            onChange={(event) =>
                              setSecurityConfig((prev) => ({
                                ...prev,
                                rateLimitMax: event.target.value,
                              }))
                            }
                            disabled={!can('security.write')}
                          />
                        </label>
                      </div>
                      <button
                        type="button"
                        className="primary-btn"
                        onClick={handleUpdateSecurityConfig}
                        disabled={!can('security.write')}
                      >
                        Save security settings
                      </button>
                    </div>
                  )}
                </div>

                <div className="panel-card">
                  <h3>Web Push / VAPID</h3>
                  {!can('security.read') && (
                    <p className="muted">You do not have permission to view push status.</p>
                  )}
                  {can('security.read') && (
                    <div className="stack-list">
                      <div className="stack-row">
                        <span>VAPID configured</span>
                        <span className="status-pill">
                          {pushStatus?.vapidConfigured ? 'active' : 'missing'}
                        </span>
                      </div>
                      <div className="stack-row">
                        <span>Public key set</span>
                        <span>{pushStatus?.vapidPublicKeySet ? 'Yes' : 'No'}</span>
                      </div>
                      <div className="stack-row">
                        <span>Private key set</span>
                        <span>{pushStatus?.vapidPrivateKeySet ? 'Yes' : 'No'}</span>
                      </div>
                      <div className="stack-row">
                        <span>Subject</span>
                        <span>{pushStatus?.vapidSubject || '—'}</span>
                      </div>
                      <div className="stack-row">
                        <span>Subscriptions</span>
                        <span>{pushStatus?.subscriptions ?? '—'}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="panel-grid">
                <div className="panel-card">
                  <h3>Device Sessions</h3>
                  <div className="form-grid">
                    <label className="field">
                      <span>User ID</span>
                      <input
                        value={securityUserId}
                        onChange={(event) => setSecurityUserId(event.target.value)}
                        placeholder="userId"
                        disabled={!can('security.read')}
                      />
                    </label>
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={loadUserSessions}
                      disabled={!can('security.read') || !securityUserId}
                    >
                      Load sessions
                    </button>
                  </div>
                  <div className="stack-list" style={{ marginTop: '16px' }}>
                    {securitySessions.map((session) => (
                      <div className="stack-row" key={session._id}>
                        <span>
                          {session.deviceName || 'Unknown'} · {session.ipAddress || '—'}
                        </span>
                        <div className="action-stack">
                          <span className="status-pill">
                            {session.isActive ? 'active' : 'revoked'}
                          </span>
                          {session.isActive && can('security.write') && (
                            <button
                              type="button"
                              className="ghost-btn small"
                              onClick={() => handleRevokeUserSession(session._id)}
                            >
                              Revoke
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    {securitySessions.length === 0 && (
                      <p className="muted">No sessions loaded.</p>
                    )}
                  </div>
                </div>

                <div className="panel-card">
                  <h3>Suspicious Login Review</h3>
                  <div className="form-grid">
                    <label className="field">
                      <span>Filter</span>
                      <select
                        className="select"
                        value={suspiciousFilter}
                        onChange={(event) => setSuspiciousFilter(event.target.value)}
                        disabled={!can('security.read')}
                      >
                        <option value="unreviewed">Unreviewed</option>
                        <option value="reviewed">Reviewed</option>
                        <option value="all">All</option>
                      </select>
                    </label>
                  </div>
                  <div className="stack-list" style={{ marginTop: '16px' }}>
                    {suspiciousSessions.map((session) => (
                      <div className="stack-row" key={session._id}>
                        <span>
                          {session.profile?.fullname || session.userId} ·{' '}
                          {session.deviceName || 'Unknown'}
                        </span>
                        <div className="action-stack">
                          <span className="status-pill">
                            {session.reviewedAt ? 'reviewed' : 'open'}
                          </span>
                          {can('security.write') && (
                            <>
                              <button
                                type="button"
                                className="ghost-btn small"
                                onClick={() =>
                                  handleReviewSuspiciousSession(session._id, 'review')
                                }
                              >
                                Mark reviewed
                              </button>
                              <button
                                type="button"
                                className="danger-btn outline"
                                onClick={() =>
                                  handleReviewSuspiciousSession(session._id, 'revoke')
                                }
                              >
                                Revoke
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                    {suspiciousSessions.length === 0 && (
                      <p className="muted">No suspicious sessions.</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="panel-grid">
                <div className="panel-card">
                  <h3>GDPR Erase Tracking</h3>
                  <div className="form-grid">
                    <label className="field">
                      <span>Status</span>
                      <select
                        className="select"
                        value={eraseFilters.status}
                        onChange={(event) =>
                          setEraseFilters((prev) => ({
                            ...prev,
                            status: event.target.value,
                          }))
                        }
                        disabled={!can('security.read')}
                      >
                        <option value="all">All</option>
                        <option value="requested">Requested</option>
                        <option value="in_progress">In progress</option>
                        <option value="completed">Completed</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>User ID</span>
                      <input
                        value={eraseForm.userId}
                        onChange={(event) =>
                          setEraseForm((prev) => ({
                            ...prev,
                            userId: event.target.value,
                          }))
                        }
                        placeholder="userId"
                        disabled={!can('security.write')}
                      />
                    </label>
                    <label className="field">
                      <span>Note</span>
                      <input
                        value={eraseForm.note}
                        onChange={(event) =>
                          setEraseForm((prev) => ({
                            ...prev,
                            note: event.target.value,
                          }))
                        }
                        placeholder="Optional note"
                        disabled={!can('security.write')}
                      />
                    </label>
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={handleCreateEraseRequest}
                      disabled={!can('security.write')}
                    >
                      Create erase request
                    </button>
                  </div>
                  <div className="stack-list" style={{ marginTop: '16px' }}>
                    {eraseRequests.map((item) => (
                      <div className="stack-row" key={item._id}>
                        <span>
                          {item.profile?.fullname || item.userId} · {item.status}
                        </span>
                        {can('security.write') && (
                          <div className="action-stack">
                            <button
                              type="button"
                              className="ghost-btn small"
                              onClick={() => handleUpdateEraseRequest(item._id, 'in_progress')}
                            >
                              In progress
                            </button>
                            <button
                              type="button"
                              className="ghost-btn small"
                              onClick={() => handleUpdateEraseRequest(item._id, 'completed')}
                            >
                              Complete
                            </button>
                            <button
                              type="button"
                              className="danger-btn outline"
                              onClick={() => handleUpdateEraseRequest(item._id, 'rejected')}
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                    {eraseRequests.length === 0 && (
                      <p className="muted">No erase requests.</p>
                    )}
                  </div>
                </div>

                <div className="panel-card">
                  <h3>Account Export Tracking</h3>
                  <p className="muted">
                    Export requests are managed in Account Exports.
                  </p>
                  <div className="stack-list">
                    {exportRequests.slice(0, 5).map((item) => (
                      <div className="stack-row" key={item._id}>
                        <span>{item.userId || 'User'}</span>
                        <span className="status-pill">
                          {item.status || (item.deliveredAt ? 'delivered' : 'pending')}
                        </span>
                      </div>
                    ))}
                    {exportRequests.length === 0 && (
                      <p className="muted">No export requests loaded.</p>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          {section === 'admins' && (
            <section className="panel-grid">
              <div className="panel-card">
                <h3>Admins</h3>
                {!can('admin.read') && (
                  <p className="muted">You do not have permission to view admins.</p>
                )}
                {can('admin.read') && (
                  <div className="table">
                    <div className="table-row header">
                      <span>Name</span>
                      <span>Email</span>
                      <span>Role</span>
                      <span>Action</span>
                    </div>
                    {admins.map((item) => (
                      <div className="table-row" key={item._id}>
                        <span className="table-user">
                          {item.avatar ? (
                            <img src={item.avatar} alt={item.fullname} />
                          ) : (
                            <span className="table-avatar">
                              {item.fullname?.slice(0, 1)?.toUpperCase() || 'A'}
                            </span>
                          )}
                          {item.fullname}
                        </span>
                        <span>{item.email}</span>
                        <span>{item.role}</span>
                        <span>
                          {can('admin.manage') ? (
                            <select
                              className="select"
                              value={item.roleId || ''}
                              onChange={(event) =>
                                handleAssignRole(item._id, event.target.value)
                              }
                            >
                              <option value="" disabled>
                                Select role
                              </option>
                              {roles.map((role) => (
                                <option key={role._id} value={role._id}>
                                  {role.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            '—'
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="panel-card">
                <h3>Create Role</h3>
                {!can('roles.manage') && (
                  <p className="muted">You do not have permission to create roles.</p>
                )}
                {can('roles.manage') && (
                  <form className="form-grid" onSubmit={handleCreateRole}>
                    <label className="field">
                      <span>Role name</span>
                      <input
                        value={roleForm.name}
                        onChange={(event) =>
                          setRoleForm((prev) => ({ ...prev, name: event.target.value }))
                        }
                        placeholder="moderator-plus"
                        required
                      />
                    </label>
                    <label className="field">
                      <span>Description</span>
                      <input
                        value={roleForm.description}
                        onChange={(event) =>
                          setRoleForm((prev) => ({ ...prev, description: event.target.value }))
                        }
                        placeholder="Short description"
                      />
                    </label>
                    <label className="field">
                      <span>Permissions</span>
                      <select
                        multiple
                        className="select"
                        value={roleForm.permissions}
                        onChange={(event) =>
                          setRoleForm((prev) => ({
                            ...prev,
                            permissions: Array.from(event.target.selectedOptions).map(
                              (opt) => opt.value
                            ),
                          }))
                        }
                      >
                        {permissionList.map((perm) => (
                          <option key={perm} value={perm}>
                            {perm}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button type="submit" className="primary-btn">
                      Save role
                    </button>
                  </form>
                )}
              </div>
            </section>
          )}

          {section === 'admin-create' && (
            <section className="panel-card">
              <h3>Create Admin</h3>
              {!can('admin.manage') && (
                <p className="muted">You do not have permission to create admins.</p>
              )}
              {can('admin.manage') && (
                <form className="form-grid" onSubmit={handleCreateAdmin}>
                  <label className="field">
                    <span>Full name</span>
                    <input
                      value={createAdminForm.fullname}
                      onChange={(event) =>
                        setCreateAdminForm((prev) => ({
                          ...prev,
                          fullname: event.target.value,
                        }))
                      }
                      placeholder="Admin name"
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Email</span>
                    <input
                      type="email"
                      value={createAdminForm.email}
                      onChange={(event) =>
                        setCreateAdminForm((prev) => ({
                          ...prev,
                          email: event.target.value,
                        }))
                      }
                      placeholder="admin@syncchat.app"
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Password</span>
                    <input
                      type="password"
                      value={createAdminForm.password}
                      onChange={(event) =>
                        setCreateAdminForm((prev) => ({
                          ...prev,
                          password: event.target.value,
                        }))
                      }
                      placeholder="Minimum 6 characters"
                      minLength={6}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Role</span>
                    <select
                      className="select"
                      value={createAdminForm.roleId}
                      onChange={(event) =>
                        setCreateAdminForm((prev) => ({
                          ...prev,
                          roleId: event.target.value,
                        }))
                      }
                    >
                      <option value="">Default (moderator)</option>
                      {roles.map((role) => (
                        <option key={role._id} value={role._id}>
                          {role.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Photo Upload</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) =>
                        handleAvatarFile(
                          event.target.files?.[0],
                          setCreateAdminForm,
                          setCreatePreview
                        )
                      }
                    />
                  </label>
                  {createPreview && (
                    <div className="avatar-preview">
                      <img src={createPreview} alt="Preview" />
                    </div>
                  )}
                  <button type="submit" className="primary-btn">
                    Create admin
                  </button>
                </form>
              )}
            </section>
          )}

          {section === 'permissions' && (
            <section className="panel-card">
              <h3>Permission Matrix</h3>
              {!can('roles.read') && (
                <p className="muted">You do not have permission to view permissions.</p>
              )}
              {can('roles.read') && (
                <div className="table">
                  <div className="table-row header">
                    <span>Role</span>
                    <span>Description</span>
                    <span>Permissions</span>
                  </div>
                  {roles.map((role) => (
                    <div className="table-row" key={role._id}>
                      <span>{role.name}</span>
                      <span>{role.description || '—'}</span>
                      <span className="pill-wrap">
                        {Array.isArray(role.permissions) && role.permissions.length > 0
                          ? role.permissions.map((perm) => (
                              <span className="pill" key={`${role._id}-${perm}`}>
                                {perm}
                              </span>
                            ))
                          : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {section === 'sessions' && (
            <section className="panel-card">
              <h3>Admin Sessions</h3>
              {!can('sessions.read') && (
                <p className="muted">You do not have permission to view sessions.</p>
              )}
              {can('sessions.read') && (
                <div className="table">
                  <div className="table-row header">
                    <span>Device</span>
                    <span>IP</span>
                    <span>Last seen</span>
                    <span>Status</span>
                  </div>
                  {sessions.map((item) => (
                    <div className="table-row" key={item._id}>
                      <span>{item.deviceName || 'Unknown'}</span>
                      <span>{item.ipAddress || '—'}</span>
                      <span>{item.lastSeenAt ? new Date(item.lastSeenAt).toLocaleString() : '—'}</span>
                      <span>
                        {item.isActive ? (
                          can('sessions.manage') ? (
                            <button
                              type="button"
                              className="ghost-btn small"
                              onClick={() => handleRevokeSession(item._id)}
                            >
                              Revoke
                            </button>
                          ) : (
                            'Active'
                          )
                        ) : (
                          'Revoked'
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {section === 'keys' && (
            <section className="panel-grid">
              <div className="panel-card">
                <h3>Access Keys</h3>
                {!can('access_keys.read') && (
                  <p className="muted">You do not have permission to view access keys.</p>
                )}
                {can('access_keys.read') && (
                  <div className="table">
                    <div className="table-row header">
                      <span>Label</span>
                      <span>Status</span>
                      <span>Last used</span>
                      <span>Action</span>
                    </div>
                    {accessKeys.map((item) => (
                      <div className="table-row" key={item._id}>
                        <span>{item.label}</span>
                        <span>{item.active ? 'Active' : 'Revoked'}</span>
                        <span>
                          {item.lastUsedAt
                            ? new Date(item.lastUsedAt).toLocaleString()
                            : '—'}
                        </span>
                        <span>
                          {item.active && can('access_keys.manage') ? (
                            <button
                              type="button"
                              className="ghost-btn small"
                              onClick={() => handleRevokeKey(item._id)}
                            >
                              Revoke
                            </button>
                          ) : (
                            '—'
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="panel-card">
                <h3>Create Access Key</h3>
                {!can('access_keys.manage') && (
                  <p className="muted">You do not have permission to create keys.</p>
                )}
                {can('access_keys.manage') && (
                  <form className="form-grid" onSubmit={handleCreateKey}>
                    <label className="field">
                      <span>Label</span>
                      <input
                        value={keyLabel}
                        onChange={(event) => setKeyLabel(event.target.value)}
                        placeholder="Automation key"
                        required
                      />
                    </label>
                    <button type="submit" className="primary-btn">
                      Generate key
                    </button>
                  </form>
                )}
                {createdKey && (
                  <div className="key-box">
                    <p className="muted">Copy this key now. It will not be shown again.</p>
                    <code>{createdKey}</code>
                  </div>
                )}
              </div>
            </section>
          )}

          {section === 'audit' && (
            <section className="panel-card">
              <h3>Audit Logs</h3>
              {!can('audit.read') && (
                <p className="muted">You do not have permission to view audit logs.</p>
              )}
              {can('audit.read') && (
                <div className="table">
                  <div className="table-row header">
                    <span>Action</span>
                    <span>Entity</span>
                    <span>Admin</span>
                    <span>Time</span>
                  </div>
                  {auditLogs.map((log) => (
                    <div className="table-row" key={log._id}>
                      <span>{log.action}</span>
                      <span>{log.entityType || '—'}</span>
                      <span>{log.adminId || '—'}</span>
                      <span>{new Date(log.createdAt).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {section === 'profile' && (
            <section className="panel-card">
              <h3>Admin Profile</h3>
              <form className="form-grid" onSubmit={handleUpdateProfile}>
                <label className="field">
                  <span>Photo Upload</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) =>
                      handleAvatarFile(
                        event.target.files?.[0],
                        setProfileForm,
                        setProfilePreview
                      )
                    }
                  />
                </label>
                {profilePreview && (
                  <div className="avatar-preview">
                    <img src={profilePreview} alt="Profile preview" />
                  </div>
                )}
                <label className="field">
                  <span>Full name</span>
                  <input
                    value={profileForm.fullname}
                    onChange={(event) =>
                      setProfileForm((prev) => ({ ...prev, fullname: event.target.value }))
                    }
                    placeholder="Admin name"
                    required
                  />
                </label>
                <label className="field">
                  <span>Email</span>
                  <input
                    type="email"
                    value={profileForm.email}
                    onChange={(event) =>
                      setProfileForm((prev) => ({ ...prev, email: event.target.value }))
                    }
                    placeholder="admin@syncchat.app"
                    required
                  />
                </label>
                <button type="submit" className="primary-btn">
                  Update profile
                </button>
              </form>
            </section>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <section className="auth-left">
        <div className="auth-brand">
          <div className="brand-mark">
            {publicBrand.appLogo ? (
              <img
                src={resolveUploadUrl(publicBrand.appLogo)}
                alt={publicBrand.appName}
              />
            ) : (
              'SC'
            )}
          </div>
          <div>
            <p className="brand-title">{publicBrand.appName || 'SyncChat Admin'}</p>
            <p className="brand-sub">Operations & moderation console</p>
          </div>
        </div>

        <div className="auth-hero">
          <span className="auth-badge">Secure Admin Portal</span>
          <h1>Command center for your SyncChat network.</h1>
          <p>
            Separate from the client panel, this admin space is designed for operations,
            compliance, and realtime oversight.
          </p>
        </div>

        <div className="auth-metrics">
          <div className="metric-card">
            <p className="metric-title">Realtime control</p>
            <p className="metric-value">Always On</p>
            <p className="metric-sub">Manage users, groups, channels, and reports from one place.</p>
          </div>
          <div className="metric-card">
            <p className="metric-title">Security posture</p>
            <p className="metric-value">Hardened</p>
            <p className="metric-sub">Dedicated access layer with audit-friendly workflows.</p>
          </div>
        </div>
      </section>

      <section className="auth-right">
        <div className="auth-card">
          <p className="auth-eyebrow">Welcome back</p>
          <h2 className="auth-title">Sign in to dashboard</h2>
          <p className="auth-sub">
            {hasAdmin === false
              ? 'Default admin is being prepared automatically. Try signing in with the seeded credentials after startup.'
              : 'Use your admin email and password to continue.'}
          </p>

          <form className="auth-form" onSubmit={submitLogin}>

            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={form.email}
                onChange={handleChange('email')}
                placeholder="admin@syncchat.app"
                required
              />
            </label>

            <label className="field">
              <span>Password</span>
              <input
                type="password"
                value={form.password}
                onChange={handleChange('password')}
                placeholder="••••••••"
                minLength={6}
                required
              />
            </label>

            {error && <p className="form-message error">{error}</p>}
            {notice && <p className="form-message success">{notice}</p>}

            <button type="submit" className="primary-btn" disabled={loading}>
              {loading ? 'Please wait...' : 'Sign in'}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}

export default App;
