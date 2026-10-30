# 10종목 식별·가격 기준 및 B단계 대조표

실가격 대조 0건. 아래는 공개 공식 문서와 지정 후보에 근거한 매핑이며, 공급자별 현재 거래가능 마스터/API 응답 대조는 **미검증**이다. 가격 수치·기준 거래일을 임의로 채우지 않았다.

| 후보 | 종류·시장 매핑 | 통화·시간대 | 계획 종가·거래일·조정 |
|---|---|---|---|
| MSFT Microsoft | 보통주, Nasdaq/XNAS; KIS NAS 후보 | USD, America/New_York | 비수정 정규 종가, B 실행 때 확정된 마지막 거래일 |
| AVGO Broadcom | 보통주, Nasdaq/XNAS; KIS NAS 후보 | USD, America/New_York | 동일 |
| GOOGL Alphabet A | Class A, Nasdaq/XNAS; GOOG와 구별 | USD, America/New_York | 동일 |
| NVDA NVIDIA | 보통주, Nasdaq/XNAS; KIS NAS 후보 | USD, America/New_York | 동일 |
| QTOP iShares Nasdaq Top 30 Stocks ETF | ETF, Nasdaq/XNAS(운용사 페이지 확인) | USD, America/New_York | 시장 종가 사용, NAV/총수익률/시간외 가격 제외 |
| 005930 삼성전자 | 보통주, KRX/XKRX; 우선주·GDR 제외 | KRW, Asia/Seoul | KRX 정규 종가, 비수정 여부 확인 후 대조 |
| 000660 SK하이닉스 | 보통주, KRX/XKRX 후보 | KRW, Asia/Seoul | 동일 |
| 035420 NAVER | 보통주, KRX/XKRX 후보 | KRW, Asia/Seoul | 동일 |
| 069500 KODEX 200 | ETF, KRX/XKRX 후보 | KRW, Asia/Seoul | ETF 일별매매 경로, NAV/iNAV 제외 |
| 360750 TIGER 미국S&P500 | 한국상장 ETF, KRX/XKRX 후보 | KRW, Asia/Seoul | 기초지수 미국장 마감시각 대신 한국 ETF 종가 사용 |

## 거래일·기업행위 규칙
- US 정규 세션 통상 09:30~16:00 미국 동부 현지시각, 한국 통상 09:00~15:30. 휴일·단축장·제도변경은 최신 거래소 달력과 공급자별 세션 정의로 확인. 고정 UTC 오프셋 사용 금지.
- UTC 취득시각, 현지 거래일, 정규장 종료시각, 관측 가격시각을 구분한다. 실행일을 종가 기준일로 자동 대입하지 않는다.
- 한국은 NXT/통합장/시간외와 KRX를 섞지 않는다. KIS 국내 시장 J 선택 명세 확인, ETF와 주식의 API 서비스 승인 범위 각각 확인.
- 분할/병합·배당·상장폐지·정지 여부를 공식 기업행위 자료로 확인. 조정 규칙이 확인되지 않으면 대조 보류. '공급자 기본값'이 같다고 가정하지 않는다.
- 본 A단계는 합성 캘린더만 시험. 실제 휴일/단축장/기업행위 달력 연동 0건.

## 독립 대조 판정
동일 종목·증권종류·거래소·통화·정규세션·거래일·조정기준이 일치하는 두 경로만 비교한다. 정확 일치 우선. 호가단위·반올림 차이가 있으면 허용 오차를 임의 설정하지 않고 원문을 재확인해 보류한다. 서비스가 달라도 상위 피드가 같을 수 있으므로 경로 검토 증거와 공통 원천 위험을 기록한다. 10개를 무조건 성공시키기 위해 실패 종목을 대체하지 않는다.

## 공식 식별 근거
- https://www.nasdaq.com/market-activity/stocks/msft
- https://www.nasdaq.com/market-activity/stocks/avgo
- https://www.nasdaq.com/market-activity/stocks/googl
- https://www.nasdaq.com/market-activity/stocks/nvda
- https://www.ishares.com/us/products/339775/fund
- https://www.samsung.com/global/ir/stock-information/listing-Info/
- https://www.skhynix.com/ir/UI-FR-IR01/
- https://www.navercorp.com/investment/stock
- https://www.samsungfund.com/etf/product/view.do?id=2ETF01
- https://kind.krx.co.kr/disclosure/etfisudetail.do?isuCd=KR7360750004&menuIndex=0&method=searchEftIsuDetail
- https://www.nasdaq.com/market-activity/stock-market-holiday-schedule

Nasdaq 종목 페이지 일부는 시세 Data unavailable로 표시됨. 종목 식별용 열람이며 시세 검증으로 계산하지 않는다. 개별 KRX 시장구분·통화의 공급자 반환 메타는 B단계 확인 대상이다.
