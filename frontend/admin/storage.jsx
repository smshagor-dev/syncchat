import React, { useEffect, useMemo, useState } from 'react';
import * as ReactDOM from 'react-dom/client';
import axios from 'axios';
import config from './config';
import './style.css';

axios.defaults.baseURL = config.apiBaseUrl;

const initial = {
  enabled: false, host: '', port: 21, secureMode: 'none', user: '', password: '',
  basePath: '/uploads', publicBaseUrl: '', rejectUnauthorized: true, timeoutMs: 15000,
  passwordSet: false, lastTestedAt: null, lastTestStatus: 'never', lastTestMessage: '',
};
const styles = {
  page: { minHeight: '100vh', background: '#f5f7fb', padding: '32px 16px', color: '#172033' },
  card: { maxWidth: 900, margin: '0 auto', background: '#fff', borderRadius: 18, padding: 28, boxShadow: '0 18px 50px rgba(24,39,75,.08)' },
  row: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 16 },
  field: { display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 16 },
  input: { height: 44, border: '1px solid #d8deea', borderRadius: 10, padding: '0 12px', fontSize: 14 },
  label: { fontWeight: 700, fontSize: 13 },
  help: { fontSize: 12, color: '#697386' },
  button: { border: 0, borderRadius: 10, padding: '11px 18px', fontWeight: 700, cursor: 'pointer' },
};

function StorageAdmin() {
  const [form, setForm] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const token = useMemo(() => localStorage.getItem('admin_token') || '', []);

  useEffect(() => {
    if (!token) { window.location.replace('/admin'); return; }
    axios.defaults.headers.Authorization = `Bearer ${token}`;
    axios.get('/admin/storage/ftp')
      .then((res) => setForm({ ...initial, ...(res?.data?.payload || {}), password: '' }))
      .catch((err) => setError(err?.response?.data?.message || err.message))
      .finally(() => setLoading(false));
  }, [token]);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const payload = () => {
    const data = {
      enabled: Boolean(form.enabled), host: String(form.host || '').trim(), port: Number(form.port || 21),
      secureMode: form.secureMode, user: String(form.user || '').trim(),
      basePath: String(form.basePath || '/uploads').trim(), publicBaseUrl: String(form.publicBaseUrl || '').trim(),
      rejectUnauthorized: Boolean(form.rejectUnauthorized), timeoutMs: Number(form.timeoutMs || 15000),
    };
    if (form.password) data.password = form.password;
    return data;
  };

  const save = async () => {
    setSaving(true); setMessage(''); setError('');
    try {
      const res = await axios.patch('/admin/storage/ftp', payload());
      setForm((prev) => ({ ...prev, ...(res?.data?.payload || {}), password: '' }));
      setMessage('FTP settings saved. All persistent uploads now use this FTP storage.');
    } catch (err) { setError(err?.response?.data?.message || err.message); }
    finally { setSaving(false); }
  };

  const test = async () => {
    setTesting(true); setMessage(''); setError('');
    try {
      const res = await axios.post('/admin/storage/ftp/test', payload());
      const data = res?.data?.payload || {};
      setMessage(`Connection OK — write/delete test passed in ${data.latencyMs || 0} ms.`);
      setForm((prev) => ({ ...prev, lastTestedAt: new Date().toISOString(), lastTestStatus: 'success', lastTestMessage: data.message || 'Success' }));
    } catch (err) { setError(err?.response?.data?.message || err.message); }
    finally { setTesting(false); }
  };

  if (loading) return <div style={styles.page}><div style={styles.card}>Loading FTP storage settings…</div></div>;

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 24 }}>
          <div><h1 style={{ margin: 0, fontSize: 28 }}>FTP Storage</h1><p style={{ ...styles.help, marginTop: 7 }}>Persistent media is stored on FTP/FTPS. The backend does not use a local uploads directory.</p></div>
          <a href="/admin" style={{ textDecoration: 'none', fontWeight: 700 }}>← Admin</a>
        </div>
        {error && <div style={{ padding: 12, borderRadius: 10, marginBottom: 16, background: '#fff0f0', color: '#a11' }}>{error}</div>}
        {message && <div style={{ padding: 12, borderRadius: 10, marginBottom: 16, background: '#eefbf3', color: '#176b3a' }}>{message}</div>}
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, fontWeight: 700 }}><input type="checkbox" checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} />Enable FTP storage</label>
        <div style={styles.row}>
          <label style={styles.field}><span style={styles.label}>FTP host</span><input style={styles.input} value={form.host} onChange={(e) => set('host', e.target.value)} placeholder="ftp.example.com" /></label>
          <label style={styles.field}><span style={styles.label}>Port</span><input style={styles.input} type="number" value={form.port} onChange={(e) => set('port', e.target.value)} /></label>
          <label style={styles.field}><span style={styles.label}>Security</span><select style={styles.input} value={form.secureMode} onChange={(e) => set('secureMode', e.target.value)}><option value="none">FTP (no TLS)</option><option value="explicit">FTPS explicit TLS</option><option value="implicit">FTPS implicit TLS</option></select></label>
        </div>
        <div style={styles.row}>
          <label style={styles.field}><span style={styles.label}>Username</span><input style={styles.input} value={form.user} onChange={(e) => set('user', e.target.value)} autoComplete="username" /></label>
          <label style={styles.field}><span style={styles.label}>Password</span><input style={styles.input} type="password" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder={form.passwordSet ? 'Saved — leave blank to keep' : 'FTP password'} autoComplete="new-password" /><span style={styles.help}>{form.passwordSet ? 'A password is already stored encrypted.' : 'No password saved yet.'}</span></label>
        </div>
        <div style={styles.row}>
          <label style={styles.field}><span style={styles.label}>Remote base path</span><input style={styles.input} value={form.basePath} onChange={(e) => set('basePath', e.target.value)} placeholder="/public_html/uploads" /><span style={styles.help}>FTP directory where SyncChat folders will be created.</span></label>
          <label style={styles.field}><span style={styles.label}>Public base URL</span><input style={styles.input} value={form.publicBaseUrl} onChange={(e) => set('publicBaseUrl', e.target.value)} placeholder="https://cdn.example.com/uploads" /><span style={styles.help}>Must map publicly to the remote base path.</span></label>
        </div>
        <div style={styles.row}>
          <label style={styles.field}><span style={styles.label}>Timeout (ms)</span><input style={styles.input} type="number" value={form.timeoutMs} onChange={(e) => set('timeoutMs', e.target.value)} /></label>
          <label style={{ ...styles.field, justifyContent: 'center' }}><span style={styles.label}>TLS certificate validation</span><span style={{ display: 'flex', gap: 9, alignItems: 'center' }}><input type="checkbox" checked={form.rejectUnauthorized} onChange={(e) => set('rejectUnauthorized', e.target.checked)} />Verify server certificate</span></label>
        </div>
        <div style={{ padding: 14, borderRadius: 12, background: '#f7f9fc', marginBottom: 20, fontSize: 13 }}>Last test: <strong>{form.lastTestStatus || 'never'}</strong>{form.lastTestedAt ? ` · ${new Date(form.lastTestedAt).toLocaleString()}` : ''}{form.lastTestMessage ? <div style={{ marginTop: 5 }}>{form.lastTestMessage}</div> : null}</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button type="button" style={{ ...styles.button, background: '#111827', color: '#fff' }} onClick={test} disabled={testing || saving}>{testing ? 'Testing…' : 'Test Connection'}</button>
          <button type="button" style={{ ...styles.button, background: '#2563eb', color: '#fff' }} onClick={save} disabled={saving || testing}>{saving ? 'Saving…' : 'Save FTP Settings'}</button>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.querySelector('#storage-root')).render(<StorageAdmin />);
