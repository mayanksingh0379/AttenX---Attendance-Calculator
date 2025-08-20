self.addEventListener("install", event => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(clients.claim());
});

self.addEventListener("push", event => {
  const options = {
    body: event.data.text(),
    icon: "favicon.png",
    badge: "favicon.png",
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: "1"
    },
    actions: [
      {
        action: "open",
        title: "Open AttenX"
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification("AttenX Reminder", options)
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(clients.openWindow("/"));
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
