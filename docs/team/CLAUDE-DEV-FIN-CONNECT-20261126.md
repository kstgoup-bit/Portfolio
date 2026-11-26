STATUS: READY_FOR_REVIEW (단계 1 DART 변환 모듈 — 앱·GAS·운영 미반영, 공식 규격 대조 전 '미검증 추정')
ORDER-ID: 순태씨 대화 2026-11-26 '재무 연결 작업해'
BASE: origin/main 46c421e   BRANCH: work/claude-fin-connect-20261126

# 재무 연결 설계 — '판단 보류(재무·시세 검증 전)' 해제 조건 만들기

## 1. 지금 상태 (저장소 확인 사실)
- 미국(SEC): `gas/has-sec-fundamental.gs`(지피 APPROVE, main 병합 2026-11-16) + `has/fundamental-filter.js`(normalize/check) + 앱 '위대한 기업'·원칙 패널의 재무 조회 화면은 이미 있음. **순태씨의 GAS 실제 배포·`?type=fundamental&tickers=AAPL` 확인 여부는 일지에 없음(미확인).**
- 국내(DART): **코드 없음.** 곡소리 매수 후보 7개 중 국내 4개(대한전선·두산·HD현대마린엔진·HD현대일렉트릭)와 보유 국내 종목이 여기에 걸림.
- 카드 보류 라벨(`has/review-cards.js` HELD, D4)은 **재무 연결 여부를 코드로 확인하지 않고 무조건** 매수 쪽에 붙음. 즉 재무가 연결돼도 지금 구조로는 보류가 안 풀림.
- 시세 쪽: kis-us GAS(11-25 순태씨 PC 완료)는 있으나 앱 대조 연결은 아직(지피 검토 대기).

## 2. 풀어야 할 문제 3개
A. 미국 재무를 실제로 받기 — 순태씨 GAS 배포 확인(클로는 Apps Script 접근 불가).
B. 국내 재무(DART) 신설 — 어댑터(순수 계산)·GAS 초안·시험. OpenDART 인증키 필요(순태씨 발급, 키는 GAS 스크립트 속성에만, 저장소·채팅 금지).
C. 보류 해제 규칙 — 카드가 "재무 검증됨"을 증거로 판단하게 하기(아래 3절).

## 3. 해제 규칙 제안(순태씨 승인 필요, 승인 전 코드 반영 없음)
카드의 '판단 보류(재무·시세 검증 전)'는 아래를 **모두** 만족할 때만 '재무 확인됨'으로 바꾼다. 하나라도 빠지면 지금처럼 보류.
1. 재무: 해당 종목 normalize 결과가 `ok:true`·`validNormalized`이고 최신 연간 결산 기준 신선도 통과, 충돌(conflicts) 없음, 필터 라벨이 weak가 아님. (weak면 '재무 취약 — 매수 보류' 근거로 표시)
2. 시세: 앱 가격이 독립 출처(KIS 등)와 대조 통과(기존 price-trust 상태 사용). 미국은 kis-us 대조 연결이 선행.
3. 합의: 해당 날짜 카드의 consensus.status가 agreed(7일 이내). 합의는 해제 조건이지 보류 해제 자체가 아님.
4. 표시: 해제돼도 문구는 '매수 검토(재무 확인됨 · 기준일 YYYY-MM-DD)'까지만. 주문·금액 안내는 차트 관문 규칙(1·3·3·3)대로 따로.
- 이 규칙의 의도: 실적 판단(verdict)·타이밍(차트 관문)·검증(재무·시세)을 분리 유지.

## 4. 단계(각 단계 = 지피 검토 단위, 앱 반영은 순태씨 '올려' 후)
- 단계 1(개발만, 키 불필요): `has/dart-facts-adapter.js` 순수 모듈 + 합성 fixture + 시험. OpenDART 단일회사 전체 재무제표(fnlttSinglAcntAll) 모양 입력을 `fundamental-filter`가 읽는 normalize 출력(years 배열, 원 단위)으로 변환. 계정 선택은 계정ID(IFRS 표준 태그) 우선, 이름 일치 금지, 연결(CFS) 우선·단위/연도 불일치·정정공시·값 충돌은 SEC 때와 동일하게 보류(fail closed).
- 단계 2(개발만): `gas/has-dart-fundamental.gs` 초안(키는 PropertiesService, 종목코드→corp_code 지도, 이용률 관문은 SEC GAS 구조 재사용) + 가짜 GAS 시험. 배포는 순태씨 승인 후 직접.
- 단계 3(개발만): 카드 해제 규칙 모듈 `has/review-fin-gate.js`(순수 함수, 3절) + 시험. `review-cards.js` 연결은 별도 단계.
- 단계 4(승인 후): 앱 연결 — 카드 상세에 '재무 확인 근거' 접기, 보유·곡소리 카드가 재무를 요청(기존 GAS 지연 로더 재사용). 순태씨 갤럭시 확인.

## 5. 순태씨 결정·할 일
1. SEC GAS를 배포하셨나요? (아니면 배포 안내서 GAS-SEC-FUNDAMENTAL-DEPLOY-GUIDE-20261116.md 순서대로, 연락처 이메일 입력 필요)
2. OpenDART 인증키 발급(무료, opendart.fss.or.kr) — 단계 2 배포 때만 필요. 지금 단계 1·3은 키 없이 진행.
3. 3절 해제 규칙 승인/수정.

## 6. 미검증·주의
- OpenDART 응답 필드·계정ID·보고서 코드·호출 한도는 이 문서 작성 시 공식 문서를 직접 열어 확인하지 못함(검색 결과만 확인). 단계 1 시작 때 공식 문서로 확인하고 출처·기준일을 코드 주석에 적는다. 확인 전까지 '추정'.
- DART 수치 지연(공시 후 API 반영 지연 보도 있음)은 신선도 판단에 반영해야 함 — 단계 1에서 기준.
- 이 문서는 설계만. 앱 코드·GAS·reviews/·사용자 자료 변경 없음. 주문·매매 없음. 투자 자문 아님.

## 7. 단계 1 결과 (2026-11-26)
- 신규: `has/dart-facts-adapter.js`(순수 변환, 네트워크·키 없음), `tests/dart-facts-adapter.test.cjs`(29건). 앱·GAS·reviews/ 변경 없음.
- 동작: 호출자가 준 fnlttSinglAcntAll 모양 응답(연결 CFS·사업보고서 11011, 최대 5개 연도) → `fundamental-filter` normalize 출력 모양(`validNormalized`·`assess` 통과 시험). 종목코드↔corp_code 사람 확인(identityReview) 필수, 12월 결산만, 계정은 account_id로만 선택(이름 일치 금지), 세부·부문 행 제외, 같은 항목 금액 충돌은 값 비움, 금액 문자열 엄격 해석, 접수번호 날짜·결산일·오늘 범위 확인, 합성 입력은 표시 유지·세탁 불가.
- 비움(1단계 한계): 부채·이자비용(표준 ID 불명확) → 해당 판정 '제외'. 분기·TTM 없음. capex는 부호 표기 차이를 '지출 크기'로 통일.
- 시험: 신규 29/29, 전체 2460 중 2455 통과/3 실패/2 skip. 실패 3건은 깨끗한 main(46c421e)에서도 동일(683 Git 실행·로컬 참조 필요 시험, 1142 일일 수리 원본 보존(Git 필요), 1721 DOM) — 이번 변경과 무관. scan-secrets 발견 0.
- **미검증(가장 중요)**: 공식 OpenDART 안내 페이지를 열지 못함(robots 읽기 실패). 계정 ID(`dart_OperatingIncomeLoss` 등)·sj_div·rcept_no 앞 8자리=접수일·status 코드·금액 문자열 형식·일 한도(제3자 20,000건)는 공식 대조 필요. 지피 또는 순태씨가 공식 문서로 대조하고 실제 응답 샘플 1건(가려서)으로 시험 필요 — 그 전 운영 연결 금지.
- 다음: 단계 2 DART GAS 초안(키는 스크립트 속성), 단계 3 카드 해제 규칙 모듈. 순태씨 결정 대기: SEC GAS 배포 여부, OpenDART 키 발급, 해제 규칙 승인.

## 8. 단계 2·3 결과 (2026-11-26)
- 단계 2 `gas/has-dart-fundamental.gs`(초안, 배포·실행 안 함) + `tests/dart-fundamental-gas.test.cjs`(13건, 가짜 UrlFetchApp·속성·캐시·잠금). `?type=dart-fundamental&tickers=…`(6자리, 최대 3개) → 종목당 연간 5건(연결·사업보고서) 직렬 250ms 간격 → `HASDartFacts.toNormalized`. 키는 스크립트 속성 `HAS_DART_KEY`(40자 16진 형식 확인, 없으면 요청 0건), 응답·오류에 키·요청 주소·본문 없음. 종목코드→corp_code는 순태씨가 DART 공시검색으로 직접 확인해 채우는 `HAS_DART_CORPS`(저장소는 빈 자리표시자). status 000·013 외(010·011·012·020 등)·HTTP 오류·예외·깨진 JSON이면 남은 요청 전부 중단하고 사유 코드만 반환(재시도 없음). 변환 결과(작음)만 6시간 캐시, 위조 캐시 무시. 스크립트 잠금으로 동시 실행 1건. 기존 doGet 변경 없음(연결 한 줄은 주석 안내).
- 단계 3 `has/review-fin-gate.js` + `tests/review-fin-gate.test.cjs`(13건): `evaluate(input, nowISO)` → released/held/blocked. 해제 = 재무 strong(이 종목·3년 이상·신선·충돌 없음) ∧ 시세 independent-verified·ok·7일 이내 ∧ 합의 agreed. 재무 weak면 blocked. 합성 표시면 해제 불가. 해제 라벨은 '재무 확인됨(밸류에이션 미확인)'까지, 금액·주문 문구 없음. **앱(review-cards.js)에는 연결하지 않음 — 3절 규칙 승인 전.**
- 어댑터 수정: 합성 표지 정규식을 'synthetic|invented|(합성)|(가상)'으로 좁힘(실제 회사명 '○○합성'이 거부되는 문제 — 시험 추가).
- 시험: 전체 2487 중 2482 통과/3 실패/2 skip(실패 3건은 main과 동일), scan-secrets 0.
- 한계: GAS는 실제 Apps Script가 아닌 가짜 환경 시험. 공식 OpenDART 규격·일 한도·실제 응답 크기/실행시간 미검증. 부채·이자비용 비어 있음. 시세 입력 모양(`price`)은 price-trust 실제 출력과 아직 연결 안 됨(단계 4).
- 순태씨 할 일(배포 전): ① OpenDART 키 발급 → 스크립트 속성 HAS_DART_KEY ② HAS_DART_CORPS에 확인한 종목 입력 ③ GAS 승인 후 붙여넣기(별도 안내서는 지피 검토 후 작성).

## 9. 순태씨 결정 기록 (2026-11-26 대화)
- **3절 보류 해제 규칙 승인**(순태씨 대화 '1번은 내가 승인하면 되는 거면 승인'): 재무 strong ∧ 시세 독립 대조 ∧ 지피 합의(7일 이내) 모두 충족 시에만 해제, 재무 weak은 막힘, 해제 라벨은 '재무 확인됨(밸류에이션 미확인)'까지. 승인 범위 = 규칙 내용 확정과 단계 4 개발 진행. **앱 main 병합·운영 배포는 별도 '올려' 필요.**
- SEC GAS 배포: 순태씨가 지금 진행 여부 검토 중(기록 시점 미확인).
- **SEC GAS 배포 완료·확인(순태씨 2026-11-26 대화)**: 백업 사본 후 '자산관리' 프로젝트에 fundamental-filter.gs·has-sec-fundamental.gs 추가, 연락처 입력, doGet 첫 줄 추가, 기존 배포 새 버전. `?type=fundamental&tickers=AAPL` 확인 '됐어요'(순태씨 보고, 클로는 응답 내용을 직접 보지 못함). 주소·연락처는 저장소·클로에 기록하지 않음. 다음: 단계 4 미국부터 앱 연결.
