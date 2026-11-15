VERDICT: CHANGES_REQUESTED
REVIEWED-CLAUDE-HEAD: dad6ac509cf02c73d451ef07f93610a03909b31f
REVIEWED-BRANCH: work/claude-great-companies-20261115
BASE-MAIN: b34037139fd4779299b095326371542ad44b993d
ORDER-ID: 순태씨 직접 결정(2026-11-15 '진행') / 선행 GPT-20261115-1326
REVIEW-TIME: 2026-11-15 21:30 KST
SCOPE: '위대한 기업' 운영 앱 탭 **연결분만** 정적 교차검토. 운영 반영·배포·실제 재무/가치 평가·실기기 동작 승인 아님.

# HAS 위대한 기업 운영 탭 연결 — 정적 교차검토

## 시작 기준·검토 범위
- 가장 먼저 main `docs/team/CLAUDE-LATEST.md`의 STATUS=`READY_FOR_REVIEW`, REPORT=`docs/team/CLAUDE-DEV-GREAT-COMPANIES-20261115.md`(0-h), BRANCH=`work/claude-great-companies-20261115`, HEAD=`dad6ac509cf02c73d451ef07f93610a03909b31f`를 확인.
- 이어서 main `README-CLAUDE-REPORTS.md`, `COLLAB-PROTOCOL.md`, `CLAUDE-WORKLOG.md`, `UNIVERSE-SCREEN-REQUEST-20261112.md`와 main SHA `b34037139fd4779299b095326371542ad44b993d` 확인. 이전 ORDER `GPT-20261115-1326`의 엔진/격리 UI는 각각 19:27/20:30 정적 승인되어 이번 연결분과 구분.
- 선행 승인 HEAD `95af5fb5632564fb72bd3996c980415685f12286` → 지정 HEAD 비교: `portfolio_v5.html`, 신규 `has/great-companies-panel.js/.css`, `tests/great-companies-panel.test.cjs`, 관련 회귀시험 및 live-data 역방향 쌍/핀, 0-h 보고서를 확인. main 문서 병합은 기능 변경과 구분.
- 직접 파일 내용을 읽은 **정적 검토**. 지피는 전체 시험·Playwright·Galaxy·로컬 서버·비밀값 스캔을 독립 재실행하지 않았음.

## 수정 필요 — 1. ETF 식별 실패를 일반기업으로 확정 표시
- `has/great-companies-panel.js`의 `guessEtf()`는 미국 ETF를 소수 고정 티커 목록으로만 판단하고, 국내 ETF는 운용사 상표 뒤 공백 또는 끝 경계를 요구함.
- 따라서 `US:QLD`, `US:GLDM` 등 목록에 없는 ETF는 `company.kind='company'`가 되고, `KR`에서 `KODEX미국S&P500TR`/`TIGER미국S&P500`처럼 브랜드 다음 공백 없는 ETF 이름도 `company`로 처리됨. 이 결과는 안전한 `판단 보류(ETF 추정)`와 다르게 일반기업 재무자료 미연결 사유를 보여줌. 기존 시험은 `KODEX 200`과 `QQQ`만 확인해 놓침.
- **요청:** 신뢰할 수 있는 상품유형 필드가 있을 때 우선 사용하고, 확인하지 못한 상품은 `company`로 단정하지 말고 `상품 유형 미확인 — 기업 평가 보류`로 처리할 것. 무제한 티커 추정 규칙으로 오인식하지 말 것. 위 4개 반례, 일반 보통주 반례, 출처 미확인 반례 추가. 근본 데이터 유형 제공이 범위 밖이라면 제한 및 정확한 보류 라벨부터 구현.

## 수정 필요 — 2. 동일 티커 다계좌 보유의 투자원칙 기록 누락
- `buildInputs()`에서 첫 계좌의 `thesisOf(p)`가 `p={}` 또는 실질적으로 빈 기록이어도 `{logicState:null,checkpoints:[]}`라는 **truthy** `input.thesis`를 만든다. 이후 같은 티커의 다른 계좌에 실제 투자논리·점검항목이 있어도 `if (!r0.input.thesis && th)`가 false라 후속 기록을 조용히 버림.
- **재현 입력:** 일반계좌 `KR:005930`의 빈 원칙 기록 `{}` + ISA 계좌 동일 티커의 `logicState:'maintained', checkpoints:[{text:'매출 추세',done:true}], thesis:'장기 경쟁우위'`. 결과 화면은 뒤 계좌의 투자논리/점검을 반영하지 않는 경로가 존재.
- **요청:** 실질적 입력 여부를 평가해 빈 기록이 정상 기록을 가리지 않게 하고, 둘 이상의 유효한 기록이 상충하면 임의 선택·합치지 말고 계좌별 출처 또는 '원칙 기록 상충 — 확인 필요'를 표시. `buildInputs`의 원본 불변성과 읽기 전용 원칙 유지. 빈 기록→유효 기록, 유효→빈 기록, 상충 기록 시험 추가.

## 확인된 긍정적 사항과 한계
- 변경된 `portfolio_v5.html`은 위험관리 `greatco` 버튼·패널을 연결하되, 로그인 시 `has/great-companies-panel.js`의 defer 태그를 두지 않고 탭 첫 진입에 주입. 실패 시 다시 누르면 재시도 경로가 있음.
- 코드상 `has/great-companies-panel.js`는 보유목록·투자원칙을 읽어 `textContent` 기반 DOM 생성, 직접적인 보유 기록 저장/삭제/매매/외부 AI 전송을 수행하지 않음. `fundamental=null`, `price=null` 입력이라 현재 결과는 투자 판단 보류, 매수·매도 게이트 닫힘.
- 클로 **보고 수치**: 신규 시험 6건, 전체 2,193건 중 2,191 통과·0 실패·2 skip(DST), Chromium 360/390/430px 검증 및 localStorage 불변, 비밀값 검사 0건. 모두 **클로 실행 주장**으로 지피의 독립 재현이 아님. 동일 조건 기존 앱 속도 비교·Galaxy 실기기 동작은 미검증.
- 재무(SEC/DART), 밸류에이션·52주 가격 위치 및 4단계 사전 조사가 앱에 연결되지 않은 상태이므로 실제 장기보유 판정 기능 완성/추천으로 표시하거나 게이트를 열지 않음.

## 완료 조건·승인 범위
1. 위 2개 입력 분류·투자원칙 누락 위험을 코드로 수정하고 반례 시험을 같은 브랜치에 반영.
2. 새 `CLAUDE-DEV-GREAT-COMPANIES-20261115.md` 0-i절 등 명확한 변경 범위·HEAD·시험 근거를 같은 HEAD에 포함하여 `STATUS: READY_FOR_REVIEW`로 재요청.
3. 정적 재검토 `APPROVE` 전에는 이 탭의 운영 반영을 승인하지 않음. APPPROVE 후에도 **사용자 명시적 '올려' 승인** 필요.
4. 운영 배포, main 병합, GAS·실제 API/키, 비용, 클라우드, 투자기록·백업 변경, 자동매매 금지. 비밀값 GitHub 업로드 금지.

## 별개 진행 상태
- `radar/data/universe-400.json`은 main에서 확인 시 404(미존재). 기존 코스피 201/미국 200 및 `universe-manifest-20261112.json` 이력과 공식 출처 검증이 남았으므로 기존 처리 건을 중복 개발 지시하지 않음.
- 뉴스 코드 완전 삭제 `d3f5fcc`의 사후 검토 요청은 별도 범위이며 이번 판정에 포함하지 않음. 새 GPT-ORDER는 중복 방지 원칙에 따라 만들지 않음.
