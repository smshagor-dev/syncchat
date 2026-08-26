import React, { useEffect, useMemo, useState } from 'react';
import * as ReactDOM from 'react-dom/client';
import axios from 'axios';
import config from './config';
import './style.css';

axios.defaults.baseURL = config.apiBaseUrl;

const initial = {
  google: {
    enabled: false,
    clientId: '',
    clientSecret: '',
    clientSecretSet: false,
  },
  facebook: {
    enabled: false,
    appId: '',
    appSecret: '',
    appSecretSet: false,
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
    maxWidth: 1040,
    margin: '0 auto',
    background: '#fff',
    borderRadius: 18,
    padding: 28,
    boxShadow: '0 18px 50px rgba(24,39,75,.08)',
  },
  provider: {
    border: '1px solid #e3e8f0',
    borderRadius: 16,
    padding: 20,
    marginTop: 18,
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
    marginBottom: 14,
  },
  input: {
    minHeight: 44,
    border: '1px solid #d8deea',
    borderRadius: 10,
    padding: '10px 12px',
    fontSize: 14,
    background: '#fff',
  },
  help: { fontSize: 12, color: '#697386', lineHeight: 1.5 },
  button: {
    border: 0,
    borderRadius: 10,
    padding: '11px 18px',
    fontWeight: 700,
    cursor: 'pointer',
  },
};

function SocialAuthAdmin() {
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
      .get('/admin/social-auth/config')
      .then(({ data }) => {
        const payload = data?.payload || {};
        setForm({
          google: {
            ...initial.google,
            ...(payload.google || {}),
            clientSecret: '',
          },
          facebook: {
            ...initial.facebook,
            ...(payload.facebook || {}),
            appSecret: '',
          },
        });
      })
      .catch((err) => setError(err?.response?.data?.message || err.message))
      .finally(() => setLoading(false));
  }, [token]);

  const setProvider = (provider, key, value) => {
    setForm((prev) => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        [key]: value,
      },
    }));
  };

  const buildPayload = () => {
    const payload = {
      google: {
        enabled: Boolean(form.google.enabled),
        clientId: String(form.google.clientId || '').trim(),
      },
      facebook: {
        enabled: Boolean(form.facebook.enabled),
        appId: String(form.facebook.appId || '').trim(),
      },
    };
    if (String(form.google.clientSecret || '').trim()) {
      payload.google.clientSecret = form.google.clientSecret;
    }
    if (String(form.facebook.appSecret || '').trim()) {
      payload.facebook.appSecret = form.facebook.appSecret;
    }
    return payload;
  };

  const save = async () => {
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const { data } = await axios.patch(
        '/admin/social-auth/config',
        buildPayload()
      );
      const payload = data?.payload || {};
      setForm((prev) => ({
        google: {
          ...prev.google,
          ...(payload.google || {}),
          clientSecret: '',
        },
        facebook: {
          ...prev.facebook,
          ...(payload.facebook || {}),
          appSecret: '',
        },
      }));
      setMessage(data?.message || 'Social login configuration saved');
    } catch (err) {
      setError(err?.response?.data?.message || err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>Loading social login settings…</div>
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
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 28 }}>Social Login</h1>
            <p style={{ ...styles.help, marginTop: 7 }}>
              Google and Facebook credentials are loaded from MongoDB. Provider
              secrets are encrypted at rest and are never returned to the browser.
            </p>
          </div>
          <a href="/admin" style={{ textDecoration: 'none', fontWeight: 700 }}>
            ← Admin
          </a>
        </div>

        {error && (
          <div
            style={{
              padding: 12,
              borderRadius: 10,
              marginTop: 18,
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
              marginTop: 18,
              background: '#eefbf3',
              color: '#176b3a',
            }}
          >
            {message}
          </div>
        )}

        <section style={styles.provider}>
          <label style={{ display: 'flex', gap: 10, fontWeight: 700 }}>
            <input
              type="checkbox"
              checked={Boolean(form.google.enabled)}
              onChange={(e) => setProvider('google', 'enabled', e.target.checked)}
            />
            Enable Google login
          </label>
          <div style={{ ...styles.row, marginTop: 16 }}>
            <label style={styles.field}>
              <span>Google Client ID</span>
              <input
                style={styles.input}
                value={String(form.google.clientId || '')}
                onChange={(e) => setProvider('google', 'clientId', e.target.value)}
                placeholder="xxxxx.apps.googleusercontent.com"
              />
            </label>
            <label style={styles.field}>
              <span>Google Client Secret</span>
              <input
                style={styles.input}
                type="password"
                value={String(form.google.clientSecret || '')}
                onChange={(e) =>
                  setProvider('google', 'clientSecret', e.target.value)
                }
                placeholder={
                  form.google.clientSecretSet
                    ? 'Saved — leave blank to keep'
                    : 'Optional for current ID-token flow'
                }
              />
              <span style={styles.help}>
                {form.google.clientSecretSet
                  ? 'Encrypted client secret is already stored.'
                  : 'Client ID is required. Client secret is retained for future OAuth flows.'}
              </span>
            </label>
          </div>
        </section>

        <section style={styles.provider}>
          <label style={{ display: 'flex', gap: 10, fontWeight: 700 }}>
            <input
              type="checkbox"
              checked={Boolean(form.facebook.enabled)}
              onChange={(e) =>
                setProvider('facebook', 'enabled', e.target.checked)
              }
            />
            Enable Facebook login
          </label>
          <div style={{ ...styles.row, marginTop: 16 }}>
            <label style={styles.field}>
              <span>Facebook App ID</span>
              <input
                style={styles.input}
                value={String(form.facebook.appId || '')}
                onChange={(e) => setProvider('facebook', 'appId', e.target.value)}
                placeholder="Facebook App ID"
              />
            </label>
            <label style={styles.field}>
              <span>Facebook App Secret</span>
              <input
                style={styles.input}
                type="password"
                value={String(form.facebook.appSecret || '')}
                onChange={(e) =>
                  setProvider('facebook', 'appSecret', e.target.value)
                }
                placeholder={
                  form.facebook.appSecretSet
                    ? 'Saved — leave blank to keep'
                    : 'Facebook App Secret'
                }
              />
              <span style={styles.help}>
                Used server-side to validate that access tokens belong to this Facebook app.
              </span>
            </label>
          </div>
        </section>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 22 }}>
          <button
            type="button"
            style={{ ...styles.button, background: '#2563eb', color: '#fff' }}
            disabled={saving}
            onClick={save}
          >
            {saving ? 'Saving…' : 'Save social login settings'}
          </button>
        </div>
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.querySelector('#social-auth-root'));
root.render(<SocialAuthAdmin />);
