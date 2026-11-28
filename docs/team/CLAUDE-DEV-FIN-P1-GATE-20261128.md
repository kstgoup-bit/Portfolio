STATUS: READY_FOR_REVIEW
ORDER-ID: GPT-REVIEW-fin-p1-gate-20261128-2130 CR-FIN-P1-R4~R5
BRANCH: work/claude-fin-p1-gate-20261128
BASE: 611a496ce601ba87f9a774b3599a39d6b1568218 (직전 검토 HEAD; 8897028 = main 22b2880 병합, docs/team만)
HEAD: 9c0e9f64545fa2078a275087c3892bab6b286c67
REVIEW-SCOPE: git diff 8897028 9c0e9f6 -- has/review-fin-gate.js tests/review-fin-gate.test.cjs tests/fixtures/fin-gate-fixtures.cjs (3파일). 화면 변경 없음 → 브라우저 해당 없음. GAS 파일 변경 없음.
UPDATED: 2026-11-28 22시대 KST

# CR-FIN-P1-R4~R5 반영 (클로 22시 정각 실행)

## R4-1 시각 비교
- ISO 문자열 `>`/`<=` 비교를 모두 `Date.parse` 실제 순간 비교로 교체: price.verifiedAt↔now, evidence.collectedAt↔price.verifiedAt, consensus.verifiedAt↔now, provenance.collectedAt↔now. 날짜(YYYY-MM-DD) 대 날짜 비교는 고정 형식이라 유지.
- 지피 반례 now=`2026-11-26T00:00:00Z`, consensus.verifiedAt=`…00.001Z` → 보류 확인. `.5Z`·`.01Z`·`.1Z` 미래도 보류. 같은 순간 다른 표기(`.000Z`·`.0Z`)·정확히 now는 정상 통과 시험.

## R4-2 계약 경계(설계 명시 + 최소 기계적 경계)
- **trust 경계 구현**: trust는 이 모듈이 만든 동결 객체(모듈 내부 WeakSet 등록)만 인정. 평범한 객체·`JSON.parse` 결과·복제·`Object.create(TRUST)`는 `invalid-trust`. 생성 함수 이름은 `__createTrustForContractTest`(합성 계약 시험 전용) — 실제 trust 생성자(원문 검증 모듈)는 여전히 없음, 앱·발행 미연결. 만든 뒤 원본 spec을 바꿔도 영향 없음(깊은 동결 복사).
- **합의 원문 두 경로에 같은 sha256** → `consensus-unverified`(관문에서도 거부).
- 코드 머리 주석에 계약 설계 v3 경계 명시(구현 아님): 거래소·검증된 상품 ID(ISIN/공급자 코드↔공식 매핑) 없음 → 실제 해제 불가(market은 국가 구분), adjustment 허용 목록·산식 미승인, 공급자별 rawSha256·검증 결과·검증기 policyVersion 결속, 합의 원문 해시 재계산, 종목↔corp_code/CIK 공식 매핑, 과거·대체 결산 공시시각 대조는 모두 **생성자 책임**.

## R5-1 판정 계약
- recompute: checks가 정확히 8개(현재 버전 has-fundamental-v1 전 항목)이고 각 id 1회, **valuation은 반드시 na**. 아니면 `financials-inconsistent`. 지피 반례(roe/margin/leverage/interest/valuation 5개 pass) → 보류 확인. years<3이면 재계산 결과 insufficient(→ 모순).
- 최신성·최소 연수 검사를 weak/strong 분기 **앞**으로: 오래된 weak는 blocked가 아니라 `financials-stale-or-insufficient`(코드 이름 변경: 이전 `financials-stale-or-conflict`). 임계값 변경 없음(550일·3년·≥5·주의≤1).
- companyId: 문자열 타입만(숫자 12345678·배열·toString 객체 거부).

## R5-2 시험 유효성
- DART 통합 시험: 카드 sha256 포함 → 관문까지 도달. 정확한 missing 단언 — 합성 표시 이동 시 `['synthetic-input']`, 출처 없음 `['financials-not-strong','financials-unverified']`, 출처 계약 갖춘 경우 `['financials-not-strong']`(실제 assess 판정 mixed), label만 strong으로 바꾸면 `['financials-inconsistent']`.
- 실제 `F.assess()` strong 출력(합성 companyfacts, 8항목·valuation na)을 관문에 넣어 released(scope contract-test-only), 5항목만 남김·valuation pass·fail 섞음 → 정확히 `['financials-inconsistent']`.
- 합성 fixture를 `tests/fixtures/fin-gate-fixtures.cjs`(머리말 TEST-ONLY, 실제 출처 승격 금지)로 분리.

## R5-3 과거·대체 결산 공시시각
- 생성자 계약으로 명시(위 v3 주석). 실제 생성자 없음 — 실제 데이터 승인 전 해제 불가 유지.

## 시험
- 관련 `tests/review-fin-gate.test.cjs` 32/32 통과(+7 신규: R4 trust 경계·R4 시각·R4 합의 해시 복제·R5 8항목·R5 weak 최신성·R5 회사 ID·R5 실제 assess strong 대조).
- 전체 `node --require ./tests/lib/no-network.cjs --test tests/*.test.cjs`(jsdom NODE_PATH): 2526 중 pass 2522 / fail 2 / skip 2. 실패 2건은 BASE와 같은 보호 목록 미등록(`portable proof…`, `independent: original source…`) — 기존 최종 큐 대상, 기준 완화 안 함.
- `node tools/scan-secrets.cjs`: findings 0.

## 미완료·미검증
- 실제 원문 검증·서명·공급자 연동·거래소/상품 ID·조정 허용 목록: 설계만, 구현·승인 없음.
- 지피 반례는 정적 추론이었고, 클로가 시험으로 재현·확인함.

## 순태씨 결정 필요
- 없음(합성 계약 수정만). 앱 연결·합의 발행·실제 데이터 사용은 지피 재검토 후 별도 승인.

main 병합·운영 배포·실제 GAS/API/키·비용·클라우드·투자기록·백업·자동매매 변경 없음.

---
(이전 판)
STATUS: READY_FOR_REVIEW
ORDER-ID: GPT-REVIEW-fin-p1-gate-20261128-1930 CR-FIN-P1-R1~R3
BRANCH: work/claude-fin-p1-gate-20261128
BASE: 2d74cba65e61d997bfe055963563b0b6ecd2d869 (직전 검토 HEAD; 6941348 = main f9025c7 병합, docs/team만)
HEAD: 611a496ce601ba87f9a774b3599a39d6b1568218
REVIEW-SCOPE: git diff 6941348 611a496 -- has/review-fin-gate.js gas/has-kis-overseas.gs tests/review-fin-gate.test.cjs tests/kis-overseas-parse.test.cjs (4파일). 화면 변경 없음 → 브라우저 해당 없음.
UPDATED: 2026-11-28 20시대 KST

# CR-FIN-P1-R1~R3 반영 (클로 20시 정각 실행)

## 0. 신뢰 경계(R1·R2 공통) — 가장 큰 변경
- `evaluate(input, nowISO, trust)` 세 번째 인자 **trust**(승인된 시세 검증기·시세 공급자(계열 group)·재무 출처·합의 검증기, 각 id+version) 없이는 **무엇도 해제하지 않음**. 기본값 `DEFAULT_TRUST`는 전부 빈 목록이고, 실제 trust를 만드는 검증 모듈은 **아직 없음** → 지금 `released`는 합성 계약 시험 안에서만 나오는 내부 상태(결과에 `scope:'contract-test-only'`).
- 이 함수는 원문을 열지 못하는 순수 함수다. 원문·해시 검증은 앞으로 승인될 검증 모듈(생성자) 책임이고, 이 함수는 그 결과의 id·version·시각과 입력 근거의 결속만 확인한다. 앱·합의 발행·주문 경로 미연결 유지.

## 1. R1 시세
- 외부 `status`/`verification` 문자열로 승격하지 않음(해당 필드 무시). `verifier:{id,version}`이 trust에 있고 `verifiedAt`이 거래일 이후·현재 이전이어야.
- 근거(evidence)마다 provider(정규화 id만 — `'kis '`·`'KIS'`는 형식 불량), ticker·market·currency·priceType·adjustment·marketDate·`session:'final'`·collectedAt(거래일 이후·검증시각 이전)·`synthetic:false` 필수, 상위 값과 모두 같아야.
- **종가가 하나라도 다르면 보류**(`price-conflict-tolerance-undefined`) — 허용오차·산식은 미승인이라 임의 임계값을 두지 않음. 같은 공급자 복제 → `price-evidence-duplicate`, 같은 계열(group)뿐 → `price-not-independent`, 1개 → `price-single-source`.
- 지피 반례 evidence[1].close=1 → 보류 확인.

## 2. R2 재무·합의
- 재무 판정 **재계산**: checks의 id는 fundamental-filter 실제 8개 항목만, 상태 pass/warn/fail/na만, 중복·근거 문구 없음 거부. strong = 판정 가능 ≥5·취약 0·주의 ≤1·충돌 없음(filter와 같은 규칙, 임계값 변경 없음). label·reviewEligible이 재계산과 다르면 `financials-inconsistent`. 지피 반례 `checks=[{id:'roe',status:'fail'}]`·임의 id/상태 → 보류. 항목 id 목록이 filter 소스와 같은지, 실제 assess() 출력이 모순 판정되지 않는지 시험으로 대조.
- 공시일: filed 없음·결산 전·카드 기준일 이후·미래 → `financials-lookahead-or-unfiled`(반례 filed='2027-01-01' 보류). 결산일도 card.asOf 이후면 보류.
- 출처 결속: provenance에 ticker·market·currency·companyId(KR 8자리 corp_code, US 10자리 CIK)·source{id,version}(trust)·normalizedSha256·filed(=assessment.filed)·collectedAt(공시일 이후·현재 이전)·synthetic:false.
- weak: 위 출처가 신뢰 확인될 때만 `blocked`, 아니면 `financials-weak-unverified`로 보류.
- 합의: `reviewers` 이름·`evidence` 문자열로는 불가(반례 evidence='x' 보류). `cardSha256`(카드 원문 해시, card.sha256 필수)과 `reviews` 정확히 2건(claude·gpt 각 1, `docs/team/*.md` 경로 서로 다름, commit 40자리, sha256 64자리, reviewedOn은 카드 기준일~합의일) + 합의 검증기 trust·verifiedAt. 엄격 JSON 합의 발행 계약(승인 대기)은 건드리지 않음.

## 3. R3 KIS 파서 (gas/has-kis-overseas.gs, 저장소 코드만 — 실제 GAS·KIS 실행·배포 없음)
- 허용 빈 행 = 배열 아닌 일반 객체이고 xymd·clos 둘 다 없음/null/공백(`{}`, `{xymd:'',clos:''}`). `[]`·숫자·문자열·null 행은 거부.
- output1이 객체가 아니면 거부. `rsym`이 있으면서 문자열이 아니면(숫자·null·객체·배열) 거부, 형식 `[A-Z0-9.-]{1,16}` 밖이면 거부, 빈 문자열은 없음과 같게(request-echo-unverified).
- 가격은 10진수 `123`/`123.45`만(앞뒤 공백 허용). `0x10`·`1e3`·부호·쉼표·`.5` 거부. KIS 공식 표기 규격·휴장/조기 폐장·거래소·통화·수정주가 기준은 **미검증** 유지.

## 4. 시험
- 전체 `node --require ./tests/lib/no-network.cjs --test tests/*.test.cjs`(jsdom NODE_PATH): 2519 중 pass 2515 · fail 2 · skip 2. 실패 2건(683 portable proof, 1166 daily repair, 'Unreviewed protected source addition')은 직전 BASE·main과 동일한 보호 목록 미등록 문제 — 기준 완화·핀 복제 안 함, 기승인 핀/최종 검토 큐에서 해결 대상.
- tests/review-fin-gate.test.cjs 25/25(R1·R2 반례 + 정상 계약 + trust 없음/기본값/버전 불일치 보류), tests/kis-overseas-parse.test.cjs 10/10(R3 3건 추가).
- `node tools/scan-secrets.cjs`: findings 0.

## 5. 보호 핀 주의(갱신)
- fin-wire와 함께 반영할 때 승인된 수정분 해시: gas/has-kis-overseas.gs `65c08550be09448a8790c3237966604ccfb70b79994175816309fb570527bec5`, has/review-fin-gate.js `d654c963fb74b37b20d1c394db0c368e0f2fea1bfc704efcf01749427c6a0b94`. 이 브랜치에서는 핀 추가 안 함.

## 6. 미완료·미검증·순태씨 결정
- 실제 시세·재무·합의 검증 모듈(trust 생성자)은 없음 — 별도 단계·승인 필요. 시세 허용오차·산식도 순태씨 승인 사항(미정이면 계속 보류).
- 계약 v2 채택 여부는 지피 검토 후 순태씨 결정. 앱 연결·발행·주문 경로 연결 금지 유지.

---
(아래는 직전 18시 보고)

STATUS: READY_FOR_REVIEW
ORDER-ID: GPT-REVIEW-fin-postmerge-20261128-1730 CR-FIN-P1
BRANCH: work/claude-fin-p1-gate-20261128
BASE: ebf3e9185e54cf0cc81f0a38b56a87b0d0511cec
HEAD: 2d74cba65e61d997bfe055963563b0b6ecd2d869
REVIEW-SCOPE: git diff ebf3e91 2d74cba -- gas/has-kis-overseas.gs has/review-fin-gate.js tests/review-fin-gate.test.cjs tests/kis-overseas-parse.test.cjs (4파일). 화면 변경 없음 → 브라우저 해당 없음.
UPDATED: 2026-11-28 18시대 KST

# CR-FIN-P1 — 시세·판단 보류 관문 실패 폐쇄 (클로 18시 정각 실행)

## 1. gas/has-kis-overseas.gs `hasKisUsParse_` (저장소 코드만, 실제 GAS 배포·실행 없음)
- 미국 동부 오늘보다 **뒤 날짜 봉이 하나라도 있으면 종목 전체 null**(16:30 전후 모두). 지피 반례(ET 11-27 17:00, 11-26/27/30) → null.
- 16:30 이전 오늘 봉은 기존처럼 부분봉으로 제외(intradayDropped). 미래 봉을 조용히 버리던 경로 제거.
- **빈 행**(xymd·clos 모두 비었거나 빈 객체)만 건너뛰고, 날짜·값 한쪽만 있거나 형식이 틀린 행·null 행은 **거부**.
- 응답 `output1.rsym`이 있고 끝이 요청 티커와 다르면 거부. rsym 형식(예: DNASAAPL)은 공식 응답으로 **미검증** → `identity:'rsym-suffix-match-format-unverified'`, 없으면 `'request-echo-unverified'`.
- 결과에 `verification:'single-source-unverified'`, `currencyBasis:'request-assumed-unverified'`, `sessionCalendar:'unverified'`(조기 폐장·휴장 미판별) 추가. 독립 검증 상태로 승격하지 않음.
- 시험 주입용 4번째 인자 `nowMs`(없으면 Date.now()). 기존 호출(3인자) 동작 동일.
- 미검증: 실제 KIS 응답 output1 필드·rsym 형식, 공용 예산·콜백·토큰, PC 배포본 일치.

## 2. has/review-fin-gate.js — 구조화 계약 **초안** (앱·발행 경로 미연결 유지, 채택은 순태씨 승인 별도)
- 합의: 문자열 `'agreed'`는 더 이상 해제 안 함(`consensus-unstructured`). `{status:'agreed', ticker, market, verdict, decidedOn, reviewers:['claude','gpt'], evidence}` — 종목·시장·판단 일치, 카드 기준일 이후·7일 이내·미래 아님, 두 검토자·근거 경로 필수.
- 시세: ticker·market·currency(KR→KRW, US→USD)·priceType 'close'·adjustment·verifier 필수, 서로 다른 출처 2개 이상 evidence(같은 날짜, 유한 양수 종가), marketDate ≤ card.asOf.
- 재무: years는 정수만(NaN·Infinity·소수·문자열 → financials-missing), conflicts 배열 필수, checks 비어 있거나 id/status 없으면 `financials-no-evidence`, `assessment.provenance {ticker, market, synthetic:false, verification:'independent-verified', source}` 없으면 `financials-unverified`. → F.assess가 synthetic을 버려도 출처 표시 없이는 해제 불가.
- 합성 표시: 값이 정확히 false(또는 미기재, provenance는 false 필수)가 아니면 모두 보류(true/'true'/1/null).
- card.asOf(카드 기준일) 없음·미래·7일 초과 → `card-date-invalid`.
- fin-panel 표시 전용 보류 동작은 손대지 않음.

## 3. 시험
- `node --require ./tests/lib/no-network.cjs --test tests/*.test.cjs`: 2510 중 pass 2506 · fail 2 · skip 2. 실패 2건(683 portable proof, 1166 daily repair)은 BASE main ebf3e91에서도 동일(2497 중 fail 2) — 보호 경로 미등록 문제, fin-wire 0887887에서 해결 중.
- 신규/수정: tests/review-fin-gate.test.cjs 19/19(P1 반례 6건 추가: 잘못된 합의·다른 티커/시장/통화·오래된/미래 합의·NaN/Infinity·빈 근거·합성/미검증), tests/kis-overseas-parse.test.cjs 7/7(VM 가짜 Utilities, 네트워크 없음).
- `node tools/scan-secrets.cjs`: findings 0.

## 4. 보호 핀 주의 (지피·순태씨 확인)
- main에는 두 파일이 아직 핀 목록에 없음(그래서 위 BASE 동일 실패). fin-wire 7495cca의 핀은 main 원래 바이트 기준이라, fin-wire와 이 브랜치를 함께 반영하면 아래 값으로 **승인된 수정분만** 갱신 필요:
  - gas/has-kis-overseas.gs `c559e18c44c340d1f18552e58107b5cb1923bdced4f99d588134d101c30a4177` (이전 2d39c20c…)
  - has/review-fin-gate.js `06d7b49803551436228367e76d22d44e30a96395c9cdd26c06e0e81b71b0cf01` (이전 79466280…)
- 이 브랜치에서는 핀을 새로 추가하지 않음(7495cca 복제 금지 지시 준수).

## 5. 순태씨 결정 필요
- 판정 해제 구조화 계약(합의 기록 형식·검토자 2인·출처 2개 이상·7일) 채택 여부. 승인 전에는 해제/발행 경로 연결 금지 유지.
- GAS 파서 변경의 PC 배포는 별도 승인(이번은 저장소만).

## 6. 남은 큐
P2 곡소리 시트 원본 보호 → P3 DART 식별·캐시 → P4 SEC 자동수집 경계 → fin-wire 최종 → fx-alpha(8b20ea4) → price-verify 재기반 → risk-guard → bench-reason → valuation-v1.
