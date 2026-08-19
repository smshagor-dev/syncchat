import axios from 'axios';

const urlBase64ToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

export const requestPushPermission = async () => {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
};

export const ensurePushSubscription = async ({ enabled }) => {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { status: 'unsupported' };
  }

  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();

  if (!enabled) {
    if (existing) {
      await axios.post('/settings/push/unsubscribe', {
        endpoint: existing.endpoint,
      });
      await existing.unsubscribe();
    }
    return { status: 'disabled' };
  }

  if (!('Notification' in window)) return { status: 'unsupported' };
  if (Notification.permission === 'denied') return { status: 'denied' };
  if (Notification.permission !== 'granted') {
    // Permission prompts must be initiated by an explicit user action; an app
    // mount/effect should never trigger the browser prompt automatically.
    return { status: 'permission-required' };
  }

  if (existing) {
    await axios.post('/settings/push/subscribe', {
      subscription: existing,
      userAgent: navigator.userAgent,
    });
    return { status: 'existing' };
  }

  const { data } = await axios.get('/settings/push/public-key');
  const publicKey = data?.payload?.publicKey;
  if (!publicKey) return { status: 'missing-key' };

  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  await axios.post('/settings/push/subscribe', {
    subscription,
    userAgent: navigator.userAgent,
  });

  return { status: 'subscribed' };
};
