# 클로 보고서 위치 안내 (다비용)

클로(Claude)의 검토·요청 보고서는 이 폴더(`docs/team/`)에 모읍니다. 날짜가 파일명 끝에 있습니다.

## 협업 약속
- `COLLAB-PROTOCOL.md` — 다비↔클로 정기 깃허브 협업 규칙(브랜치·보고서·승인). **작업 전 필독.**

## 최신 (2026-11-14)
- **07:10 정각 확인**: 새 지피 파일 없음(마지막 11-13 11:33, 사후 검토 4건 미응답) — 코드 변경 없음, 순태씨 1회 알림. 위 4건(지수 진단 접기·ETF 새로고침·기간 버튼·자본배분 시험 페이지) 사후 검토 요청 유효.

## 2026-11-13
- **22:55 지수 진단 문구 접기(검토 요청)**: 평소 한 줄 요약, 상세는 접음 — [CLAUDE-DEV-BENCH-DIAG-FOLD-20261113.md](CLAUDE-DEV-BENCH-DIAG-FOLD-20261113.md)
- **22:25 ETF 새로고침 버튼 반응(검토 요청)**: 누르면 즉시 '확인 중' 표시 — [CLAUDE-DEV-BENCH-REFRESH-FEEDBACK-20261113.md](CLAUDE-DEV-BENCH-REFRESH-FEEDBACK-20261113.md)
- **21:45 기간 버튼 반응 개선(검토 요청)**: 누르면 즉시 색 변경·그래프 흐림, 그리기는 다음 프레임 — [CLAUDE-DEV-PERIOD-TAP-20261113.md](CLAUDE-DEV-PERIOD-TAP-20261113.md)
- **21:15 자본배분 비교 시험 페이지 운영 반영(순태씨 승인)**: main 병합 `6bd2af1`, 앱 본체 연결 없음, 전체 2024 통과/0 실패/2 skip — [CLAUDE-DEV-CAPITAL-ALLOCATION-20261113.md](CLAUDE-DEV-CAPITAL-ALLOCATION-20261113.md)
- **12:00 자본배분 비교 1단계 종료(지피 APPROVE, 정적 검토 한정)**: 합성 엔진 + `?test=1` 시험 화면 — [CLAUDE-DEV-CAPITAL-ALLOCATION-20261113.md](CLAUDE-DEV-CAPITAL-ALLOCATION-20261113.md), 브랜치 `work/claude-capital-allocation-20261113` `2287445`, main 병합은 순태씨 승인 대기
- **11:10 시험 게이트 화면 지피 수정요청 반영(재검토 요청)**: 종목명 없는 부분 작성 줄·빈 첫 줄 매도 → 추가 정보 필요(줄 번호 표시), 조용한 제외 없음 — [CLAUDE-DEV-CAPITAL-ALLOCATION-20261113.md](CLAUDE-DEV-CAPITAL-ALLOCATION-20261113.md), 브랜치 `work/claude-capital-allocation-20261113` `2287445`, 운영 대상 아님
- **10:10 자본배분 비교 시험 게이트 화면(지시서 4절)**: 별도 페이지 `?test=1`, 메모리 입력·대안 카드 A~E, 저장·전송 0 — [CLAUDE-DEV-CAPITAL-ALLOCATION-20261113.md](CLAUDE-DEV-CAPITAL-ALLOCATION-20261113.md), 브랜치 `work/claude-capital-allocation-20261113` `fe874dc`, 지피 검토 대기(운영 대상 아님)
- **09:10 자본배분 엔진 지피 2차 수정요청 반영(재검토 요청)**: 한쪽만 있는 시세종류·기준시각, sale 형식 결함 → 추가 정보 필요 — [CLAUDE-DEV-CAPITAL-ALLOCATION-20261113.md](CLAUDE-DEV-CAPITAL-ALLOCATION-20261113.md), 브랜치 `work/claude-capital-allocation-20261113` `8516d5b`, 운영 대상 아님
- **08:10 자본배분 엔진 지피 수정요청 반영(재검토 요청)**: 후보 중복 상충·비정상 입력 보류·시각 형식 검사 — [CLAUDE-DEV-CAPITAL-ALLOCATION-20261113.md](CLAUDE-DEV-CAPITAL-ALLOCATION-20261113.md), 브랜치 `work/claude-capital-allocation-20261113` `321f8bb`, 운영 대상 아님
- **07:15 자본배분 비교 엔진 1단계(지피 지시 GPT-20261113-0024) 1단위 — 순수 계산·합성**: NVDA 매도대금 대안 A~E 비교 — [CLAUDE-DEV-CAPITAL-ALLOCATION-20261113.md](CLAUDE-DEV-CAPITAL-ALLOCATION-20261113.md), 브랜치 `work/claude-capital-allocation-20261113` `47d8533`, 지피 검토 대기(운영 대상 아님)
- **02:10 환율 재시도·기록 상태 요약·불필요 지수 요청 제거**: 해외 탭 수익률 전부 `-`의 원인(환율 1회 실패 후 재시도 없음) — [CLAUDE-DEV-FX-RETRY-20261113.md](CLAUDE-DEV-FX-RETRY-20261113.md), 브랜치 `work/claude-fx-retry-20261113` `d771447`, 운영 승인 대기

## 이전 (2026-11-12)
- **23:10 지피 잠금 멈춤 개선 사후 검토 APPROVE 기록**(정적 검토만) · 새 지시서 없음, 미국 원본(11-13) 대기 — [CLAUDE-LATEST.md](CLAUDE-LATEST.md)
- **22:10 지피 사후 검토 2건 APPROVE 기록**(서비스워커·불꽃놀이 제거, 정적 검토만) · 새 지시서 없음, 잠금 멈춤 개선 사후 검토 대기 — [CLAUDE-LATEST.md](CLAUDE-LATEST.md)
- **21:30 잠금화면 멈춤·로그인 후 느림 개선**(순태씨 요청, 21:40 운영 반영 완료) — [CLAUDE-DEV-LOCK-STALL-20261112.md](CLAUDE-DEV-LOCK-STALL-20261112.md)
- **21:10 지피 세션 캐시 검토 APPROVE 기록**(시험 전용 코드만, 운영 승인 아님) · 새 지시서 없음, 미국 원본(11-13) 대기 — [CLAUDE-LATEST.md](CLAUDE-LATEST.md)
- **20:50 잠금화면 불꽃놀이 제거**(순태씨 요청, 21:00 운영 반영 완료) — [CLAUDE-DEV-LOCK-FX-20261112.md](CLAUDE-DEV-LOCK-FX-20261112.md)
- **20:40 로그인 속도 2차(서비스워커)**(순태씨 요청, 20:33 운영 반영 완료) — [CLAUDE-DEV-SW-SPEED-20261112.md](CLAUDE-DEV-SW-SPEED-20261112.md)
- **20:10 뒤로가기·새로고침 세션 캐시(시험 전용)**(GPT-20261112-1930, 공개 core만·운영 저장 0, jsdom 12건·Chromium 360/390/430) — [CLAUDE-DEV-UNIVERSE-SCREEN-20261112.md](CLAUDE-DEV-UNIVERSE-SCREEN-20261112.md), 설계 [UNIVERSE-SESSION-CACHE-DESIGN-20261112.md](UNIVERSE-SESSION-CACHE-DESIGN-20261112.md)
- **19:10 로그인 지연 개선**(순태씨 요청, 19:53 운영 반영 완료) — [CLAUDE-DEV-LOGIN-SPEED-20261112.md](CLAUDE-DEV-LOGIN-SPEED-20261112.md)
- **19:00 #2 국내 201 동적 계약·오프라인 검증**(GPT-20261112-1830, coreCount 400/401, 합성 시험 10건, 미국 계약 불변) — [CLAUDE-DEV-UNIVERSE-SCREEN-20261112.md](CLAUDE-DEV-UNIVERSE-SCREEN-20261112.md)
- **18:00 #4 곡소리 화면 첫 진입 1회 조회·한국 기준일 캐시**(GPT-20261112-1730, 합성 시험 전용, 운영 자동 요청 0) — [CLAUDE-DEV-UNIVERSE-SCREEN-20261112.md](CLAUDE-DEV-UNIVERSE-SCREEN-20261112.md)
- **17:30 #3 GAS 야간 계산 저장소 초안**(GPT-20261112-1630, 합성 400 시험 12건, 실제 GAS 미변경) — [CLAUDE-DEV-UNIVERSE-SCREEN-20261112.md](CLAUDE-DEV-UNIVERSE-SCREEN-20261112.md)
- **16:55 코스피200 공식 스냅샷 201종목 저장**(순태씨 제공 KRX 파일, 미국 200은 아직 차단) — [CLAUDE-DEV-UNIVERSE-SCREEN-20261112.md](CLAUDE-DEV-UNIVERSE-SCREEN-20261112.md)
- **16:10 #1 차단 보고**: 공식 400종목 원본 미확보로 목록 미생성, 순태씨 취득 방안 결정 필요 — [CLAUDE-DEV-UNIVERSE-SCREEN-20261112.md](CLAUDE-DEV-UNIVERSE-SCREEN-20261112.md)
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
