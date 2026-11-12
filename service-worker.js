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

// 활성화: 이 앱의 이전 캐시만 삭제 (같은 주소의 다른 앱 캐시는 건드리지 않음)
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k.indexOf('portfolio-v5-') === 0 && k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

// 요청 (2026-11-12 로그인 속도 개선)
// - 같은 주소(앱 화면·부품): 서버에 "바뀌었나?"만 확인(no-cache) → 안 바뀌었으면 폰에 있는 것 사용, 바뀌었으면 새 파일
//   (이전: no-store로 앱을 열 때마다 모든 파일 전체 다운로드). 항상 최신 확인은 그대로.
//   오프라인일 때만 캐시. 화면 요청만 앱 HTML로 대체(스크립트·자료 요청에 HTML을 주지 않음)
// - 글꼴(fonts.googleapis.com·fonts.gstatic.com): 관여하지 않음 → 브라우저 기본 캐시(매번 새로 받지 않음)
// - 그 밖의 다른 주소(GAS·시세·뉴스 등): 이전과 똑같이 항상 새로 받음(no-store) — 시세 신선도 불변
var FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
function saveCopy(request, response) {
  if (response && response.status === 200) {
    var clone = response.clone();
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.put(request, clone);
    }).catch(function() {});
  }
  return response;
}
self.addEventListener('fetch', function(event) {
  var request = event.request;
  if (request.method !== 'GET') return;
  var url = new URL(request.url);
  if (FONT_HOSTS.indexOf(url.hostname) !== -1) return;
  if (url.origin !== self.location.origin) {
    // 다른 주소: 기존 동작 그대로
    event.respondWith(
      fetch(request, {cache: 'no-store'}).then(function(response) {
        return saveCopy(request, response);
      }).catch(function() {
        return caches.match(request).then(function(cached) {
          return cached || caches.match('./portfolio_v5.html');
        });
      })
    );
    return;
  }
  var isPage = request.mode === 'navigate';
  event.respondWith(
    fetch(request, {cache: 'no-cache'}).then(function(response) {
      return saveCopy(request, response);
    }).catch(function() {
      return caches.match(request).then(function(cached) {
        if (cached) return cached;
        return isPage ? caches.match('./portfolio_v5.html') : Response.error();
      });
    })
  );
});
