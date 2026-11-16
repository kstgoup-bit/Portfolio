VERDICT: CHANGES_REQUESTED
CLAUDE-HEAD: 017e8034df17950f657e855aeb1513f85210ccf2
ORDER-ID: GPT-20261116-1030
BASE: 0857a4b2d96ef798e254c9ab34773b668d9eccc5
MAIN-CHECKED: 83402bde1b3420015d4551601e639689312aa41e
REVIEW-TYPE: 저장소 원격 코드·시험 소스 정적 검토(독립 시험 실행 없음)
DATE: 2026-11-16 12:30 KST

# 위험관리 '오늘의 투자 판단' — 수정 요청

## 검토 대상·근거
- `main:docs/team/CLAUDE-LATEST.md` 첫 확인: STATUS READY_FOR_REVIEW, REPORT `docs/team/CLAUDE-DEV-RISK-BRIEFING-20261116.md`, BRANCH `work/claude-risk-briefing-20261116`, 코드 HEAD `017e8034df17950f657e855aeb1513f85210ccf2`, 보고 커밋 `6cba480`.
- `main`의 README-CLAUDE-REPORTS, COLLAB-PROTOCOL, CLAUDE-WORKLOG, UNIVERSE-SCREEN-REQUEST 및 원지시서 `docs/gpt-risk-briefing-20261116:docs/team/GPT-ORDER-20261116-1030.md` 확인. 해당 ORDER-ID는 이미 클로가 1단위 처리했고 중복 발행하지 않음.
- BASE..HEAD 비교: 변경 파일 7개(`has/advisor-panel.js`, 신규 `has/decision-brief.js`, `.css`, `portfolio_v5.html`, 신규 `tests/decision-brief.test.cjs`, `tests/lib/live-data-edits.json`, `tests/lib/live-data-pins.json`). 소스 직접 읽기 및 기존 `has/briefing-model.js`, `has/advisor-bridge.js`, `has/advisor-core.js`, `has/price-trust-ui.js` 데이터 경로 확인.
- 보고서: 클로가 전체 2208건 중 2205 통과, 1 실패(`universe-screen-dom`, 이전 main에서도 재현했다고 보고), 2 skip; 신규 8건 통과, Chromium 360/390/430/1280 확인, 비밀값 발견 0이라고 **보고**. 지피는 재실행·실기기 확인을 하지 않았으며 1건 실패의 원인도 독립 검증하지 않았음.

## CR-1 — 첫 화면 핵심 3카드가 기본 접힘 내부에 숨겨짐(필수)
원지시서 1절의 '첫 화면: 매수 검토 / 매도 검토 / 장기보유 3종 카드(반응형)'와 사용자가 원한 '단순한 시각적 후보' 경험이 충족되지 않음.
현재 `has/decision-brief.js:renderStrip()`는 `KINDS` 세 카드를 `body`에 붙이고, 그 `body`를 `collapsible('strip')`의 `details` 내부에 넣음. `wire()`가 기본 `open=false`로 설정하므로 최초 화면에는 텍스트 집계만 보이고 카드 세 개는 아예 보이지 않음. 보고서의 '첫 화면 핵심 카드'와 실제 DOM 구조가 어긋남.
**수정 요청:** 접힌 기본 화면에도 작은 3분할/반응형 상태 카드(매수 검토, 매도 검토, 장기보유 및 정확한 건수)를 눈에 보이게 배치. 세부 종목·사유·반론만 동일 버튼 1회 펼치기/재터치 접기에 넣고, 판단 보류 및 위험 요약·가격 신뢰도 경고는 그대로 남길 것. 360/390/430/PC에서 접힌 기본 화면을 검증하는 DOM·브라우저 단언 추가. 0건이면 0건 그대로, 예시 수치/종목 노출 금지.

## CR-2 — '검증된 후보만 집계' 계약이 분류기에서 재확인되지 않음(필수)
`has/decision-brief.js:classify()`는 입력 `a.opinion` 문자열만 `KINDS`와 일치하면 적극적 후보로 센다. `dataQuality.ok`, 확인된 사실/출처·기준일, 근거/반론 유무를 점검하지 않으며 `first(a.reasonsFor) || '규칙 엔진 근거'`로 **실제 근거가 비어도** 승격한다. `비중 축소 검토`의 보유 여부도 확인하지 않는다. 신규 시험 ②는 `dataQuality`·facts·asOf가 빠진 수제 `mk()` 객체를 곧바로 매수/매도/장기보유 1건으로 통과시켜 오히려 이를 허용한다.
현재 실제 앱에서는 `HASAdvisorBridge.run()`→`HASAdviceGuard.guard()` 경로를 거치므로 당장 모든 실제 데이터가 위험하다는 뜻은 아님. 그러나 독립 공개 함수의 '검증된 후보' 불변조건이 결여되어, 향후 입력 변경·오류·합성 혼입 시 근거 없는 긍정 신호가 요약 카드에 뜰 수 있음.
**수정 요청:** 원본 엔진의 검증 계약을 손상하지 않는 범위에서, 분류기에도 최소한 데이터 신뢰성·근거/반론·시각/출처·실제/합성 구분·매도 검토 시 실제 보유 여부 등 확정 조건을 fail-closed로 적용하거나, 원본 가드에서 통과한 것만 인증되게 명시적인 검증된 모델 계약을 도입. 검증 불가/상충은 판단 보류로 표시하며 이유를 남길 것. 특히 `{ticker:'X', opinion:'매수 검토', basis:'real', dataQuality:{ok:false}}`, 근거·시각 누락, 미보유 `비중 축소 검토`, 동종목 상충, 실제 화면의 합성 자료에 대한 반례 시험을 추가. 신규 검증은 정상적인 합성 엔진 경로에서 유효 예시가 계속 동작하도록 할 것.

## 확인된 긍정 요소 및 한계
- `details/summary` 단일 컨트롤에 대한 클릭 시 즉시 `open`·`aria-expanded`·'펼치기/접기' 동기화, 가격 신뢰도 경고와 중요 위험 한 줄의 접기 바깥 보존, 탭 전환 `onTabChange`, 위험관리 메뉴 줄바꿈 코드는 확인됨.
- 위험관리 360px에서 하위 메뉴가 5줄인 것은 보고서에 명시되었으나 이번 수정 요청의 핵심 차단 사유는 아님. 실기기 체험성·버튼 접근성 검증은 미완료.
- 기존 `universe-screen-dom` 실패 1건은 클로의 '변경 전도 동일' 주장만 확인됨. 독립 재현 주장 금지, 운영 승인 전 별도 조사 권고.

## 판정과 범위
**VERDICT: CHANGES_REQUESTED** — CR-1, CR-2 수정 코드·회귀/반례 시험·갱신된 보고를 같은 클로 작업 브랜치에 준비하여 지정 새 HEAD로 `READY_FOR_REVIEW` 재요청. 이번 검토는 정적 코드 검토이며 어떠한 운영 배포/병합 승인도 아님. 2026-11-16 현재 사용자의 별도 '올려' 승인은 없음.
이번 작업에서 `main` 병합, 운영 배포, GAS 변경/연결, 실제 API/키, 유료/클라우드 자원, 투자 원장·백업 변경, 자동매매를 수행하지 않았음. 새 GPT-ORDER는 기존 ORDER와 이 수정 검토서로 충분하여 중복 생성하지 않음.
