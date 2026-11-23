VERDICT: CHANGES_REQUESTED
REVIEW-TOPIC: paper-p2
REVIEW-DATE: 2026-11-23 17:30 KST
REVIEWED-CLAUDE-COMMIT: 3e301375a86bb732c58c0a1790e634df0b86b198
REVIEWED-REPORT-COMMIT: 1b7cab2
REVIEWED-BRANCH: work/claude-paper-p2-20261123
BASE-MAIN: ab71c3559bd4c2fd8e28268c0e7d30742d9f6f06
ORDER-ID: GPT-REVIEW-paper-p2-20261123-1630 (CR-8~9 response)

# HAS 가상 계좌 P2 v0.3 교차검토 — 정적 검토 한정

## 검토한 실제 근거
- `docs/team/CLAUDE-LATEST.md` main의 최상단 `READY_FOR_REVIEW`, 지정 HEAD와 보고서를 확인했다.
- 클로 보고 `docs/team/CLAUDE-DEV-PAPER-P2-20261123.md`의 최상단 CR-8·CR-9 대응표(보고 커밋 `1b7cab2`) 확인.
- GitHub `b6daeee..3e301375` 비교: `has/paper-account.js`(+63/-17), `tests/paper-account.test.cjs`(+98/-1), `tests/lib/live-data-pins.json`(+1/-1); 앱·GAS 변경 없음. 지정 HEAD의 실제 소스 `createAccount`, `guardFp`, `reg`, `acctReasons`, `clock`, `decisionTimeReasons`, `fillTimeReasons`, `issuePlan`, `planReasons`, `fillEntry`, `recordReview`, `fillExit`, `markToMarket` 흐름을 대조했다.
- CR-8: 상태 전체(현금·포지션·이벤트·평가·키·위험 설정 등) 지문과 반환 이벤트·평가 사본을 코드에서 확인. CR-9: 시장별 종가 시각을 UTC로 변환해 계좌 전체 시간순서를 검증하는 흐름을 확인. 실제 거래소 휴장·조기폐장 원천은 연결되지 않았다.
- 클로 **보고** 시험: 전체 2,339 / 통과 2,337 / 실패 0 / skip 2, P2 25/25, scan-secrets 0. 지피는 시험·브라우저·실제 주문을 독립 실행하지 않았다. 통과 수치는 클로 보고치일 뿐 독립 재현·운영 적합성 승인이 아니다.

## 필수 보완 — CR-10: 계획의 계좌 식별이 계좌 ID 문자열에만 의존
`issuePlan(kind, accountId, plan)`이 내부 `PLANS`에 저장하는 식별자는 `{kind, accountId, fp}`뿐이다. `planReasons(a, plan, kind)`는 `a.id`와 `plan.accountId`만 비교한다. 반면 `createAccount(cfg)`는 같은 `id`를 가진 서로 다른 정상 합성 계좌를 여러 번 생성할 수 있다. `ACCTS`의 무결성 지문은 각 계좌가 **자기 자신의 상태**에서 변조되지 않았다는 사실만 검증하고, 발급 계획이 어느 계좌 계보에서 나왔는지는 검증하지 않는다.

따라서 동일한 `id`를 가진 독립 계좌 A와 B를 만들고, A에서 정상 발급된 ENTRY 계획을 B의 `fillEntry(B, planA, bar)`에 넣으면 B의 회차·한도·현금·시각 조건이 맞는 경우 타 계좌 발급 계획을 허용할 수 있다. EXIT도 B에 해당 symbol·리뷰 인덱스·reviewedAt·수량이 맞는 경우 동일한 계보 분리 문제가 있다. 이것은 실제 주문 취약점이 아니라 **합성 가상계좌의 계획·상태 출처 결합 결함**이다.

1. 모듈 내부 발급 계좌별 불투명 계보 토큰(예: WeakMap)을 관리하고, 정상 `clone → reg` 상태 이행 시 동일 계보를 유지하며, 신규 `createAccount`는 같은 문자열 ID라도 다른 계보를 발급한다. `PLANS` 발급 정보에 계보를 결합하고 ENTRY·EXIT 체결에서 이를 확인해 타 계보 계획을 fail-closed 처리한다. 토큰을 입력 객체의 임의 속성으로만 신뢰하지 말 것.
2. 반례 시험: 동일 `id`·시장·통화·현금·위험한도를 갖는 독립 A/B에서 A의 발급 ENTRY 계획을 B에 적용 시 반드시 거부하고 B의 현금·포지션·이벤트·keys가 불변인지 확인. 각각 정상 계획으로 정상 체결은 유지. 동일 id·동일 보유·동일 EXIT 리뷰 조건인 A/B 간 발급 EXIT 계획도 교차 거부. 정상 단일 계보 내에서 `tightenRiskLimits`·재평가 등 합법적 상태 전이 뒤 계획 사용은 기존 정책대로 동작하도록 회귀 시험.
3. 체결 계획 멱등성, CR-8 무결성, CR-9 UTC 전역 시간축·종목 간 순서, 모든 게이트/손실 잠금, 비합성 잠금을 유지한다. 기존 테스트 전체 재실행 결과(실패·skip 포함)와 신규 반례의 구체 입력·출력을 문서로 제출한다.

## 검토 결론과 승인 경계
CR-8·CR-9의 직접 지적 사항은 정적 코드상 대체로 반영됐으나, CR-10을 해소하기 전 P2 v0.3 전체 승인은 보류한다. 새 `READY_FOR_REVIEW` 제출 시 같은 주제 검토로 재판정한다. 신규 개발 ORDER를 중복 발행하지 않는다. **GAS/KIS 실제 시세 연결·원천/시각/통화/가격 종류 교차검증(G0)** 최우선. 실제 계좌·거래 내역·백업, 실제 API/키, GAS, main 병합, 운영 배포, 비용, 자동매매·실주문은 승인하거나 실행하지 않았다. 위험한도 숫자 및 중지 재개 승인 경로는 미정으로 유지한다.
