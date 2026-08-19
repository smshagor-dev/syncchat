import { v4 as uuidv4 } from 'uuid';
import socket from './socket';
import store from '../redux/store';

let installed = false;

const emitWindowEvent = (name, detail) => {
  window.dispatchEvent(new CustomEvent(name, { detail }));
};

const createClientMessageId = () =>
  window.crypto?.randomUUID?.() || uuidv4();

const buildOptimisticMessage = (source) => {
  const master = store.getState()?.user?.master || null;
  const now = new Date().toISOString();
  const clientMessageId = source.clientMessageId;

  return {
    ...source,
    _id: `pending:${clientMessageId}`,
    clientMessageId,
    userId: master?._id || source.userId || '',
    text: String(source.text || ''),
    profile: master
      ? {
          userId: master._id,
          fullname: master.fullname || '',
          username: master.username || '',
          avatar: master.avatar || 'assets/images/default-avatar.png',
        }
      : null,
    file: source.file || null,
    deletedBy: [],
    delivered: false,
    readed: false,
    reactions: {},
    pending: true,
    sendFailed: false,
    createdAt: now,
    updatedAt: now,
  };
};

const installRealtimeDelivery = () => {
  if (installed) return;
  installed = true;

  // chatTransportV2 is installed first. Wrap its reliability-aware emit so we
  // can show a local message immediately while preserving its durable outbox.
  const reliableEmit = socket.emit.bind(socket);
  // eslint-disable-next-line no-param-reassign
  socket.emit = (event, ...args) => {
    if (event !== 'chat/insert') return reliableEmit(event, ...args);

    const source =
      args[0] && typeof args[0] === 'object' ? { ...args[0] } : {};
    source.clientMessageId =
      String(source.clientMessageId || '').trim() || createClientMessageId();

    if (String(source.text || '').length > 0 || source.file) {
      emitWindowEvent(
        'syncchat:optimistic-message',
        buildOptimisticMessage(source)
      );
    }

    return reliableEmit(event, source, ...args.slice(1));
  };

  socket.on('chat/insert', (chat) => {
    if (!chat?._id || !chat?.roomId) return;
    emitWindowEvent('syncchat:message-confirmed', chat);
  });

  socket.on('chat/ack', (payload = {}) => {
    if (payload.accepted !== false || !payload.clientMessageId) return;
    emitWindowEvent('syncchat:optimistic-message-failed', payload);
  });
};

export default installRealtimeDelivery;
