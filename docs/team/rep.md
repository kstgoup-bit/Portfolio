STATUS: READY_FOR_REVIEW
ORDER-ID: USER-20261123-PAPER-P2 — 순태씨 대화창 결정 "8번 승인, 나머지 추천대로" (2026-11-23 13시대 KST)
BASE: e7f0d410719d245d279ef059bd543d91cf2ee138 (main)
HEAD: 1d865f3f282e58e4ab6d7c83a655fe883d8bce67
BRANCH: work/claude-paper-p2-20261123
REVIEW-SCOPE: has/paper-account.js(신규), tests/paper-account.test.cjs(신규), tests/lib/live-data-pins.json(addedRuntimeFiles 1줄). portfolio_v5.html·GAS·화면 변경 0.
작성: 클로 / 2026-11-23 13시대 KST

> 연구용 가상 계좌 계산 모듈이다. 투자 권유·주문·자동매매가 아니다. 합성 자료(SYN- 종목)에서만 동작하며 실종목 기록은 G0 시세 교차검증 + 순태씨 별도 승인 이후.

## 순태씨 결정 기록 (설계 문서 §5 — 클로 추천안 채택)
| # | 결정 | 모듈 반영 |
|---|---|---|
| 1 | 시작 현금은 실제 투자금 규모 수준, 퇴직 브리지 제외 | 금액은 호출자(합성) 설정. `retirementBridge` 입력은 무시하고 기록 |
| 2 | 확신 종목도 당분간 10% | `capPct 10`, `CONVICTION_LOCKED` — 확신 표시는 무시 사유로 기록. 현금 하한·일/월 손실 중지선 **숫자는 미정** → 미설정이면 진입 보류(fail-closed) |
| 3 | 1/3×최대 3회, 추가 매수 = 직전 결정 이후 공개된 새 정기 공시 | 구현. 뉴스·가격·미래 공시는 새 근거 아님 |
| 4 | 다음 거래일 종가 체결, 비용 '미확정' | 체결일 고정(당일·다른 날·시가·통화 불일치 거부), `costStatus:'unconfirmed'`, 0 대입 없음 |
| 5 | EXIT-REVIEW 2회 연속 → 가상 청산 | 전량 청산(부분 매도 비율 미정 → v0 없음). HOLD는 연속 초기화, DATA-UNAVAILABLE은 청산 근거 아님(연속 불변) |
| 6 | KIS 모의투자 기준 보류 | `kisPaperCriteria:null` |
| 7 | 저장 위치는 실제 기록과 분리, 위치 추후 | `storage:null` — 모듈은 이벤트만 돌려주고 저장하지 않음 |
| 8 | 합성 전용 순수 계산 모듈 착수 승인 | 이 단위 |

## 변경 파일
- `has/paper-account.js` (신규, paperEvent.v0): createAccount / planEntry / fillEntry / recordReview / fillExit / markToMarket / resume, nextTradingDay(호출자 합성 캘린더).
  - 진입 전제 = 매수 검토 게이트 발급 상태(조건부·높은 확신) + `synthetic:true`. 가격 하락만으로는 진입 불가.
  - 멱등 키 = 시장|계좌|종목|결정버전|종류|회차. 같은 키 재요청은 변화 없음.
  - 평가는 KRW/USD 분리(환율 원천 미검증이라 합산 없음), 가격 누락은 실패로 드러냄, 라벨 "실현 가능 성과 아님·비용 미확정".
  - 손실 중지선: 직전 평가 대비(일)·같은 달 첫 평가 대비(월). 발동 시 해당 통화 신규 가상 매수 중지, `resume`은 사유 필수·이벤트 기록.
  - 입력 불변(새 상태 반환), 네트워크·저장소·주문 코드 없음.
- `tests/paper-account.test.cjs` 14개.
- `tests/lib/live-data-pins.json` addedRuntimeFiles에 `has/paper-account.js` sha256 등록(보호 경로 신규 파일 검토 규칙).

## 시험
- 신규 14/14 통과.
- 전체 `node --require ./tests/lib/no-network.cjs --test tests/*.test.cjs`: 2327 중 2324 통과 / 1 실패 / 2 skip. 실패 = `universe-screen-dom.test.cjs`(시험 종료 후 비동기 getElementById 오류) — **이 변경 없이 main에서도 같은 실패 재현**(기존 11-16 기록과 동일 유형, 타이밍성). 이번 변경과 무관.
- `node tools/scan-secrets.cjs`: findings 0.
- 화면 변경 없음 → Playwright 불필요.

## 미완료·미검증
- 실제 거래일 캘린더(KR/US 휴장) 미연결 — 호출자 합성 캘린더만.
- 그림자 지수 계좌(R4)·묶음 N(R5)·거래일 ±5 평가일(R6)은 지피 0829 후속 보완 2·4에 따라 v0 미포함(P1 소급 금지).
- 해시 체인·저장·복구 규격(R7) 미정.
- 비용 요율(수수료·거래세·배당세·환전) 미검증 → 표시만.

## 순태씨 결정 필요(나중에)
- 현금 하한 %, 일/월 손실 중지선 % — 정해지기 전엔 실제 가상 계좌가 진입하지 않음(합성 시험에서만 임시 값 사용).
- 부분 매도 비율, 저장 위치.
