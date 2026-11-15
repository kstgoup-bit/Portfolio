STATUS: RELEASED (2026-11-15 17:20 KST, 순태씨 대화 승인 '올리고 뉴스 코드 아예 빼') · 뉴스 코드 완전 삭제분 지피 사후 검토 요청
ORDER-ID: 순태씨 직접 지시 · GPT-REVIEW-remove-news-tab-1631(APPROVE, 메뉴 2줄 범위)
BASE: 2a0af56e3c1db11ab44b8a0d9a26afa1fc325e71
HEAD: b362933a1ec89efbd0ba7cd9fe47828dfd81c837 (main 운영 병합) · 브랜치 704dd9d
REVIEW-SCOPE(사후): 368e77c...d3f5fcc — portfolio_v5.html 뉴스 패널·loadPortfolioNews/translateAndRender/renderNews·#panel-news CSS·tabColors.news 삭제, tests/lib/live-data-edits.json(+4쌍), live-data-pins, daily-repair-pins(removedExternalURLOccurrences +3), security-stage20(키 쿼리 5→4), risk-menu 단언. 병합 704dd9d = 재무 필터 ca5da5f(지피 1531 APPROVE) + edits/pins 충돌 해결.

# 운영 반영 (2026-11-15 17:20 KST)
- 순태씨 결정: 운영 반영 + 뉴스 코드 완전 삭제. 외부 호출 3곳 사라짐(news.google RSS, corsproxy.io, Gemini 번역 key 쿼리 1곳).
- 병합 main 전체 2141 중 2139 통과/0 실패/2 skip(DST), 비밀값 0. Chromium 360/390/430: 하위 탭 5개 이동 정상, 뉴스 흔적 0, HASFundamentalFilter 로드, 넘침 0, pageerror 0. Pages run 43693516024.
- 미검증: 실제 갤럭시.

STATUS: READY_FOR_REVIEW (뉴스 메뉴 제거 — 순태씨 2026-11-15 15:20 대화 지시, 진행 승인됨. 운영 반영은 순태씨 '올려' 후)
ORDER-ID: 순태씨 직접 지시(2026-11-15 15:20 "다음에 작업할 때 뉴스 메뉴 지우자")
BASE: 2a0af56e3c1db11ab44b8a0d9a26afa1fc325e71 (main)
HEAD: main CLAUDE-LATEST.md의 HEAD(이 보고서가 든 브랜치 최신 커밋) · CODE-COMMIT e763fee1b3075366f308c03df5668533e4ef6362
BRANCH: work/claude-remove-news-tab-20261115
REVIEW-SCOPE: 2a0af56...e763fee1b3075366f308c03df5668533e4ef6362 — portfolio_v5.html(2줄), tests/lib/live-data-edits.json(역방향 쌍 2개), tests/lib/live-data-pins.json(currentSha256 1개), tests/risk-menu-harmonization.test.cjs(기대값·새 단언).

# 뉴스 메뉴 제거 (2026-11-15 16시 정각 실행)

## 변경
- `portfolio_v5.html`: 위험관리 하위 탭의 '📰 뉴스' 버튼 1줄 삭제, `TAB_GROUPS.risk`에서 `"news"` 삭제. 버튼 순서와 목록 순서가 함께 바뀌어 하위 탭 강조(인덱스 기반)·환호성 강조 동기화 그대로 맞음.
- 1차 범위: `#panel-news` 패널과 `loadPortfolioNews()`는 남김(화면 진입 경로 0개라 보이지 않음). 다른 호출처 없음 확인(버튼·패널 내부만). 코드 정리(삭제)는 순태씨 원하면 다음 단위.
- 역방향 쌍 2개로 원본 재현 확인(역적용 SHA = main a1c1c2ea…), currentSha256 → 83220326….

## 시험
- 전체 2107 중 2105 통과/0 실패/2 skip(DST), 비밀값 0.
- risk-menu 시험: 위험관리 목록 = 종목분석·위험계·15계명·곡소리·체험·AI 참모·매매 점검, 버튼에 뉴스 없음, switchTab('news')는 이동하지 않음(활성 패널 유지).
- Chromium 360/390/430: 하위 탭 7개·뉴스 없음, 15계명/곡소리 강조 정상, 가로 넘침 0, pageerror 0, 뉴스 패널 비활성(외부 요청 차단, 잠금 화면은 확인용으로만 숨김).

## 미검증·결정
- 실제 갤럭시 확인 안 함. 기존에 뉴스 탭을 보던 중이면(같은 세션) 새로고침 후 첫 하위 탭으로 감.
- **순태씨 결정**: 운영 반영 여부('올려'), 남은 뉴스 패널·함수 코드 완전 삭제 여부.
