export function showLocalNotification(title, body) {
  const desktopNotify = window.SyncChatDesktop?.notify;
  if (typeof desktopNotify === "function") {
    desktopNotify(title, body).catch((error) => {
      console.error(error?.message || error);
    });
    return;
  }

  if (!("Notification" in window)) return;

  if (Notification.permission === "granted") {
    const options = {
      body,
      icon: "/pwa-192x192.png",
      badge: "/pwa-192x192.png",
      vibrate: [100, 50, 100],
      tag: "syncchat",
    };
    new Notification(title, options);
  }
}
