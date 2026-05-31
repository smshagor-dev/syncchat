export function showLocalNotification(title, body) {
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
