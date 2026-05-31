import axios from 'axios';
import config from '../../config';

const authDebug = (...args) => {
  if (config.isDev) console.log('[AuthDebug]', ...args);
};

export const getSetting = async (queries) => {
  try {
    authDebug('settings:request');
    const { data } = await axios.get('/settings', queries);
    const setting = data?.payload;
    authDebug('settings:raw-response', data);

    if (!setting) return null;

    document.body.classList[setting.dark ? 'add' : 'remove']('dark');
    return setting;
  } catch (error0) {
    console.error(
      '[AuthDebug] settings:error',
      error0?.response?.status,
      error0?.response?.data?.message || error0.message
    );

    return null;
  }
};
