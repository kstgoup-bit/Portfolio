VERDICT: CHANGES_REQUESTED
ORDER-ID: GPT-REVIEW-postmerge-queue-20261125-0930 CR-1·CR-4 (D1·D4 승인 범위)
REVIEWED-HEAD: 94496688ff3cd437209ee5a1cd9f75c5ab930e9d
REVIEWED-BASE: d5f011497dfd30bb776f09e047b340d9f9a04be5
MAIN-AT-CHECK: 74971736df0782a9250d902655a7f6125964579b
REVIEW-SCOPE: 단위 A D1·D4만
REVIEW-MODE: STATIC_ONLY (2026-11-25 10:30 KST)

## 확인 근거
필수 5개 문서 순서대로 확인. 최신 포인터 READY_FOR_REVIEW, 지정 브랜치 보고서 CLAUDE-DEV-POSTMERGE-FIX-20261125.md 및 BASE...HEAD 비교(1커밋, 4파일: has/kis-crosscheck.js, has/review-cards.js, tests/lib/live-data-pins.json, tests/review-cards-held.test.cjs). 지정 HEAD의 chart-gate.js, review-cards.js, backup/core.js, 신규 시험 본문 및 scorecard 표시 관련 코드도 확인. 보고된 전체 2364/통과2362/실패0/skip2, 비밀값 검사0, 합성 Chromium 360/390/430; 지피는 독립 시험·실기기·실제 시세/계좌/백업 재현을 하지 않았다.

## D1 부분 적합
KIS 문구만 '백업에 포함'으로 정정. backup/core.js JSON_KEYS 및 복원 형식 검사에 has_kisCrossLog_v1이 이미 포함된 사실과 부합. 변경 목록상 실제 백업 코드·기록 변경 없음. D1 문구 수정 범위의 정적 검토 적합; D2·D3의 신뢰도/연속일 검증 또는 G0 승인 아님.

## D4 일부 개선, 차단 잔존
HELD/shown()으로 buy-review/add-review 카드 라벨을 회색 단독 의견·판단 보류로 수정하고 곡소리 현황의 매수 건수, 별도 5% 예외 문단, 공통 분할 금액 문단을 제거했다. 원본 JSON·성적표 verdict 보존도 확인했다.
CR-A1 (차단, 기존 D4 범위): review-cards.js render()는 여전히 모든 gateKinds(buy-review/add-review/hold-long)의 G.cached 결과를 G.describe(gr).label/color 그대로 표시한다. 실제 chart-gate.js STAGE는 basing='바닥 다지는 중 · 정찰병(목표의 10%) 가능', stage2='20일선 회복 · 2차(30% 더) 가능', stage3='60일선 회복·저점 상승 · 3차(30% 더) 가능 · 마지막 30%는 다음 실적 확인 뒤'이고 녹색/청색 등 행동 유도 색을 포함한다. 따라서 판단 보류 문구 바로 아래에 실제 금액 비율/매수 가능이 재노출된다. 신규 시험은 falling만 모의하고 describe 자체를 중립 문구로 대체하여 이 경로를 놓쳤다. 수정은 표시 계층에서 중립적인 단계 설명(바닥 다지기/20일선 회복/60일선 회복 등, 판단 보류)을 사용하거나 잠금 중 차트 라벨을 숨기는 방식으로 제한한다. 실제 차트 산식·캐시·원본 데이터·분할정책은 변경하지 않는다. 모든 단계/캐시 재표시·재조회, 국내/미국/보유 카드(buy/add/hold), 혼합·빈 목록에서 실제 describe 계약을 사용한 합성 DOM 시험을 추가. '10%/30% 가능', '5% 예외' 등 구체적인 행동 유도 표시가 잠금 중 없음을 검증하고 차트 숫자 참고와 매수 권유를 분리. 기존 전체 시험 및 모바일 합성 3폭 근거 제출.
CR-A2 (확인 및 D4 범위 내 정리): 보유 현황은 여전히 '추가 매수 후보(판단 보류) N'을 집계해 노출하며, 상세는 raw headline/context/reasons를 그대로 보여준다. D4 계획의 현황 매수 건수 숨김과 충돌 여부 확인; 보유 현황의 매수쪽 건수도 숨기되 다른 판단 건수는 유지. 실제 원본 의견은 변경 없이 인용/조사 참고임을 구별하고 단정적 헤드라인 사례에 대한 표시 테스트 추가. 성적표의 과거 의견/실전 기록 기능(5% 예외 기록 입력 안내 포함)은 이번 승인 범위 밖이며 실제 기록 수정 금지; 현재 추천과 혼동 가능성은 별도 큐 검토에서 평가. D5 합의 모델은 아직 미승인으로 구현하지 않는다.

## 다음
D1은 부분 정적 적합, 단위 A 전체는 CR-A1·A2 보완 후 재검토. 사용자 승인된 D1·D4의 표시 수정에 한정하고 D2·D3·D5는 결정 대기. 이 검토는 main 병합·운영 반영 승인이 아니며 사용자의 '올려' 별도 필요. GAS/실제 키/API/계좌/주문/비용/실제 기록·백업 변경 금지. 자동매매 장기 설계는 기존 완료 기록 유지, 400종목 목록 중복 작업 없음.
