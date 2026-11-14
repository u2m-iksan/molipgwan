// 홈 화면 설치 + 푸시 알림용 서비스 워커 (화면 저장·캐시 없음: 항상 최신 화면)
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});

// 알림 받기: { title, body, url }
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || '몰입관', {
    body: d.body || '', icon: 'icons/icon-192.png', badge: 'icons/favicon-32.png',
    data: { url: d.url || './' }, tag: d.tag || undefined, renotify: !!d.tag,
  }));
});

// 알림 누르면: 열려 있는 앱으로 가서 그 화면, 없으면 새로 열기
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || './', self.registration.scope).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (w.url.startsWith(self.registration.scope)) { await w.focus(); w.postMessage({ type: 'open', url }); return; }
    }
    await self.clients.openWindow(url);
  })());
});
