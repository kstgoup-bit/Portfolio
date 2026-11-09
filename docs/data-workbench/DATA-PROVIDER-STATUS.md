# 데이터 공급자 상태 · 공식 문서 검토 2026-11-09

공개 문서의 일반 조건과 사용자 계정의 실제 사용 권한은 별개입니다. 이번 검토는 문서를 읽었으며 실제 시세/공시 API 요청·가입·키 발급·결제·다운로드 실행은 하지 않았습니다.

## 현재 GAS

기존 앱의 fetchKR/US/FX는 GAS 중계 응답을 사용합니다. 원천 공급자·계정 플랜·거래소 기준시각·가격 유형·지연·보관/파생 분석 권리는 확인되지 않았습니다. 앱에 도착한 시각을 거래소 시각이라고 보지 않습니다. 비밀키를 제거한 스크립트와 응답 예시가 다음 연결 작업의 최소 입력입니다.

## SEC EDGAR

공시를 제공하며 주가 공급자가 아닙니다. 공개 공시의 무료 재사용이 안내되어 있습니다. API는 로그인/키가 필요 없으나 Fair Access 규칙상 식별 가능한 User-Agent와 요청률 제한(초당 10회)을 준수해야 합니다. 사용자 연락처를 포함하는 실제 요청은 별도 허용된 실행 경로가 확인된 후 진행해야 합니다. CORS를 지원하지 않습니다.

Submissions는 통상 1초 이내, XBRL API는 통상 1분 이내에 갱신된다는 안내이며 보장된 실시간 주가가 아닙니다. Companyfacts는 표준 taxonomy/entity-wide 항목 중심이므로 완전한 세그먼트·사용자 정의 태그 자료를 보장하지 않습니다.

- https://www.sec.gov/search-filings/edgar-application-programming-interfaces
- https://www.sec.gov/about/webmaster-frequently-asked-questions

## OpenDART

무료 이용 원칙과 다운로드·추출·활용 안내가 있으나 회원/API 키가 필요합니다. 통상 20,000건 제한 안내가 있고 실제 한도는 계정/정책에 따라 확인해야 합니다. 공시 정정 가능성이 있으며 정확한 갱신 SLA는 이번 문서에서 확인하지 못했습니다. 원문 장기 보관·재배포를 무제한 허용한다고 해석하지 않습니다.

- https://opendart.fss.or.kr/intro/main.do
- https://opendart.fss.or.kr/guide/main.do?apiGrpCd=DS003
- https://opendart.fss.or.kr/intro/terms.do
- https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS003&apiId=2022001

## Alpha Vantage

공개 안내상 무료는 하루 25회이며 기본 Quote는 EOD입니다. 미국 실시간/15분 지연에는 premium entitlement가 필요합니다. 개인 비상업적 표시·투자 연구 안내와 실제 사용자의 플랜/권한은 따로 확인해야 합니다. 장기 원자료 보관·재배포의 범위를 확인하지 못했으며 특정 유료 가격이나 결제 승인을 가정하지 않았습니다. 기존 OVERVIEW와 단일 점수는 완전한 재무제표가 아닙니다.

- https://www.alphavantage.co/documentation/
- https://www.alphavantage.co/support/
- https://www.alphavantage.co/terms_of_service/
- https://www.alphavantage.co/premium/

## 금융위원회 국내 주식 시세 공공 데이터

2026-10-28 갱신된 공식 카탈로그에는 다음 영업일 13:00 이후 제공되는 일별 자료라고 설명되어 있습니다. 일부 ‘실시간’ 메타데이터와 충돌하므로 실시간 시세로 간주하지 않습니다. 무료 카탈로그와 실제 키/계정 권한은 별개입니다.

공공누리 제4유형(출처 표시·비상업·변경금지)과 제3자 재배포 제한이 보여 파생 분석·장기 재사용을 일괄 허용한다고 단정하지 않았습니다. 분석 사례가 있다는 이유로 포괄적 권리를 추론하지 않습니다. 상업용은 KRX 계약 등 별도 경로가 필요할 수 있습니다.

- https://www.data.go.kr/catalog/15094808/openapi.json

## 결론

무료 실시간 연결을 확인한 공급자는 없습니다. 현재 GAS를 먼저 이해하고 SEC/DART 재무 입력과 권리 확인된 종가 경로부터 검증하는 순서가 안전합니다. 새 작업대는 권리 선언과 데이터 계약을 기록·검사하는 개발 도구이며 법률 판단이나 계정 권한 인증 기능이 아닙니다.
