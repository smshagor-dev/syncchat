import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import * as bi from 'react-icons/bi';
import { v4 as uuidv4 } from 'uuid';
import { setChatRoom } from '../../redux/features/room';
import { setRefreshInbox } from '../../redux/features/chore';
import { ensureDeviceKey } from '../../helpers/e2eeV2';
import {
  flushChatOutbox,
  listOutboxMessages,
  retryOutboxMessage,
} from '../../helpers/chatTransportV2';

const tabs = [
  ['search', 'Search', bi.BiSearch],
  ['requests', 'Requests', bi.BiMessageRoundedDots],
  ['mentions', 'Mentions', bi.BiAt],
  ['topics', 'Topics', bi.BiConversation],
  ['security', 'Security', bi.BiShieldQuarter],
  ['outbox', 'Outbox', bi.BiCloudUpload],
];

const prettyTime = (value) => {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString();
  } catch (error0) {
    return '';
  }
};

function GlobalChatTools() {
  const dispatch = useDispatch();
  const chat = useSelector((state) => state.room.chat);
  const master = useSelector((state) => state.user.master);
  const room = chat?.data || null;
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState('search');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');

  const [searchForm, setSearchForm] = React.useState({
    q: '',
    type: 'all',
    scope: 'current',
    targetLanguage: 'en',
  });
  const [searchResults, setSearchResults] = React.useState([]);
  const [requests, setRequests] = React.useState([]);
  const [mentions, setMentions] = React.useState([]);
  const [topics, setTopics] = React.useState([]);
  const [topicName, setTopicName] = React.useState('');
  const [selectedTopicId, setSelectedTopicId] = React.useState('');
  const [e2ee, setE2ee] = React.useState({ enabled: false, enabledBy: null, version: 0 });
  const [outbox, setOutbox] = React.useState([]);
  const [detail, setDetail] = React.useState(null);
  const [uploadState, setUploadState] = React.useState({
    running: false,
    progress: 0,
    name: '',
  });

  const clearStatus = () => {
    setError('');
    setNotice('');
  };

  const refreshRoom = React.useCallback(() => {
    if (!chat?.isOpen || !room) return;
    dispatch(
      setChatRoom({
        ...chat,
        refreshId: uuidv4(),
        data: { ...room },
      })
    );
  }, [chat, room, dispatch]);

  const loadSearch = React.useCallback(async () => {
    setLoading(true);
    clearStatus();
    try {
      const { data } = await axios.get('/chat-v2/search', {
        params: {
          q: searchForm.q,
          type: searchForm.type,
          roomId:
            searchForm.scope === 'current' && room?.roomId ? room.roomId : undefined,
          topicId: selectedTopicId || undefined,
          limit: 80,
        },
      });
      setSearchResults(data?.payload || []);
    } catch (error0) {
      setError(error0?.response?.data?.message || error0.message);
    } finally {
      setLoading(false);
    }
  }, [room?.roomId, searchForm, selectedTopicId]);

  const loadRequests = React.useCallback(async () => {
    try {
      const { data } = await axios.get('/chat-v2/message-requests');
      setRequests(data?.payload || []);
    } catch (error0) {
      setError(error0?.response?.data?.message || error0.message);
    }
  }, []);

  const loadMentions = React.useCallback(async () => {
    try {
      const { data } = await axios.get('/chat-v2/mentions', { params: { limit: 100 } });
      setMentions(data?.payload || []);
    } catch (error0) {
      setError(error0?.response?.data?.message || error0.message);
    }
  }, []);

  const loadTopics = React.useCallback(async () => {
    if (!room?.roomId || room?.roomType !== 'group') {
      setTopics([]);
      setSelectedTopicId('');
      return;
    }
    try {
      const { data } = await axios.get(`/chat-v2/topics/${room.roomId}`);
      const list = data?.payload || [];
      setTopics(list);
      const stored = String(localStorage.getItem(`syncchat:topic:${room.roomId}`) || '');
      setSelectedTopicId(list.some((item) => item._id === stored) ? stored : '');
    } catch (error0) {
      setError(error0?.response?.data?.message || error0.message);
    }
  }, [room?.roomId, room?.roomType]);

  const loadE2ee = React.useCallback(async () => {
    if (!room?.roomId || room?.roomType !== 'private') {
      setE2ee({ enabled: false, enabledBy: null, version: 0 });
      return;
    }
    try {
      const { data } = await axios.get(`/chat-v2/e2ee/rooms/${room.roomId}`);
      setE2ee(data?.payload || { enabled: false, enabledBy: null, version: 0 });
    } catch (error0) {
      setError(error0?.response?.data?.message || error0.message);
    }
  }, [room?.roomId, room?.roomType]);

  const loadOutbox = React.useCallback(async () => {
    const rows = await listOutboxMessages().catch(() => []);
    setOutbox(rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
  }, []);

  const loadTab = React.useCallback(async () => {
    clearStatus();
    if (tab === 'search') await loadSearch();
    if (tab === 'requests') await loadRequests();
    if (tab === 'mentions') await loadMentions();
    if (tab === 'topics') await loadTopics();
    if (tab === 'security') await loadE2ee();
    if (tab === 'outbox') await loadOutbox();
  }, [tab, loadSearch, loadRequests, loadMentions, loadTopics, loadE2ee, loadOutbox]);

  React.useEffect(() => {
    if (!open) return;
    loadTab();
  }, [open, loadTab]);

  React.useEffect(() => {
    const onKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  React.useEffect(() => {
    if (!room?.roomId) return;
    loadTopics();
    loadE2ee();
  }, [room?.roomId, loadTopics, loadE2ee]);

  const actionRequest = async (requestId, action) => {
    clearStatus();
    try {
      await axios.post(`/chat-v2/message-requests/${requestId}/action`, { action });
      setRequests((prev) => prev.filter((item) => item._id !== requestId));
      dispatch(setRefreshInbox(uuidv4()));
      setNotice(`Request ${action === 'accept' ? 'accepted' : action === 'block' ? 'blocked' : 'deleted'}.`);
    } catch (error0) {
      setError(error0?.response?.data?.message || error0.message);
    }
  };

  const chooseTopic = (topicId) => {
    if (!room?.roomId) return;
    setSelectedTopicId(topicId || '');
    if (topicId) localStorage.setItem(`syncchat:topic:${room.roomId}`, topicId);
    else localStorage.removeItem(`syncchat:topic:${room.roomId}`);
    window.dispatchEvent(
      new CustomEvent('syncchat:topic-selected', {
        detail: { roomId: room.roomId, topicId: topicId || null },
      })
    );
    setNotice(topicId ? 'New messages will be sent to this topic.' : 'Showing all messages.');
    refreshRoom();
  };

  const createTopic = async () => {
    const name = String(topicName || '').trim();
    if (!name || !room?.roomId) return;
    clearStatus();
    try {
      const { data } = await axios.post(`/chat-v2/topics/${room.roomId}`, { name });
      setTopicName('');
      await loadTopics();
      if (data?.payload?._id) chooseTopic(data.payload._id);
    } catch (error0) {
      setError(error0?.response?.data?.message || error0.message);
    }
  };

  const toggleE2ee = async () => {
    if (!room?.roomId || room?.roomType !== 'private') return;
    clearStatus();
    setLoading(true);
    try {
      if (!e2ee.enabled) await ensureDeviceKey({ forceRegister: true });
      const { data } = await axios.post(`/chat-v2/e2ee/rooms/${room.roomId}`, {
        enabled: !e2ee.enabled,
      });
      const next = data?.payload || { enabled: !e2ee.enabled };
      setE2ee(next);
      dispatch(
        setChatRoom({
          ...chat,
          refreshId: uuidv4(),
          data: {
            ...room,
            e2eeEnabled: !!next.enabled,
            e2eeEnabledBy: next.enabledBy || null,
            e2eeVersion: Number(next.version || 0),
          },
        })
      );
      setNotice(next.enabled ? 'Device E2EE enabled for new text messages.' : 'Device E2EE disabled.');
    } catch (error0) {
      setError(error0?.response?.data?.message || error0.message);
    } finally {
      setLoading(false);
    }
  };

  const showReceipts = async (chatId) => {
    try {
      const { data } = await axios.get(`/chat-v2/messages/${chatId}/receipts`);
      setDetail({ title: 'Message receipts', payload: data?.payload || [] });
    } catch (error0) {
      setError(error0?.response?.data?.message || error0.message);
    }
  };

  const showHistory = async (chatId) => {
    try {
      const { data } = await axios.get(`/chat-v2/messages/${chatId}/history`);
      setDetail({ title: 'Edit history', payload: data?.payload || {} });
    } catch (error0) {
      setError(error0?.response?.data?.message || error0.message);
    }
  };

  const translate = async (item) => {
    try {
      const { data } = await axios.post('/chat-v2/translate', {
        chatId: item._id,
        targetLanguage: searchForm.targetLanguage,
      });
      setDetail({ title: `Translation (${searchForm.targetLanguage})`, payload: data?.payload || {} });
    } catch (error0) {
      setError(error0?.response?.data?.message || error0.message);
    }
  };

  const transcribe = async (item) => {
    try {
      const { data } = await axios.post('/chat-v2/transcribe', { chatId: item._id });
      setDetail({ title: 'Voice transcription', payload: data?.payload || {} });
      await loadSearch();
    } catch (error0) {
      setError(error0?.response?.data?.message || error0.message);
    }
  };

  const resumableUpload = async (file) => {
    if (!file || !room?.roomId) return;
    clearStatus();
    setUploadState({ running: true, progress: 0, name: file.name });
    const chunkSize = 1024 * 1024;
    try {
      const init = await axios.post('/chat-v2/uploads', {
        filename: file.name,
        mime: file.type || 'application/octet-stream',
        totalSize: file.size,
        chunkSize,
      });
      const uploadId = init.data?.payload?.uploadId;
      const totalParts = Math.ceil(file.size / chunkSize);
      for (let index = 0; index < totalParts; index += 1) {
        const chunk = file.slice(index * chunkSize, Math.min(file.size, (index + 1) * chunkSize));
        const bytes = await chunk.arrayBuffer();
        let attempt = 0;
        let sent = false;
        while (!sent && attempt < 3) {
          attempt += 1;
          try {
            // eslint-disable-next-line no-await-in-loop
            await axios.put(`/chat-v2/uploads/${uploadId}/parts/${index}`, bytes, {
              headers: { 'Content-Type': 'application/octet-stream' },
            });
            sent = true;
          } catch (error0) {
            if (attempt >= 3) throw error0;
            // eslint-disable-next-line no-await-in-loop
            await new Promise((resolve) => setTimeout(resolve, attempt * 600));
          }
        }
        setUploadState({
          running: true,
          progress: Math.round(((index + 1) / totalParts) * 100),
          name: file.name,
        });
      }
      const complete = await axios.post(`/chat-v2/uploads/${uploadId}/complete`);
      const uploaded = complete.data?.payload;
      if (!uploaded?.url) throw new Error('Upload completed without a file URL');

      await axios.post('/chats/send-file', {
        roomId: room.roomId,
        ownersId: room.ownersId || [],
        roomType: room.roomType,
        text: '',
        replyTo: null,
        file: uploaded,
      });
      setUploadState({ running: false, progress: 100, name: file.name });
      setNotice('Large file uploaded and sent.');
      refreshRoom();
    } catch (error0) {
      setUploadState((prev) => ({ ...prev, running: false }));
      setError(error0?.response?.data?.message || error0.message);
    }
  };

  const buttonClass = (active = false) =>
    `flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
      active
        ? 'bg-sky-600 text-white'
        : 'hover:bg-slate-100 dark:hover:bg-spill-700'
    }`;

  return (
    <>
      <button
        type="button"
        title="Chat tools (Ctrl/⌘ + K)"
        className="fixed bottom-5 right-5 z-[430] grid h-12 w-12 place-items-center rounded-full bg-sky-600 text-white shadow-xl hover:bg-sky-700"
        onClick={() => setOpen((prev) => !prev)}
      >
        <bi.BiCommand size={22} />
      </button>

      {open && (
        <div className="fixed inset-0 z-[429] bg-slate-950/35 p-3 sm:p-6" onClick={() => setOpen(false)} aria-hidden>
          <div
            className="ml-auto flex h-[min(760px,calc(100vh-1.5rem))] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-spill-800"
            onClick={(event) => event.stopPropagation()}
            aria-hidden
          >
            <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-spill-700">
              <div>
                <h2 className="font-bold">Chat Tools</h2>
                <p className="text-xs opacity-60">
                  {room?.roomId ? room?.profile?.fullname || room?.channel?.name || room?.group?.name || 'Current chat' : 'Global chat tools'}
                </p>
              </div>
              <button type="button" className="rounded-full p-2 hover:bg-slate-100 dark:hover:bg-spill-700" onClick={() => setOpen(false)}>
                <bi.BiX size={22} />
              </button>
            </header>

            <div className="flex gap-1 overflow-x-auto border-b border-slate-200 p-2 dark:border-spill-700">
              {tabs.map(([id, label, Icon]) => (
                <button key={id} type="button" className={buttonClass(tab === id)} onClick={() => { setTab(id); setDetail(null); }}>
                  <Icon /> {label}
                  {id === 'requests' && requests.length > 0 ? ` (${requests.length})` : ''}
                </button>
              ))}
            </div>

            <main className="flex-1 overflow-y-auto p-4">
              {error && <div className="mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">{error}</div>}
              {notice && <div className="mb-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">{notice}</div>}

              {tab === 'search' && (
                <div className="grid gap-3">
                  <div className="grid gap-2 sm:grid-cols-[1fr_130px_130px_auto]">
                    <input value={searchForm.q} onChange={(event) => setSearchForm((prev) => ({ ...prev, q: event.target.value }))} onKeyDown={(event) => { if (event.key === 'Enter') loadSearch(); }} placeholder="Search messages…" className="rounded-xl border border-slate-300 bg-transparent px-3 py-2 dark:border-spill-600" />
                    <select value={searchForm.type} onChange={(event) => setSearchForm((prev) => ({ ...prev, type: event.target.value }))} className="rounded-xl border border-slate-300 bg-transparent px-2 py-2 dark:border-spill-600">
                      {['all', 'text', 'image', 'video', 'audio', 'document', 'link', 'call', 'poll'].map((type) => <option key={type} value={type}>{type}</option>)}
                    </select>
                    <select value={searchForm.scope} onChange={(event) => setSearchForm((prev) => ({ ...prev, scope: event.target.value }))} className="rounded-xl border border-slate-300 bg-transparent px-2 py-2 dark:border-spill-600">
                      <option value="current">Current chat</option>
                      <option value="all">All chats</option>
                    </select>
                    <button type="button" className="rounded-xl bg-sky-600 px-4 py-2 font-semibold text-white" onClick={loadSearch}>Search</button>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="opacity-60">AI target:</span>
                    <input value={searchForm.targetLanguage} onChange={(event) => setSearchForm((prev) => ({ ...prev, targetLanguage: event.target.value.slice(0, 16) }))} className="w-20 rounded border border-slate-300 bg-transparent px-2 py-1 dark:border-spill-600" />
                  </div>
                  {loading && <p className="text-sm opacity-60">Searching…</p>}
                  <div className="grid gap-2">
                    {searchResults.map((item) => (
                      <article key={item._id} className="rounded-xl border border-slate-200 p-3 dark:border-spill-700">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold opacity-60">{item.profile?.fullname || item.userId} · {prettyTime(item.createdAt)}</p>
                            <p className="mt-1 break-words text-sm">{item.text || item.transcript || item.file?.originalname || '[attachment]'}</p>
                            {item.transcript && <p className="mt-1 text-xs text-sky-600">Transcript: {item.transcript}</p>}
                          </div>
                          <span className="rounded bg-slate-100 px-2 py-1 text-[10px] dark:bg-spill-700">#{item.sequence || 0}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                          <button type="button" className="rounded bg-slate-100 px-2 py-1 dark:bg-spill-700" onClick={() => showReceipts(item._id)}>Receipts</button>
                          {item.isEdited && <button type="button" className="rounded bg-slate-100 px-2 py-1 dark:bg-spill-700" onClick={() => showHistory(item._id)}>Edit history</button>}
                          {!!item.text && !item.e2eeEnvelope && <button type="button" className="rounded bg-slate-100 px-2 py-1 dark:bg-spill-700" onClick={() => translate(item)}>Translate</button>}
                          {item.file?.type === 'audio' && !item.e2eeEnvelope && <button type="button" className="rounded bg-slate-100 px-2 py-1 dark:bg-spill-700" onClick={() => transcribe(item)}>Transcribe</button>}
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              )}

              {tab === 'requests' && (
                <div className="grid gap-2">
                  {requests.length === 0 && <p className="text-sm opacity-60">No pending message requests.</p>}
                  {requests.map((item) => (
                    <article key={item._id} className="rounded-xl border border-slate-200 p-3 dark:border-spill-700">
                      <p className="font-semibold">{item.profile?.fullname || item.profile?.username || 'Unknown user'}</p>
                      <p className="mt-1 text-sm opacity-75">{item.preview || 'New message request'}</p>
                      <p className="mt-1 text-xs opacity-50">{prettyTime(item.lastMessageAt)}</p>
                      <div className="mt-3 flex gap-2">
                        <button type="button" className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white" onClick={() => actionRequest(item._id, 'accept')}>Accept</button>
                        <button type="button" className="rounded-lg bg-slate-100 px-3 py-2 text-xs dark:bg-spill-700" onClick={() => actionRequest(item._id, 'decline')}>Delete</button>
                        <button type="button" className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white" onClick={() => actionRequest(item._id, 'block')}>Block</button>
                      </div>
                    </article>
                  ))}
                </div>
              )}

              {tab === 'mentions' && (
                <div className="grid gap-2">
                  {mentions.length === 0 && <p className="text-sm opacity-60">No recent mentions.</p>}
                  {mentions.map((item) => (
                    <article key={item._id} className="rounded-xl border border-slate-200 p-3 dark:border-spill-700">
                      <p className="text-xs opacity-55">{prettyTime(item.createdAt)}</p>
                      <p className="mt-1 text-sm">{item.text || '[attachment]'}</p>
                    </article>
                  ))}
                </div>
              )}

              {tab === 'topics' && (
                <div className="grid gap-3">
                  {room?.roomType !== 'group' ? (
                    <p className="text-sm opacity-60">Open a group or channel to manage topics.</p>
                  ) : (
                    <>
                      <div className="flex gap-2">
                        <input value={topicName} onChange={(event) => setTopicName(event.target.value)} placeholder="New topic name" className="flex-1 rounded-xl border border-slate-300 bg-transparent px-3 py-2 dark:border-spill-600" />
                        <button type="button" onClick={createTopic} className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white">Create</button>
                      </div>
                      <button type="button" className={`rounded-xl border p-3 text-left ${!selectedTopicId ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/30' : 'border-slate-200 dark:border-spill-700'}`} onClick={() => chooseTopic('')}>
                        <p className="font-semibold">All messages</p>
                      </button>
                      {topics.map((item) => (
                        <button key={item._id} type="button" className={`rounded-xl border p-3 text-left ${selectedTopicId === item._id ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/30' : 'border-slate-200 dark:border-spill-700'}`} onClick={() => chooseTopic(item._id)}>
                          <p className="font-semibold">{item.icon || 'topic'} {item.name}</p>
                          <p className="text-xs opacity-55">{item.closed ? 'Closed' : 'Open'}{item.pinned ? ' · pinned' : ''}</p>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}

              {tab === 'security' && (
                <div className="grid gap-4">
                  {room?.roomType !== 'private' ? (
                    <p className="text-sm opacity-60">Open a private chat to manage device E2EE.</p>
                  ) : (
                    <>
                      <div className="rounded-xl border border-slate-200 p-4 dark:border-spill-700">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="font-semibold">Device end-to-end encryption</p>
                            <p className="mt-1 text-xs opacity-60">{e2ee.enabled ? 'Enabled for new text messages' : 'Disabled'}</p>
                          </div>
                          <button type="button" disabled={loading} onClick={toggleE2ee} className={`rounded-xl px-4 py-2 text-sm font-semibold text-white ${e2ee.enabled ? 'bg-rose-600' : 'bg-emerald-600'}`}>
                            {e2ee.enabled ? 'Disable' : 'Enable'}
                          </button>
                        </div>
                      </div>
                      <div className="rounded-xl bg-amber-50 p-4 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                        This mode uses browser-held device keys and server-blind ECDH/HKDF/AES-GCM encryption for message text. It is not the Signal Double Ratchet protocol and does not yet provide Signal-style forward secrecy for media attachments.
                      </div>
                    </>
                  )}
                </div>
              )}

              {tab === 'outbox' && (
                <div className="grid gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold">Offline send queue</p>
                      <p className="text-xs opacity-60">Queued messages retry after reconnect without changing clientMessageId.</p>
                    </div>
                    <button type="button" className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white" onClick={async () => { await flushChatOutbox(); await loadOutbox(); }}>Flush now</button>
                  </div>
                  {outbox.length === 0 && <p className="text-sm opacity-60">Outbox is empty.</p>}
                  {outbox.map((item) => (
                    <article key={item.clientMessageId} className="rounded-xl border border-slate-200 p-3 dark:border-spill-700">
                      <div className="flex justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm">{item.payload?.text || '[attachment/message]'}</p>
                          <p className="mt-1 text-xs opacity-50">{item.status} · attempts {item.attempts || 0}</p>
                          {item.error && <p className="mt-1 text-xs text-rose-600">{item.error}</p>}
                        </div>
                        {item.status === 'failed' && <button type="button" className="h-fit rounded bg-slate-100 px-2 py-1 text-xs dark:bg-spill-700" onClick={async () => { await retryOutboxMessage(item.clientMessageId); await loadOutbox(); }}>Retry</button>}
                      </div>
                    </article>
                  ))}

                  {room?.roomId && (
                    <label className="mt-2 grid cursor-pointer gap-2 rounded-xl border border-dashed border-slate-300 p-4 dark:border-spill-600">
                      <span className="font-semibold">Resumable large-file upload</span>
                      <span className="text-xs opacity-60">Chunks are persisted in MongoDB and finalized to configured FTP/FTPS storage.</span>
                      <input type="file" disabled={uploadState.running} onChange={(event) => resumableUpload(event.target.files?.[0])} />
                      {(uploadState.running || uploadState.progress > 0) && (
                        <div>
                          <div className="mb-1 flex justify-between text-xs"><span>{uploadState.name}</span><span>{uploadState.progress}%</span></div>
                          <div className="h-2 overflow-hidden rounded bg-slate-200 dark:bg-spill-700"><div className="h-full bg-sky-600" style={{ width: `${uploadState.progress}%` }} /></div>
                        </div>
                      )}
                    </label>
                  )}
                </div>
              )}

              {detail && (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-spill-700 dark:bg-spill-900/50">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold">{detail.title}</p>
                    <button type="button" onClick={() => setDetail(null)}><bi.BiX /></button>
                  </div>
                  <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(detail.payload, null, 2)}</pre>
                </div>
              )}
            </main>

            <footer className="flex items-center justify-between border-t border-slate-200 px-4 py-2 text-[11px] opacity-60 dark:border-spill-700">
              <span>Signed in as {master?.fullname || master?.username || 'user'}</span>
              <span>Ctrl/⌘ + K</span>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}

export default GlobalChatTools;
