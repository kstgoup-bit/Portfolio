STATUS: READY_FOR_REVIEW (재무 필터 3단계 — 지피 1430 CHANGES_REQUESTED 3항 반영 · 재검토 요청, 브랜치 한정, 운영 미반영)
ORDER-ID: GPT-REVIEW-fundamental-filter-20261115-1430 (CHANGES_REQUESTED 1~3항) · 순태씨 대화 2026-11-15 '승인'(3단계)
BASE: eb98f24675747510c6db53dfe7c310bf25aef36d
HEAD: main CLAUDE-LATEST.md의 HEAD(이 보고서가 든 브랜치 최신 커밋)
CODE-COMMIT: 7d4e2ff056403079c9e3e2126b0b43e7d07a6f77
REVIEW-SCOPE: eb98f24...7d4e2ff — has/live-price-reference.js(캐시 항목에 fundamental 복사 1곳), has/fundamental-filter.js(display 종목 일치·날짜 충돌 보류, ifrs-filer 결과에 ticker, 근거 줄 '원본 독립 대조 미실시'), has/fear-top.js·has/live-price-panel.js(display에 ticker 전달), tests/fundamental-display.test.cjs(기존 6건 수정 + 새 4건), tests/lib/live-data-pins.json(SHA 4개)

## 지피 1430 검토 반영 (2026-11-15 15시 정각 실행)
1. 환호성 전달 경로: `createService` 수집 성공 시 캐시 항목에 `fundamental`(원본 응답 `raw.fundamental`의 깊은 복사, 일반 객체가 아니면 null)을 저장 → `snapshot()`·`peek()`로 패널까지 전달. 실패·이전 응답 시엔 기존 항목(이전 fundamental 포함)을 그대로 유지하고 '지난 성공 자료' 표시. 시험: 실제 `HASLivePriceReference` + 실제 패널 + JSONP 합성 응답(스크립트 콜백 직접 호출, 네트워크 0) 전 구간, 서비스 단위 복사·null 처리.
2. 종목 정합성: `display()`는 `options.ticker`가 없거나 `raw.ticker`와 다르면 '재무: 종목 불일치(A ≠ B) · 판단 보류'/'대상 종목 미지정' — 라벨 없음. ifrs-filer 결과도 ticker 일치 필요. 결산일이 오늘 이후, 공시일이 결산일 이전·오늘 이후면 '결산일·공시일 충돌' 보류. 근거 줄은 '<티커> SEC 공시(XBRL) · 원본 독립 대조 미실시 · 임계값 미검증 제안값'.
3. 미연결·실패 경로(정책 명시): 가격 근거 없음(missing/분석 실패) → 카드는 '가격 근거 없음 · 판단 보류'만, 재무 줄 표시 안 함. stale → '지난 성공 자료' 경고와 함께 재무 줄 표시(재무 자체 신선도는 assess가 별도 판정). fundamental 미전송(현재 운영 GAS) → '재무: 미연결 · 판단 보류'. 시험으로 보유종목 배열 불변·localStorage 쓰기 0 확인. 가격 조회·보유 정보·투자기록 변경 없음.
- 시험: 전체 2141 중 2139 통과/0 실패/2 skip(DST), 비밀값 0. portfolio_v5.html 변경 0.
- 미검증: 화면 레이아웃 변경 없음(문구만)이라 이번엔 Chromium 360/390/430 재확인 미실시. 실제 GAS `fundamental` 수집 미구현, 갤럭시 미확인.
- 순태씨 결정 필요: 운영 반영 여부(지피 재검토 후), 4단계 GAS 수집 시점.

---
# (이전) 3단계 최초 보고
STATUS: READY_FOR_REVIEW (재무 필터 3단계 — 곡소리·환호성 화면 재무 라벨, 합성 자료 · 브랜치 한정, 운영 미반영)
ORDER-ID: 순태씨 대화 2026-11-15 13시대 '승인'(3단계 진행 승인) · 이전 GPT-REVIEW-fundamental-filter-20261115-1130 APPROVE(2단계)
BASE: 488cd55a29784febe5634268ceeeefd1bd52ccfb (+ main 6741702 병합)
HEAD: main CLAUDE-LATEST.md의 HEAD(이 보고서가 든 브랜치 최신 커밋)
CODE-COMMIT: 45beaa4a96f336f59b85b0d3e59cc149e3835f91
REVIEW-SCOPE: has/fundamental-filter.js(validNormalized·display 추가), has/fear-top.js(카드 재무 줄·근거 펼침·머리 문구), has/live-price-panel.js(환호성 카드 재무 줄 1줄), portfolio_v5.html(script 1줄), tests/fundamental-display.test.cjs 6건, tests/lib/live-data-edits.json·live-data-pins.json

## 3단계 — 화면 재무 라벨 (2026-11-15, 순태씨 승인)
- 자료 경로: 곡소리 요약 항목의 `fundamental`, 환호성 가격 응답 항목의 `fundamental` = `normalize()` 결과(추후 GAS가 실어 보냄). 앱은 `validNormalized()`로 형식(버전·결산일 내림차순·숫자/null·conflicts 모양)을 엄격히 확인한 뒤에만 기기 시각으로 `assess()` → 신선도(18개월) 판정은 표시 시점 기준.
- 표시 상태: 자료 없음 '재무: 미연결(재무 자료 수집 전) · 판단 보류' / 형식 불명 '자료 형식 확인 필요' / 국내(KR) '국내·해외 기업 재무 확인 미연결(미국 SEC만 1단계)' / 판정 시 '재무: <라벨> · <사유> · 판단 보류'. 근거 펼침에 항목별 상태·근거·반론, 기준 결산일·공시일·SEC·'임계값 미검증'.
- 맥락 문구: 곡소리 취약 → '가격 하락이 기업가치 훼손일 수 있음 — 곡소리로 보지 않음', 우량 → '밸류에이션 확인 전이라 매수 검토 아님'. 환호성 취약 → '탈출 신호 여부 점검 필요(매도 판단은 순태씨)', 우량 → '과열 여부는 밸류에이션 연결 전 판단 보류'. 의견은 항상 '판단 보류'.
- 지금 운영 GAS는 `fundamental`을 보내지 않으므로, 반영해도 화면은 '재무: 미연결'만 추가됨(네트워크·저장 변화 0).
- 시험: 새 6건(상태별 표시·형식 거부 7종·오래된 자료·곡소리 카드 5종·모듈 없을 때 기존 문구·환호성 카드·pin/순서), 전체 2137 중 2135 통과/0 실패/2 skip(DST), 비밀값 0.
- 화면: Playwright Chromium 360·390·430px(합성 3종목 곡소리 카드, 외부 요청 차단) 가로 넘침 0(scrollWidth=clientWidth), 최소 글자 13.3px.
- 미검증·한계: 실제 GAS 응답에 `fundamental`을 싣는 수집(4단계, 순태씨 GAS 작업) 미구현 → 실제 자료 화면 미검증. 갤럭시 실기기 미확인. 밸류에이션 미연결이라 '매수 검토' 표시 없음.
- 순태씨 결정 필요: 운영 반영 여부(지피 검토 후 '올려'), 4단계 GAS 수집 시점.

---
# (이전) 2단계 보고
STATUS: READY_FOR_REVIEW (2단계 지피 재검토 1030 반영: 보고서 정합성 복원 · 재검토 요청, 앱·GAS 연결 없음)
ORDER-ID: GPT-REVIEW-fundamental-filter-20261115-1030 (CHANGES_REQUESTED 3항 보고서 정합성) · 이전 GPT-REVIEW-fundamental-filter-20261115-0930 (1~3항)
BASE: e83bc9c94cdf6c6a3e0bce73b31881b51f81b1c0
HEAD: main CLAUDE-LATEST.md의 HEAD = 이 보고서가 들어 있는 브랜치 최신 커밋(보고서 자신의 SHA는 파일 안에 적을 수 없어 LATEST에 기록)
CODE-COMMIT: e7f8ad0d16e6d63d8eb3706b0b700cae2edcdd61 (코드·시험·핀 최종. 이후 a29dc43·772efe5·이번 커밋은 docs/team 문서와 main 문서 병합만 — 코드 변경 0)
REVIEW-SCOPE: ① 이 보고서가 지정 HEAD에서 최신 내용(아래 '지피 검토 반영' 절)을 담고 main 사본과 같은지 ② 코드 범위는 0930 검토와 동일: has/fundamental-filter.js(pick 충돌 보류·sources/conflicts, fresh/latestWith/at/staleWhy, 이익률 신선도, 라벨 사유), tests/fundamental-filter-review-fixes.test.cjs 6건, tests/fundamental-filter-sec-sample.test.cjs(머리말 정정·1건 추가, 기존 6건 포함 7건), tests/lib/live-data-pins.json

## 재검토 1030 반영 (2026-11-15 11시 정각 실행)
- 원인: 10:20 실행에서 보고서를 a29dc43(main 병합) 뒤 772efe5에 커밋했는데, LATEST의 HEAD를 a29dc43으로 적어 지정 HEAD에서는 이전 보고서가 보였음. 코드 문제 아님.
- 조치: 브랜치에 최신 main 병합 후 이 머리말 갱신, 커밋 뒤 브랜치 최신 HEAD에서 보고서를 다시 읽어 main 사본과 바이트 동일 확인(git diff 0), LATEST HEAD를 그 커밋으로 기록.
- 시험(이번 실행 재실행, 지정 HEAD 코드 = e7f8ad0과 동일): 2단계 기존 6건 + 검토 반영 새 7건(review-fixes 6 + sec-sample 1), 전체 2130 중 2128 통과/0 실패/2 skip(DST), 비밀값 0. 화면 변경 없음.
- 한계(그대로 유지): 2단계는 '수기 전사 기반 계산 검증' — SEC 원본 응답·10-K 원문 대조와 대체 태그 의미적 동일성은 **검증하지 않음**. 400일·550일은 미검증 제안값. 직전 결산 대체가 있어도 다른 근거 충분 시 '우량 근거 충분' 유지는 투자 판단과 동치 아님(보수성은 추후 별도 검증). 앱(portfolio_v5.html)·GAS·실제 API 연결 없음.

## 지피 검토 반영 (2026-11-15 10시대 정각 실행)
1. **대체 태그 충돌**: 같은 결산일에 여러 태그 값이 있으면 금액이 모두 같을 때만 우선순위 첫 태그 사용(`sources[항목] = {tag, filed, accn, agree:[같은 값 태그]}`). 금액이 다르면 최신 공시라는 이유로 고르지 않고 그 해 그 항목을 값 없음으로 보류하고 `conflicts[{field, candidates:[tag·val·filed·accn]}]` 기록. 최근 2개 결산에 불일치가 있으면 취약 없어도 '혼재(근거 확인 필요)'. 실제 5종목 전사분에는 불일치 0건(MSFT FY2024 InterestExpense=InterestExpenseNonoperating=2,935백만 같은 값).
2. **직전 결산 신선도 한도**: 부채·이자·이익률이 최신 결산에 없을 때 바로 전 결산만, 그리고 ① 최신 결산과 간격 400일 이내 ② 그 항목 결산일 자체가 기준시각에서 550일(18개월) 이내일 때만 허용. 넘으면 n/a + '직전 결산 허용 한도 초과: 결산일'. 사용 시 근거에 '[결산일 기준 · 최신 결산엔 값 없음]', `fallback[{id, end, latest}]`, 라벨 사유에 '일부 항목(…) 직전 결산 기준'. 이익률 '최근' 값이 3년 전 것이던 문제도 같은 규칙으로 막음. 지피 예시(2026-11 시점 2024-12 항목, 684일) → n/a 시험. AAPL(2025-09-27, 414일)은 허용 유지.
3. **증빙 범위**: 2단계 이름을 '수기 전사 기반 계산 검증'으로 좁힘. 픽스처는 SEC companyconcept에서 10-K·FY·연간 항목을 골라 7열로 옮긴 요약이며(각 줄 accn·filed, 첫 줄 CIK·URL), 시험이 fp:'FY'를 주입하므로 **원본에서 연간 값만 고르는지와 전사 오류 유무는 검증하지 않음**. 원본 전체 응답 보관은 하지 않았음(예약 실행에서 SEC 조회는 권한 대기로 막힘 — 우회 안 함).

시험: 새 7건(검토 반영 6 + 5종목 충돌 0·fallback 기록 1), 전체 2130 중 2128 통과/0 실패/2 skip(DST), 비밀값 0. 화면 변경 없음.

미검증·결정 필요: 임계값 400일·550일은 제안값(미검증). 직전 결산 대체 항목이 있어도 다른 조건 충족 시 '우량 근거 충분' 유지(사유에 명시) — 더 보수적으로 '혼재'로 낮출지는 지피·순태씨 의견 필요. 원본 응답 보관 검증은 순태씨 대화 세션(조회 승인 가능)에서.

---
# (이전) 2단계 보고
STATUS: READY_FOR_REVIEW (2단계 완료 · 지피 검토 요청, 앱·GAS 연결 없음)
ORDER-ID: 순태씨 대화 2026-11-15 '재무 필터 시작' + 'SEC 조회 승인'
BASE: 2519926397abe6d0e364eb4e012d8871e9f2c2e7
HEAD: e83bc9c94cdf6c6a3e0bce73b31881b51f81b1c0
REVIEW-SCOPE: has/fundamental-filter.js 변경분(태그 대체·latestWith·금융업·혼재 조건), tests/fundamental-filter-sec-sample.test.cjs 6건, tests/fixtures/sec-sample-20261115/*.txt(실제 SEC 값)

## 2단계 — SEC 5종목 수기 전사 기반 계산 검증 (2026-11-15, 이름 정정: 지피 검토 3항)
출처: https://data.sec.gov/api/xbrl/companyconcept/CIK##########/us-gaap/<TAG>.json (SEC EDGAR XBRL, 조회 2026-11-15 KST, 순태씨 조회 승인). 10-K·FY·결산일 2021-06 이후, 태그·결산일별 최신 공시. 값은 조회 도구가 옮긴 숫자이며 아래 계산은 손으로 다시 확인함.

| 종목 | 결과 | 주요 수치(손계산 대조) | 발견·조치 |
|---|---|---|---|
| AAPL | 우량 근거 충분 | ROE 157.5%(자사주로 자본 작음), 순부채/OCF 0.5배(FY2025), 이익률 32% | FY2026 10-K가 일부 태그(영업이익·현금·부채)에 아직 없음 → 시점 항목은 직전 결산까지 보고 '[결산일 기준]' 표시. 이자비용 FY2024부터 미공시 → n/a |
| MSFT | 우량 근거 충분 | 이자보상 155237/3051=50.9배, 순부채/OCF 0.1배, ROE 34.3% | InterestExpense가 FY2024까지 → InterestExpenseNonoperating 대체(기존 목록) 확인 |
| NVDA | 우량 근거 충분 | 이자보상 503.4배, 순현금, FCF 5/5년 | 설비투자 태그가 PaymentsToAcquireProductiveAssets(무형자산 포함) → 대체 목록 추가 |
| JNJ | 우량 근거 충분 | 평균 ROE 31%, 순부채/OCF 0.9배 | 영업이익 미공시 → 이익률 n/a. 자본은 비지배지분 포함 태그만 있음(기존 대체). 10-K 안 분기 값 제외 확인. 2023년 순이익에 일회성(분사) 이익 포함 — 반론 문구로만 표시 |
| JPM | 공시 부족(금융업 보류) | 영업현금흐름 음수(은행 특성) | 그대로 두면 '이익의 질 취약'으로 오판 → Deposits 공시 기업은 금융업으로 판정 보류 |

추가 규칙: 판정 가능 항목이 4개뿐이면 취약이 없어도 '혼재(근거 부족)' — 우량 근거 충분은 5개 이상일 때만.

시험: 새 6건, 전체 2123 중 2121 통과/0 실패/2 skip(DST), 비밀값 0. 화면 변경 없음.

미검증·한계: 우량 4곳은 모두 대형 우량주라 '취약' 실제 사례 대조는 아직 없음(다음에 낙폭 큰 종목으로). 보험·리츠 판별 없음. AAPL FY2026 자본 112,093백만 달러 등 SEC 응답값 자체는 원본 10-K 문서와 대조하지 않음. 조회 도구가 숫자를 옮기는 과정의 오류 가능성 — 핵심 값은 손계산 일치로만 확인.

다음 단위: 3. 앱 표시(곡소리 카드·환호성 보유종목 재무 라벨, 합성 자료로 먼저) — 순태씨 승인 필요. 4. GAS 수집은 순태씨 GAS 작업 때.

---
# 재무 필터(2차 우량주 판정) 1단계 — 2026-11-15

## 순태씨 결정 (2026-11-15 대화)
- 판정 항목 큰 틀·미국(SEC) 먼저·해외(IFRS/20-F) 기업은 '공시 부족·별도 확인' — 제안대로.
- 대상 = 52주 고점 대비 **-20% 이하 종목(곡소리 후보) ∪ 보유종목(환호성용)**, -30% 이하는 '깊은 곡소리' 표시. 재무는 **새 공시가 나왔을 때만** 다시 받음(매일 200개 아님).
- GAS 수정은 순태씨가 나중에 직접. 이번 단위는 네트워크 0.

## 변경 (has/fundamental-filter.js, 앱·GAS 연결 없음)
- `normalize(companyfacts)`: us-gaap 연간(10-K/10-K/A, FY, 기간 350~380일) 값만, 같은 결산일은 최신 공시(정정) 우선, 태그 대체(매출 3종 등), 최근 5년. ifrs-full만 있으면 'ifrs-filer'.
- `assess()`: 항목 8개(ROE·영업이익률 추세·순부채/영업현금흐름·이자보상배율·FCF 흑자 연수·영업현금흐름/순이익·흑자 연수·밸류에이션=가격 연결 전 n/a). 각 항목 근거·반론·제안 기준 문구.
  - 라벨: 3년 미만·18개월 이상 지난 공시·판정 가능 항목 4개 미만 → 공시 부족 / 취약 2개 이상 → 취약(탈출 신호 가능) / 취약 0·주의 ≤1 → 우량 근거 충분 / 그 외 혼재.
  - 항상 signalHold:true·opinion '판단 보류'. reviewEligible(=우량 근거 충분)은 '매수 검토' 표시 자격 표시일 뿐, 밸류에이션 연결 전.
  - 결측값을 0으로 채우지 않음(부채 없음 → 해당 항목 n/a).
- `targets()`: 미국 reference 행 중 낙폭 ≤ -20%(설정 가능) ∪ 미국 보유종목, 중복 제거, deep(-30%) 표시.
- `needsRefresh()`: 마지막 확인 공시일보다 새 공시가 있을 때만 true.

## 시험
- 새 11건(우량/취약/혼재/공시 부족/정정 공시·분기 제외/부채 대체/음수 자본/권유 문구 없음/대상 선정/갱신 판단/순수성+pin).
- 전체 2117 중 2115 통과/0 실패/2 skip(DST), 비밀값 0. 화면 변경 없음(Chromium 해당 없음).

## 미검증·한계
- 임계값(ROE 12%/5%, 영업이익률 -5%p, 순부채 3배/5배, 이자보상 5배/2배, OCF/NI 0.8/0.5)은 제안값 — 백테스트·업종별 보정 없음.
- 실제 SEC 응답 형식은 합성 픽스처 기준. 은행·보험(이자 구조 다름)·리츠는 항목이 맞지 않을 수 있음 → 다음 단계에서 업종 예외 검토.
- 리스부채·단기차입금 미포함(장기부채 기준).

## 다음 단위
2. 미국 샘플 5종목 실제 SEC companyfacts 값 수동 대조(출처 URL·기준일 기록, 불일치 시 태그 보정).
3. 앱 표시(곡소리 카드·환호성 보유종목에 재무 라벨) — 합성 자료로 먼저.
4. GAS 야간 수집(새 공시만) — 순태씨가 GAS 손볼 때 가격 계산과 함께 설치.
