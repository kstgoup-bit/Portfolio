STATUS: READY_FOR_REVIEW
ORDER-ID: GPT-REVIEW-postmerge-queue-20261125-0930 CR-1~CR-5 (순태씨 D1·D4 승인 → D2·D3·D5 추가 승인, 2026-11-25 클로 대화)
BRANCH: work/claude-postmerge-fix-20261125
BASE: d5f011497dfd30bb776f09e047b340d9f9a04be5
HEAD: 6d96cf07ece8cedf85aab80f20a70ee2ea73b8ed
REVIEW-SCOPE: BASE..HEAD 전체 — 단위 A(D1·D4, `9449668`) + 단위 B·C(D2·D3·D5, `6d96cf0`). 단위 A 라벨 문구는 단위 C에서 다듬음.
UPDATED: 2026-11-25 11시대 KST

# 사후 검토 수정 (D1~D5)

## 단위 A — D1·D4 (`9449668`)
- KIS 대조 문구 '(백업 미포함)' → '(백업에 포함, 복원하면 이 기록도 되살아남)'. 백업 동작 변경 없음(`0f5009e` 순태씨 요청).
- AI 카드 매수 쪽(buy-review·add-review) 라벨을 녹색 '매수 검토' 대신 판단 보류로 표시, 경고문, 5% 예외 정찰·1·3·3·3 금액 안내 숨김, 현황 띠 매수 건수 숨김(카드로 가는 길만). JSON·VERDICT 원본·성적표 verdict 유지.

## 단위 B — D2·D3 (`6d96cf0`, has/kis-crosscheck.js · has/price-trust-ui.js)
- `compare()`: 두 출처 최신 확정일이 다르면 `stale:'source-lag'`, 비교 종가가 달력 6일 넘게 오래되면 `stale:'old'` → status `stale`(일치 아님). 화면 '⏳ 미검증'.
- `recordFrom(results, at, total)`: stale은 일치로 세지 않음, `total`(보유 국내 전체 수)·`fp`(대조 종목 집합 지문 8자리) 기록. `validRow`는 두 필드를 선택 필드로 검사(옛 기록 읽기 호환, 백업 형식 v1·backup/core.js 변경 없음).
- `trustSummary(row, now, hasUS)` 신설, 가격 신뢰도 띠가 사용: 신선도는 조회 시각(`row.at`)이 아니라 종가 날짜(`row.d`) 기준, `total>n`이면 '⚠ 일부만: 보유 N종목 중 n종목', total 없는 옛 기록은 '대조 범위 미기록'(info, ✅ 아님).
- `streak()`: 최신 거래일 기록이 없으면 0(건너뛰기 제거), 주말 날짜 제외, 지문 없는 옛 기록(11-25 이전)·일부 대조·불일치·지문 변경에서 끊김 → 기존 로그는 G0 증명에 소급 안 함. 화면 '(11/25 새 기준 이후 기록만 셈)'.
- 자동 대조: 실패 시 같은 날 최대 2회, 10분 간격(1회 최대 KIS 3호출, 한도 150 보호). 실패·일부 대조·불일치를 기록 메모로 구분 표시.
- 미반영(한계): 공식 KRX 거래일 달력·시세 종류/거래소/조정 기준·원천 응답 시각은 GAS 응답에 없어 앱에서 증명 불가 → 'stale(old)'는 달력 6일 근사. 실제 달력 대조는 GAS 변경이 필요(순태씨 승인 대상).

## 단위 C — D5 (`6d96cf0`, has/review-cards.js)
- 카드 선택 필드 `consensus: {status:'agreed'|'disagree'|'no-response', review:'GPT-REVIEW-ai-review-YYYYMMDD-HHMM.md', date, ticker, market, verdict}`.
- `consensusOf()`: 종목·시장·판단·검토일(카드 문서 reviewedAt의 한국 날짜)·검토 파일 날짜가 모두 맞을 때만 '🤝 지피 합의', 7일 지나면 '⏰ 만료', 기록 없으면 '🧑 클로 단독', 어긋나면 '단독(합의 기록 불일치)'. 불일치·응답 없음은 판단 라벨 대신 '⚖ 의견 불일치로 보류'/'⌛ 지피 응답 없음 · 보류', 요약 건수도 같은 정책.
- 합의여도 매수 쪽 판단 보류(D4)는 유지 — 해제 조건(재무 연결)은 별도 결정.
- 현재 게시 카드(latest·fear-us-latest·holdings-latest)는 consensus 없음 → 전부 '클로 단독'(시험으로 확인, 일괄 승격 없음).
- 라벨 정리: '매수 후보 · 클로 단독 의견 · 판단 보류' → '매수 후보 · 판단 보류(재무·시세 검증 전)'(합의 표시와 모순 방지), 현황 띠 '(날짜 · 판단 보류)'.
- COLLAB-PROTOCOL 7절에 07:45 클로가 AGREE/DISAGREE/무응답을 새 날짜 파일 카드의 consensus 필드로 적는 규칙 추가(main 문서).

## 시험
- 전체 `node --require ./tests/lib/no-network.cjs --test tests/*.test.cjs`: 2375 · pass 2373 · fail 0 · skip 2. 신규: review-cards-held 4, review-cards-consensus 5, kis-crosscheck-d2d3 6. 기존 kis-crosscheck 연속 일치 시험은 새 규칙에 맞춰 수정(토요일 11-21 합성 거래일 제거, '최신 미기록일 건너뜀'→0).
- live-data-edits.json price-trust-ui 쌍 갱신(역적용으로 원본 재현 — kis-auth-independent 시험 통과), pins 3개 갱신. scan-secrets 0.
- Playwright Chromium 360·390·430: 합성 하네스(가짜 latest.json·대조 기록, 외부 요청 차단)에서 가로 넘침 0, 12px 미만 0, 띠 '일부만 20 중 15', 합의/불일치/단독 배지 확인. 실제 앱 전체 화면 아님.

## 미완료·미검증
- 실제 GAS/KIS 응답·실제 폰·실제 앱 전체 화면·실제 백업 복원 미확인.
- autoOnce의 하루 2회·10분 간격 가드는 코드 검토로만 확인(시험은 run(true) 실패 횟수·메모·기록 없음까지).
- 공식 거래일 달력 연동(GAS) 미착수.

## 순태씨 결정 필요
- 지피 APPROVE 후 운영 반영('올려').
- (나중) 매수 후보 판단 보류를 풀 조건: 재무(DART/SEC) 연결 + 지피 합의 + KIS 대조 완전 일치 등 — 아직 미정.
