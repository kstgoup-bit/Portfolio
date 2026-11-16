VERDICT: CHANGES_REQUESTED
REVIEWED-CLAUDE-COMMIT: e4741d5736819d16b53c17f397c126f575265216
REVIEWED-BRANCH: work/claude-sec-gas-20261116
MAIN-AT-REVIEW: 5cedc6a19c8331aca666dfe7b099243a78c0ee03
PREVIOUS-REVIEW: docs/team/GPT-REVIEW-sec-gas-20261116-0930.md
REVIEW-DATE: 2026-11-16 10:30 KST
REVIEW-TYPE: 지정 소스·테스트·변경 목록·문서 정적 검토. GAS·SEC·Node 시험 독립 실행하지 않음.

# HAS SEC 재무 수집 GAS 초안 — 09:30 수정 요청 재검토

## 1. 검토 근거/경계
- main의 `docs/team/CLAUDE-LATEST.md` 최상단 STATUS: READY_FOR_REVIEW, REPORT: `CLAUDE-DEV-SEC-GAS-20261116.md` 0-a, BRANCH: `work/claude-sec-gas-20261116`, **코드 HEAD `e4741d5736819d16b53c17f397c126f575265216`** 확인(후속 보고 커밋 `9d4bbf9`는 docs만). main 협업 문서/일지/400종목 요청서 확인.
- 이전 검토 `e375ba7`부터 지정 HEAD `e4741d5`까지의 실제 변경 목록(해당 HEAD 커밋에는 gas/has-sec-fundamental.gs, tests/sec-fundamental-gas.test.cjs, tests/lib/live-data-pins.json, GAS 배포 안내서)을 비교하고 `gas/has-sec-fundamental.gs`, `tests/sec-fundamental-gas.test.cjs`, `CLAUDE-DEV-SEC-GAS-20261116.md` 0-a, 배포 안내를 읽었다.
- 범위는 **배포 전 저장소의 GAS 초안 코드와 클로 제공 합성 시험 설계**. 실제 SEC·Apps Script·Chrome·갤럭시·사용자 데이터 및 GAS 배포는 시험·수정·승인하지 않았다. 클로 보고 시험은 2,217건 중 2,215 통과/0 실패/2 skip(새 합성 11건), 지피 독립 재현 아님.

## 2. 이전 CR 반영 긍정사항
- CR-1 종목 정합성: `raw.cik` 필수 및 URL CIK 엄격 일치, 위변조/누락은 해당 종목만 `ok:false`, 캐시 키에 CIK 포함 및 캐시 재검증 구현을 소스와 합성 시험에서 확인. **CR-1의 정적 설계 조건은 충족**.
- CR-2의 일부 개선: 지도·회사자료 요청이 `hasSecGate_`를 거치며, ScriptLock·최소 250ms 간격·분당 60건(캐시 상태가 살아 있을 때), 티커별 CIK 캐시, 429/403 시 재요청 방지와 10분 보류 설계 및 관련 합성 시험을 확인. 이전의 무제한 동시 요청 문제는 상당 부분 개선됨.
- 그러나 다음 2개 위험이 남아 **전체 CR-2를 완료로 판정할 수 없다**.

## 3. 수정 요청

### CR-3 (필수) 공용 요청 제한 상태가 CacheService 조기 퇴거되면 제한을 우회
- `hasSecGate_`는 `HAS_SEC_LAST_MS`, `HAS_SEC_N_<분>`를 오직 `CacheService`에 두고, 누락된 키를 곧바로 0으로 취급한다. ScriptLock은 **짧은 캐시 접근만 보호하고 네트워크 요청 전 해제**하므로, 캐시 엔트리가 부하 등으로 일찍 사라지면 병렬 실행마다 이전 요청 시각·사용량을 잃어 250ms/분당 60건을 강제하지 못한다.
- Google의 CacheService 공식 문서는 `put` 만료 시각을 **제안값**으로 규정하고, 캐시가 그 전에 제거될 수 있다고 명시한다: https://developers.google.com/apps-script/reference/cache/cache .
- 요청: 요청 허가의 **안전상 핵심 상태**는 조기 퇴거 가능한 결과 캐시만으로 관리하지 말 것. 예: ScriptLock 보호 아래 `PropertiesService.getScriptProperties()`의 유지 가능한 시간/건수 상태를 갱신한 후 네트워크를 허가하거나, 데이터 상태가 없거나 불확실하면 즉시 요청을 보류(fail closed). 조회 결과 자체(회사 재무·CIK)는 CacheService 유지 가능. 네트워크 시작 시간과 허가 타이밍에 대한 경합도 검토하고, 기존 작업에 영향을 주지 않는 범위로 구현할 것.
- 필수 시험: 공유 요청 상태 키가 **TTL 이전에 사라지는 경우**, 연속·병렬 실행 모두 안전하게 보류되거나 간격/상한을 보증하는 합성 회귀시험. 캐시 적중/미적중이 섞여도 지도+companyfacts 전체 요청량 검사.

### CR-4 (필수) 403/429 중단 시각 기록 실패를 무시하면 다음 실행에서 즉시 재요청 가능
- `hasSecFetch_`는 429/403 수신 시 `cache.put('HAS_SEC_COOLDOWN_UNTIL', ...)` 실패를 `catch`로 묵살한다. 캐시 조기 제거도 같은 결과. 이후 실행은 `hasSecGate_`에서 `until=0`으로 처리하므로 **공식 차단 응답 직후 재시도 금지 약속이 보장되지 않는다**.
- 요청: 차단 상태를 신뢰성 있게 공유/유지하거나, 유지 실패 시 요청을 안전하게 보류하도록 구조 조정. 실제 요청/응답 오류를 은폐하거나 무한 재시도하지 않을 것. **차단 저장 실패, 즉시 조기 제거, 시뮬레이션 병렬 실행**을 포함한 회귀시험 추가.

## 4. 완료·승인 경계
- 이번 `CHANGES_REQUESTED`는 이전 CR-1 재작업 요구가 아니라 **CR-2 잔여 보장 문제 2개(CR-3/CR-4)**에 한정한다. 수정·시험은 `work/claude-sec-gas-20261116` 기존 개발 브랜치에, 결과는 `READY_FOR_REVIEW`/코드 HEAD 지정 보고서로 재제출. 새 GPT-ORDER는 불필요하다.
- 서버 실제 실행·SEC 실계정 조회·GAS 연결·운영 배포·기록 변경·유료/API 키 사용은 전혀 허용하지 않는다. 시세/재무/가치평가 검증 전 매수·매도 게이트 잠금 유지. 추후 정적 APPROVE를 받더라도 실제 GAS/사용자 데이터/운영 반영에는 **순태씨 사전 승인 필요**.
- 400종목 목록은 기존 KR 201/US 200 처리 경과와 공식 출처/manifest를 존중하고, `radar/data/universe-400.json` 부재만으로 기존 작업을 중복 실행하지 않는다.

## 5. 결론
**VERDICT: CHANGES_REQUESTED.** CIK 정합성 개선은 확인되었지만, SEC 전체 요청률과 429/403 중단 정책의 안전성을 CacheService 퇴거/실패 조건까지 보완해야 한다.
