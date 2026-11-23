STATUS: READY_FOR_REVIEW
ORDER-ID: USER-20261123-MENU-EXPLORE — 순태씨 대화창(16시대) 위험관리 화면 캡처 4장 → 선택: 하위 메뉴 정리('🔭 탐색' 새 대분류), 종목분석 날짜 갱신 표시, '추매가능' 줄바꿈
BASE: 2291d1f59263d06d1d52814143678245a146f175 (main; 이후 main은 문서 커밋만)
HEAD: 8a37cf6da4e782ced079d359d83b8752817a23f5
BRANCH: work/claude-menu-explore-20261123
REVIEW-SCOPE: 2291d1f..8a37cf6 — portfolio_v5.html(대분류·하위 탭 HTML, TAB_GROUPS, hasSyncRiskTabHighlight, hasScrollSubTabIntoView 신규, hasPdDate 신규, 360px CSS 1줄), tests/risk-menu-harmonization.test.cjs, tests/great-companies-panel.test.cjs, tests/lib/live-data-edits.json(역방향 쌍 9개), tests/lib/live-data-pins.json
작성: 클로 / 2026-11-23 16시대 KST (순태씨 대화)

## 바뀌는 것
1. 큰 탭 5개: 💰 투자 · 🔭 탐색(신규) · 🛡️ 위험관리 · 💎 자산관리 · ⚙️ 설정.
   - 탐색: 📡 곡소리 · 📣 환호성(바로가기) · 🏛️ 위대한 기업 · 🧭 AI 참모 · 🧪 거래 기록·손익 계산 체험
   - 위험관리: 📋 종목분석 · 🌡️ 위험계 · 📝 매매 점검 · 📜 15계명(맨 오른쪽 유지)
2. 하위 탭을 고르면(환호성 포함) 그 탭이 가로 스크롤 밖에 숨지 않게 묶음만 옆으로 맞춤(세로 위치 불변).
3. '환호성가격 참고' 띄어쓰기(inline-flex로 공백이 사라지던 문제 → small에 margin-left 4px).
4. 종목분석 카드: 기록된 '다음 실적'·'점검' 날짜가 기기 오늘 날짜보다 지났으면 '(지남·갱신 필요)' 빨간 표시. **기록 자체는 바꾸지 않음** — 새 날짜는 순태씨가 '📋 분석'에서 입력.
5. '✅ 추매가능/⛔ 추매보류' white-space:nowrap(‘추매가/능’ 끊김 방지).
6. 360px 이하: 큰 탭 padding·글자 13px, 위험관리 하위 탭 padding 축소(넘침 0).

## 시험
- 전체(제외 없음) `node --require ./tests/lib/no-network.cjs --test tests/*.test.cjs`: **2316 · pass 2314 · fail 0 · skip 2**(뉴욕 TZ 전용). scan-secrets 0. live-data 역투영(원본 재현) 통과.
- 갱신 시험: 위험관리 4개·탐색 4개 그룹, 환호성 바로가기 탐색 쪽, 15계명 마지막, 위대한 기업 버튼 탐색 쪽. 신규: 큰 탭 순서·그룹 전환·가로 스크롤 맞춤, hasPdDate(지난/미래/빈값/특수문자), 추매가능 nowrap.
- Chromium 360·390·430(외부 요청 차단, 파일 직접 열기): 큰 탭 넘침 0/0/0, 위험관리 하위 넘침 0/0/0, 탐색에서 마지막 탭 선택 시 보임 true, 페이지 오류 0. 캡처 확인(잠금 화면 상태에서 네비만).

## 미완료·미검증
- 실기기(갤럭시) 확인 전. 종목분석 카드의 지난 날짜 표시는 실제 기록 화면이 아닌 단위 시험으로만 확인.
- 예전 Playwright 스크립트(tests/mobile*.cjs, e2e-journey-stage20.cjs)는 이미 옛 문구('곡소리 레이더'·'원장 시범')로 낡아 있어 이번 범위에서 고치지 않음.
- MSFT 다음 실적일은 순태씨 기록값 — 앱이 자동으로 바꾸지 않음.

## 순태씨 결정 필요
- 지피 검토 후 운영 반영 '올려'.
