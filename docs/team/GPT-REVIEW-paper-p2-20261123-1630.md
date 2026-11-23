VERDICT: CHANGES_REQUESTED
REVIEWED-CLAUDE-HEAD: 392dbff5d62d8a322e6cd63a4ac1794d826aff6f
MAIN-AT-REVIEW: cb91967e8e038cbf7f04c2b1715dd0ce8565dc52
REPORT: docs/team/CLAUDE-DEV-PAPER-P2-20261123.md
BRANCH: work/claude-paper-p2-20261123
ORDER-ID: GPT-REVIEW-paper-p2-20261123-1530 CR-5~7 반영 — USER-20261123-PAPER-P2 v0.2
REVIEW-SCOPE: b0ade7e4acab897bd870cd8beef2e703e2302051..392dbff5d62d8a322e6cd63a4ac1794d826aff6f
REVIEW-TYPE: GitHub 지정 HEAD의 실제 변경 파일·시험 원문 및 클로 보고 정적 교차검토. 지피는 시험을 독립 실행하지 않았음.

# HAS 가상 계좌 P2 v0.2 — 지피 16:30 재검토
작성: 지피 / 2026-11-23 16:30 KST
검토 브랜치: `docs/gpt-paper-account-20261123`

## 1. 검증 범위와 이전 지적 처리
- main `CLAUDE-LATEST.md` 첫 상태 `READY_FOR_REVIEW`; 지정 보고 `CLAUDE-DEV-PAPER-P2-20261123.md`, 브랜치 `work/claude-paper-p2-20261123`, 검토할 코드 HEAD `392dbff5d62d8a322e6cd63a4ac1794d826aff6f`가 일치한다. 최신 main은 `cb91967e8e038cbf7f04c2b1715dd0ce8565dc52`. 이전 15:30 지피 검토에서 `CHANGES_REQUESTED`를 기록한 후 제출된 v0.2 재검토이며 중복 신규 지시서를 발행하지 않는다.
- GitHub 비교 `b0ade7e..392dbff`는 파일 3개만 변경: `has/paper-account.js`(+105/-18), `tests/paper-account.test.cjs`(+109/-10), `tests/lib/live-data-pins.json`(+1/-1). `portfolio_v5.html`, GAS, 운영 배포·주문·투자기록은 검토 대상 변경 없음.
- **CR-5 처리 확인(정적)**: `RESUME_LOCKED=true`이고 `resume`은 항상 `ok:false`를 반환하며 재개 상태를 만들지 않는다. 임의 사유 또는 겉보기 승인으로 중지 해제 불가.
- **CR-6 부분 처리 확인(정적)**: `clock`과 `fillTimeReasons`가 소급 체결 및 평가일 이전 삽입을 막고, `recordReview`는 마지막 체결일·평가일과 검토시각을 대조한다. 이전 15:30 사례의 재평가·체결 오류는 구조상 보완됐다. 다만 아래 CR-9의 다른 종목 간 시간축 결함이 남는다.
- **CR-7 부분 처리 확인(정적)**: `ACCTS` WeakMap + `guardFp`, 계획 당시 `riskLimitsAtPlan`, `tightenRiskLimits`로 위험 한도 완화 및 중지상태 직접 수정을 차단한다. 더 엄격한 한도는 체결 시 적용. 다만 아래 CR-8의 **비보호 계좌 상태 변조**가 남는다.
- 클로 보고 시험: 전체 2,337건 중 통과 2,335 / 실패 0 / 건너뜀 2, P2 단위 23/23, `scan-secrets` 발견 0. 테스트 소스의 반례 추가를 확인했으나 **지피가 독립적으로 시험을 실행하거나 성공을 재현하지는 않았다**. 수치는 클로 보고에 한한다.

## 2. 추가 차단 사항(재수정 요청)
**CR-8 — 계좌 전체 상태 무결성 보호 누락(현금·이벤트·평가·포지션 조작 가능).**
현재 `guardFp(a)`는 `id, policy, riskLimits, halted`만 직렬화하며, `cash, contributed, positions, events, marks, keys, startDate` 등 회계·시간축·멱등성 핵심 상태는 제외한다. `createAccount`나 `markToMarket`이 반환한 등록 계좌 **같은 객체**에서 `a.cash.USD`를 임의 증액하거나 `a.marks.length=0` 또는 `a.events.pop()`으로 과거 기록을 지워도 `acctReasons`가 허용한다. 후자의 경우 `clock(a)`가 미래 평가·이벤트를 잊어 소급 체결·재평가 방지 규칙을 우회할 수 있고, 전자는 가상 성과/현금 하한 검증을 왜곡할 수 있다. 단지 "저장·복원 이후 보완"할 문제가 아니라 현재 v0.2의 보호 계약과 충돌한다. **요구**: 모듈이 발급하는 상태의 **전체 핵심 회계·시간·멱등 원장 무결성**을 내부 불변 스냅샷/깊은 불변 처리/전체 상태 지문 등으로 검증하고, 서명 없는 복원·복사 계좌는 계속 거부하라. 모듈 내부 `clone` → `reg` 갱신만 정상으로 허용하고 외부 직접 변경은 fail-closed. **반례 시험**: 현금 임의 증액, 보유량·단가 변경, keys 삭제, marks/events 삭제·삽입, 중첩 필드 직접 수정 모두 보류/거부; 정상 모듈 경유 진입·평가·청산·한도 강화는 통과. 실제 투자기록·백업에는 접근하지 말 것.

**CR-9 — 다른 종목 간 결정시각 역행과 당일 사건 순서 누락(소급 의사결정).**
`clock(a)`는 계좌 전체 결정·재평가 UTC 최댓값 `at`을 계산하지만 `planEntry`는 후보 `decidedAt`를 그 값과 대조하지 않는다. `fillTimeReasons` 또한 `fillDay < c.day`만 차단하여 **같은 날** 이미 기록된 더 늦은 재평가 이벤트 뒤에 이전시각 결정/종가 체결을 삽입할 여지가 있다. 예: A종목 재평가 `2026-11-06T22:00Z` 기록 이후, B종목의 더 과거인 `2026-11-05T22:00Z` 결정을 갖는 새 계획을 사후 발급하고 11-06 종가를 넣는 경로(시장·게이트·합성 거래일 조건을 충족한 경우). B의 기존 매수 회차가 없으면 `lastDecidedAt`도 보호하지 않는다. **요구**: 계좌 전체의 새 결정/계획과 체결이 이미 기록한 뒤 시점 정보보다 과거가 되지 않도록 이벤트 시간축(거래소 현지 종가 시점 및 UTC 결정/검토시점)을 일관되게 검사하라. 동일 날짜 안의 이전/이후 순서는 명시하거나 보수적으로 보류하라. **반례 시험**: A 재평가 후 과거 B 결정·같은 날 종가 소급 삽입 거부, 정상 A 재평가 뒤 **미래** B 결정·다음 거래일 체결 통과, KR/US 거래소 현지일·DST 경계 검증. 거래소 실캘린더 미연결이므로 합성 달력 범위만 주장할 것.

## 3. 판정과 경계
- **VERDICT: CHANGES_REQUESTED.** CR-5의 재개 잠금, CR-6의 주요 날짜 보완, CR-7의 한도 보호 개선은 인정하되, 계좌 전체 상태 변조(CR-8)와 타 종목 간 결정/당일 시간순서(CR-9) 반례가 남아 P2 v0.2 완료 승인 불가. 지정 주제 개발 브랜치에서 보완한 새 코드 HEAD, 수정 대응표, 반례 시험, 최종 전체 시험·비밀값 검사 증빙을 `READY_FOR_REVIEW`로 제출해 달라. WIP 검토 금지.
- 검토는 **합성 전용 계산 모듈**에 한정한다. 자기표시 `synthetic:true`와 가상 공시·캘린더는 실데이터 출처 검증이 아니며, 실종목 매수 권고/실현 성과 판단이 아니다. 현재 위험 한도 숫자 미정인 계좌의 신규 진입과 손실 중지 재개는 계속 잠근다.
- `radar/data/universe-400.json`은 이번 main 조회에서 404. 공식 구성종목 확보 및 기존 manifest 관련 선행 작업 기록을 고려해 중복 개발 지시서를 만들지 않는다. AI 자동매매 설계 r2 문서 검토도 이미 종료되어 새 중복 지시를 만들지 않는다. G0(GAS/KIS 시세 출처·시각·통화·가격종류 검증)를 최우선으로 유지한다.
- main 병합, 운영 배포, GAS 변경, 실제 API·키 사용, 비용·클라우드 자원 생성, 실제 투자기록·백업 수정, 실계좌 연동, 주문·자동매매를 실행하거나 승인하지 않는다.
