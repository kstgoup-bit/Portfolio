# 오프라인 소스 준비 체크리스트

이 도구는 연결 기능이 아니라 **연결 전 준비 자료의 누락 검사**입니다. 현재 실제 GAS 원천, 응답, 계정 권한은 확인되지 않았습니다. 완전한 입력도 `declared-only`이며 실시간 연결은 항상 `unavailable`, 검증은 항상 `unverified`입니다. 합성 예제를 실제 증빙으로 바꿔 부르거나 `imported`로 지정해도 인증되지 않습니다.

## 실행

```sh
node --require ./tests/lib/no-network.cjs tools/source-readiness-check.cjs docs/data-workbench/source-readiness.synthetic.json
node --require ./tests/lib/no-network.cjs --test tests/source-readiness.test.cjs
```

예제는 모든 항목이 발명된 합성 자료입니다. 실제 공급자 응답이나 SEC 공시 증거가 아닙니다. CLI는 지정한 로컬 일반 파일 하나만 최대 32,768바이트 읽습니다. 링크와 비정상 UTF-8은 거부하며 출력에는 원문·경로·입력 문자열을 넣지 않습니다. 입력 파일은 수정하지 않습니다. 종료 코드 0은 선언 항목의 형식적 완전성, 2는 누락, 1은 오류입니다. 0도 연결 승인이나 검증 성공을 의미하지 않습니다.

브라우저 또는 Node에서 `HASSourceReadiness.inspectJSON(jsonText)` / `require('./has/source-readiness').inspectJSON(jsonText)`을 사용할 수 있습니다. 별도 UI 연결은 없습니다. JSON 문자열만 받으며 알 수 없는 필드는 거부합니다. 최상위는 `version: 1`, `mode: synthetic | imported`와 아래 영역입니다. 필수 항목 누락은 `missing`, 잘못된 형식·모순은 `invalid`, 입력상 충족은 `declared-only`입니다. 네트워크·저장·인증·투자기록·주문 코드는 없습니다.

## 먼저 확보할 자료: 현재 미확인/연결 보류

1. 비밀값을 제거한 GAS 코드의 원천 공급자·엔드포인트 매핑과 응답 예시. GAS는 전달 경로이며 공급자 이름이나 독립 출처가 아닙니다. 이 도구에는 코드나 응답 원문을 붙이지 말고 검토용 로컬 자료 식별자만 넣습니다.
2. 실제 계정 플랜·거래소 시세 이용 권한·실시간/지연/종가 구분 문서. 가격과 요청 수 제한, 표시·파생 분석·보관·재배포 범위는 별도 확인 대상입니다. 이 도구는 약관이나 계정 권한을 판정하지 않습니다.
3. 거래소 가격 기준시각과 수신시각의 필드 정의. 새 수신시각이 과거 가격을 실시간으로 만들지 않습니다. 두 시각이 같아도 거래소 시각의 증거가 되지 않습니다.
4. 비교 공급자의 실제 원천과 계보. 다른 URL/브랜드 또는 다른 originId 선언만으로 독립성이 확인되지 않습니다.
5. OHLC 표본, 수정주가 기준, 기업행동 처리, 거래소 시간대·휴장·단축장 달력과 범위. 이 도구는 메타데이터 존재만 확인하며 바/달력의 정확성은 기존 market-data 검사와 원문 검토가 필요합니다.
6. 재무 원문, 기업 식별, 기간·단위·정정 공시 처리 기준. SEC에는 추가로 선택한 accession/tag/unit/period 등 선택 근거를 가리키는 `secSelectionRef`가 필요합니다. SEC는 주가 공급자가 아닙니다. 기존 sec-facts-adapter의 사실 선택 검사를 대체하지 않습니다.

## 입력 영역

정확한 필드명은 함께 제공한 JSON 예제를 참조합니다. `*Ref`와 `originId`는 영문·숫자·밑줄·하이픈만 사용하는 1~80자 로컬 증빙 식별자입니다. URL, 쿼리, 토큰, 비밀키, 사용자 연락처, 원문 데이터는 넣지 않습니다. 식별자가 실제 자료를 가리키는지 읽거나 검증하지 않습니다.

- `transport`: gas/direct/file, sampleRef, keysOmitted=true. 비밀값 제거를 선언할 뿐 검사나 보증하지 않습니다.
- `upstream`: provider, originId, evidenceRef. GAS 자체를 원천 공급자로 선언하면 오류입니다.
- `quote`: exchangeAt/receivedAt (UTC 초 단위), type, delaySeconds, exchangeTimeEvidenceRef, entitlementEvidenceRef. 거래소 시각이 수신 후면 오류, realtime은 0초, delayed는 양의 지연이어야 합니다. 현재 시각 대비 최신성 판단은 하지 않습니다.
- `rights`: personalDisplay/derivedAnalytics=true, storagePolicy=not-stored 또는 declared-permitted, redistributionPolicy=not-shared 또는 declared-permitted, evidenceRef. 허용 선언만으로 실제 권리가 생기지 않습니다.
- `comparison`: originId, originEvidenceRef, sampleRef. 같은 originId는 오류이며 다른 originId도 미검증입니다.
- `history`: sampleRef, adjustment(raw/split/split-dividend), adjustmentEvidenceRef, calendarEvidenceRef, timeZone(America/New_York 또는 Asia/Seoul), from/through(유효한 날짜).
- `financials`: provider(SEC/DART/other), sampleRef, filingRef, entityIdentityRef, periodRef, unitsRef, revisionPolicyRef. SEC에는 secSelectionRef 추가 필수.

출력은 증빙 원문을 출력하거나 저장하지 않지만 비밀 입력 탐지기가 아닙니다. provider 같은 자유 입력란에도 비밀을 넣지 마세요. 합성 예제의 모든 체크가 채워져 있어도 실제 미확인 항목은 해결되지 않습니다. 실제 연결에는 별도의 권한·비용·보안 확인과 허용된 실행 경로가 필요합니다.

시간·시장 추가 한계: 현재 시각을 받지 않으므로 미래 시각도 선언 검사만으로 배제하지 않습니다. 종목/시장 ID를 포함하지 않아 선언된 시간대가 해당 종목의 거래소와 일치하는지도 판단하지 않습니다. 실제 종목, 현재 시각, 세션 달력을 받는 기존 market-data 검사를 별도로 적용해야 합니다. 완전한 manifest는 연결 준비 완료가 아닙니다.
