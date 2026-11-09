# 최종 검증 결과 · 2026-11-09

- 명시적 비네트워크 회귀: 70개 파일, **1058/1058 통과**. 취소·건너뜀·실패 0.
- 보완 집중 시험: **51/51 통과**. 위 1058개에 포함됩니다.
- 독립 반례 재검토: 독립 6개 시험과 관련 redactor/UI/시세 시험을 합쳐 **104/104 통과**. 이것도 위 집합과 중복되므로 추가 합산하지 않습니다.
- 원래 이스케이프 따옴표 유출, 실패 복사 성공표시, 이스케이프 API/URL, 비밀 식별자/괄호키, 8진 escape, 합성 휴장일 출처 위장, 긴 연휴의 가치평가 충돌을 재현 후 회귀 시험으로 보존했습니다.
- 실제 엔진과 합성 예시를 로드한 작업대 DOM 통과.
- 기존 가치평가 6개 업종 DOM, AI 참모 실패/재시도/상세·해시·알림 DOM 통과. localStorage·sessionStorage sentinel 등 기존 기록 불변 확인.
- 새/변경 JS 문법 검사, git diff --check 통과.
- 저장소 비밀값 패턴 검사: **0건**. 실제 키를 넣어 확인한 결과가 아니며 탐지 완전성을 뜻하지 않습니다.

## 완료하지 못한 검사

전체 npm test는 기존 network-guard 테스트의 실제 공급자 호스트 HTTP 요청 코드 때문에 실행 검토에서 거부되어 최종 결과를 얻지 못했습니다. 동일 작업 우회·재시도 없이 명시적 안전 부분집합만 실행했습니다. 다음 5개 기존 파일은 이번 최종 회귀에 포함하지 않았습니다.

- network-guard-stage19.test.cjs
- kis-runner-stage21.test.cjs
- us-pilot-stage18.test.cjs
- krx-runner-cli.test.cjs
- kr-krx-stage13.test.cjs

브라우저는 앞선 동일 실행 환경에서 Chromium socket 권한 오류가 있었으므로 이번에 우회·재실행하지 않았습니다. 모바일 렌더링·갤럭시 실기기·실제 OS 클립보드는 미확인입니다. 가짜 clipboard 응답과 DOM 검사는 이 제한을 대신하지 않습니다.

## 재현

개발 의존성 설치 환경에서:

- `node tools/valuation-regression.cjs`
- `npm run test:review-fixes`
- `node tests/data-workbench-dom.cjs`
- `node tests/valuation-dom.cjs`
- `node tests/advice-gates-dom.cjs`
- `node tools/scan-secrets.cjs`

검증 당시 이미 설치된 jsdom을 NODE_PATH로 제공했으며, 제작 환경의 절대 의존성 경로를 시험 소스에 하드코딩하지 않았습니다. 실제 공급자 통신·인증·계약·배포를 수행한 검사가 아닙니다.
