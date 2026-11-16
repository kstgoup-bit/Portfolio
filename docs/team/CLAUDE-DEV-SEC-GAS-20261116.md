STATUS: READY_FOR_REVIEW (SEC 재무 GAS 초안 — GPT-REVIEW-sec-gas-20261116-0930 CR-1/CR-2 반영, 저장소 한정, GAS·운영 미반영)
ORDER-ID: GPT-REVIEW-sec-gas-20261116-0930 (원 작업: 순태씨 대화 2026-11-16 '진행')
BASE: e375ba748cacee9cbabf89baaa138d435e251b29 (직전 검토 HEAD; 사이에 main ce38ef2 문서 병합 b0f3470)
HEAD: e4741d5736819d16b53c17f397c126f575265216 (코드 커밋. 이후 이 보고서 커밋은 docs만)
REVIEW-SCOPE: `git diff e375ba7..e4741d5 -- gas/ tests/ docs/team/GAS-SEC-FUNDAMENTAL-DEPLOY-GUIDE-20261116.md` (gas/has-sec-fundamental.gs, tests/sec-fundamental-gas.test.cjs, tests/lib/live-data-pins.json 1줄, 배포 안내)

## 0-a. 지피 CR 반영 (2026-11-16 10:10 KST 정각 실행)
- CR-1 CIK 정합성: `hasSecRawCik_`(정수 또는 숫자만 문자열, 앞 0 허용, 1~10자리)로 원본 `raw.cik`를 읽어 URL CIK와 **정확히 같을 때만** normalize → `ok:true`. 누락 = `sec-cik-missing`, 불일치·형식 위반(소수·음수·'789019x'·객체) = `sec-cik-mismatch`, 그 종목만 보류·다른 종목 유지·캐시 안 남김. normalize 실패/`validNormalized` 불통과 = `sec-normalize-failed`. 결과 `cik`는 URL CIK 문자열로 고정.
- 캐시 키 `HAS_SEC_F_<티커>_<CIK10>`. 꺼낸 값도 티커·CIK·`validNormalized` 재확인, 하나라도 다르면 재수집.
- CR-2 이용률: 모든 SEC 요청(지도+회사자료)이 `hasSecGate_` 통과 — `LockService` 스크립트 잠금(5초 내 못 받으면 `sec-busy`), 캐시 공유 마지막 시각으로 **실행 합산** 시작 간격 250ms(최대 초당 4건), 분당 60건 넘으면 `sec-rate-hold`. 429·403 → 재요청 없이 10분 전체 중단(`sec-cooldown`), 같은 실행의 남은 종목도 요청 안 함. 앱이 나중에 다시 요청하는 방식(GAS 안 재시도 없음).
- 지도 캐시: company_tickers.json 원본(~1MB)은 캐시 100KB 한도 초과라 저장하지 않고, 요청 티커의 CIK만 개별 6시간 캐시, 지도에 없는 티커는 '0'으로 1시간 기억 → 캐시 적중 시 지도 재조회 0. 지도 실패는 이제 전체 error가 아니라 해당 종목만 `sec-ticker-map-failed`/보류 사유(캐시된 종목은 계속).
- 시험: 신규 11건(정상 2종목 서로 다른 CIK·불일치/누락/위변조 9종·앞 0 문자열·CIK 바뀐 캐시·위조 캐시 3종·실행 간 간격 ≥250ms·분당 상한·잠금 실패·429/403 중단·재개·지도 429·미지 티커 기억·캐시 크기), 기존 1건(지도 실패) 기대 변경. 파일 18건 통과. 전체 2217 중 2215 통과/0 실패/2 skip, `node tools/scan-secrets.cjs` 발견 0. 화면 변경 없음.
- 한계: '병렬'은 Node 단일 스레드에서 공유 캐시·잠금·가짜 시계로 흉내낸 합성 시험(실제 Apps Script 동시 실행 아님). CacheService·LockService 실제 동작, 지피가 인용한 SEC 이용률 공지 원문은 클로가 이번 실행에서 재조회하지 않음(미검증 표시). 실제 Apps Script의 `HASFundamentalFilter` 전역·`hasHistoryCallback_` 의존성은 배포 확인 항목으로 안내서에 추가.

## (이전) 최초 초안 보고 — HEAD e375ba7

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
