# 실제 주가 공급자 비교 — 조회일 2026-10-29

판정: **공급자 미선정·실데이터 API 미연결·파일럿 미실시**. 아래는 공식 문서의 확인 결과이며 계약 체결·요금제 가입·전문가/비전문가 자격 판정을 대신하지 않는다. 실제 시세 엔드포인트 요청은 0건, 조회 티커 0개다. 기존 브라우저 API 키는 읽지 않았다. 웹 문서 조회와 시세 수집을 구분한다.

## 비교표

| 항목 | Alpha Vantage | Twelve Data | Massive |
|---|---|---|---|
| 미국 주식·ETF | 주식 시계열·ETF 관련 API 문서 제공. 정확한 후보별 접근 권한 미실측 [A1] | 미국 주식·ETF 명시. 티어별 종목 접근은 별도 확인 [T1] | 미국 주식·ETF aggregate bars 명시 [M2] |
| 52주 수정고가 | Daily Adjusted의 OHLC는 원시값이고 adjusted close·분할/배당 이벤트는 별도. 수정 종가와 원시 고가를 섞으면 안 됨 [A1] | 일/주/월 가격 분할 조정 안내. 동일 기준의 52주 고가를 전체 기간으로 산출해야 함 [T2] | REST bars는 기본 분할 조정. 52주 bars의 고가를 같은 조정 기준으로 산출 [M2] |
| 배당 조정 | 조정 종가 제공. split-only와 dividend-inclusive 기준 구별 필요 [A1] | 공식 SDK는 all/splits/dividends/none 선택 명시. 실제 플랜별 이용·재현은 미검증 [T3] | REST bars는 배당 미조정. ticks/flat files는 분할도 미조정 [M2] |
| SPY·업종 3개월 | 동일 기간·통화·조정 시계열 필요. 실제 접근 미검증 | 동일 조건의 time_series 필요. 실제 접근 미검증 | 동일 조건의 daily bars 필요. 실제 접근 미검증 |
| 지연·확정 시간 | entitlement에 따라 역사/15분 지연/실시간 구분 [A1] | Basic 미국 실시간 광고와 내부 non-display 표기를 함께 확인. 허용 표시 범위·종가 확정 시간 미확정 [T1,T4] | Basic EOD·2년 이력. 종가 당일 즉시 확정으로 간주하지 않음 [M1] |
| 무료 한도 | 일반 한도 25회/일. Daily Adjusted는 Premium 표기 [A1,A2] | Basic $0, 8 credits/분·800/일. time_series 1종목=1 credit 예시 [T1] | Basic $0, 5 API calls/분, 2년 이력 표기. 일간 총 한도는 미확인 [M1] |
| 유료 가격 | 구독 페이지의 동적 선택 가격을 확인하지 못함: **미확인** [A2] | 조회된 선택 구성 Grow $79/월, Pro $229/월. 최저 구성·세금·추가 권리는 미확정 [T1] | 검색에 노출된 Starter $29/월, 직접 열린 페이지의 Advanced $199/월. 동적 플랜·결제 금액은 재확인 필요 [M1] |
| 개인/상업 | 개인 비상업 사용을 허용하는 약관, 상업 범위는 서면 협의 [A3] | tier별 내부·표시·재배포 권리 구분. Basic의 non-display 표기 때문에 화면 표시까지 무료로 허용됐다고 확정하지 않음 [T1,T4] | 개인·비사업·비상업 사용 및 본인 전용 앱 제한. 계정과 비전문가 요건 확인 필요 [M3,M4] |
| 200종목 | 종목별 200요청 가정만으로 25/일 초과. 무료로 매일 전체를 받는 설계 부적합 | 200×1 + SPY/ETF 12 = 약 212 credits/거래일 가정. 800 내일 수 있지만 분당 8 한도와 표시권·공급 범위 검증이 선행 | 212개별 요청 가정이면 분당 5에서 약 43분. 배치/그룹 방식·필요 기간·지연·접근 권리 미실측 |
| 장애 대응 설계 | 응답의 Information/Note 등 한도 메시지도 실패로 처리 | 429·메시지·partial symbol failure 처리 | 403·429·pagination·휴장/빈 결과 구분 |
| 키 보관 | 새 키는 승인된 서버의 비밀 저장소. 기존 키 재사용 금지 | 동일 | 동일 |

200종목 산술은 **설계 가정**이며 실제 수집 성공·권한 확보·성능 시험 결과가 아니다. 주식 200개+SPY/섹터 ETF 12개를 개별 일봉 이력 요청한다고 가정했다. 페이지네이션, 재시도, 재무/뉴스, 초기 적재 및 분할 재조정 요청은 추가될 수 있다. 서버 비용은 구매·배포 없이 미산정 상태다.

## 파일럿을 실행하지 않은 이유와 다음 단계

현재 승인된 전용 수집 자격증명·계정 및 앱 표시·저장 권리까지 확정된 공급자가 없다. 무료라는 이유만으로 타 사이트를 스크레이핑하거나 기존 키를 추출하지 않았다. 문서의 예제 가격도 실제 파일럿 성공으로 계상하지 않았다. 계정 생성·공급자 확정·유료 자원 생성·과금은 하지 않았다.

후속 승인 시 본인용 비상업 사용 여부와 데이터 표시/저장·가공 권한, 키 보관 위치를 먼저 확정한다. 최대 5티커의 고정 허용목록으로 읽기 전용 수행하고 요청 티커, 종가일, 시간대, 통화, 지연, 수정가격, 공급자, 오류를 기록한다. 52주·3개월 일치 및 분할 조정을 검증하지 못하면 하락 신호와 점수는 표시하지 않는다. AI 점수는 이 파일럿으로 자동 생성하지 않는다.

## 공식 출처 (모두 2026-10-29 조회)

- [A1] [Alpha Vantage API 문서](https://www.alphavantage.co/documentation/) — Daily Adjusted의 원시 OHLC/조정 종가, Premium, entitlement.
- [A2] [Alpha Vantage 구독 페이지](https://www.alphavantage.co/premium/) — 표준 25/일, 프리미엄 일간 제한 없음. 유료 선택 가격은 동적으로 표시되어 미확인.
- [A3] [Alpha Vantage 이용약관](https://www.alphavantage.co/terms_of_service/) — 조회 도구가 반환한 PDF 원문 기준. 검색 요약 일부와 문구 차이가 있어 원문 우선.
- [T1] [Twelve Data 개인 가격](https://twelvedata.com/pricing) — 월 결제 선택 구성. 가격 페이지의 표/선택 구성에서 credit 수가 다르게 표시되므로 유료 실제 배정량은 확정하지 않음.
- [T2] [Twelve Data 수정가격 안내](https://support.twelvedata.com/en/articles/5179064-are-the-prices-adjusted) — 일/주/월 분할 조정, 장중 비조정.
- [T3] [Twelve Data 공식 SDK 문서](https://github.com/twelvedata/twelvedata-java/blob/main/docs/MarketDataApi.md) — adjust enum. 주 문서 전체는 조회 도구 크기 한도로 추출 실패; 해당 부분은 공식 SDK로 보완.
- [T4] [Twelve Data 이용약관](https://twelvedata.com/terms), [개인/상업 안내](https://support.twelvedata.com/en/articles/5332349-commercial-and-personal-usage) — 티어·재배포·가공·저장 권리의 구분.
- [M1] [Massive 가격](https://massive.com/pricing?product=stocks) — Basic/Starter는 공식 페이지 검색 추출에서 확인, 직접 열기에서는 일부 동적 플랜이 Loading으로 나옴. Advanced $199는 직접 열린 페이지에서 확인. 계약 전 재확인 필요.
- [M2] [Massive 분할·배당 조정 안내](https://massive.com/knowledge-base/article/is-massives-stock-data-adjusted-for-splits-or-dividends) — 미국 주식/ETF REST bars와 ticks·flat files 차이.
- [M3] [Massive 개인 약관](https://massive.com/legal/individuals-terms-of-service) — 계정 및 본인 비상업 사용.
- [M4] [Massive 시장데이터 약관](https://www.massive.com/legal/market-data-terms-of-service) — 본인 자산·비전문가 분류, 다른 최종사용자용 앱 제한.

표는 확인된 범위를 요약한 것이며 무료 플랜 가입이나 실제 API 접근이 성공했다는 보고가 아니다. 공식 문서 사이 차이·동적 선택 미확인 값은 실제 공급자 확정 전에 재검증한다.
