VERDICT: CHANGES_REQUESTED
REVIEWED-CLAUDE-HEAD: c9ae2943633016af8cf4c256587c7494c7c95b2e
ORDER-ID: GPT-20261117-0730
MAIN-SHA-AT-REVIEW: e128aab42acfa4999666e23b38ae148945087ad9
REVIEW-SCOPE: 기준지수 보류충돌 원인 1단계(정적 진단·신규 합성 시험·설계 문서)만. 운영 코드·실제 데이터·GAS·배포 승인 아님.
INDEPENDENT-TESTS: NOT_RUN

# HAS 기준지수 보류충돌 원인 1단계 검토 — 2026-11-17 08:30 KST

## 검토 근거
- main `docs/team/CLAUDE-LATEST.md`: STATUS=READY_FOR_REVIEW, REPORT=`docs/team/CLAUDE-DEV-BENCH-CONFLICT-CAUSE-20261117.md`, BRANCH=`work/claude-bench-conflict-cause-20261117`, 지정 HEAD=`c9ae2943633016af8cf4c256587c7494c7c95b2e`.
- main의 `README-CLAUDE-REPORTS.md`, `COLLAB-PROTOCOL.md`, `CLAUDE-WORKLOG.md`, `UNIVERSE-SCREEN-REQUEST-20261112.md` 및 기존 `GPT-ORDER-20261117-0730.md`를 확인. ORDER는 클로 작업일지에서 처리됨. 별도 `GPT-20261117-0731`은 가격 메타 계약 설계 대기이며 본 검토 대상 아님.
- GitHub 비교 `ed021eea818aab92af9dc5e013f86f2dd4dbb560...c9ae2943633016af8cf4c256587c7494c7c95b2e`: **신규 파일 `tests/benchmark-conflict-cause.test.cjs` 92줄만** 추가. 운영 앱·`has/*`·`gas/*`·투자기록·백업 변경 없음. 보고서 원문은 개발 브랜치 및 main에서 확인(보고 커밋은 지정 시험 HEAD 이후 docs만).
- 실제 `tests/benchmark-conflict-cause.test.cjs`, `has/benchmark-history-policy.js`, `portfolio_v5.html` ETF 수신·병합·저장 경로, `gas/has-history-request.gs`, `backup/core.js`의 검증/복원 API를 정적으로 대조.
- 클로 보고: 단독 합성 10건 통과, 전체 2,259건 중 2,257 통과/0 실패/2 skip, 비밀값 검출 0. **지피는 시험을 독립 실행하지 않았으며 이 수치를 재현 결과로 주장하지 않음.**

## 정적 검토에서 확인된 타당한 결과
1. `makeObservation`은 관측 수신의 시장일과 봉 날짜가 같으면 실제 마감 후에도 `provisional`로 기록. 같은 날짜의 후속 다른 값은 `mergeHistoryStore`에서 `pending-review`가 되고, 같은 날짜에 pending이 생기면 다음 시장일 `provisionalSuccessor`를 막는 구조. 합성 (a),(a2),(b)와 일치.
2. GAS `yahoo-chart-v8-via-gas`, Yahoo 직접 `yahoo-chart-v8`, AV `alpha-vantage-daily`의 출처 문자열은 서로 달라 같은 날짜에 successor를 제한. 중복 키에 `providerBarTs`가 포함된 점도 (c),(c2) 시험과 일치. 실제 실기기에서 각 출처가 차지한 비율은 미확인.
3. `MAX_CONFLICTS=256`; 이미 256건일 때 다른 날짜를 함께 수신해 충돌이 1건 추가되면 병합 전체가 `store-bound`로 거절될 수 있음. 합성 (f)로 코드 경계를 검증했을 뿐, 순태씨 갤럭시에서 실제 SPY 갱신이 멈췄는지는 미확인.
4. `closeTimeMs`의 미국 `-05:00` 고정은 DST 기간 시각을 보수적으로 늦추지만 이번 병합 자체의 직접 원인으로 단정할 수 없음. 기존 자료를 무검증 자동 덮어쓰기/삭제하지 않는 설계 방향은 적절함.

## 수정 요청 (다음 READY_FOR_REVIEW에서 확인할 사항)
**CR-1 — 명시된 합성 복구·백업 호환 시험 (g) 누락 보완.**
기존 (f)에서 `validateStore`와 `backup/core.js:validateStoredValue`가 통과하는 것만 확인하고, 복원 전후의 연결·원본 보존·실패 폐쇄를 분리 시험하지 않았음. 최초 지시서 2항은 '(g) 복구·백업 호환을 분리 시험·기록'하도록 요구했음.
- 순수 합성 저장소/메모리 Storage로 가능한 범위의 `backup/core.js` `create/parse/preview/apply/undo` 및 `H.readStore` 연결을 테스트하거나, 실제 함수의 제약으로 불가한 단계는 이유를 명시하고 동등한 검증 가능한 대안을 제시.
- `v5_benchHist` 레거시 원문 불변, `v5_benchHistV2`의 `legacyFingerprint` 일치/불일치 경계, 복원 뒤 보류·읽기 가능 여부, 실패 시 무단 덮어쓰기 없음 등을 서로 다른 합성 시험으로 증빙.
- **실제 계좌·사용자 브라우저 localStorage·백업 열람/수정/전송 금지**. 회귀 시험 결과 및 제외 수 재기록.

**CR-2 — H3의 증거 수준 표현 정리.**
합성 (d)는 AV 대조값에 임의로 0.99를 곱해 '다른 가격이면 충돌한다'는 기계적 분기를 증명함. 실제 Yahoo `quote.close`와 AV `4. close` 사이의 조정 기준이나 실제 불일치 가능성의 크기를 검증하지는 못함. 보고서 H3의 '가능성 낮음'은 정량/출처 근거 없이 단정하지 말고 **실제 출처별 조정 정책·해당 ETF의 시계열 증거 없음 → 기여 여부 미검증**으로 명확히 구분.

## 승인/안전 경계
- 현재 VERDICT는 **이 1단계 증빙 완결에 대한 CHANGES_REQUESTED**이며, 발견된 코드상 위험·설계 방향 자체를 부정하는 판단은 아님.
- `after-close-unverified`·`superseded-intraday` 등 새로운 상태는 기존 `validateObservation`/충돌 validator가 허용하지 않으므로, 후속 코드 설계에서 **명시적 버전·스키마 호환 및 읽기 전용 실패 처리**가 필요. 기존 sidecar 자동 마이그레이션을 이번 검토로 승인하지 않음.
- 기존 `GPT-20261117-0730`의 범위 안에서 보고/합성 시험을 보강하면 충분. **중복 GPT-ORDER 발행 불필요**. `GPT-20261117-0731`의 독립 작업을 방해하지 말 것.
- main 병합, 운영 배포, GAS, 실제 키/API, 비용, 클라우드, 투자기록·백업 변경, 자동매매 및 비밀값 업로드는 허가하지 않음. 기존 충돌 256건 정리·압축/마이그레이션은 추후 별도 사용자 승인 필수.
