STATUS: READY_FOR_REVIEW
ORDER-ID: (없음 — 순태씨 대화 2026-11-13 01:56 "아직도 많이 느리고, 설명글이 많고, 해외 탭 수익률에 자료가 없어")
BASE: main c0d8761034e7219f8567c65fb96ca9c183408167   HEAD: d771447e035a68656c54364404ed41747f9f43e2
BRANCH: work/claude-fx-retry-20261113
REVIEW-SCOPE: `portfolio_v5.html`(fetchFX 재시도, 기록 상태 요약, 지수 요청 가드), `tests/fx-retry-summary.test.cjs`, 고정 파일 `tests/lib/live-data-edits.json`·`live-data-pins.json`. 계산 정책(`has/snapshot-policy.js`, `has/return-assessment.js`)은 변경 없음.

# 해외 탭 "기록 대기" 반복 문구 + 수익률 전부 '-' + 불필요한 외부 요청 (2026-11-13 02:10 KST)

## 순태씨 화면(휴대폰 2장)에서 확인한 사실
1. 해외 탭 하단에 `해외 / QTOP: 이번 접속에서 받은 유효한 USD/KRW 환율이 없습니다` 같은 문장이 종목마다 반복.
2. 해외 수익률 표(기록 자산가치 변화·입출금 반영 수익률)가 모든 기간 `-`.
→ 종목 시세는 받았고(시세 누락 사유는 없음) **환율만** 못 받은 상태.

## 원인 (코드 확인 + Chromium 재현)
- `fetchFX()`는 환율을 **한 번만** 요청, 응답이 `null`·오류·10초 초과면 재시도 없이 끝. (`fetchKR`/`fetchUS`는 3초→10초→30초 재시도가 있음)
- 환율이 없으면 `snapshotEvaluation('ov')`가 실패 → 수익률 계산이 `currentCandidate=null`로 들어가 `has/return-assessment.js:277`에서 `current-incomplete`("현재 평가 자료 부족") → **모든 기간 `-`**. 같은 실패가 `snapshotMissingText`로 종목마다 한 줄씩 나열됨.
- 재현(합성 GAS, 해외 3종목, 첫 환율 응답 `{"usdKrw":null}`): 변경 전 main은 환율 요청 1회로 끝나 `usdKrw=1370`(기본값)에 머물고 "기록 대기" 유지. 변경 후는 약 4.5초에 재요청 성공(`1344`) → 상태 정상. 항상 실패하는 경우 변경 후 요약 1줄 + 3회 재시도(3초·10초·30초).
- **추정(미확인)**: 순태씨 폰에서 환율이 왜 실패했는지(GAS `type=exchange` 지연·일시 오류·한밤 응답 등)는 실제 기기·GAS 로그 없이는 모름. 이 변경은 일시 실패에서 스스로 회복하게 하는 것이고, GAS가 계속 `null`을 주면 요약 문구가 계속 남음(그때는 GAS 쪽 확인 필요 — 순태씨 승인 후 별도).
- 속도: 화면을 그릴 때마다(`renderAll`) `fetchMarketIndices()`가 외부 중계 서버(allorigins→Yahoo)로 **지수 시세 4건**을 요청하는데, 그 결과를 넣을 칸(`#mkt-KS11` 등)이 화면 어디에도 없어 응답을 그냥 버리고 있었음. Chromium(잠금 우회, CPU 6배)에서 시작 후 14초 동안 변경 전 12건, 변경 후 0건.

## 변경
1. `fetchFX(attempt)`: 시세와 같은 방식 재시도(3·10·30초), 15초 무응답도 재시도, 응답 정상일 때만 값·수신시각 기록, `snapshotInputEpoch`가 바뀌면 늦은 응답 폐기. 정책(환율은 이번 접속에서 받은 것만 인정, 24시간 이내)은 그대로 — 예전 환율로 채우지 않음.
2. 기록 상태: 같은 사유는 한 줄로 묶은 요약(`⚠ 평가 기록 대기 — 사유 (N개 종목 공통)` / `✓ 평가 기록 저장 가능` / `✓ 새 평가 내용 없음 · 기존 기록 유지`)을 13px #333으로 보이고, 기존 전체 문구는 접힌 `ⓘ 기록 상태 자세히` 안으로. 전체 문구(`snapshotStatus-*`의 textContent)는 그대로라 기존 시험·검사 영향 없음.
3. `fetchMarketIndices()`: 지수 표시 칸이 없으면 외부 요청 안 함(칸이 생기면 예전처럼 동작).

## 시험
- 전체 `node --require ./tests/lib/no-network.cjs --test tests/*.test.cjs`: **1987 중 1985 통과 / 0 실패 / 2 skip**(DST TZ 전용). `tools/scan-secrets.cjs` findings 0.
- 새 시험 `tests/fx-retry-summary.test.cjs` 7건: 정상 1회, 실패 3회 재시도 후 중단·실패 값 미기록, 오류·무응답 재시도 1회, epoch 불일치 폐기, 요약 묶음, 접힌 상태 구조, 지수 요청 가드.
- Chromium 360/390/430: 가로 넘침 0, 요약 13px·rgb(51,51,51), 합성 환율 실패/1회 실패 후 회복 재현. 실제 갤럭시·실제 GAS는 미검증.
- 고정 파일: `live-data-edits.json`에 [현재, 이전] 13쌍 추가, 역적용으로 main 원본 재현 확인, `live-data-pins.json` 갱신.

## 미검증·남은 것
- 실제 폰에서 같은 환율 실패가 원인인지(순태씨가 `계산 근거 보기`를 열어 "현재 평가 자료 부족"이 보이면 확정).
- "아직 많이 느림"의 나머지 원인은 이번으로 해결 완료가 아님. 측정 안 한 후보: 매 렌더 전체 탭 그리기(`renderAll`이 가려진 탭까지 그림), 560KB HTML·스크립트 38개 해석, `@import` 글꼴 3개, 시작 시 벤치마크·위험자료 요청 연쇄. 실제 폰 측정(또는 순태씨가 느린 순간 알려주기) 필요.
- 환율 수동 "다시 받기" 버튼은 넣지 않음(3회 자동 재시도로 시작, 필요하면 후속).

## 순태씨 결정 필요
- 운영 반영 승인 요청(클로 검증 완료, 지피 교차 검토 요청). 승인 시 main 병합·배포.
