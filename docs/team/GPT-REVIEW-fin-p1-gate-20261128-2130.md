VERDICT: CHANGES_REQUESTED
REVIEW-KIND: STATIC_ONLY / CR-FIN-P1-R1~R3
REVIEWED-HEAD: 611a496ce601ba87f9a774b3599a39d6b1568218
BASE: 2d74cba65e61d997bfe055963563b0b6ecd2d869
DIFF-BASE: 6941348d23e321f741aeb9c6c437ad072c4786f5
MAIN-AT-REVIEW: 22b2880095fe9f852115aae5e382c9a34d8c697f
ORDER-ID: GPT-REVIEW-fin-p1-gate-20261128-1930 CR-FIN-P1-R1~R3
BRANCH: work/claude-fin-p1-gate-20261128
2026-11-28 21:30 KST

## 범위 및 수용
LATEST 최상단 READY_FOR_REVIEW, README, PROTOCOL, WORKLOG, UNIVERSE, 11-25/27 일정, 직전 1930 검토와 지정 보고서 확인. 2d74cba..611a496 비교 4커밋(보고·문서 병합 포함), 마지막 커밋 6941348..611a496의 실제 변경 4파일 직접 읽고 fundamental-filter.js의 assess() 대조. 기존 검토 SHA 중복 없음.
- R1: 종가 불일치·공급자 복제/공백/동일 계열 거부, 기본 빈 trust, 상태 문자열 승격 금지, 합성 scope 표시 수용.
- R2: 체크 상태 집계·공시일·합의 경로/해시 형태 검증 개선 수용. trust는 신뢰된 생성자라는 전제의 합성 계약 시험 전용이지 실제 원문 검증 또는 사용자 승인 아님.
- R3: 배열 행, 비문자열 rsym, 16진수·지수형 가격 거부 정적 수용. 거래소/휴장·조기폐장·공식 KIS 스키마 미검증 표기 유지. GAS 실제 변경/호출 금지.
- 앱·합의 발행·주문 연결 승인 아님. 다음 두 잔여 지적은 한 단위로 모아 처리.

## CR-FIN-P1-R4 — 시각 및 계약상 동일성
1. iso()는 밀리초 0~3자리 허용, 그러나 priceCode(), consensusCode(), provOk()는 ISO 문자열을 그대로 > / <= 비교한다. 예: now='2026-11-26T00:00:00Z'일 때 consensus.verifiedAt='2026-11-26T00:00:00.001Z'는 실제 미래인데 문자열상 작아서 통과한다. price.verifiedAt 및 provenance.collectedAt도 동일 문제. evidence.collectedAt > price.verifiedAt 비교도 같은 결함. Date.parse로 유효 순간을 비교하거나 고정 정밀도로 정규화하고 같은 순간의 서로 다른 표기를 정상 처리. 모든 미래/역전 반례와 경계 정상 시험 추가.
2. price의 market='US'는 국가 구분이지 거래소/증권 식별이 아니다. 현재 card/price/evidence에는 exchange 또는 검증된 상품 ID 계약이 없고 adjustment도 임의 정규형 문자열이면 가능. 실제 검증 모듈을 구현하지 말고 승인 전 계약 설계에서 동일 증권·거래소, 허용 조정 기준, 공급자별 원본 해시/검증 결과 및 검증기 정책 버전 결속을 명시한다. 승인되지 않은 기준은 실제 해제/발행 불가. 합의 원문 두 경로에 같은 해시를 복제하거나 회사 ID가 형식만 맞는 사례도 생성자에서 검증할 필수 경계로 명시. trust 입력을 사용자/외부 JSON으로 받을 수 없는 경계 필요. 실제 원문 읽기/서명/공급자 연동은 범위 밖.

## CR-FIN-P1-R5 — 실제 판정 계약과 시험의 유효성
1. recompute()는 CHECK_IDS 중 일부만 있어도 허용하고 아직 반드시 na인 valuation도 pass로 세어 strong으로 승격 가능. 정상 fixture에서 checks를 roe/margin/leverage/interest/valuation 5개 pass만 남기면 released 경로. 실제 F.assess()는 strong이면 8항목을 산출하며 valuation은 아직 na. 현재 버전의 정확한 체크 집합 및 valuation na를 강제하고 실제 assess 강한 결과와 일치 여부를 검증한다. 임계값 변경 금지. weak 분기는 years>=3/550일 기준 전에 return blocked 하므로 오래된 weak도 확정 상태로 표시 가능; stale/불충분 근거는 held로 하고 weak와 strong 양쪽 공통 최신성/최소 연수 먼저 검사. 회사 ID는 문자열 타입과 공식 매핑을 생성자에서 검증해야 함.
2. tests/review-fin-gate.test.cjs 마지막 DART 통합 시험 i.card에 sha256이 없어서 i,j,k 모두 card-date-invalid 조기 반환. 따라서 합성 거부 및 실제 판정 규칙 대조가 관문에 도달하지 않은 채 성공한다. 카드 sha 및 실제 일치 근거를 설정하고 각 시험에서 정확한 missing 코드와 정상/실패 대조를 단언한다. 'financials-inconsistent가 없다'만으로 성공하지 말 것. 합성 데이터는 실제 출처로 승격 금지, test-only fixture로 분리.
3. 재무 최신 결산의 filed뿐 아니라 판정에 쓰인 과거/대체 결산 및 원문별 공시시각을 카드 기준일과 대조하는 책임은 생성자 계약으로 명시(실제 원문 생성자 없음, 이번에는 설계/시험만). 실제 데이터 승인 전 해제 불가.

## 완료/다음
클로 보고 전체 2519 중 pass 2515 fail 2 skip 2, 관련 35/35, 비밀값 0. 지피는 코드/시험/커밋 정적 검토만 실시; 실행 재현 없음. 위 반례도 정적 추론. 화면 변경 없음. 보호 목록 미등록 2건은 기존 최종 큐에서 해결, 기준 완화 금지. 위 계약 경계 중 원문 검증 등 실제 모듈은 별도 승인 전 미연결; 합성 계약 수정/시험만. P2 시트 원본 보호, P3 DART, P4 SEC, fin-wire 최종, fx-alpha, price-verify, risk-guard, bench-reason, valuation-v1 순서 보존. cycle-pattern 신규 지시 선행 미충족으로 보류. 400종목 및 자동매매 기존 설계 중복 금지. NVDA wait, 합의 발행 비활성 유지.

## 사용자 확정 장기 우선순위(2026-11-28 대화)
개인용 HAS의 최우선 목표는 사용자 자신의 실전 투자와 자산보호, 지피·클로 독립 검증을 거쳐 충분한 검증 및 별도 승인 후 개인 자동매매까지 발전시키는 것. 사업화는 개인 실전 성과 검증 이후 별개 과제. 기존 GPT-20261128-1800 및 도미노 부록은 보존하되 당장은 개인용에 기여하는 연구만 후순위 활용, 상업용 앱/결제/회원 개발 착수 금지. 이 문단은 우선순위 명확화이며 별도 실행 단위·운영/주문 승인 아님.

main 병합, 운영 배포, 실제 GAS/API/키, 비용, 클라우드 자원, 투자기록·백업, 자동매매 변경 없음.
