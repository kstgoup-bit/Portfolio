// 날짜 기반 자동 캐시명 - 매일 자동 갱신되므로 수동 버전업 불필요
const CACHE_PREFIX = 'portfolio-v5-';
const CACHE_NAME = CACHE_PREFIX + new Date().toISOString().slice(0,10);
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

// 활성화: 이 앱의 이전 캐시만 삭제 (같은 주소의 다른 앱 캐시는 건드리지 않음)
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k.indexOf(CACHE_PREFIX) === 0 && k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

function saveCopy(request, response) {
  if (response && response.status === 200 && response.type === 'basic') {
    var clone = response.clone();
    caches.open(CACHE_NAME).then(function(cache) { return cache.put(request, clone); }).catch(function() {});
  }
  return response;
}

// 요청
// - 다른 주소(GAS·시세·글꼴 등): 서비스 워커가 관여하지 않음 (브라우저가 직접 처리, 캐시 저장 안 함)
// - 앱 화면(HTML): 항상 최신 파일을 새로 받음, 오프라인이면 캐시
// - 앱 부품(js·css·이미지): 서버에 "바뀌었나?"만 확인해 안 바뀌었으면 폰에 있는 것을 사용, 오프라인이면 캐시
self.addEventListener('fetch', function(event) {
  var request = event.request;
  if (request.method !== 'GET') return;
  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  var isPage = request.mode === 'navigate';
  event.respondWith(
    fetch(request, {cache: isPage ? 'no-store' : 'no-cache'}).then(function(response) {
      return saveCopy(request, response);
    }).catch(function() {
      // 오프라인일 때만 캐시 사용
      return caches.match(request).then(function(cached) {
        if (cached) return cached;
        if (isPage) return caches.match('./portfolio_v5.html');
        return Response.error();
      });
    })
  );
});
