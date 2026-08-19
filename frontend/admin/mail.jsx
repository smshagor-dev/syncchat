import React, { useEffect, useMemo, useState } from 'react';
import * as ReactDOM from 'react-dom/client';
import axios from 'axios';
import config from './config';
import './style.css';

axios.defaults.baseURL = config.apiBaseUrl;

const styles = {
  page: {
    minHeight: '100vh',
    background: '#f5f7fb',
    padding: '32px 16px',
    color: '#172033',
  },
  card: {
    maxWidth: 900,
    margin: '0 auto',
    background: '#fff',
    borderRadius: 18,
    padding: 28,
    boxShadow: '0 18px 50px rgba(24,39,75,.08)',
  },
  row: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))',
    gap: 14,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 7,
    marginBottom: 16,
  },
  input: {
    height: 44,
    border: '1px solid #d8deea',
    borderRadius: 10,
    padding: '0 12px',
    fontSize: 14,
  },
  label: { fontWeight: 700, fontSize: 13 },
  help: { fontSize: 12, color: '#697386', lineHeight: 1.6 },
  button: {
    border: 0,
    borderRadius: 10,
    padding: '11px 18px',
    fontWeight: 700,
    cursor: 'pointer',
  },
};

const statusLabel = (status) => {
  if (!status?.configured) return 'Not configured';
  if (status?.verified) return 'Verified';
  return 'Configured';
};

function MailAdmin() {
  const token = useMemo(() => localStorage.getItem('admin_token') || '', []);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [sending, setSending] = useState(false);
  const [to, setTo] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadStatus = async ({ verify = false } = {}) => {
    if (verify) setVerifying(true);
    setError('');
    try {
      const { data } = await axios.get(`/admin/mail/status${verify ? '?verify=1' : ''}`);
      setStatus(data?.payload || null);
      if (verify) setMessage(data?.message || 'SMTP connection verified');
    } catch (error0) {
      const payload = error0?.response?.data?.payload;
      if (payload) setStatus(payload);
      setError(error0?.response?.data?.message || error0.message || 'SMTP verification failed');
    } finally {
      setLoading(false);
      setVerifying(false);
    }
  };

  useEffect(() => {
    if (!token) {
      window.location.replace('/admin');
      return;
    }
    axios.defaults.headers.Authorization = `Bearer ${token}`;
    loadStatus();
  }, [token]);

  const sendTest = async () => {
    setSending(true);
    setMessage('');
    setError('');
    try {
      const { data } = await axios.post('/admin/mail/test', to.trim() ? { to: to.trim() } : {});
      const payload = data?.payload || {};
      setMessage(
        `${data?.message || 'Test email submitted'}${
          payload.messageId ? ` · Message ID: ${payload.messageId}` : ''
        }${payload.response ? ` · ${payload.response}` : ''}`
      );
      await loadStatus();
    } catch (error0) {
      const payload = error0?.response?.data?.payload || {};
      setError(
        `${error0?.response?.data?.message || error0.message || 'Test email failed'}${
          payload.code ? ` (${payload.code})` : ''
        }${payload.responseCode ? ` · SMTP ${payload.responseCode}` : ''}`
      );
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>Loading SMTP diagnostics…</div>
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
            <h1 style={{ margin: 0, fontSize: 28 }}>SMTP Diagnostics</h1>
            <p style={{ ...styles.help, marginTop: 7 }}>
              Verify the configured SMTP server and submit a real delivery test without exposing credentials.
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
              overflowWrap: 'anywhere',
            }}
          >
            {message}
          </div>
        )}

        <div
          style={{
            padding: 16,
            borderRadius: 14,
            background: '#f7f9fc',
            marginBottom: 22,
          }}
        >
          <div style={styles.row}>
            <div>
              <div style={styles.label}>Status</div>
              <div style={{ marginTop: 6, fontSize: 18, fontWeight: 800 }}>
                {statusLabel(status)}
              </div>
            </div>
            <div>
              <div style={styles.label}>Host / port</div>
              <div style={{ marginTop: 6 }}>
                {status?.host || '—'}{status?.port ? `:${status.port}` : ''}
              </div>
            </div>
            <div>
              <div style={styles.label}>Transport</div>
              <div style={{ marginTop: 6 }}>
                {status?.secure ? 'Implicit TLS' : Number(status?.port) === 587 ? 'STARTTLS' : 'SMTP'}
              </div>
            </div>
            <div>
              <div style={styles.label}>From address</div>
              <div style={{ marginTop: 6, overflowWrap: 'anywhere' }}>
                {status?.fromEmail || '—'}
              </div>
            </div>
          </div>
          {status?.user && (
            <p style={{ ...styles.help, margin: '14px 0 0' }}>
              Auth user: {status.user} · TLS certificate validation:{' '}
              {status.tlsRejectUnauthorized ? 'enabled' : 'disabled'}
            </p>
          )}
          {status?.error && (
            <p style={{ ...styles.help, margin: '10px 0 0', color: '#a11' }}>
              Last verification: {status.error}
            </p>
          )}
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 26 }}>
          <button
            type="button"
            style={{ ...styles.button, background: '#111827', color: '#fff' }}
            disabled={verifying || sending}
            onClick={() => {
              setMessage('');
              loadStatus({ verify: true });
            }}
          >
            {verifying ? 'Verifying…' : 'Verify SMTP Connection'}
          </button>
          <a
            href="/admin"
            style={{
              ...styles.button,
              display: 'inline-flex',
              alignItems: 'center',
              textDecoration: 'none',
              background: '#eef2ff',
              color: '#3730a3',
            }}
          >
            Edit SMTP Settings
          </a>
        </div>

        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 22 }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>Send delivery test</h2>
          <p style={{ ...styles.help, margin: '0 0 16px' }}>
            Leave the address blank to send to the currently authenticated admin email.
          </p>
          <label style={styles.field}>
            <span style={styles.label}>Test recipient</span>
            <input
              style={styles.input}
              type="email"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </label>
          <button
            type="button"
            style={{ ...styles.button, background: '#2563eb', color: '#fff' }}
            disabled={sending || verifying}
            onClick={sendTest}
          >
            {sending ? 'Sending…' : 'Send Test Email'}
          </button>
        </div>

        <div
          style={{
            marginTop: 26,
            padding: 16,
            borderRadius: 14,
            background: '#fff8e8',
            color: '#7c4a03',
            fontSize: 13,
            lineHeight: 1.65,
          }}
        >
          <strong>Inbox delivery note:</strong> a successful test means the SMTP provider accepted the message.
          For reliable inbox placement, authorize the From domain with SPF and DKIM and publish a DMARC policy.
          Gmail/Google Workspace accounts may require an app password or provider-specific SMTP credentials.
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.querySelector('#mail-root')).render(<MailAdmin />);
