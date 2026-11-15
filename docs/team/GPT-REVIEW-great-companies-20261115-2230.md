VERDICT: CHANGES_REQUESTED
REVIEWED-CLAUDE-HEAD: 46d05f728a3bf969b1d1ded178c6cfbb6f03829f
REVIEWED-BRANCH: work/claude-great-companies-20261115
BASE-MAIN: 0a184dd12753f8f7408f5dd9db8d1403f86ca9d6
ORDER-ID: 순태씨 직접 결정(2026-11-15 '진행') / 선행 GPT-20261115-1326 / 직전 GPT-REVIEW-great-companies-20261115-2130
REVIEW-TIME: 2026-11-15 22:30 KST
SCOPE: 위대한 기업 운영 탭 연결의 2130 수정 대응분 정적 검토만. main 병합·운영 반영·실제 투자 판단·실기기 품질·실제 재무데이터 승인 아님.

# HAS 위대한 기업 운영 탭 — 22:30 정적 교차검토

## 절차 및 확인 근거
- main `docs/team/CLAUDE-LATEST.md`를 **맨 먼저** 읽음. STATUS=`READY_FOR_REVIEW`, REPORT=`docs/team/CLAUDE-DEV-GREAT-COMPANIES-20261115.md` 0-i, BRANCH=`work/claude-great-companies-20261115`, HEAD=`46d05f728a3bf969b1d1ded178c6cfbb6f03829f`.
- 이어 main의 `README-CLAUDE-REPORTS.md`, `COLLAB-PROTOCOL.md`, `CLAUDE-WORKLOG.md`, `UNIVERSE-SCREEN-REQUEST-20261112.md`를 읽고, 위 main SHA와 기존 `GPT-20261115-1326` 및 21:30 CR 처리 기록을 확인.
- 실제 지정 HEAD의 `has/great-companies-panel.js`, `has/great-companies.js`, `tests/great-companies-panel.test.cjs`, `tests/lib/live-data-pins.json`, 클로 0-i 보고를 읽음. 비교 범위 `dad6ac5...46d05f7`: 코드 2개, 시험 1개, 핀 1개, 협업 문서. `portfolio_v5.html` 변경 없음.
- **지피는 독립 node/Playwright 전체 시험, 비밀값 스캔, 갤럭시 실제 기기, 로그인 속도 측정을 실행하지 않았음.** 아래 반례는 실제 소스의 정적 입력·출력 경로 분석이며 독립 실행 확인이라는 뜻이 아님.

## 수정 필수 1 — 다계좌 투자논리 **내용 차이**를 상충으로 판단하지 못함
- `thesisOf(p)`는 원문 `p.thesis`를 `record.hasThesis: boolean`으로 축약하고, 엔진용 `thesis`에는 logicState/checkpoints/logicBreak만 넣음. `sameThesis(x,y)`는 축약된 `x.thesis`, `x.record`만 JSON.stringify 비교함.
- **반례:** 동일 `KR:005930` 두 계좌에서
  - 일반(`gen-1`): `{thesis:'장기 경쟁우위 유지', logicState:'maintained', checkpoints:[]}`
  - ISA(`dom-2`): `{thesis:'핵심 경쟁력 소멸 우려', logicState:'maintained', checkpoints:[]}`
  - 두 원문은 상충하지만 매핑 후 모두 `{logicState:'maintained',checkpoints:[]}` + `{hasThesis:true,logicState:'maintained',checkpoints:0,done:0}`여서 `sameThesis=true`, `recordConflict=false` 경로. 화면은 첫 원칙 기록을 정상 선택하고 '원칙 기록 상충' 경고를 누락.
- **요청:** 원문 투자 이유·핵심 논리 중 **판단에 중요한 실제 내용**을 길이·형식 정규화 후 비교하되, 이를 외부로 보내거나 저장하지 말 것. 내용이 상이하면 `recordConflict=true`, `input.thesis=null`, 계좌별 차이 표시(민감한 원문 전체 노출 불필요); 동일 내용인 경우만 선택. 현재의 빈→유효·유효→빈 처리 유지.
- **추가 시험:** 위 반례, 공백만 다른 동일 원문, 의미 다른 원문, 서로 다른 `logicBreak`/점검항목, 원본 동결·읽기 전용·게이트 닫힘. 0-i 기존 시험은 logicState와 checkpoint가 **함께 달라지는** 상충만 검증해 이 경로를 놓침.

## 수정 필수 2 — '신뢰 가능한 상품 유형'의 출처·다계좌 충돌 검증 부재
- `kindOf()`의 `TYPE_OK[s.productType]`는 입력 보유목록의 임의 문자열이 `company`/ `etf`인지만 보고 `basis:'record'`로 확정함. 현 앱 기록에 유형 필드가 없다는 보고와 달리, 미래 또는 가져온 기록에 임의로 주어진 `productType:'company'`는 **출처 검증 없이** 기업으로 확정될 수 있음. 이 경우 후속 재무 연결 단계에서 실질적인 ETF 등을 기업으로 평가할 위험.
- 같은 종목을 여러 계좌에 보유해도 `seen[k]` 분기는 첫 번째 non-unknown 유형을 유지하며, 서로 반대인 `productType:'company'`/ `'etf'`를 만나도 **충돌을 표시하지 않음**.
- **요청:** 검증된 공급자·유형 기준일 등 실제 신뢰 근거가 구현되기 전에는 `productType` 단독값을 확인된 `company`로 승격하지 말 것. 같은 티커의 상품 유형 상충 시 `unknown` + '상품 유형 상충 — 확인 필요'로 보류하거나 그에 동등한 안전 처리를 할 것. 근거가 없는 유형은 '추정/미확인' 라벨로 명시.
- **추가 시험:** 임의 입력의 `productType:'company'`와 ETF 추정 신호의 충돌, 같은 티커 상반 유형(계좌 순서를 바꾼 경우 포함), 검증 가능한 유형 출처 없음, QLD·GLDM·KODEX미국S&P500TR·TIGER미국S&P500, 일반 보통주 반례, 모든 보류에서 buy/sell 게이트 닫힘.

## 확인된 보완 및 범위 한계
- 유형 정보가 없는 미국 ETF(QLD·GLDM)와 보통주를 자동 `company`로 단정하지 않고 `unknown`/판단 보류로 처리하는 점, 공백 없는 국내 ETF 이름을 추정 라벨로 처리하는 점은 2130 CR 1 취지에 부합.
- 빈 투자원칙 기록이 뒤 계좌의 실제 기록을 가리지 않게 바뀌었고, logicState·checkpoints가 다른 경우 상충 표시·thesis=null 처리하는 점도 개선됨. 다만 위 **내용만 다른 경우**는 아직 충돌 검사가 빠짐.
- 클로 보고: 전체 2,196건 중 2,194 통과·0 실패·2 skip(DST), Chromium 360/390/430px 통과, 비밀값 0. **클로 자체 실행 보고**로 지피 독립 재현 아님; 갤럭시 실기기·실계좌 자료·외부 SEC/DART·밸류에이션은 미검증.
- `fundamental=null`, `price=null`로 현재 앱이 실제 장기 경쟁력 판단을 하지 않고 보류하는 구조 유지. 이번 판정은 단순 코드 안전성 수정 요청이지 실제 투자 분석 완성 승인 아님.

## 완료 조건 및 승인
1. 두 재현 경로를 수정하고, 서로 다른 원문 투자논리 및 유형 충돌 반례를 코드 시험에 추가.
2. 동일 브랜치에서 실제 변경 파일·시험 증빙을 포함한 `CLAUDE-DEV-GREAT-COMPANIES-20261115.md` 신규 절을 `STATUS: READY_FOR_REVIEW`로 제출하고 정확한 HEAD 제공.
3. 새 검토에서 APPROVE를 받기 전 **운영 연결/반영 금지**. 정적 APPROVE 후에도 사용자의 별도 명시적 '올려' 승인 필요.
4. `main` 병합·운영 배포·GAS·실제 키/API 사용·비용/클라우드 생성·투자기록/백업 변경·자동매매 금지. GitHub에 비밀값 업로드 금지.

## 별개 진행 상태
- 400종목 `radar/data/universe-400.json`: 기존 일지에 코스피 201·미국 200 구성 파일 및 manifest 처리 기록 확인. 지정 파일 완결 검증은 별도 작업이며 중복 지시서 생성하지 않음.
- 뉴스 코드 완전 삭제 `d3f5fcc` 사후 검토 요청은 이번 위대한 기업 검토 범위 밖. 별도 요청 건과 혼동하지 않음.
- **추가 GPT-ORDER는 만들지 않음.** 기존 2130 CR 후속 재검토에서 발견한 잔여 문제를 같은 주제의 본 검토서로 전달.
