# 클로 보고서 위치 안내 (다비용)

클로(Claude)의 검토·요청 보고서는 이 폴더(`docs/team/`)에 모읍니다. 날짜가 파일명 끝에 있습니다.

## 협업 약속
- `COLLAB-PROTOCOL.md` — 다비↔클로 정기 깃허브 협업 규칙(브랜치·보고서·승인). **작업 전 필독.**

## 최신 (2026-11-20)
- 2026-11-20 23시 지피 2233 CR-1~4 반영: AI 자동매매 설계 r2(문서만) `work/claude-ai-trading-plan-20261120` `9d1f7d8` READY_FOR_REVIEW — hard stop 우량주 예외 철회·A 미확정·서명 재검증 계약·분할 조정 계약, 보고 CLAUDE-DEV-AI-TRADING-PLAN-20261120.md 대응표.
- 2026-11-20 22시 GPT-20261120-2132: AI 자동매매 장기 설계 교차검토(문서만) `work/claude-ai-trading-plan-20261120` `0dbe4b0` READY_FOR_REVIEW — 보고 CLAUDE-DEV-AI-TRADING-PLAN-20261120.md, 본문 AI-TRADING-ARCHITECTURE-20261120.md.
- 2026-11-19 09시 지피 0830 CR-5 반영: 규칙 A 정리 전 사본 재선택 경합 차단 `work/claude-bench-same-cent-20261118` `68b440b` 재검토 요청 — 보고 CLAUDE-DEV-BENCH-SAME-CENT-20261118.md(4절).
- 2026-11-19 08시 지피 0735 CR-1~4 반영: 규칙 A 같은 값 보류 정리 `work/claude-bench-same-cent-20261118` `db7ae58` 재검토 요청 — 사본 재선택 검증 후에만 저장, 보고 CLAUDE-DEV-BENCH-SAME-CENT-20261118.md(3절).
- 2026-11-17 순태씨 '올려': 백업 다운로드 폴백 `6d1f5be` 운영 반영(main `eb00c71`) — 보고 CLAUDE-DEV-BACKUP-DOWNLOAD-20261117.md, 지피 사후 검토 요청.
- 2026-11-17 15:1x 지피 1432 APPROVE: 기준지수 보류충돌 dry-run 정리 도구 `6774de0` 개발 단위 종료(운영 미로드·반영 대상 아님) — 실제 기록 진단·provisional 규칙은 순태씨 결정 대기.
- 2026-11-17 14:1x 지피 1332 CR-1~4 반영: 기준지수 보류충돌 dry-run 정리 도구 `work/claude-bench-history-repair-20261117` `6774de0` 재검토 요청 — 보고 CLAUDE-DEV-BENCH-HISTORY-REPAIR-20261117.md(0절).
- 2026-11-17 13:1x 지피 1234: LATEST 상태 포인터 정정 — 0940 bench-history-repair `0751aaa` READY_FOR_REVIEW(지피 검토 대기) · 운영 main `96f1509`는 별개 DEPLOYED.
- 2026-11-17 12:xx 지피 0940: 기준지수 보류충돌 dry-run 정리 계획 모듈·합성 시험 9건(운영 앱 미로드·적용 없음) `work/claude-bench-history-repair-20261117` `0751aaa` READY_FOR_REVIEW — 보고 CLAUDE-DEV-BENCH-HISTORY-REPAIR-20261117.md. 지피 1130 price-meta APPROVE(미로드 계약 한정) 기록.
- 2026-11-17 11:xx 지피 1030 CR-1~4 반영: 가격 메타 계약 v1.1(B 증거 발급제·경로/계보 독립·종가 마감·달력·허용오차 상한) `work/claude-price-meta-20261117` `893623b` READY_FOR_REVIEW — 보고 CLAUDE-DEV-PRICE-META-20261117.md 맨 위.
- 2026-11-17 10:xx 지피 0731: 가격 메타 계약 v1 설계·합성 시험 29건(운영 앱 미로드) `work/claude-price-meta-20261117` `af286d2` READY_FOR_REVIEW — 보고 CLAUDE-DEV-PRICE-META-20261117.md. 지피 0930 bench-conflict APPROVE → 순태씨 '올려' 대기.
- 2026-11-17 09:1x 지피 0830 CHANGES_REQUESTED 반영: (g) 복구·백업 호환 분리 합성 시험 6건 + H3 '기여 여부 미검증' `work/claude-bench-conflict-cause-20261117` `d93e9dc` 재검토 요청 — 보고 CLAUDE-DEV-BENCH-CONFLICT-CAUSE-20261117.md(맨 위).
- 2026-11-17 순태씨 '해': 지수 장중 당일 봉 미저장(보류충돌 누적 방지) `work/claude-bench-conflict-cause-20261117` `8fa6c11` — 지피 검토·'올려' 대기.
- 2026-11-17 08:2x 지피 0730: 기준지수 보류충돌 원인 1단계(장중·한국 아침 재수신 → 영구 pending, 출처 혼용, 256 상한 시 병합 전체 거절 확정·합성) `work/claude-bench-conflict-cause-20261117` `c9ae294` — 보고 CLAUDE-DEV-BENCH-CONFLICT-CAUSE-20261117.md.
- 2026-11-16 22:2x 순태씨 '올려': 띠 투자 > 현황 한정 운영 반영 main `37e464c` — 갤럭시 확인 대기.
- 2026-11-16 22:10 지피 2139 APPROVE: 띠 투자 > 현황 한정 `work/claude-brief-dashboard-only-20261116` `d47792a` — 순태씨 '올려' 대기. 보고 CLAUDE-DEV-BRIEF-DASHBOARD-ONLY-20261116.md(0절).
- 2026-11-16 20:5x 순태씨 직접 요청: 가격 신뢰도·오늘의 투자 판단 띠 투자 > 현황 한정 `work/claude-brief-dashboard-only-20261116` `d47792a` READY_FOR_REVIEW — 보고 CLAUDE-DEV-BRIEF-DASHBOARD-ONLY-20261116.md.

- 2026-11-16 19:11 순태씨 '올려': 오늘의 투자 판단·가격 신뢰도 띠 투자 탭 한정·위험관리 하위 메뉴 가로 스크롤 원복 → main `4617756` 운영 반영 — 보고 CLAUDE-DEV-BRIEF-INVEST-ONLY-20261116.md.
- 2026-11-16 18:57 순태씨 요청: 오늘의 투자 판단 투자 탭 한정·위험관리 하위 메뉴 가로 스크롤 원복 `work/claude-brief-invest-only-20261116` `83d94f9`, 순태씨 '올려' 대기 — 보고 CLAUDE-DEV-BRIEF-INVEST-ONLY-20261116.md.
- 2026-11-16 16:10 지피 1525 APPROVE — 위험관리 '오늘의 투자 판단' `work/claude-risk-briefing-20261116` `f63d62b`, 순태씨 '올려' 승인 대기 — 보고 CLAUDE-DEV-RISK-BRIEFING-20261116.md(0-d).
- 2026-11-16 15:20 지피 1430 CR-5(시장 식별자 KR/US를 엔진·보류 조언까지 전달, 누락 fail-closed, 실제 경로 통합 시험) 반영 `work/claude-risk-briefing-20261116` `f63d62b` 재검토 요청 — 보고 CLAUDE-DEV-RISK-BRIEFING-20261116.md(0-c).
- 2026-11-16 14:20 지피 1330 CR-3(같은 종목 전체 기록 검증·상충 보류·안전 키)·CR-4(판단 시각·basis 필수) 반영 `work/claude-risk-briefing-20261116` `5e4aed9` 재검토 요청 — 보고 CLAUDE-DEV-RISK-BRIEFING-20261116.md(0-b).
- 2026-11-16 13:25 지피 1230 CR-1(접힌 첫 화면 3카드)·CR-2(검증된 후보 fail-closed) 반영 `work/claude-risk-briefing-20261116` `978a2c0` 재검토 요청 — 보고 CLAUDE-DEV-RISK-BRIEFING-20261116.md(0절).
- 2026-11-16 12:25 GPT-20261116-1030 위험관리 '오늘의 투자 판단' 요약·같은 버튼 펼치기/접기 `work/claude-risk-briefing-20261116` `017e803` READY_FOR_REVIEW — 보고 CLAUDE-DEV-RISK-BRIEFING-20261116.md. SEC GAS 지피 1130 APPROVE(순태씨 GAS 승인 대기).
- 2026-11-16 11:10 지피 1030 CR-3(허가 상태 속성 이동·잠금 요청 끝까지)·CR-4(중단 기록 실패 fail-closed) 반영 `work/claude-sec-gas-20261116` `f3c5c78` 재검토 요청 — 보고 CLAUDE-DEV-SEC-GAS-20261116.md(0-b).
- 2026-11-16 10:10 지피 0930 CR-1(CIK 정합성)·CR-2(SEC 이용률 관문) 반영 `work/claude-sec-gas-20261116` `e4741d5` 재검토 요청 — 보고 CLAUDE-DEV-SEC-GAS-20261116.md(0-a).
- 2026-11-16 SEC 재무 GAS 초안 `work/claude-sec-gas-20261116` 검토 요청 — 보고 CLAUDE-DEV-SEC-GAS-20261116.md, 배포 안내 GAS-SEC-FUNDAMENTAL-DEPLOY-GUIDE-20261116.md.
- 2026-11-16 08:10 운영 반영: 위대한 기업 탭(읽기 전용·판단 보류) main `4b46fea` — 순태씨 '올려'.
- 2026-11-16 07:10 지피 2330 APPROVE: 위대한 기업 운영 탭 연결 `work/claude-great-companies-20261115` `09d39c5` — 순태씨 운영 반영 승인 대기. 보고 CLAUDE-DEV-GREAT-COMPANIES-20261115.md(0-j).
- 2026-11-15 23:10 지피 2230 CR 반영: 위대한 기업 다계좌 투자원칙 원문 내용 비교(공백·NFC 정규화, 원문 비노출)·productType 단독 company 승격 금지·상품 유형 상충 보류 `work/claude-great-companies-20261115` `09d39c5` 재검토 요청 — 보고 CLAUDE-DEV-GREAT-COMPANIES-20261115.md(0-j).
- 2026-11-15 22:20 지피 2130 CR 반영: 위대한 기업 탭 상품 유형 미확인 보류·다계좌 원칙 기록 상충 표시 `work/claude-great-companies-20261115` `46d05f7` 재검토 요청 — 보고 CLAUDE-DEV-GREAT-COMPANIES-20261115.md(0-i).
- 2026-11-15 21:55 순태씨 '진행': 운영 앱 '위대한 기업' 탭 연결(읽기 전용·지연 로딩, 현재 전 종목 판단 보류) `work/claude-great-companies-20261115` `dad6ac5` 검토 요청 — 보고 CLAUDE-DEV-GREAT-COMPANIES-20261115.md(0-h).
- 2026-11-15 21:10 지피 2030 APPROVE: 위대한 기업 시험 전용 UI `95af5fb`(정적 한정) → ORDER GPT-20261115-1326 1단계 종료. 운영 앱 탭 연결은 순태씨 결정 대기.
- 2026-11-15 20:25 지피 1927 APPROVE(엔진) → 위대한 기업 시험 전용 UI(has/great-companies-lab.html?test=1, 가상 자료 10개) `work/claude-great-companies-20261115` `95af5fb` 검토 요청 — 보고 CLAUDE-DEV-GREAT-COMPANIES-20261115.md(0-g).
- 2026-11-15 19:10 지피 1830: 위대한 기업 밸류에이션 보류 사유 구분(없음=미연결 / 31일 초과=기준일 오래됨 / 최신=입력 미검증) `work/claude-great-companies-20261115` `ddd4fd7` 재검토 요청 — 보고 CLAUDE-DEV-GREAT-COMPANIES-20261115.md(0-f).
- 2026-11-15 18:15 지피 1730: 위대한 기업 문구 수정(밸류에이션 미연결·미검증 시 '기업가치 유지' 등 확정 문구 금지, '본질가치 대비 평가 미완료' 표시) `work/claude-great-companies-20261115` `e0ee68e`(코드 `b453445`) 재검토 요청 — 보고 CLAUDE-DEV-GREAT-COMPANIES-20261115.md 0-e절
- 2026-11-15 17:20 **운영 반영** main `b362933`: 재무 필터 3단계 + 뉴스 메뉴·코드 완전 삭제(순태씨 승인) — 보고 CLAUDE-DEV-REMOVE-NEWS-TAB-20261115.md, 뉴스 코드 삭제분 지피 사후 검토 요청.
- 2026-11-15 17:10 지피 1630·1631: 위대한 기업 riskBasis 분리(고점권만으로 위험 경고 금지) `work/claude-great-companies-20261115` `ebe80ac`(코드 `cf88269`) 재검토 요청 · 뉴스 메뉴 제거 APPROVE(운영 승인 대기 — 재무 필터 3단계와 함께).
- 2026-11-15 16:20 지피 1531: 재무 필터 3단계 APPROVE(운영 승인 대기) · 위대한 기업 sellGate 반영 `work/claude-great-companies-20261115` `7a18a49`(코드 `09d1832`) 재검토 요청 · 뉴스 메뉴 제거 `work/claude-remove-news-tab-20261115` `368e77c`(코드 `e763fee`) — 보고 CLAUDE-DEV-REMOVE-NEWS-TAB-20261115.md.
- 2026-11-15 15:15 지피 1430·1431 수정 요청 반영 — 재무 필터 3단계 `work/claude-fundamental-filter-20261115` `ca5da5f`(코드 `7d4e2ff`) · 위대한 기업 엔진 `work/claude-great-companies-20261115` `4bdea47`(코드 `f3c25ac`), 재검토 요청.
- 2026-11-15 14:15 위대한 기업 엔진 단위(ORDER GPT-20261115-1326: 순수 평가 엔진 + 합성 시험 16건) `work/claude-great-companies-20261115` `72e12cd`(코드 `d2af13c`) — 보고 CLAUDE-DEV-GREAT-COMPANIES-20261115.md, 지피 검토 요청.
- 2026-11-15 13:50 위대한 기업 1단계 설계(문서) `work/claude-great-companies-20261115` `19d3f23` — 보고 CLAUDE-DEV-GREAT-COMPANIES-20261115.md · 재무 필터 3단계 화면 라벨 `eb98f24` — 보고 CLAUDE-DEV-FUNDAMENTAL-FILTER-20261115.md, 지피 검토 요청.
- 2026-11-15 12:10 재무 필터 2단계 지피 APPROVE(1130, 정적 검토 한정) `work/claude-fundamental-filter-20261115` `488cd55` — 보고 CLAUDE-DEV-FUNDAMENTAL-FILTER-20261115.md, 3단계(앱 표시)는 순태씨 결정 대기.
- 2026-11-15 11:10 재무 필터 지피 재검토 1030 반영(지정 HEAD 보고서 정합성 복원, 코드 변경 0) `work/claude-fundamental-filter-20261115` `488cd55` — 보고 CLAUDE-DEV-FUNDAMENTAL-FILTER-20261115.md, 지피 재검토 요청.
- 2026-11-15 10:20 재무 필터 지피 수정 요청 반영(태그 충돌 보류·직전 결산 신선도·검증 범위, 시험 7건) `work/claude-fundamental-filter-20261115` `a29dc43` — 보고 CLAUDE-DEV-FUNDAMENTAL-FILTER-20261115.md, 지피 재검토 요청.
- 2026-11-15 재무 필터 2단계(실제 SEC 5종목 대조·보정, 시험 6건) `work/claude-fundamental-filter-20261115` `e83bc9c` — 보고 CLAUDE-DEV-FUNDAMENTAL-FILTER-20261115.md, 지피 검토 요청.
- 2026-11-15 07:06 재무 필터 1단계(계산 모듈·시험 11건) `work/claude-fundamental-filter-20261115` — 보고 CLAUDE-DEV-FUNDAMENTAL-FILTER-20261115.md, 지피 검토 요청.
- 2026-11-15 06:30 곡소리 GAS 미설치 안내·환호성 조회 전 안내 문구 `work/claude-radar-msg-20261114` — 보고 CLAUDE-DEV-RADAR-MSG-20261114.md, 운영 승인 대기.
- 2026-11-14 15:10 운영 반영: 곡소리 Top10·환호성 보유종목 전용·미국 200·v2 manifest — 보고 CLAUDE-DEV-DEPLOYED-20261114.md, GAS 배포는 순태씨 직접(안내서 GAS-UNIVERSE-DEPLOY-GUIDE-20261114.md).
- 2026-11-14 14:00 곡소리 Top10(3+펼치기)·환호성 보유종목 전용 `work/claude-us200-20261114` — 보고 CLAUDE-DEV-US200-20261114.md 6절, 운영 승인 대기.
- 2026-11-14 12:50 미국 200 목록 확정(나스닥100 ∪ SPY 비중순, 기준일 11-12) 데이터+시험 `work/claude-us200-20261114` — 보고 CLAUDE-DEV-US200-20261114.md, 재무 필터 설계 초안 순태씨 결정 대기(앱·운영 변경 없음).
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
