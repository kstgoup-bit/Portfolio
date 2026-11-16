STATUS: READY_FOR_REVIEW
ORDER-ID: 없음(순태씨 직접 요청 2026-11-16 20:4x KST, 갤럭시 캡처)
BASE: fa0bcbe
HEAD: d47792aaff9807cd8dafe819efc41edb44dafbb2
REVIEW-SCOPE: has/decision-brief.js inInvest() 조건 확장, css 주석, 시험 2개 파일, pin

# 가격 신뢰도·오늘의 투자 판단 띠 — 투자 > 현황에서만

## 요청
투자 탭의 일반·ISA·해외 등 하위 탭에서도 두 띠가 보임 → '현황'에서만 보이게.

## 변경
- has/decision-brief.js: inInvest()가 gtab-invest 활성 **그리고** panel-dashboard 활성일 때만 참(요소가 없으면 그 조건 통과). 기존 applyScope()가 두 띠(hasBriefStrip·hasPriceTrust)에 hdb-off를 토글하므로 나머지 로직 변경 0. switchTab은 패널 토글 후 onTabChange를 호출하므로 순서 문제 없음.
- has/decision-brief.css: 주석만.
- portfolio_v5.html·price-trust-ui.js 변경 0.
- tests/decision-brief.test.cjs: 현황↔일반 전환 시 두 띠 숨김/보임 시험 추가.
- tests/mobile-stage19.cjs: 가격 신뢰도 띠 검사를 현재 사양(투자>현황만 보임, 위험관리·자산관리·설정·해외 숨김)으로 갱신.
- tests/lib/live-data-pins.json: decision-brief.js·css 해시 갱신.

## 시험
- 전체 2243 중 2241 통과/0 실패/2 skip. 비밀값 0.
- Chromium 360/390/430: mobile-stage19 가격 신뢰도 띠 검사 3건 PASS(main에서는 지난 변경 이후 실패하던 것). 같은 파일의 '원장 시범' 관련 11건은 main에서도 동일 실패(메뉴 제거로 오래된 시험, 이번 변경과 무관).

## 미완료·결정
- 운영 미반영. 순태씨 '올려' 시 main 병합·배포.
