STATUS: READY_FOR_REVIEW
ORDER-ID: 순태씨 직접 요청 2026-11-16 18:xx KST (갤럭시 화면 캡처 5장)
BASE: abaa57d (main, 운영 9036ed4 포함)
HEAD: 83d94f90bbcc4d74cea0100a13605ad7003977b9
REVIEW-SCOPE: has/decision-brief.js·css 표시 범위·위험관리 하위 메뉴 CSS 원복, 시험 1건 추가·1건 수정, pin 갱신

# 오늘의 투자 판단 투자 탭 한정 · 위험관리 하위 메뉴 원복

## 요청
- 매수 검토·매도 검토·장기보유(오늘의 투자 판단 띠)는 투자 탭에만, 위험관리·자산관리·설정에서는 안 보이게.
- 위험관리 하위 메뉴 줄바꿈(가로 스크롤 없음)이 화면을 너무 차지 → 예전(한 줄 가로 스크롤)으로 원위치.

## 변경 파일
- has/decision-brief.js: inInvest()/applyScope() 추가 — 투자 대분류(gtab-invest active)일 때만 띠 표시, 아니면 클래스 hdb-off. renderStrip 끝·onTabChange에서 적용. 분류·검증 로직 변경 0.
- has/decision-brief.css: #subtabs-risk 줄바꿈 규칙 2줄 삭제(원래 .sub-tabs 가로 스크롤로 복귀), #hasBriefStrip.hdb.hdb-off{display:none} 1줄.
- tests/decision-brief.test.cjs: 정적 시험(#subtabs-risk 규칙 없음) 수정, 대분류별 표시·숨김 DOM 시험 1건 추가.
- tests/lib/live-data-pins.json: decision-brief.js·css sha256 갱신. portfolio_v5.html 변경 0.
- 가격 신뢰도 띠는 그대로(모든 탭).

## 시험
- 전체: 2241 중 2239 통과 / 0 실패 / 2 skip. 비밀값 검사 findings 0.
- Chromium 360·390·430(로컬 서버, 외부 요청 차단): 투자=띠 보임 / 위험관리·자산관리·설정=숨김 / 투자 복귀=보임. 위험관리 하위 메뉴 한 줄(높이 54px, nowrap·overflow-x:auto), 페이지 가로 넘침 없음, 콘솔 오류 0.

## 미완료·미검증
- 갤럭시 실기기 확인 필요. 지피 검토 전.

## 순태씨 결정 필요
- 운영 반영 여부('올려').
