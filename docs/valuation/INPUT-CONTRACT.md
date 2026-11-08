# 숫자 분석 입력 계약 v1

실행: `HASValuationEngine.analyze(document, nowISO)` 또는 Node `require('./has/valuation-engine.js')`.

`valuation-fixtures.js`의 `create(sector)`가 완전한 **합성** 입력 예시입니다. 반환값에 실제 데이터가 없음을 명시합니다. 실사용 문서를 만들 때 이 숫자를 실제 기업 자료로 바꾸지 않은 채 synthetic 표식만 지우면 안 됩니다.

필수 최상위: version=1, ticker, sector, assetType, currency, synthetic. 업종은 technology, financial, semiconductor, industrial, loss-growth, etf. ETF만 assetType=etf, 나머지는 equity. 지원 통화는 USD/KRW/EUR/JPY/GBP/SYN.

각 observations 항목: 유한한 숫자 value, source, asOf(YYYY-MM-DD), unit, period{kind,start,end}, basis(reported/estimate), verification(independent-verified/unverified). null·빈 값·누락은 0으로 바꾸지 않습니다. 중간 연산 오버플로 방지를 위해 관측값은 0 또는 절댓값 1e-12~1e18, 가치평가 배수는 1e-12~1e6만 지원합니다. 단위 자동 축소/확대는 하지 않습니다. 단위는 금액에 통화, 주가/EPS/주당 순자산에 통화/share, 비율에 %, 주식수 shares, VIX index.

- period.kind: instant, annual, ttm, quarter, forward12m, window(시장 수익률 기간만). instant만 start 생략. 나머지는 start/end 필수.
- ROE의 averageEquity와 ROIC의 averageInvestedCapital은 해당 기간 평균값을 입력합니다. 기말 자본으로 대체하지 않습니다.
- capex는 현금 지출의 양수 크기입니다. 부채비율의 liabilities는 총부채, netDebt의 debt는 이자부 부채입니다.
- Prev 항목은 같은 길이의 전년동기 실적. 이전 자료의 현재 확인일(asOf)과 실제 회계기간(period)을 모두 보존합니다.
- bank capitalRatio/requiredCapitalRatio는 같은 관할·규제 정의의 동일 시점 비율이어야 합니다. 현행 규제 한도를 임의 생성하지 않습니다.
- high52w는 현재 가격과 같은 관측일에 산출된 52주 창의 고점입니다. 고점 발생일을 asOf로 쓰지 않습니다. 주식분할 등 기업행사 조정 일치 여부는 입력 준비 단계의 책임이며 자동 검증 미지원입니다.
- forwardEPS/expectedEPSGrowth는 같은 향후 12개월 추정 기간을 사용합니다. PEG는 성장률의 퍼센트 포인트를 분모로 씁니다.

qualitative의 competitiveAdvantage, management, thesis, cause는 status(intact/deteriorated), note, source, asOf, verification 필요. 반도체 cycle, 산업재 backlog, 적자 성장 growthQuality 추가. ETF는 holdings/tracking/structure. 이는 사용자의 출처 있는 조사 해석이며 모델이 사실을 자동 확인한 것이 아닙니다.

assumptions.valuation: method(earnings/forwardEarnings/normalizedEarnings/book/fcf), lowMultiple, highMultiple, requiredMarginPct, source, asOf, rationale. 정상화 이익은 normalizationReason 추가. 저/고 배수는 사용자가 확인한 산업·기간·방법의 보수적 가정이며 내장 적정 배수가 아닙니다.

선택 stages 3개: basisPerShare, multiple, marketRiskPct, operatingScenario, marketRiskRationale, invalidation. 가정값은 기준 주당 가치와 보수적 하단 배수를 넘지 않고 최종 단계 가격이 순차 하락해야 합니다. 단순 가격 할인 비율 3개만으로는 생성하지 않습니다.

선택 comparables.historicalPER/peerPER: 양수 values 최소 3개, basis=ttm, source, asOf, rationale, verification. 기간·동종 집합의 적절성은 입력 준비 시 원문으로 확인해야 합니다. 이 모델은 입력 배열에서 범위와 중앙값만 계산합니다.

출력 metrics는 label/value/unit/status/formula/reason/inputs를 포함하며 inputs는 출처·시점·기간·단위를 보존합니다. missing/invalid/stale/unverified/not-applicable는 value=null입니다. estimated는 계산에 추정이 포함되었다는 뜻입니다.

연결 API:
- evaluateWatchedStock(stock, document, ctx, nowISO): 문서와 stock/quote에 market(US/KR), quote.ticker가 명시되어야 합니다. 기존 watch-engine을 재사용하되 문서/시세 종목·가격·통화·기준일·합성 여부를 맞춥니다. 기존의 느슨한 fundamentals=ok는 품질 근거로 쓰지 않습니다.
- evidenceReviewPacket(analysis): 기존 6주제 편집기로 가져가기 전 검토 패킷. referenceValue=null/sourceVerified=false를 유지하며 자동 승인하지 않습니다.
- shareRecoveryScenarios(analysis): 기존 복귀 계산기에 수동 비교할 추정 하한/상한. 미래 재매수가격 예측이나 수량 계산이 아닙니다.
