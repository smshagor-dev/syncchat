import React from 'react';
import axios from 'axios';
import { BiBrain, BiX } from 'react-icons/bi';

const empty = {
  translationEnabled: false,
  translationUrl: '',
  translationApiKey: '',
  translationApiKeySet: false,
  transcriptionEnabled: false,
  transcriptionUrl: '',
  transcriptionApiKey: '',
  transcriptionApiKeySet: false,
  defaultTargetLanguage: 'en',
};

const auth = () => ({
  headers: {
    Authorization: `Bearer ${localStorage.getItem('admin_token') || ''}`,
  },
});

function ChatAiConfig() {
  const [hasToken, setHasToken] = React.useState(!!localStorage.getItem('admin_token'));
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState(empty);
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    const timer = setInterval(() => {
      setHasToken(!!localStorage.getItem('admin_token'));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const load = React.useCallback(async () => {
    if (!localStorage.getItem('admin_token')) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await axios.get('/admin/chat-ai/config', auth());
      setForm((prev) => ({
        ...empty,
        ...(data?.payload || {}),
        translationApiKey: '',
        transcriptionApiKey: '',
        translationApiKeySet:
          !!data?.payload?.translationApiKeySet || prev.translationApiKeySet,
        transcriptionApiKeySet:
          !!data?.payload?.transcriptionApiKeySet || prev.transcriptionApiKeySet,
      }));
    } catch (error0) {
      setError(error0?.response?.data?.message || error0.message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (open) load();
  }, [open, load]);

  const save = async () => {
    setLoading(true);
    setMessage('');
    setError('');
    try {
      const { data } = await axios.patch(
        '/admin/chat-ai/config',
        {
          translationEnabled: form.translationEnabled,
          translationUrl: form.translationUrl,
          translationApiKey: form.translationApiKey,
          transcriptionEnabled: form.transcriptionEnabled,
          transcriptionUrl: form.transcriptionUrl,
          transcriptionApiKey: form.transcriptionApiKey,
          defaultTargetLanguage: form.defaultTargetLanguage,
        },
        auth()
      );
      setForm((prev) => ({
        ...prev,
        ...(data?.payload || {}),
        translationApiKey: '',
        transcriptionApiKey: '',
      }));
      setMessage('Chat AI configuration saved.');
    } catch (error0) {
      setError(error0?.response?.data?.message || error0.message);
    } finally {
      setLoading(false);
    }
  };

  if (!hasToken) return null;

  return (
    <>
      <button
        type="button"
        title="Chat AI configuration"
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          right: 20,
          bottom: 20,
          zIndex: 350,
          width: 48,
          height: 48,
          display: 'grid',
          placeItems: 'center',
          border: 0,
          borderRadius: 999,
          background: '#0284c7',
          color: '#fff',
          boxShadow: '0 12px 30px rgba(2,132,199,.28)',
          cursor: 'pointer',
        }}
      >
        <BiBrain size={23} />
      </button>

      {open && (
        <div
          aria-hidden
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'grid',
            placeItems: 'center',
            padding: 20,
            background: 'rgba(15,23,42,.58)',
          }}
        >
          <div
            aria-hidden
            onClick={(event) => event.stopPropagation()}
            style={{
              width: 'min(620px, 100%)',
              maxHeight: '90vh',
              overflow: 'auto',
              borderRadius: 18,
              background: '#fff',
              color: '#0f172a',
              boxShadow: '0 25px 70px rgba(0,0,0,.28)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: 20, borderBottom: '1px solid #e2e8f0' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20 }}>Chat AI</h2>
                <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748b' }}>
                  DB-backed translation and voice-transcription providers. API keys are encrypted at rest.
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} style={{ border: 0, background: 'transparent', cursor: 'pointer' }}><BiX size={24} /></button>
            </div>

            <div style={{ display: 'grid', gap: 18, padding: 20 }}>
              <section style={{ display: 'grid', gap: 10, padding: 14, border: '1px solid #e2e8f0', borderRadius: 14 }}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 700 }}>
                  <input type="checkbox" checked={form.translationEnabled} onChange={(event) => setForm((prev) => ({ ...prev, translationEnabled: event.target.checked }))} />
                  Message translation
                </label>
                <input value={form.translationUrl} onChange={(event) => setForm((prev) => ({ ...prev, translationUrl: event.target.value }))} placeholder="Provider endpoint URL" style={{ padding: 10, border: '1px solid #cbd5e1', borderRadius: 10 }} />
                <input type="password" value={form.translationApiKey} onChange={(event) => setForm((prev) => ({ ...prev, translationApiKey: event.target.value }))} placeholder={form.translationApiKeySet ? 'API key saved — enter to replace' : 'API key'} style={{ padding: 10, border: '1px solid #cbd5e1', borderRadius: 10 }} />
              </section>

              <section style={{ display: 'grid', gap: 10, padding: 14, border: '1px solid #e2e8f0', borderRadius: 14 }}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 700 }}>
                  <input type="checkbox" checked={form.transcriptionEnabled} onChange={(event) => setForm((prev) => ({ ...prev, transcriptionEnabled: event.target.checked }))} />
                  Voice transcription
                </label>
                <input value={form.transcriptionUrl} onChange={(event) => setForm((prev) => ({ ...prev, transcriptionUrl: event.target.value }))} placeholder="Provider endpoint URL" style={{ padding: 10, border: '1px solid #cbd5e1', borderRadius: 10 }} />
                <input type="password" value={form.transcriptionApiKey} onChange={(event) => setForm((prev) => ({ ...prev, transcriptionApiKey: event.target.value }))} placeholder={form.transcriptionApiKeySet ? 'API key saved — enter to replace' : 'API key'} style={{ padding: 10, border: '1px solid #cbd5e1', borderRadius: 10 }} />
              </section>

              <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
                Default target language
                <input value={form.defaultTargetLanguage} maxLength={16} onChange={(event) => setForm((prev) => ({ ...prev, defaultTargetLanguage: event.target.value }))} style={{ padding: 10, border: '1px solid #cbd5e1', borderRadius: 10 }} />
              </label>

              {error && <div style={{ padding: 10, borderRadius: 10, background: '#fff1f2', color: '#be123c', fontSize: 13 }}>{error}</div>}
              {message && <div style={{ padding: 10, borderRadius: 10, background: '#ecfdf5', color: '#047857', fontSize: 13 }}>{message}</div>}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: 20, borderTop: '1px solid #e2e8f0' }}>
              <button type="button" disabled={loading} onClick={() => setOpen(false)} style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff' }}>Close</button>
              <button type="button" disabled={loading} onClick={save} style={{ padding: '10px 16px', borderRadius: 10, border: 0, background: '#0284c7', color: '#fff', fontWeight: 700 }}>{loading ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default ChatAiConfig;
