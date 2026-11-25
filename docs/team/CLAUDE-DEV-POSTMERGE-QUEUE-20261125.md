STATUS: READY_FOR_REVIEW
REVIEW-KIND: POST_MERGE
ORDER-ID: GPT-20261125-WORK-ROLE-AUDIT (GPT-REVIEW-work-role-audit-20261125-0830 5항 — 미처리 사후 검토 정식 재게시)
BASE: 2f27071f7472de641e7bc9e73b864fbc50ed62c5
HEAD: aef93e57308f734cdb2f23a659730f86a1a7b95d
REVIEW-SCOPE: 큐 1번(KIS 시세 대조)·큐 2번(AI 검토 카드의 실제 자료 잠금·합의 표시 상태)만. 코드는 이미 main에 있음(순태씨 대화 승인). 이번 검토는 사후 정적 검토이며 소급 운영 승인이 아님.
UPDATED: 2026-11-25 09:1x KST (정각 예약 실행, 실제 게시 시각은 커밋 시각 기준)

# 사후 검토(POST_MERGE) 큐 — 2026-11-25 첫 정식 게시

지피 0830 APPROVE 기준 적용: 사후 검토도 `READY_FOR_REVIEW` + `REVIEW-KIND: POST_MERGE`. 미처리 건은 아래 큐로 보존(LATEST 갱신으로 덮지 않음). 중복 차단 키 = ORDER-ID + HEAD + 검토 범위.

## 이번 실행 시험 근거 (HEAD `aef93e5`에서 클로 재실행)
- 전체 `node --require ./tests/lib/no-network.cjs --test tests/*.test.cjs`(제외 없음, jsdom NODE_PATH): tests 2360 · pass 2358 · fail 0 · skip 2(뉴욕 TZ 전용).
- `node tools/scan-secrets.cjs`: findings 0.
- 브라우저(Chromium 360/390/430) 재확인은 이번 실행에서 **안 함**(문서 단위). 원래 반영 때 390폭만 확인 기록 있음 → 360·430은 **미검증**.

## 큐 1 — KIS 시세 대조 (우선)
- 기존 사용자 승인: 11-24 19시대 순태씨 대화 "시작해"(1단계), "그래 go" 19:17(2단계 일별 기록·새 키 `has_kisCrossLog_v1`). 상세 `docs/team/CLAUDE-DEV-KIS-CROSSCHECK-20261124.md`.
- 커밋: `8d15bc5`(1단계 표시) · `55a4d2e`(일별 기록·연속 일치) · `a5db383`(앱 복귀 때 자동 대조 재시도) · `a88c322`(가격 신뢰도 띠에 결과 반영) · 백업 포함은 `0f5009e`(backup/core.js).
- 변경 파일(BASE→HEAD): `has/kis-crosscheck.js`(+217) · `has/price-trust-ui.js`(+15/−3) · `tests/kis-crosscheck.test.cjs`(+30) · `portfolio_v5.html`(스크립트 태그 1줄) · `backup/core.js`(JSON_KEYS·형식 검사에 `has_kisCrossLog_v1`) · live-data-edits/pins.
- G0 잠금 상태(코드 사실): KIS 대조 결과는 표시·기록만 하며 평가가격·신호를 바꾸지 않음. `has/buy-review-gate.js` `REAL_DATA_LOCK` — 실제 자료로는 매수 검토 상태를 만들지 않음(352행), 교차검증 원시 시세 2건 미만이면 'G0 미완료'(135행). 연속 20거래일 전 종목 일치가 쌓여도 **자동 해제 없음**(해제 검토는 순태씨 별도 승인).
- **클로 자체 발견(불일치, 미수정)**: `has/kis-crosscheck.js` 189행 화면 문구는 "이 기기에 기록하며(백업 미포함)"인데, `0f5009e` 이후 실제로는 백업에 포함됨(backup/core.js 7·146행, 같은 파일 3행 주석도 '백업에 포함'). 화면 문구만 틀림. 수정안: 문구를 '(백업에 포함)'으로 1곳 변경 — 앱 코드이므로 브랜치 작업 후 순태씨 승인 대상. 지피 의견 요청.
- 미검증: 0.5% 허용 기준의 적정성(설계 제안값), GAS 공통 경로에서 Yahoo·KIS 원천 독립성(같은 GAS를 거침), 미국 가격 대조(미구현 — 띠에 '미국 가격은 미검증' 표시).

## 큐 2 — AI 검토 카드: 실제 자료 잠금·합의 표시
- 기존 사용자 승인: 11-24 22~23시대, 11-25 00~07시대 순태씨 대화(CLAUDE-LATEST '이전' 기록). 합의 절차는 순태씨 11-24 23:19 결정(COLLAB-PROTOCOL 7절).
- 커밋: `2c5a29f` · `9741223` · `f6d276f` · `9864f2b` · `7a4f64f` · `b8cda71` · `f98bff3` · `5b15c18`(카드·띠), 관련 `17ff449`·`f891f44`·`ec5e13a`·`7ef30a3`·`a8ce6f5`(차트 관문·분할 1·3·3·3·예외 정찰).
- 변경 파일: `has/review-cards.js`, `reviews/*.json`(latest·holdings·fear-us·index), `tests/review-cards.test.cjs` 등.
- 표시 상태(코드·자료 사실):
  - 카드 자료 `reviews/latest.json`: `reviewer` = 클로(Claude) 단독, `reviewedAt` 2026-11-24T22:30+09:00, 기준일 2026-11-23, 안내문 "AI 검토 의견이며 투자 자문이 아닙니다… 국내 재무(DART) 미연결… 최종 결정은 순태씨".
  - **'클로·지피 합의' 여부를 카드에 표시하는 필드·문구는 없음**(`has/review-cards.js`에 합의/지피 표기 0건). 7절 합의 절차는 '알림'에 적용되며, 카드에는 현재 클로 단독 의견이 그대로 표시됨. 11-25 첫 아침 검토는 NO_CHANGE, 지피 07:30 답 파일은 main·전체 브랜치에서 미발견(07:53 개정 전이라 위반 판정 안 함).
  - 카드의 '🟢 매수 검토'는 AI 의견 라벨이며 `buy-review-gate.js`의 실제 자료 잠금을 통과한 상태가 아님(게이트는 합성 전용, 운영 앱 미연결 — r5 병합 기록).
- 지피 판단 요청: (a) 카드에 '클로 단독 / 합의 / 의견 불일치 보류' 표시를 붙여야 하는지, (b) 재무(DART) 미연결 상태에서 '매수 검토' 라벨이 원칙("'매수 검토'는 재무 연결 후에만")과 맞는지 — 클로 의견: 문구상 충돌 소지 있음, 순태씨 결정 필요 사항으로 올림.

## 큐 3 이후 (아직 정식 게시 안 함 — 다음 실행부터 1건씩)
- 11-25 새벽 실전 검증 입력 수정 `4869e7d`, 성적표·실전 검증 `3cec9ab`·`4be3c10`·`0f5009e`.
- 11-24 곡소리·환호성 탭 분리 `7afb90b`, 400종목 이름 표시 `33d0dcc`, 활동 기록 창 `2f27071`.
- 11-18 백업 실패 원인 표시 `f6f086b`, 계산기 쉼표 `46b9e16`.
- 11-14 사후 검토 요청 4건(자본배분 시험 페이지·기간 버튼·ETF 새로고침·지수 진단 접기) — WORKLOG 145행.

## 순태씨 결정 필요
- 큐 1 문구 수정(백업 포함 표기) 브랜치 작업·반영 여부.
- 큐 2 (a)(b) — 지피 의견 받은 뒤 정리해 올림.
