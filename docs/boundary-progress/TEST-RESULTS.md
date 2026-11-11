# 직접 실행 검증 · 2026-11-09

기준 트리 `8ab17b0f979c7a21d33614001ea9eb7e6f1acf0e`의 클로 42332fc 이후 변경분을 독립 로컬 작업본에서 시험했다. 이번 결과를 이전 단계나 클로 환경의 전체 시험과 합산하지 않는다.

| 직접 실행 | 결과 |
|---|---|
| 명시적 오프라인 회귀 목록, 74개 파일 | **1102 / 1102 통과**, 실패·취소·건너뜀 0 |
| 신규 집중 시험, 4개 파일 | **43 / 43 통과**. 위 1102개에 포함 |
| 독립 반례 시험 | **9 / 9 통과**. 위 43개 및 1102개에 포함 |
| 작업대·가치평가·AI 참모 jsdom | 3종 통과. 실제 브라우저 렌더링 시험 아님 |
| 가림 비교시험 | 과거 17개 노출, 현재 0개 노출 / 13개 보류 / 정상 5개 유지 |
| 준비도 CLI 합성 예시 | 35항목, declared-only / unverified / unavailable |
| 변경 실행 모듈 5개 문법 검사 | 통과 |
| 비밀 패턴 정적 스캐너 | 발견 0. 모든 비밀 부재의 증명 아님 |
| 공백 오류 검사 | 통과 |
| 보호 파일 비교 | 차이 없음. 아래 범위 참조 |

## 명령과 로그

의존성은 기존 로컬 jsdom 경로를 NODE_PATH로 지정했다. 새 패키지 설치나 다운로드는 하지 않았다.

```sh
NODE_PATH=/workspace/scratch/a69a663b2cde/dabi-lab-closure/node_modules node tools/valuation-regression.cjs
npm run test:boundary-progress
node --require ./tests/lib/no-network.cjs tests/data-workbench-dom.cjs
node --require ./tests/lib/no-network.cjs tests/valuation-dom.cjs
node --require ./tests/lib/no-network.cjs tests/advice-gates-dom.cjs
node --require ./tests/lib/no-network.cjs tools/review-redact-battery.cjs /tmp/has-review-old-redact-2eed163.js
node --require ./tests/lib/no-network.cjs tools/source-readiness-check.cjs docs/data-workbench/source-readiness.synthetic.json
node tools/scan-secrets.cjs
git diff --check
```

새 집중 시험은 JSON 경계 8개, 가림 시험 도구 10개, 자료 준비도 16개, 독립 반례 9개다. 기존 시험의 합격 수에 중복 가산하지 않는다. 상세 로그는 `logs/`에 있다. 과거 가림 비교용 파일은 확인된 2eed163 버전이며 임시 파일 경로 자체는 새 환경에 존재한다고 가정하지 않는다. 현재 가림 검사만 실행할 때는 경로 인자 없이 실행할 수 있다.

## 독립 검토

구현자가 아닌 별도 검토자가 큰 희소 배열, 긴 문자열, 접근자 재접근, 중첩 Proxy에 의한 원본 변경, inherited toJSON, 가져온 시세 검증 등급, CLI 잘못된 UTF-8/JSON의 원문 유출 여부를 확인했다. 검토 중 발견한 가치평가 인계의 배열 toJSON 경로를 보완한 뒤 반례가 통과했다.

일반 객체 API의 Proxy 반사 트랩은 차단 보장 대상이 아니다. 외부 입력은 JSON 문자열 API를 사용해야 한다. 이 구분을 제거하거나 모든 JS 객체에 안전하다고 주장해서는 안 된다.

## 보호 범위와 미실행

`portfolio_v5.html`, 서비스 워커, 매니페스트, `backup/`, `invest/`, 기존 valuation-engine·quote-model·gas-redact·advisor-core·advisor-app은 기준과 비교해 변경하지 않았다. 실제 장부 데이터에 접근하거나 저장소를 마이그레이션하지 않았다. DOM 시험의 localStorage/sessionStorage 센티널도 그대로다.

전체 `npm test`는 이전 실행에서 네트워크 시도 시험 때문에 거부된 이력이 있어 이번에는 재시도하지 않았다. 같은 명시적 제외 목록을 유지했다: network-guard-stage19, kis-runner-stage21, us-pilot-stage18, krx-runner-cli, kr-krx-stage13. 따라서 **전체 시험 무제외 통과**라고 부르지 않는다.

Chromium은 앞선 환경에서 소켓 권한으로 실행이 거부되어 재시도하지 않았다. 모바일 360/390/430px 실제 렌더링, 갤럭시 실기기, 실제 클립보드, 접근성 보조기기, 실제 시세/공시 API·성능·권한·원문을 검증하지 않았다. DOM 통과로 이 범위를 대신하지 않는다.
