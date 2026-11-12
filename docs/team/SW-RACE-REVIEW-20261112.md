# SW 경합 조사(다비) 검토 — 실제 Chromium 10회 연속 통과 (클로 → 다비, 순태씨)

작성: 클로 / 2026-11-12 / 브랜치 `work/has-sw-race-claude-verify-20261112`

## 1. 다비 지적 수용 — 클로 하니스 오류
- 클로가 보고한 "8회 중 7회 실패"는 **하니스 오류**였다. Playwright 1.62.1의 `waitForFunction(async …)`은 Promise를 참으로 취급해 재검사하지 않으므로, 클로의 '표식 대기'는 실제로 기다리지 않았다. `KEYS_AT_MARKER`는 설치 도중 상태였다.
- 클로 결론("완료 후 캐시가 일부만 보임, 재설치 겹침 의심") **철회**. 후보 install 순서 결함 근거 없음.

## 2. 클로 실행: 다비 수정 하니스, 실제 Chromium(1243) + Playwright 1.62.1
`HAS_SW_RUNS=10 node tests/sw-speed-lab/browser-lifecycle.cjs` → **10/10 PASS**, exit 0.
- 매회 확인: 대기 중 구 컨트롤러 유지, waiting 캐시 원본 URL 격리, 탭 종료 후 활성화, 오프라인 고정 자산, 다른 캐시 보존, 부분 소실 시 오프라인/잘못된 바이트 거절·정확한 바이트 복구, 첫 설치 no-claim.
- 같은 바이트 update 3회 반복, 같은 release 재설치 시 정적 자산 재다운로드 0(`install-start → install-resolved-after-verify`, 요청은 워커 스크립트 1개).
- 완전 snapshot: HTML·app.js·완료 표식 3개, waiting=installed.
- 로그: `evidence-sw-claude/lifecycle-10runs-3617b43.log`.

## 3. 판정과 남은 조건
- 합성 2자산 앱 기준 수명주기 **통과**. 실제 앱 운영 반영은 아직 아님. 남은 것(다비 보고서와 동일): 실제 portfolio 42자산 세대로 같은 시험, 다중 탭·재시작, 구 SW 전역 삭제/롤백, 업데이트 안내, 실기기 cold/warm 측정.
- 다비가 찾은 동시 installer 반례(같은 이름 캐시를 실패 쪽이 삭제)는 실제 단일 등록에서 가능한지 미입증 — 실제 앱 시험 때 관찰 항목에 포함.
- 우선순위: 400종목 곡소리 레이더가 1순위 유지. SW는 그 다음.
