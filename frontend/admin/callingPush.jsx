import React, { useEffect, useMemo, useState } from 'react';
import * as ReactDOM from 'react-dom/client';
import axios from 'axios';
import config from './config';
import './style.css';

axios.defaults.baseURL = config.apiBaseUrl;

const initial = {
  android: {
    enabled: false,
    projectId: '',
    clientEmail: '',
    privateKey: '',
    privateKeySet: false,
  },
  ios: {
    enabled: false,
    teamId: '',
    keyId: '',
    bundleId: '',
    privateKey: '',
    privateKeySet: false,
    environment: 'production',
  },
};

const styles = {
  page: {
    minHeight: '100vh',
    background: '#f5f7fb',
    padding: '32px 16px',
    color: '#172033',
  },
  card: {
    maxWidth: 980,
    margin: '0 auto',
    background: '#fff',
    borderRadius: 18,
    padding: 28,
    boxShadow: '0 18px 50px rgba(24,39,75,.08)',
  },
  section: {
    borderTop: '1px solid #e7ebf2',
    paddingTop: 22,
    marginTop: 22,
  },
  row: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))',
    gap: 16,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 7,
    marginBottom: 16,
  },
  input: {
    minHeight: 44,
    border: '1px solid #d8deea',
    borderRadius: 10,
    padding: '10px 12px',
    fontSize: 14,
    background: '#fff',
  },
  label: { fontWeight: 700, fontSize: 13 },
  help: { fontSize: 12, color: '#697386', lineHeight: 1.5 },
  button: {
    border: 0,
    borderRadius: 10,
    padding: '11px 18px',
    fontWeight: 700,
    cursor: 'pointer',
  },
};

function CallingPushAdmin() {
  const [form, setForm] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const token = useMemo(() => localStorage.getItem('admin_token') || '', []);

  useEffect(() => {
    if (!token) {
      window.location.replace('/admin');
      return;
    }
    axios.defaults.headers.Authorization = `Bearer ${token}`;
    axios
      .get('/admin/calling/native-push')
      .then((res) => {
        const payload = res?.data?.payload || {};
        setForm({
          android: {
            ...initial.android,
            ...(payload.android || {}),
            privateKey: '',
          },
          ios: {
            ...initial.ios,
            ...(payload.ios || {}),
            privateKey: '',
          },
        });
      })
      .catch((err) => setError(err?.response?.data?.message || err.message))
      .finally(() => setLoading(false));
  }, [token]);

  const setAndroid = (key, value) =>
    setForm((prev) => ({
      ...prev,
      android: { ...prev.android, [key]: value },
    }));

  const setIos = (key, value) =>
    setForm((prev) => ({
      ...prev,
      ios: { ...prev.ios, [key]: value },
    }));

  const save = async () => {
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const payload = {
        android: {
          enabled: Boolean(form.android.enabled),
          projectId: String(form.android.projectId || '').trim(),
          clientEmail: String(form.android.clientEmail || '').trim(),
        },
        ios: {
          enabled: Boolean(form.ios.enabled),
          teamId: String(form.ios.teamId || '').trim(),
          keyId: String(form.ios.keyId || '').trim(),
          bundleId: String(form.ios.bundleId || '').trim(),
          environment:
            form.ios.environment === 'sandbox' ? 'sandbox' : 'production',
        },
      };
      if (form.android.privateKey) {
        payload.android.privateKey = form.android.privateKey;
      }
      if (form.ios.privateKey) {
        payload.ios.privateKey = form.ios.privateKey;
      }

      const res = await axios.patch('/admin/calling/native-push', payload);
      const next = res?.data?.payload || {};
      setForm((prev) => ({
        android: {
          ...prev.android,
          ...(next.android || {}),
          privateKey: '',
        },
        ios: {
          ...prev.ios,
          ...(next.ios || {}),
          privateKey: '',
        },
      }));
      setMessage('Android FCM and iOS APNs call-push settings saved in MongoDB.');
    } catch (err) {
      setError(err?.response?.data?.message || err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>Loading native push settings…</div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            alignItems: 'center',
            marginBottom: 24,
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 28 }}>Native Call Push</h1>
            <p style={{ ...styles.help, marginTop: 7 }}>
              DB-backed Android FCM and iOS APNs/PushKit credentials for incoming calls.
              Private keys are encrypted at rest and are never returned to this page.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 14 }}>
            <a href="/admin/calling" style={{ textDecoration: 'none', fontWeight: 700 }}>
              ← Calling
            </a>
            <a href="/admin" style={{ textDecoration: 'none', fontWeight: 700 }}>
              Admin
            </a>
          </div>
        </div>

        {error && (
          <div
            style={{
              padding: 12,
              borderRadius: 10,
              marginBottom: 16,
              background: '#fff0f0',
              color: '#a11',
            }}
          >
            {error}
          </div>
        )}
        {message && (
          <div
            style={{
              padding: 12,
              borderRadius: 10,
              marginBottom: 16,
              background: '#eefbf3',
              color: '#176b3a',
            }}
          >
            {message}
          </div>
        )}

        <div>
          <h2 style={{ marginTop: 0 }}>Android · Firebase Cloud Messaging</h2>
          <p style={styles.help}>
            Use a Firebase service-account project ID, client email, and private key. These values
            are read by the backend from MongoDB when an incoming call push is sent.
          </p>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 18,
              fontWeight: 700,
            }}
          >
            <input
              type="checkbox"
              checked={form.android.enabled}
              onChange={(e) => setAndroid('enabled', e.target.checked)}
            />
            Enable Android FCM call push
          </label>
          <div style={styles.row}>
            <label style={styles.field}>
              <span style={styles.label}>FCM Project ID</span>
              <input
                style={styles.input}
                value={form.android.projectId}
                onChange={(e) => setAndroid('projectId', e.target.value)}
                placeholder="firebase-project-id"
              />
            </label>
            <label style={styles.field}>
              <span style={styles.label}>FCM Client Email</span>
              <input
                style={styles.input}
                value={form.android.clientEmail}
                onChange={(e) => setAndroid('clientEmail', e.target.value)}
                placeholder="firebase-adminsdk@project.iam.gserviceaccount.com"
              />
            </label>
          </div>
          <label style={styles.field}>
            <span style={styles.label}>FCM Private Key</span>
            <textarea
              style={{ ...styles.input, minHeight: 150, fontFamily: 'monospace' }}
              value={form.android.privateKey}
              onChange={(e) => setAndroid('privateKey', e.target.value)}
              placeholder={
                form.android.privateKeySet
                  ? 'Encrypted key saved — leave blank to keep it'
                  : '-----BEGIN PRIVATE KEY-----'
              }
            />
            <span style={styles.help}>
              {form.android.privateKeySet
                ? 'A private key is already encrypted in MongoDB.'
                : 'No Android private key is stored yet.'}
            </span>
          </label>
        </div>

        <div style={styles.section}>
          <h2 style={{ marginTop: 0 }}>iOS · APNs / PushKit</h2>
          <p style={styles.help}>
            Use the Apple Developer Team ID, APNs Key ID, app bundle ID, and .p8 private key.
            PushKit VoIP devices automatically use the bundle-id.voip topic.
          </p>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 18,
              fontWeight: 700,
            }}
          >
            <input
              type="checkbox"
              checked={form.ios.enabled}
              onChange={(e) => setIos('enabled', e.target.checked)}
            />
            Enable iOS APNs call push
          </label>
          <div style={styles.row}>
            <label style={styles.field}>
              <span style={styles.label}>APNs Team ID</span>
              <input
                style={styles.input}
                value={form.ios.teamId}
                onChange={(e) => setIos('teamId', e.target.value)}
                placeholder="TEAMID1234"
              />
            </label>
            <label style={styles.field}>
              <span style={styles.label}>APNs Key ID</span>
              <input
                style={styles.input}
                value={form.ios.keyId}
                onChange={(e) => setIos('keyId', e.target.value)}
                placeholder="KEYID12345"
              />
            </label>
            <label style={styles.field}>
              <span style={styles.label}>App Bundle ID</span>
              <input
                style={styles.input}
                value={form.ios.bundleId}
                onChange={(e) => setIos('bundleId', e.target.value)}
                placeholder="com.example.syncchat"
              />
            </label>
            <label style={styles.field}>
              <span style={styles.label}>APNs Environment</span>
              <select
                style={styles.input}
                value={form.ios.environment}
                onChange={(e) => setIos('environment', e.target.value)}
              >
                <option value="production">Production</option>
                <option value="sandbox">Sandbox / Development</option>
              </select>
            </label>
          </div>
          <label style={styles.field}>
            <span style={styles.label}>APNs .p8 Private Key</span>
            <textarea
              style={{ ...styles.input, minHeight: 150, fontFamily: 'monospace' }}
              value={form.ios.privateKey}
              onChange={(e) => setIos('privateKey', e.target.value)}
              placeholder={
                form.ios.privateKeySet
                  ? 'Encrypted key saved — leave blank to keep it'
                  : '-----BEGIN PRIVATE KEY-----'
              }
            />
            <span style={styles.help}>
              {form.ios.privateKeySet
                ? 'An APNs private key is already encrypted in MongoDB.'
                : 'No iOS private key is stored yet.'}
            </span>
          </label>
        </div>

        <div
          style={{
            marginTop: 22,
            padding: 14,
            borderRadius: 12,
            background: '#f7f9fc',
            fontSize: 13,
            lineHeight: 1.6,
          }}
        >
          The backend no longer needs FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY,
          APNS_TEAM_ID, APNS_KEY_ID, APNS_BUNDLE_ID, APNS_PRIVATE_KEY, or APNS_ENVIRONMENT
          for native call push. Keep CALL_CONFIG_SECRET stable because it protects the stored
          private keys.
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 22 }}>
          <button
            type="button"
            style={{ ...styles.button, background: '#2563eb', color: '#fff' }}
            onClick={save}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save Native Push Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.querySelector('#calling-push-root')).render(<CallingPushAdmin />);
