STATUS: READY_FOR_REVIEW
ORDER-ID: 순태씨 2026-11-12 20:2x 직접 요청("로그인이 아직도 너무 느려", 갤럭시 화면 3장)
BASE: 7eb1015 (main, 로그인 개선 1차 반영본) → 작업 시점 main f283c7b(문서만 추가)
HEAD: b9f9e6f2ea8a4a2237dc9e92526ad0048de6717d
REVIEW-SCOPE: `service-worker.js`(활성화 정리 접두어 한정 + fetch 규칙), `tests/sw-speed.test.cjs`(새 9건), `tests/sw-login-speed-browser.cjs`·`tests/sw-offline-fresh-browser.cjs`(Chromium 측정·확인), `tests/cache-policy.test.cjs`·`tests/staff-static-stage25.test.cjs`(과거 워커 비교를 검토된 역방향 쌍 투영으로), `tests/lib/live-data-edits.json`·`live-data-pins.json`(service-worker.js 역방향 쌍·해시). 앱 HTML·JS 변경 없음.

# 로그인(앱 열기) 속도 2차 — 서비스워커 (2026-11-12 20:40 KST)

## 원인
1차(19:53 운영)는 잠금 버튼을 글꼴 다운로드 전에 연결했다. 남은 지연의 근본 원인은 이미 11-11 진단된 **운영 서비스워커가 모든 요청을 `cache:'no-store'`로 처리** → 앱을 열 때마다 앱 파일 38개(약 950KB)와 Google 글꼴을 **매번 전체 다운로드**. 글꼴 CSS(@import)는 화면 표시를 막고, defer 스크립트 실행(=잠금 버튼 연결)은 CSS가 끝날 때까지 기다린다.

## 변경 (`service-worker.js`만)
| 요청 | 이전 | 이번 |
|---|---|---|
| 같은 주소(앱 HTML·js·css·png) | no-store 전체 다운로드 | **no-cache = 서버에 변경 여부만 확인(304)**. 바뀌었으면 새 파일 → 항상 최신은 그대로 |
| 글꼴(fonts.googleapis.com·fonts.gstatic.com) | no-store 매번 | 워커 관여 안 함 → 브라우저 기본 캐시 |
| 그 밖의 다른 주소(GAS·시세·뉴스·프록시) | no-store | **변경 없음**(no-store, 저장·오프라인 대체 동일) — 시세 신선도 불변 |
| POST 등 GET 아님 | no-store로 중계 | 관여 안 함(브라우저 직접, 결과 동일) |
| 오프라인 같은 주소 | 캐시 없으면 HTML 대체(js에 HTML) | 캐시 없으면 화면 요청만 HTML, 나머지는 오류 |
| 활성화 정리 | 모든 캐시 삭제 | `portfolio-v5-` 접두어 이전 캐시만 |
설치 목록·캐시 이름·skipWaiting/claim 불변.

## 측정 (Chromium, CPU 4배 감속, 합성 자료, GitHub Pages 흉내 ETag·304 서버, 외부 주소 DNS 차단 = 글꼴 효과는 미포함·보수적)
| 조건 | 이전 워커 | 새 워커 |
|---|---|---|
| 지연 120ms·1.5MB/s, 잠금 버튼 준비 | 1.78~1.98초, 38개 200·950KB | **1.45~1.52초, 39개 304·0바이트** |
| 지연 300ms·0.5MB/s, 잠금 버튼 준비 | 4.03~4.25초 | **2.86~2.93초** |
| 확인 → 잠금 해제 | 0.22~0.39초 | 0.18~0.34초(같은 수준) |
- 실제 폰에서는 글꼴(앞의 측정에서 차단)까지 캐시되므로 차이가 더 클 것으로 예상(미검증).
- 반영 후 **첫 실행은 이전처럼 전부 받고(폰 캐시가 비어 있음), 두 번째 실행부터 빨라짐.**

## 시험
- 새 `tests/sw-speed.test.cjs` 9건(vm): 글꼴 미관여, 다른 주소 no-store 유지, 같은 주소 no-cache, POST 미관여, 오프라인 화면/부품/스크립트, 저장 규칙, 활성화 접두어, 설치 목록.
- `tests/sw-offline-fresh-browser.cjs`(Chromium): 서버 파일 변경 → 다음 실행에 새 HTML(v2), 오프라인에서 잠금화면 열림, 오프라인 미캐시 스크립트에 HTML 대신 오류. 오프라인 시 다른 주소 요청의 HTML 대체로 생기는 pageerror 3건은 **이전 워커에서도 동일**(기존 동작 유지 범위, 기록만).
- `tests/login-speed-browser.cjs` 360/390/430 회귀 통과(잠금 해제 0.37~0.44초).
- 전체 `node --require ./tests/lib/no-network.cjs --test tests/*.test.cjs` → **1970 중 1968 통과 / 0 실패 / 2 skip**(main 1961 + 9). 보호 핀: 이전 워커 해시 77d553…는 역방향 쌍 투영으로 그대로 검증. `node tools/scan-secrets.cjs` findings 0.

## 미검증·위험
- 실제 갤럭시·GitHub Pages(ETag·304 동작 실측), 글꼴 캐시 효과, 느린 망 실측.
- 남은 시간 대부분은 560KB HTML + 스크립트 38개 해석(CPU)과 39번의 재확인 왕복. 추가 개선 후보(별도 승인): 잠금화면 불꽃놀이·축하 효과 지연, 글꼴 @import → 비차단, 파일 묶기.
- 다비 전체 워커 재설계(되돌리기 경로 미확인)와는 별개의 최소 변경.

## 순태씨 결정 필요
운영 반영 여부("올려").
