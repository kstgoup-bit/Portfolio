STATUS: READY_FOR_REVIEW (1단위: 정책 + dry-run, 화면·실제 기록 변경 없음)
ORDER-ID: 순태씨 직접 결정 '규칙 A로 해' (2026-11-18, 진단 보고 docs/team/CLAUDE-DIAG-BENCH-BACKUP-20261118.md)
BASE: d9e7c16d33ef033db404999ef8d4de1b46e05bc1
HEAD: 5ac1661bc12c6723eb3a9be1485d806e6a9b91a8
REVIEW-SCOPE: has/benchmark-history-policy.js sameCent·mergeHistoryStore 1줄·planSameValueSettle, tests/benchmark-same-cent.test.cjs(신규 4), 기존 시험 4곳 0.0001→0.01, live-data edits 3쌍·pin

## 변경
- mergeHistoryStore: 기존값과 새 값이 센트까지 같으면(Math.round(x*100) 동일) unchanged — 충돌 미생성. 단 provisional-successor 판정은 그대로(같은 값이어도 승계면 기존 흐름).
- planSameValueSettle(storeRaw, legacyRaw, now): DRY-RUN. status pending-review 이고 센트 동일인 보류만 뺀 nextRaw·removed·counts 반환. 정리 전/후 validateStore 통과 + 활성 가격(points) 완전 동일 검사, 다르면 fail. 저장·삭제 없음. mergeSeries(구 경로)는 변경 없음.
- 순태씨 백업 사본 실측: QQQ 256→18(238 정리), SPY 256→14(242), KS200 20→20(같은 값 2건은 successor라 유지). 활성 가격 변화 0.

## 원칙 변경 알림 (지피 확인 요청)
- 이전 계약 "0.0001 차이도 충돌(zero tolerance)"을 순태씨 결정으로 "센트 미만 차이는 같은 값"으로 바꿈. KS200(원 단위)도 동일 규칙 적용 — 사실상 영향 없음.
- 기존 시험 benchmark-repair(23·24·53행), daily-repair-backup(18행), daily-repair-independent(166행)의 '아주 작은 차이' 예시를 0.0001→0.01로 바꿔 '작지만 실제 다른 값은 보류' 의도 유지.

## 시험
- 전체 2277 중 2275 통과 / 0 실패 / 2 skip, 비밀값 0. 화면 변경 없음(Playwright 불필요).

## 미완료 (다음 단위, 별도 승인)
- 2단위: 설정 화면에 '기준지수 같은 값 보류 정리' — 미리보기(건수) → 정리 전 사본(빼낸 보류 JSON) 자동 다운로드 → 순태씨 확인 → 저장. 보관함 = 그 사본 파일(+순태씨 11-18 백업). 앱 안 별도 보관 키는 백업 허용 목록·스키마 변경이 필요해 하지 않음(지피 의견 요청).
- 미국 기준지수 11-16 이후 미저장(상한 256)은 2단위 적용 후에 풀림. 1단위만 운영 반영해도 상한이 차 있어 저장은 여전히 막힘.
