import axios from 'axios';
import store from '../redux/store';

let installed = false;

const installE2eeDirectoryRequestV2 = () => {
  if (installed) return;
  installed = true;

  axios.interceptors.request.use((config) => {
    const method = String(config.method || 'get').toLowerCase();
    const url = String(config.url || '');
    if (method !== 'get' || !url.includes('/chat-v2/e2ee/keys')) return config;

    const roomId = String(
      config.params?.roomId || store.getState()?.room?.chat?.data?.roomId || ''
    ).trim();
    return {
      ...config,
      params: {
        ...(config.params || {}),
        roomId,
      },
    };
  });
};

export default installE2eeDirectoryRequestV2;
