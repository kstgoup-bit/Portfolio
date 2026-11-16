STATUS: READY_FOR_REVIEW (SEC 재무 GAS 초안 — GPT-REVIEW-sec-gas-20261116-1030 CR-3/CR-4 반영, 저장소 한정, GAS·운영 미반영)
ORDER-ID: GPT-REVIEW-sec-gas-20261116-1030 (원 작업: 순태씨 대화 2026-11-16 '진행')
BASE: e4741d5736819d16b53c17f397c126f575265216 (직전 검토 HEAD; 사이에 main 5cedc6a 문서 병합 d3fb679)
HEAD: f3c5c78c4872ed3461e71c6c59974067de596586 (코드 커밋. 이후 이 보고서 커밋은 docs만)
REVIEW-SCOPE: `git diff e4741d5..f3c5c78 -- gas/ tests/ docs/team/GAS-SEC-FUNDAMENTAL-DEPLOY-GUIDE-20261116.md` (gas/has-sec-fundamental.gs 관문 재구성, tests/sec-fundamental-gas.test.cjs 신규 10건, tests/lib/live-data-pins.json 1줄, 배포 안내 1줄)

## 0-b. 지피 CR-3/CR-4 반영 (2026-11-16 11:10 KST 정각 실행)
- CR-3: 요청 허가 상태(last·min·n·until·pending)를 CacheService에서 빼고 **스크립트 속성 `HAS_SEC_GATE_STATE`**(PropertiesService)로 옮김. 관문을 `hasSecFetch_` 하나로 합치고 **스크립트 잠금을 SEC 요청이 끝날 때까지 유지** → 스크립트 전체 동시 요청 1건, 허가 시각과 실제 시작 시각 사이 경합 제거. 요청 전 상태를 쓰고 **되읽어 같을 때만** 요청. 읽기 예외·쓰기 예외·되읽기 불일치 = `sec-state-hold`(요청 0). 손상·형식 위반 상태는 요청 없이 10분 중단 상태로 덮어씀. 상태 없음(처음 사용)만 초기값으로 진행(속성은 퇴거되지 않음). 조회 결과(회사자료·CIK)는 계속 CacheService.
- CR-4: 요청 전 `pending=시작시각` 기록 → 응답 후 해제. 429/403이면 `until=지금+10분`과 해제를 함께 기록. **이 기록이 실패하면 pending이 남고, 다음 실행은 잠금 아래에서 pending을 보면 '앞 요청 결과 미기록 = 차단됐을 수 있음'으로 보고 10분 중단**(요청 0). 실행이 요청 도중 끝난 경우도 같음. 네트워크 예외(차단 응답 아님)는 `sec-fetch-failed`, pending 해제 시도. 오류를 숨기거나 재시도하지 않음.
- 잠금 대기 5초 → 10초(요청 끝까지 잠금을 쥐므로).
- 시험 신규 10건: 매 실행 전 캐시 전체 퇴거 80회 실행에서 간격 ≥250ms·분당 ≤60·허가 키가 캐시에 없음 / 캐시 적중·미적중 혼합 100회 전체 요청량·상한 보류 발생 / 병렬(요청 중 다른 실행 시작 → sec-busy·요청 0) / 상태 읽기 실패·쓰기 실패·손상 4종·되읽기 불일치 / 429·403 뒤 중단 기록 실패 + 캐시 즉시 제거 → 다음 실행 요청 0·10분 뒤 재개 / 429 뒤 기록 성공 + 캐시 제거 / 429 받은 실행 기록 전 병렬 차단 / 요청 도중 실행 끝남 / 네트워크 예외. 기존 '분당 상한' 시험은 상태 위치만 속성으로 변경. 파일 28건 통과.
- 변이 확인: pending 검사를 끄면 CR-4 시험 3건이 실패하는 것을 확인 후 원복.
- 전체 2227 중 2225 통과/0 실패/2 skip, `node tools/scan-secrets.cjs` 발견 0. 화면 변경 없음.
- 출처: CacheService 만료는 제안값·조기 제거 가능 https://developers.google.com/apps-script/reference/cache/cache (지피 인용), PropertiesService https://developers.google.com/apps-script/guides/properties, 할당량 https://developers.google.com/apps-script/guides/services/quotas (조회 2026-11-16, 페이지 존재만 확인 — **속성 읽기/쓰기 일일 수치·속성 강한 일관성은 미검증**; 할당량 초과 시 쓰기 실패 → 요청 보류라 안전 방향).
- 한계: '병렬'은 Node 단일 스레드에서 공유 속성·잠금·가짜 시계로 흉내낸 합성 시험(실 Apps Script 아님). 요청 1건씩 직렬화로 6종목 응답이 느려질 수 있음(실측 미검증). pending이 남는 드문 경우 10분 보수적 중단(오탐 가능, 안전 방향).

## (이전) 0-a. 지피 CR 반영 (2026-11-16 10:10 KST 정각 실행)
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
