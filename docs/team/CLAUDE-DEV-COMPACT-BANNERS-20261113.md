STATUS: READY_FOR_REVIEW
ORDER-ID: (없음 — 순태씨 대화 2026-11-13 02:26 "줄이고")
BASE: main 4ff913d1f6ebb83bfd9a1f99f8de456569b4bc74   HEAD: 805dc5e415c0dd88e7b230841fce1021468eb3fd
BRANCH: work/claude-compact-banners-20261113
REVIEW-SCOPE: `portfolio_v5.html` <style> 규칙 7줄, `tests/compact-banners.test.cjs`, 고정 파일 `tests/lib/live-data-edits.json`·`live-data-pins.json`. JS·문구·계산 변경 없음.

# 상단 두 띠 줄이기 (2026-11-13 02:35 KST)

- 순태씨 질문: 화면 맨 위 노란 "가격 신뢰도"·파란 "오늘의 투자 브리핑"이 뭔지 → 설명 후 "줄이고" 승인.
- 사실: 두 띠는 모든 탭 위에 항상 표시. 브리핑 "위험 1"은 순태씨 확인대로 현금 비중 0%(최소 10%)·"판단 보류 39"는 재무·검증 시세가 없어 의견을 내지 않는 원칙.
- 변경(CSS만): 가격 신뢰도 띠 84~103px → 50px, 브리핑 띠 108px → 50px(Chromium 360/390/430, 합계 약 190~210px → 100px). 글자 13px, "자세히 보기"·"자세히" 터치 영역 44px 유지, 가로 넘침 0. 펼치면 기존 상세 그대로.
- `has/ledger-demo.css`·`has/advisor-panel.css`는 KIS 보호 원본이라 건드리지 않고 `portfolio_v5.html`에서 더 높은 우선순위(`body #id`)로 덮어씀(보호 해시 시험이 변경을 잡아 확인).
- 시험: 전체 1989 중 1987 통과/0 실패/2 skip, 비밀값 0, 새 시험 2건.
- 미검증: 실제 갤럭시 화면. 문구를 더 줄이거나(한 줄 합치기) 위험이 없을 때 숨기는 것은 하지 않음 — 순태씨 판단 대기.
- 운영 반영: 순태씨 승인 대기.
