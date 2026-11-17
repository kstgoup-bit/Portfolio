VERDICT: APPROVE
REVIEWED-CLAUDE-COMMIT: 6774de0700c933a4cce853e4e65b50695d870bb0
ORDER-ID: GPT-20261117-0940
REVIEW-BASE-MAIN: ab9ce2d0c04c2c18fec02026ddd33cafa8a3d64a
REVIEW-TIME: 2026-11-17 14:32 KST
REVIEW-SCOPE: has/benchmark-conflict-repair.js, tests/benchmark-conflict-repair.test.cjs, tests/lib/live-data-pins.json, docs/team/CLAUDE-DEV-BENCH-HISTORY-REPAIR-20261117.md
EVIDENCE: GitHub main/지정 HEAD의 보고서·코드·시험을 정적으로 대조, 지정 코드 커밋 변경 파일 확인. 지피 독립 시험 실행 없음.

# 기준지수 SPY·QQQ 충돌 기록 dry-run 정리 도구 — 14:32 재검토

## 판정 범위
**APPROVE — 개발 브랜치의 미로드·합성 dry-run 모듈과 CR-1~4 보완만 승인.** 운영 앱 연결/데이터 복원·수정/실제 충돌 해결/시세 정확성/실배포는 승인하지 않는다.

## 작업 상태 대조
- main `docs/team/CLAUDE-LATEST.md` 최상단 `STATUS: READY_FOR_REVIEW`, REPORT `docs/team/CLAUDE-DEV-BENCH-HISTORY-REPAIR-20261117.md`, BRANCH `work/claude-bench-history-repair-20261117`, 지정 HEAD `6774de0700c933a4cce853e4e65b50695d870bb0`를 확인. 브랜치/메인 사본 보고서도 동일한 READY_FOR_REVIEW와 HEAD 기재.
- main의 `README-CLAUDE-REPORTS.md`, `COLLAB-PROTOCOL.md`, `CLAUDE-WORKLOG.md`, `UNIVERSE-SCREEN-REQUEST-20261112.md` 및 앞선 `GPT-REVIEW-bench-history-repair-20261117-1332.md` 확인. 처리된 `GPT-20261117-0940` 및 `GPT-20261117-1234` 중복 지시 불필요.
- 대상 코드 커밋의 변경 파일은 3개: `has/benchmark-conflict-repair.js`, `tests/benchmark-conflict-repair.test.cjs`, `tests/lib/live-data-pins.json`. 이번 코드 커밋에서 운영 앱, GAS, backup/core.js 파일은 변경하지 않음.

## 이전 CR-1~4 재검토
1. **CR-1 충족(정적)**: `usableEvidence`는 같은 승인 route/upstream이 동일 날짜에 서로 다른 종가를 제시하면 전체 근거 묶음을 `evidence-route-conflict`로 보류하고, 서로 다른 두 승인 원천이 있어야 제안을 허용한다. 신규 시험 (10)은 6순열·같은 상류의 다른 경로·마감 전 상충·미승인 경로 구분을 포함.
2. **CR-2 충족(정적)**: `dupKey`에 `existing` 전체와 `alternative`의 `id,receivedAt` 외 전 필드가 들어가 `providerBarTs/dateKind/adjustment` 차이는 중복으로 제거하지 않는다. `metadata-differs-not-merged` 감사 표시와 신규 시험 (11) 확인.
3. **CR-3 충족(정적)**: `strictIso`는 정규화 일치하는 밀리초 포함 UTC ISO만 허용하고 `closeMs <= asOf <= now`를 요구한다. `closeCalendar`는 거래일 `open:true`와 실제 마감 `closeMs`를 반환해야 하며, 시장 시간대의 날짜 및 미래 마감 여부를 검사한다. 시험 (12)은 미래/형식/마감 전후/조기폐장을 다룸. 단 공식 달력 자체의 진위는 검증한 것이 아님.
4. **CR-4 충족(클로 시험 소스 확인)**: 시험 (13)은 합성 계좌 네 개와 SPY/QQQ를 이용하여 `backup/core` `parse -> preview -> apply -> undo` 및 쓰기 실패 시 되돌리기를 점검하고 원문·비대상 종목·계좌·활성 가격 보존을 검사한다. 실제 사용자 백업에 수행한 것이 아님.

## 시험 증거와 잔여 한계
- 클로 보고: `node --require ./tests/lib/no-network.cjs --test tests/*.test.cjs` 총 2,281건 중 2,279건 통과 / 0건 실패 / 2건 skip; 해당 도구 합성시험 13건; 비밀값 스캔 0. **지피 독립 시험/브라우저/갤럭시 실행은 하지 않았다.** 화면 변경이 없어 Chromium 시각 시험은 범위 밖.
- `portfolio_v5.html`에서 해당 도구를 로드하지 않으며, 모듈에는 브라우저 저장소·API·GAS·백업 직접 쓰기 경로가 없음. `replace-proposal`은 사본에도 적용하지 않는다. `merge-duplicate`는 **합성 사본만** 병합하며 원본은 그대로.
- 공식 거래소 휴장/조기폐장 달력과 실제 독립 시세 공급 경로의 확인·인증된 결합이 아직 없음(기본 승인 경로 0개). 따라서 실제 사용 시 정규종가 교체 승인 근거가 되지 않는다. KR(KS200) 실근거 검증도 아직 없음.
- **SPY 충돌 256건 실제 복구/정리/포화 해소는 미수행**. 기존 장중 provisional 보류 다수는 근거 부족으로 hold가 유지되며, 사용자 결정 없는 자동 삭제·보관함 이관·가격 교체는 금지.
- 향후 실사용 계획에 앞서 사용자에게 `provisional` 기록의 보존·격리 규칙과 실제 기록 dry-run 진단 여부를 별도로 승인받고, 공식 출처·달력·되돌리기 안전성을 추가 검증할 것. 이 승인으로 실제 기록 실행을 추론하지 말 것.

## 결론 및 안전 경계
`GPT-20261117-0940`의 **읽기 전용 dry-run 및 합성 복원 검증 개발 단위**는 종료 가능. 추가 GPT-ORDER는 중복이므로 발행하지 않는다. 실제 충돌 정리·투자기록/백업 변경, `main` 병합, 운영 배포, GAS 변경, 키/API 사용, 비용·클라우드 자원, 자동매매는 모두 사용자 명시적 승인 전 금지.
