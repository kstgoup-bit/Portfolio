VERDICT: APPROVE
REVIEWED-CLAUDE-HEAD: 368e77c563c36bef89cb6ffda03b653047602685
REVIEWED-CODE-COMMIT: e763fee1b3075366f308c03df5668533e4ef6362
BASE-MAIN: 7957d16f737ccc3175c880740919970a3a48f2d6
REVIEWED-BRANCH: work/claude-remove-news-tab-20261115
REVIEW-TIME: 2026-11-15 16:31 KST
SCOPE: 뉴스 메뉴의 화면 진입 제거 및 관련 회귀 테스트 변경을 정적 검토한 APPROVE. 운영 배포·main 병합·실기기 검증 승인 아님.

# 위험관리 뉴스 메뉴 제거 — 교차검토

## 확인 근거
- main `docs/team/CLAUDE-LATEST.md`가 해당 브랜치를 READY_FOR_REVIEW로 지정. 보고서가 해당 지정 HEAD와 main에서 같은 blob SHA임을 확인.
- `2a0af56e3c1db11ab44b8a0d9a26afa1fc325e71...e763fee1b3075366f308c03df5668533e4ef6362` 실제 비교: 1커밋, 변경 파일 4개.
- `portfolio_v5.html`의 `switchTab('news')` 버튼 1개 제거 및 `TAB_GROUPS.risk`에서 `news` 제외를 실제 diff에서 확인. 나머지 패널·함수는 이번 범위에선 유지.
- `tests/risk-menu-harmonization.test.cjs`의 그룹 길이·버튼 뉴스 없음·`switchTab('news')` 진입 불가 검사, `tests/lib/live-data-edits.json` 2개 역방향 쌍, `tests/lib/live-data-pins.json` SHA 갱신을 확인.
- 브랜치에서 직접 조회한 `TAB_TO_GROUP` 생성 및 `switchTab`의 `if(!group)return;` 가드와 변경된 `TAB_GROUPS.risk` 정합성이 맞음.

## 판정
APPROVE — **위험관리 하위 탭의 뉴스 메뉴 제거(접근 경로 차단)만** 정적 검토 적합. 뉴스 패널과 `loadPortfolioNews` 함수의 완전 삭제 및 뉴스 수집 기능 전체 제거를 승인한 것은 아님.

클로 보고: 전체 2107건 중 2105 pass / 0 fail / 2 skip(DST); Chromium 360/390/430 가로 넘침·pageerror 0; 비밀값 0. 지피는 시험·Chromium·실제 갤럭시·운영 경로를 독립 재실행하지 않음. 보고 내용이 실제 실기기 동작을 보증하지 않는다.

## 후속 및 승인 필요
- 실제 갤럭시에서 하위 탭 활성화, 이전 뉴스 탭 사용 세션의 새로고침, 환호성 바로가기, 뒤로가기 동작은 운영 승인 전 별도 확인 권장.
- 뉴스 패널·함수 제거는 별도 범위 검토 후 결정. 현재 남겨 둔 코드가 다른 기능 호출을 방해하지 않는지 이후 통합 시험.
- **운영 배포·main 코드 병합은 순태씨 별도 승인 전 금지.** GAS, 실제 키/API, 비용·클라우드 자원, 투자기록·백업·자동매매에는 아무 승인 없음.
- 추가 GPT-ORDER 생성 불필요(직접 지시의 범위 완료).
