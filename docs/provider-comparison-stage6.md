# 공급자 최종 사전 확인표 — 2026-10-29

**공급자 미선정 / 실제 이용권 미확보 / 안전한 인증 주입 없음. 실제 API 호출0.** 아래 공식 문서를 재조회했다. 개인용 공개 약관과 실제 계정 entitlement는 구별한다. 가입·키 요청·키 조회·유료 자원 생성은 하지 않았다. 웹 문서의 위젯과 sample response를 실제 시세로 쓰지 않았다.

| 구분 | Alpha Vantage | Twelve Data | Massive |
|---|---|---|---|
| 개인 화면 표시 | 개인·비상업 install/use/display 일반허용 [A1]. 대상 데이터 entitlement 미확인 | Basic internal non-display. Grow internal display 표기 [T1]. 계정별 확정권리 미확인 | 개인·비사업·비상업, 본인 전용 앱 조건 [M1]. 계정 분류/개별 entitlement 미확인 |
| 가공·로컬 저장 | 개인연구 범위·장기 원시보관/해지후 처리 미확인 | 내부 처리/저장·원본 복원 불가 derived 조건, 허용기간 초과 보관금지 [T2,T3]. 구체적 기간 미확인 | 본인 분석 범위·재배포 금지. 장기 캐시/가공 결과 보관 세부권리 미확인 |
| 정규장/지연 | historical/realtime/delayed entitlement 구분. 확정 정규장종가 실제검증 없음 [A3] | 미국 realtime 상품 표기만으로 최신 확정 종가 판단하지 않음 [T1] | Basic은 과거일 EOD. 거래일 **자정ET 이후** 접근, 16시 마감 직후 현재일 bars는 불가 [M3]. 정규장만의 범위는 별도검증 |
| 52주·분할/배당 | DailyAdjusted Premium, raw OHLC와 배당·분할 adjusted close가 다름 [A3] | 일/주/월 split 조정·장중 raw; 배당 별도 [T4] | REST aggregates split 조정·배당 미조정, ticks/flat raw [M4] |
| SPY/업종 ETF | 실제 접근권·통화·동일기간·동일조정 미검증 | 주식/ETF 상품, 실제 티어 coverage·비교권리 미확인 | 주식/ETF bars, 실제 comparison/저장권리 미확인 |
| 무료/유료·한도 | 표준25/일. DailyAdjusted premium. 동적 유료금액 미확인 [A2,A3] | Basic $0·8credits/분·800/일. 조회 구성 Grow $79/월·Pro $229/월, 최소구성 확정 아님 [T1] | 공식 Stocks 무료5req/분 [M2]. 요금페이지 일부Loading, 현행 유료금액/일간한도 미확인 [M5] |
| 5종목 선행 | 주식5+SPY/4업종ETF=10 종목요청 가정은25내이나 premium/권리조건 해결 아님 | 같은가정10credits도 표시·저장권리 해결 아님 | 같은가정10요청·2분당구간은 실제성능/정규장범위 보장 아님 |
| 200종목 준비 | 200+참조12=212요청 가정은 무료25초과 | 같은가정212credits·27개 분당구간, 일800내라는 산술만 성립 | 같은가정212요청·43개 분당구간, 일간한도 미확인 |
| 이번 판정 | 실연동 보류 | 실연동 보류 | 실연동 보류, 기존 합성파서 유지 |

위 요청 수는 종목별1회/거래일·참조중복제거를 가정한 **설계 산술**이며 재무·뉴스·페이지네이션·재시도·초기 이력 적재를 제외했다. 배치/그룹 endpoint의 entitlement와 실제 호출량은 검증하지 않았다. 무료 한도·상품 마케팅은 사용자 계정 권리 승인 근거가 아니다. 구매를 권하거나 서비스를 생성하지 않는다. 기존 providers.js의 권리gate는 API/store/display/personal/auth의 계약필드를 검사할 뿐, 가공/ETF권리·보관기간·실제 계약 진위를 완전히 검증하지 못한다. 실연동 전에 이 항목의 근거와 검증 정책을 확장해야 한다.

## 공식 출처와 한계

모두 위 확인일 재조회. 자료 내 위젯 시세/문서샘플은 채택하지 않음. 미확인은 미확인으로 유지한다.

- A1 https://www.alphavantage.co/terms_of_service/ : 개인 비상업 및 EULA 조건.
- A2 https://www.alphavantage.co/premium/ : 표준25/일, premium 일간제한없음, 가격 동적폼.
- A3 https://www.alphavantage.co/documentation/ : daily raw/adjusted 필드·Premium·entitlement.
- T1 https://twelvedata.com/pricing : Basic8/800 non-display, Grow표시, 선택구성금액. 비교표55+/610+와 선택377/1597차이는 실제 플랜 견적에 확인 필요.
- T2 https://twelvedata.com/terms : 2026-01-01 약관§2.2/2.3 표시·가공·저장기간.
- T3 https://support.twelvedata.com/en/articles/5332349-commercial-and-personal-usage : 개인/상업·derived·재배포 구분.
- T4 https://support.twelvedata.com/en/articles/5179064-are-the-prices-adjusted : 분할조정과 intraday구분.
- M1 https://massive.com/legal/market-data-terms-of-service : 2025-08-28 개인·본인전용앱 조건.
- M2 https://massive.com/stocks : 무료5req/분 및 개인플랜 설명.
- M3 https://massive.com/knowledge-base/article/on-the-free-basic-plan-when-can-i-pull-the-previous-trading-days-data : 무료EOD의 자정ET 기준, 현재일403·초과429 구별. 이403은 **공급자 권한/시점 예시**이며 이번 실제 시세 API403을 관측한 것이 아니다.
- M4 https://massive.com/knowledge-base/article/is-massives-stock-data-adjusted-for-splits-or-dividends : split-only와 이력 재작성.
- M5 https://massive.com/pricing?product=stocks : 일부 Loading으로 현행 유료견적 미확인.
- M6 https://massive.com/docs/rest/stocks/aggregates/custom-bars : ET집계와 raw JSON. 일봉만으로 regular session 범위를 보증하지 않음.

## 연결 전 승인/미확정 체크리스트

개인/비전문 분류, 본인 전용 화면, 원시 일봉/가공점수 저장기간과 해지후 삭제, SPY/업종ETF 접근·비교, 분할/배당/정규장범위, 안전한 인증 주입 위치와 로그 비노출, 호출예산·지연/오류정책을 확인해야 한다. 사용자는 **비밀키를 채팅으로 보내지 않는다**. 현 브라우저localStorage의 기존키를 읽거나 재사용하지 않는다. 이번에 새로운 비밀저장 구조/서버는 만들지 않았다. 권리 확인 후 별도 범위로 최소5종목 읽기전용 검증을 진행해야 하며200확대·배포 승인까지 포함된 것으로 해석하지 않는다.
