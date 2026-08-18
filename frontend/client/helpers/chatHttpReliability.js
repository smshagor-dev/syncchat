import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

let installed = false;

const isSendFileRequest = (config = {}) =>
  String(config.method || '').toLowerCase() === 'post' &&
  String(config.url || '').includes('/chats/send-file');

const activeTopicFor = (roomId) =>
  String(localStorage.getItem(`syncchat:topic:${roomId}`) || '').trim() || null;

const parseData = (value) => {
  if (value && typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch (error0) {
      // Ignore non-JSON request bodies.
    }
  }
  return {};
};

const getHeader = (headers, name) => {
  if (!headers) return '';
  if (typeof headers.get === 'function') return headers.get(name) || '';
  const key = Object.keys(headers).find(
    (item) => String(item).toLowerCase() === String(name).toLowerCase()
  );
  return key ? headers[key] : '';
};

const installChatHttpReliability = () => {
  if (installed) return;
  installed = true;

  axios.interceptors.request.use((config) => {
    if (!isSendFileRequest(config)) return config;
    const data = parseData(config.data);
    const existingHeaderId = String(
      getHeader(config.headers, 'X-Client-Message-Id') || ''
    ).trim();
    const clientMessageId =
      existingHeaderId ||
      String(data.clientMessageId || '').trim() ||
      (crypto.randomUUID ? crypto.randomUUID() : uuidv4());
    const roomId = String(data.roomId || '').trim();

    return {
      ...config,
      headers: {
        ...(config.headers || {}),
        'X-Client-Message-Id': clientMessageId,
      },
      data: {
        ...data,
        clientMessageId,
        topicId: data.topicId || (roomId ? activeTopicFor(roomId) : null),
      },
    };
  });

  axios.interceptors.response.use(
    (response0) => response0,
    async (error0) => {
      const config = error0?.config;
      if (!config || !isSendFileRequest(config)) return Promise.reject(error0);

      // Retry only transport failures/timeouts, never application validation errors.
      if (error0.response) return Promise.reject(error0);
      const count = Number(config.__syncchatMediaRetryCount || 0);
      if (count >= 2) return Promise.reject(error0);

      const nextConfig = {
        ...config,
        __syncchatMediaRetryCount: count + 1,
      };
      await new Promise((resolve) => setTimeout(resolve, 600 * (count + 1)));
      return axios(nextConfig);
    }
  );
};

export default installChatHttpReliability;
