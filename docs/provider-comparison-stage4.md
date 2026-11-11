# 공급자 재검토 — 2026-10-29

공식 가격·문서·약관을 다시 열어 확인했다. **공급자 미선정·승인된 이용권/인증 입력 없음·실제 시세 API 요청 0건**이다. 브라우저의 기존 Alpha Vantage/Gemini 키를 읽거나 계정·유료 자원을 만들지 않았다. 웹 문서 열기/검색과 실제 시세 API 수집을 구분한다. 원문과 동적 추출 실패를 함께 남긴다.

| 항목 | Alpha Vantage | Twelve Data | Massive |
|---|---|---|---|
| 개인 조회·보관·표시 | 개인 비상업 사용 허용 범위는 약관 확인. 실제 계정 entitlement 및 이 앱 표시·장기 보관 권리 미확정 [A3] | 내부·표시·non-display·가공·재배포 권리를 티어별로 구분. Basic의 non-display 표기를 확인했으므로 무료 화면 표시를 가정하지 않음 [T1,T3] | 개인·비사업·비상업, 본인 자산/본인 전용 앱 제한. 계정의 분류·실제 권리 미확정 [M3] |
| 재배포 | 별도 서면 협의 여부 확인 필요 | 별도 허용·계약·거래소 조건 확인 필요 | 개인 권리로 타 최종사용자용 앱을 만들 수 있다고 가정하지 않음 |
| 종가·52주 고가 | Daily Adjusted는 raw OHLC와 adjusted close/분할·배당 이벤트를 분리 제공. 원시 고가와 조정 종가 혼합 금지 [A1] | 일/주/월 분할 조정 안내; 장중 비조정. 52주 수정고가는 동일 조정 일봉으로 검증해야 함 [T2] | REST aggregate bars는 분할 조정 기본·배당 미조정. ticks/flat files는 비조정 [M2] |
| SPY·업종 ETF | 실제 티어별 접근·동일 기간·통화·조정 검증 미실시 | 미국 주식·ETF 표기. 실제 시계열 비교 미실시 | 미국 주식·ETF bars 표기. 동일 기간 비교 미실시 |
| 기준일·지연 | entitlement별 역사/지연/실시간 구분. 최신 확정 종가 실측 없음 | 미국 실시간 광고가 이 앱 사용권까지 확정하지 않음. 종가 확정 시간 미확인 | Basic EOD 표기. 최신 정규장 확정 시각 실측 없음 |
| 무료 한도·비용 | 표준 25요청/일. Daily Adjusted Premium 표기. 유료 선택 금액은 동적 폼 추출 실패: **미확인** [A1,A2] | Basic $0, 8 credits/분·800/일. 조회된 Grow 선택 구성 $79/월, Pro $229/월. 최저 구성/실제 견적은 미확정 [T1] | Basic $0·5 calls/분은 공식 검색 추출에서 재확인. 직접 열린 요금 페이지는 일부 Loading. 직접 확인된 Advanced $199/월 외 동적 견적·일간 한도는 미확인 [M1] |
| 200종목 계획 | 주식200+참조12를 종목별 1요청으로 가정하면 212요청/거래일; 무료25 초과 | 같은 가정이면 212 credits, 분당8에서 27개 분당 구간. 800내라는 산술만으로 권리/성능 보장 안 됨 | 같은 가정이면 분당5에서 43개 분당 구간. 배치·그룹·페이지네이션 실측 없음 |
| 키·장애·지속성 | 승인된 서버 비밀 저장소, 200 응답의 한도 메시지/HTTP 오류 구별 | 동일; 표시·캐시 권리 확인 및 부분 실패 구별 | 동일; 403·429·빈 결과·이력 제한 구별 |

212요청은 추가 재무/뉴스·재시도·초기 이력 적재를 제외한 **설계 가정**이다. 이번 작업에서 실제로 실행하지 않았다. 비용은 데이터 플랜과 별도 서버/저장/전송·거래소 조건을 확인한 뒤 산정해야 하며 구매·과금은 하지 않았다. 서비스 중단·수정가격 재작성·티커 변경에 대비해 원래 가격 기준일과 수집 시각, 출처, 수정 이력을 분리해 보관해야 한다. 자동 무제한 재시도나 무료 프록시 우회는 하지 않는다.

## 공식 출처와 조회 한계

모두 2026-10-29 재조회. 아래 원문 외의 검색 스니펫 시세는 가격 파일럿 자료로 사용하지 않았다.

- [A1] [Alpha Vantage API 문서](https://www.alphavantage.co/documentation/) — Daily Adjusted와 entitlement, 원시/조정 구분.
- [A2] [Alpha Vantage 구독](https://www.alphavantage.co/premium/) — 25/일과 프리미엄 일간 제한 없음. 동적 유료 가격 미확인.
- [A3] [Alpha Vantage 약관 PDF 원문](https://www.alphavantage.co/terms_of_service/) — 개인 비상업 라이선스. 문서 조회가 계정 이용권 승인을 뜻하지 않는다.
- [T1] [Twelve Data 가격](https://twelvedata.com/pricing) — Basic non-display, 8/800, 선택 구성 월액. 표의 유료 credit 55+/610+와 선택 구성 377/1597 표시 차이가 있어 실제 선택 플랜을 확정하지 않는다.
- [T2] [Twelve Data 수정가격](https://support.twelvedata.com/en/articles/5179064-are-the-prices-adjusted).
- [T3] [Twelve Data 약관](https://twelvedata.com/terms), [개인/상업 안내](https://support.twelvedata.com/en/articles/5332349-commercial-and-personal-usage). 별도 상업·재배포 권리를 승인받지 않았다.
- [M1] [Massive 가격](https://massive.com/pricing?product=stocks), [공식 주식 상품](https://massive.com/stocks) — 동적 가격 추출 제약. 공식 검색 결과와 직접 열기 결과를 구별했다.
- [M2] [Massive 조정 방식](https://massive.com/knowledge-base/article/is-massives-stock-data-adjusted-for-splits-or-dividends).
- [M3] [Massive 시장데이터 약관](https://massive.com/legal/market-data-terms-of-service).

## 이번 구현의 정확한 범위

`radar/providers.js`는 **특정 공급자에 미연결인 정규화 일봉 계약 어댑터**다. 새 실제 API 주소·키 입력·서버를 포함하지 않는다. 승인된 권리·인증과 검증된 거래일 캘린더(UTC 조회일의 확인일, 뉴욕 종가일·마감 시각)를 외부에서 제공하고, transport가 승인된 5개 티커의 응답을 반환하는 구조다. 실제 벤더별 raw JSON 변환·보안 프록시는 후속 범위다. 비교 참조는 같은 배치에 제공될 때만 사용하며 추가 참조 API를 자동 호출하지 않는다. 참조 수집도 나중에 별도로 이용권·비용을 승인받아야 한다.

정규화 계약은 최신 정규장 거래일과 마감 시각, 52주 캘린더/거래일 누락, USD·뉴욕 시간·split-adjusted·출처·조회시각·지연을 확인한다. 가격이 오래됐거나 불명확하면 해당 종목을 실패로 격리한다. SPY/업종 데이터가 없으면 상대 신호를 평가 불가로 둔다. HTTP 401/403/429/5xx, HTTP200 한도 메시지, 시간 초과·취소·중복 티커·누락을 합성 응답으로 시험했다. 오류 본문/자격증명 URL은 출력하지 않는다. 출처·약관·캘린더 URL은 HTTPS이며 인증 정보·쿼리·fragment 없이 canonical URL을 사용한다.

캘린더도 합성 시험에서는 휴일을 반영하지 않은 합성 weekday 목록이다. 실제 NYSE 캘린더·최신 거래일을 검증한 것이 아니다. `verification:verified`는 후속 시스템이 검증 근거를 제공해야 하는 계약 필드이며 코드가 외부 문서의 진위를 자동 보증하는 것은 아니다. 실제 어댑터의 승인 값도 현재 설정하지 않았다.

캘린더는 UTC 조회일에 재확인되어야 하며 뉴욕 기준 종가일이 미래이거나 4달력일을 넘게 오래됐으면 보수적으로 호출 전 차단한다. 이는 실제 거래소 휴일 판정의 대체물이 아니며 장기 휴장 등 예외도 확인 전에는 평가 불가로 남긴다.

SECTOR의 XLK/XLC/XLI/XLF 대응은 고정 파일럿의 시험·계획용 매핑이다. 실제 업종 분류와 적절한 비교 ETF 매핑은 아직 검증하지 않았으며 실제 연동 전에 공식 분류 근거와 승인 범위를 확인해야 한다. 현재 이 매핑으로 실제 가격 신호를 계산하지 않았다.
