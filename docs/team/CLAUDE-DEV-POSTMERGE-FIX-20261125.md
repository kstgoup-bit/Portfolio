STATUS: READY_FOR_REVIEW
ORDER-ID: GPT-REVIEW-postmerge-queue-20261125-0930 CR-1·CR-4 (순태씨 D1·D4 승인, 2026-11-25 10시대 클로 대화)
BRANCH: work/claude-postmerge-fix-20261125
BASE: d5f011497dfd30bb776f09e047b340d9f9a04be5
HEAD: 94496688ff3cd437209ee5a1cd9f75c5ab930e9d
REVIEW-SCOPE: 단위 A — D1(KIS 대조 문구) + D4(AI 검토 카드 판단 보류 표시). D2·D3·D5는 범위 밖(미승인).
UPDATED: 2026-11-25 10시대 KST

# 사후 검토 수정 단위 A (D1·D4)

## 변경 파일
- `has/review-cards.js`
  - `buy-review`/`add-review` 표시 라벨: '🟢 매수 검토' → '🧠 매수 후보 · 클로 단독 의견 · 판단 보류'(#333). 다른 판단(관망·장기보유·축소·매도) 라벨은 그대로.
  - 해당 카드가 있으면 상단 경고문: 클로 단독 조사 의견, 재무(DART·SEC)·시세 검증과 지피 합의 전이라 매수 판단 보류.
  - 5% 예외 정찰 안내 제거(판단 보류 중 표시 안 함). 1·3·3·3 금액 안내 문단 → '차트 관문은 기업가치·재무 검증 다음 타이밍 참고, 분할매수 금액 안내 보류'.
  - 차트 관문 상태(하락 추세 등) 표시는 유지(타이밍 참고 정보).
  - 현황 띠: '곡소리 AI 매수 검토 N건' → '곡소리 AI 조사 의견 보기 ▶ (날짜 · 클로 단독 · 판단 보류)', 건수 없음, 녹색 → #333.
  - 보유 종목 띠: '추가 매수 검토 N' → '추가 매수 후보(판단 보류) N', 끝에 '클로 단독'.
  - JSON 파일·`VERDICT` 원본·`validate()`·성적표 채점 verdict는 변경 없음. `shown()`/`HELD` 공개 추가.
- `has/kis-crosscheck.js` 189행 문구 '(백업 미포함)' → '(백업에 포함, 복원하면 이 기록도 되살아남)'. 동작·백업 형식 변경 없음(백업 포함은 `0f5009e` 순태씨 요청).
- `tests/lib/live-data-pins.json` addedRuntimeFiles 두 파일 sha256 갱신(두 파일은 edits 쌍 대상이 아닌 추가 런타임 파일).
- `tests/review-cards-held.test.cjs` 신규 4건(jsdom, 합성 자료).

## 시험
- 전체 `node --require ./tests/lib/no-network.cjs --test tests/*.test.cjs`: tests 2364 · pass 2362 · fail 0 · skip 2 (이전 2360 + 신규 4).
- `node tools/scan-secrets.cjs`: findings 0.
- Playwright Chromium 360·390·430px: 합성 하네스(review-cards.js 단독 + 가짜 latest.json, 외부 요청 차단)로 가로 넘침 없음, 12px 미만·옅은 글자 0, 현황 띠 문구 확인. 실제 앱 전체 화면(로그인·GAS)에서의 확인은 아님.

## 미완료·미검증
- 실제 폰·실제 운영 앱 화면 미확인. 서비스워커 캐시로 반영 후 첫 실행에서 이전 화면이 한 번 보일 수 있음.
- D2(신뢰도 띠 과대표시)·D3(연속 일치 계산)·D5(합의 표시) 미착수 — 순태씨 결정 대기.
- 판단 보류 해제 조건(재무 연결·합의 필드)은 D5에서 설계. 그 전까지는 모든 매수 쪽 카드가 보류 표시.

## 순태씨 결정 필요
- 지피 검토 APPROVE 후 운영 반영('올려').
