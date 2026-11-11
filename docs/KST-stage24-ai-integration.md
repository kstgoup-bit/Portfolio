# HAS 24단계 — AI 투자참모 읽기 전용 통합 구조 (제3과제)

## 1. 구조
```
포폴앱 저장소(v5_gen/dom/ov/pen·v5_fx·v5_cma_amount) ──getter(읽기만)──▶ has/portfolio-reader.js ──최소 정보──▶ has/advisor-bridge.js
                                                                                                         │ (외부 시세·재무는 호출자가 주입. 없으면 판단 보류)
                                              quote-model → watch-engine → advisor-core → advice-guard ──┘
                                                                                                         ▼
                                                          조언·신호 결과(메모리) → 시험 화면 has/advisor-app.html (참모·알림)
```
- **쓰기 경로 없음**: 연결 모듈은 저장소 객체가 아니라 `getter(key)` 함수만 받습니다. 쓰기·삭제는 구조적으로 불가능합니다. 결과에 `writes:'none'`, `journalKey:null`을 명시합니다.
- **최소 정보**: AI(규칙 엔진 또는 앞으로 붙일 외부 AI)에는 종목코드·시장·비중·현금 비중만 전달합니다. 종목 이름·수량·평단·계좌 상세·메모·가계부·부채는 넘기지 않습니다(`minimalForAdvisor`).
- **오류 격리**: 어떤 오류도 던지지 않고 `status: ok | partial | insufficient | error`로 돌려줍니다. 종목 하나의 분석이 실패해도 그 종목만 '판단 보류'로 표시되고 나머지와 기존 앱은 정상입니다.
- **원장과 판단기록 분리**: 판단기록(`advice-journal.js`)은 별도 모듈·별도 키 설계(`has_advice_journal_v1`)이며 이번 단계에서도 **저장하지 않았습니다**. 백업 허용 목록에도 없습니다.
- **합성/실제 혼동 방지**: 결과 `basis`가 `synthetic | real | unspecified`로 따라다니고(기본 unspecified), 화면은 합성 배너를 항상 띄웁니다. 활성 감시 수는 합성을 제외하고 셉니다(실제 0).
- **앱의 현재가는 시세가 아님**: 앱에 입력·저장된 현재가는 비중 계산에만 쓰고(`priceBasis:'app-entered-unverified'`), 신호·조언의 시세는 별도로 주입된 검증 시세만 인정합니다.

## 2. 역할 구분
| 기능 | 역할 | 한계 |
|---|---|---|
| 기존 Gemini 자문 | 사용자가 요청할 때 서술형 공격형/방어형 의견 | 근거 수치를 이 구조가 검증하지 않음. 이 단계에서 변경하지 않음 |
| 신규 규칙 점검(23~24단계) | 확인된 시세·재무·비중만으로 신호와 4가지 의견 | AI가 아님. 공격형/방어형은 같은 엔진의 두 역할이며 "독립 모델 검증"이라고 쓰지 않음 |
| `advice-guard`(24단계) | 어떤 출처의 조언이든 표시 전에 근거 없는 수치·목표가·확정 표현을 거절 | 나중에 외부 AI 출력도 이 검문을 통과해야 표시됨 |

## 3. 이번 단계에서 새로 막은 신뢰성 구멍
- 근거(facts·조건·보유 정보)에 없는 숫자, "목표가·기대수익·곧 오를 것" 표현 거절
- 공급자 간 가격 차이 1% 초과·기준일 불일치 → 충돌 표시·판단 보류 (`quote-crosscheck.js`)
- 환율 급변(3% 이상, 출처·두 시점 필요) 신호 추가, 시장 위험 알림과 키를 분리
- 발견·수정한 결함 3건: ① 미보유 관심종목의 비중을 '미상'으로 두어 매수 후보가 영영 나오지 않던 문제 → 보유자료가 완전할 때 0%로 처리 ② 가드가 "추정 가격 포함" 같은 자료 한계 고지를 오탐 ③ 조언에 "추가 확인이 필요한 사항"이 비어 있던 경우 기본 확인 항목 추가

## 4. 변경 파일
신규: `has/portfolio-reader.js`, `has/advisor-bridge.js`, `has/advice-guard.js`, `has/quote-crosscheck.js`, `has/relay-policy.js`, `has/advisor-app.html`, `has/advisor-app.js`
수정: `has/watch-engine.js`(환율 신호), `has/alerts-core.js`(알림 키 scope), `has/advisor-core.js`(기본 확인 항목)
**`portfolio_v5.html`·backup/*·기존 성공 브랜치·main: 변경 없음.** (포폴앱 화면에는 아직 연결하지 않았습니다 — 연결은 별도 승인 후.)
