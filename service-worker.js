// 날짜 기반 자동 캐시명 - 매일 자동 갱신되므로 수동 버전업 불필요
const CACHE_NAME = 'portfolio-v5-' + new Date().toISOString().slice(0,10);
const CACHE_FILES = [
  './portfolio_v5.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// 설치: 파일 캐시 저장
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(CACHE_FILES);
    })
  );
  self.skipWaiting();
});

// 활성화: 이전 캐시 삭제
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

// 요청: 네트워크 우선, 실패 시 캐시 (항상 최신 파일 우선)
self.addEventListener('fetch', function(event) {
  event.respondWith(
    fetch(event.request, {cache: 'no-store'}).then(function(response) {
      if (response && response.status === 200) {
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, clone);
        });
      }
      return response;
    }).catch(function() {
      // 오프라인일 때만 캐시 사용
      return caches.match(event.request).then(function(cached) {
        return cached || caches.match('./portfolio_v5.html');
      });
    })
  );
});
