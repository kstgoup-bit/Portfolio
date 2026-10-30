# KST 투자관리시스템(HAS) 22단계 A 개발 결과보고서

작성 2026-10-30 (한국시간). **판정: A단계 개발·합성시험·회귀검증 완료. 공급자 조사에는 미확인 조건이 남으며, B단계는 승인 대기·미실행이다.**

## 1. 기준과 작업 범위
- 저장소: kstgoup-bit/Portfolio
- 기준 원격 브랜치: work/has-stage21-price-trust-safety-20261030
- 기준 원격 HEAD: 249315adc6d832d41c4ad8eb8cb97a72a25e672b. 작업 시작 시 지정 커밋과 실제 HEAD 일치 확인.
- 전체 저장소의 해당 커밋에서 체크아웃, npm ci 실행.
- 신규 브랜치: work/has-stage22-provider-validation-20261030
- 원격 최종 커밋·소스 트리는 제출 ZIP의 delivery.json 및 완료 메시지 참조. 원격 업로드 후 fetch·전체 diff로 확인한다.
- 기존 브랜치·main·운영 배포·PWA 갱신·실제 투자기록·실제 시세 호출은 범위 밖으로 유지.

## 2. 핵심 성과
- 기존 676개 시험과 이전 미재현 6개를 재검증: 총 682개 통과. 6개는 실제 공급자 주소 대신 .invalid 예약 주소와 선차단 장치로 수정하여 안전하게 재현.
- 조회 전용 합성 어댑터를 설계·구현: KIS 미국/한국, Twelve Data, KRX 주식/ETF 형태 초안 → 공통 종가 메타. 10종목 합성 매핑, 오류/날짜/메타 불일치/기업행위 미확인/대조 실패를 보류.
- 신규 44개 시험 포함 최종 726개 통과. 합성 일치라도 실제 검증 상태나 투자 신호로 승격하지 않음.
- 공급자 공식 약관·요금·제약을 다시 조사하고, 가격 경로 독립성과 동일 원천 위험을 분리. KRX API 약관 원문 확보.
- 실가격 전송/키 입력 기능을 구현·연결하지 않음. 합성 모듈은 브라우저 앱과 격리.

## 3. 검증 수치

| 항목 | 결과 | 증거 |
|---|---|---|
| 기존 676 및 미재현 6 | 총682 통과/0실패/0건너뜀 | evidence-stage22/baseline-full.log |
| 미재현 6개 별도 시험 | 6 통과/0실패 | recovered-six.log |
| 신규 어댑터·안전 시험 | 44 통과 | final-unit.log의 22 접두 항목 |
| 최종 전체 단위시험 | 726 통과/0실패/0건너뜀 | final-unit.log |
| 모바일 회귀 | 25·15·15·11·10·15·6 묶음 전부 통과 | mobile*.log, mobile-exits.txt |
| 실제 Chromium 여정 | HTTP/file ×360/390/430/1280 =8조건, 129확인 통과 | e2e.log, e2e-results.json |
| 확대 렌더링 | 5화면 상태×4폭=20조건, 측정 위반0·저장소 동일 | expanded.json, expanded.log |
| 보호 파일 무결성 | 8개 바이트 동일 | protected-sha256.json |
| 비밀값 정적 검사 | findings 0 | secret-scan.log |
| 실제 시세 API 호출 | 0건 | live 전송기 미구현·B 미실행 |
| 실제 검증 가격 | 0건 | 합성을 실제 검증으로 집계하지 않음 |
| HAS 실제 활성 감시 | 미국0 / 한국0 | 이번 단계 활성화0; 후보10개는 감시종목 아님 |
| 실제 사용자 투자기록 변경 | 0건 | 운영 저장소 미접근 |
| 실제 갤럭시 기기시험 | 0회 | 브라우저 에뮬레이션과 구분 |
| 계정 연결·키 발급·유료 생성 | 0/0/0건 | B 미실행 |

브라우저 시작 시 기존 외부 호스트 2종류의 접속 시도를 route 차단했다. 이는 '접속 시도 자체0'이라는 의미가 아니다. 공식 문서/GitHub 조회는 시세 API 호출과 별개다.

## 4. 6개 미재현 시험의 원인·조치
첫 안전 재실행에서 1개 실패, 나머지5개 통과. 기존 차단 장치가 Node의 HTTP 내부 인자 정규화에 의존해 http.get 시점에 동기 예외를 보장하지 못했다. 초기 실행은 종료되지 않아 최종 성공 집계에 사용하지 않았다. 초기 실패 로그는 recovered-six-initial-failure.log에 보존.

수정: 시험 대상 주소를 blocked-provider.invalid로 변경(공급자 DNS/API 미사용). tests/lib/no-network.cjs에 http/https의 request/get 생성 전 호스트 검사 추가. 원래 차단 검사/로컬 통신/실전 모드 거부/공급자 주소 경계/브라우저 차단/시험 명령 사전로드의 6개 목적은 유지. 재시험 6/6, 전체682/682 통과.

이것은 합성 주소를 이용한 차단 장치 검증이며 실제 공급자 호출 시험이 아니다. 기존 시험 파일을 무수정으로 재실행한 결과라고 표현하지 않는다. 프로세스 내부 가드는 전체 OS 네트워크 보안 대체물이 아니다.

## 5. 코드와 설계
- providers/closing-stage22.cjs: 후보 10종목 레지스트리, 조회계획, 합성 응답 정규화, 합성 대조, 제한된 재시도 권고.
- tests/providers-stage22.test.cjs: 신규44개. 심볼/거래소/통화/시간대·미래/잘못된 날짜·달력/장종료·중복·누락·가격·조정/시간외·응답오류·429·스키마·키/네트워크 경계 등.
- tests/lib/no-network.cjs, tests/network-guard-stage19.test.cjs: 안전 재현 보강.
- 문서4종: provider-comparison.md, candidate-validation-plan.md, adapter-design.md, B-approval-request.md.

실제 응답 스키마 검증 전이므로 KIS/KRX 가격 필드 형태는 초안이다. normalizeFixture는 합성 봉투만 받고 실제 입력 거부. HTTP 전송기·자격증명·저장소 인터페이스 없음. 실패는 검증 보류이며 임의 평균/추정 없음. 정확 일치한 합성 결과도 realVerified=false·held=true. 앱 관문은 기존 그대로이며 실제 검증 결과 연동은 B로 남김.

비수정 종가 대조와 split-adjusted 투자 신호용 시계열 검증은 다르다. 최초 대조 성공만으로 gateSignals 요구를 완화하지 않는다.

## 6. 공급자 조사 결론과 한계
조건부 후보: KIS 1차(두 시장), KRX 한국 대조, Twelve Data 미국 대조. 저장·표시·독립대조 권리·무료 범위가 모두 확정된 조합은 아직 없음.

- KRX: API 고유 약관을 확인. 일1만회 이하, 비상업 목적, 출처 표시, 제3자 제공 금지, 계약 종료 후 이용 금지. 요금·구체 보존·대조 권리 등은 미확인.
- Twelve Data: 공식 요금/약관/헤더 인증/조정모드 확인. 한국 EOD 시장은 Pro 이상으로 표시. 무료 Basic을 한국 무료검증 경로로 추천하지 않음. 내부 표시·비표시·저장은 등급/원천 권리별 조건이 다름.
- KIS: 개인 자기자산 목적 이용 및 제3자 제공 제한 안내 확인. 최신 유량제한 공지 일부가 로그인 제한/동적 본문으로 미노출되어 계정별 숫자 미확인. 개인 직접 이용의 영구보존/독립대조 약관·해외 요금 확정 필요.

공식 근거 URL·조사일·미확인 항목은 provider-comparison.md에 기재. 개별 종목 매핑은 candidate-validation-plan.md에 기재. 공개 페이지의 예시/시세 수치를 검증 결과에 넣지 않음.

## 7. 기록·백업·보안 보호
portfolio_v5.html, portfolio.html, service-worker.js, manifest.json, backup/core.js, backup/ui.js, invest/ledger.js, has/price-trust.js의 SHA-256이 기준과 동일. 저장키·스키마·백업 버전·실제 투자기록 변경 없음.

기존 v4/v5/v6 백업 생성·해석·미리보기·취소·복원·롤백 및 중복/초과매도/환율누락/계좌독립 시험은 전체 단위시험에서 통과. backup-ledger-extract.log는 전체 로그에서 관련 줄을 추출한 색인일 뿐 별도 시험 횟수로 더하지 않음.

API 키·비밀번호 수집/이동/삭제 없음. 기존 평문 localStorage·기본 비밀번호·URL키·JSONP 구조의 위험은 그대로이며, 이번 정적 검사0건이 기존 보안 문제 해결을 뜻하지 않음.

## 8. 재현 명령

```bash
npm ci
npm test
node --require ./tests/lib/no-network.cjs --test tests/network-guard-stage19.test.cjs
export BROWSER_EXECUTABLE_PATH=/path/to/chromium
npm run test:mobile
npm run test:mobile14
npm run test:mobile15
npm run test:mobile16
npm run test:mobile17
npm run test:mobile19
npm run test:mobile20
node tests/e2e-journey-stage20.cjs evidence-stage22/e2e-results.json
node tests/lib/measure-stage21.cjs evidence-stage22/expanded.json
node tools/scan-secrets.cjs
```

시험은 기존 설치 Chromium 바이너리 사용. 최종 단위726개에 기존6개 및 신규44개가 포함돼 있으므로 각 수치를 다시 더하지 않는다.

## 9. 남은 일과 B 승인 요청
실가격 수집/10종목 독립대조/실제 달력·기업행위 검증/실응답 스키마·보존권 검증/실가격 관문 연동은 미실행. 모든 모달/실기기/업무 저장 흐름을 전수 검증한 것은 아님.

B-approval-request.md는 **0원·총40요청 상한·권리 확정·조회전용**을 제안한다. 권리/무료 범위를 충족하지 못하거나 안전한 계정 연결 수단이 없으면 중단. 유료 결제·증권 신규계좌 개설·실제 주문·main·운영 배포·영구 마이그레이션은 요청 범위에서 제외.

A 완료 후에도 B를 자동 실행하지 않는다. 대표의 별도 승인 전까지 실제 검증 가격0, 실제 활성 감시 미국0/한국0 상태를 유지한다.
