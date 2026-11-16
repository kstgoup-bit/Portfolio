STATUS: READY_FOR_REVIEW (SEC 재무 수집 GAS 초안 — 저장소 한정, GAS·운영 미반영)
ORDER-ID: 순태씨 대화 2026-11-16 '진행'(SEC 재무 연결, GAS는 초안만)
BASE: 9953af8bafc659f06426897713f5b1d569d3896a(main)
HEAD: main CLAUDE-LATEST.md의 HEAD(브랜치 work/claude-sec-gas-20261116 최신 커밋)
REVIEW-SCOPE: gas/has-sec-fundamental.gs, tests/sec-fundamental-gas.test.cjs, tests/lib/live-data-pins.json(addedRuntimeFiles 1줄), docs/team/GAS-SEC-FUNDAMENTAL-DEPLOY-GUIDE-20261116.md

## 내용
- type=fundamental&tickers=…(최대 6, 대문자 티커 형식만) → company_tickers.json로 CIK → data.sec.gov companyfacts → 기존 has/fundamental-filter.js normalize() 결과를 JSONP/JSON으로 응답. 6시간 캐시, 요청 간 200ms, User-Agent 선언(연락처는 순태씨가 배포 때 입력, 저장소엔 자리표시자), 응답 < > & U+2028/9 이스케이프, 기존 hasHistoryCallback_ 재사용.
- 보유·계좌·금액은 GAS로 가지 않음. 키·비용·주문 없음. 기존 doGet 변경 없음(연결 한 줄은 안내문).
- 규칙 출처·기준일: SEC accessing-edgar-data(검토 2024-06-26 표기, 조회 2026-11-16), EDGAR API 문서(2025-04-08 표기).

## 시험(클로 실행)
- 신규 7건(가짜 UrlFetchApp·CacheService): 정상·잘못된 요청 8종 거부·종목별 실패 격리·캐시 재사용·JSONP 안전·앱 validNormalized 통과·doGet 미수정. 전체 2206 중 2204 통과/0 실패/2 skip(DST), 비밀값 0. 화면 변경 없음.
- 작성 중 U+2028이 정규식에 그대로 들어가 구문 오류 → 시험이 잡아 수정(이스케이프로 교체).

## 미완료·미검증
- 실제 SEC 응답·GAS 실행시간·할당량 미검증(실GAS 접근 불가). 앱에서 이 응답을 받아 카드에 싣는 연결(live-price/great-companies)은 다음 단계. 밸류에이션 미연결이라 '매수 검토'는 계속 닫힘.

## 순태씨 결정 필요
- GAS 반영 승인(지피 검토 후), 배포 시 연락처 입력. 앱 연결 단계 진행 여부.
