STATUS: READY_FOR_REVIEW
ORDER-ID: 순태씨 대화 요청 2026-11-12 ("로그인이 너무 걸려" — 비밀번호 확인 반응·메인 표시 5~15초)
BASE: a74ee54 (main)   HEAD: 4b768bd3dde01acd558662c48e8fb4ae62bbd83a
BRANCH: work/claude-login-speed-20261112
REVIEW-SCOPE: `portfolio_v5.html` 시작 코드 6줄(`window load` → `DOMContentLoaded` 시작, load는 중복 방지 예비), `tests/lib/live-data-edits.json` 역방향 쌍 2개, `tests/lib/live-data-pins.json` 해시 1줄, 새 `tests/login-speed-browser.cjs`.

# 로그인(잠금 해제) 지연 개선 (2026-11-12 KST)

## 원인 (재현 근거)
- 잠금 화면의 확인 버튼·엔터 처리와 자료 불러오기·첫 화면 그리기가 모두 `window "load"`에 묶여 있었음. `load`는 Google Fonts 글꼴 파일(Noto Sans KR 등)까지 모두 받아야 발생 → 휴대폰 망에서 글꼴이 늦으면 **잠금 화면은 보이는데 확인을 눌러도 반응 없음**, 그 뒤 메인도 늦게 그려짐.
- Chromium 재현(CPU 4배 느리게, 글꼴 파일만 지연, 외부 요청 차단):

| 글꼴 지연 | 이전: 확인이 먹히는 시각 | 이후 |
|---|---|---|
| 3초 | 4.0초 | 1.1초 |
| 8초 | 9.0초 | 1.1초 |

- 글꼴 지연이 없을 때 비밀번호 확인 자체는 0.1초대, 첫 화면 그리기(renderAll) 0.04~0.06초 → 앱 계산은 원인이 아님.
- 갤럭시 실제 글꼴 다운로드 시간은 **미검증**(이 환경에서 fonts.googleapis.com 접속 불가). 서비스워커가 매번 `no-store`로 다시 받는 구조도 기여 가능성 있음(별도 과제).

## 바꾼 것
- 시작 함수 `hasStartApp()`을 HTML 해석 직후(DOMContentLoaded, 모든 defer 스크립트 실행 후)에 1회 실행. `load` 때는 이미 실행됐으면 아무것도 안 함. 실행 내용·순서(복원 보류 검사, 자료 불러오기, 1.5/2.5/3.5/7초 시세 갱신)는 그대로.
- 불꽃 애니메이션·서비스워커 등록은 기존대로 load 이후.

## 시험
- 전체 `node --require ./tests/lib/no-network.cjs --test tests/*.test.cjs`: 1961 중 1959 통과 / 0 실패 / 2 skip(DST TZ 전용).
- `node tools/scan-secrets.cjs`: findings 0.
- 새 `tests/login-speed-browser.cjs`(360/390/430, 글꼴 8초 지연): 잠금 해제 0.37~0.46초, 해제 시점 readyState=interactive(글꼴 대기 중), load 후 재잠금·재실행 없음, 가로 넘침 0, pageerror 0. 이전 main에서는 이 시험이 시간초과로 실패(차이 확인).
- 기존 브라우저 묶음: galaxy-test-stage26·gas-freshness-stage28 통과. protection-browser-stage24(2건)·records-integrity-stage26(5건)·restore-rehearsal-stage26(1건) 실패는 **main에서도 같은 개수로 실패**(백업 형식 관련 기존 문제, 이번 변경 무관). e2e-journey-stage20은 5분 제한 초과(브라우저 종료) — main 비교 안 함, 미검증.
- 투자기록·백업·실제 GAS·키 접근 없음(합성·로컬 서버만).

## 순태씨 결정 필요
- 운영 반영 여부("올려"). 지피 교차 검토 전.
