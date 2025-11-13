export function showLocalNotification(title, body) {
  if (!("Notification" in window)) return;

  if (Notification.permission === "granted") {
    const options = {
      body,
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-72x72.png",
      vibrate: [100, 50, 100],
      tag: "syncchat",
    };
    new Notification(title, options);
  }
}
