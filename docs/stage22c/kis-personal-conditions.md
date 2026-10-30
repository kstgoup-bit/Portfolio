# KIS 개인 직접 이용조건 검토 — 22C
확인일: 2026-10-30 UTC. 실제 인증·공급자 API 호출·신청은 하지 않았다. 공식 공개 문서 열람만 수행했다. 아래 내용은 연결 준비 판단이며, 미확인 항목을 허용으로 간주하지 않는다.

## 개인 고객 약관과 신청
공식 고객 약관 [안내 페이지](https://securities.koreainvestment.com/main/customer/guide/Guide.jsp?cmd=TF04ag010002&currentPage=1&num=270&rowNum=1)의 프레임을 따라 [고객 약관 본문](https://file.koreainvestment.com/Storage/customer/guide/regards/openAPI_service_customer.html)을 확인했다. 본문에는 제정 2022-08-08, 시행 2022-10-01이 표시된다. 현재 공개된 본문이며, 신청 시 적용되는 최신본·개별 약정은 다시 확인해야 한다. 제휴 이용기관 약관을 개인 권리의 근거로 사용하지 않았다.

| 항목 | 확인 결과·조문 | 판단 |
|---|---|---|
| 신청 자격 | 회사 계좌 보유 고객, 만19세 미만 승인 불허(제2·8조) | 자격 확인 필요 |
| 절차 | 홈페이지 약관 동의·본인인증·계좌인증(제7조) | 사용자 본인 수행 |
| 개인 프로그램 시세 이용 | 직접 개발 프로그램 등 개인 업무 한정, 제3자 제공 금지(제5조3항) | 개인 내부 이용 범위 확인 |
| 키 관리 | 제3자 대여·위임·양도·누설 금지(제5조2항) | AI 채팅·공유 서버 전달 금지 |
| 비용 | 별도 게시 수수료 기준 적용(제11조) | 특정 REST 조회 0원은 별도 확인 |
| 호출 제한 | 별도 게시 유량 정책 적용(제12조) | 현재 계정별 수치는 미확인 |
| 보존기간 | 제14조는 회사의 거래기록 보존 의무 | 고객 시세 캐시 기간은 미확인 |

[공식 이용절차](https://apiportal.koreainvestment.com/about-howto)는 계좌·ID 등록 및 연결 후 서비스 신청, Developers 이용 절차를 안내한다. 계좌 개설·신청·본인인증·키 발급은 이번 작업에서 수행하지 않았다.

## 무료·저장·대조 확인표
| 항목 | 공식 근거와 적용 한계 | 상태 |
|---|---|---|
| 국내·해외 주식 일봉 종가 API | [공식 저장소](https://github.com/koreainvestment/open-trading-api), 아래 명세 경로·필드 확인 | 명세 확인, 실응답 미검증 |
| ETF 069500·360750·QTOP 조회 | 주식 가격 경로로 설계하였으나 대상별 응답·권한은 미조회 | 미검증 |
| 일반 API 기본 무료 안내 | [공식 tools](https://apiportal.koreainvestment.com/tools)의 기본 무료 안내만으로 개별 계정·해외 REST 권리 확정 불가 | 해당 범위 미확인 |
| 미국 무료/유료 시세 | [해외증권 설명서](https://file.koreainvestment.com/Storage/customer/guide/regards/service_03_1%283%29.htm) 미국 시세 항목: 무료·유료의 기반 데이터와 OHLC가 다를 수 있고 장 종료 후 과거 데이터를 갱신한다고 안내. 유료 서비스는 별도 신청·요금 | 일반 증권서비스 안내 확인; REST dailyprice 적용·확정 시각 미확인 |
| 현재 REST TPS·일별 한도·토큰 발급 제한 | [공식 공지](https://apiportal.koreainvestment.com/community/10000000-0000-0011-0000-000000000001)의 동적 본문에서 최신 수치 확보 못함 | 미확인; 과거 20TPS 등 재사용 안 함 |
| HAS 자체 상한 | 전체40, 인증2 포함, 재시도 총8·연쇄2, 모든 실패 포함 | 합성 검증; 공급자 허용 한도가 아님 |
| 개인 전용 화면 표시 | 위 개인 업무 조항 범위; 인터넷 공개·제3자 전달 안 함 | 원칙 범위 확인, 구체 구조 문의 |
| 로컬 원시 시세·정규화 시세 저장·백업·보존기간 | 개인 이용 조항에 구체 기간·재사용 조건 없음 | 미확인 |
| 별도 공급자와 개인 내부 종가 대조 | 명시적 허용 조항 확인 못함; 상대 공급자 권리·원천 독립성도 별도 필요 | 미확인 |
| 클라우드 실행기에 비밀 주입 | 개인 키 위임 금지와의 관계·전용 조회 키 지원 불명 | 미확인, 연결 보류 |

## 종가·시간·기업행위
국내 계획은 `/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice` / `FHKST03010100`, 일봉 D, 시작·종료일 동일, 원주가 `FID_ORG_ADJ_PRC=1`, 응답 `stck_bsop_date`·`stck_clpr`를 사용한다. 해외는 `/uapi/overseas-price/v1/quotations/dailyprice` / `HHDFS76240000`, `GUBN=0`, `MODP=0`, 응답 `xymd`·`clos`다. 공식 예제 위치: [국내 함수](https://github.com/koreainvestment/open-trading-api/blob/main/examples_user/domestic_stock/domestic_stock_functions.py), [해외 함수](https://github.com/koreainvestment/open-trading-api/blob/main/examples_user/overseas_stock/overseas_stock_functions.py), [백테스트 데이터 예제](https://github.com/koreainvestment/open-trading-api/blob/main/backtester/kis_backtest/providers/kis/data.py). 예제의 main은 변경 가능하므로 향후 실제 연결 직전 명세 재확인이 필요하다.

원주가 종가 대조와 수정주가 투자 판단은 분리한다. 배당·분할·병합·정정 반영의 상세 공식 규칙과 최종 확정 시각은 미확인이다. 최신가·시간외가를 정규장 종가로 바꾸지 않는다. 휴장일·일자 경계·미국 DST는 독립 거래일 달력과 해당 현지 날짜로 검증해야 한다. 응답 날짜만으로 정규장 확정 종가를 입증할 수 없다. 현재 합성 문맥의 regularClosed 표시는 실제 거래소 확인이 아니다.

| 후보 | 거래소 계획 | 통화·시간대 | 현재 상태 |
|---|---|---|---|
| MSFT·AVGO·GOOGL·NVDA·QTOP | XNAS, KIS NAS | USD / America/New_York | 후보 메타데이터, 실응답·마스터 미검증 |
| 005930·000660·035420·069500·360750 | XKRX, KIS J | KRW / Asia/Seoul | 후보 메타데이터, ETF 포함 실응답 미검증 |

권리·무료 범위·확정 종가 정의·안전한 인증·독립 출처가 해결되기 전 실제 연결을 시작하지 않는다. 구체 문의 문안은 `official-inquiry.md`에 있다.
