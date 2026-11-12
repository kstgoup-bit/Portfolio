VERDICT: CHANGES_REQUESTED
REVIEWED-COMMIT: 47d85334775e9b8e2136447f0ef114c8ea664898
ORDER-ID: GPT-20261113-0024
REVIEW-SCOPE: 자본배분 비교 엔진 1단위(순수 계산·합성 픽스처·시험), 운영 승인 아님
BASE: 6235eb8b2ed18ed55d06123f779e0b02564d232f

# HAS 자본배분 비교 엔진 1단위 — 지피 교차검토 (2026-11-13 07:30 KST)

## 확인 근거
- main docs/team/CLAUDE-LATEST.md: READY_FOR_REVIEW, report CLAUDE-DEV-CAPITAL-ALLOCATION-20261113.md, work/claude-capital-allocation-20261113, HEAD 47d8533.
- main의 README-CLAUDE-REPORTS, COLLAB-PROTOCOL, CLAUDE-WORKLOG, UNIVERSE-SCREEN-REQUEST 및 처리 ORDER-ID 확인.
- 보고서 본문과 지정 HEAD의 has/capital-allocation.js, tests/capital-allocation.test.cjs, tests/fixtures/capital-allocation-nvda-synthetic.json, tests/lib/live-data-pins.json 원문 확인.
- GitHub compare 6235eb8 → 47d8533: 1커밋 / 4개 파일 변경(신규 3, 수정 1). main 최신 SHA 확인: 951fb5126b31e85a00ac4c42d6b44c32bcb3f570.
- 클로 보고: 전체 2000 중 1998 통과 / 실패 0 / 기존 DST skip 2, 새 시험 11건, 비밀 검사 발견 0; 화면 변경 없으므로 Chromium 해당 없음. **지피는 전체 시험·브라우저 시험을 독립 실행하지 않았음**.
- 긍정적: 순수 입력 기반 계산, 가상 매수대안 A~E, 비중 한도 경고(매도 명령 아님), 합성 가격 고지, 매수 검토 항상 차단, 실제 앱·GAS 미변경 방향은 확인함.

## 수정 요청 (완료 단위 승인 전)
1. **동일 후보 종목의 상충 가격이 조용히 무시됨.** validateInput()은 후보를 순회할 때 holdings 내 기존 symbol과만 가격 충돌을 대조한다. candidates 내부에 같은 종목(예: GOOGL)이 100 USD와 101 USD로 두 번 나오고 보유 목록에 없으면 HOLD_CONFLICT로 분류되지 않는다. priceOf()가 첫 가격만 사용하고 defaultAlternatives()는 종목을 중복 제거하여 실제 입력 충돌을 감춘다. **수정**: candidates 내부 동일 티커의 상충 통화·가격·시세종류·기준시각을 검증해 HOLD_CONFLICT로 보류. 동일 종목 동일 자료의 중복 허용 여부도 명시. 회귀시험 추가.
2. **비정상 대안/시나리오 객체가 보류 대신 런타임 예외를 낼 수 있음.** alternatives: [null] 이면 runAlternative()에서 alt.allocations 접근이 실패하고, scenarios: [null] 이면 scenarioValues()가 sc.horizonYears에 접근한다. 외부/시험 화면 입력이라도 전체 비교가 예외로 중단되어서는 안 된다. **수정**: 배열 요소·allocations·share·시나리오 필드 형식과 가정 수익률 유효 범위를 사전 검증. 오류를 HOLD_INSUFFICIENT_DATA 또는 HOLD_CONFLICT로 표시하고, null·문자열·NaN·Infinity·음수 지평선 등의 회귀시험 추가.
3. **출처/시각 계약 경계 보완**: asOf, quoteAsOf, timezone, source는 현재 비어 있는지만 확인한다. 특히 verified/fresh의 정규장 시각·출처 일치가 엔진에서 독립 검증되지 않으므로 그 사실을 명시하고 형식·시각 모순 입력 시험을 추가. 검증 없는 시세를 실시간 또는 교차검증 완료로 표기하지 말 것.

## 다음 진행 및 승인 범위
- 먼저 위 1·2 필수 수정·단위시험을 동일 개발 브랜치에서 완료하고 READY_FOR_REVIEW로 다시 올릴 것. 3은 계약 개선과 경계시험을 함께 검토.
- 지시서 GPT-20261113-0024는 이미 진행 중이며 4절 시험 게이트 화면은 미완료. **새 ORDER-ID를 만들지 않음**; 기존 지시서를 이어가되 계산 엔진 수정이 선행되어야 함.
- 400종목 곡소리 미국 원본은 현 시점 미확보. 사용자 제공 전 임의 목록 또는 선정 기준 변경 금지.
- `main` 코드 병합, 운영 배포, GAS 변경·배포, 실제 키·비용·클라우드·투자기록/백업·자동매매 및 비밀값 업로드 금지. 이번 문서 검토 자체에는 사용자 승인 불필요; 실제 연동·운영은 별도 승인 필요.

## 판정 해석
**CHANGES_REQUESTED는 1단위 코드의 정적 검토 판정**이며 클로의 시험 결과를 부정하거나 전체 엔진이 동작하지 않는다고 단정하는 것이 아님. 결함과 범위가 특정된 입력 검증을 보완한 후 재검토한다.