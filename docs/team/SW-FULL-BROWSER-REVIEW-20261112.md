# SW 42자산 실제 앱 시험(다비 browser-full) — 클로 실제 Chromium 실행 결과

작성: 클로 / 2026-11-12 / 브랜치 `work/has-sw-full-claude-verify-20261112` / 기준 main `a6ab1cb`

## 1. 실행
- `HAS-sw-full-a6ab1cb-additive.patch` 적용, Chromium 1243 + Playwright 1.62.1, `tests/sw-speed-lab/browser-full.cjs`.
- 기본(lifecycle)·rollback 시나리오 모두 **같은 지점에서 실패**: "activation after BOTH old tabs close" 시간 초과.
- 그 이전 단계는 통과: 후보 설치 중 JS 503 → 후보 캐시 정리·기존 4캐시·타 캐시 보존, 정상 설치(43키), 두 탭 모두 legacy 유지, 첫 탭만 닫아도 후보 대기.

## 2. 재현·진단 (모두 실제 브라우저)
- 총 **10회 실행: 6회 실패, 4회 통과**(15초 기본·rollback 각 1회 실패 / 90초 대기 4회 중 3실패·1통과 / 진단·추적 4회 중 1실패·3통과). 90초를 기다려도 실패 — 느림이 아님. 통과 회차(통과 시 닫은 뒤 1,073ms에 활성화, 이후 전 항목 PASS: 43키·warm 정적 요청 0·합성 보존키 불변·프로필 재시작·외부 요청 0·페이지 오류 0).
- 실패 회차 추적(1.5초 간격): 두 탭을 닫은 뒤에도 **active=legacy(activated), waiting=candidate(installed) 그대로**, 새 워커 설치 없음, 서버에 새 요청 없음. 열린 페이지는 `about:blank`(프로필 기본)와 `/keeper.html`(범위 밖)뿐.
- 즉 후보 결함으로 캐시가 깨진 것이 아니라 **legacy 워커가 놓아주지 않아 활성화가 무기한 지연**됨. 원인 후보: ① 닫힌 앱 문서가 아직 클라이언트로 남음(언로드 지연) ② legacy 워커에 끝나지 않은 fetch 이벤트(응답이 오지 않는 요청)가 남아 Chromium이 활성화를 미룸. 어느 쪽인지 미확정 — 추정으로 결론 내지 않음.
- 증거: `evidence-sw-claude/full-default-15s.log`, `full-rollback-15s.log`, `full-90s-run1..4.log`, `full-trace-fail.log`(실패 추적), `full-trace-pass.log`(같은 조건 통과 회차: 닫은 뒤 1,069ms 활성화). 진단용 하니스 변경(활성화 시간 환경변수, TICK 추적)은 이 브랜치의 `browser-full.cjs`.

## 3. 의미
- 실제 폰에서 같은 현상이면 **새 버전이 대기 상태로 오래 남아 사용자가 계속 옛 버전을 쓰게 됨**(자료 손상은 아님). skipWaiting 미사용 설계의 실제 비용이므로 운영 전 반드시 해결·관찰 필요.

## 4. 다비 요청
1. 실패 회차에서 legacy 워커의 진행 중 fetch 이벤트(서버 미응답 요청)와 `clients.matchAll({includeUncontrolled:true,type:'all'})` 기록.
2. 앱이 닫힐 때 끝나지 않는 요청이 있는지(합성 GAS 비활성 경로·장기 대기 요청) 서버 측 미응답 목록 확인.
3. 해결 방향 검토: 업데이트 안내 + 사용자가 누르는 "새 버전 적용"(waiting에 SKIP 메시지) 방식 — 강제 claim 없이 갱신 정체를 사용자 선택으로 해소.
4. 10회 연속 통과를 운영 논의 기준으로 유지.

## 판정
운영 반영 불가 유지. 우선순위는 400종목 곡소리 레이더가 1순위.
