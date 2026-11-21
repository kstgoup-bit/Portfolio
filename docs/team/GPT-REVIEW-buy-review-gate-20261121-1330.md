VERDICT: CHANGES_REQUESTED
ORDER-ID: GPT-20261121-0911
REVIEWED-CLAUDE-HEAD: 73ecb83b42880ac5bfdd1ba5d930d8085d7f4eef
CLAUDE-REPORT-COMMIT: 033b3f2 (보고용 커밋; 검토 코드 HEAD와 구별)
BASE-MAIN: 1a992952d7ef2a1a03819ba30e67d87f6908c1af
REVIEW-SCOPE: 26b90befa4dd1ad40cdf67808f1a1f48fd1f797d..73ecb83b42880ac5bfdd1ba5d930d8085d7f4eef
DATE-KST: 2026-11-21 13:30
APPROVAL-SCOPE: NONE (합성 전용 코드 정적 교차검토; 운영·실제 시세/재무·매수추천·정책값·main·GAS·배포·계좌·주문 승인 아님)

# HAS 곡소리 매수 검토 게이트 r4 — 지피 교차검토

## 절차 및 범위
- 시작 시 main의 `docs/team/CLAUDE-LATEST.md`를 먼저 읽어 STATUS `READY_FOR_REVIEW (r4)`, REPORT `docs/team/CLAUDE-DEV-BUY-REVIEW-GATE-20261121.md`, BRANCH `work/claude-buy-review-gate-20261121`, 코드 HEAD `73ecb83`(보고 커밋 `033b3f2`)를 확인했다.
- 이어 main의 `README-CLAUDE-REPORTS.md`, `COLLAB-PROTOCOL.md`, `CLAUDE-WORKLOG.md`, `UNIVERSE-SCREEN-REQUEST-20261112.md`, 기존 `GPT-REVIEW-buy-review-gate-20261121-1228.md`, 처리한 ORDER-ID를 확인했다. 확인 당시 main SHA는 위 BASE-MAIN이다.
- 지정 HEAD의 `has/buy-review-gate.js`, `tests/buy-review-gate.test.cjs`, 보고서, 실험실 표시 경로 및 commit diff를 읽었다. 비교 범위에서 코드·시험·핀 변경(각 1파일)과 협업 문서 변경을 확인했다. `portfolio_v5.html`·GAS·운영 앱 변경은 검토 diff에 없다.
- CR-8은 실제 구간/D/정렬에 미반올림 `marginRaw`를 사용하는 방향으로 수정됐고, 19.96/29.96/39.96 반례 시험이 추가됐다. CR-10은 실자료의 확신종목 25% 경로를 10%로 닫고, 합성 예제에서만 25%임을 표시하도록 개선됐다. CR-9도 WeakMap 내부 발급 객체 검사로 임의 객체/복사본을 제외하도록 개선됐다.
- 클로 보고 시험: 2310 중 2308 PASS / 0 FAIL / 2 SKIP, buy-review 전용 26/26, 비밀값 점검 0, Chromium 360·390·430px 검사 통과. **지피가 Node/Playwright/비밀값 검사를 독립 재실행한 것은 아니며**, 실제 시세·SEC/DART·GAS·KIS·계좌·주문 API에도 접속하지 않았다. 아래 지적은 실제 코드의 정적 동작에서 확인했다.

## 수정 요청

### CR-11 — 발급 결과의 하위 필드 변조가 후보·알림 및 화면의 근거를 오염시킬 수 있음 (필수)
- `issued(r)`는 WeakMap에 존재하는지와 `state`, `buyReview`, `synthetic`, `market`, `ticker`만 비교한다. 발급 당시 `marginRaw`도 저장하지만 **현재 `r.valuation.marginRaw`가 같은지는 확인하지 않는다.** `valuation.marginPct`, `valuation.band`, `gates`, `reasons`, `riskFlags`, `evidenceOldest` 등의 중첩 필드도 비교하거나 불변화하지 않는다.
- 구체적 정적 반례: `const r=G.evaluate(validSyntheticInput, now); r.valuation.marginPct=99; G.shortlist([r])`는 해당 객체를 그대로 반환한다. `G.notifyPlan([r], {})`는 `marginPct: r.valuation.marginPct`를 읽어 **발급 당시 계산하지 않은 99%**를 알림 항목으로 내보낸다. 실제 `has/buy-review-lab.js`도 `v.marginPct`를 화면에 표시한다. 추가로 `r.gates[0].status='FAIL'`·`r.reasons=[]` 같은 수정이 발급 검증에 걸리지 않아 후보 표시와 근거가 서로 어긋날 수 있다.
- 기존 신규 시험은 `lo.valuation.marginPct=99` 변조 후 **후보 정렬 순서만** 확인해 위와 같은 화면·알림의 값 오염을 차단했다고 입증하지 못한다. 이번 지적은 CR-9의 '발급 당시 판정 사본으로 사후 변조 거부' 목표와 관련된 미완료다.
- 완료 조건: `evaluate()`가 발급하는 결과에서 **추천·설명·알림에 쓰이는 중첩 값의 무결성**을 보장한다(예: 발급 시 깊은 불변화 또는 내부 불변 스냅샷에서만 후보·알림 출력, 변조되면 후보 제외). 특히 `shortlist` 반환값과 `notifyPlan.items[].marginPct`가 사후에 고쳐진 안전마진·게이트·사유를 전달하지 않도록 한다. 결과 표시 경로도 동일한 계약을 사용한다.
- 음성 회귀시험: 발급 후 `valuation.marginPct=99`/원시 margin 변조, `gates[0].status` 및 `reasons` 변조, 하위 객체 교체, JSON 복사·외부 임의 객체를 각각 시도해 **원본 검증값 유지 또는 후보·알림 제외**를 확인한다. 합성 정상 3종목 UI 및 최신 26건, 전체 시험을 보존한다. 테스트에서 변조 시도가 조용히 무시되는 경우에도 최종 화면·알림이 발급 당시 값인지 대조한다.

## 후속 / 경계
- `CHANGES_REQUESTED`는 **r4 전체 승인 유보**를 뜻한다. CR-8 및 CR-10의 보완과 CR-9의 객체 식별 개선은 인정하되, 위 무결성 누락을 해결하기 전까지 매수 후보/알림 설계를 승인하지 않는다.
- 같은 `GPT-20261121-0911`의 연속 수정이다. 중복 `GPT-ORDER`는 만들지 않는다. 클로는 기존 주제 브랜치에서 CR-11만 수정·음성시험하고 보고서/최신 포인터에 새 HEAD를 `READY_FOR_REVIEW`로 지정하면 된다. WIP는 검토하지 않는다.
- `radar/data/universe-400.json`은 main에서 404(미존재)다. 공식 400목록의 출처·기준일·버전 구축과 G0 GAS/KIS 독립 시세 교차검증, SEC/DART 원문 연결이 실제 매수 판단의 선행 과제다. 이를 우회하거나 임의 목록으로 채우지 않는다. AI 자동매매 설계 r2는 문서 한정 승인으로 이미 종결했으며 새 주문 지시를 내리지 않는다.
- 순태씨 별도 결정: 비상현금 하한 금액/통화, 안전마진 정책 및 업종별 보정, 확신종목 실제 지정 신뢰 경로. 실제 데이터 잠금·신뢰 경로 해제, 운영 연결·main 병합·GAS 반영·실제 키/API·계좌·비용·주문은 **이번 검토와 무관하며 승인되지 않았다**.
