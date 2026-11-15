VERDICT: APPROVE
REVIEWED-CLAUDE-HEAD: 09d39c5b63ac4d8fc0bb64b1cb4a9011053cb4af
REVIEWED-BRANCH: work/claude-great-companies-20261115
BASE-MAIN: 1875e256022bff13915747b36c91bd533945152e
ORDER-ID: 순태씨 직접 결정(2026-11-15 '진행') / 선행 GPT-20261115-1326 / 직전 GPT-REVIEW-great-companies-20261115-2230
REVIEW-TIME: 2026-11-15 23:30 KST
SCOPE: 위대한 기업 운영 탭 연결 중 22:30 CHANGES_REQUESTED 2건에 대한 변경 코드·시험 근거의 정적 검토 승인만. main 병합·운영 반영·실데이터 투자 평가·실기기 품질 승인 아님.

# HAS 위대한 기업 운영 탭 — 23:30 정적 교차검토

## 절차 및 범위
- **가장 먼저** main `docs/team/CLAUDE-LATEST.md`를 읽어 STATUS=`READY_FOR_REVIEW`, REPORT=`docs/team/CLAUDE-DEV-GREAT-COMPANIES-20261115.md` 0-j절, BRANCH=`work/claude-great-companies-20261115`, HEAD=`09d39c5b63ac4d8fc0bb64b1cb4a9011053cb4af` 확인.
- 이어 main의 `README-CLAUDE-REPORTS.md`, `COLLAB-PROTOCOL.md`, `CLAUDE-WORKLOG.md`, `UNIVERSE-SCREEN-REQUEST-20261112.md`를 읽음. 최신 main SHA는 위 `BASE-MAIN`, 처리된 `GPT-20261115-1326` 및 21:30·22:30 검토 지시 확인. 별도 새 GPT-ORDER를 만들지 않음.
- 지정 HEAD의 보고서 0-j절과 실제 `has/great-companies-panel.js`, `tests/great-companies-panel.test.cjs`, `tests/lib/live-data-pins.json`, 연관 엔진 `has/great-companies.js`를 읽음. `46d05f728a3bf969b1d1ded178c6cfbb6f03829f...09d39c5b63ac4d8fc0bb64b1cb4a9011053cb4af` 비교는 ahead 3 commits, 패널·시험·핀·협업 문서 변경. `portfolio_v5.html`과 엔진 자체는 이 비교 구간에서 미변경.
- 본 검토는 **GitHub의 실제 소스 및 시험 코드에 대한 정적 검토**임. 지피가 node 전체시험, Playwright, 비밀값 검사, 실제 갤럭시, 실제 SEC·DART 데이터 대조를 독립 실행한 것은 아님.

## 22:30 수정 요청 1 — 다계좌 원칙 기록 원문 비교: 승인
- `thesisOf(p)`가 투자 이유 원문·논리 상태·점검 항목 문구/확인 여부·논리 붕괴 조건을 비교 전용 비열거 `_cmp`에 보유. 문자열은 NFC 및 공백 정규화.
- `buildInputs`는 동일 종목의 실제 계좌별 기록을 모두 비교해 서로 다른 항목을 찾아 `recordConflict=true`, `input.thesis=null`로 보류하고, 카드에는 다른 **항목명**만 표시. 중간 `_th`·`_ks`를 반환 행에서 삭제하며, 비교용 원문은 JSON 직렬화·카드 문구에 포함하지 않음.
- 실제 추가 시험 코드에 ① 논리 상태·체크포인트는 같고 투자 이유 원문만 상반인 22:30 반례 ② 공백/NFC 변형 동일 내용 ③ 붕괴 조건·점검 항목 문구·확인 여부 차이 ④ 빈 기록과 유효 기록·원본 freeze·게이트 닫힘이 명시됨.
- **검토 결론:** 기존 축약값 비교로 논리 충돌을 누락하는 문제에 대한 수정이 적합함. 의미상 같은 다른 표현도 상충으로 보수 처리될 수 있으나, 현재 자료 검증/주문 게이트가 닫혀 있으므로 승인 차단 사유로 보지 않음.

## 22:30 수정 요청 2 — 상품 유형 출처 검증·계좌별 충돌: 승인
- `kindSignal`은 `productType`을 **미검증 주장**으로 수집하며 `resolveKind`는 계좌 순서와 무관하게 통합. `productType:'company'`만으로 `kind:'company'`를 출력하지 않고 `unknown` + 출처 미검증으로 둠.
- 'company' 주장과 'etf' 주장/ETF 추정 신호가 함께 있으면 `unknown`·`typeConflict=true`·'상품 유형 상충 — 확인 필요' 태그로 보류. 'etf' 주장 단독도 ETF **추정**으로 표시. 신뢰할 유형 출처는 연결되지 않았으므로 보통주도 `unknown`으로 판단 보류.
- 추가 시험 코드에 QQQ·국내 KODEX/TIGER와 company 기록 충돌, 삼성전자 같은 티커를 두 계좌에서 company/etf 순서 교환, QLD·GLDM·일반 보통주·비정상 유형, 모든 결과의 `buyGate.open=false`/`sellGate.open=false` 및 화면 태그가 포함됨.
- **검토 결론:** 미검증 문자열을 검증된 기업 분류로 승격시키거나 첫 계좌 유형을 무조건 채택하던 문제를 해소. ETF 이름/목록 추정 자체는 공식 분류가 아니므로 실제 재무 연동 전에 별도 신뢰 출처가 필요함.

## 시험 근거와 미검증 사항
- **클로 보고 수치(지피 독립 재실행 아님):** 총 2,199건 중 2,197 통과, 0 실패, 2 skip(DST); 신규 3건; 비밀값 검사 findings 0; Playwright Chromium 360/390/430px에서 가로 넘침 0, 최소 글자 12px, 화면 오류 0, 원문 비노출·localStorage 전후 동일.
- 위 보고의 변경 소스와 시험 단언은 직접 읽었으나, 실제 실행 환경·실계좌 자료·갤럭시 실기기·동일조건 로그인 성능·SEC/DART/밸류에이션 정확도는 독립 검증하지 않음. 과거 승인된 평가 엔진의 실제 투자 성과를 이번 승인으로 확대하지 않음.
- 현재 패널 입력의 `fundamental=null`, `price=null` 및 보수적 유형 분류로 판단 보류; 엔진의 매수·매도 검토 게이트는 항상 닫혀 있음. 사용자 입력 투자원칙을 사실 검증한 것이 아님.

## 승인 범위 및 후속
1. **APPROVE**: 지정 HEAD `09d39c5b63ac4d8fc0bb64b1cb4a9011053cb4af`에 반영된 22:30 CR 2건의 정적 검토 및 운영 탭 읽기 전용 연결의 해당 보완 부분에 한정.
2. **NOT APPROVED**: main 병합·Pages/운영 배포·GAS/실제 API 연동·실제 시세/재무 판단·실매매 추천·투자기록 수정. 사용자가 별도로 명시적으로 '올려' 승인하기 전에는 운영 반영 금지. 갤럭시 실기기 점검 및 종목 유형 공식 출처 연동은 후속 과제.
3. 400종목 `radar/data/universe-400.json`은 main에 미존재(읽기 404). 일지에 코스피 201·미국 200 데이터와 별도 manifest 구성 및 처리 내역이 확인되어 이번 검토에서 중복 목록 생성·추가 지시를 하지 않음. 공식 출처·기준일·버전 확인은 별도 미완료 확인 과제.
4. 뉴스 코드 완전 삭제 `d3f5fcc` 사후 검토 요청은 별개 주제이며 본 승인에 포함하지 않음.
5. 이번 조치는 **주제 문서 브랜치에 검토서 1개 저장**에 한정. main 병합, 운영 배포, GAS 변경, 키/API 사용, 비용·클라우드 생성, 투자기록·백업 변경, 자동매매, 비밀정보 업로드 없음.
