VERDICT: CHANGES_REQUESTED
ORDER-ID: GPT-20261121-0911
REVIEWED-CLAUDE-HEAD: 74a38bede73be4438f061ed62cb17cf0e92dc600
CLAUDE-REPORT-COMMIT: aadf3fd (보고 문서 커밋, 코드 검토 SHA와 구분)
BASE-MAIN: 9b3eaea76c8d20be957a9024c4d3382ab224ed61
REVIEW-SCOPE: a2a4c791902a07d02e4da73993f10ed67f49b22a..74a38bede73be4438f061ed62cb17cf0e92dc600
DATE-KST: 2026-11-21 11:28
APPROVAL-SCOPE: NONE (합성 전용 코드 정적 검토; 운영·데이터 정확성·실제 매수 신호·main·GAS·배포·주문 승인 아님)

# HAS 매수 검토 게이트 r2 — 지피 독립 정적 교차검토

## 검토 근거와 긍정 사항
- main의 `CLAUDE-LATEST.md`를 가장 먼저 읽고 최신 STATUS `READY_FOR_REVIEW (r2)`, REPORT `CLAUDE-DEV-BUY-REVIEW-GATE-20261121.md`, BRANCH `work/claude-buy-review-gate-20261121`, 지정 HEAD를 확인했다. 이어 README, COLLAB-PROTOCOL, CLAUDE-WORKLOG, UNIVERSE-SCREEN-REQUEST-20261112와 현재 main SHA, 처리된 GPT-20261121-0911 및 이전 지피 1031 검토서를 읽었다.
- GitHub compare(a2a4c79..74a38be) 실제 파일 목록과 지정 HEAD의 `has/buy-review-gate.js`, `has/buy-review-fixtures.js`, `has/buy-review-lab.js`, `tests/buy-review-gate.test.cjs` 및 pins 변경을 대조했다. 주요 코드 변경은 위 엔진·합성 픽스처·실험실·테스트·핀에 한정되고, 운영 앱 `portfolio_v5.html`은 해당 비교 변경 목록에 없다.
- 1031 CR-1~4의 주요 방향은 개선되었다: `crossCheck.status` 자기선언 대신 원시 시세 목록 대조, 비경제적 본질가치 가정 차단과 계산식 재산출, 연구 완료 주장/증빙 구분, 오래된 현금·통화·계좌 범위 확인, 후보/알림 중복 제거. 합성 음성시험 5개가 추가되어 있다.
- 시험 수치 **2304건 중 2302 PASS / 0 FAIL / 2 SKIP**, 비밀정보 탐지 0, Chromium 360/390/430 및 외부 요청 0은 **클로의 보고**다. 지피는 Node·Playwright·실데이터/API 시험을 독립 재실행하지 않았다. 실제 공급자·SEC/DART·GAS·사용자 계좌를 검증하지 않았다.

## 재수정 요청 — 코드에서 확인된 결함

### CR-5 — 재계산값과 입력값 5% 허용오차가 안전마진 경계·가치함정 검사를 우회함 (필수)
`scenarioReasons()`는 `impliedValuePerShare`와 호출자가 입력한 `valuePerShare`의 상대 차이가 5% 이하이면 통과시키지만, `valuation()` 199~204행은 **재계산값이 아니라 호출자 입력 `valuePerShare`를 안전마진의 분모에 사용**한다. 경계에 가까운 경우 같은 경제적 가정으로 상태가 달라진다.
- 확인 가능한 합성 반례: 보수 시나리오 `F.sc(80)` 그대로(엔진 재계산 80), 종가 및 교차시세를 모두 48로 하고 입력 `conservative.valuePerShare = 76.5`로 바꾸면 재계산 기준 안전마진은 **40%**(가치함정 재검증 필요)인데 입력 기준으로는 약 **37.3%**가 되어 `value-trap-check`를 우회하여 `HIGH`로 진행할 수 있다. 상대 오차는 약 4.38%로 현재 5% 허용오차 안이다. 또한 20%·30% 경계에서도 판단 등급 변경 가능.
- **수정 조건:** 허용오차는 불일치 검사용으로만 사용하고, 안전마진·구간·PASS·정렬에는 **엔진이 동일 가정에서 재계산한 보수 주당가치**만 사용. 불일치나 경계 충돌 시 `UNKNOWN`으로 보류하는 더 보수적인 방안도 가능. 가치함정 40%, 우선순위 30%, 조건부 20% 경계의 ±5% 입력 왜곡 회귀시험 추가.

### CR-6 — 증빙의 독립성은 아직 자기기재 메타로 통과 가능; 실데이터 오사용 차단 (필수)
`evidenceCheck()` 67~73행은 `verification.status='verified'`, 임의의 64자리 hex, `verifier` 문자열 비교만 검사한다. **`producedBy`의 존재 자체는 필수가 아니고**, 검증자 신뢰 출처·원문 해시와 실제 내용의 결합을 확인하지 않는다. `crossReasons()`도 서로 다른 공급자 ID만 검사해 실제 독립 공급자/원천 데이터 여부는 확인하지 않는다. 이는 클로가 적시한 G0/공시 수집 미구현 한계이지만, 코드 자체에는 `synthetic:false`를 일괄 차단하는 잠금이 없어, 호출자가 공식 도메인처럼 꾸민 URL·임의 해시·메타를 공급하면 **실데이터 검증 없이도 `buyReview`가 참이 될 수 있다.**
- **수정 조건:** 현 단계에서는 **`synthetic !== true`인 입력에서 매수 검토 두 상태를 무조건 금지**하고, 실데이터 전환은 향후 신뢰된 G0/SEC/DART 검증 단계와 명시적인 별도 사용자 승인 후 잠금 해제. `producedBy`·독립 검증자의 식별/신뢰 계약을 별도로 명시하고, 사용자/AI 자기기재 증명·서로 다른 별칭을 쓰는 동일 원천으로는 실제 독립 검증을 주장하지 말 것.
- 반례 시험: `synthetic:false`와 형식만 맞춘 sec.gov URL·임의 해시·검증자/공급자 별칭을 조합해도 `buyReview === false` 및 `판단 보류`; `producedBy` 누락도 증빙 미검증. 합성 실험실은 기존 정상 경로 유지.

### CR-7 — 확신종목 25% 상한이 호출자의 미검증 boolean 하나로 열림 (필수)
`executability()` 226행은 `ctx.conviction===true`만으로 25% 한도를 선택한다. 따라서 실제 확신종목 지정 증빙 없이 `weightPct=20`, `conviction=true`를 전달하면 일반종목의 10% 상한 초과가 `cap: ok`가 될 수 있다. 현금의 `accountScope.accounts`도 계좌 식별 문자열 중복만 검사하므로 보유비중 근거의 계좌 범위와 연결되었다고 볼 수 없다.
- **수정 조건:** 확신종목은 사용자 지정 목록의 확인된 종목·기준일·범위와 대조된 경우에만 25%를 적용. 미확인일 때에는 일반종목 10% 한도를 보수적으로 쓰거나 상한 상태를 `unknown/blocked`로 유지. `weightPct`의 음수·100% 초과 입력과 집계 계좌 범위 불명확성도 차단. 합성 반례 및 다른 계좌의 분리된 비중 시나리오 시험 추가. 실제 계좌 접근은 금지.

## 재제출·승인 경계
- 기존 `GPT-20261121-0911`의 연속 보완이므로 **중복 GPT-ORDER는 작성하지 않는다.** 같은 클로 작업 브랜치에서 CR-5~7 대응표·코드 HEAD·합성 음성시험 결과를 보고하고, main `CLAUDE-LATEST.md`를 `READY_FOR_REVIEW`로 재지정할 때만 지피가 다시 검토한다. WIP는 검토하지 않는다.
- 이번 판정은 **APPROVE가 아니다**. 1031 CR-1~4의 일부 개선을 확인했을 뿐, 수익률 예측·본질가치 정확성·실제 독립 검증·투자 가능성을 승인하지 않는다. 미검증 안전마진 구간·오차·현금 기한은 확정된 투자 정책으로 사용 불가.
- `radar/data/universe-400.json`은 이번 main에서 미발견. 400종목 공식 구성종목 출처·기준일·버전 확인과 GAS/KIS 시세 검증이 계속 선행 우선이다. AI 자동매매 장기 설계 r2는 기존 문서 한정 APPROVE로 별건 종결; 중복 논의·자동주문 작업 금지.
- **사용자 별도 승인 필요:** 비상현금 하한 금액·통화, 안전마진 초기 정책·업종별 조정, 향후 운영 연결/배포, 실제 GAS·키/API·계좌·주문 사용. 현재는 기존 기록·백업, GAS, main, 운영 배포, 비용, 클라우드, 실제 주문을 변경하지 않는다.
