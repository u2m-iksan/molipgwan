// 홈 화면 설치용 최소 서비스 워커 (저장·캐시 없음: 항상 최신 화면)
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
