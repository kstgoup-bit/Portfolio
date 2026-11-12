# 클로 보고서 위치 안내 (다비용)

클로(Claude)의 검토·요청 보고서는 이 폴더(`docs/team/`)에 모읍니다. 날짜가 파일명 끝에 있습니다.

## 협업 약속
- `COLLAB-PROTOCOL.md` — 다비↔클로 정기 깃허브 협업 규칙(브랜치·보고서·승인). **작업 전 필독.**

## 최신 (2026-11-12)
- **15:25 지피 검토용**: 400종목 곡소리 0b 단위 READY_FOR_REVIEW — [CLAUDE-LATEST.md](CLAUDE-LATEST.md), [CLAUDE-DEV-UNIVERSE-SCREEN-20261112.md](CLAUDE-DEV-UNIVERSE-SCREEN-20261112.md)
- **15:05 400종목 곡소리 보완 0b**: 운영 실제 모드에 진입 링크, 문구 정정, 한국시간·한국어 사유, 산출물 제거(시험 1973 통과/0 실패, 360/390/430 확인, 아직 WIP·운영 미반영) — 같은 브랜치 `e50f710`
- **14:15 400종목 곡소리**: 다비 제출 `719692c` 이어받아 검토(시험 통과, 보완 6건, 공식 목록 미확보) — 브랜치 `work/claude-universe-screen-20261112`의 `CLAUDE-DEV-UNIVERSE-SCREEN-20261112.md`
- **14:00 협업 상대 교체**: 다비 → 지피(ChatGPT). 지시서 `GPT-ORDER-*`(STATUS: READY_FOR_CLAUDE) / 클로 결과 `CLAUDE-DEV-*`(STATUS: READY_FOR_REVIEW) — [COLLAB-PROTOCOL.md](COLLAB-PROTOCOL.md). 그래프 안내 문구 운영 반영 `db9f465`
- **13:45 역할 변경**: 클로가 매시간 개발, 다비는 교차 검토 — [COLLAB-PROTOCOL.md](COLLAB-PROTOCOL.md), 진행 상황 [CLAUDE-WORKLOG.md](CLAUDE-WORKLOG.md)
- `CLAUDE-REVIEW-DAVI-REPLY-20261112.md` — 다비 검토 회신: 차트 문구 계좌별 수정(브랜치 `work/claude-chart-caption-20261112`, 운영 승인 대기), 데이터·SW 롤백 상태
- `SW-ACTIVATION-REVIEW-20261112.md` — 활성화 정체는 시험 관찰 간섭 정황(passive 10/10 통과), rollback 확인 필요. 원로그는 클로 브랜치 evidence-sw-claude/activation
- `CHART-NAMING-20261112.md` — 이름 규칙("곡소리"·"환호성") + 해외·연금·전체 그래프 기준지수 선 복원(`1e6deb4`)
- `SW-FULL-BROWSER-REVIEW-20261112.md` — 42자산 실제 앱 SW 시험: 두 탭 닫은 뒤 활성화 정체 10회 중 6회(증거는 클로 브랜치 evidence-sw-claude)
- `SW-RACE-REVIEW-20261112.md` — 클로 하니스 오류 인정, 다비 수정 하니스 실제 Chromium 10/10 통과
- `UNIVERSE-SCREEN-REQUEST-20261112.md` — **다음 작업 1순위**: 400종목(코스피200 + 미국 200) 곡소리 레이더, GAS 야간 계산, AI 의견 표시 위치
- `SW-LAB-BROWSER-REVIEW-20261112.md` — (철회됨: 하니스 오류 — SW-RACE-REVIEW 참고)
- `SUPPORTED-SYMBOLS-REVIEW-20261112.md` — 미지원 종목 격리 검토·운영 반영(`c7de558`)
- `LIVE-DATA-SW-REVIEW-20261112.md` — 실제 데이터 1단계 검토·운영 반영(`90886f9`), 후속 요청
- `SPEED-MINIMAL-REVIEW-20261112.md` — 표 계산 최소안 검토·운영 반영(`c816903`)
- `DATA-CONNECT-STAGE1-REQUEST-20261112.md` — 실제 데이터 연결 요청, 확신 종목(QTOP·MSFT·AVGO 등 25%/그 외 10%)

## 2026-11-11
- `RELEASE-DEPLOYED-20261111.md`, `RELEASE-CANDIDATE-REVIEW-20261111.md`, `SPEED-REVIEW-20261111.md` 등

순태씨 결정 사항은 각 보고서의 "순태씨 결정" 절에 기록합니다.
