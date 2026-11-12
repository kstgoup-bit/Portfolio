# 서비스워커 연구 후보(c7de558 재기준) — 실제 Chromium 수명주기 시험 결과 (클로 → 다비)

작성: 클로 / 2026-11-12 / 브랜치 `work/has-sw-lab-claude-verify-20261112`

## 1. 적용
- main `c7de558`에 `HAS-sw-lab-c7de558-additive.patch` 적용 성공. 운영 파일 변경 0(docs/evidence/tests만).

## 2. 다비가 실행 못 한 `tests/sw-speed-lab/browser-lifecycle.cjs`를 실제 Chromium(1243, headless)으로 실행
- 통과한 부분(첫 실행 기준): 구 SW 제어 → 후보 waiting 진입 → **대기 중 구 컨트롤러 유지** → 다른 캐시(`synthetic-unrelated`) 보존 → 후보 캐시가 내부 키만 사용 → 탭 종료 후 후보 활성화 → 새 탭에서 후보 제어(`syntheticPinned==='B'`) → **오프라인 재로드 정상**.
- 실패: 하니스 77행 `assert.ok(internalKey)` — 후보 캐시에서 `app.js` 내부 키를 못 찾음.
- 원인 조사:
  1. 하니스는 `waiting` 감지 직후 캐시 키를 읽음. 그 시점 키가 비거나 HTML 1개뿐, 1.5초 뒤에는 `portfolio_v5.html`, `app.js`, 완료 표식 3개 → **하니스 경합**(설치 중 읽음).
  2. 클로 보정(완료 표식이 생길 때까지 대기 후 읽기)을 넣어도 8회 중 **7회 실패**: 표식이 보였는데 직후 읽은 키 목록에는 HTML 1개만(표식도 없음). 같은 이름의 캐시 내용이 짧은 간격으로 달라짐 → 같은 세대의 **재설치(update 재검사)가 겹치거나 캐시가 재생성되는 경로**가 의심됨. 다비 문서의 "완료된 같은 세대는 재설치 때 덮어쓰거나 삭제하지 않음" 보장과 맞지 않을 수 있음. 원인 미확정.
  3. 1/8 회는 전 과정 PASS(부분 소실 복구·오프라인 거절·no-claim 포함).
- 기록: `evidence-sw-claude/lifecycle-runs.txt`. 하니스 보정·로그는 이 브랜치의 `tests/sw-speed-lab/browser-lifecycle.cjs`.

## 3. 판정
**운영 반영 불가 유지.** 실제 브라우저에서 설치 완료 시점의 캐시 내용이 일관되지 않게 관찰됨. 다비 요청: ① waiting 진입 시점에 `install` 대기 약속이 모든 put+verify+marker를 포함하는지 실브라우저 로그로 확인 ② `registration.update()` 재호출 시 같은 release 재설치 경로가 기존 완성 캐시를 지우거나 새로 여는지 확인 ③ 하니스는 표식+자산 수 일치까지 기다린 뒤 검사, 10회 연속 통과를 기준으로.

## 4. 우선순위
SW는 연구 과제로 유지. 다비 1순위는 400종목 곡소리 레이더.
