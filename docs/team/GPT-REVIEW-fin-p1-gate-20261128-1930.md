VERDICT: CHANGES_REQUESTED
REVIEW-KIND: STATIC_ONLY / CR-FIN-P1
REVIEWED-HEAD: 2d74cba65e61d997bfe055963563b0b6ecd2d869
BASE: ebf3e9185e54cf0cc81f0a38b56a87b0d0511cec
MAIN-AT-REVIEW: f9025c751142276b2f2a550e16bc5c5b49325eea
ORDER-ID: GPT-REVIEW-fin-postmerge-20261128-1730 CR-FIN-P1
BRANCH: work/claude-fin-p1-gate-20261128
2026-11-28 19:30 KST

## 1. 범위와 수용
LATEST 최상단 READY_FOR_REVIEW, README, PROTOCOL, WORKLOG, UNIVERSE 요청서, 11-25/27 일정 공지, 직전 1730 CR 및 지정 브랜치 보고서를 확인. BASE..HEAD 비교 결과 1커밋·4파일(gas/has-kis-overseas.gs, has/review-fin-gate.js, tests/kis-overseas-parse.test.cjs, tests/review-fin-gate.test.cjs), 모두 지정 HEAD에서 직접 읽고 fundamental-filter.js의 판정 생성 계약도 대조했다. 기존 1730 검토는 반복하지 않았다.
- KIS 미래 봉 거부(16:30 전후), 잘못된 날짜/상충 종가/일부 형식 오류 거부, 종목 접미 일치 확인 및 단일 출처·통화·거래일 미검증 표시 추가는 정적 수용. 실제 거래소·통화·거래일/수정주가·응답 스키마 및 배포본 검증이 아니다.
- 관문의 문자열 agreed 거부, 카드 날짜·종목·시장·통화·판단값 비교, 정수 years·충돌 배열, 합성 상태/출처 없는 자료 보류는 개선 확인. 앱/발행 미연결 유지 수용. 그러나 아래 정상처럼 보이는 상충 입력이 여전히 해제되므로 계약 채택/운영 승인 불가.

## 2. CR-FIN-P1-R1 — 가격 대조의 실질 검증
priceCheck(): evidence의 날짜와 양수만 확인하고 close 값 자체는 서로 비교하지 않는다. tests/review-fin-gate.test.cjs의 ok()에서 evidence[1].close=1 (첫 값 1000)을 넣어도 정적 경로상 released. source='kis'와 'kis '도 서로 다른 출처로 센다. 각 근거에 종목·시장·통화·가격 종류·수정주가 기준이 없으며 외부 status/verification 문자열 자체로 신뢰를 승격한다.
- 승인된 검증 모듈의 결과/버전 및 실제 입력 근거를 결속하고 정규화한 공급자 ID와 독립성·종목·거래소·통화·가격 종류·조정 기준·확정 거래일·수집/검증시각을 확인. 가격 차이는 승인된 허용오차와 산식으로 대조하고 기준 미정이면 보류(임의 임계값 확정 금지). 단일 출처·복제·공백 변형·상충·합성/미검증 개별 evidence는 모두 보류. 사용자 승인 전에는 어떤 결과도 실제 해제/발행 권한을 주지 말 것.

## 3. CR-FIN-P1-R2 — 재무 및 합의 근거의 결속
evaluate()는 strong/reviewEligible 외에 checks가 비어 있지 않고 id/status 문자열만 있으면 통과한다. 현재 정상 fixture 자체가 ROE 하나뿐인데 fundamental-filter.js 실제 strong은 판정 가능 항목 >=5, fail=0, warn<=1, 최근 충돌 없음 조건이다. checks=[{id:'roe',status:'fail'}] 또는 임의 id/status도 정적 경로상 released. filed(공시일) 누락/미래/카드 이후 여부를 검사하지 않아 assessment.filed='2027-01-01' 역시 해제 가능. 결산일은 today만 비교하고 card.asOf와 비교하지 않는다. provenance.source는 임의 문자열, synthetic:false는 자기 선언일 뿐이며 실제 정규화 데이터나 회사 식별자와 결속되지 않는다.
consensusCode()도 evidence='x'와 reviewers 두 이름이면 통과. 카드 원문·지피 독립 검토·클로 결과의 정확한 경로/커밋/내용 해시 및 기준일이 결속되지 않음. 이미 승인 대기인 엄격 JSON 합의 발행 계약을 우회하지 말 것.
- 재무: F.assess의 실제 출력 계약, 확인된 기업 ID/시장/통화, 원문 공시 근거·공시일·수집일과 카드 기준일, 자료 충돌·항목 유효성 및 합성 상태를 연결. 최소 항목과 상태는 실제 판정 규칙을 재사용/대조하되 별도 임계값 변경 금지. 미래/카드 이후 공시(look-ahead)·모순된 판정·누락/허위 근거 보류. weak도 신뢰된 동일 회사 자료임을 확인하기 전에는 확정 blocked 대신 미확인 보류.
- 합의: 사용자 승인 전에는 문서 설계 및 합성시험만. 두 검토자의 원문·버전/커밋·내용 해시·카드 동일성·시점이 신뢰 경계에서 검증되는 계약 제시. 문자열이나 호출자 자기 선언만으로 인증된 합의로 보지 않는다. 본 함수가 원문 확인 못 하는 순수 함수라면 검증된 입력의 생성자와 무결성 경계를 명시하고 미연결 상태 유지.
- R1/R2 반례 시험을 함께 제출. 현 단계 released는 합성 계약 시험의 내부 상태임을 명시; 앱 표시·합의 발행·주문 경로 연결은 별도 사용자 승인 없이는 금지.

## 4. CR-FIN-P1-R3 — KIS 파서 잔여 형식 경계
hasKisUsParse_(): row=[]도 typeof object이고 xymd/clos가 없어서 빈 행으로 간주. o1.rsym이 숫자 등 비문자열이면 존재하지 않는 값과 동일 취급. Number('0x10')도 양수로 수용. 응답 종목 접미가 같다고 거래소/티커 정확성이 보증되지는 않음(현재 미검증 표시는 적합).
- 배열/비객체 행, 명시적으로 존재하는 비정상 rsym, 16진수 등 공식 가격 문자열 규격 외 값은 거부하는 합성시험을 추가하고 허용 빈 행 형태를 문서화. 실제 휴장/조기 폐장 및 거래소·통화·수정주가 기준은 공식 근거 없으면 미검증 유지. 기존 읽기 전용 호출 경계 유지, 실제 GAS/KIS 실행·변경 금지.

## 5. 완료 기준·대기열
이번 CR을 한 단위로 모아 수정하되 엄격 계약 승인과 실제 검증 모듈 연결은 별도 단계. 합성시험 반례와 정상 계약 시험, 전체 회귀 및 비밀값 검사 보고. 보호 목록 main의 미등록 2시험 실패는 기승인 핀/최종 검토 큐와 연결하여 해결해야 하며 기준 완화/핀 무단 복제 금지. 클로 보고 전체 2510 중 2506 pass/2 fail/2 skip, 관련 26/26 통과, 비밀값 0; 지피는 실제 코드·시험 코드와 Git 비교만 했고 시험·브라우저·GAS·실기기·실제 데이터는 독립 실행하지 않았다. 위 반례는 코드 정적 추론. 화면 변경 없음.
P2 곡소리 시트 원본 보호, P3 DART, P4 SEC, fin-wire 최종 및 fx-alpha, price-verify, risk-guard, bench-reason, valuation-v1 기존 큐 보존. cycle-pattern은 선행 CR/재무/시세 미충족으로 신규 지시 보류. Aladdin 및 도미노 후순위 연구 문서 기존 등록 유지(중복 지시 없음). 400종목 및 자동매매 설계 기존 작업 중복 금지. NVDA wait, 합의 발행 비활성 유지. 사용자 결정 요청은 계약 보완 후로 유보. main 병합, 운영 배포, GAS/시트 변경, 실제 API·키, 비용, 클라우드 자원, 투자기록·백업, 자동매매 없음.
