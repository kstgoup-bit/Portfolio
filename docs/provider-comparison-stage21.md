# HAS 21단계 공급자 검토 — 2026-10-30
공식 공개 문서 열람만 수행. 가입·키 발급·가격 API 실호출 없음. 공개 페이지의 예시 가격은 검증 가격으로 계산하지 않음.

| 공급자 | 공식 API·시장 | 가격·시각·기업행위 | 제한·요금 | 개인 표시·저장·키 |
|---|---|---|---|---|
| 한국투자 KIS | 공식 REST/WS, 국내·해외 | 시세/실시간 서비스 제공. 개별 시장 지연 여부·타임스탬프·수정주가 계산 미확인 | 개인 API 기본 무료 안내. 정확한 현재 TPS·해외 이용료 미확인 | 개인 계좌·서비스 신청 필요. 저장·독립대조·표시 범위 약관 미확인. 앱키/시크릿은 브라우저 배포 금지 설계 |
| KRX OPEN API | 공식 국내 일별매매, 미국 미지원 | 일별 자료, 실시간 아님. Asia/Seoul 기준일로 정규화 필요. 배당·분할 수정 여부 미확인 | 현재 호출 한도·비용 미확인 | 홈페이지 약관과 API 라이선스는 구분. API 저장·표시·보존·대조 허용 범위 미확인. 인증키 서버 보관 권고 |
| Twelve Data | 공식 REST/WS, 미국·글로벌; 한국 개별 거래소/등급 미확인 | 종가/장중 구분, 거래소 시간대 메타. 일봉 분할 조정, 장중 비조정 | Basic 8 credits/min·800/day, Grow 월 $79·Pro $229·Ultra $999(열람 시 표시). 종목별 비용 합산 | 외부 표시는 별도 권리, 저장기간·비표시 계산 권리 등급별 확인 필요. 키 공유 금지. 가격과 지연 범위는 시장별 확인 필요 |
| Tiingo | 공식 EOD/WS, 미국 지원·한국 미확인 | EOD와 장중 별도. 분할/배당 처리 문서 있음; 시간대 필드 실응답 미검증 | Starter 무료 50/h·1000/day, Power $30/month·10000/h·100000/day | 2026-10-06 약관: 무료 영구저장 불가, 유료 종료 시 원자료 삭제 요구. 다른 데이터 대조 제한. 현재 용도의 자동 추천에서 제외, 별도 허용 확인 필요 |
| 기존 GAS JSONP | 앱이 지정한 사용자 웹앱, 하위 가격 공급자 미확인 | 보유종목 currentPrice/freshPrice. 취득시각·종류·기업행위 미확인 | 한도·요금·장애 SLA 미확인 | 하위 약관·저장/표시 허용 미확인. 응답 스크립트가 앱 출처에서 실행됨 |
| 기존 Yahoo+중계 | 비공식 Yahoo 주소와 제3자 CORS 중계, 주로 지수·위험 | 기준시각/조정/종가 정의 보장 미확인 | 현재 한도·요금·SLA 미확인 | Yahoo 및 중계 약관 미확인. 실가격 신뢰 공급자로 채택하지 않음 |

## 추천 (연결 승인 아님)
1순위는 KIS(미국·한국을 함께 조회할 후보). 개인용 표시·보존·독립 대조 허용 및 시간대/조정주가 명세를 확인하기 전 연결 보류.
대체는 미국 Twelve Data, 한국 KRX 일별자료. 한국 ETF 범위와 저장권은 추가 확인. 단일 무료 공급자로 전 시장을 충족한다고 결론내리지 않음.
Tiingo는 저장/검증 목적과 약관 충돌 가능성이 있어 기존 추천을 승계하지 않음.

## 승인 후 10종목 시험 계획
- 후보: 미국 MSFT·AVGO·GOOGL·NVDA·QTOP, 한국 005930·000660·035420·069500·360750. ETF/종목코드 지원 확인 실패는 실패로 기록하고 임의 대체하지 않음.
- 먼저 공급자별 개인 표시·저장기간·외부 대조 권리와 비용 0원 상한을 확정. 주문 API는 제외한 조회 전용 도구만 사용. 키는 로그·URL·ZIP에 넣지 않음.
- 거래 종료 후 확정된 동일 거래일 정규 종가를 1차 10건 조회. 독립 출처 대조 10건 별도 예산. 배당/분할일, 원주/ADR, 통화, 거래소, 일광절약시간, 정규/시간외, 수정/비수정 기준을 맞춤.
- 종목당 가격 차이는 거래소 최소 호가 이내, 거래일·통화·종류는 완전 일치. 차이가 있으면 평균으로 보정하지 않고 보류. 분할 기준이 다르면 비교 중단.
- 10초 타임아웃, 429 Retry-After 준수, 최대 2회 재시도(총 예산에 포함), 실패값·이전값으로 새 신호 생성 금지. 거래일 달력으로 휴일/장마감 구분. 관문의 4일 상한은 달력 대체 수단이 아님.
- 취득시각·기준일·독립 출처·기업행위 확인 증거·허용 보존기간을 기록. 저장권 없는 가격은 메모리에서만 대조하고 증거에 가격을 남기지 않음. 허용되지 않으면 시험 자체 보류.
- 최초 10건 모두 통과해도 운영 신호는 별도 승인 전 비활성. 세션 수신 종목 수를 활성 감시 수와 혼동하지 않음.

## 공식 근거
- https://apiportal.koreainvestment.com/about-howto
- https://apiportal.koreainvestment.com/apiservice-summary
- https://apiportal.koreainvestment.com/provider
- https://openapi.krx.co.kr/contents/OPP/INFO/service/OPPINFO004.cmd
- https://data.krx.co.kr/contents/MDC/INFO/informationController/MDCINFO003.cmd
- https://twelvedata.com/docs
- https://twelvedata.com/pricing
- https://twelvedata.com/terms
- https://support.twelvedata.com/en/articles/5179064-are-the-prices-adjusted
- https://www.tiingo.com/documentation/end-of-day
- https://www.tiingo.com/about/pricing
- https://app.tiingo.com/tos/
KRX 소개/이용안내 2개 URL은 열람 실패. API 약관을 홈페이지 일반약관으로 대체하지 않음. 모든 내용은 실응답 검증 전 문서 조사임.
