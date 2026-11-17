VERDICT: CHANGES_REQUESTED
REVIEWED-CLAUDE-COMMIT: 0751aaae28791212f3786dfaecac01232a972083
ORDER-ID: GPT-20261117-0940
REVIEW-BASE-MAIN: babe23ff0ede93147501c6673b7a5be8eb1ec984
REVIEW-TIME: 2026-11-17 13:32 KST
REVIEW-SCOPE: has/benchmark-conflict-repair.js, tests/benchmark-conflict-repair.test.cjs, tests/lib/live-data-pins.json, CLAUDE-DEV-BENCH-HISTORY-REPAIR-20261117.md
EVIDENCE: GitHub 소스·보고서 정적 대조 및 bb30be3...0751aaa 커밋 비교. 지피 독립 시험 실행 없음.

# 기준지수 기존 충돌 이력 dry-run 정리 도구 — 교차검토

## 확인 및 인정하는 범위
- main의 CLAUDE-LATEST 최상단 STATUS: READY_FOR_REVIEW, REPORT, BRANCH, 지정 코드 HEAD 일치; 보고서 원문도 READY_FOR_REVIEW. WIP 검토 아님.
- main 문서 README, COLLAB-PROTOCOL, CLAUDE-WORKLOG, UNIVERSE-SCREEN-REQUEST 확인. 처리된 GPT-20261117-0940, GPT-20261117-1234 및 price-meta 승인 이력을 대조. 최신 main SHA는 babe23ff0ede93147501c6673b7a5be8eb1ec984(상태 포인터 문서 커밋).
- bb30be3에서 지정 HEAD까지 비교 시 변경 파일은 정확히 신규 has/benchmark-conflict-repair.js, 신규 tests/benchmark-conflict-repair.test.cjs, tests/lib/live-data-pins.json 3개. 운영 앱, GAS, backup/core.js 변경 없음.
- 정적 검토상 모듈은 localStorage/API/백업 쓰기 함수 호출이 없고, portfolio_v5.html에서 로드되지 않는다. 실제 SPY 256건 정리는 수행되지 않았다. 기본 승인 경로가 비어 있어 기본 옵션에 교체 제안 없음. 제안 자체가 사본에 자동 적용되지 않는 점은 적절하다.
- 클로 보고서 기준 합성시험 신규 9건, 전체 2258 중 2256 통과/0 실패/2 skip, 비밀값 스캔 0. 이 수치는 **클로 보고**이며 지피가 독립 재실행한 결과가 아니다.

## 수정 요구 (재검토 게이트)

### CR-1: 동일 승인 경로의 상충 가격을 무시하고 근거를 통과시키는 문제 (필수)
- `usableEvidence()`는 `usedRoutes[e.route]||usedUp[up]`인 뒤늦은 증거를 조용히 제외한다. 같은 승인 경로 r-a에서 동일 날짜의 103과 99라는 상반된 종가가 들어와도, 앞의 103과 별개 r-b의 103이 먼저 채택되면 `ok:true`가 가능하다. 증거 배열 순서에 따라 교체 제안이 달라질 수 있다.
- 승인 경로/상류 원천에서 동일 날짜·가격종류의 상충 관측이 2개 이상이면 그 근거 묶음 전체를 **hold** 처리한다. 채택하지 않은 유효 형식 관측도 상충 검증에 포함한다. 임의로 첫 값을 고르거나 우선순위로 숨기지 않는다.
- 단위시험: r-a(103), r-a(99), r-b(103)를 순열로 입력해 모두 hold; 동일 경로 중복 동일값은 독립 출처 2개로 계산하지 않음; 서로 다른 승인 원천의 완전히 일치하는 정규 종가 2개만 통과.

### CR-2: 중복 병합에서 확인되지 않은 시세 메타데이터 차이 보존 (필수)
- `dupKey()`는 `alternative.providerBarTs`를 비교하지 않는다. 같은 날짜·가격·source·finality라도 공급자 바의 실제 타임스탬프가 다르면 이는 단순 `receivedAt` 중복과 달리 서로 다른 바/수집 관측일 수 있다. `merge-duplicate`로 후자의 id가 사본에서 제거되며 감사 단서가 사라질 수 있다.
- **확인된 중복만** 자동 사본 병합 대상으로 삼도록 공급자 바 타임스탬프(및 현재/미래 스키마의 가격종류·조정·날짜종류)까지 동일성 증명에 포함하거나, 불일치 시 개별 보류/별도 감사 표기를 유지한다. 단순 수신시각만 다른 경우와 공급자 바 타임스탬프가 달라진 경우를 분리한 합성시험 추가. 원본·활성 가격·타 종목 변경 0 유지.

### CR-3: 미래 기준시각 증거 승인 금지 (필수)
- `usableEvidence()`는 `asOf >= closeTimeMs`만 검사하고 dry-run의 `now`보다 미래인 `asOf`를 걸러내지 않는다. 미래 시각을 기재한 가상의 2원천 가격만으로 과거 이력 교체 제안이 생성될 수 있다.
- `asOf`가 유효한 정규 마감 이후이며 **실행 기준 `now` 이하**임을 검증하고, 양쪽 근거의 거래일·세션 정합성을 검사한다. 시간대·DST·조기폐장/휴장 달력 미확인은 hold. 미래 1분·수년/NaN/잘못된 ISO 사례와 경계 시간 시험 추가.

### CR-4: 백업/복원 호환성 합성 왕복 시험 보강 (완료 조건)
- 현재 (8) 시험은 `backup/core` `parse`·`preview`에 그친다. 원 지시의 **복원 호환성** 확인을 위해 실제 사용자 자료가 아닌 합성 저장소에서 `apply`/복원/되돌리기(관련 API가 허용하는 형태)를 실행해 원문 V2·legacy의 정확한 보존, 실패 시 원상복구, 선택하지 않은 종목/계좌 독립성까지 검증한다. 실제 사용자 원본·백업 열람 및 수정 금지.
- 동일 입력·순서 바뀜·256 포화 후에도 fail-closed와 원본 불변 유지. 변경 사유, 결과, 새로운 전체 시험 수치와 제한사항을 보고서에 갱신한다.

## 승인 범위 및 금지
이번 판정은 **CHANGES_REQUESTED**다. 읽기 전용 dry-run 설계 방향만 긍정적으로 평가하며, 기록 자동 병합·삭제·교체 및 운영 연결은 승인하지 않는다. 클로는 기존 `work/claude-bench-history-repair-20261117` 브랜치에서 보완하고 지정 HEAD를 갱신해 `READY_FOR_REVIEW`로 재보고한다. 추가 GPT-ORDER는 중복 발행하지 않는다.

실제 SPY·QQQ·KS200 기록, 브라우저 localStorage, 백업, main 병합, 운영 배포, GAS/API, 비밀값, 비용, 클라우드 자원, 자동매매는 **사용자 별도 승인 전 금지**. 실제 256건은 아직 복구되지 않았으며 독립 시세·공식 거래일 달력도 미연결이다.
