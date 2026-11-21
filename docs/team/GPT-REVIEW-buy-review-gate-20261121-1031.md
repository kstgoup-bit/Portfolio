VERDICT: CHANGES_REQUESTED
ORDER-ID: GPT-20261121-0911
REVIEWED-CLAUDE-HEAD: a2a4c791902a07d02e4da73993f10ed67f49b22a
CLAUDE-REPORT-COMMIT: adcd2517429429776c7ac2109eb8bd60bbfab767
BASE-MAIN: d9f88628e179fab2ed2076d80548887f39e4506f
REVIEW-SCOPE: 83f2a25dd12cbe8fdf06b1dcfd23bb95522a1c83..a2a4c791902a07d02e4da73993f10ed67f49b22a
DATE-KST: 2026-11-21 10:31
APPROVAL-SCOPE: NONE (합성 게이트 코드 정적 검토; 운영 앱·시세 연결·실주문·GAS·main·배포 승인 아님)

# HAS 곡소리 매수 검토 게이트 — 지피 교차검토

## 확인 범위와 긍정 사항
- main `docs/team/CLAUDE-LATEST.md`의 `READY_FOR_REVIEW` 포인터를 먼저 확인하고 필수 협업 문서 4개, 지정 GPT-ORDER, 지정 클로 보고서(main·브랜치 동일), 지정 코드 HEAD 변경 파일 목록을 대조했다. HEAD는 83f2a25 대비 1커밋 차이이며 신규 엔진·합성 자료·실험실·테스트·핀만 포함한다.
- `has/buy-review-gate.js`, `has/buy-review-fixtures.js`, `has/buy-review-lab.js`, `tests/buy-review-gate.test.cjs`, `tests/buy-review-mobile.cjs` 및 pins 변경을 읽었다. `portfolio_v5.html`은 변경 목록에 없다. 신규 파일은 합성 시험용이며 주문 생성 코드는 보이지 않는다.
- 가격/가치 안전마진 분리, 5게이트, 데이터 결손 시 보류, 주문 수량 null, 실험실 분리 설계는 방향에 부합한다. 다만 아래 계약 결함을 보완하기 전에는 **코드 단위 APPROVE 불가**.
- 클로 보고: 총 2299건 중 2297 PASS/0 FAIL/2 SKIP, 비밀정보 점검 0, Chromium 360·390·430 검사. **지피는 테스트·브라우저·실제 API를 독립 실행하지 않았고 위 숫자는 클로 보고 결과일 뿐이다.** 실데이터 연결·투자 결과 정확성은 확인하지 않았다.

## 필수 수정 항목

### CR-1 — 교차검증·확정 종가·조정 일관성 입력을 자기선언으로 통과시키지 말 것
`screenPrice`(has/buy-review-gate.js)는 `crossCheck.status==='match'`, 오차 숫자와 `sources.length>=2`만 검사한다. 예를 들어 `sources:['X','X']`여도 서로 독립적인 두 공급자로 통과할 수 있으며, 교차 가격의 거래소/통화/종가 확정시각/분할조정 기준이 실제로 같은지 확인할 필드·검증이 없다. `priceType:'regular-close'`도 단순 문자열 선언이라 미확정 장중 값을 해당 값으로 표기하면 통과한다. 액면분할 오판(기존 SNDK 사건) 재발 예방에 중요하다.
- 이번 합성 단계에서 검증 가능한 정규화 계약을 정의: 독립 공급자 식별·시각·시장·통화·가격종류·조정기준·종가 확정 증거·고점과 종가의 동일 조정기준 및 두 독립 공급자 수치 대조. 호출자 제공 단순 `match`/중복 ID/누락 메타로는 fail-closed. 실제 공급자 API 호출은 하지 말 것.
- 중복 공급자, 서로 다른 통화/시각/가격 기준, 장중 미확정, 분할 전후 혼용을 합성 음성시험에 추가.

### CR-2 — 본질가치 가정의 무효 수치와 산출계보가 없는 임의 가치로 PASS 금지
`valuation`은 시나리오 8개 숫자가 finite이고 주식수·주당가치가 양수인지만 확인한다. 예: `discountRatePct:-20`, `growthPct:500`, `dilutionPct:-10` 등 비경제적 입력도 그 외 값이 그대로면 `computed`이고 5게이트 통과 시 매수 검토에 이를 수 있다. 주당 본질가치 값이 공개된 FCF/순부채/주식수 가정에서 나왔는지도 검증하지 않는다.
- 할인율/성장률 관계, 희석률·주식수, FCF·주식보상·순부채의 수치 범위와 단위·시나리오 산출 계보를 검증하는 fail-closed 계약 또는 독립 검증 증빙을 추가. 단순 자유입력 `valuePerShare`가 근거 없이 D PASS를 만들지 못하게 할 것. 지금 단계에서 실제 DCF 데이터 수집은 요청하지 않음.
- 무효 할인율/성장률, 희석률 음수, 서로 다른 단위, 출처 없는 평가액 테스트 추가.

### CR-3 — 4단계 조사 완료와 증거 검증을 구분
`research()`는 `done:true`와 임의의 비어 있지 않은 `source`·`summary`·최근 일자만으로 `ok:true`를 반환한다. `{done:true, source:'내 메모',summary:'완료',asOf:'2026-11-20'}` 같은 값만으로도 4단계 조사를 통과할 수 있다. 5게이트 `independent-verified` 역시 외부 검증자가 확인한 증거 객체가 아니라 호출자 문자열이다.
- 완료 주장과 검증된 조사 근거/출처를 구분하는 증빙 계약·차단 규칙(공시 출처, 조사 대상 종목·공표일/확인일, 교차 검증 상태)을 설계·합성 구현하고, 미검증 및 종목·기준시각 불일치에서는 매수 검토 보류. AI의 자기판정 문자열만으로 PASS를 승인하지 말 것.
- 미확인 자체메모/서로 다른 종목 공시/가짜 출처가 PASS를 만들지 못하는 음성시험 추가.

### CR-4 — 실행 가능성의 현금 증빙 신선도·계좌 범위와 후보 알림 중복 처리
`executability`는 `cash.status='verified'`이면 `asOf`가 비어 있지 않기만 하면 오래된 시각도 `cash=ok`로 표시하고 통화·계좌 범위를 검증하지 않는다. `notifyPlan`은 같은 `market:ticker`가 `current`에 중복되면 `shortlist`에 중복 반영되어 동일 실행에서 복수 알림을 만들 수 있다.
- 현금/잔액 증거의 기준시각, 통화, 계좌 범위와 비상현금 하한 비교가 확인되지 않으면 `blocked`/`unconfirmed`; 현금 원화와 미국 주식 USD 가격의 임의 혼합 금지. 실계좌 조회는 금지.
- 알림 후보는 market+ticker로 중복 제거하고 동일 실행에서 동일 종목 최대 한 번, 하락 후 재진입은 기존 계약대로. 오래된 현금·통화 불일치·계좌 미확인·중복종목 시험 추가.

## 재제출 기준·안전 경계
- 같은 `work/claude-buy-review-gate-20261121` 브랜치에서 위 CR-1~4에 대한 변경 파일·대응표·추가 시험 결과를 `CLAUDE-DEV-BUY-REVIEW-GATE-20261121.md`에 명시하고 새 코드 HEAD 및 보고 커밋을 `CLAUDE-LATEST.md`에 `READY_FOR_REVIEW`로 재지정.
- `GPT-20261121-0911` 기존 과제 보완이므로 별도 중복 GPT-ORDER 발행하지 않음. 선행 G0 시세 출처/기준시각 교차검증과 SEC/DART·미국200 실제 GAS 연결 우선. `radar/data/universe-400.json`은 main에서 미발견 — 공식 출처·기준일·버전 검증 완료를 주장하지 말 것.
- 운영 연결, 사용자 실계좌·기록/백업 접근·변경, 실제 API/키, GAS, 비용, 주문/자동매매, main 병합, 배포는 이번 승인 대상이 아니며 금지. 안전마진 정책(10/20/30/40%)과 비상현금 하한은 사용자 결정을 받은 뒤 별도 단계에서 설정하며, 검증 전에는 확정 투자규칙처럼 사용하지 않는다.
