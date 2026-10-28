# 실제 5종목 파일럿 사전 데이터 계약 — 2026-10-29

**실제 API0 / 실제 가격 검증0 / 활성0.** 아래는 필요한 필드의 정의이며 수집 완료를 뜻하지 않는다. 대상은 MSFT/GOOGL/AVGO/VRT/JPM 최대5개로 제한한다. 회사 식별의 과거 근거와 시세 검증을 구별한다. 현재 권리·인증·최신 실제 가격은 확보하지 않았다.

| 필드 | 필요한 정의/출처 | 차단 조건 |
|---|---|---|
| ticker/issuer/exchange | 공급자 reference와 발행사 IR/거래소 식별 근거·확인일 | 티커 변경/거래소 미확인 |
| currency/timezone | USD / America/New_York, 공급자 메타데이터 | 환산값을 원시USD로 사용, 시간대 미확인 |
| asOf/regularCloseTime | 공식 거래소 캘린더의 최신 **완료된** 정규장 날짜·실제 마감(조기폐장 포함), UTC offset | 휴일/미래/장중/정규장 범위 미확인 |
| close | 정규장 확정 종가, 승인된 vendor의 해당 세션 필드; 공시/허가된 보조자료와 대조 | raw 일봉이라는 이유로 정규장 종가로 단정 |
| adjustment | split-only 기준, 현재 주식수 기준으로 high/close 같은 기준; 배당 조정 여부 별도 | adjusted close(total-return)와 raw high 혼합 |
| high52w/start/end | 명시한 52주 관측기간·정규장 고가 max, 동일 분할 기준의 일별 high; 예상 세션/실제 세션/결측 | 100일 compact로52주 추정, 일중/장외 혼합 |
| source/fetchedAt/delay | 공급자 canonical HTTPS 출처, UTC 조회시각, eod/delayed/realtime 권한과 확정 지연 | 출처/조회시각 누락·인증 query 포함 URL 저장 |
| corporateActions | 분할·배당 이벤트 원문 id·기준일·수정 이력, 동일 share basis 재검증 | 이력 재작성 뒤 기존고가/원가와 혼합 |
| comparison | SPY 및 검증된 업종ETF의 같은80~100일 창·52주/정규장·통화·조정기준, 각 출처 | 업종분류/ETF선택/권리 미확인→상대평가불가 |
| rights | 개인용 API/표시/가공/보관기간/ETF와 재배포 금지 범위, 약관URL·확인/만료일 | 일반 약관만 보고 실제 계정 entitlement 승인 간주 |
| crossValidation | 독립된 공식 또는 허가된 보조 출처·거래일·조정기준·차이와 허용오차 근거 | 웹 위젯/스니펫/문서샘플 가격을 실제 검증치로 채택 |

5종목의 현재 숫자 필드는 모두 null이며 `management/pilot-readiness.json`에 기록한다. SPY는 계획 벤치마크이고 MSFT/AVGO→XLK, GOOGL→XLC, VRT→XLI, JPM→XLF는 기존 **시험용 매핑**이다. 실제 업종·적절한 ETF와 라이선스를 검증하지 않았으므로 확정 비교로 사용하지 않는다. 자료가 없으면 상대성과를0으로 채우지 않고 null/평가불가로 둔다.

기존 providers.js는 일봉 고가의 max를52주 고가로 계산하고 동일 calendar.sessions의 high/close를 검사한다. 합성 캘린더는 휴일을 반영하지 않는 weekday fixture다. 360~370일·240~265세션·80~100일 비교 검사는 실제 거래소 달력의 진위를 보증하지 않는다. 기간 시작/끝·가격조정·시점별 이력의 일관성까지 실제 검증해야 한다. 52주는 본 설계에서 명시된 calendar window의 약1년을 뜻하며 vendor 내장52주 값의 정의와 대조할 때 364/365/366일 차이 및 거래일 경계를 별도로 기록한다.

Massive raw 파서는 합성 전용, readyForSignals=false, regular-session=unverified와 null 통화·거래소·수집시각을 유지한다. 일봉 bars가 정규장만 포함하는지는 따로 검증해야 한다. Alpha Vantage raw high/adjusted close의 혼합 위험과 Twelve 조정옵션은 공급자 비교표를 참조한다. 어떤 어댑터도 이번 단계에 실제연결하지 않았다.

연동 시작 전 통과해야 할 항목: 이용권·안전한 인증·정규장 범위·검증된 거래일·충분한 전체이력·분할기준·5종목 별 독립대조·ETF정합성·오류시 평가불가. 하나라도 미확인이면 활성하지 않는다. 200종목은 이 선행 파일럿 이후다.
