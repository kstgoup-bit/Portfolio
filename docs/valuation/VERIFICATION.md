# 검증 기록

## 최종 실행

- `npm run test:valuation-regression`: **817/817 통과**, 실패 0, 건너뜀 0. 전체 테스트가 아니라 명시적인 61개 파일의 오프라인 회귀 집합입니다.
- 포함: 기존 원장/백업/참모/가격 신뢰/감시/보안 회귀, 신규 엔진 74개, 독립 검토 14개, UI 정적 격리 1개.
- 독립 검토의 한 시험은 120개 EPS·배수·가격 조합을 별도 산식으로 대조했습니다. 이를 120개의 추가 테스트라고 합산하지 않습니다.
- DOM 동작: 6개 가상 업종, 독립 평가 3개, 근거 섹션 5개, 출처, 반복 실행, 잘못된 입력, XSS 문자열, 초기화, 기존 저장소 표식 불변 통과.
- `node tools/scan-secrets.cjs`: 발견 0.
- 구문 및 `git diff --check`: 통과.
- 외부 금융 API·실제 계좌·실제 백업을 사용하지 않았습니다.

## 전체 시험과 모바일 제한

기준 `npm test`는 전체 완료하지 못했습니다. 기존 네트워크 차단기 시험에는 외부 공급자 이름을 대상으로 **요청 전에 차단되는지** 검증하는 코드가 있는데 실행이 중단되었습니다. 이번 추가 기능 검증을 위해 해당 차단기/네트워크·runner 5개 파일은 명시적으로 제외하고 순수 계산·격리 검증 집합을 재실행했습니다. 제외 목록은 `test-manifest.json`에 있으며, 제외된 시험을 통과했다고 보고하지 않습니다.

- network-guard-stage19.test.cjs
- kis-runner-stage21.test.cjs
- us-pilot-stage18.test.cjs
- krx-runner-cli.test.cjs
- kr-krx-stage13.test.cjs

Chromium은 `socket() failed: Operation not permitted`로 시작하지 못했습니다. 추가 실행 권한으로 재시도해도 같은 결과였습니다. 따라서 `tests/valuation-mobile.cjs`의 360/390/430/1280 화면·뒤로가기·앞으로가기·레이아웃·스크린샷 검증은 **미실행**입니다. DOM 검증은 브라우저 레이아웃/실기기 검증의 대체가 아닙니다.

## 독립 검토에서 수정한 7건

1. 단계 입력의 price/currency/stage/formula가 계산 출력값을 덮는 문제: 허용 필드만 복사.
2. 거의 끝난 회계연도를 Forward 12개월로 표기하는 문제: 추정 시작일과 기준일/현재시각의 근접성을 요구.
3. 큰 유한값을 반올림하며 Infinity로 바꾸는 문제: 안전 반올림과 지원 숫자 범위.
4. 반환한 과거 결과가 입력 객체의 후속 수정으로 바뀌는 문제: 입력/provenance/가정 분리 복사.
5. 기존 감시 연결에서 quote 자체의 종목/시장 식별이 누락된 문제: 문서/stock/quote 식별 및 시장통화 일치 확인.
6. 극소 양수가 0으로 반올림되어 무료 주가/가치처럼 보이는 문제: 양수 보존, 판단에는 원시 관측값 사용.
7. 중간 곱셈 오버플로를 FCF 수익률 0으로 표시하는 문제: 관측값 절댓값 1e-12~1e18 또는 0, 배수 1e-12~1e6의 지원 범위 제한.

7건의 독립 재검증은 통과했습니다. 이는 지정된 합성 입력 범위의 코드 검증이지 실제 회사 가치·수익률·데이터 공급자 권리 검증이 아닙니다.

## 재현

Node.js에서 의존성을 준비한 뒤:

```
npm ci --ignore-scripts
npm run test:valuation
npm run test:valuation-regression
npm run test:valuation-dom
BROWSER_EXECUTABLE_PATH=/path/to/chromium npm run test:valuation-mobile
```

jsdom 26.1.0은 DOM 시험 전용 개발 의존성입니다. 실행 화면에는 외부 런타임 의존성을 추가하지 않았습니다. 모바일 시험은 외부 요청을 차단하고 독립 브라우저 문맥을 사용합니다. 사용자 보유정보가 있는 기존 운영 주소에 시험 배포하지 마세요.
