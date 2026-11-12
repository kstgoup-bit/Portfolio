VERDICT: CHANGES_REQUESTED
REVIEWED-COMMIT: 321f8bbec48076bff83d2580700b6a78db76b535
ORDER-ID: GPT-20261113-0024
REVIEW-SCOPE: 07:30 지피 지적사항 1·2·3에 대한 08:10 입력검증 보완분만(합성 순수 계산 엔진). 운영 승인 아님
MAIN-SHA-AT-REVIEW: eab0e50a86dd83c311efc2e8917eab54c94cf18c

# HAS 자본배분 입력검증 재검토 — 2026-11-13 08:30 KST

## 확인한 증빙
- main의 CLAUDE-LATEST.md STATUS READY_FOR_REVIEW / REPORT docs/team/CLAUDE-DEV-CAPITAL-ALLOCATION-20261113.md / BRANCH work/claude-capital-allocation-20261113 / HEAD 321f8bb 확인.
- main의 README-CLAUDE-REPORTS.md, COLLAB-PROTOCOL.md, CLAUDE-WORKLOG.md 및 UNIVERSE-SCREEN-REQUEST-20261112.md 열람. GPT-20261113-0024는 일부 처리 중으로 화면 4절 미완료.
- main과 개발 브랜치 보고서 내용 대조. GitHub compare 47d8533..321f8bb: 5커밋, 코드 has/capital-allocation.js, tests/capital-allocation.test.cjs, 보호 핀과 문서 변경 확인. GitHub 지정 코드·신규 3개 단위시험·합성 픽스처 열람.
- 클로 보고: 총 2,003건 중 2,001 통과 / 실패 0 / DST 관련 skip 2; 비밀검사 0. **지피가 전체 시험이나 새 시험을 독립 실행한 것은 아님.** 화면 변경 없어 Chromium 해당 없음.

## 확인된 개선
1. 후보 내부 같은 티커의 가격·통화·시세종류·시각이 양쪽 모두 명시되어 서로 다른 경우 HOLD_CONFLICT, 완전히 같은 예시 중복은 대안 하나로 합치는 코드·시험 추가 확인.
2. null/문자열/NaN/Infinity를 포함한 대안·시나리오 등 비정상 입력을 사전 차단하고 예외 시 대안 단위 판단 보류 처리 확인.
3. 날짜·ISO 오프셋·IANA 시간대 및 기준시각 앞뒤 검사, 교차검증·정규장 확인을 엔진이 독립 수행하지 않는다는 설명 확인.

## 남은 구체적 수정 요청(필수)
1. **동일 티커 두 후보 중 한쪽만 priceKind 또는 quoteAsOf를 가진 경우를 잘못 동일 자료로 취급함.** has/capital-allocation.js의 factClash()는 시세종류·기준시각을 `a.priceKind != null && b.priceKind != null` / `a.quoteAsOf != null && b.quoteAsOf != null`일 때만 비교한다. 예: 첫 GOOGL 후보 `{symbol:'GOOGL',priceUSD:100}`와 둘째 `{symbol:'GOOGL',priceUSD:100,priceKind:'extended'}`는 2개가 '완전히 동일'하지 않지만 누락된 첫 기록을 문제 삼지 않고 첫 입력으로 중복 제거한다. 시세종류 또는 기준시각이 한쪽만 있으면 데이터 부족으로 전체 HOLD_INSUFFICIENT_DATA(혹은 명시적인 보수적 HOLD_CONFLICT) 처리하되 정상적인 단일 후보에서 선택 필드가 없는 기존 합성 계약은 유지한다. 같은 순간의 다른 ISO 오프셋은 동일하게 취급한다.
2. **결과의 코드와 보고서 불일치 수정 또는 근거 명시.** 보고서는 `sale` 형식 오류를 HOLD_INSUFFICIENT_DATA라 했지만 `sale:{}` 등 객체이되 필수 필드가 빠진 경우 현재 코드가 보유 종목 없음으로 HOLD_CONFLICT를 반환한다. 형식 결함은 `HOLD_INSUFFICIENT_DATA`로 일관되게 처리하도록 보완하고 회귀시험을 추가해 달라.
3. 각 재현에 대해 실제 입력/기대 상태를 단위시험에 고정하고 보고서에 추가한 총 시험 수를 업데이트할 것. 기존 손계산 표, 기존 입력·원장 불변, `canBuyReview.allowed=false` 유지.

## 다음 단계
- **판정은 08:10 수정분에 대한 보완 요청**으로, 기존 07:30 지적 1~3이 전반적으로 개선됐다는 사실을 부정하지 않음. 남은 두 입력 경계는 계산 신뢰성 문제이므로 엔진의 한정 APPROVE는 재검토 후.
- 기존 `GPT-20261113-0024` 내에서 같은 개발 브랜치로 수정, READY_FOR_REVIEW 제출 후 4절 별도 시험 게이트 화면으로 진행. 중복 GPT-ORDER 생성하지 않음.
- 400종목 곡소리 공식 미국 명단은 사용자 제공 파일 전 임의 구성하거나 선정 기준 변경하지 않음.
- main 앱 병합·운영 배포·실제 GAS 변경/배포·시크릿 사용·비용·클라우드·투자기록/백업 변경·자동매매 금지. 현재 사용자 사전 승인 요청 없음.