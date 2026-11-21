STATUS: READY_FOR_REVIEW
ORDER-ID: GPT-20261121-0911
BASE: 83f2a25dd12cbe8fdf06b1dcfd23bb95522a1c83
HEAD: a2a4c791902a07d02e4da73993f10ed67f49b22a
BRANCH: work/claude-buy-review-gate-20261121
REVIEW-SCOPE: 83f2a25..a2a4c79 — 새 판정 엔진 has/buy-review-gate.js, 합성 자료 has/buy-review-fixtures.js, 독립 실험실 has/buy-review-lab.{html,css,js}, 시험 tests/buy-review-gate.test.cjs·tests/buy-review-mobile.cjs, 보호 목록 tests/lib/live-data-pins.json addedRuntimeFiles 5건 등록. 운영 앱 portfolio_v5.html 변경 없음.
UPDATED: 2026-11-21 10:4x KST (정각 실행)

# 곡소리 레이더 매수 검토 게이트 1단계 — 설계·합성 구현·시험

## 실제 데이터 접근 여부
- 없음. 실제 시세·재무·투자기록·백업·GAS·API 키 접근 0. 모든 판정은 합성 자료(SYN- 종목, `SYNTHETIC: example.invalid` 출처)로만 시험.
- **선행 의존성(미완료)**: G0 실제 시세 교차검증, SEC/DART 재무 연결(정상화 FCF·순부채·희석), 400종목 중 미국 200 실제 GAS 연결. 이 때문에 **운영 앱 곡소리 목록은 계속 '판단 보류'** 이며, 이번 단계는 운영 앱에 연결하지 않았다(가짜 200종목 감시·검증 완료 표시 없음).

## 설계 (계약 buyReviewInput.v1, 엔진은 호출자가 준 증거만 판정)
1. 가격 선별 `screenPrice`: 정규장 확정 종가(`priceType: regular-close`), 거래소, 시장 통화(KR=KRW/US=USD), 분할·배당 조정 표시, 기준일 4일 이내·미래 금지, 52주 고점과 같은 기준일, 교차검증 `match`·오차 ≤1%·출처 2개 이상, 같은 종료일의 벤치마크 상대수익률. 하나라도 어긋나면 `fail-closed` → '판단 보류'. 구간 -20/-30/-35%, -20% 미만은 '관찰'.
2. 5게이트 A~E: PASS는 출처·기준일(120일 이내)·`independent-verified` 증거가 있을 때만 인정, 아니면 UNKNOWN. 엔진 강제 규칙 — D는 엔진이 계산한 안전마진으로만 판정(호출자 PASS 무시 가능), C는 일회성 손익 표시 시 정상화 근거 필요, E는 반론 기록이 없으면 PASS 불가.
3. 본질가치: 보수/기준/낙관 3시나리오 모두 방법·할인율·성장률·정상화 FCF·주식보상·희석·순부채·주식수 공개, 보수 ≤ 기준 ≤ 낙관, 가격과 같은 통화, 출처·90일 이내·출처 대조 확인. 없으면 안전마진 미산정. `fromDrawdown` 등 가격 하락률 대체는 거부. 안전마진 = 1 − 가격/보수 가치.
4. 안전마진 구간(MOS_BANDS, `unverified-initial-policy`): <10 없음, 10~20 관찰, 20~30 조건부, 30~40 높은 우선순위, ≥40 가치함정 재검증(별도 증거 PASS 전 D=UNKNOWN). 업종별 조정·백테스트 미실시.
5. 최종 상태 5종: 관찰 / 판단 보류 / 위험 경고 / 조건부 분할매수 검토 / 높은 확신의 분할매수 검토. 매수 검토 2종은 5게이트 PASS + 가격 증거 + 4단계 조사(공시·뉴스·컨센서스·커뮤니티, 30일 이내) + 반론 + 무효화 조건 모두 있을 때만. '높은 확신'에는 "수익 보장이 아닙니다" 문구. 회계·유동성·구조 위험 표시 또는 B FAIL → 위험 경고(가격보다 우선).
6. 실행 가능성(판단과 별도): 현금(미확인이면 blocked, "수량·주문 제안 없음"), 비상현금 하한(미확정이면 unknown — 순태씨 결정 필요), 보유비중 상한(확신 25%/그 외 10%, capital-allocation.js 상수와 시험으로 일치 확인), 업종 중복(warn). `quantity`·`order`는 항상 null.
7. `shortlist`: 매수 검토 상태만, 상태 → 안전마진 순, 최대 5개.
8. `notifyPlan`: 처음 매수 검토가 되었거나 상태가 올라간 종목만 알림. 같은 종목·같은 상태 재알림 없음, 후보 없음이면 알림 없음, 매수 검토에서 내려간 뒤 다시 충족하면 1회 알림. 원장(ledger)은 호출자가 보관(엔진은 저장하지 않음).

## UI (독립 실험실 has/buy-review-lab.html — 운영 앱 미연결)
- 상단 '실제 데이터 미연결' 안내, '오늘의 매수 검토 후보(최대 5개)', 곡소리 목록에 AI 의견·이유·증거 신선도, 상세(가격·출처, 본질가치 범위·안전마진, 5게이트, 재무 위험, 반론, 무효화 조건, 현금/비중 상태).
- CSP `connect-src 'none'`, textContent만 사용, 저장·전송 없음.

## 변경 파일
- 추가: has/buy-review-gate.js, has/buy-review-fixtures.js, has/buy-review-lab.html, has/buy-review-lab.css, has/buy-review-lab.js, tests/buy-review-gate.test.cjs, tests/buy-review-mobile.cjs
- 수정: tests/lib/live-data-pins.json (addedRuntimeFiles에 위 has/ 5개 sha256 등록 — 보호 경로 신규 파일 검토 등록)
- 변경 없음: portfolio_v5.html, service-worker.js, gas/, 기존 엔진들

## 시험 결과
- 신규 tests/buy-review-gate.test.cjs 15개 통과: 정상, 안전마진 구간·가치함정, 하락률≠안전마진, 가격 누락/충돌/오래됨/장중/통화/조정/벤치마크/기준일/미래 11종 fail-closed, 가격 구간, 게이트 UNKNOWN·미검증·오래된 증거, 부채·회계·구조 위험, 일회성 이익, 시나리오 누락·순서·통화, 4단계 조사·반론·무효화, 현금 부족/미확인·상한 초과(확신 25% 포함)·업종 집중·비상현금 미확정, 후보 5개 제한·정렬, 중복 알림, 입력 불변·계약 오류, 정적 안전(네트워크·저장소·HTML 주입 없음, 운영 앱 미연결).
- 전체: `node --require ./tests/lib/no-network.cjs --test tests/*.test.cjs` (jsdom NODE_PATH) → 2299 중 **2297 통과 / 0 실패 / 2 skip**(기존 skip). 첫 실행에서 보호 목록 미등록으로 2건 실패(daily-repair-protection, kis-auth-independent: Unreviewed protected source addition) → pins 등록 후 0 실패.
- `node tools/scan-secrets.cjs` → findings 0.
- 모바일: `node tests/buy-review-mobile.cjs <폴더>` Playwright Chromium 360/390/430px — 가로 스크롤 없음(scrollWidth = viewport), 최소 글자 12px, 본문 글자색 #333 이상 진하게, 외부 요청 0, 페이지 오류 0, 저장소 쓰기 0, 오늘 후보 3개 모두 매수 검토 상태. 스크린샷은 저장소에 커밋하지 않음(작업 공간에만 생성).

## 미완료·미검증
- 실제 데이터 연결(G0·SEC/DART·미국 200 GAS) 전이라 운영 앱 연결·실제 종목 판정 없음.
- 본질가치는 호출자가 준 시나리오 값을 검사·공개만 하며 DCF를 직접 계산하지 않음(다음 단계 후보).
- 안전마진 구간·증거 허용 기간(가격 4일, 게이트 증거 120일, 본질가치 90일, 조사 30일)은 초기 가정 — 업종·불확실성별 조정과 백테스트 미실시.
- 4단계 조사(뉴스·커뮤니티 등) 수집 자체는 구현하지 않음 — 결과 기록 형식만 검사.
- 알림 원장의 보관 위치(메모리/백업 포함 여부)는 미정 — 운영 연결 단계에서 결정.

## 순태씨 결정 필요
- 비상현금 하한 금액(미확정 → 현재 '미확인'으로만 표시).
- 안전마진 구간을 초기 정책으로 쓸지, 업종별 조정 기준.
- (운영 연결은 선행 데이터 연결 후 별도 승인.)
