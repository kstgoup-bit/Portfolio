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
