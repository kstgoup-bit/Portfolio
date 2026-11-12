STATUS: READY_FOR_REVIEW
ORDER-ID: GPT-20261112-1830
BASE: 99ca515 (main a74ee54 병합 후)   HEAD: 689db5ba66d9d764103f0e307c3de49f5a8c84a8
REVIEW-SCOPE: `has/universe-screen.js`(국내 핵심 개수 동적 계약·coreCount 400/401·출처 날짜 검사), `tests/universe-kr201-contract.test.cjs`(새 8건), `tests/universe-screen-synthetic400.test.cjs`(GAS 201 합성 1건 추가), `tests/universe-screen-ui-cache.test.cjs`(화면 401 표시 1건 추가 + 기존 1건 픽스처 날짜 보정), `tests/lib/live-data-pins.json`(해시 1줄). `portfolio_v5.html`·UI·HTML·GAS 파일 변경 없음.

# #2 국내 201종목 동적 계약·오프라인 검증 (합성 시험 전용, 2026-11-12 19:00 KST)

## 바꾼 것 (`has/universe-screen.js`)
| 항목 | 이전 | 이번 |
|---|---|---|
| 국내 핵심 개수 | 200 고정(`lists.kospi200.length!==200`) | **kospi200 출처의 `expectedConstituents`** = 실제 행 수 = 고유 코드 수일 때만. 선언 범위 200~205(안전 상한, 공식 지수 규칙 아님) — 199·206·250 거부 |
| coreCount | 400 고정 | `국내 선언 개수 + 미국 200` (200→400, 201→401). `validateUniverse`가 coreCount = kospi200 선언 + 200, 실제 국내 핵심 = 선언, 미국 핵심 = 200을 서로 검사 |
| 추가 감시(extras) 상한 | 총 500 | coreCount + 100 (기존과 같은 100개 여유) |
| 요약 검사 | `coreCount!==400`, items 400~500 | 고정값 제거 → `validateUniverse`로 위임(동일 규칙). `assemble`은 목록의 coreCount를 그대로 씀 |
| 출처 날짜 | 형식만 | 2000-01-01 이후, 목록 구성 시점(한국 날짜) 이후 거부(`future-source-date`), 요약 생성 한국 날짜 이후 거부 |
| 미국 | 나스닥100 ∪ S&P100 + S&P500 시총순 → 200 | **변경 없음**(11-13 ETF 기준 변경은 미적용) |

## 시험
- 새 `tests/universe-kr201-contract.test.cjs` 8건: 기존 400 유지 / 201 픽스처 구성·검증·배치(34묶음, 국내 17)·요약 총 401·extras 402 / 선언 201·실제 200, 선언 200·실제 201, 중복, 빈 코드, 코드 없음, 형식 오류, 선언 누락, complete=false 거부 / 199·206·250 거부, 205 허용 / 선언 400인데 핵심 401, 선언 401인데 출처 200, 핵심 결측, 핵심을 extra로 위장, extras로 401 채우기, 요약 coreCount·total 조작 거부 / 미래·1999·잘못된 날짜, 요약 생성 이후 목록 날짜 거부 / 실제 KRX 스냅샷 모양(201, 코드만)+합성 미국 200 수용(시험 전용) / 미국 계약 불변·universe-400/401.json 없음.
- GAS 초안(vm, 네트워크 없음): 201 합성으로 34묶음(묶음당 12 이하) 끝까지 계산 → `published` 401, 공개 응답 검사 통과, 매수후보 0, 개인 extras는 공개 GAS 거부 유지.
- 화면(jsdom): 201 합성 응답 → "감시 대상 401종목 (국내 201 · 미국 200)", 저장소 쓰기 0.
- 기존 시험 1건 보정: `ui-cache` "같은 날 만료" 시험의 첫 응답이 목록 기준일(11-11)보다 이른 생성시각(11-10)이라 새 날짜 검사에 걸림 → 그 응답만 목록 기준일 11-09로 바꿈(시험 의도 = 만료 후 재조회는 그대로).
- 전체 `node --require ./tests/lib/no-network.cjs --test tests/*.test.cjs` → **2008 중 2006 통과 / 0 실패 / 2 skip**(기존 `TZ=America/New_York` 전용 DST 2건, 이번과 무관). `node tools/scan-secrets.cjs` → findings 0.
- Chromium(화면 파일 변경 없음, 회귀 확인): `tests/universe-screen-auto-browser.cjs` 360/390/430 × (운영 기본, 시험 자동) 6경우 통과, 외부 요청 36 차단·실제 호출 0. 이번엔 뒤로가기 추가 요청 0으로 나왔으나 navigation=back_forward(새 로드)이고 route 환경이라 **뒤로가기 캐시 유지는 여전히 미검증**. `tests/universe-screen-browser.cjs` 360/390/430/1280 통과.

## 판정 분리
- 완료: 동적 국내 개수 계약과 400/401 합성 회귀시험(오프라인).
- 가정: 200~205 상한(편입·분할 임시 포함 여유로 둔 안전값, 근거 문서 없음).
- 미검증: 코스피200이 공식적으로 201종목인지·KRX 화면 조회 기준일(파일에 미표기 — 다운로드 시각 16:42 KST만 기록, 효력 기준일과 같다고 주장하지 않음), 실제 GAS·시세, 기기 뒤로가기.
- 차단: 미국 공식 원본(11-13 순태씨 파일 예정) → 실제 401 목록·`radar/data/universe-*.json` 만들지 않음.
- **권리 확인 필요**: `radar/data/kospi200-20261112.json`(코드·이름)의 공개 재배포 권한 미확인. 이 파일을 운영 공개 경로(Pages·공개 GAS 응답)로 쓰기 전에 KRX 이용약관 확인 또는 순태씨 판단 필요. 이번에 새 원본·명단·가격 추가 없음.

## 다음 단위 제안
- 11-13 미국 ETF 파일 도착 후: 현행(나스닥100 ∪ S&P100 + S&P500 시총순) vs 제안(나스닥100 ∪ S&P500 ETF 비중순) 계약 비교표 → 지피 검토 → 순태씨 결정.
- 그 전: sessionStorage 캐시 설계 문서(독립 키·공개 집계만·TTL·스키마·실패 대책) 초안 — 지피 요청 시.

## 순태씨 결정 필요
- 없음(이번 단위). 운영 반영·GAS 연결은 미국 목록 확정 후 묶어서 요청 예정.

---

STATUS: READY_FOR_REVIEW
ORDER-ID: GPT-20261112-1730
BASE: 1987f43 (main 12c4f86 병합 후)   HEAD: 05c2e7b9ad1bb3652397c10d78d5bbb53aa36a7b
REVIEW-SCOPE: `has/universe-screen-ui.js`(첫 진입 시험 전용 자동 조회·한국 기준일 메모리 캐시·요청 병합·동적 건수·행 표시), `has/universe-screen.html`(`#count` 1줄, 링크 44px CSS 1줄), `tests/universe-screen-ui-cache.test.cjs`(새 8건), `tests/universe-screen-auto-browser.cjs`(Chromium 360/390/430 수동 실행 스크립트), `tests/lib/live-data-pins.json`(해시 2줄). `portfolio_v5.html`·`has/universe-screen.js`·GAS 변경 없음.

# #4 곡소리 화면 — 첫 진입 1회 조회·하루 캐시 (합성 시험 전용, 2026-11-12 18:00 KST)

## 바꾼 것
| 항목 | 이전 | 이번 |
|---|---|---|
| 자동 조회 | 없음(버튼만) | `window.HAS_SCREEN_TEST_AUTO===true`(시험이 페이지 로드 전 주입)일 때만 첫 진입 1회. **운영 페이지는 이 값을 설정하지 않음 → 운영 자동 요청 0**. GAS 주소 없음/형식 불일치면 시험 모드여도 요청 0, "GAS 미연결 · 판단 보류" |
| 캐시 기준일 | UTC 날짜(`new Date().toISOString().slice(0,10)`) | **한국시간 날짜**(UTC+9). 같은 GAS 주소·같은 KST 날짜면 메모리 캐시 재사용, 재사용 시에도 `validateSummary` 재검사 → 같은 날이라도 2일 만료되면 새 조회 |
| 중복 요청 | `busy`면 무시 | 진행 중 요청 1개를 공유(동시 클릭·자동+버튼 → 1건) |
| 저장 | 메모리 | 메모리만(localStorage·sessionStorage·IndexedDB 쓰기 없음, 시험으로 고정). 투자기록·백업 키 불변 |
| 건수 표시 | 정적 "코스피200 + 미국 200" | `#count`: "감시 대상 {total}종목 (국내 a · 미국 b · 추가 감시 c) — 요약 응답 기준". 401로 바뀌어도 응답 그대로 표시. 계약(`coreCount 400`)은 이번에 안 바꿈 |
| 행 표시 | 고점 대비·기준일 | + "가격 참고값 {가격} {통화} · 종가 확정·조정기준 미검증", 1/3/6개월 기간(시작~끝), 12개월은 "이력·조정기준 확인 전 비움", 누락행 "자료 부족" |
| 합성 표시 | 없음 | generation/출처에 synthetic·test-only·example.invalid면 상태줄 맨 앞 "합성 시험 자료(실제 시세 아님)" |
| 상태줄 | — | 끝에 "매수 검토 후보 없음(판단 보류)" 항상 |
| JSONP | 콜백 삭제 | 콜백 1회만 처리(두 번째 호출 무시), URL에 `_=` 시각 추가(브라우저 HTTP 캐시 재사용 방지), 실패·시간초과 시 지난 성공 자료는 '오래된 값'으로 낮춤 |
| 접근성 | "곡소리로 돌아가기" 링크 높이 20px | 44px(인라인 링크에 min-height가 안 먹던 기존 문제) |

## 시험
- 새 jsdom 8건(`tests/universe-screen-ui-cache.test.cjs`, JSONP `<script>` 가로채 합성 응답, 실제 네트워크 0): 운영 기본 요청 0·쓰기 0 / 시험 모드 첫 진입 1회→pageshow 재진입·버튼 재조회 0추가 / KST 23:59까지 캐시, 00:01 KST 새 조회(1→2) / 동시 5클릭+2호출 = 1건 / 주소 없음·타 도메인·`javascript:` → 요청 0 / 만료·매수후보·'매수 검토' 의견·미래 생성시각·문자열(`<img onerror>`)·다른 콜백·로드 실패 → 표시 0·캐시 0·판단 보류·img 주입 0 / 성공 후 실패 → 지난 자료 '오래된'·재시도 새 요청 / 같은 날 만료 → 재조회 / 건수 동적·저장 API 미사용.
- 전체: `node --require ./tests/lib/no-network.cjs --test tests/*.test.cjs` → **1998 중 1996 통과 / 0 실패 / 2 skip**. skip 2건 = `TZ=America/New_York`에서만 도는 DST 시험(기존, 이번과 무관).
- `node tools/scan-secrets.cjs` → findings 0.
- Chromium(`node tests/universe-screen-auto-browser.cjs`, 외부 요청 전부 차단, GAS는 `type=screen`만 가짜 JSONP): 360/390/430 × (운영 기본, 시험 자동) 6경우 모두 통과 — 운영 기본 자동 요청 0(버튼 1회), 시험 자동 첫 진입 1회·버튼 재사용 0추가, 가로 넘침 없음, 버튼·링크·summary 44px 이상, 12px 미만 글자 0, `v5_gen` 원장 표지값 불변, pageerror 0. 기존 `tests/universe-screen-browser.cjs`도 360/390/430/1280 통과.

## 미완료·미검증
- **뒤로가기 캐시 유지 미검증**: headless Chromium+route에서 곡소리→뒤로가기가 bfcache 복원이 아닌 새 로드(back_forward)로 처리되어 메모리 캐시가 사라짐. 새 로드면 (시험 모드에서) 1회 재조회 또는 시간초과 후 판단 보류. 페이지 새로고침도 1회 재조회(메모리만 쓰는 지시서 조건의 한계). 대안: 별도 sessionStorage 키(투자기록 키 아님) — 지피·순태씨 판단 필요.
- 휴장일·주말 정책 없음: 한국 날짜가 바뀌면 새 조회(가격 기준일은 응답 asOf로 표시). 한국·미국 휴장 달력 근거 미확보.
- 실제 GAS `type=screen` 응답·실제 기기(갤럭시) 미검증. 운영 자동 조회 활성 방법(게이트를 무엇으로 켤지)은 GAS 연결 승인 때 결정.
- 화면 제목 "400종목"은 프로젝트 이름으로 유지(지시서 5).

## 순태씨 결정 필요
- 없음(이번 단위는 합성 전용). 운영 자동 조회 켜기·GAS 연결은 이후 승인 사항.

---
(이전 단위 보고: GPT-20261112-1630, HEAD 7fd93f1 — 아래)

STATUS: READY_FOR_REVIEW
ORDER-ID: GPT-20261112-1630
BASE: 2f6772f   HEAD: 7fd93f11f88d35ba65e8dbdb5f10c4ebf7451f7d
REVIEW-SCOPE: `gas/has-universe-screen.gs`(초안 보완), `tests/universe-screen-synthetic400.test.cjs`(새 12건), `tests/lib/synthetic-universe-400.test-only.cjs`(합성 픽스처), `tests/universe-screen-gas.test.cjs`(가짜 Utilities에 SHA-256 추가 1줄), `tests/lib/live-data-pins.json`(gs 해시 1줄). 앱(portfolio_v5.html)·`has/universe-screen.js`·실제 GAS 변경 없음. 중간의 `fd3eb3d`는 main 문서 병합.

# #3 GAS 야간 계산 — 저장소 전용 합성 시험 초안 (2026-11-12 17:30 KST)

## 이름 정리
일지의 `gas/has-screen.gs`는 계획 단계 이름이고, 실제 코드는 다비가 만든 **`gas/has-universe-screen.gs`**(GAS 쪽) + **`has/universe-screen.js`**(계산·검증, 앱·GAS 공용)다. 새 파일을 만들지 않고 기존 `.gs`만 보완했다. 일지 #3 이름도 이 기준으로 고침.

## 바꾼 것 (기존 대비)
| 항목 | 이전(다비 초안) | 이번 |
|---|---|---|
| 저장 무결성 | 조각 존재·개수만 확인 | HEAD에 `len`·`sha256` 기록, 읽을 때 길이·SHA-256 불일치면 `screen-integrity`로 거부(같은 길이 변조도 차단) |
| 6분 한계 | 트리거 1회 = 1묶음 | `hasScreenRun_(budget)` 추가: 예산 4.5분(최대) 안에서 묶음 반복, "지금까지 가장 느린 묶음 시간"을 더하면 예산 초과일 때 멈추고 다음 트리거에서 재개 |
| 공개 응답 | 저장된 PUBLIC을 그대로 반환 | 반환 전 `validateSummary`(형식·만료 2일·매수후보 0·판단 보류) + **extra(개인 보유·확신) 행 있으면 거부**, 60만 자 초과면 `screen-too-large`, 만료면 `screen-expired`, 손상이면 `screen-unavailable` |
| 기존 GAS와 충돌 | — | `doGet`/`hasHistory*` 변경 없음. 새 전역 이름이 기존 `has-history-request.gs`와 겹치지 않음을 시험으로 고정. `type=screen` 연결(doGet 분기)은 **여전히 순태씨 승인 후** |

## 합성 시험 근거 (`tests/universe-screen-synthetic400.test.cjs`, 12건 모두 통과)
- 픽스처: `synthetic/testOnly/notForProduction` 표시, 코드 `9ZZ###`(KR)·`ZSYN###`(US), 출처 `https://example.invalid/synthetic-test-only`. KR 200·US 200(나스닥 100 ∪ S&P100 100, 겹침 20 → 180 + S&P500 시총순 20 보충), 중복 0, 형식 검사, 실제 코스피200 스냅샷과 겹침 0, `radar/data/universe-400.json` 없음 확인.
- 묶음: 34묶음 모두 12종목 이하·한 시장만, GAS 단계별 종목 호출도 12개 이하.
- 전체 실행(가짜 GAS 환경, 실제 `live-price-reference.js`·`universe-screen.js`·`has-history-request.gs` 로드, 네트워크 차단): 400/400 reference, `complete:true`, 매수후보 0, 전 행 `판단 보류`, 12개월 수익률 null, 무관한 속성 보존, 조각 ≤8000자, 이전 세대 조각 삭제.
- 진행 중 새 세대(10묶음)는 응답에 안 나오고 이전 완료 세대 유지 → 끝나면 교체.
- 한 묶음 조회 실패 → 12행 missing, `complete:false`, 400행 유지.
- 저장 중 실패(할당량 가정) → 다음 단계에서 중복 없이 재개.
- 시간 예산: 묶음당 40초 가정 시 1회 실행 ≤300초에서 멈추고 이어서 완료, 완료 후 `finished`.
- 변조: 같은 길이 1글자 변경·HEAD 해시 변경 → 거부, 해시 없는 HEAD → `screen-invalid-pointer`.
- callback: 안전한 이름만 JSONP, `alert(1);x`·`a.b`·`__proto__`·`constructor`·81자·`</script>`·U+2028·빈값·숫자 → JSON으로만, 입력 반사 없음, 응답에 `<>` 없음.
- 만료(3일 후)·extra 행·매수후보·초과 크기·미발행 → 데이터 대신 오류. extra 포함 매니페스트는 시작 거부.
- 기준 불일치(통화·거래소·심볼 접미사·시간대·조정기준) → missing·판단 보류·가격 없음. 비교지수 통화 다름(KR 종목 vs SPY) → 초과수익 null. 22일 지난 관측 → stale.

## 계산상 가정과 측정(합성 자료, 실제 아님)
- 합성 400행 측정: PUBLIC 압축 10,148자(2조각), WORK 12,616자(2조각), 전체 속성 23,371자, JSONP 응답 411,719자. **합성 가격은 규칙적이라 압축이 실제보다 잘 될 수 있음 — 실제 크기 미검증.** 응답은 압축 전 기준 약 1,030자/행 → 500행이면 약 52만 자로 상한 60만 자에 가까움(필요 시 응답 필드 축소 검토).
- GAS 한계 가정: 실행 6분, 속성 값 9KB, 전체 속성 500KB, 트리거 최소 1분 간격 — **공식 문서로 이번에 재확인하지 않음(미검증)**. 묶음당 실제 Yahoo 조회 시간 미측정.
- 34묶음 + 비교지수 조회(묶음마다 1회) = 하루 약 68회 UrlFetch 가정 — 실제 할당량 대비 미검증.

## 시험 결과
- 전체: `node --require ./tests/lib/no-network.cjs --test tests/*.test.cjs` → **1990 중 1988 통과 / 0 실패 / 2 skip**(skip 2건은 이전과 동일).
- 처음 실행 시 2건 실패: `gas/has-universe-screen.gs`가 live-data 고정 해시 대상 → `live-data-pins.json` 해시 갱신 후 통과.
- `node tools/scan-secrets.cjs` → 0건. 앱 화면 변경 없음 → Chromium 360/390/430 해당 없음.

## 남은 차단·미검증
- #1 미국 200 공식 원본 없음(순태씨가 11-13 ETF 보유종목 파일 제공 예정) → 실데이터 가동 불가, #1 미완료.
- KR "정확히 200" 계약: 순태씨 결정은 "발표 201개 그대로" — **코드 계약은 아직 200 그대로**(지시서의 임의 변경 금지에 따라 지피 확인 전 미변경). 지피 동의 요청.
- 미국 기준 변경(나스닥100 ∪ S&P100 → 나스닥100 ∪ 국내상장 S&P500 ETF 비중 상위) 역시 계약 변경 → 지피 확인 요청, 순태씨 파일 확인 후 진행.
- 지피 1630 검토의 "라이선스 미확인 원본·종목 목록을 공개 저장소에 올리지 말 것"과 16:55 `radar/data/kospi200-20261112.json`(코드·이름만, 순태씨 지시로 브랜치에 커밋, main 미병합) 관계 — **저장소 공개 여부·KRX 재배포 조건 미확인**. 순태씨·지피 판단 필요.
- 실제 Apps Script 작동·트리거·할당량·실제 종가는 전혀 검증 안 됨. 시험 통과 ≠ 실제 작동.

## 순태씨 결정 필요
- 없음(이번 단위). 운영·GAS 반영은 #4 이후 묶어서 승인 요청 예정.

---

(이전 단위 머리말: STATUS: READY_FOR_REVIEW / ORDER-ID: GPT-20261112-1530 (부분 진행: 국내 코스피200 확보, 미국 200 미확보로 universe-400.json 아직 없음) / BASE: 1db85974e66a8dec3c3ff8d93fc2fa9ceb789104   HEAD: 659914ce72ebebd2b0307bdbec0537d96c498b56 / REVIEW-SCOPE: `radar/data/kospi200-20261112.json`, `tests/kospi200-snapshot.test.cjs`, `tests/lib/live-data-pins.json`(addedRuntimeFiles 1줄). 앱·GAS 코드 변경 없음.)

# #1-KR 코스피200 공식 스냅샷 (2026-11-12 16:55 KST)

- 원본: 순태씨가 KRX 정보데이터시스템에서 직접 내려받아 클로 대화창에 첨부한 엑셀(생성 2026-11-12 16:42 KST, Apache POI = KRX 다운로드 형식, 원본 SHA-256 파일에 기록). 열: 종목코드·종목명·종가·대비·등락률·상장시가총액.
- **201종목**(중복 0, 6자리 코드 형식 위반 0). 200이 아닌 이유는 2026-08 한화 인적분할 신설 **0220W0 한화머시너리앤서비스홀딩스** 임시 포함으로 추정 — **미검증**(KRX 공지 미확인).
- **순태씨 결정(2026-11-12 클로 대화창, "1번", "201개로")**: KRX 발표 201개 그대로 감시. → 다음 단위에서 `buildUniverse/validateUniverse`의 "KR 정확히 200"을 "발표 개수 그대로(≥200)"로 바꾸고, 지시서의 "정확히 200"과 다르므로 지피 확인 요청.
- 저장 범위: 종목코드·종목명·출처·기준일만. 가격·시가총액 열은 KRX 재배포 조건 미확인으로 저장 안 함. 원본 엑셀은 저장소에 올리지 않음.
- 조회 기준일: 파일에 표기 없음 → asOf는 다운로드일 2026-11-12로 기록(장중 다운로드라 전일 기준일 가능성 있음, 미검증).
- 시험: 전체 1978 중 1976 통과/0 실패/2 skip(새 시험 3건 포함), `tools/scan-secrets.cjs` 0건. 처음 실행 시 새 파일이 보호 경로(radar/) 추가로 2건 실패 → live-data-pins `addedRuntimeFiles`에 등록해 해결.
- 미완료: 미국 200(나스닥100 ∪ S&P100 + S&P500 시총 보충) 공식 원본 — 여전히 차단(아래 보고). 2 skip 원인 미기록.

---

# #1 공식 400종목 감시목록 — 차단 보고 (2026-11-12 16:10 KST)

지시서 GPT-20261112-1530 완료 조건 4("공식 목록·비교 가능한 시가총액을 확보 못 하면 임의로 400개를 만들지 말고 보고")에 따라 **`radar/data/universe-400.json`을 만들지 않았다.** 앱·GAS·시험 코드 변경 없음.

## 확인한 사실 (기준 2026-11-12 16:00~16:10 KST)
| 원본 | 시도 | 결과 |
|---|---|---|
| KRX 정보데이터시스템 지수구성종목 `https://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd?menuId=MDC0201010106` | 클라우드 셸 직접 접속, 웹 읽기 도구 | 셸: 연결 불가(응답 코드 000). 웹 읽기: 무인 실행이라 접근 허가 대기 중 차단. **로그인 필요 여부·재배포 조건 미검증** |
| Nasdaq 공식 `https://indexes.nasdaq.com/Index/Weighting/NDX`, `https://api.nasdaq.com/api/quote/list-type/nasdaq100` | 같음 | 셸 000, 웹 읽기 차단. **구성 증권 수·기준일 미검증** |
| S&P DJI `https://www.spglobal.com/spdji/en/indices/equity/sp-100/` (S&P 500 동일) | 같음 | 셸 000, 웹 읽기 차단. **미검증** |
| 대학 도서관 안내 `https://ask.lib.uiowa.edu/biz/faq/368583`(갱신 2025-05-12), `https://www.library.hbs.edu/services/help-center/index-constituents`(날짜 없음) | 웹 읽기 성공 | S&P 500 구성목록 취득 경로로 Net Advantage·Bloomberg·Morningstar Direct·Eikon/Datastream·Capital IQ 등 **유료·라이선스 데이터베이스만** 안내. S&P 공식 사이트 무료 전체 다운로드 언급 없음(이것은 두 안내문의 내용일 뿐, S&P 사이트를 직접 확인한 것은 아님) |

검색에 나온 위키백과·datahub·tradingview·종목정보 사이트 목록은 공식 발행자 원본이 아니므로 사용하지 않음(지시서 범위). S&P 500 **동일 기준일 USD 시가총액**(전체 vs 유통주식 기준 포함)도 확보 못 함 → 보충 순위 만들지 않음.

## 차단 사유
1. 이 예약 실행 환경에서는 공식 발행자 사이트에 접속할 수 없음(셸 네트워크 허용 목록 밖, 웹 읽기는 사람 허가가 필요한데 무인 실행).
2. S&P 100/500 전체 구성목록과 지수 기준 시가총액은 S&P DJI 라이선스 자료일 가능성이 큼(도서관 안내 근거, S&P 약관 직접 확인은 미검증). 공개 저장소(GitHub Pages) 재배포는 권리 확인 전 불가.
3. KRX 자료의 재배포 조건 미확인.

## 합법적 취득 방안 (순태씨 결정 필요)
- **A. 순태씨 직접 다운로드(무료, 권장 시작점)**: KRX 정보데이터시스템 [지수 → 지수구성종목, 코스피200] CSV, Nasdaq-100 공식 구성 페이지. 받은 파일을 클로 대화창에 첨부 → 클로가 변환·검증. 공개 저장소에는 **종목코드·기준일·출처만** 두고 원본 파일·가중치·시가총액은 올리지 않는 방식(재배포 범위는 각 약관 확인 후 확정).
- **B. 미국 보충 기준 변경**: S&P 500 시총순 대신 공개 확인 가능한 기준(예: 나스닥100 ∪ S&P100 + 보유·확신 종목)으로 미국 core 수를 200 미만 허용 — 현재 `buildUniverse` 계약(정확히 200)과 지시서 변경 필요(지피 지시서 + 순태씨 승인).
- **C. 유료 자료(S&P 라이선스·데이터 업체)**: 비용 발생 → 사전 승인 필수. 현재 권하지 않음.
- 클로 의견: A로 코스피200·나스닥100을 먼저 확보하고, S&P 100/500은 B 또는 순태씨 판단 후 진행이 비용 없이 가장 빠름. 단, 최종 결정은 순태씨.

## 이번 실행 시험
- 코드 변경 없어 전체 회귀시험 재실행 안 함(직전 기록 1975 중 1973 통과/0 실패/2 skip, HEAD 1db8597 기준). 2 skip 원인은 다음 코드 단위 보고 때 명시 예정(미기록).
- `node tools/scan-secrets.cjs`: 아래 일지에 결과 기록.

## 그 외 처리
- GPT-TEST-0001(GPT-ORDER-20261112-1430.md): 브랜치 `docs/gpt-universe-screen-20261112`에 실제 존재, STATUS/ORDER-ID/BASE 3줄 확인. 지피가 15:24 이후 **수동 대화로 작성**한 시험 — 예약 무인 실행 성공 증거 아님.
- GPT-REVIEW-universe-screen-20261112-1530: 0b(1db8597) **APPROVE**(운영 승인 아님). 0b만으로는 운영 반영 가치가 낮아(목록·GAS 없이 빈 화면 링크) #1~#4 완료 후 묶어서 순태씨 승인 요청 예정.

---

# 400종목 곡소리 — 다비 제출(719692c) 클로 검토 1차 (2026-11-12 14:15 KST)

다비 인계(DAVI-universe-handoff) 요청대로 독립 재작성 대신 다비 SHA를 이 브랜치로 이어받았다. 다비 브랜치는 건드리지 않음.
병합 충돌: tests/lib/live-data-pins.json 1건 — portfolio_v5.html은 main 값(bb9a75f6…), radar/ui.js는 다비 값(6c2b07c2…, 실제 파일 해시와 일치)으로 해소.

## 시험 결과 (클로 환경)
- 전체 `node --require ./tests/lib/no-network.cjs --test tests/*.test.cjs`: **1973 중 1971 통과, 0 실패, 2 skip**. 다비 환경의 network-guard 1실패는 여기서 재현 안 됨(환경 차이로 판단).
- `tools/scan-secrets.cjs`: findings 0.
- Chromium(사전 설치판, 기본 launch): 다비 하니스(합성 GAS JSONP, 외부 요청 차단) **360/390/430 통과**, 가로 넘침 없음, 원장(v5_gen) 불변, 반복 조회 시 추가 요청 0. 하니스의 `executablePath:'/usr/bin/chromium'`만 빼고 실행.

## 발견 사항 (다음 실행에서 이 브랜치에 보완)
1. **운영 화면에서 진입 링크가 안 보임**: radar/ui.js render()는 실제 모드+HASLivePricePanel(운영 기본)일 때 일찍 return 하며, 다비 링크는 데모/합성 화면 nav에만 추가됨. 실제 앱 `#kst-radar/real/list`에서 링크 0개 확인. → 실제 모드 nav에 링크 추가 필요.
2. 화면 문구 "보유·확신 종목 별도 포함"은 현재 사실과 다름(GAS가 extras 거부, 개인 경로 미구현). → "보유·확신 종목은 기존 곡소리 화면에서 확인" 등으로 수정.
3. 상태 줄이 UTC ISO 원문(예: 2026-11-12T05:05:20Z)과 영문 사유 코드(invalid-input)를 그대로 표시 → 한국시간·한국어 사유로.
4. `evidence-universe/` 산출물이 커밋돼 있음 — 규칙상 시험 산출물 커밋 금지. 하니스 출력 경로도 저장소 밖(임시 폴더)으로.
5. 하니스의 Chromium 경로 하드코딩 제거.
6. 로컬 서버로 앱→화면→돌아가기 확인 중 pageerror "Unexpected token '<'" 1건 — 원인 미확인(클로 임시 서버 경로 처리일 가능성). 다음 실행에서 main과 비교 확인.

## 가장 큰 미완료 (운영 차단)
- 공식 400종목 구성목록(코스피200·나스닥100·S&P100·S&P500 시총순) 원본·기준일 확보 — 미검증. 가짜 목록으로 채우지 않음.
- GAS 실제 설치·트리거 — 순태씨 승인 전 하지 않음. 12개월 수익률 null 유지, 매수 검토 후보 없음(재무 연결 전).

## 순태씨 결정 필요
지금 없음.

## 보완 0b (2026-11-12 15:00 KST 실행)
1. 완료 — 실제 모드(운영 기본, HASLivePricePanel) 곡소리/환호성 nav에 '400종목 가격 선별' 링크 추가(radar/ui.js, edits 역방향 쌍 + pins 갱신). Chromium 360/390/430: 링크 1개 표시, 16px, 높이 44px, 가로 넘침 없음, 클릭 대상 페이지 정상 도착. 변경 전 main은 0개.
2. 완료 — 문구 '보유·확신 종목 별도 포함' → '보유·확신 종목은 기존 곡소리 화면에서 확인'.
3. 완료 — 상태 줄 시각을 'YYYY-MM-DD HH:MM (한국시간)'으로, 실패 사유를 한국어로(GAS 주소 없음은 브라우저의 'Invalid URL'도 'GAS 주소가 없거나 형식이 맞지 않음'으로). 미등록 코드는 '자료 확인 필요 (코드)'.
4. 완료 — evidence-universe/ 삭제, 하니스 출력은 임시 폴더(또는 HAS_EVIDENCE_DIR).
5. 완료 — 하니스 executablePath 제거(기본 chromium.launch).
6. 확인 — 'Unexpected token <' pageerror는 정상 404 처리 서버에서 재현 안 됨(이전 임시 서버가 폴더 경로에 HTML을 돌려준 탓으로 판단). 변경 전/후 모두 pageerror 0.
- 새 시험 `tests/universe-screen-entry.test.cjs` 2건(실제 모드 링크 1개·요청 0, 문구·한국어 사유). 하니스에 한국시간 표시 검사 추가.
- 전체 시험 1975 중 1973 통과 / 0 실패 / 2 skip. scan-secrets findings 0. 하니스 360/390/430/1280 통과, 실제 외부 호출 0.

다음: 작업 #1 공식 400종목 구성목록 출처 확인(코스피200·나스닥100·S&P100·S&P500) — 확보 못 하면 미검증으로 남기고 가짜 목록 금지.
