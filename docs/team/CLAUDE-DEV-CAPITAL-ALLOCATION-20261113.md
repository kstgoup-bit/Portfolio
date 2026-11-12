STATUS: READY_FOR_REVIEW
ORDER-ID: GPT-20261113-0024 (재검토 — GPT-REVIEW-capital-allocation-20261113-0730 CHANGES_REQUESTED 반영)
BASE: 47d85334775e9b8e2136447f0ef114c8ea664898 (직전 검토 커밋; 그 사이 main 문서 커밋 951fb51 병합 0594604 — 코드 영향 없음)
HEAD: 321f8bbec48076bff83d2580700b6a78db76b535
REVIEW-SCOPE: 지피 지적 1·2·3 반영분만 — `has/capital-allocation.js` 입력 검증 보완, `tests/capital-allocation.test.cjs` 새 시험 3건(사례 약 50개), `tests/lib/live-data-pins.json` SHA 갱신. 시험 게이트 화면(4절)은 다음 단위.

## 재검토 반영 (2026-11-13 08:10 KST 정각 실행)
1. **후보 안 같은 종목 상충 → HOLD_CONFLICT.** `candidates` 안에서 같은 티커(대소문자 무시)가 두 번이면 가격·통화·시세종류(priceKind)·기준시각(quoteAsOf, 같은 순간이면 표기 달라도 일치) 중 하나라도 다르면 판단 보류. **완전히 같은 자료의 중복은 허용**하고 하나로 취급(대안도 하나). 보유↔후보, 보유↔보유 대조도 가격만이 아니라 통화·시세종류·기준시각까지 비교.
2. **비정상 대안·시나리오가 예외 대신 보류.** `alternatives`/`scenarios`/`candidates`가 배열 아님, null·문자열 요소, `allocations` 배열 아님·null 요소·종목 없음·share 문자열/NaN/Infinity, 시나리오 `horizonYears` 0 이하·50 초과·Infinity, `returnsPct` 객체 아님·값 NaN/문자열/-100% 미만/1000% 초과, `partialReinvest`·`convictionSymbols`·`sale` 형식 오류, `holdings` null 요소 → 전체 `HOLD_INSUFFICIENT_DATA`(대안 0개, 의견 '추가 정보 필요'). 형식은 맞지만 음수·합계 100% 초과 배정은 기존대로 그 대안만 '판단 보류'(다른 대안 계산 계속). 추가로 대안 계산을 try/catch로 감싸 예상 못 한 예외도 그 대안만 '판단 보류'.
   - 가정 수익률 범위 -100%~1000%, 지평선 0 초과 50년 이하는 **클로가 정한 입력 오류 판정 범위**(예측 범위 아님) — 지피 의견 환영.
3. **출처·시각 경계.** `asOf` = YYYY-MM-DD 또는 오프셋 있는 ISO 시각(실재 날짜만), `quoteAsOf` = 오프셋(Z/±HH:MM) 필수 ISO 시각, `timezone` = 유효 IANA 시간대, 머리 필드는 문자열 → 형식 오류는 '추가 정보 필요'. 시세 기준시각이 계산 기준시각(날짜면 그 시간대의 날짜)보다 늦거나, 항목별 `quoteAsOf`가 입력 기준시각과 다르면 HOLD_CONFLICT. **엔진은 정규장 시각·출처 일치를 독립 검증하지 않음** — 머리 `priceVerification`에 "엔진은 정규장 시각·출처 일치를 독립 검증하지 않음(실시간·교차검증 완료 아님)", 새 `engineVerification` 필드 "형식·시각 앞뒤만 확인(공급자 교차검증·정규장 시각 확인 없음)".

### 시험
- `tests/capital-allocation.test.cjs` 14건 통과(기존 11 + 새 3).
- 전체 `node --require ./tests/lib/no-network.cjs --test tests/*.test.cjs`: **2003 중 2001 통과 / 0 실패 / 2 skip**(기존 DST TZ 전용). `node tools/scan-secrets.cjs` 발견 0.
- 앱 화면·HTML·GAS 변경 0 → Chromium 해당 없음.

### 미완료·미검증
- 지시서 4절 시험 게이트 화면(다음 단위). 실제 시세·실제 보유 연결 없음(합성만). 세액 산출 보류 유지.
- 순태씨 결정 필요: 없음(운영 반영 대상 아님).

---
(이하 직전 1단위 보고 — 당시 머리: READY_FOR_REVIEW, HEAD 47d8533, BASE 6235eb8)

# 자본배분 비교 엔진 1단계 — 1단위(계산 엔진)
작성: 클로 / 2026-11-13 07:15 KST (예약 정각 실행) · 브랜치 `work/claude-capital-allocation-20261113`

## 우선순위 확인
400종목 곡소리 레이더는 미국 200 원본(순태씨 11-13 제공 예정) 대기 중 → 지시서 1절대로 **충돌 없는 독립 순수 계산 모듈**부터 진행. 레이더 파일·계약은 건드리지 않음. 앱 HTML·서비스워커·GAS 변경 0.

## 변경 파일
- `has/capital-allocation.js` (신규, UMD, 전역 이름 `HASCapitalAllocation`) — 입력 객체만 받는 순수 함수. localStorage·sessionStorage·fetch·document·window 접근 0(시험으로 확인).
- `tests/capital-allocation.test.cjs` (신규 11건)
- `tests/fixtures/capital-allocation-nvda-synthetic.json` (신규, 합성 입력)
- `tests/lib/live-data-pins.json` — `addedRuntimeFiles`에 새 파일 SHA-256 등록(보호 경로 `has/` 신규 파일 검토 등록 규칙. 등록 전 독립 보호 시험 2건 실패 → 등록 후 통과)

## 계약 `capitalAllocationInput.v1`
- 머리: `contract, asOf, quoteAsOf, timezone, market, currency(USD만), source, dataMode(synthetic|verified), freshnessStatus`
- `portfolioScope.kind`: `overseas-account`(보유 평가액+현금) | `total-invested`(+ `otherAssetsUSD`, 사용자 입력 USD 환산값). 결과마다 분모 이름 표기.
- `cashUSD`, `fractionalAllowed`, `fees{sellingFeesUSD, buyingFeesUSD(주문당 고정), buyingFeeRate}`(null = 미반영), `fx{usdkrw, acquisitionUsdKrw, saleUsdKrw}`, `convictionSymbols`
- `holdings[{symbol, qty, averageCost, price(같은 기준시각 평가가격), priceKind, currency, sector, conviction, valuationAssessment}]`, `sale{symbol, qty, priceUSD}`, `candidates[{symbol, priceUSD, currency, sector, conviction}]`
- 선택: `alternatives[{id,label,allocations[{symbol,share}]}]`(없으면 A~E 자동), `partialReinvest{share, symbols}`, `scenarios[{horizonYears, returnsPct{SYM, CASH}}]`(사용자 입력만)
- 보류 규칙: 누락 → `HOLD_INSUFFICIENT_DATA`(의견 '추가 정보 필요'), 충돌 → `HOLD_CONFLICT`(의견 '판단 보류'). 충돌 = 통화 혼합, 보유량 초과 매도, 비용>매도금액, 같은 종목 다른 가격, 보유 평가가격≠후보 매수가, stale/conflict, 합성인데 fresh 표시, verified인데 정규장·시간외 혼합.
- 의견은 `시나리오 비교 가능 / 추가 정보 필요 / 판단 보류 / 비중 한도 주의` 4종만. `canBuyReview`는 1단계에서 **항상 allowed:false**(재무·4단계 조사 미확인 사유 나열, 조건을 다 갖춰도 표시 안 함).
- 한도: 확신 25%, 기타 10% 초과 시 경고 문구 "경고일 뿐 매도 지시 아님". 자동 매도 전환 없음.
- 세금: USD 차익과 분리. 취득·매도 환율 둘 다 있어야 원화 차익만 계산, 세액은 항상 `산출 보류`.
- 머리 `priceVerification`: 합성이면 "교차검증 아님 — 합성 가격, 현재 시세 아님". 엔진은 가격을 교차검증하지 않음.

## 공식(지시서 3절 그대로)
`grossSaleUSD = soldQty×sellPrice`, `grossProfitUSD = soldQty×(sellPrice−avgCost)`, `qty = (배정현금 − 고정수수료)/(가격×(1+수수료율))` → 정수 불가면 내림, 소수점은 6자리 내림, 비용이 현금을 넘으면 한 단위 감소. `netShareChange = 재매수 − 매도`, `weight = 평가액/분모`. 금액은 센트 반올림.

## 손계산 표 (합성 픽스처: NVDA 40.01002주·평단 139.68, 20주 @161 매도, 현재 평가·재매수 NVDA 140, 후보 GOOGL 100·MSFT 400·AVGO 300 — 손계산용 둥근 숫자, 실제 주가 아님. 수수료·세금·환율 미반영, 정수 주문, 분모 = 해외계좌 6,021.40)
매도: 3,220.00 / 차익 426.40 / 잔여 20.01002주(평가 2,801.40)

| 대안 | 주문 | 잔여 현금 | NVDA 주식 수 변화 | 가장 큰 비중 | 의견 |
|---|---|---|---|---|---|
| A 현금 유지 | 없음 | 3,220 | −20 | NVDA 46.52% | 비중 한도 주의 |
| B NVDA 재매수 | NVDA 23주 3,220 | 0 | +3 | NVDA 100% | 비중 한도 주의 |
| C1 GOOGL | 32주 3,200 | 20 | −20 | GOOGL 53.14% | 비중 한도 주의 |
| C2 MSFT | 8주 3,200 | 20 | −20 | MSFT 53.14% | 비중 한도 주의 |
| C3 AVGO | 10주 3,000 | 220 | −20 | 반도체 업종 96.35% | 비중 한도 주의 |
| D 4종 균등(805씩) | NVDA 5·GOOGL 8·MSFT 2·AVGO 2 | 320 | −15 | NVDA 58.15% | 비중 한도 주의 |
| E 50% NVDA | NVDA 11주 1,540 | 1,680 | −9 | NVDA 72.10% | 비중 한도 주의 |

- 비용 0이면 모든 대안의 같은 시점 총액은 6,021.40으로 같다 — 차이는 주식 수가 아니라 **종목·업종 집중과 현금 비중**(시험으로 고정).
- 분모를 전체 투자자산(기타 100,000 USD 가정)으로 바꾸면 D는 '시나리오 비교 가능'(한도 이내), B의 NVDA는 5.68%.
- 지시서 검산: 3,220/140 = 23주(+3), 3,220/175 = 18.4주(소수점, −1.6) / 정수면 18주+잔여 70.

## 시험 결과
- 새 시험 11건 전부 통과(매도·매수·수수료·경계값 0/음수/NaN/±Infinity/문자열·보유량 초과·통화 혼합·분모 0, 분모 2종·25/10% 한도·중복 종목·비중 합 100%, 출처·합성 표기·stale/conflict·누락, 매수 검토 차단, 시나리오, 입력 불변·저장소/네트워크 접근 0, 손계산 표 회귀).
- 전체: `node --require ./tests/lib/no-network.cjs --test tests/*.test.cjs` **2000 중 1998 통과 / 0 실패 / 2 skip**(기존 DST 2건, `TZ=America/New_York` 전용). main 직전 1989 → +11.
- `node tools/scan-secrets.cjs` 발견 0.
- 화면 변경 없음 → 이번 단위 Chromium 360/390/430 해당 없음(다음 화면 단위에서 실시).
- 실거래 기록·백업·localStorage·API 설정 변경 0, 외부 전송 0(엔진 소스에 저장소·네트워크 API 없음, 시험 no-network).

## 미완료 · 미검증
- 지시서 4절 시험 게이트 화면(입력·카드/표, 360/390/430, 탭·뒤로가기·새로고침 회귀) — **다음 단위**. 별도 시험 페이지(기존 앱 미변경) 방향.
- valuationAssessment는 형태만 받음(검증 없음). 실제 시세·재무 연결 없음(2단계).
- 수수료 모델은 주문당 고정+비율 단순 모델. 실제 증권사 수수료·SEC fee 등 미반영(미검증).

## 순태씨 결정 필요
- 없음(합성·독립 브랜치 개발은 협업 승인 범위). 운영 반영 대상 아님.
