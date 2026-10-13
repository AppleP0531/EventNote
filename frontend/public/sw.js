// EventNote Service Worker
// サーバーから届いた Web Push を通知として表示する（タブを閉じていても動く）

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "EventNote", {
      body: data.body || "",
      tag: data.tag,
      data: { url: data.url || "/" },
      requireInteraction: true, // 閉じるまで表示し続ける
    }),
  );
});

// 通知をクリックしたらアプリを開く（開いていればそのタブを前面に）
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
