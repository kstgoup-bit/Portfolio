STATUS: READY_FOR_REVIEW
ORDER-ID: GPT-20261117-0730
BASE: ed021eea818aab92af9dc5e013f86f2dd4dbb560
HEAD: c9ae2943633016af8cf4c256587c7494c7c95b2e (시험 커밋, 검토 대상) · 보고 커밋은 그 다음 docs만
REVIEW-SCOPE: 1단계 정적 진단 + 합성 시험 `tests/benchmark-conflict-cause.test.cjs` + 설계안(이 문서). 운영 코드·GAS·저장 자료 변경 0.

# 기준지수 보류충돌 — 원인 진단·무손상 해결 설계 (1단계)

작성: 클로, 2026-11-17 08:xx KST 정각 실행. 시험은 클로가 이 컨테이너에서 실행한 결과이며 지피 독립 재실행이 아니다. 순태씨 실제 이력·백업은 열람·다운로드·전송하지 않았다(합성 자료만).

## 0. 변경 파일·시험

| 파일 | 변경 |
|---|---|
| `tests/benchmark-conflict-cause.test.cjs` | 신규 합성 진단 시험 10건 (a)~(g2) |
| `docs/team/CLAUDE-DEV-BENCH-CONFLICT-CAUSE-20261117.md` | 이 보고서 |

`portfolio_v5.html`, `has/*`, `gas/*`, 핀 파일 변경 없음 → live-data-edits/pins 갱신 불필요.

- 단독: `node --test tests/benchmark-conflict-cause.test.cjs` → 10 통과 / 0 실패 (상한 시험 (f) 약 16초)
- 전체: `NODE_PATH=<jsdom 폴더>/node_modules node --require ./tests/lib/no-network.cjs --test tests/*.test.cjs` → **2259 중 2257 통과 / 0 실패 / 2 skip** (skip은 기존과 동일 2건)
- `node tools/scan-secrets.cjs` → findings 0
- 화면 변경 없음 → Playwright 미실행(해당 없음)

## 1. 코드 경로 요약 (main `ed021ee` 기준)

1. 앱 시작마다 `fetchBenchmarkHistory(true)` (portfolio_v5.html 7870행) — 주기 실행은 없고 **앱을 열 때마다 1회**(+수동 버튼).
2. 순서: 069500 → QQQ → SPY 각각 **GAS(type=history, range=1y)** → 실패 시 Yahoo 직접/프록시 5종(query1/query2, range=5y) → (force && AV 키 보유 시, 미국만) Alpha Vantage TIME_SERIES_DAILY. 공급자 고정 아님.
3. 파서 출처 라벨: GAS=`yahoo-chart-v8-via-gas`(providerBarTs=null), Yahoo 직접=`yahoo-chart-v8`(providerBarTs=봉 시각), AV=`alpha-vantage-daily`. 셋 다 `quote.close`/`4. close` 사용. GAS 코드(`gas/has-history-request.gs` 130~169행)도 Yahoo `quote.close`를 가공 없이 전달.
4. `makeObservation`: 봉 날짜 == **수신 시각의 시장일**이면 `finality:'provisional'`, 아니면 `'unverified'`.
5. `mergeHistoryStore`: 같은 날짜 기존 값과 종가가 다르면
   - `provisionalSuccessor`(기존 provisional · **같은 출처** · 더 늦은 수신 · 수신 시장일 > 봉 날짜) **이고 그 날짜에 pending 충돌이 없을 때만** `provisional-successor`
   - 그 외는 `pending-review`로 **격리·누적**. 중복 판정 키 = 날짜+출처+종가+providerBarTs+상태.
   - `conflicts`는 **추가만 되고 정리(prune) 경로 없음**. successor 전이도 배열 1칸 소비.
   - `g.conflicts.length + 새 충돌 > 256` → `fail('store-bound')` → 그 지수의 **병합 전체 거절**(새 날짜 포함).
6. 저장: `v5_benchHist`(레거시, 원문 그대로) + `v5_benchHistV2`(사이드카, `legacyFingerprint`로 원문 결합). 저장 직전 두 원문 문자열 재비교(CAS 유사, 트랜잭션 아님) → setItem → 재조회 확인.

## 2. 가설별 판정

| # | 가설 | 판정 | 근거 |
|---|---|---|---|
| H1 | 미마감 당일 봉을 저장 → 재조회 시 값이 달라 충돌 | **코드상 가능 — 확정(합성)** | 시험 (a): 같은 미국 시장일 장중 2회 수신 → pending 1건. 시장일 판정이 수신 시각 기준이라 **한국 아침(미국 장 마감 후, 같은 미국 날짜)** 수신도 provisional 이고 successor 불가 (a2). 관측 `11-16 748.12→745.82`(KST 01:45 장중 → KST 07시 마감 후) 모양과 일치. 실기기 시각 기록은 미검증 |
| H1' | 장중 2회 이상이면 다음 날 정상 종가도 successor 가 막혀 영구 pending | **코드상 가능 — 확정(합성)** | (b): 장중 1회면 다음 시장일 successor 정상, 장중 2회면 pending 이 있어 successor 차단 → pending 2건. 즉 **하루에 두 번 이상 미국 장중에 앱을 열면 그 날짜는 영구 격리** |
| H2 | 출처 혼용(GAS↔Yahoo 직접↔AV)으로 같은 날 값 다름 | **코드상 가능** (기여 비율 미검증) | (c): 다음 시장일이라도 출처가 다르면 successor 불가 → pending. GAS가 8초 내 응답 실패하면 Yahoo 직접으로 넘어가 출처가 바뀐다. 실제 어느 경로로 들어왔는지는 저장된 `alternative.source` 를 봐야 함(실자료 미열람 → 미검증) |
| H2' | Yahoo 직접은 마지막 봉 시각이 바뀌면 같은 값도 중복 충돌 | **코드상 가능** | (c2): dedup 키에 providerBarTs 포함. Yahoo 일봉의 마지막 봉 timestamp 가 장중에 최근 체결 시각으로 바뀌는지는 **공급자 동작 미검증** |
| H3 | 조정주가 vs 원가격 | **현재 경로 간에는 가능성 낮음, 코드상 막는 장치 없음** | GAS·Yahoo 직접은 같은 `quote.close`(분할만 반영, 배당 미조정 — Yahoo 문서 미확인, 미검증). AV `4. close` 는 원가격. SPY·QQQ 최근 분할이 없으면 동일해야 함. 조정 기준이 다르면 (d)처럼 **과거 날짜 전체가 한 번에 충돌** → 관측(충돌 날짜가 몇 개뿐)과 모양이 다름 |
| H4 | 5월(05-14·15·18) 충돌 | **실자료 없어 미검증** | 레거시 점(`finality` 없음)과 값이 다르면 항상 pending (g2). 5월 레거시 값이 당시 장중 값이었을 가능성은 코드상 가능하나 확인 불가 |
| H5 | 256 상한 도달 시 실제 실패 | **코드상 확정(합성)** | (f): 256건까지는 읽기·차트 정상, 257번째 충돌이 생기는 병합은 **새 날짜까지 통째로 거절**. 기존 값과 같은 응답만 통과. → SPY(256)는 다음 날 새 날짜가 들어올 때 직전 날짜 값이 하나라도 다르면 **갱신이 멈춘다**. 앱 문구는 "해당 이력 확인 전 보류". 순태씨 기기에서 실제로 멈췄는지는 미검증 |
| H6 | DST(-05:00 고정) | **현 충돌의 직접 원인 아님** | `closeTimeMs` 는 `sameDayAfterClose` 선택에만 쓰이고 merge 에는 안 쓰임. 서머타임엔 실제 마감보다 1시간 늦게 판단(보수적), 조기폐장 미반영(16:00 기준, 보수적) — (e) |
| H7 | QQQ 250 / SPY 256 처럼 많이 쌓이는 이유 | **코드상 설명 가능** | 앱을 열 때마다 1회 조회, 미국 장중(KST 23:30~06:00, 서머타임 22:30~05:00)·장 마감 후 같은 미국 날짜(~KST 13:00)에 열 때마다 다른 값 1건 추가, 출처가 바뀌면 또 추가, successor 도 1칸 소비, 정리 없음 |

KS200(069500)도 같은 구조: 한국 장중(09:00~15:30 KST)에 두 번 이상 열면 그날 영구 pending. 보류충돌 18건과 모양 일치(미검증).

## 3. 저장·백업·원자성 한계 (확인 사항)

- `readBenchmarkState`: 사이드카 무효 시 레거시만 읽기 전용으로 사용 → 조회·저장 보류. 
- 원자성: localStorage 에 트랜잭션 없음. 저장 직전 원문 재비교 + 저장 후 재조회로 감지만 함(현재 설계 유지 권고).
- 백업: 256건 사이드카도 `validateStore`·`B.validateStoredValue('v5_benchHistV2')` 통과 (f). 구버전 백업엔 V2 미포함, 레거시만 복원 시 지문 불일치 → 사이드카 읽기 보류(기존 동작).

## 4. 해결 설계안 (보수적, 이번 단계 미구현)

원칙: 저장값 조용히 덮어쓰기 금지, '늦게 받은 값이 참' 금지, '차이가 작으면 덮어쓰기' 금지, 원본·감사 기록 보존.

### 4-1. 관측 계약 확장 (v3 관측, 추가 필드만)
`source`(원천 공급자) · `transport`(gas/direct/proxy명) · `priceKind`(`quote-close`/`raw-close`/`adj-close`/`unknown`) · `adjustment` · `d`(거래소 날짜) · `receivedAt` · `providerBarTs` · `finality`(`provisional`/`after-close-unverified`/`unverified`). 공급자가 확인 못 하는 값은 `unknown`, **공식 최종 종가 판정은 하지 않는다**.

### 4-2. 미확정 당일 봉 격리 (핵심, H1·H1' 해결)
- 수신 시각이 그 시장의 정규 마감(+여유 30분) **이전**이면 당일 봉은 **저장하지 않고** 메모리 표시만(차트 '오늘 장중' 점선 등). → 장중 재조회 충돌이 원천적으로 생기지 않음.
- 마감 시각: KR 15:30 Asia/Seoul, US 16:00 America/New_York — **고정 오프셋 대신 IANA 시간대로 계산**(DST 해결). 조기폐장·휴장 일정은 신뢰 출처 연결 전까지 "정규 16:00 이후" 보수 기준 유지(조기폐장일은 늦게 확정될 뿐 틀리지 않음).
- 마감 후 받은 당일 값은 `after-close-unverified` 로 저장.

### 4-3. 공급자 고정·대체 정책 (H2)
- 지수별 **주 공급자 1개 고정**(현재 GAS=Yahoo quote.close). 대체 경로는 같은 `source`+`priceKind`일 때만 동일 계열로 취급. AV(원가격)는 `priceKind` 가 다르므로 **기존 날짜 비교 대상에서 제외**, 새 날짜 추가에만(또는 사용 중지 — 순태씨 결정).
- dedup 키에서 providerBarTs 제외(날짜+source+priceKind+종가).

### 4-4. provisional-successor 전이 (명시적 검증)
- 조건: 기존이 provisional(장중 저장된 과거 자료), 새 값이 같은 source+priceKind, 새 값 수신이 **그 날짜 마감 이후**, 같은 날짜의 pending 이 **모두 같은 source 의 장중 provisional** 이면 → 마감 후 값 1개를 successor 로 선택하고 장중 pending 들은 `superseded-intraday` 로 **감사 기록에 보존**(삭제 아님).
- 서로 다른 source 의 충돌, 레거시 대비 충돌, 마감 후 값끼리 다른 경우는 계속 `pending-review`.

### 4-5. 상한 도달 시 안전 동작 (H5)
- 256 도달 시: 읽기·차트는 유지하고, 신규 시세는 무검증 반영하지 않는다(현재와 같은 거절 유지). 다만 화면에 "충돌 기록 상한 도달 · 정리 필요 · 새 날짜 반영 중지"를 **이유와 함께 명확히 표시**한다(현재는 "해당 이력 확인 전 보류"로만 보임).
- 정리: 4-4 규칙으로 `superseded-intraday` 가 된 장중 기록은 별도 **압축 감사 요약**(날짜·건수·최소/최대·출처)으로 접어서 배열에서 빼는 마이그레이션 — **순태씨 사전 승인 필요**.

### 4-6. 보존해야 할 것 / 사전 승인 항목
- 유지: `legacyFingerprint` 결합, `parseRawJSON` 원문 검사, 저장 직전 원문 비교·저장 후 재조회, `validateStore`/백업 `sidecar()` 검증, 레거시 원문 무변경.
- 사전 승인 필요: (1) 사이드카 v3 마이그레이션(기존 conflicts 재분류·압축), (2) AV 경로 처리 방침, (3) GAS 응답에 메타 추가(별도 GPT-20261117-0731 과 함께), (4) 운영 반영.

## 5. 미검증·한계

- 순태씨 기기의 실제 충돌 기록 출처(`alternative.source`)·수신 시각 분포, 5월 충돌 원인, Yahoo 일봉 마지막 봉 timestamp 장중 변경 여부, Yahoo `quote.close` 배당 조정 여부 — 모두 실자료/공식 문서 미확인.
- 순태씨 기기에서 SPY 신규 날짜 갱신이 실제로 멈췄는지는 미검증(갤럭시 '지수 자료' 상태 문구 "해당 이력 확인 전 보류" 확인으로 판별 가능).

## 6. 순태씨 결정 필요 (다음 단계)

1. 2단계 진행: 4-2(장중 당일 봉 저장 안 함 + IANA 마감 시각) + 4-3 dedup 정리 — **새 충돌 증가를 멈추는 최소 코드 변경**(기존 자료 무변경). 지피 검토 후 '올려' 필요.
2. 기존 쌓인 충돌 정리(마이그레이션)는 그 다음 별도 승인.
