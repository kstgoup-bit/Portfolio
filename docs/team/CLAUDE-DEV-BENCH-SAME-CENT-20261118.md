STATUS: READY_FOR_REVIEW (지피 GPT-REVIEW-bench-same-cent-20261119-0830 CR-5 반영, 운영 미반영)
ORDER-ID: 순태씨 직접 결정 '규칙 A로 해' / '계속해' (2026-11-18) + GPT-REVIEW-bench-same-cent-20261119-0830 CHANGES_REQUESTED
BASE: db7ae5823ce2a5368cb20c47fd132d9a1e494795
HEAD: 68b440b329bbf34ee633345f56f8669e80291023
REVIEW-SCOPE: CR-5 커밋 68b440b — backup/ui.js(정리 전 사본 재선택 검증 세대 settleGen), tests/backup-contract.test.cjs(CR-5 경합 시험 1건 추가, settleInput 헬퍼를 최신 입력 기준으로), live-data edits·pin

## 4절. 지피 0830 CR-5 반영 (2026-11-19 09시 정각 실행)
- backup/ui.js: 모듈 변수 `settleGen`(단조 증가). [기준지수 같은 값 보류 정리] 누를 때마다, 파일 입력 `change`마다(미선택·실패 포함), 파일 선택 창 `cancel`마다 세대 +1. change 진입 시 기존 [정리 저장] 제거·`p.verified=false`·`p.okGen=-1`.
- `await file.text()` 이후 `settlePlan===p && settleGen===g` 둘 다 맞을 때만 계속, 검증 성공 직전 한 번 더 `settleGen===g` 확인 후에만 `p.verified=true; p.okGen=g`·문구·버튼 생성. 구 요청의 늦은 실패(catch)도 `settleGen===g`일 때만 문구를 바꿈(최신 문구를 덮지 않음).
- [정리 저장] 클릭 시 `settlePlan===p && p.verified===true && p.okGen===settleGen` 아니면 "사본 확인이 끝나지 않았습니다"·저장 0.
- 시험(합성 지연 Promise, 실제 Android 재현 아님): (1) A 정상 읽는 중 → B 손상 → A 늦게 완료: 버튼 0·B 실패 문구 유지·setItem 0, (1b) B 미선택, (1c) cancel 이벤트, (1d) B 읽기 reject 후 A 완료: 모두 버튼 0·저장 0, (2) A 정상 → B 정상 진행 중 → A 먼저 완료: B 완료 전 버튼 0, B 검증 후에만 버튼, (2b) 버튼 열린 뒤 재선택 시작 → 옛 버튼 사라지고 옛 참조 클릭도 저장 0, (3) A 읽는 중 → 새 미리보기 → A 완료: 버튼 0, 새 미리보기 사본 정상 선택 시에만 열림.
- 수정 전 코드(db7ae58의 backup/ui.js)로 새 시험을 돌리면 실패함을 확인(red→green).

### 시험 근거 (CR-5, HEAD 68b440b, 2026-11-19 09시대 KST)
- `NODE_PATH=<jsdom> node --require ./tests/lib/no-network.cjs --test tests/*.test.cjs` → 전체 2282 중 2280 통과 / 0 실패 / 2 skip. `node tools/scan-secrets.cjs` → findings 0.
- live-data 투영: backup/ui.js 역적용으로 기준 원본 재현 확인(beforeLiveDataBytes 통과), currentSha256 갱신.
- Playwright: 이번은 화면 배치·문구 스타일 변경 없음(비동기 로직만)이라 재실행 안 함. 이전 360·390·430 확인(db7ae58)은 정상 경로 기준.
- 미검증: 갤럭시 삼성 인터넷/크롬에서 파일 선택 창 `cancel` 이벤트 발생 여부·다운로드·재선택 실제 동작. cancel 이벤트가 없는 브라우저에서도 다음 change가 세대를 올리므로 fail-closed는 유지(취소만 하고 다시 안 고르면 진행 중이던 이전 정상 읽기가 버튼을 열 수 있음 — 그 파일은 사용자가 직접 고른 정상 사본이며 검증 통과분임).

## 순태씨 결정 필요
- 운영 반영('올려')은 지피 재검토 APPROVE 후. 실제 기록 정리 실행은 운영 반영 후 순태씨가 직접.

## 3절. 지피 0735 CR 반영 (2026-11-19 08시 정각 실행)
- CR-1: 정리 전 사본 schemaVersion 2 — keys.v5_benchHist / keys.v5_benchHistV2 각각 원문(raw)+fingerprint(sha256-utf16be-v1), binding.legacyFingerprint, plan.nextFingerprint·counts·removedCount, removed. purpose에 "전체 백업·일반 복원 파일 아님, 자동 복원 없음" 명시. 자동 복원 기능 구현 안 함(별도 승인). verifySettleArchive(text, legacyRaw, storeRaw, nextRaw, now): 형식·해시·현재 원문 일치·결합값·validateStore·이번 미리보기 nextRaw 일치 모두 통과해야 ok(fail-closed, 8MB 상한). 사본→검증→원상복구 왕복은 합성 로컬 자료로만 시험(바이트 동일·validateStore 통과).
- CR-2: 다운로드는 "시도했습니다(저장 여부 미확인)"로만 표시. [정리 저장]은 처음엔 없음 → [내려받은 사본 선택](파일 입력)으로 그 JSON을 다시 골라 verifySettleArchive + 두 키 현재값 재확인 통과 시에만 버튼 생성. 파일 미선택·손상·해시 불일치·다른 미리보기·크기 초과·읽기 불가 → 저장 0, 버튼 없음. 새 미리보기는 이전 확인 무효화. 저장 직전 두 키 변경 감지 유지.
- CR-3: 사본 확인 완료·confirm·저장 완료 문구에 "일반 '전체 복원 되돌리기'로는 이 정리를 취소할 수 없습니다. 정리 전 사본 파일을 따로 보관하세요(공개·업로드 금지)". 저장 실패 시: 기록 불변 확인되면 "저장하지 못했고 지수 기록은 그대로입니다", 불확실하면 "자동 복원하지 않음, 사본 보관 후 클로에게 알림". 실패 후 재실행은 미리보기부터 다시. 저장 후 재실행은 "정리할 같은 값 보류가 없습니다"(변경 0).
- CR-4 시험(아래 '시험 근거' 단위별 분리).

## 시험 근거 (단위별 분리)
- [CR 반영, HEAD db7ae58, 2026-11-19 08시대 KST] `NODE_PATH=<jsdom> node --require ./tests/lib/no-network.cjs --test tests/*.test.cjs` → 전체 2281 중 2279 통과 / 0 실패 / 2 skip. `node tools/scan-secrets.cjs` → findings 0. 신규·교체 시험: 재선택 파일 없음/JSON 손상/형식 다름/해시 불일치/원문 불일치/결합값 불일치/다른 미리보기 사본/크기 초과 → 저장 0; 다운로드는 '저장 여부 미확인' 표시·확인 전 버튼 없음; 확인 취소 → 저장 0; 새 미리보기 후 이전 버튼 무효; 확인 후 v5_benchHistV2·v5_benchHist 각각 변경 → 저장 0·invalidate 0; setItem 실패(Quota) → 기록 불변·안내; 사본 무결성·왕복 복구(정책 단위 + UI 단위).
- [CR 반영 Playwright, 합성·로컬] 360·390·430px: 미리보기 → 사본 다운로드(실제 download 이벤트) → setInputFiles로 재선택 → [정리 저장] 생성 → 저장 후 QQQ 3→1건, v5_benchHist 불변, 페이지 오류 0, 가로 넘침 0, 안내 글자 12px·#17263b. 외부 요청 route 차단.
- [2단위, HEAD f8871b7, 2026-11-18] 전체 2279 중 2277 통과 / 0 실패 / 2 skip (당시 보고).
- [1단위, HEAD 5ac1661, 2026-11-18] 전체 2277 중 2275 통과 / 0 실패 / 2 skip (당시 보고).
- 미검증: 갤럭시 실기기에서 다운로드·파일 선택(삼성 인터넷/크롬의 file.text 지원 포함)·confirm 동작, 운영 GAS 실제 수신 후 미국 지수 저장 재개.

## 순태씨 결정 필요
- 운영 반영('올려')은 지피 재검토 APPROVE 후. 실제 기록 정리 실행은 운영 반영 후 순태씨가 직접(사본 선택 단계 포함).

## 2단위 (설정 > 백업·복원 카드)
- [기준지수 같은 값 보류 정리] → planSameValueSettle 미리보기(건수) + 정리 전 사본 JSON 다운로드(format kst-bench-same-value-archive, originalV2Raw 전체 + removed) → 저장 안 함.
- [정리 저장 (사본 확인함)] → confirm → 미리보기 이후 v5_benchHist/V2 바뀌면 중단 → validateStoredValue → prepareRuntimeChange(invalidateBackupRuntime) → setItem → 읽어 확인 → refresh. 복원 차단 상태면 showBlocked.
- 순태씨 사본(읽기 전용, 로컬 Playwright): 360·390·430px 모두 미리보기 'QQQ 256→18건, SPY 256→14건' → 저장 후 KS200 20 / QQQ 18 / SPY 14, 페이지 오류 0.
- 효과 확인(node, 사본): 정리 전 SPY 11-17 새 봉 병합 = store-bound 거절 → 정리 후 수락(11-17 저장, 11-16 실제 다른 값 1건만 새 보류).
- 시험: 전체 2279 중 2277 통과 / 0 실패 / 2 skip, 비밀값 0.
- 미검증: 갤럭시 실기기 다운로드·confirm 동작, 운영 GAS 실제 수신 후 미국 지수 저장 재개.

## 변경
- mergeHistoryStore: 기존값과 새 값이 센트까지 같으면(Math.round(x*100) 동일) unchanged — 충돌 미생성. 단 provisional-successor 판정은 그대로(같은 값이어도 승계면 기존 흐름).
- planSameValueSettle(storeRaw, legacyRaw, now): DRY-RUN. status pending-review 이고 센트 동일인 보류만 뺀 nextRaw·removed·counts 반환. 정리 전/후 validateStore 통과 + 활성 가격(points) 완전 동일 검사, 다르면 fail. 저장·삭제 없음. mergeSeries(구 경로)는 변경 없음.
- 순태씨 백업 사본 실측: QQQ 256→18(238 정리), SPY 256→14(242), KS200 20→20(같은 값 2건은 successor라 유지). 활성 가격 변화 0.

## 원칙 변경 알림 (지피 확인 요청)
- 이전 계약 "0.0001 차이도 충돌(zero tolerance)"을 순태씨 결정으로 "센트 미만 차이는 같은 값"으로 바꿈. KS200(원 단위)도 동일 규칙 적용 — 사실상 영향 없음.
- 기존 시험 benchmark-repair(23·24·53행), daily-repair-backup(18행), daily-repair-independent(166행)의 '아주 작은 차이' 예시를 0.0001→0.01로 바꿔 '작지만 실제 다른 값은 보류' 의도 유지.

## 시험
- 전체 2277 중 2275 통과 / 0 실패 / 2 skip, 비밀값 0. 화면 변경 없음(Playwright 불필요).

## (1단위 당시 메모)
- 2단위: 설정 화면에 '기준지수 같은 값 보류 정리' — 미리보기(건수) → 정리 전 사본(빼낸 보류 JSON) 자동 다운로드 → 순태씨 확인 → 저장. 보관함 = 그 사본 파일(+순태씨 11-18 백업). 앱 안 별도 보관 키는 백업 허용 목록·스키마 변경이 필요해 하지 않음(지피 의견 요청).
- 미국 기준지수 11-16 이후 미저장(상한 256)은 2단위 적용 후에 풀림. 1단위만 운영 반영해도 상한이 차 있어 저장은 여전히 막힘.
