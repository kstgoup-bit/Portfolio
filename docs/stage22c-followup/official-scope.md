# KIS 기본 조회와 보류 기능 분리 — 현행 후속 방침
확인일: 2026-10-30 (한국시간). 이 문서는 이번 사용자 지시에 따라 작성한 후속 방침이다. `docs/stage22c/`와 stage22B의 과거 보고서는 이력으로 보존한다. 과거 문서의 고객센터 답변·추가 실조회 승인 일괄 대기 규칙을 기본 개인 시세 조회의 필수조건으로 사용하지 않는다. 기존 조건부 실조회 승인은 계속 유효하되 안전한 인증과 무료 이용조건 등 실제 선행조건은 충족해야 한다.

## 공식 자료로 진행 가능한 범위
| 공식 자료 | 확인 내용 | 판단 |
|---|---|---|
| [서비스 소개](https://apiportal.koreainvestment.com/about-open-api) | 개인 계좌 고객이 본인 자산 투자 목적으로 시세 이용, 제3자 제공 불가; 개인 Client Credentials 인증 | 개인 내부 기본 조회 개발 진행, 제휴계약을 개인에게 일괄 요구하지 않음 |
| [신청·이용안내](https://apiportal.koreainvestment.com/about-howto) | 계좌·ID 연결 및 API 신청 후 키 발급, 접근토큰 유효시간24시간 | 본인 절차 필요; 이번 실행에서 신청·발급하지 않음 |
| [공식 도구 FAQ](https://apiportal.koreainvestment.com/tools) | Open API 기본 무료 안내, 실제 거래 수수료는 별개 | 기본 조회 무료 안내 확인; 유료 해외시세 신청·추가 구독 제외 |
| [공식 API 개요](https://apiportal.koreainvestment.com/apiservice-summary) | REST 실전 HTTPS9443, TLS1.2/1.3, 기본시세와 주문/계좌 구분 | 두 시세 경로만 요청계획에 허용 |
| [고객 약관](https://file.koreainvestment.com/Storage/customer/guide/regards/openAPI_service_customer.html) | 22C에서 개인 프로그램 업무 한정·키 누설 금지 확인 | 이번 직접 재열람은 도구 오류. 이전 확인내용을 보존하며 새 개정 확인이라고 주장하지 않음 |

개인 전용·일시 메모리 내 기본 조회는 공식 개인 이용 범위에 해당한다는 개발 판단이다. 공개 GitHub Pages에 공급자 가격을 게시하는 기능은 포함하지 않는다. 공식 기본 무료 안내는 모든 시장·데이터 상품·개별 유료 구독까지 무료라는 뜻이 아니다. 계정에 적용되는 요금/권한·시장별 조건은 실제 실행 전에 확인하며, 기본 무료 제공이 명확한 조회를 고객센터 답변 대기만으로 중단하지 않는다.

## 국내·해외 주식과 ETF
| 분류·대상 | 공식 기능·현재 구현 | 허용 범위와 미검증 |
|---|---|---|
| 국내 주식 005930·000660·035420 | [기간별시세 공식 예제](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/inquire_daily_itemchartprice/inquire_daily_itemchartprice.py), FHKST03010100, KRX J·일봉 D·원주가1 | 기본 조회 개발 가능. 실제 응답·확정 거래일은 미검증 |
| 국내 ETF 069500·360750 | 동일 일봉 후보; [공식 구성/시세 예제](https://github.com/koreainvestment/open-trading-api/blob/main/examples_user/etfetn/etfetn_functions.py)에 ETF 서비스와 J 시장 확인 | ETF 시세 기능 제공 확인. NAV를 거래소 종가로 대체하지 않음; 두 ETF 일봉 실응답 미검증 |
| 미국 주식 MSFT·AVGO·GOOGL·NVDA | [기간별시세 공식 예제](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/overseas_stock/dailyprice/dailyprice.py), HHDFS76240000, NAS·GUBN0·MODP0 | 개인 기본 조회 개발 가능. 실제 거래소/권한·최종 종가 미검증 |
| 미국 ETF QTOP | 해외 기본 시세 후보로 같은 경로 설계 | ETF 일반 시세 제공과 개별 QTOP 응답 지원은 구별; QTOP 마스터·해당 계정 응답 미검증 |

원주가·해외 MODP 인자는 기존 계획을 유지했다. 공식 해외 예제는 MODP 옵션과0 예제를 제시하지만 분할·배당 반영과 확정 시각을 모두 정의하지 않는다. 요청 목표가 정규장 종가라는 이유만으로 응답이 최종 종가라고 인증하지 않는다.

[해외증권 설명서](https://file.koreainvestment.com/Storage/customer/guide/regards/service_03_1%283%29.htm)의 미국 시세 안내는 무료/유료 기반 데이터 및 OHLC 차이와 장 종료 후 과거 데이터 갱신을 설명한다. 이 일반 안내를 특정 REST 응답의 최종 확정 증거로 사용하지 않는다. 무료 기본 데이터를 받아도 독립 검증된 종가로 승격하거나 매수·매도 신호에 넣지 않는다.

## 한도와 인증
[공식 유량 공지](https://apiportal.koreainvestment.com/community/10000000-0000-0011-0000-000000000001/post/d0d1a83f-6f8d-4437-9700-6d26702fd989)의 검색으로 읽힌 2026-04-20 기준 안내는 실전18회/초·모의1회/초·토큰발급1회/초다. 직접 문서 열람은 동적 본문이 비어 있었으므로 공개 검색 본문 확인이라는 한계를 기록한다. [공식 README](https://github.com/koreainvestment/open-trading-api/blob/main/README.md)는 토큰 재발급 분당1회로 안내한다. 서로 다른 지표를 혼동하지 않고 향후 더 엄격한 조건을 적용한다. 이후 신규 고객/별도 제한 공지도 있어 실제 계정의 현재 유효 한도는 미확인이다. 18회/초를 모든 계정의 현재 보장 한도로 사용하지 않는다.

HAS 전체 승인 예산은 종전과 동일하게 인증·실패·재시도·추가 페이지·타 공급자 포함 총40회 이하, 인증2회·재시도총8회/연쇄2회다. 이번에 실호출은0회이며 예산을 새로40회 추가 배정한 것이 아니다. 실전송기가 추가될 때는 계정에 표시되는 유효 제한과 보수적 단일 순차 호출 간격을 적용해야 한다. 이번 합성 실행기는 실제 유량 제어가 검증된 전송기가 아니다.

현재 실행 환경에서 KIS 도구/인증 연결이 없고 확인한 KIS 키·토큰 환경변수 바인딩도 모두 없었다. 비밀값을 읽거나 탐색하지 않았다. 현재 상태 관찰용 managed environment_status 도구와 정책 파일도 제공되지 않아 안전한 비밀 주입·KIS 통신 경계를 확인할 수 없다. 사용자 본인이 다른 곳에 키를 보유하지 않았다는 뜻은 아니다. 인증 준비가 확인되지 않아 실제 호출하지 않았으며 고객센터 답변 대기가 원인이 아니다.

## 별도로 보류하는 기능
가격 원문·정규화 값의 디스크 저장/장기 보존·가격 포함 백업, 외부 재배포, 다른 공급자와 독립 대조는 허용범위가 확정될 때까지 분리한다. 공식 문서·계정 조건으로 확인 가능하면 그것으로 판단하고, 문서가 부족한 해당 항목만 필요 시 문의한다. 이 보류는 기본 조회 개발을 막지 않는다. 요청 횟수·상태만 저장하는 비밀/가격 없는 장부는 시세 데이터 저장과 다르다.

본인 서비스 신청을 별도로 결정하면 [공식 신청 페이지](https://securities.koreainvestment.com/main/customer/systemdown/RestAPIService.jsp)를 사용한다. 키·토큰을 채팅·GitHub·HTML·URL·브라우저 저장소에 넣지 않는다. 공식 Trading MCP가 존재해도 현재 연결·권한 제한이 검증됐다는 뜻은 아니며 주문/잔고 기능을 함께 활성화하지 않는다. 키를 이동·삭제하거나 계좌를 자동 개설하지 않았다.
