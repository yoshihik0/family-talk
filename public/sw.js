self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = { title: 'はなそう', body: '新しいメッセージがあります。', url: '/', icon: '/api/v1/app-icon?size=192', tag: 'new-message' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // Ignore malformed push payloads and show the generic notification.
  }
  event.waitUntil((async () => {
    const target = new URL(data.url, self.location.origin);
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const alreadyOpen = windows.some((client) => client.visibilityState === 'visible' && new URL(client.url).pathname === target.pathname);
    if (alreadyOpen) return;
    await self.registration.showNotification(data.title, { body: data.body, icon: data.icon, badge: data.icon, tag: data.tag, data: { url: data.url } });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
    const target = new URL(targetUrl, self.location.origin);
    const existing = windowClients.find((client) => new URL(client.url).pathname === target.pathname && 'focus' in client);
    if (existing) {
      existing.navigate(targetUrl);
      return existing.focus();
    }
    return clients.openWindow(targetUrl);
  }));
});
