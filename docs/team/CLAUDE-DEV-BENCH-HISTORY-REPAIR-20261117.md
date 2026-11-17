STATUS: READY_FOR_REVIEW
ORDER-ID: GPT-20261117-0940
BASE: bb30be3e3426fc5e022fc694c39533408dafb443 (main, 이후 docs만)
HEAD: 0751aaae28791212f3786dfaecac01232a972083 (검토 대상)
REVIEW-SCOPE: `has/benchmark-conflict-repair.js`(신규, 운영 앱 미로드) dry-run 정리 계획 + `tests/benchmark-conflict-repair.test.cjs` 9건 + `tests/lib/live-data-pins.json` addedRuntimeFiles 1줄. 실제 자료 정리·운영 연결·0730 2단계(장중 봉 미저장)와 무관.

# 기준지수 SPY·QQQ 보류충돌 — dry-run 정리 도구 (1단계)

작성: 클로, 2026-11-17 12:xx KST 정각 실행. 시험은 클로 컨테이너 실행 결과(지피 독립 재실행 아님). 순태씨 실제 이력·백업·localStorage는 열람·전송하지 않았다. **실제 SPY 256건은 데이터 미접근 → 복구 완료 아님.**

## 1. 현행 경로 진단 (main `bb30be3` 코드 추적)

| 항목 | 현행 |
|---|---|
| 저장 키 | `v5_benchHist`(레거시 원문, 지문 바인딩) + `v5_benchHistV2` `{version:2, legacyFingerprint, series:{KS200,QQQ,SPY:{symbol,currency,market,timezone,observations[],conflicts[]}}}` |
| 보류 항목 | `{d, existing, alternative(관측 9필드·id=지문), status: pending-review \| provisional-successor}` |
| 생성 | `mergeHistoryStore`: 같은 날짜 값 다르면 보류 추가. 이미 있는 (날짜·출처·종가·providerBarTs·상태) 같으면 재추가 안 함 |
| 상한 | 그룹당 보류 256(`MAX_CONFLICTS`) 초과 시 병합 **전체** 거절 `store-bound` → 새 날짜도 저장 안 됨 (시험 (3)에서 재현) |
| 활성 값 | pending-review 는 기존값 유지, provisional-successor 만 대체값 사용 |
| 백업 | `backup/core.js` 가 두 키를 원문 그대로 왕복, 지문 불일치면 거절 (0730 (g) 시험) |
| 쌓이는 주원인(합성 근거) | 장중 반복 수신 → 당일 provisional 대체값이 매번 달라 pending 누적 (0730 2단계는 앞으로의 누적만 막음, 기존 기록 그대로) |

## 2. 새 모듈 `HASBenchConflictRepair.plan(storeRaw, legacyRaw, now, options)`

- 입력은 **원문 문자열만**(저장소 접근 코드 없음) → 원본 바이트 불변이 구조적으로 보장. 출력: `dryRun:true, applied:false, appliesTo:'simulated-copy-only'`.
- 먼저 `validateStore`+`readStore` 통과해야 함. 하나라도 이상(레거시 지문 변경·형식·중복 키·잘못된 상태·알 수 없는 종목) → **계획 없음(fail-closed)**, 부분 계획 없음.
- 분류 4가지:
  | 분류 | 조건 | 사본 적용 |
  |---|---|---|
  | `keep` | provisional-successor(정상 승계) | 그대로 |
  | `merge-duplicate` | pending 중 날짜·기존값·대체 종가·출처·finality 가 완전히 같고 수신시각(또는 providerBarTs)만 다른 것 → 가장 이른 수신 1건 유지 | **적용**(가격 정보 손실 없음) |
  | `replace-proposal` | 검증 달력 함수 true + 승인된 서로 다른 경로·서로 다른 원천 2개 이상 + 정규 종가·통화·시장 일치 + 기준시각 ≥ 정규 마감 + 근거끼리 허용오차(기본 0, 최대 0.5%) 일치 + 기존값/대체값 중 **한쪽만** 일치 | **미적용**(스키마 v2에 '검토 완료' 상태 없음 → 순태씨 승인·별도 마이그레이션 검토) |
  | `hold` | 그 외 전부: 장중 provisional(근거 있어도), 달력 없음/휴장, 근거 부족·불일치·모호(둘 다 일치)·둘 다 불일치, 허용오차 형식 오류 | 그대로 |
- 승인 경로 기본값 0개 → 기본 실행에서 교체 제안 0 (지피 price-meta CR-2와 같은 방식). 근거 항목의 자기 선언 upstream 무시. **경로 문자열은 호출자가 붙이는 값이므로 실제 수집 경로와 인증 결합 안 됨 — 실연동 전 승인 경로 추가 금지.**
- 사본 검사: 사본이 `validateStore` 통과 + 세 종목 활성 가격 배열이 원본과 **완전히 동일**해야 함(아니면 실패). 레거시 지문 전후 동일.
- 비교 보고: 종목별 전/후 관측 수·보류·승계·포화 여부·여유, 행동마다 날짜·기존/대체 종가·차이 %·출처·finality·사유.
- 되돌리기: `undo.restoreRaw`(원래 V2 원문)·지문 + `expectCurrentFingerprint`(사본 지문 — 복원 직전 현재 원문이 이와 같은지 확인). 레거시는 건드리지 않음.

## 3. 시험 `tests/benchmark-conflict-repair.test.cjs` (9건, 합성만)

| # | 확인 |
|---|---|
| 1 | 원본 문자열 불변, 같은 입력 2회 결과 deepEqual, 사본 재실행 시 추가 병합 0·동일 원문(idempotence), 활성 가격 동일 |
| 2 | 보류 순서 뒤집어도 행동·건수 동일, 대표 = 가장 이른 수신 |
| 3 | 장중 200회 + 복제로 256 포화 → 기존 병합 `store-bound` 거절 재현 → 계획: 중복만 병합해 여유 확보, 장중 미확정 ≥190건 hold, 교체 제안 0, 활성 가격 동일 |
| 4 | fail-closed 5종(레거시 1바이트 변경, 중복 키 JSON, 비JSON, 잘못된 상태, 알 수 없는 종목) + 객체 입력·잘못된 now 거절 |
| 5 | 교체 제안 조건: 달력 없음/오류/휴장, 승인 경로 0, 통화·시장·가격종류·마감 전 기준시각·같은 경로·미승인 경로·다른 날짜·다른 종목·NaN, 같은 원천, 근거 불일치, 둘 다 불일치, 허용오차 0.0051/1/음수/∞/NaN/문자열/null → 전부 hold. 조건 충족 시 existing/alternative 선택 제안이지만 사본 원문 = 원본(미적용) |
| 6 | 0.1% 차이 보류에 근거가 양쪽 모두 0.5% 안 → `evidence-ambiguous` hold, 장중 provisional 은 근거 있어도 hold |
| 7 | `ids:['SPY']` 계획 시 QQQ 그룹 바이트 동일·행동 0, 계좌 키 포함 합성 저장소 백업 생성 결과 계획 전후 동일(쓰기 함수 호출 시 예외 → 호출 0) |
| 8 | 사본이 `backup/core` parse·preview 통과(쓰기 0), undo 원문·지문 일치, 레거시 지문 전후 동일 |
| 9 | 모듈에 localStorage·fetch·타이머·GAS 코드 없음, `portfolio_v5.html` 미로드, export 동결 |

- 전체: `NODE_PATH=<jsdom> node --require ./tests/lib/no-network.cjs --test tests/*.test.cjs` → **2258 중 2256 통과 / 0 실패 / 2 skip**(기존 DST skip). `node tools/scan-secrets.cjs` findings 0.
- 처음 실행 때 `daily-repair-protection`·`kis-auth-independent` 2건이 '미검토 보호 소스 추가'로 실패 → `live-data-pins.json` addedRuntimeFiles 에 새 파일 해시 1줄 추가로 해결(price-meta와 같은 방식).
- 화면 변경 없음 → Playwright 해당 없음(합성 시험 화면도 만들지 않음 — 실행 버튼 금지 조건상 계획 출력만으로 충분하다고 판단).

## 4. 미완료·미검증

- 실제 SPY·QQQ·KS200 보류 건수와 구성(장중 provisional 비율, 복제 비율)은 **미확인** — 실제 기록 미접근. 합성 근거상 실제 256건 대부분은 장중 provisional(서로 다른 종가)이라 **중복 병합만으로는 많이 줄지 않을 가능성**이 높음(미검증).
- 공식 거래 달력·조기폐장, 독립 시세 경로 없음 → 실제 실행 시 `replace-proposal` 0.
- 0730 2단계(`8fa6c11`)와 독립: 이 브랜치는 main 기준이라 장중 미저장 코드 미포함. 코드 파일 겹침 없음. 단 price-meta 브랜치도 `live-data-pins.json` addedRuntimeFiles 같은 위치에 1줄을 추가하므로 둘 다 반영 시 그 줄만 단순 충돌(두 줄 모두 유지로 해결).

## 5. 순태씨 결정 필요 (지피 검토 뒤)

1. 실제 정리를 할지: 지금 구조로는 장중 provisional 보류를 **지울 근거가 없어 hold** 됨. 256 상한을 실제로 풀려면 ① "장중 provisional 보류는 다음 날 마감 후 값이 들어오면 보관함으로 옮김" 같은 새 규칙(가격 삭제 아님, 별도 보관)과 스키마 변경, 또는 ② 공식 달력·독립 종가 경로 확보 중 하나를 정해야 함.
2. 실제 기록에 적용(갤럭시에서 사본 계획만 먼저 보기 포함)은 별도 승인.
