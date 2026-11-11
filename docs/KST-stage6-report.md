# KST 투자관리시스템 6단계 개발 보고서

작성일: **2026-10-29 (한국)**. 판정: **원격 기준선 재현·사전 검토·합성 설계 완료; 실데이터/운영 준비 완료 아님**.

## 기준과 원격 상태

- 저장소: https://github.com/kstgoup-bit/Portfolio
- 확인한 stage5 브랜치: https://github.com/kstgoup-bit/Portfolio/tree/work/kst-value-radar-stage5-20261029
- 기준 원격 SHA: `730007c98d2104f97b385feb6f98342f8cc19713`.
- 기존 Draft PR: https://github.com/kstgoup-bit/Portfolio/pull/1 — open/draft, head=위 SHA, base=main. 수정·병합하지 않음.
- main SHA: `fd2599398d2f2ef1816ca9b64ea134ea8811309d`, 변경/병합 없음.
- 새 로컬 브랜치: `work/kst-investment-stage6-20261029`, **지정한 원격 SHA의 직접 후속 커밋**. 최종 SHA는 delivery.json 참조.
- 이번 연결의 원격 stage6 branch 생성 API **1회 403 Resource not accessible by integration**. 추가 쓰기·git push·인증 우회·권한 확대·PAT 요청 없음. 원격 stage6 업로드와 새 PR은 미완료다. 로컬 결과와 패치로 전달한다.

원격 stage5는 사용자가 반영한 커밋과 Draft PR이 실제로 존재한다. 과거 stage5 보고서의 '원격 업로드 미완료/403'은 당시 이 연결의 결과이며 현재 stage5 원격 부재를 뜻하지 않는다. 과거 보고서는 증거로 보존했다. 로컬5단계 SHA db5e9f5…와 현재 원격730007c…의 커밋 구조는 다르지만 **소스63개는 모두 동일**하다. 이번 작업은 db5e9f5가 아니라 원격730007c에서 시작했다.

## 재현성 확인

GitHub API로 브랜치·커밋·부모·전체 재귀 tree·PR/main을 읽고, 일반 read-only `git fetch origin 730007c98d2104f97b385feb6f98342f8cc19713`로 실제 Git 객체를 가져왔다. `git show SHA:path`의 63개 파일 bytes를 기존 ZIP source/ 및 delivery.json.sourceSha256과 직접 대조했다. API의 Git blob SHA와도 별도 대조했다. ZIP CRC 정상, **63개 일치 / 불일치0 / 미검증0**. 대조 원본은 evidence/source-comparison.json이다. 이 검사는 소스 동일성 검증이며 과거 시험 결과를 대신하지 않으므로 시험도 새로 실행했다.

| 실행 | 결과 | 데이터 |
|---|---|---|
| 기준 npm ci | 성공, 잠금파일 변경 없음; npm http-proxy 환경 경고만 기록 | 개발 의존성 설치 |
| 변경 전 npm test | **182/182**, 실패0·skip0 | 합성/계약 |
| 변경 전 npm run test:mobile | **25/25묶음**, 실패0 | 합성4계좌/가상기업 |
| 변경 후 npm test | **211/211**, 실패0·skip0 | 기존182+신규29 합성/계약 |
| 변경 후 npm run test:mobile | **25/25묶음**, 실패0 | 기존화면 회귀, 신규화면 없음 |
| 적격성 도구, 기준일2026-10-29 | 활성0 / 보류16 / 제외0 | 기존 미확인 근거 유지 |
| 원격기준 대비 기존63개 바이트 검사 | 모두 불변 | 투자/백업/매수/매도/운영소스 보존 |
| patch 적용·소스 전체 대조·reverse | 납품 검증 결과 delivery.json에 기록 | 소스 재현 |
| 실제 Android 홈 화면 | **미실시** | 헤드리스 시험과 구별 |

시험 명령(저장소 root):

```sh
npm ci
npm test
npm run test:mobile
node tools/review-universe.cjs 2026-10-29
```

Playwright1.62.1, 관리형 환경의 별도 Chromium138 실행파일을 사용했다. 실제 모바일 실행명령:

```sh
BROWSER_EXECUTABLE_PATH=/workspace/scratch/a983c2ddd102/test-tools/chromium KST_TEST_FONTS_DIR=/workspace/scratch/a983c2ddd102/test-tools/node_modules/@fontsource/noto-sans-kr npm run test:mobile
```

일반 환경에서는 npm ci 후 `npx playwright install chromium`으로 브라우저를 설치해 실행할 수 있다. 브라우저 버전 차이는 재현 기록에 남겨야 한다. 실행파일/의존성은 ZIP에 넣지 않는다. 원본 로그 npm-ci/baseline-unit/baseline-mobile/unit/mobile과 두 모바일 결과 JSON, 최종44캡처를 포함한다. 이번 신규 시험 실패는0이며 기준선도 실패 없이 재현했다. 설치 경고는 성공으로 숨기지 않고 로그에 보존했다.

모바일360/390/430px의 목록·상세·뒤로·새로고침·오프라인·오류복귀·가로넘침·터치, 일반/ISA/해외/연금 CRUD와 계산, 백업v6 다운로드·미리보기·취소·적용·되돌리기·레거시·quota·중단복구, 저장키 보존·XSS·가짜키 비노출을 기존25묶음으로 재검증했다. 모든 투자 값은 합성 seed이며 실제 기기 기록이 아니다. 오프라인 매도 데모는 이미 로드된 자료의 화면 탐색이며 오프라인 최초 로드/새로고침을 보장하지 않는다. 운영 SW는 교체하지 않았다.

## 이번 변경과 구현/설계/미구현

**기존63개 소스 전부 불변**, 추가 파일만 있다. 운영 HTML, manifest, SW, 기존 백업v6, 매수100점, 매도 연구, universe/eligibility/pilot-status는 그대로다. 실제 브라우저 저장소나 자격증명을 읽지 않았고 새 저장키/비밀저장 구조/서버/유료 자원/주문 기능은 만들지 않았다.

- `management/review.js`: 합성 결과 봉투의 정보 제공용 통합 검토 순수 함수. 연금코어/해외새틀라이트 역할, 명시 목표/최대 비중, 결측·시점·모드·대상 일치, 매수/매도 상충을 검증. 실제 엔진·계좌·화면·주문에 연결하지 않음.
- `management/pilot-readiness.json`: 고정5종목의 실제가격/출처/조회시각 모두 null, 권리/인증/실데이터0의 사전상태.
- `tests/management.test.cjs`: 23개 합성 통합 계약 시험. 상승률 예시 무행동·입력 불변·불확실 가치평가 차단 포함.
- `tests/provider-stage6.test.cjs`: 6개 추가 공급자 합성 계약 시험. 혼합조정 참조 null, 정규장 미확인 차단, vendor 미확인 필드 유지, UTC offset, bars순서/입력불변, transport오류 비노출. 기존 providers/vendor 코드는 변경하지 않았다.
- `docs/investment-management-stage6.md`: 연금코어/해외새틀라이트 정책, 종목 목표비중, 가치·논리·집중·교체 검토, 5년10억과 이후 장기성장/노후현금흐름 설계. 목표 계산기·세금 계산·실제 보유 연결은 미구현.
- `docs/pilot-data-contract-stage6.md`: 정규장 종가·동일분할52주고가·거래일·출처/지연·SPY/업종ETF·교차검증 필드 정의.
- `docs/provider-comparison-stage6.md`: 공식 가격/약관/문서와 권리 미확정 비교표.
- `docs/stage6-instructions.md`, 이 보고서: 범위와 검증 기록.

매수·매도 통합은 **합성 상태 봉투를 합치는 연구 계약**이다. 기존 두 엔진의 실제 출력 변환/근거문서 참조/실제 보유 연결은 하지 않았다. reviewConfirmed는 합성 정책 입력 확인이지 사용자의 실제 승인 기록이 아니다. 새 화면/자동 알림/실제 정책 저장도 없다. +20/+30/+50/+100/+200%는 자동매도 기준이 아니며 통합 함수는 해당 수익률을 판단 입력으로 쓰지 않는다. 불확실한 가치평가·결측·오래된 가격은 평가불가다. 목표 달성 가능성/필요 수익률을 계산·보장하거나 레버리지를 유도하지 않았다.

## 실제 데이터 준비 상태

| 지표 | 결과 |
|---|---|
| 실제 시세 API 요청 | **0건** |
| 실제 가격 검증 | **0종목** |
| 실제 활성 감시 | **0종목**, 보류16 / 제외0 |
| 대상 | MSFT/GOOGL/AVGO/VRT/JPM, 검증 완료 아님 |
| 공급자/이용권/인증 | 미선정/미확보/미확보 |
| 200종목 확대 | 미실행, 5종목 실제 검증 후 단계 |

공식 문서 재조회는 시세 API 호출과 구별한다. Alpha Vantage DailyAdjusted는 premium이고 raw high/adjusted close 혼합 위험이 있다. Twelve Basic non-display와 Grow 표시권, 보관기간/가공조건을 구별했다. Massive 무료EOD는 자정ET 이후 과거일 제공이며 정규장16시 직후 최신일을 무료로 받을 수 있다고 가정하지 않는다. 일봉 집계가 정규장만인지도 미검증이다. 현행 동적 유료 견적·개인 계정 분류·장기보관·가공/ETF 권리는 미확인으로 남겼다. 원문URL·확인일·구체적 미확정은 비교표에 있다. 기존 localStorage의 API키는 읽거나 재사용하지 않았다.

## 남은 과제 / 다음 사용자 승인

1. 이번 연결의 GitHub 쓰기403 해소 또는 본인의 인증된 개발환경에서 patch 적용·개발브랜치 업로드. stage5 PR #1은 그대로 Draft 유지, main 병합금지. 권한 확대/계정 변경을 이번 승인에 포함하지 않는다.
2. 공급자·본인용 표시/가공/저장기간·SPY/업종ETF 권리와 안전한 인증 주입 범위를 확정해야 한다. 비밀키를 채팅으로 요청하지 않는다. 구매/유료 서비스는 별도 승인 전 금지.
3. 권리 확보 후 읽기전용5종목 검증: 정규장 범위·실제거래소 캘린더·분할/배당기준·52주충분성·독립가격 대조. 실제 벤더 연결 완료나 운영가능 판정은 아직 아니다.
4. 실제 계좌정책·목표 비중·목표자산 정의·보유로컬연결·세금모델·근거봉투 연동은 별도 사용자 승인과 후속 구현 필요. 이후에200종목 검토.
5. 실제 Android 기기/PWA 시험과 운영 적용은 미실시. main/운영배포는 이번 범위에서 계속 금지다.

ZIP은 최종source, 기준stage5 source, main비교HTML, 증분patch/format-patch, README, delivery.json, 원본시험로그/대조증거/모바일캡처를 포함한다. 원격 업로드를 못해도 지정 기준에서 로컬 재현할 수 있게 제공한다.
