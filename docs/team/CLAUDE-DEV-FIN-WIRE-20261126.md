STATUS: READY_FOR_REVIEW (CR-FIN-R3 반영 — 재검토 요청. 운영 미반영, 순태씨 '올려' 전 main 병합 금지)
ORDER-ID: GPT-REVIEW-fin-wire-20261128-1130 CR-FIN-R3 (원 지시: 순태씨 대화 2026-11-26 '시작해' 재무 연결 단계 4)
BRANCH: work/claude-fin-wire-20261126
BASE: 24ff8f9e92fa135813dfe79432ccd3b09dd88801 (지피 1130 검토 HEAD)
HEAD: a2ccae5dc5d31e08112c6a41146233e769d451ce
REVIEW-SCOPE: 24ff8f9..a2ccae5 — 코드 1커밋(보고서 aa8b112 제외): has/review-cards.js(재무 로더 부분만), has/fin-panel.js(views 수명 + 시험용 _views 조회), tests/fin-panel-cr.test.cjs(신규 8), tests/lib/live-data-pins.json(review-cards 해시 d50a5516… → 303cff9a…). portfolio_v5.html 변경 없음.
UPDATED: 2026-11-28 12시 정각 KST (예약 실행)

## 이번 수정 (CR-FIN-R3)
**1. 동기 실패·attach 예외 보류 안내** (`review-cards.js`)
- `finLoadModules()`의 `try` 안 동기 예외(스크립트 `appendChild` 첫/두 번째 throw)는 `finish(false)`를 마이크로태스크로 미룸 → 지금 그리는 카드(`finHook` 뒤 `box.appendChild(art)`, 팝업은 `document.body.appendChild(bg)`)가 화면에 붙은 뒤 실패 처리. 그때도 화면에 없는 자리(닫힌 팝업·다시 그린 카드·끝내 안 붙은 상자)는 제외.
- `finAttach()` 공통화: 준비 상태(state 3) 경로·로드 완료 drain 경로 모두 `attach` 예외 시 빈 자리 대신 '📊 재무 확인: 재무 블록을 표시하지 못함 · 판단 보류'(`fin-attach-error`, 매수 쪽만; 비매수는 그대로 비움).
- 상태 계약 통일: onload 성공이어도 `finReady()`가 거짓이면 실패와 같게 태그 제거·state 2·보류 안내.
- 첫 삽입 성공·두 번째 throw: 첫 태그 제거·onload 해제, 그 뒤 늦게 생긴 전역은 사용 안 함, 60초 뒤 새 세대 성공 시 채움(시험).
**2. 재무 자리(views) 수명** (`fin-panel.js`)
- 새 자리는 `pending`으로 등록하고 마이크로태스크에서 한 번 연결 확정: 붙어 있으면 `seen`, 안 붙었으면 목록에서 제거. 이후 `live()` = 화면 연결 또는 아직 확정 전(pending)만. 캐시 적중(safeFill만 하는 경우)도 같은 규칙 → 떨어진 자리는 다음 정리 때 빠지고 재요청 `redraw`가 갱신하지 않음.
- 동시 요청 병합·수동 3회 상한·같은 티커 동기화·펼침 유지 동작은 그대로(기존 시험 통과).

## 시험 (같은 환경)
- 신규 8: 첫 삽입 throw(복수 카드·비매수 빈 자리·태그 0), 두 번째 throw(첫 태그 제거·늦은 콜백 무시·60초 뒤 다음 세대 성공), 팝업 첫 렌더 throw(팝업 매수 카드 보류), 화면 밖 상자 제외, onload 성공+전역 없음, attach 예외(drain·준비 상태 양쪽, 복구 시 해제), 캐시 20회 다시 그림 뒤 보관 자리 2개·재요청 시 연결된 2카드만 갱신·떨어진 자리 HTML 불변, 안 붙은 새 자리 20개 정리·펼침 유지.
- 역검증: has/ 변경을 되돌린 상태에서 신규 중 5건 실패(팝업 첫 카드 보류 누락, onload+전역 없음, attach 예외, views 2건). 첫 삽입 throw 메인 화면 시험은 미국 카드 로드로 다시 그려져 이전 코드에서도 통과 — 첫 렌더 누락은 팝업 시험이 판별.
- 재무 시험 fin-panel·fin-panel-cr: 45 pass / 0 fail.
- 전체 `node --require ./tests/lib/no-network.cjs --test tests/*.test.cjs`: tests 2542 · pass 2538 · fail 2 · skip 2. 실패 2건(daily-repair-protection 'portable proof needs neither Git executable nor local commit refs', kis-auth-independent 'original source is byte-preserved … without local Git')의 오류 메시지는 둘 다 'Unreviewed protected source addition' — **BASE 24ff8f9 별도 작업 트리에서 두 파일만 다시 돌려도 같은 2건·같은 메시지로 실패**(이번 변경 무관 증명). 원인: 보호 시험이 portfolio_v5.html의 검토 안 된 추가분을 감지하는 것(환경 문제가 아니라 기존 운영 파일과 보호 목록 불일치로 보임) — 어느 추가분인지는 **미확인**, 전체 통과 아님.
- `node tools/scan-secrets.cjs`: findings 0.
- Chromium 합성 페이지(외부 요청 전부 차단, attach 예외 주입) 360/390/430: 매수 2카드 모두 보류 안내, 가로 넘침 없음, 12px 미만 글자 0, 글자색 #333.

## 미완료·미검증
- 실제 앱·실기기·SEC 원문 대조 안 함. price:null 유지 → 보류 해제·합의 발행 없음.
- 보호 시험 2건 원인 추가분 특정 미완료.

## 순태씨 결정 필요
- 없음(지피 재검토 대기). 운영 반영은 지피 APPROVE 뒤 순태씨 '올려'.

---
(이전 보고: CR-FIN-R1~R2)

STATUS: READY_FOR_REVIEW (CR-FIN-R1~R2 반영 — 재검토 요청. 운영 미반영, 순태씨 '올려' 전 main 병합 금지)
ORDER-ID: GPT-REVIEW-fin-wire-20261128-0930 CR-FIN-R1~R2 (원 지시: 순태씨 대화 2026-11-26 '시작해' 재무 연결 단계 4)
BRANCH: work/claude-fin-wire-20261126
BASE: ca7180159c443e9d85898583d334e105fc7bbb96 (지피 0930 검토 HEAD)
HEAD: 24ff8f9e92fa135813dfe79432ccd3b09dd88801
REVIEW-SCOPE: ca71801..24ff8f9 — 81aa19e(보고서)·62ee9c8(최신 main f2c8823 병합: docs/team만, has/·tests/·tools/·data/ 변화 없음, WORKLOG 충돌은 main 쪽) 제외하면 코드 1커밋 24ff8f9: has/fin-panel.js, has/review-cards.js(재무 로더 부분만), tests/fin-panel-cr.test.cjs(신규 12 + 기존 3건 갱신), tests/lib/live-data-pins.json(review-cards 해시 388fc60c… → d50a5516…).
UPDATED: 2026-11-28 10시대 KST (정각 예약 실행)

## 이번 수정 (CR-FIN-R1~R2)
**CR-FIN-R1 CIK 표준화·잘못된 시각 안전 처리** (`fin-panel.js`)
- `cikOf()`를 `tools/fetch-sec-facts.cjs`와 같은 규칙으로 추가: 양의 안전 정수(≤9999999999) 또는 1~10자리 숫자 문자열(0 제외) → 선행 0 없는 문자열, 그 밖(누락·null·''·0·음수·소수·11자리·객체·배열·불리언·NaN)은 null.
- 외피·내부 **둘 다** 유효해야 하고(누락·형식 오류는 새 사유 `cik`: '회사 식별번호(CIK) 없음·형식 오류(식별자 불일치 여부 확인 불가) · 판단 보류'), 표준화 값이 다르면 `mismatch`. 예외: IFRS 안내 자료(`ok:false, reason:'ifrs-filer'`)는 수집기가 내부 CIK 필드를 만들지 않으므로 내부 필드가 **아예 없을 때만** 외피 CIK로 통과(판정 없이 'IFRS 미지원 · 판단 보류'만 표시).
- CIK 일치는 원문 검증이 아님 — 표시는 계속 'SEC 공시 자동 수집 · 검증 전'.
- `day()`는 `Date.parse` finite 확인 뒤에만 `toISOString()`(fundamental-filter.js와 같은 방식). `check()`는 `now`가 유한한 숫자·유효 날짜가 아니면 `time`, 내부 예외는 `invalid`로 돌려 절대 throw 안 함.
- 시계 오차: 수집 시각이 기기 시계보다 0~5분 앞서면 통과는 시키되 '⚠ 수집 시각이 기기 시계보다 앞섬(시계 오차 5분 이내 허용) · 최신 근거로 쓰지 않음 · 판단 보류' 표시, 보류 판정(G.evaluate)에 assessment=null(재무 없음)로 전달 → 최신 확정 근거로 승격 안 함. 5분+1ms는 '수집 시각 형식 오류 또는 미래 시각'.
- 비동기 갱신 중 표시 예외(`safeFill`)는 '📊 재무 확인: 재무 블록을 표시하지 못함 · 판단 보류'(매수 쪽), 비매수는 비움 → '불러오는 중'에 멈추지 않음.
- 실제 자료: 저장소 10건 중 선행 0 차이 4건(ALAB·ARM·CRWV·SNDK)이 이제 정상 통과(Chromium 확인: ALAB '혼재', SNDK '취약' 판정 표시, 둘 다 판단 보류 유지).

**CR-FIN-R2 모듈 세대·같은 티커 자리 일관성**
- `review-cards.js` 로더: 시도마다 `fin.gen` 증가. `finish()`는 현재 세대·첫 호출만 처리하고 타이머 해제, 그 세대 태그의 onload/onerror를 null, 실패면 태그 제거. `try` 안 예외도 `finish(false)`(이전엔 타이머가 살아 있었음). 이전 세대 태그 교체 시에도 콜백 제거.
- 카드는 **검증된 준비 상태(state 3)** 에서만 모듈 사용. 처음부터 페이지에 두 모듈이 실린 경우(state 0 + 전역 존재)만 바로 3. 실패·시간 초과 세대 뒤 늦게 생긴 전역 객체는 다음 정상 세대 전까지 쓰지 않음(시험).
- 모듈 자동 재시도: 실패 60초 뒤 카드를 다시 그릴 때, 총 3회 시도 뒤 중단(실제 3회 실패 시험 추가).
- `fin-panel.js`: 티커별 열린 자리 목록(views). 새 요청(자동·수동)이 시작되면 같은 티커 자리 모두 '불러오는 중', 응답 도착 시 화면에 붙어 있는 자리 모두 같은 결과·같은 수동 상한으로 다시 그림. 한 번 화면에 붙었다 떨어진 자리(닫은 팝업·다시 그린 카드)는 목록에서 뺌.
- 횟수 정책 분리: **수동 재시도**는 오류 상태에서만, 티커당 3회('재무 자료 다시 불러오기 (수동 n/3)'), 자동 재요청(오류 60초 뒤 다시 그릴 때·성공/404 6시간 뒤)은 수동 횟수에 넣지 않음. 오류 안내에 '60초 뒤 카드를 다시 열면 자동으로 한 번 더 읽습니다(아래 수동 재시도 횟수와 별개)' 한 줄. 기존 시험은 처음 1 + 수동 3 = 요청 4회로 갱신.
- '재무 항목별 보기' 펼침 상태는 같은 자리를 다시 그려도(중간에 '불러오는 중'을 거쳐도) 유지(`data-fin-open`).
- 판단 라벨·합의 표시·차트 안내 코드 불변, price:null 유지 → 보류 해제 없음.

## 시험 (같은 환경)
- 명령: `node --require ./tests/lib/no-network.cjs --test tests/*.test.cjs` (jsdom 별도 폴더, NODE_PATH)
- HEAD 24ff8f9: tests 2534 · pass 2530 · fail 2 · skip 2. 실패 2건은 BASE ca71801 보고와 같은 Git 이식 증명 시험(683 'portable proof needs neither Git executable nor local commit refs', 1203 daily-repair 'independent … without local Git') — 이번 변경과 무관(has/review-cards·fin-panel 미포함), 통과로 계산하지 않음. 원인: 이 실행 환경 저장소가 얕은/로컬 참조 구성이 달라 생기는 것으로 보이나 **미검증**.
- 재무 시험: fin-panel.test 9 + fin-panel-cr.test 28 = 37 통과(신규 R1 7·R2 5).
- 보호 핀: live-data-pins `addedRuntimeFiles` review-cards 해시 갱신. addedRuntimeFiles 포함 시험 파일 9개 개별 실행 — daily-repair-protection 1건(위 1203) 외 통과.
- `node tools/scan-secrets.cjs`: findings 0.
- Chromium(합성 페이지, 외부 요청 차단, 실제 data/fundamentals JSON 사용) 360·390·430·1280px: ALAB·SNDK 판정 표시, 연결 실패 종목은 보류 안내·자동 안내·'(수동 1/3)' 버튼 44px, 가로 넘침 없음, 12px 미만 글자 0. PC·실기기 실제 앱(portfolio_v5.html) 화면은 미실시.

## 미완료·미검증
- SEC 원문 독립 대조 없음(CIK 일치는 검증 아님). 임계값 미검증 제안 기준 그대로.
- 실기기(갤럭시) 확인 미실시.

## 순태씨 결정 필요
- 없음(재시도 횟수·간격·시계 오차 5분은 클로 제안값). 운영 반영은 지피 APPROVE 뒤 순태씨 '올려'.

---
(이전 회차 기록)
STATUS: READY_FOR_REVIEW (CR-FIN-1~3 반영 — 정적 재검토 요청. 운영 미반영, 순태씨 '올려' 전 main 병합 금지)
ORDER-ID: GPT-REVIEW-fin-wire-20261128-0730 CR-FIN-1~3 (원 지시: 순태씨 대화 2026-11-26 '시작해' 재무 연결 단계 4)
BRANCH: work/claude-fin-wire-20261126
BASE: 6415e1e751e4c3d5994c069fad0e2d86f8f45798 (지피 검토 HEAD)
HEAD: ca7180159c443e9d85898583d334e105fc7bbb96
REVIEW-SCOPE: 6415e1e..ca71801 — 601b686은 최신 main(ae7e998) 병합(문서·데이터만, has/·tests/ 변화 없음, WORKLOG 충돌은 main 쪽 + 이 브랜치 한 줄로 해결). 코드 커밋 ca71801: has/fin-panel.js, has/review-cards.js(finHook 부분만), tests/fin-panel-cr.test.cjs(신규 16), tests/fin-panel.test.cjs(문구 3곳), tests/lib/live-data-pins.json(review-cards 해시 5a7c48c9… → 388fc60c…).
UPDATED: 2026-11-28 08시대 KST (정각 예약 실행)

## 이번 수정 (CR-FIN-1~3)
**CR-FIN-1 식별자·시점 교차검증** (`fin-panel.js` `check()` 신규, 공개해 시험)
- 외피 `rec.ticker` = 카드 티커 = `normalized.ticker` 모두 일치해야 함. CIK는 한쪽에라도 있으면 둘 다 숫자 문자열·동일해야 함 → 아니면 '종목·회사 식별자 불일치 · 판단 보류'(재무 라벨 표시 안 함).
- `fetchedAt`은 엄격한 UTC ISO(`…Z`)만, 현재+5분 넘는 미래면 '수집 시각 형식 오류 또는 미래 시각'(음수 경과일 통과 불가).
- `validNormalized` 통과 뒤 연도별 `결산일 ≤ min(수집일, 오늘)`, `결산일 ≤ 공시일 ≤ min(수집일, 오늘)` 확인(F.display와 같은 기준 + 수집일 상한) → 아니면 '결산일·공시일 충돌'.
- IFRS(20-F) 수집본(`ok:false, reason:'ifrs-filer'`)은 '해외 기업 공시(IFRS·20-F) — 미지원 · 판단 보류'로 별도 안내.
- 4일 초과: '⚠ 과거 참고 · 판단 보류 — 수집한 지 N일 지남…'을 판정 줄보다 **먼저** 표시, 판정 줄에도 '과거 참고' 표기, 해제 판정엔 재무 없음으로 전달(기존). 정확히 4일은 현재로 취급(경계 시험).
- 메타 줄과 항목별 보기에 '판정 임계값은 미검증 제안 기준' 명시, 공시일 표시 추가.

**CR-FIN-2 팝업 비동기 갱신**
- `review-cards.js` `finHook`이 카드마다 빈 자리 `<div data-testid=fin-slot>`를 만들고, `fin-panel`은 그 자리 안만 `replaceChildren`로 채움. 모듈 로드 완료·fetch 완료 때 **전체 다시 그리기(renderAll) 대신 대기 중인 자리만** 채움 → 보유종목 팝업도 갱신, 카드 요소·`details` 열림 상태 유지(시험), 스크롤 위치 건드리지 않음.
- 자리가 화면에서 떨어졌으면(팝업 닫음·재열기·탭 전환으로 다시 그림) 늦게 온 결과는 쓰지 않음. 같은 종목 요청은 캐시·병합으로 1회.
- 판단 라벨·합의·차트 안내 코드 불변(기존 시험 'review-cards 변경은 연결 한 줄…' 그대로 통과).

**CR-FIN-3 실패 영구화 방지**
- 모듈 로더: 두 파일 각각 onload 집계 + `HASFinPanel`·`HASReviewFinGate` 존재 확인 후에만 준비 완료. 어느 하나라도 onerror 또는 15초 초과 → 매수 쪽 카드에 '재무 모듈을 불러오지 못함 · 판단 보류'(비매수는 아무것도 안 붙임), 늦게 온 onload 무시. 실패 후 60초 지나 다시 그릴 때 재시도(이전 태그 제거 후 재삽입), 최대 3회. 로더 전체 try/catch.
- 자료 요청: 15초 대기 상한, 요청마다 토큰 → 교체·시간 초과 뒤 응답 무시, 진행 중 요청 병합. 오류는 60초 뒤 다시 그릴 때 자동 재요청, 성공·404는 6시간 뒤 재요청(새 공시 수집 반영). 매수 카드 오류 시 '재무 자료 다시 불러오기 (n/3)' 버튼(44px), 티커당 총 3회 상한. 같은 사이트 정적 JSON만(KIS·GAS 호출 추가 없음, 시험).
- 순태씨 결정 필요 정책 없음(재시도 횟수·간격은 클로 제안값, 바꿔도 됨).

## 시험 (같은 환경, BASE 6415e1e vs HEAD ca71801)
- 명령: `node --require ./tests/lib/no-network.cjs --test tests/*.test.cjs` (jsdom 별도 폴더, NODE_PATH)
- HEAD: tests 2522 · pass 2518 · fail 2 · skip 2. BASE(worktree): tests 2506 · pass 2502 · fail 2 · skip 2.
- 실패 2건은 BASE·HEAD 동일: #683 'portable proof needs neither Git executable nor local commit refs', 'independent: original source is byte-preserved after explicit reviewed daily repair projections without local Git'(BASE #1175/HEAD #1191). 둘 다 오류 메시지 `Unreviewed protected source addition` — Git 없는 이식 증명 시험이 이 환경의 작업 트리(병합된 보호 원본 추가분)를 미검토로 봄. 이번 변경과 무관(BASE에서도 동일)하지만 통과로 간주하지 않음. 이전 보고의 3번째 실패(#1754 DOM)는 이번 실행 BASE·HEAD 모두 재현 안 됨.
- 신규 16건 + 기존 fin-panel 9건 = 25 통과. `node tools/scan-secrets.cjs` findings 0.
- Playwright Chromium 360·390·430(합성 페이지, 외부 요청 차단, 가짜 자료: 정상·식별자 불일치·6일 경과·요청 실패·국내): 가로 넘침 없음(scrollWidth=폭), 재무 블록 12px 미만 글자 0, 재시도 버튼 높이 44px, 보유종목 팝업에서 '과거 참고' 블록 표시, 페이지 오류 0. PC 폭·실기기 미실시.
- 보호 시험: portfolio_v5.html 변경 없음 → live-data-edits 쌍 추가 없음. 핀은 review-cards.js 해시 1줄(fin-panel.js는 핀 대상 아님 — 이전과 동일).

## 미완료·미검증
- SEC 원문 대조·실기기 미실시. 시세 독립 대조 미연결이라 보류 해제 없음(그대로).
- 후속 브랜치 work/claude-price-verify-20261126(67bf711)은 이 브랜치 6415e1e 위에 쌓여 있어 fin-panel.js 충돌 예상 → fin-wire 승인 뒤 재기반·재검토 필요.

## 순태씨 결정 필요
- 없음(운영 반영은 지피 재검토 APPROVE 뒤 순태씨 '올려').

---
## (이전) 단계 4 최초 보고 — BASE ed4e2a0 → HEAD 6415e1e

## 변경
- 신규 `has/fin-panel.js`: 카드 아래 '📊 재무 확인(SEC 공시 자동 수집 · 검증 전)' 블록 — `data/fundamentals/<티커>.json`을 읽어 앱의 기존 `HASFundamentalFilter.assess()`로 판정(라벨·이유·결산일·수집 시각·항목별 보기). 매수 쪽 카드에는 `HASReviewFinGate.evaluate()` 결과로 '판단 보류 유지 — 남은 조건: …'을 표시. 수집한 지 4일 넘으면 재무 없음으로 취급·경고. 국내는 'DART 연결 전' 안내만(자료 요청 없음). 비매수 카드는 자료가 없으면 아무것도 붙이지 않음.
- 수정 `has/review-cards.js`: 카드 그릴 때 `finHook(art, c, cs)` 한 줄 + 지연 로드 함수(`has/review-fin-gate.js`, `has/fin-panel.js`를 처음 필요할 때만 로드). **판단 라벨·합의 표시·보류 문구 코드는 변경 없음**(시험으로 고정). 핀 `tests/lib/live-data-pins.json`의 review-cards.js 해시 갱신(0e7136d9… → 5a7c48c9…).
- 신규 시험 `tests/fin-panel.test.cjs` 9건(JSDOM·가짜 fetch).
- `portfolio_v5.html` 변경 없음(스크립트 태그 추가 없이 지연 로드).

## 동작 원칙
- 보류 해제는 일어나지 않는다: 시세 독립 대조(price)를 앱이 아직 규칙에 넘기지 않아(항상 null) 매수 쪽은 계속 '판단 보류'. 합의가 agreed여도, 재무가 strong이어도 해제되지 않음(시험). 이번 단계는 근거 표시만.
- 읽기 전용: 저장소·키·쓰기 없음. 자료는 textContent로만 그림(XSS 시험).

## 실제 자료로 확인(2026-11-26 수집분, JSDOM 렌더)
- WDC 혼재(취약 1·주의 1, 최근 결산 2026-07-03), GLW 혼재(취약 없음·판정 가능 항목 4개뿐), ALAB 혼재(취약 1·주의 2, 자기자본 0 이하 해 있음), NBIS 공시 부족(연간 공시 3년 미만). 곡소리 매수 후보 3개 모두 '우량 근거 충분'이 아니라 해제 조건 미충족.
- NBIS·ARM은 연간 공시가 읽히지 않음(외국계 공시 형식 추정, **원인 미확인**).

## 시험
- 전체 2506 중 2501 통과/3 실패/2 skip. 실패 3건(683 Git 필요·1175 일일 수리 Git 필요·1754 DOM)은 깨끗한 main에서도 동일. scan-secrets 0.
- **미실시**: Chromium 360/390/430 실제 폭 확인, 갤럭시 실기기 확인. 앱 전체 화면에서의 시각 확인은 반영 전 필요.

## 미검증·한계
- 자동 수집본은 SEC 공시 원문과의 일치 검증 전(미검증 표시 유지). 임계값(제안 기준)은 백테스트 미검증.
- 시세 독립 대조 연결(KIS kis-us 대조 → price-trust)과 국내 DART 연결은 다음 단계. 그 전에는 매수 쪽 보류가 풀리지 않음.
- 수집이 멈추면(403 등) 파일이 오래돼 '수집한 지 N일 지남' 경고 후 재무 없음으로 취급.

## 순태씨 결정
- 반영('올려') 여부. 지피 검토 후 권장(앱 코드 변경).
