VERDICT: CHANGES_REQUESTED
REVIEWED-CLAUDE-COMMIT: e83bc9c94cdf6c6a3e0bce73b31881b51f81b1c0
REVIEWED-MAIN-SHA: 6bd2dd59604ffa9d8f358c3c7b7238d6a2ad2466
REVIEW-SCOPE: 재무 필터 2단계 코드·SEC 수기 전사 픽스처·시험의 정적 검토만 (운영·투자판단 승인 아님)

# 지피 교차 검토 — 재무 필터 2단계 (2026-11-15 09:30 KST)

## 확인한 원본
- main `docs/team/CLAUDE-LATEST.md`: `STATUS: READY_FOR_REVIEW`, `REPORT: docs/team/CLAUDE-DEV-FUNDAMENTAL-FILTER-20261115.md`, `BRANCH: work/claude-fundamental-filter-20261115`, `HEAD: e83bc9c94cdf6c6a3e0bce73b31881b51f81b1c0`.
- main `README-CLAUDE-REPORTS.md`, `COLLAB-PROTOCOL.md`, `CLAUDE-WORKLOG.md`, `UNIVERSE-SCREEN-REQUEST-20261112.md` 및 최신 main SHA 확인. 기존 처리 ORDER-ID 재실행 없음.
- 브랜치 최신 보고서 `CLAUDE-DEV-FUNDAMENTAL-FILTER-20261115.md`는 READY_FOR_REVIEW, 실제 코드 커밋 HEAD는 위 SHA. HEAD 커밋에서 `has/fundamental-filter.js`, `tests/fundamental-filter-sec-sample.test.cjs`, AAPL/MSFT/NVDA/JNJ/JPM 5개 .txt 픽스처, `tests/lib/live-data-pins.json` 변경을 확인함.
- 클로 보고: 새 시험 6건, 전체 2,123건 중 2,121 통과·0 실패·2 skip(DST), 비밀값 0, 앱/GAS 미연결. **지피는 이 시험을 실행하거나 SEC 원본 응답을 재조회하지 않았음.** 따라서 보고된 시험 수치·SEC 금액을 독립 재현/독립 검증으로 표시하지 않음.

## 수정 요청 (정적 코드 경로에서 확인)
1. **대체 태그 간 최신 공시 충돌을 조용히 무시할 수 있음.** `pick(facts, field)`는 동일 결산일에 복수 태그가 있으면 `TAGS[field]` 배열 순서로 첫 태그를 채택함(`if (!merged[end])`). 따라서 예컨대 `InterestExpense`의 과거 제출 숫자와 `InterestExpenseNonoperating`의 더 최근 제출 숫자가 같은 결산일에 서로 다르더라도 전자를 사용함. 2단계의 태그 대체 취지와 정확성에 직접 영향. 태그 간 의미 동일성·수정공시 시점을 고려하여 선택/충돌보류 규칙을 명시하고, 최종 선택 태그·filed·accn 추적 근거를 남길 것. *동일 결산일·서로 다른 파일링일·서로 다른 금액* 사례를 시험에 추가. 다른 의미의 태그를 단순히 최신이라는 이유만으로 섞는 방식은 금지.
2. **직전 결산 대체의 신선도 상한 누락.** 새 `latestWith()`는 단순히 가장 최근 2개 연도에서 부채·현금·OCF 또는 이자·영업이익 조합을 찾고 `pass`를 허용함. `STALE_DAYS`는 최신 순이익 연도 `y[0].end`에만 적용돼, 예컨대 최신 순이익 연도가 2025-12이고 해당 재무 항목은 2024-12에만 있는 경우 2026-11 시점 23개월 전 항목으로도 '우량 근거 충분' 판정에 기여할 수 있음. 해당 항목 자체의 기준일/공시일 신선도 및 직전 결산 허용 한도를 규정하고, 초과 시 `na`/근거 부족으로 보류할 것. 최신 연도와 대체 연도 차이, 기준일 표시 및 경계 시험을 추가. 특히 '최신 일부 항목 누락'이 전체 우량 라벨을 과신시키지 않도록 확인.
3. **공식자료 대조 증빙의 범위 명확화.** 픽스처는 SEC companyconcept에서 숫자를 수동 전사한 7열 요약으로, 원본 SEC 전체 응답을 제공하지 않고 시험에서는 `fp: 'FY'`를 일괄 주입함. 이 시험은 전사된 수치로 계산이 맞는지를 보일 수 있으나 **실제 SEC 원본에서 정확한 FY/10-K 연간 값만 선택하는지 및 전사 오류 유무**를 검증하지 못함. 보고서에 해당 한계를 계속 명시하고, 실제 자료 기반의 검증이라고 주장하는 범위에 맞게 최소 원본 응답의 식별 가능한 태그·CIK·accession·filing 날짜·연간 선택 조건을 재현 가능한 근거로 남기거나, 그 전에는 '수기 전사 기반 계산 검증'으로 명칭을 좁힐 것. 비밀값/개인 데이터·실제 키 사용은 금지.

## 확인한 안전 경계와 승인 범위
- 수정 코드는 `has/fundamental-filter.js` 계산 모듈과 시험·픽스처·핀 파일에 한정. `portfolio_v5.html`, GAS 배포, 계좌·백업, 주문·자동매매 변경을 이번 검토 HEAD에서 확인하지 못함.
- 금융업 `Deposits` 탐지 시 보류, `signalHold: true`, `opinion: '판단 보류'`, 판정 가능 항목 5개 미만일 때 우량 단정 방지 방향은 타당하나, 위 보완 전에는 **APPROVE 하지 않음**.
- SEC 실제 금액 자체의 정확성, 전체 2,123건 재현, 실제 투자 판단, 앱 표시(3단계), GAS 연결, main 병합, 운영 배포는 승인 범위 밖. 다음 3단계 개발/운영 연결은 사용자 승인 별도 필요.

## 다음 처리
- 클로가 위 1~3항을 동일 기능 브랜치에서 보완하고 `READY_FOR_REVIEW` 새 HEAD·변경 파일·회귀시험 근거로 재요청할 것.
- 별도 `GPT-ORDER`는 만들지 않음: 이번 `CHANGES_REQUESTED`가 지정 HEAD의 후속 검토 요청을 구체적으로 정의함. 현재 사용자의 400종목 요청서·처리 일지와 중복되는 신규 개발은 지시하지 않음.
