# 실제 5종목 데이터 연결 재검토 — 2026-10-29

판정: **공급자 미선정, 승인된 권리·인증 없음, 실제 시세 API 0건**. 기존 localStorage 키 조회·외부 전송·계정 생성·구매 없음. 공식 웹 문서 조회는 API 수집이 아니다. 웹 페이지의 시세 위젯과 문서 샘플을 실제 시세로 채택하지 않았다. 이번 수치는 API0/실제 가격 검증0/실제 활성0/후보보류16/제외0이다.

| 권리/기능 | Alpha Vantage | Twelve Data | Massive |
|---|---|---|---|
| 개인 사용 | 개인·비상업 조건, 계정 entitlement 필요 [A1,A2] | individual/internal 조건 및 티어별 [T1,T2] | 개인·비사업·비상업, 본인만 쓰는 앱 제한 [M1] |
| 화면 표시 | 개인 display 라이선스 일반 조항과 실제 dataset/entitlement 별도 확인 | Basic non-display, Grow 표시 접근 표기. 외부 표시 별도 [T2,T3] | 본인 전용 표시 범위와 계정 분류 확인, 타 사용자 앱 불가 [M1,M4] |
| 로컬 저장 | 장기 원시 이력·캐시/삭제 조건 미확정 | tier/문서의 허용 보관기간 초과 금지, 기간 미확정 [T1] | 영구 저장 권리/해지 후 처리 미확정 |
| 가공 | 연구/분석 조건 안에서 실제 이용권 확인 필요 | 원본 복원이 불가능한 derived data 조건, 공개 attribution·권리 별도 [T1,T2] | 본인 분석 조건과 별도 제약 확인, 재배포 권리 미확보 |
| 52주 고가/조정 | Daily Adjusted Premium; raw OHLC와 배당/분할 adjusted close 혼합 금지 [A3] | 일·주·월 split 조정, 장중 raw; 배당 별도 검토 [T4] | aggregate split-adjusted, 배당 미조정; ticks/flat raw [M3] |
| SPY/업종 ETF | 종목별 접근권, 동일 조정/기간 검증 안 됨 | 주식/ETF 상품 표기, 실제 권리/coverage 미검증 | 주식/ETF bars, 실제 권리/동일 정규장 범위 미검증 |
| 가격·한도 | 표준25요청/일, premium 일간제한 없음; 유료 가격 동적 선택 추출 안 돼 미확인 [A2] | Basic $0, 8 credits/분·800/일. 조회된 Grow $79/월, Pro $229/월 구성. 최소 견적 아님 [T3] | 공식 Stocks 무료5req/분. 요금 페이지 본문 Loading으로 현행 유료 금액·일간 한도 미확인 [M2] |

무료 호출한도 안이라는 이유로 화면 표시·보관·가공을 승인된 것으로 보지 않는다. 유료 요금 확인은 구매 승인이 아니며 구매하지 않았다. 기준일은 모두 위 확인일, 동적 문서의 표현·규정은 나중에 달라질 수 있다. 실제 계정과 공급자 확인 없이는 법적 이용 가능 확정 판정이 아니다.

## 공식 출처

- A1 https://www.alphavantage.co/terms_of_service/ — 개인 비상업/EULA.
- A2 https://www.alphavantage.co/premium/ — 표준25/일, 유료 동적 폼.
- A3 https://www.alphavantage.co/documentation/ — Daily Adjusted의 필드와 premium, ETF symbol 지원.
- T1 https://twelvedata.com/terms — 2026-01-01 약관, §2.2/2.3의 표시·가공·저장 기간 제한.
- T2 https://support.twelvedata.com/en/articles/5332349-commercial-and-personal-usage — individual/business, derived data와 별도 재배포 조건.
- T3 https://twelvedata.com/pricing — Basic8/800, Grow/Pro 선택 구성. 표의 55+/610+와 선택 구성377/1597이 달라 최소 구성을 단정하지 않음.
- T4 https://support.twelvedata.com/en/articles/5179064-are-the-prices-adjusted — 분할 조정 안내.
- M1 https://massive.com/legal/market-data-terms-of-service — 2025-08-28 개인용 조건.
- M2 https://massive.com/stocks 와 https://massive.com/pricing?product=stocks — Stocks 무료 한도와 동적 요금 미확인.
- M3 https://massive.com/knowledge-base/article/is-massives-stock-data-adjusted-for-splits-or-dividends — 조정과 시점별 이력 재작성.
- M4 https://massive.com/knowledge-base/article/which-plan-do-i-need-to-show-massive-data-in-my-app — 본인/외부 사용자 구분.
- M5 https://massive.com/docs/rest/stocks/aggregates/custom-bars — 일봉 raw JSON 형태와 timestamp/adjusted/resultsCount/next_url. 문서만 열고 sample API를 호출하지 않음.

## 구현/미구현

`radar/vendor-massive.js`는 M5의 형태에 따른 **합성 전용 오프라인 파서**다. ticker·status·adjusted·pagination·개수·가격·중복·뉴욕 날짜 변환을 시험한다. next_url은 따라가지 않고 차단하며 원문 오류나 query credential을 출력하지 않는다. 일봉/1배 요청 context를 요구하지만 이 입력의 진위를 보증하지 않는다. regular-session 여부·통화·거래소·수집시각·지연을 raw JSON만으로 확정하지 않고 null/미확인으로 남긴다. `readyForSignals:false`, session=unverified이므로 기존 providers 계약의 실제 신호 입력으로 쓸 수 없다. UI 연결·실제 네트워크 transport·권리 gate 해제는 없다.

Alpha Vantage/Twelve Data 벤더별 파서는 미구현이다. AV의 raw high와 adjusted close에서 동일 분할 기준 high를 재구성하는 방법 및 배당 분리를 실제 이력과 대조하지 않았으므로 억지 구현하지 않았다. Twelve는 실제 요청 조정 옵션·응답 메타데이터/표시·보관 권리 검증 후 구현 대상이다.

MSFT/GOOGL/AVGO/VRT/JPM의 최신 정규장 종가·52주 고가·수집 시각·지연·독립 교차 검증은 전부 **미실시/null**이다. 4단계의 회사 식별 근거는 가격 검증으로 승격하지 않았다. 200 확대는 이 5종목의 실제 권리·정규장·최신 거래일·분할·52주 누락·독립 대조 통과 후에만 진행한다. 새 후보 활성화나 실제 가격 삽입은 하지 않았다.
