STATUS: READY_FOR_REVIEW
ORDER-ID: GPT-20261117-0731 (GPT-REVIEW-price-meta-20261117-1030 CHANGES_REQUESTED 반영)
BASE: af286d2d2763294a171689907e011203ec061902 (이전 검토 HEAD) · main d8f0760(docs만) merge 포함
HEAD: 893623b6b7be1b7ab9f11d3291564efacac60507 (검토 대상, 코드·시험) · 보고는 다음 docs 커밋
REVIEW-SCOPE: CR-1~4 반영분만 — has/quote-meta-contract.js(여전히 portfolio_v5.html 미로드), tests/price-meta-contract.test.cjs(29→34건, B 관련 2건 교체 + CR 시험 5건), live-data-pins addedRuntimeFiles 해시 1줄. portfolio_v5.html·price-trust*·quote-model·GAS·저장 자료 변경 0.
UPDATED: 2026-11-17 11:xx KST (정각 실행)

## CR 반영 (지피 1030) — v1.1
| CR | 변경 | 재현 시험 |
|---|---|---|
| CR-1 B 증거 없는 해제 | `signalPolicy`는 문자열 `'B'`를 항상 보류. 같은 계약 인스턴스의 `crossCheck`가 발급·동결·WeakSet 등록한 증거 객체만 인정. `parseResponse`의 A 시세도 동결·발급 등록 → 호출자가 만든 가짜 A로 대조 불가 | `'B'`+관문 4개 true → hold, 모양만 같은 위조 증거 → hold, 다른 인스턴스 증거 → hold, 가짜 A → C, 증거·시세 변경 시 TypeError |
| CR-2 이름 ≠ 독립 | `source`는 표시용. 독립성은 앱 코드가 넘기는 `ctx.route`(응답 아님) + 앱 내부 신뢰 설정 `createContract({routes:{id:{approved:true, upstream}}})`의 원천 계보로만. **기본 인스턴스는 승인 경로 0개 → 운영에서 B 불가.** 응답 안 `route/upstream/lineage`는 무시(플래그) | 같은 경로·이름만 다름 → C, 다른 경로·다른 이름·같은 원천(대소문자 무시) 재포장 → C, 미승인 경로 → C, 응답 자가 선언 경로 → C, 형식 틀린 설정 → 승인 0개 |
| CR-3 종가 시간·거래일 | `regular-close`는 거래소 현지 시각(Intl 시간대, DST 자동) 표준 마감(US 16:00 ET, KR 15:30 KST) 이전이면 C. `crossCheck`는 검증된 `closeCalendar(market, date)`가 없으면(기본) C, 휴장·형식 오류·예외·달력 마감 전도 C. 수신시각은 근거로 안 씀 | 11:00 ET 위장 → C, 11월 20:00Z(15:00 EST) C/21:00Z A, 3-6 EST 20:30Z C/21:05Z A, 3-9 EDT 19:30Z C/20:05Z A, KR 11:00 C/15:30 A, 달력 없음·휴장·예외·17:00 마감·'4pm' → C |
| CR-4 허용오차 | 고정 정책값 0.5%(설계 제안, 공식 검증 아님) 이하 유한 비음수만. 그 외(Infinity·NaN·음수·1·0.0051·문자열·null) 보류, 옵션 형식 오류 보류 | 0.5% 정확히 B, 0.51% C, 더 엄격한 0.1%는 적용 |

- 시험: 이 파일 34/34. 전체 2283 중 2281 통과/0 실패/2 skip(기존 skip), `tools/scan-secrets` 발견 0. 화면 변경 없음 → Playwright 미실행.
- 미검증: 미국·한국 휴장·조기폐장 공식 달력 미연결(그래서 B 금지 유지), 표준 마감 시각은 일반 지식(공식 문서 재확인 전 미검증), 0.5%는 설계 제안. 실제 GAS·두 번째 공급자 접속 없음. 지피 독립 재현 전.
- 한계(정직): 조기폐장일의 진짜 종가(예: 13:00)는 현재 C로 떨어진다 — fail-closed 의도. 신뢰 설정은 앱 코드에서만 정해야 하며, 이를 바꾸는 코드는 별도 검토·순태씨 승인 대상.
- 순태씨 결정 필요: 없음(설계 단계). 다음: 지피 재검토 → 2단계(운영 연결)는 별도 승인.

---
(이하 1단계 최초 보고, HEAD af286d2 기준 — 5·7절 등 B 관련 설명은 위 v1.1이 우선)

# 가격 신뢰도 — 종목별 출처·기준시각 계약 v1 설계 (GPT-20261117-0731)

## 0. 요약
- GAS 응답에 예약 키 `__quoteMeta` 를 **추가**하는 하위 호환 계약 v1을 정의하고, 이를 검증하는 순수 함수 모듈과 합성 시험 29건을 만들었다(운영 앱은 아직 불러오지 않음).
- 상태 4종: **U**(메타 없음, 현행) · **A**(메타가 붙은 단일 출처, 독립 검증 아님) · **B**(앱이 서로 다른 두 공급자를 직접 대조해 일치) · **C**(근거 불충분/불일치/오래됨). **A만으로는 어떤 경우에도 판단 보류를 풀지 않는다.** B도 재무·본질가치·공시/뉴스·반론 관문이 모두 정확히 `true`여야 '검토 후보'이며 최종 결정은 순태씨.
- 현행 코드 반례 3건을 시험으로 고정했다: ① `price-trust.describe` manual → `signalHold=false` ② `describe` 가 `verification:'independent-verified'` 문자열 자가 선언만으로 보류 해제(공급자 이름이 GAS여도) ③ `quote-model.normalize` 가 공급자 응답의 `verification` 을 그대로 통과 → `usableForSignals` ok. **현재 운영 GAS 경로는 이 문자열을 만들지 않으므로 실제 앱이 매수 추천까지 가는 증거는 없음**(시험으로 확인). 다만 GAS 메타를 붙이는 순간 ③이 열릴 수 있어 2단계 전에 막아야 한다(5절).

## 1. 메타데이터 소비 지점 (정적 추적, main ced106c 기준)
| 위치 | 현재 하는 일 | 메타 소비 | 비고 |
|---|---|---|---|
| portfolio_v5.html `fetchUS`/`fetchKR`(약 7094~7144행) | `gasUrl?tickers=..&market=..&callback=` JSONP | 없음 | 응답 객체를 `acceptSnapshotQuotes` 로 전달 |
| `acceptSnapshotQuotes`(약 7060행) | `data[ticker]` 숫자(0<p≤1e12)만 채택 | `quoteMeta[prefix+t]=Date.now()` | **앱 수신시각**만. 공급자 asOf 아님 |
| `has/snapshot-policy.js` 57·76행 | 자동 스냅샷 증거 | `quoteMeta` 수신시각 | 수신시각은 가격 확정 근거가 아님(기존 주석과 일치) |
| `has/advisor-panel.js` 19행 | AI 참모에 `v5_quote_meta` 로 노출 | 수신시각 JSON | '얼마나 최근 받았나' 표시 용도 |
| `has/price-trust-ui.js` 14행 | 상단 띠 | `sourceNotice('gas-jsonp')` 고정 | 응답 메타 전달 경로 없음 → 항상 '미확인' |
| `has/price-trust.js` `describe`/`gateSignals` | 표시·관문 | `verification` 문자열 | `gateSignals` 는 운영 앱에서 호출되지 않음(시험만) |
| `has/quote-model.js` `normalize`/`usableForSignals` | 표준 시세·신호 사용 가능 판정 | `verification==='independent-verified'` | 공급자 자가 선언을 통과시킴(반례 ③) |
| `has/watch-engine.js` `quoteGate` | 감시 신호 관문 | `usableForSignals` | ③의 영향을 받는 하위 소비자 |
| `has/decision-brief.js` `verify` | 오늘의 투자 판단 | 의견의 근거·출처·기준시각 | 가격 메타 직접 소비 없음 |
| 지수 이력(`benchmark-history-policy.js`) | SPY 등 | 자체 source/receivedAt | GPT-20261117-0730 별도. 이번 범위 아님(교차 참조만) |

용어 고정: `source`=원천 가격 공급자, `transport`=사용자 GAS(출처 아님), `asOf`=공급자가 밝힌 가격 관측 시각, `receivedAt`=GAS 서버 수신시각, `appReceivedAt`=앱 수신시각(asOf로 승격 금지).

## 2. 계약 v1 (하위 호환 JSON, 값·공급자는 가상 예시)
```json
{
  "AAPL": 100.0,
  "MSFT": 200.0,
  "__quoteMeta": {
    "schema": "has-quote-meta-v1",
    "quotes": {
      "AAPL": {
        "market": "US", "currency": "USD", "source": "<실제-공급자-식별자 또는 생략>",
        "asOf": "2026-11-16T16:00:00-05:00", "marketDate": "2026-11-16",
        "kind": "regular-close", "adjusted": "none",
        "receivedAt": "2026-11-17T00:00:00Z"
      }
    }
  }
}
```
엄격 스키마(`has/quote-meta-contract.js` `checkQuote`):
- 가격은 지금과 같은 평면 키. `__` 로 시작하는 키는 종목이 될 수 없음(예약). 알 수 없는 `__*` 키는 무시하고 이슈 기록.
- `schema` 정확히 `has-quote-meta-v1`, `quotes` 일반 객체, 종목 수 ≤ 200. 어긋나면 **메타 전체 무시 → U(현행과 동일)**. 가격 처리는 절대 영향받지 않음.
- 1:1 결합: 요청 종목이면서 숫자 가격이 있는 종목만 메타를 붙임. 가격 없는 메타는 버림. 메타 없는 종목은 U(부분 메타 허용).
- `market` = 요청 시장, `currency` US=USD/KR=KRW, `source` 1~64자이며 GAS·앱 경로 이름(gas, gas-jsonp, apps-script, user-gas, manual, unknown, synthetic 등) 금지.
- `asOf` 오프셋 필수 ISO-8601, `marketDate` = asOf를 거래소 IANA 시간대(America/New_York, Asia/Seoul)로 바꾼 날짜와 같아야 함.
- `kind` ∈ regular-close | delayed | intraday, `adjusted` ∈ none | split | split+dividend. 모르면 필드를 빼거나 null → C(근거 부족). **허위 값을 채우지 않는다.**
- `receivedAt`(선택): 형식·미래 아님·asOf보다 이전 아님.
- `verification`/`verified`/`independent` 필드는 **무시**(flag `self-declared-verification-ignored`).
- JSONP 콜백 보호는 현행 유지(콜백 이름은 앱이 생성, 메타는 데이터 객체 안에만 있음). 크기: 종목당 문자열 ≤ 64자, 200종목 상한.

## 3. 검증·보류 매트릭스
| 조건 | 상태 | 신호 |
|---|---|---|
| 메타 없음 / 스키마 불일치 / 상한 초과 | U | 보류 |
| 모든 필드 정상, 단일 공급자 | A | **보류**(독립 검증 아님) |
| 시장·통화 불일치, 공급자 없음, GAS를 출처로 표기 | C | 보류 |
| 오프셋 없는 시각, 시장일 불일치, 미래 시각, GAS 수신<asOf | C | 보류 |
| 가격 종류·조정 여부 미확인 | C | 보류 |
| 종가 4일 초과 경과, 장중·지연 24시간 초과 | C | 보류 |
| 주말 시장일(휴장 의심), 기업행위 의심 | C | 보류 |
| 장중(intraday) 정상 | A + flag intraday | 보류, 대조 불가 |
| 한 응답에 공급자 혼용 | A + flag mixed-source | 보류 |
| 서로 다른 두 공급자 A, 같은 시장·종목·시장일·정규장 종가·조정·통화, 차이 ≤0.5% | **B** | 재무·본질가치·공시·반론 관문 모두 true일 때만 '검토 후보' |
| 같은 공급자(대소문자 무시)·조정 기준 다름·지연/장중·차이 >0.5% | C(충돌) | 보류 |

휴장 판정은 주말만 한다. 공휴일·조기폐장 달력은 **미검증**(달력 원본 미확보) — 2단계 과제.

## 4. UI 상태 표(한 줄 띠, `band()`)
| 우선순위 | 키 | 표시 | 수준 |
|---|---|---|---|
| 1 | fetch-failed | ⚠ 조회 실패 n종목 — 판단 보류 | alert |
| 2 | mismatch | ⚠ 종목·시장·통화 불일치 n종목 — 판단 보류 | alert |
| 3 | conflict | ⚠ 가격 충돌 n종목 — 판단 보류 | alert |
| 4 | adjusted-change | ⚠ 조정 여부 변경 n종목 — 판단 보류 | alert |
| 5 | stale | ⚠ 기준시각 경과 n종목 — 판단 보류 | alert |
| 6 | future | ⚠ 미래 시각 n종목 — 판단 보류 | alert |
| 그 외 | neutral | 가격 출처: 독립 대조 b · 출처 표시(단일) a · 미확인 u · 근거 부족 c | 중립(숨기지 않음) |
'검증 완료'·'실시간'·'공식' 문구는 만들지 않음(시험 확인). 시장일 불일치는 '근거 부족'으로 중립 집계. 갤럭시 360/390/430 시험 항목(2단계 화면 연결 시): 한 줄 유지·줄바꿈 시 12px 이상·#333 이상 대비, alert 색이 중립과 구분, '자세히 보기'에 종목별 source/asOf/kind/adjusted 표, 투자 > 현황에서만 표시(현행 규칙 유지). **이번 단계는 화면 변경 없음 → Playwright 미실행.**

## 5. 현행 우회 경로와 fail-closed 변경안(문서만, 이번 단계 미적용)
1. `price-trust.describe`: `manual` 도 `signalHold=true` 로(표시는 '수동 입력 — 신호 사용 안 함'). `independent-verified` 분기는 문자열이 아니라 앱이 만든 대조 증거 객체(`crossCheck` 결과 state B, 두 source, marketDate)가 있을 때만.
2. `quote-model.normalize`: 공급자 응답의 `verification` 을 무시하고 항상 `unverified` 로 정규화. `independent-verified` 는 앱 내부 대조 함수만 부여.
3. `price-trust-ui`: `sourceNotice('gas-jsonp')` 고정 대신 `parseResponse` 결과를 받아 `band()` 로 표시. 메타 없으면 지금과 같은 '미확인'.
4. `acceptSnapshotQuotes`: 가격 채택 규칙 그대로, 메타는 별도 메모리 객체(저장 안 함)에 보관. `quoteMeta`(앱 수신시각)는 이름 그대로 두고 asOf와 섞지 않음.
변경 시 위 반례 시험 3건의 기대값을 '보류'로 바꾸고, watch-engine·valuation-integration 하위 시험을 함께 갱신해야 함.

## 6. GAS 함수 변경점(실제 수정·배포는 순태씨 승인 후)
- 일반 시세 doGet(사용자 GAS, 저장소에 원본 없음 — **미검증**): 응답 객체에 `__quoteMeta` 추가만. 기존 평면 가격 키·콜백 처리 유지.
- 공급자가 실제로 주는 값만 채움: 예) 공급자 응답의 거래 시각·통화·시장 시간대가 있으면 asOf/marketDate/currency, 없으면 필드 생략. GAS 실행 시각은 `receivedAt` 에만.
- 저장소의 `gas/*.gs` 3개(history-request·sec-fundamental·universe-screen)는 일반 시세 경로가 아님 → 변경 없음. 어떤 공급자를 쓰는지(현행 GAS 내부)는 클로가 볼 수 없어 **미검증**.

## 7. 시험(정확한 명령과 실제 결과)
- `node --require ./tests/lib/no-network.cjs --test tests/price-meta-contract.test.cjs` → 29 통과 / 0 실패.
- 전체: `NODE_PATH=<jsdom 별도 폴더>/node_modules node --require ./tests/lib/no-network.cjs --test tests/*.test.cjs` → **2278 중 2276 통과 / 0 실패 / 2 skip**.
  - 첫 실행 2건 실패(daily-repair-protection 2건: 보호 경로 has/ 신규 파일 미등록) → `tests/lib/live-data-pins.json` `addedRuntimeFiles` 에 `has/quote-meta-contract.js` sha256 등록 후 해소.
- `node tools/scan-secrets.cjs` → findings 0.
- 화면 변경 없음 → Playwright 미실행.

## 8. 미검증·한계
- 실제 GAS 시세 공급자·필드 제공 여부, 실제 종가 시각: 미검증(클로는 사용자 GAS 원본·실제 응답에 접근하지 않음).
- 공휴일·조기폐장 달력: 미구현(주말만 판정).
- 0.5% 대조 허용 오차는 설계 제안값(근거: 정규장 종가끼리 같은 날·같은 조정 기준이면 차이가 작아야 한다는 보수적 가정) — 지피·순태씨 확인 필요.
- 독립 2차 공급자가 아직 없음 → 현재로서는 B 상태가 실제로 나올 수 없음(모든 신호 보류 유지가 정상).

## 9. 순태씨 승인 단계
1. (지금) 이 설계·합성 시험 → 지피 검토.
2. 앱 쪽 fail-closed 변경(5절 1·2) — 앱 코드 변경, '올려' 필요.
3. GAS 일반 시세에 `__quoteMeta` 추가 — 실제 GAS 수정·배포 승인 필요(순태씨가 Apps Script에서 붙여넣기).
4. 띠 화면 연결(5절 3) — 갤럭시 확인 후 '올려'.
5. 독립 2차 공급자 연결 — 비용·키 여부에 따라 별도 승인.
