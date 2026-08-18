import React, { useEffect, useMemo, useState } from 'react';
import * as ReactDOM from 'react-dom/client';
import axios from 'axios';
import config from './config';
import './style.css';

axios.defaults.baseURL = config.apiBaseUrl;

const initial = {
  enabled: true,
  audioEnabled: true,
  videoEnabled: true,
  groupEnabled: true,
  maxGroupParticipants: 12,
  groupSfu: {
    enabled: false,
    provider: 'livekit',
    url: '',
    apiKey: '',
    apiSecret: '',
    apiSecretSet: false,
    tokenTtlSec: 3600,
    minParticipants: 3,
    adaptiveStream: true,
    dynacast: true,
  },
  ringingTimeoutSec: 45,
  reconnectGraceSec: 12,
  iceTransportPolicy: 'all',
  stunUrls: ['stun:stun.l.google.com:19302'],
  turn: {
    enabled: false,
    urls: [],
    authMode: 'static',
    username: '',
    credential: '',
    sharedSecret: '',
    credentialTtlSec: 3600,
    credentialSet: false,
    sharedSecretSet: false,
  },
  audioProfile: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
  videoProfile: {
    width: 1280,
    height: 720,
    frameRate: 30,
    minWidth: 320,
    minHeight: 180,
    minFrameRate: 15,
    adaptive: true,
  },
  lastTestedAt: null,
  lastTestStatus: 'never',
  lastTestMessage: '',
};

const styles = {
  page: { minHeight: '100vh', background: '#f5f7fb', padding: '32px 16px', color: '#172033' },
  card: { maxWidth: 1060, margin: '0 auto', background: '#fff', borderRadius: 18, padding: 28, boxShadow: '0 18px 50px rgba(24,39,75,.08)' },
  section: { borderTop: '1px solid #e7ebf2', paddingTop: 22, marginTop: 22 },
  row: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16 },
  field: { display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 16 },
  input: { minHeight: 44, border: '1px solid #d8deea', borderRadius: 10, padding: '10px 12px', fontSize: 14, background: '#fff' },
  label: { fontWeight: 700, fontSize: 13 },
  help: { fontSize: 12, color: '#697386', lineHeight: 1.5 },
  button: { border: 0, borderRadius: 10, padding: '11px 18px', fontWeight: 700, cursor: 'pointer' },
};

const asLines = (value) => (Array.isArray(value) ? value.join('\n') : String(value || ''));
const fromLines = (value) => String(value || '').split(/[\n,]+/).map((item) => item.trim()).filter(Boolean);

function CallingAdmin() {
  const [form, setForm] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
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
      .get('/admin/calling/config')
      .then((res) => {
        const payload = res?.data?.payload || {};
        setForm({
          ...initial,
          ...payload,
          turn: { ...initial.turn, ...(payload.turn || {}), credential: '', sharedSecret: '' },
          groupSfu: { ...initial.groupSfu, ...(payload.groupSfu || {}), apiSecret: '' },
          audioProfile: { ...initial.audioProfile, ...(payload.audioProfile || {}) },
          videoProfile: { ...initial.videoProfile, ...(payload.videoProfile || {}) },
        });
      })
      .catch((err) => setError(err?.response?.data?.message || err.message))
      .finally(() => setLoading(false));
  }, [token]);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const setTurn = (key, value) =>
    setForm((prev) => ({ ...prev, turn: { ...prev.turn, [key]: value } }));
  const setGroupSfu = (key, value) =>
    setForm((prev) => ({ ...prev, groupSfu: { ...prev.groupSfu, [key]: value } }));
  const setAudio = (key, value) =>
    setForm((prev) => ({ ...prev, audioProfile: { ...prev.audioProfile, [key]: value } }));
  const setVideo = (key, value) =>
    setForm((prev) => ({ ...prev, videoProfile: { ...prev.videoProfile, [key]: value } }));

  const payload = () => {
    const data = {
      enabled: Boolean(form.enabled),
      audioEnabled: Boolean(form.audioEnabled),
      videoEnabled: Boolean(form.videoEnabled),
      groupEnabled: Boolean(form.groupEnabled),
      maxGroupParticipants: Number(form.maxGroupParticipants || 12),
      groupSfu: {
        enabled: Boolean(form.groupSfu.enabled),
        provider: 'livekit',
        url: String(form.groupSfu.url || '').trim(),
        apiKey: String(form.groupSfu.apiKey || '').trim(),
        tokenTtlSec: Number(form.groupSfu.tokenTtlSec || 3600),
        minParticipants: Number(form.groupSfu.minParticipants || 3),
        adaptiveStream: Boolean(form.groupSfu.adaptiveStream),
        dynacast: Boolean(form.groupSfu.dynacast),
      },
      ringingTimeoutSec: Number(form.ringingTimeoutSec || 45),
      reconnectGraceSec: Number(form.reconnectGraceSec || 12),
      iceTransportPolicy: form.iceTransportPolicy,
      stunUrls: fromLines(asLines(form.stunUrls)),
      turn: {
        enabled: Boolean(form.turn.enabled),
        urls: fromLines(asLines(form.turn.urls)),
        authMode: form.turn.authMode,
        username: String(form.turn.username || '').trim(),
        credentialTtlSec: Number(form.turn.credentialTtlSec || 3600),
      },
      audioProfile: { ...form.audioProfile },
      videoProfile: {
        ...form.videoProfile,
        width: Number(form.videoProfile.width || 1280),
        height: Number(form.videoProfile.height || 720),
        frameRate: Number(form.videoProfile.frameRate || 30),
        minWidth: Number(form.videoProfile.minWidth || 320),
        minHeight: Number(form.videoProfile.minHeight || 180),
        minFrameRate: Number(form.videoProfile.minFrameRate || 15),
      },
    };
    if (form.turn.credential) data.turn.credential = form.turn.credential;
    if (form.turn.sharedSecret) data.turn.sharedSecret = form.turn.sharedSecret;
    if (form.groupSfu.apiSecret) data.groupSfu.apiSecret = form.groupSfu.apiSecret;
    return data;
  };

  const applyPayload = (next) => {
    if (!next) return;
    setForm((prev) => ({
      ...prev,
      ...next,
      turn: { ...prev.turn, ...(next.turn || {}), credential: '', sharedSecret: '' },
      groupSfu: { ...prev.groupSfu, ...(next.groupSfu || {}), apiSecret: '' },
      audioProfile: { ...prev.audioProfile, ...(next.audioProfile || {}) },
      videoProfile: { ...prev.videoProfile, ...(next.videoProfile || {}) },
    }));
  };

  const save = async () => {
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const res = await axios.patch('/admin/calling/config', payload());
      applyPayload(res?.data?.payload);
      setMessage('Calling settings saved in MongoDB. Group SFU policy is now available to runtime clients.');
    } catch (err) {
      setError(err?.response?.data?.message || err.message);
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setMessage('');
    setError('');
    try {
      const res = await axios.post('/admin/calling/config/test', payload());
      const data = res?.data?.payload || {};
      setMessage(`Calling validation passed in ${data.latencyMs || 0} ms across ${data.checks?.length || 0} configured endpoint(s).`);
      setForm((prev) => ({
        ...prev,
        lastTestedAt: new Date().toISOString(),
        lastTestStatus: 'success',
        lastTestMessage: res?.data?.message || 'Success',
      }));
    } catch (err) {
      setError(err?.response?.data?.message || err.message);
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return <div style={styles.page}><div style={styles.card}>Loading calling settings…</div></div>;
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 28 }}>Calling & WebRTC</h1>
            <p style={{ ...styles.help, marginTop: 7 }}>DB-backed call configuration for P2P WebRTC, TURN, and scalable LiveKit SFU group media. Secrets are encrypted at rest and never returned to the admin UI.</p>
          </div>
          <a href="/admin" style={{ textDecoration: 'none', fontWeight: 700 }}>← Admin</a>
        </div>

        {error && <div style={{ padding: 12, borderRadius: 10, marginBottom: 16, background: '#fff0f0', color: '#a11' }}>{error}</div>}
        {message && <div style={{ padding: 12, borderRadius: 10, marginBottom: 16, background: '#eefbf3', color: '#176b3a' }}>{message}</div>}

        <div style={styles.row}>
          <label style={styles.field}><span style={styles.label}>Global calling</span><span><input type="checkbox" checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} /> Enable calls</span></label>
          <label style={styles.field}><span style={styles.label}>Audio calls</span><span><input type="checkbox" checked={form.audioEnabled} onChange={(e) => set('audioEnabled', e.target.checked)} /> Enabled</span></label>
          <label style={styles.field}><span style={styles.label}>Video calls</span><span><input type="checkbox" checked={form.videoEnabled} onChange={(e) => set('videoEnabled', e.target.checked)} /> Enabled</span></label>
          <label style={styles.field}><span style={styles.label}>Group calls</span><span><input type="checkbox" checked={form.groupEnabled} onChange={(e) => set('groupEnabled', e.target.checked)} /> Enabled</span></label>
        </div>

        <div style={styles.row}>
          <label style={styles.field}><span style={styles.label}>Ringing timeout (sec)</span><input style={styles.input} type="number" min="10" max="120" value={form.ringingTimeoutSec} onChange={(e) => set('ringingTimeoutSec', e.target.value)} /></label>
          <label style={styles.field}><span style={styles.label}>Reconnect grace (sec)</span><input style={styles.input} type="number" min="3" max="60" value={form.reconnectGraceSec} onChange={(e) => set('reconnectGraceSec', e.target.value)} /></label>
          <label style={styles.field}><span style={styles.label}>Max group participants</span><input style={styles.input} type="number" min="2" max="100" value={form.maxGroupParticipants} onChange={(e) => set('maxGroupParticipants', e.target.value)} /><span style={styles.help}>P2P is limited to small groups. Larger groups are routed through SFU when enabled.</span></label>
          <label style={styles.field}><span style={styles.label}>ICE transport policy</span><select style={styles.input} value={form.iceTransportPolicy} onChange={(e) => set('iceTransportPolicy', e.target.value)}><option value="all">All (direct + relay)</option><option value="relay">TURN relay only</option></select></label>
        </div>

        <div style={styles.section}>
          <h2 style={{ marginTop: 0 }}>Group Media SFU</h2>
          <p style={styles.help}>LiveKit can be self-hosted or cloud-hosted. SyncChat creates short-lived participant tokens on the backend; API secrets never reach the browser.</p>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, fontWeight: 700 }}><input type="checkbox" checked={form.groupSfu.enabled} onChange={(e) => setGroupSfu('enabled', e.target.checked)} />Enable LiveKit SFU for larger group calls</label>
          <div style={styles.row}>
            <label style={styles.field}><span style={styles.label}>Provider</span><select style={styles.input} value="livekit" disabled><option value="livekit">LiveKit</option></select></label>
            <label style={styles.field}><span style={styles.label}>LiveKit URL</span><input style={styles.input} value={form.groupSfu.url} onChange={(e) => setGroupSfu('url', e.target.value)} placeholder="wss://media.example.com" /><span style={styles.help}>Use your self-hosted or LiveKit Cloud websocket URL.</span></label>
            <label style={styles.field}><span style={styles.label}>API key</span><input style={styles.input} value={form.groupSfu.apiKey} onChange={(e) => setGroupSfu('apiKey', e.target.value)} placeholder="API key" /></label>
            <label style={styles.field}><span style={styles.label}>API secret</span><input style={styles.input} type="password" value={form.groupSfu.apiSecret} onChange={(e) => setGroupSfu('apiSecret', e.target.value)} placeholder={form.groupSfu.apiSecretSet ? 'Saved — leave blank to keep' : 'API secret'} /><span style={styles.help}>{form.groupSfu.apiSecretSet ? 'Encrypted secret already stored.' : 'No API secret stored yet.'}</span></label>
          </div>
          <div style={styles.row}>
            <label style={styles.field}><span style={styles.label}>Use SFU from participants</span><input style={styles.input} type="number" min="3" max="100" value={form.groupSfu.minParticipants} onChange={(e) => setGroupSfu('minParticipants', e.target.value)} /><span style={styles.help}>Recommended: 3. Calls below this threshold stay on the existing P2P path.</span></label>
            <label style={styles.field}><span style={styles.label}>Participant token TTL (sec)</span><input style={styles.input} type="number" min="300" max="21600" value={form.groupSfu.tokenTtlSec} onChange={(e) => setGroupSfu('tokenTtlSec', e.target.value)} /></label>
            <label style={styles.field}><span style={styles.label}>Adaptive stream</span><span><input type="checkbox" checked={form.groupSfu.adaptiveStream} onChange={(e) => setGroupSfu('adaptiveStream', e.target.checked)} /> Dynamically subscribe to useful video quality</span></label>
            <label style={styles.field}><span style={styles.label}>Dynacast</span><span><input type="checkbox" checked={form.groupSfu.dynacast} onChange={(e) => setGroupSfu('dynacast', e.target.checked)} /> Pause unused published video layers</span></label>
          </div>
        </div>

        <div style={styles.section}>
          <h2 style={{ marginTop: 0 }}>STUN / TURN</h2>
          <div style={styles.row}>
            <label style={styles.field}><span style={styles.label}>STUN URLs</span><textarea style={{ ...styles.input, minHeight: 110 }} value={asLines(form.stunUrls)} onChange={(e) => set('stunUrls', fromLines(e.target.value))} placeholder="stun:stun.example.com:3478" /><span style={styles.help}>One URL per line.</span></label>
            <label style={styles.field}><span style={styles.label}>TURN URLs</span><textarea style={{ ...styles.input, minHeight: 110 }} value={asLines(form.turn.urls)} onChange={(e) => setTurn('urls', fromLines(e.target.value))} placeholder={'turn:turn.example.com:3478?transport=udp\nturns:turn.example.com:5349?transport=tcp'} /><span style={styles.help}>Add UDP and TLS/TCP endpoints when available.</span></label>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, fontWeight: 700 }}><input type="checkbox" checked={form.turn.enabled} onChange={(e) => setTurn('enabled', e.target.checked)} />Enable TURN fallback</label>
          <div style={styles.row}>
            <label style={styles.field}><span style={styles.label}>TURN auth mode</span><select style={styles.input} value={form.turn.authMode} onChange={(e) => setTurn('authMode', e.target.value)}><option value="static">Static username/credential</option><option value="shared-secret">Coturn shared secret (recommended)</option></select></label>
            {form.turn.authMode === 'static' ? (
              <>
                <label style={styles.field}><span style={styles.label}>TURN username</span><input style={styles.input} value={form.turn.username} onChange={(e) => setTurn('username', e.target.value)} /></label>
                <label style={styles.field}><span style={styles.label}>TURN credential</span><input style={styles.input} type="password" value={form.turn.credential} onChange={(e) => setTurn('credential', e.target.value)} placeholder={form.turn.credentialSet ? 'Saved — leave blank to keep' : 'TURN password'} /><span style={styles.help}>{form.turn.credentialSet ? 'Encrypted credential already stored.' : 'No credential stored yet.'}</span></label>
              </>
            ) : (
              <>
                <label style={styles.field}><span style={styles.label}>Coturn shared secret</span><input style={styles.input} type="password" value={form.turn.sharedSecret} onChange={(e) => setTurn('sharedSecret', e.target.value)} placeholder={form.turn.sharedSecretSet ? 'Saved — leave blank to keep' : 'static-auth-secret'} /><span style={styles.help}>{form.turn.sharedSecretSet ? 'Encrypted secret already stored.' : 'Use the same secret configured in Coturn.'}</span></label>
                <label style={styles.field}><span style={styles.label}>Temporary credential TTL (sec)</span><input style={styles.input} type="number" min="300" max="86400" value={form.turn.credentialTtlSec} onChange={(e) => setTurn('credentialTtlSec', e.target.value)} /></label>
              </>
            )}
          </div>
        </div>

        <div style={styles.section}>
          <h2 style={{ marginTop: 0 }}>Media quality</h2>
          <div style={styles.row}>
            <label style={styles.field}><span style={styles.label}>Audio processing</span><span><input type="checkbox" checked={form.audioProfile.echoCancellation} onChange={(e) => setAudio('echoCancellation', e.target.checked)} /> Echo cancellation</span><span><input type="checkbox" checked={form.audioProfile.noiseSuppression} onChange={(e) => setAudio('noiseSuppression', e.target.checked)} /> Noise suppression</span><span><input type="checkbox" checked={form.audioProfile.autoGainControl} onChange={(e) => setAudio('autoGainControl', e.target.checked)} /> Auto gain control</span></label>
            <label style={styles.field}><span style={styles.label}>Preferred video width</span><input style={styles.input} type="number" value={form.videoProfile.width} onChange={(e) => setVideo('width', e.target.value)} /></label>
            <label style={styles.field}><span style={styles.label}>Preferred video height</span><input style={styles.input} type="number" value={form.videoProfile.height} onChange={(e) => setVideo('height', e.target.value)} /></label>
            <label style={styles.field}><span style={styles.label}>Preferred FPS</span><input style={styles.input} type="number" value={form.videoProfile.frameRate} onChange={(e) => setVideo('frameRate', e.target.value)} /></label>
          </div>
          <div style={styles.row}>
            <label style={styles.field}><span style={styles.label}>Minimum width</span><input style={styles.input} type="number" value={form.videoProfile.minWidth} onChange={(e) => setVideo('minWidth', e.target.value)} /></label>
            <label style={styles.field}><span style={styles.label}>Minimum height</span><input style={styles.input} type="number" value={form.videoProfile.minHeight} onChange={(e) => setVideo('minHeight', e.target.value)} /></label>
            <label style={styles.field}><span style={styles.label}>Minimum FPS</span><input style={styles.input} type="number" value={form.videoProfile.minFrameRate} onChange={(e) => setVideo('minFrameRate', e.target.value)} /></label>
            <label style={styles.field}><span style={styles.label}>Adaptive video</span><span><input type="checkbox" checked={form.videoProfile.adaptive} onChange={(e) => setVideo('adaptive', e.target.checked)} /> Enable adaptive quality</span></label>
          </div>
        </div>

        <div style={{ padding: 14, borderRadius: 12, background: '#f7f9fc', marginTop: 20, marginBottom: 20, fontSize: 13 }}>
          Last validation: <strong>{form.lastTestStatus || 'never'}</strong>
          {form.lastTestedAt ? ` · ${new Date(form.lastTestedAt).toLocaleString()}` : ''}
          {form.lastTestMessage ? <div style={{ marginTop: 5 }}>{form.lastTestMessage}</div> : null}
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button type="button" style={{ ...styles.button, background: '#111827', color: '#fff' }} onClick={test} disabled={testing || saving}>{testing ? 'Validating…' : 'Validate Calling Config'}</button>
          <button type="button" style={{ ...styles.button, background: '#2563eb', color: '#fff' }} onClick={save} disabled={saving || testing}>{saving ? 'Saving…' : 'Save Calling Settings'}</button>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.querySelector('#calling-root')).render(<CallingAdmin />);
