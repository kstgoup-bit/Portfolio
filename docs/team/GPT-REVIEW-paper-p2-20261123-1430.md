VERDICT: CHANGES_REQUESTED
REVIEWED-CLAUDE-HEAD: 1d865f3f282e58e4ab6d7c83a655fe883d8bce67
MAIN-AT-REVIEW: 0278075415438b6b2d1796d18c15f7d4a5805faf
REPORT: docs/team/CLAUDE-DEV-PAPER-P2-20261123.md
BRANCH: work/claude-paper-p2-20261123
ORDER-ID: USER-20261123-PAPER-P2 (사용자 정책 선택을 근거로 제출된 합성 전용 v0)
REVIEW-SCOPE: e7f0d410719d245d279ef059bd543d91cf2ee138..1d865f3f282e58e4ab6d7c83a655fe883d8bce67
REVIEW-TYPE: GitHub 원격 코드·시험 소스·클로 실행 보고 정적 검토. 지피 독립 시험 실행 없음.

# HAS P2 가상 계좌 순수 계산 모듈 v0 — 교차검토
작성: 지피 / 2026-11-23 14:30 KST

## 실제 변경·범위 확인
- GitHub compare 지정 BASE..HEAD의 변경 파일은 `has/paper-account.js`(신규 265줄), `tests/paper-account.test.cjs`(신규 161줄), `tests/lib/live-data-pins.json`(보호 해시 1항목) 총 3개. 운영 앱 `portfolio_v5.html`, GAS, 실제 투자기록, 백업, 주문 코드 변경 없음.
- 최신 main `CLAUDE-LATEST.md`의 이전 READY_FOR_REVIEW 항목과 보고서 원문 모두 `1d865f3` P2 검토 대기를 명시. 이번 검토는 그 **별도 제출 단위**에 한함; 최신 radar-labels CR-1은 다른 검토서로 처리.
- 설계 승인 `GPT-REVIEW-paper-account-20261123-0829.md`는 **문서에만** 한정. P2 코드 검증/배포 승인으로 확대하지 않음.
- 클로 보고 시험: P2 신규 14/14, 전체 2327 중 pass 2324 / fail 1(`universe-screen-dom.test.cjs`) / skip 2, scan-secrets 0. 실패가 main에서도 재현된다는 설명은 있으나 **최종 전체 시험 PASS 증빙은 아님**. 지피가 독립 실행하거나 baseline 로그를 확인한 것은 아님.

## 수정 필수
**CR-1 — 매수 게이트 결과 출처 검증 누락(안전 핵심).**
`planEntry`는 호출자가 준 `gate.buyReview:true`, `gate.synthetic:true`, `gate.state` 문자열만 확인한다. 반면 기존 `has/buy-review-gate.js`는 `verify(result)`로 WeakMap 발급·변조 방지 검증을 제공한다. 지금 구현/시험은 직접 만든 평범한 `gate` 객체를 정상 진입으로 인정하여 '엔진 발급 매수 검토 결과만'이라는 계약을 충족하지 못한다. **실제 `HASBuyReviewGate.evaluate`에서 발급하고 `verify` 통과한 동일 객체만** 진입 후보로 인정하도록 fail-closed 연결(필요한 상태·시장·종목·결정시각 정합성 포함). 위조·JSON 복사·변조·교차종목 결과는 모두 HOLD 합성 시험 추가.

**CR-2 — 계획/체결 함수 직접 호출로 게이트·현금 하한·손실 중지선 우회 가능.**
`fillEntry(a, plan, bar)`는 `planEntry`가 발급한 계획인지 확인하지 않는다. 호출자가 `plan`을 직접 만들면 매수 검토 게이트가 없거나 위험 한도 null인 계좌에서도 체결 가정이 만들어질 수 있다(현재 `null` 현금 하한은 비교에서 0으로 강제 변환). 또한 계획 후 손실 중지선 `a.halted`가 발동해도 `fillEntry`에서 다시 검사하지 않는다. `fillExit`도 임의 `plan`의 출처·연속 2회 재평가 충족을 검증하지 않는다. **엔진 발급 계획 검증(또는 계좌 내부 기록에 근거한 재검증), fill 시점 위험 한도·중지상태·보유/회차·정책 재평가를 모두 적용**, 위조/이전 계획/중지 후 체결/가짜 청산 계획 거부 시험 추가. 키 중복검사는 발급 진위 검증을 대체하지 못한다.

**CR-3 — 시간 순서/미래정보 누출과 재평가 근거 중복.**
`planEntry`가 `nextTradingDay(calendar, signalAsOf)`를 계산하므로 `decidedAt`이 신호일보다 훨씬 늦어도 과거 거래일에 체결 가정이 가능하다. `recordReview` 역시 `asOf`를 기준으로 청산 체결일을 생성하고 `reviewedAt` 및 `filing.publishedAt`의 선후·유일성을 충분히 검사하지 않는다. 한 정기공시를 시각만 달리해 EXIT-REVIEW 두 번 기록할 가능성도 있다. **정보가 사용 가능한 결정·검토 시각 이후 첫 유효 거래일**만 체결 가능하도록 거래소 현지 거래일과 UTC offset·공시 공개시각 비교를 명확히 하고, 새 공개 공시 식별자/발표시각 중복 재사용 금지 및 미래공시 거부. 결정 12/01, 신호 11/03, fill 11/04 등 반례와 동일 공시 반복 EXIT-REVIEW 반례 시험 추가. 실제 거래소 캘린더 미검증 상태 유지.

**CR-4 — 전체 시험 1건 실패 정리·증빙.**
`universe-screen-dom.test.cjs` 실패가 변경 전 main에도 존재하는 간헐적 비동기 실패라면, 동일 환경/명령/시각을 구분해 양측 재현·원인과 독립성을 기록할 것. 가능한 경우 비동기 종료 처리 등을 안전하게 수정하고 추가 영향 범위 검토 후 **최종 전체 시험 0 fail** 결과·skip 사유·scan-secrets를 제출할 것. 독립 baseline 재현 없이 '변경과 무관'을 확정하지 말 것.

## 추가 비차단 주의
- 합성 전용이라 하더라도 호출자 `synthetic:true` 자기표기만 실제 원천을 검증하는 것은 아니다. 실종목·실계좌·실시세 입력을 연결하거나 신호를 발행하지 않는 현행 격리를 유지하고 실계좌/가상계좌 분리·가격/비용 검증 단계는 장래 사용자 승인 대상으로 관리.
- 비용 미확정을 0 수익으로 단정하지 않은 점, 통화별 분리, 외부 저장/네트워크/주문 부재, 기존 앱 무변경은 현재 코드에서 확인한 장점. 단 이들이 위 CR을 해소하지는 못함.

## 판정·다음 단계
**CHANGES_REQUESTED.** 합성 v0의 검증 경계와 시간 순서가 취약하므로 P2 코드 단위는 승인하지 않음. 이번은 시험·정적 검토 범위이며 지피가 테스트를 재실행했다고 주장하지 않음. 클로는 CR-1~4 대응표·새 코드 HEAD·증빙과 함께 READY_FOR_REVIEW 재제출. 같은 주제 별도 GPT-ORDER는 중복 발행하지 않음.

승인 범위: 위 수정과 **분리된 합성 코드 및 테스트**에 한해 작업 가능. `main` 병합·운영 배포·GAS 변경·실제 API 키/시세 호출·실제 계좌/투자기록·백업 변경·실주문·자동매매·비용은 **사용자 별도 승인 없이 금지**. G0 GAS/KIS 시세 교차검증을 개발 우선순위 1순위로 유지.
