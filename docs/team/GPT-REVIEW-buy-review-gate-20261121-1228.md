VERDICT: CHANGES_REQUESTED
ORDER-ID: GPT-20261121-0911
REVIEWED-CLAUDE-HEAD: 26b90befa4dd1ad40cdf67808f1a1f48fd1f797d
CLAUDE-REPORT-COMMIT: 8d235bf (보고 문서 커밋; 위 코드 HEAD와 구분)
BASE-MAIN: 146d095485e0f312eb785c307e8c8237a1fcadf9
REVIEW-SCOPE: 74a38bede73be4438f061ed62cb17cf0e92dc600..26b90befa4dd1ad40cdf67808f1a1f48fd1f797d
DATE-KST: 2026-11-21 12:28
APPROVAL-SCOPE: NONE (합성 전용 코드 정적 검토 및 수식 대조; 운영·실데이터·실매수 신호·정책값·main 병합·GAS·배포·계좌·주문 승인 아님)

# HAS 곡소리 매수 검토 게이트 r3 — 지피 교차검토

## 기준과 근거
- main의 `docs/team/CLAUDE-LATEST.md`부터 읽어 STATUS `READY_FOR_REVIEW (r3)`, REPORT `docs/team/CLAUDE-DEV-BUY-REVIEW-GATE-20261121.md`, BRANCH `work/claude-buy-review-gate-20261121`, 지정 코드 HEAD `26b90be`와 보고 커밋 `8d235bf`를 확인했다. 이어 main의 `README-CLAUDE-REPORTS.md`, `COLLAB-PROTOCOL.md`, `CLAUDE-WORKLOG.md`, `UNIVERSE-SCREEN-REQUEST-20261112.md`, 기존 1128 GPT-REVIEW 및 처리된 ORDER-ID를 확인했다.
- GitHub compare(74a38be..26b90be)의 실제 변경 목록을 읽고 지정 HEAD의 `has/buy-review-gate.js`, `has/buy-review-fixtures.js`, `tests/buy-review-gate.test.cjs`, 보호 핀 및 실험실 호출 경로를 검토했다. `portfolio_v5.html`, GAS, 서비스워커는 해당 변경 목록에 없다.
- CR-5에서 안전마진에 재계산값을 사용하고 경계 충돌을 보류시키는 방향, CR-6의 `synthetic !== true` 실자료 잠금과 원천 등록부, CR-7의 단순 conviction boolean 무시·계좌 범위·비중 0~100 검사는 개선됐다.
- **클로 보고 시험**: 전체 2307건 중 2305 PASS / 0 FAIL / 2 SKIP, 비밀값 검사 0, Chromium 360/390/430 가로 스크롤 0·글자 최소 12px. **지피는 Node/Playwright 시험을 재실행하지 않았고** 실제 데이터·G0/SEC/DART·API·계좌를 검증하지 않았다. 아래는 코드의 정적 검토와 수학적 반례에 근거한다.

## 재수정 요청

### CR-8 — 경계 판정에 1자리 반올림값을 사용해 20%/30% 미달에도 매수 검토 단계가 올라갈 수 있음 (필수)
- 지정 HEAD `has/buy-review-gate.js` `valuation()`은 `out.marginPct = round((1 - price / rc.conservative) * 100, 1)` 후 **반올림된 값**으로 `bandOf(m)`를 호출하고, `evaluate()`도 해당 반올림값으로 D 통과/등급을 결정한다.
- 계산 반례: 엔진이 재계산한 보수 주당가치 80, 종가 64.032라면 실제 안전마진은 **19.96%**인데 화면/판정값이 20.0%로 반올림되어 `conditional` 경계를 통과할 수 있다(나머지 게이트·조사 통과 합성 입력 가정). 종가 56.032일 때도 실제 **29.96%**가 30.0%로 올라 `priority/HIGH`가 될 수 있다. 입력 `valuePerShare`가 재계산값과 같아도 발생하므로 새 경계충돌 검사로 방어되지 않는다.
- 완료 조건: **원시 미반올림 수치**로 10/20/30/40 경계·D 상태·가치함정 재검증·후보 우선순위를 판정하고, 사용자 표시만 반올림한다. `19.94/19.96/20.00`, `29.94/29.96/30.00`, `39.94/39.96/40.00` 및 입력값 경계 충돌을 회귀시험한다. 새 수치 정책을 확정하지 말 것.

### CR-9 — 공개 후보/알림 함수가 evaluate의 실제 자료 잠금을 우회할 수 있음 (필수)
- `evaluate()`는 실자료 잠금을 적용하나 같은 모듈에서 외부로 공개한 `shortlist(results)`는 `r && r.buyReview`만 확인하며, `notifyPlan`은 이를 그대로 사용한다.
- 합성으로 확인 가능한 직접 호출 반례: `G.shortlist([{market:'US', ticker:'SYN-X', synthetic:false, state:'조건부 분할매수 검토', buyReview:true, valuation:{marginPct:50}}])`는 평가 과정을 거치지 않은 **실자료 플래그 결과**라도 후보로 받아들일 구조다. `G.notifyPlan`에도 같은 문제가 전파된다. 결과 객체의 `buyReview`와 `state`는 외부 입력만으로 위조 가능하다.
- 완료 조건: 후보·알림 경로 모두 실자료 잠금에 대해 독립적으로 fail-closed하고, 임의 결과 객체가 엔진 검증을 받았다는 자기선언만으로 후보가 되지 않게 한다. 합성 실험실의 정상 3종목은 유지하되 `synthetic:false/누락`·위조 상태/임의 객체가 후보/알림 0건이 되는 음성시험을 추가한다. 실자료 사용 해제는 별도 승인·신뢰 G0 구축 뒤 재검토한다.

### CR-10 — 확신종목 지정 출처가 아직 호출자의 자기기재임을 분리해야 함 (필수)
- `convictionCheck()`는 boolean 하나를 무시하도록 개선됐지만, 동일 호출자의 `ctx.convictionList`에 `{status:'confirmed', designatedBy:'user', asOf:..., accountScope:..., items:[...]}`를 채우면 해당 티커에 **25% 상한**이 열린다. 실제 사용자가 확정한 목록이라는 근거를 엔진이 검증하지는 못한다.
- 완료 조건: 현재 **합성 예제에서만 25% 동작**한다는 한계를 코드·결과에 명시하고, 향후 실제 계좌에는 사용자 확인 목록의 신뢰된 발급/보관·검증 경로가 없는 한 보수적인 10% 또는 상한 미확인을 사용한다. 요청자가 임의로 `designatedBy:'user'`를 쓰는 것을 실제 사용자 승인으로 해석하지 않는 계약/음성시험을 추가한다. 실제 투자기록 접근이나 목록 동기화는 금지.

## 범위·후속
- 판정은 `CHANGES_REQUESTED`: CR-5~7 보완 중 긍정 요소는 있으나 **r3 전체 APPROVE가 아니다**. 운영 앱 미연결 합성 개발 단위만 정적으로 검토했다. 실제 매수 추천, 고정 안전마진 기준, 수익률·본질가치 정확성을 승인하지 않는다.
- 기존 ORDER `GPT-20261121-0911`의 연속 수정이므로 **새 GPT-ORDER 중복 발행하지 않는다**. 같은 클로 브랜치에 CR-8~10 대응·음성시험 근거·새 코드 HEAD를 기록하고 main LATEST를 `READY_FOR_REVIEW`로 다시 지정하면 재검토한다. WIP 검토 금지.
- `radar/data/universe-400.json`은 main에서 확인되지 않았다(404). 공식 구성종목 원본·기준일·버전 구축, GAS/KIS G0 시세 출처·통화·시간·조정기준의 독립 검증과 SEC/DART 재무 연결이 실제 매수 판단보다 선행한다. AI 자동매매 장기 설계 r2는 **문서 한정 APPROVE**로 이미 종결됐으며 재지시하지 않는다.
- 사용자 별도 승인 필요: 비상현금 하한 금액/통화, 안전마진 초기 정책 및 업종별 조정, 확신종목 실제 지정의 신뢰 경로, 향후 GAS·실키/API·실계좌·운영 배포·main 병합·주문. 이번에는 실제 투자기록·백업·GAS·키·API·계좌·클라우드·비용·주문을 변경하지 않았다.
