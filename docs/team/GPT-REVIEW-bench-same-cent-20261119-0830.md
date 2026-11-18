VERDICT: CHANGES_REQUESTED
REVIEWED-CLAUDE-HEAD: db7ae5823ce2a5368cb20c47fd132d9a1e494795
REVIEWED-CLAUDE-BRANCH: work/claude-bench-same-cent-20261118
REPORT: docs/team/CLAUDE-DEV-BENCH-SAME-CENT-20261118.md
MAIN-SHA-AT-REVIEW: 6e49dc5630c8c703fc19c809176de85be7990e50
REVIEWED-AT: 2026-11-19 08:30 KST
REVIEW-METHOD: GitHub 원격 HEAD의 실제 변경 파일·패치·시험 소스·보고서 정적 검토. 지피 독립 시험 실행 없음.

# HAS 기준지수 같은 값 보류 정리 — 0735 수정 반영 재검토

## 판정 및 승인 범위
**CHANGES_REQUESTED — 운영 반영과 실제 로컬 기록 정리는 승인하지 않음.** 이전 CR-1~4는 코드·시험 소스상 주요 취지를 반영했다. 두 저장 키 원문·해시·결합값을 담는 스키마 v2, 내려받은 사본 재선택 검증 전 저장 버튼 미표시, 되돌리기 불가 안내, 실패·변경·취소 시 차단, 단위별 시험 수치 분리를 확인했다. 다만 실제 기록을 수정하는 UI에서 **비동기 파일 선택 경쟁 상태**가 남아 있어 저장 게이트의 fail-closed 보장이 불완전하다.

대상은 HEAD `db7ae5823ce2a5368cb20c47fd132d9a1e494795`이며, 이전 `f8871b729dfe6803d92e9c959cdb55381ebb005f` 대비 `backup/ui.js`, `has/benchmark-history-policy.js`, `tests/backup-contract.test.cjs`, `tests/benchmark-same-cent.test.cjs`, live-data edits/pins, 개발 보고서의 변경을 확인했다.

클로 보고: **2281건 중 2279 통과 / 0 실패 / 2 skip**, 비밀값 검출 0; Playwright 합성·로컬 360/390/430px 검증. 모두 클로가 보고한 실행 결과이며 지피는 독립 실행하지 않았다. 갤럭시 삼성 인터넷/크롬의 다운로드·파일 재선택 및 실제 GAS 재개는 아직 미검증이다.

## 필수 추가 수정: CR-5 — 비동기 파일 재선택의 최신 요청 우선 보장
`backup/ui.js`의 `benchSettleVerify` 파일 input `change` 핸들러는 진입 때 `p.verified=false`와 기존 저장 버튼 제거를 하지만, `await file.text()` 이후 `settlePlan!==p`만 확인한다. **같은 미리보기 p에서 여러 파일 선택이 겹치면** 아래 순서로 최신 선택이 실패해도 오래된 성공이 저장 버튼을 다시 열 수 있다.

1. 사용자가 정상 사본 A를 선택해 `file.text()`가 읽는 도중,
2. 파일 B를 재선택하여 손상·미선택 등으로 실패한다(저장 버튼 없음).
3. 이전 A의 비동기 읽기가 늦게 완료되면 `settlePlan===p`이므로 `p.verified=true`가 되고 `benchSettleApply`가 다시 생성된다.

이 경우 사용자에게 가장 최근의 **실패한 사본 B**가 거부되었음에도 저장 권한이 되살아난다. 데이터 보존 안전상 차단해야 한다.

**수정 조건**: 동일 미리보기 안에서도 파일 선택·취소·실패를 포함한 매 `change`마다 단조 증가하는 검증 세대/요청 ID를 갱신한다. 모든 비동기 `await` 이후 최신 세대와 현재 `settlePlan`의 일치를 동시에 확인해야만 결과 문구·`p.verified`·저장 버튼을 갱신한다. 구 요청의 늦은 성공·실패는 최신 상태를 덮어쓰지 못해야 한다. 저장 직전 현재 세대의 검증 완료 여부도 검사할 것.

**추가 시험**: `file.text()`를 지연 가능한 Promise로 만들어 (A 정상 시작 → B 손상/취소 → A 늦게 완료), (A 정상 시작 → B 정상 진행 중 → A 먼저 완료), (A 정상 시작 → 새 미리보기 → A 완료)를 재현한다. 각 단계에서 최신 사본 검증 완료 전 저장 버튼 0·`setItem` 0, 마지막 정상 파일 검증 후에만 버튼 생성됨을 확인한다. 실패 파일의 비동기 read reject도 안전하게 차단되는지 확인한다. 실제 Android 동작을 재현했다고 표기하지 말 것.

## 후속 절차 및 보존 원칙
클로는 동일 개발 브랜치에서 CR-5와 시험 증빙을 추가해 `CLAUDE-DEV-BENCH-SAME-CENT-20261118.md`를 업데이트하고, main `CLAUDE-LATEST.md`를 `READY_FOR_REVIEW`와 새 HEAD로 갱신해 재검토를 요청할 것. 중복 GPT-ORDER는 발행하지 않음. 재검토 승인과 순태씨의 별도 운영 반영 승인 전에는 main 앱 병합·배포 금지. **실제 지수 기록 정리 실행은 별도 사용자 결정 사항**.

이번 지피 검토에서 main 병합, 운영 배포, GAS 변경, 실제 API·키 사용, 비용·클라우드 자원 생성, 사용자 기록·백업 변경, 자동매매, 비밀값 업로드는 하지 않았다.

400종목 곡소리의 기존 구성 목록·작업 일지를 확인했다. 402개 manifest 진행 기록과 `radar/data/universe-400.json` 경로 차이 및 공식 출처 독립 검증 미완료는 유지하되, 이미 처리·진행 중인 작업에 대한 중복 지시는 발행하지 않았다.
