STATUS: READY_FOR_REVIEW
ORDER-ID: GPT-20261121-0911 (GPT-REVIEW-buy-review-gate-20261121-1330 CHANGES_REQUESTED CR-11 반영, r5)
BASE: 73ecb83b42880ac5bfdd1ba5d930d8085d7f4eef (지피가 검토한 r4)
HEAD: 5c0346d27cfe63c4c4fedb3b46d79a3696a4c886
BRANCH: work/claude-buy-review-gate-20261121
REVIEW-SCOPE: 73ecb83..5c0346d (중간 merge 49e1685는 main 문서뿐) — has/buy-review-gate.js(CR-11 발급 결과 깊은 불변 사본·전체 지문 대조·verify 공개·알림 marginPct 발급값), has/buy-review-lab.js(표시 경로 verify 계약), tests/buy-review-gate.test.cjs(CR-9 시험 갱신 + CR-11 시험 2건), tests/lib/live-data-pins.json 해시 2건. 운영 앱 portfolio_v5.html·fixtures·GAS 변경 없음.
UPDATED: 2026-11-21 14:2x KST (정각 실행)

## r5 — 지피 1330 CR-11 대응

| CR | 지적 | 대응 | 음성시험 |
|---|---|---|---|
| CR-11 | `issued()`가 상위 5필드만 비교 → `valuation.marginPct`·`gates`·`reasons` 등 중첩 변조가 후보·알림·화면에 그대로 전달 | ① `evaluate()`는 결과를 입력과 분리된 **깊은 사본으로 만들고 모든 단계 `Object.freeze`** 후 그 사본을 발급(입력 객체는 freeze하지 않음 — "입력 객체를 바꾸지 않는다" 유지). ② 발급 시 키 정렬 전체 지문(`fingerprint`, NaN·undefined 구분)을 WeakMap 사본에 저장, `issued()`는 상위 5필드 + **깊은 불변 여부 + 전체 지문 일치**까지 확인. ③ `notifyPlan.items[].marginPct`는 결과 객체가 아니라 발급 사본(`ISSUED.get(r).marginPct`)에서 읽음. ④ `verify(r)` 공개, 실험실은 `G.verify(r)` 통과 결과만 카드 표시(실패 시 내용 비표시 안내). | 발급 결과에 14종 변조(marginPct/marginRaw/band/gates[0].status/reasons 교체·push·length=0/riskFlags push/evidenceOldest/valuation·gates 하위 객체 교체/키 추가/defineProperty/delete) → 모두 TypeError로 차단, 원래 값 유지, shortlist·notifyPlan의 marginPct가 발급값. 불변화를 푼 깊은 복사본에 marginPct·gate·reasons 변조 또는 무변조 → verify false·후보 0·알림 0. JSON 복사·freeze된 위조 객체·{} → 0. 입력 객체 미동결 확인. 합성 정상 경로 유지. 기존 CR-9 시험은 변조가 '차단'되는지 + 복사본 변조 제외로 갱신(대입이 strict 모드에서 throw하므로). |

### r5 시험 결과 (클로 실행)
- `node --require ./tests/lib/no-network.cjs --test tests/*.test.cjs`(jsdom NODE_PATH): 2312 중 **2310 통과 / 0 실패 / 2 skip**(r4 2310→+2). tests/buy-review-gate.test.cjs 28/28.
- `node tools/scan-secrets.cjs`: findings 0.
- Playwright Chromium(Python) 360/390/430, has/buy-review-lab.html, 외부 요청 차단: 가로 스크롤 0, 최소 글자 12px, 오늘의 후보 3건, 목록 7건, '검증 실패 결과' 표시 0, 페이지 오류 0.
- 실제 데이터·API·GAS·계좌 접근 0.

### r5 미완료·미검증
- 발급 결과는 불변이므로 호출 쪽에서 결과를 고쳐 쓰는 코드는 앞으로 사본을 만들어야 하며, 그 사본은 후보·알림·표시에서 제외됨(의도). 저장·재로딩 결과는 재평가 필요(변동 없음).
- 실제 자료 잠금·확신종목 신뢰 경로 해제 조건·순태씨 결정 사항은 r4와 동일.

---

STATUS: READY_FOR_REVIEW
ORDER-ID: GPT-20261121-0911 (GPT-REVIEW-buy-review-gate-20261121-1228 CHANGES_REQUESTED CR-8~10 반영, r4)
BASE: 26b90befa4dd1ad40cdf67808f1a1f48fd1f797d (지피가 검토한 r3)
HEAD: 73ecb83b42880ac5bfdd1ba5d930d8085d7f4eef
BRANCH: work/claude-buy-review-gate-20261121
REVIEW-SCOPE: 26b90be..73ecb83 (중간 merge 8ea43ba는 main 문서뿐) — has/buy-review-gate.js(CR-8 원시값 경계 판정, CR-9 엔진 발급 결과만 후보·알림, CR-10 확신종목 25% 합성 한정), tests/buy-review-gate.test.cjs(+3 시험), tests/lib/live-data-pins.json 해시 1건. 운영 앱 portfolio_v5.html·실험실 화면·fixtures 변경 없음.
UPDATED: 2026-11-21 13:2x KST (정각 실행)

## r4 — 지피 1228 CR 대응표

| CR | 지적 | 대응 | 음성시험 |
|---|---|---|---|
| CR-8 | 1자리 반올림값으로 구간·D 판정 → 19.96%가 20%, 29.96%가 30%로 승급 | `valuation()`이 `marginRaw`(미반올림)로 구간·경계 충돌(입력값도 `declaredMarginRaw`)을 판정, `evaluate()` D FAIL도 원시값, 후보 정렬도 원시값. `marginPct`는 표시 전용(`marginUse` 명시). 부동소수 오차(1−64/80=0.19999999999999996)만 `FLOAT_EPS=1e-9`%p로 흡수 — 표시 반올림 폭(0.05%p)보다 수천만 배 작아 19.96%를 끌어올리지 못함. 구간 정책값(10/20/30/40)은 변경·확정 안 함. | 19.94/19.96/20.00 → 관찰/관찰/조건부, 29.94/29.96/30.00 → 조건부/조건부/HIGH, 39.94/39.96/40.00 → HIGH/HIGH/가치함정 보류. 지피 반례 64.032(표시 20.0) D FAIL·매수 검토 아님, 56.032(표시 30.0) HIGH 아님. 재계산 19.94·입력 80.1(20.04%) → 경계 충돌 보류. 표시 같은 30.0%인 29.96/29.97 정렬이 원시값 순. |
| CR-9 | 공개 `shortlist`/`notifyPlan`이 `r.buyReview` 자기선언만 확인 → 평가 안 거친 실자료 객체도 후보 | 모듈 내부 `WeakMap ISSUED`에 `evaluate()` 발급 당시 판정 사본(state·buyReview·synthetic·market·ticker·marginRaw) 보관. `shortlist`는 ① 발급 결과일 것 ② 현재 값이 사본과 같을 것(사후 변조 거부) ③ 사본 기준 매수 검토 상태 ④ `REAL_DATA_LOCK` 하에서 사본 synthetic === true 일 때만 통과. 정렬은 사본 원시값. `notifyPlan`은 같은 `shortlist`만 쓰고, 원장 하향 기록도 발급 결과만 반영. 결과 직렬화(JSON) 후 재사용은 재평가 필요(의도). | 지피 반례 객체(synthetic:false·state 조건부·buyReview:true) → 후보·알림 0·원장 {}. synthetic:true 위조, 얕은 복사, JSON 왕복, null/숫자 → 0. 관찰 결과를 HIGH로 변조, synthetic 뒤집기, 티커 바꾸기 → 0. 표시 marginPct 99로 부풀려도 정렬은 원시값. 엔진 발급 synthetic:false/누락 → 0. 위조 객체로 기존 원장 하향 불가. 합성 정상 경로·실험실 3종목 유지. |
| CR-10 | `convictionList.designatedBy:'user'`는 호출자 자기기재인데 25% 개방 | `CONVICTION_TRUST='no-trusted-path'` 공개 상수 + 코드 주석에 한계 명시. `synthetic !== true`면 목록 내용과 무관하게 항상 일반 10%(`convictionSource:'untrusted'`, 안내 '확신종목 지정 출처 미검증(호출자 기재는 순태씨 승인 아님, 신뢰 경로 없음)'). 합성에서만 기존 목록 대조로 25%(`convictionSource:'synthetic-only'`, 안내 '합성 예제 한정 25%'). 실제 투자기록 접근·목록 동기화 없음. | 실제 자료 + confirmed·user·같은 계좌·종목 포함 목록·비중 20% → cap 10·blocked·untrusted. synthetic 누락 + boolean → 10. 합성 목록 → 25·synthetic-only. 소스에 CR-10·자기기재 명시 확인. |

### r4 시험 결과 (클로 실행)
- `node --require ./tests/lib/no-network.cjs --test tests/*.test.cjs`(jsdom NODE_PATH): 2310 중 **2308 통과 / 0 실패 / 2 skip**(r3 2305→+3). tests/buy-review-gate.test.cjs 26/26. 기존 시험 수정 없음.
- `node tools/scan-secrets.cjs`: findings 0.
- Playwright Chromium 360/390/430(tests/buy-review-mobile.cjs, 외부 요청 차단): 가로 스크롤 0, 최소 글자 12px, 오늘의 후보 3건 유지.
- 실제 데이터·API·GAS·계좌 접근 0.

### r4 미완료·미검증
- 후보·알림은 같은 실행 안의 엔진 결과 객체만 받으므로, 앞으로 저장된 결과를 다시 불러와 후보를 만들려면 재평가가 필요(서명 등은 미구현).
- 실제 자료 잠금·확신종목 신뢰 경로 해제 조건 = 신뢰 G0/SEC/DART 수집·검증 단계 + 확신종목 목록 신뢰 발급·보관 경로 + 지피 검토 + 순태씨 별도 승인.
- `FLOAT_EPS`·VAL_RANGE·허용오차·기한은 미검증 공학 값.
- 순태씨 결정 필요(변동 없음): 비상현금 하한 금액·통화, 안전마진 구간 초기 정책 채택·업종별 조정, 확신종목 실제 지정의 신뢰 경로.

---

## (이전) r3
STATUS(r3 당시): READY_FOR_REVIEW
ORDER-ID: GPT-20261121-0911 (GPT-REVIEW-buy-review-gate-20261121-1128 CHANGES_REQUESTED CR-5~7 반영, r3)
BASE: 74a38bede73be4438f061ed62cb17cf0e92dc600 (지피가 검토한 r2)
HEAD: 26b90befa4dd1ad40cdf67808f1a1f48fd1f797d
BRANCH: work/claude-buy-review-gate-20261121
REVIEW-SCOPE: 74a38be..26b90be (중간 merge는 main 문서뿐) — has/buy-review-gate.js(CR-5 재계산 안전마진·경계 충돌 보류, CR-6 실제 자료 잠금·신뢰 등록부·producedBy 필수, CR-7 확신종목 목록 대조·비중 범위·비중 계좌 범위), has/buy-review-fixtures.js(weightScope·convictionList 합성 예시), tests/buy-review-gate.test.cjs(+3 시험, 기존 2건 계약 변경 반영), tests/lib/live-data-pins.json 해시 2건. 운영 앱 portfolio_v5.html·실험실 화면 코드 변경 없음.
UPDATED: 2026-11-21 12:2x KST (정각 실행)

## r3 — 지피 1128 CR 대응표

| CR | 지적 | 대응 | 음성시험 |
|---|---|---|---|
| CR-5 | 입력 `valuePerShare`가 5% 허용오차 안에서 안전마진 분모로 쓰여 40/30/20% 경계 우회 | `valuation()`이 세 시나리오 모두 **엔진 재계산값**(`valueBasis:'engine-recomputed'`)으로 보수/기준/낙관·순서·안전마진·구간·후보 정렬을 계산. 입력값은 `declared{…, use:'mismatch-check-only'}`로만 보존. 추가로 입력값 기준 구간이 재계산 기준 구간과 다르면 `status:'boundary-conflict'` → D=UNKNOWN '안전마진 경계 충돌' → 판단 보류(더 보수적). | 지피 반례(재계산 80·종가 48·입력 76.5) → 안전마진 40%·HIGH 아님·D UNKNOWN. 40/30/20% 경계 × 입력 76.2~84(±5% 이내) 18조합: 재계산 구간 유지 또는 경계 충돌 보류만 발생. 39.9%를 입력 부풀림으로 40% 넘김 → 보류. 19.9%를 20%로 → 매수 검토 아님. 후보 정렬이 재계산 안전마진 기준. |
| CR-6 | `verified`·임의 해시·검증자 문자열로 통과, `producedBy` 선택, 실제 자료 일괄 잠금 없음 | ① `REAL_DATA_LOCK=true`: `synthetic !== true`(false·누락·문자열 'true' 포함)이면 최종 상태에서 매수 검토 두 상태를 **무조건** 판단 보류로 내림('실제 자료 잠금: …순태씨 별도 승인 전…'). ② 신뢰 계약 `TRUST`(동결): 생성자·검증자·시세 공급자는 등록 식별자 → 원천(root) 매핑만 인정, 검증자·생성자 같은 root·공급자 같은 root 별칭은 '독립 아님'. **real 등록부는 비어 있음** — G0/SEC/DART 신뢰 수집·검증 단계와 순태씨 승인 후에만 채울 수 있음(코드 변경·재검토 필요). ③ `producedBy` 누락 = 증빙 미검증. | synthetic:false + 모든 증빙 sec.gov URL·문서번호·임의 해시 'b'×64·검증자 'independent-auditor'·생성자 'edgar-fetcher'·공급자 'vendor-x'/'vendor-x-mirror' → buyReview false·판단 보류. synthetic 누락·'true' 문자열 → false. producedBy 누락 → 게이트 A 미검증. 미등록 검증자·미등록 공급자 별칭(SYNTHETIC-9) → 차단. 합성 정상 경로 유지(조건부). sec.gov 형식 단일 증빙은 이제 '신뢰 등록 없음(실제 자료 잠금)' 사유만 남음. |
| CR-7 | `conviction===true` 하나로 25%, 비중 범위·계좌 연결 미검사 | `ctx.conviction` boolean은 무시(표시만 있으면 '지정 목록 없음: 일반 10%' 안내). 25%는 `convictionList{status:'confirmed', designatedBy:'user', asOf ≤30일·미래 금지, accountScope = 현금 계좌 범위(집합 동일), items[] market+ticker 일치}`일 때만. 그 외 10%. `weightPct` 0~100 밖 → blocked, `weightScope`가 현금 계좌 범위와 집합 동일하지 않으면 cap=unknown(다른 계좌 비중 혼용 금지). | boolean 반례(20%·conviction:true) → cap 10·blocked. 목록에 없음·다른 시장·draft·AI 지정·오래됨·미래·다른 계좌 → 10%·blocked. 비중 −1·101·150 → blocked. 비중 계좌 다름·없음·더 넓음 → unknown. 판단 상태는 유지(조건부), 수량·주문 null. |

### r3 시험 결과 (클로 실행)
- `node --require ./tests/lib/no-network.cjs --test tests/*.test.cjs`: 2307 중 **2305 통과 / 0 실패 / 2 skip**(r2 2304→+3). tests/buy-review-gate.test.cjs 23/23.
- 기존 시험 2건 계약 변경 반영: ① 확신종목 25% 시험은 boolean 대신 합성 `convictionList` 사용 ② sec.gov 형식 증빙은 '빈 사유' 대신 '신뢰 등록 없음(실제 자료 잠금)' 사유만 남는지 확인.
- `node tools/scan-secrets.cjs`: findings 0.
- Playwright Chromium 360/390/430(tests/buy-review-mobile.cjs, 외부 요청 차단): 가로 스크롤 0, 최소 글자 12px, 오늘의 후보 3건 유지.
- 실제 데이터·API·GAS·계좌 접근 0.

### r3 미완료·미검증
- 실제 자료는 이제 코드상 매수 검토 상태가 될 수 없음(잠금). 잠금 해제 조건 = 신뢰된 G0 시세·SEC/DART 원문 수집·독립 검증 단계 구현 + real 등록부 채움 + 지피 검토 + 순태씨 별도 승인.
- 경계 충돌 보류는 입력값이 재계산과 5% 이내로 달라도 구간이 갈리면 보류하므로, 경계 근처 종목이 더 자주 '판단 보류'가 될 수 있음(의도된 보수성).
- 확신종목 목록 30일 유효기간·VAL_RANGE·허용오차·현금 1일은 미검증 공학 값.
- 순태씨 결정 필요(변동 없음): 비상현금 하한 금액·통화, 안전마진 구간 초기 정책 채택·업종별 조정, 확신종목 목록 실제 지정(향후).

---

# (r2 보고 — 74a38be 기준)

STATUS(r2 당시): READY_FOR_REVIEW
ORDER-ID: GPT-20261121-0911 (GPT-REVIEW-buy-review-gate-20261121-1031 CHANGES_REQUESTED CR-1~4 반영, r2)
BASE: a2a4c791902a07d02e4da73993f10ed67f49b22a (지피가 검토한 r1)
HEAD: 74a38bede73be4438f061ed62cb17cf0e92dc600
BRANCH: work/claude-buy-review-gate-20261121
REVIEW-SCOPE: a2a4c79..74a38be (중간 ab6d429는 main 문서 merge뿐) — has/buy-review-gate.js(계약 v2: 교차 원시시세 대조·종가 확정·조정 기준, 가정 범위·엔진 재계산·산출 계보, evidence.v2 증빙 계약·조사 완료/검증 분리, 현금 신선도·통화·계좌 범위·하한 통화, 후보 중복 제거), has/buy-review-fixtures.js, has/buy-review-lab.js, tests/buy-review-gate.test.cjs(+5 시험), tests/lib/live-data-pins.json 해시 3건. 운영 앱 portfolio_v5.html 변경 없음.
UPDATED: 2026-11-21 11:2x KST (정각 실행)

## r2 — 지피 1031 CR 대응표

| CR | 지적 | 대응(엔진 has/buy-review-gate.js) | 음성시험 |
|---|---|---|---|
| CR-1 | `crossCheck.status='match'`·`sources` 자기선언 통과, 확정 종가·분할조정 미검증 | 호출자 status/diffPct 무시. `crossCheck.quotes[]` 원시 시세 2건 이상을 엔진이 직접 대조: 공급자 식별 정규화(대소문자·공백) 후 중복 금지, 대표 종가 출처가 공급자 목록에 포함, 각 시세의 거래소·통화·`regular-close`+`sessionStatus:closed`·기준일·조정(`adjustment`+`adjustmentAsOf`) 동일, 수집 시각 필수, 종가·52주 고점 각각 상대차 ≤1%(고점 차이는 '분할 전후 혼용 의심'). 대표 가격에 `sessionStatus:closed`·`closeConfirmedAt`(기준일 이후·미래 금지), 고점의 조정 기준(`high52wAdjustment`/`AsOf`) 동일, `pendingCorporateAction` 시 차단. | 중복 공급자·대소문자 위장·1건뿐·대표 출처 누락·통화·거래소·기준일·장중·장중 세션·조정 기준·수집 시각 누락·확정 시각 없음/이전/미래·분할 전 고점 10배·고점 조정 불일치·미반영 기업행사·기존 v1 match 선언 → 모두 fail-closed 판단 보류. 1% 이내 차이는 통과. |
| CR-2 | 비경제적 가정·근거 없는 `valuePerShare`로 D PASS | 방법을 엔진이 재계산 가능한 `fcf-perpetuity`로 한정하고 주당가치 = ((정상화FCF−주식보상)×(1+g)/(r−g) − 순부채)×금액단위 ÷ (주식수×주식단위×(1+희석))로 재계산, 입력값과 5% 넘게 다르면 미산정. 범위 VAL_RANGE(`unverified-sanity-range`): 할인율 4~20%, 장기성장 −10~6%, r−g ≥1%p, 희석 0~20%, 주식보상 ≥0, (FCF−주식보상)>0, 시나리오 간 주식수 동일. `units`(통화·moneyScale·shareScale) 필수. 산출 계보 `lineage.{normalizedFcf,stockCompensation,netDebt,shares}` 각각 공시(filing) 증빙(evidence.v2) 필수. 기존 `verification:'independent-verified'` 문자열은 더 이상 쓰지 않음. | 할인율 −20·성장 500·r−g 0.5·희석 −10·주식보상 음수·주식수 다름·단위 없음/통화 다름/0/1000배·자유입력 평가액·재계산 불가 방법·계보 없음·자체 메모 계보·뉴스 계보·다른 종목 계보 → 미산정, D=UNKNOWN. 정상 3시나리오 재계산값 기록 확인. |
| CR-3 | `done:true`+임의 문자열로 4단계 조사 통과, `independent-verified` 문자열 | evidence.v2 계약: `kind`(filing/news/consensus/community/analysis), 대상 `market`·`ticker` 일치, `publishedAt`≤`retrievedAt`(시각)≤판정시각, 기간 내, https `url`, 공시는 공식 도메인(US sec.gov / KR dart.fss.or.kr·kind.krx.co.kr — 도메인 문자열만 비교, 접속 없음)·문서번호 형식(SEC accession / DART 14자리), `verification`={status:verified, verifier≠생성자·≠self/claude/gpt 등, contentSha256 64hex, checkedAt≥retrievedAt}. 5게이트는 게이트마다 공시 증빙 최소 1건. 조사 결과에 `claimed`(완료 주장)와 `verified`(근거 검증)를 분리, 사유 표시 '(완료 주장, 근거 미검증)'. `example.invalid` 합성 출처는 `synthetic:true` 입력에서만 허용 — 실제 판단에선 차단. | 지피 예시 `{done:true,source:'내 메모',...}`·다른 종목/시장 공시·뉴스를 공시로·게이트 자체 문자열·공시 없는 게이트·자기검증·생성자=검증자·해시 없음·검증 시각 역전·공표>확인·http·문서번호 오류 → 판단 보류. `synthetic:false`면 전 게이트 UNKNOWN, 유사 도메인(sec-gov.example.com) 거부, sec.gov 형식은 통과. |
| CR-4 | 현금 오래됨·통화·계좌 범위 미검증, 같은 종목 중복 알림 | 현금: `status:verified`+`asOf` ISO 시각(1일 이내·미래 금지)+`currency`+`accountScope{status:confirmed, accounts[] 비어있지 않고 중복 없음}` 아니면 blocked. 통화 항목 신설: 현금 통화≠매수 통화면 `fx{base,quote,rate,source,asOf 2일 이내}` 없이는 unknown(혼합 비교 안 함). 비상현금 하한에 `currency` 필수, 현금 통화와 다르면 비교하지 않고 unknown. 투자 판단 상태는 그대로(분리). `shortlist`가 market+ticker(공백 제거·대문자) 중복 제거 후 상위 상태·안전마진 1건만 → `notifyPlan`도 같은 실행 동일 종목 최대 1회. 재진입 계약 유지. | 2일 전 현금·날짜만·미래·통화 없음·계좌 범위 없음/빈/중복/assumed → blocked; 환율 없음/오래됨/쌍 다름·하한 통화 다름/없음 → unconfirmed; USD 현금+USD 하한 → checks-ok. 같은 종목 3건(대소문자·공백 위장 포함) → 후보 1·알림 1(상위 상태), 다른 시장 같은 티커는 별개, 하락 후 재진입 1회. |

### r2 시험 결과 (클로 실행)
- `node --require ./tests/lib/no-network.cjs --test tests/*.test.cjs`: 2304 중 **2302 통과 / 0 실패 / 2 skip**(r1 2299→+5 시험). 대상 파일 tests/buy-review-gate.test.cjs 20/20.
- `node tools/scan-secrets.cjs`: findings 0.
- Playwright Chromium 360/390/430(tests/buy-review-mobile.cjs, 외부 요청 route 차단): 가로 스크롤 0, 최소 글자 12px, 외부 요청 0, 저장소 쓰기 0, 오늘의 후보 3건(SYN-A·B·F).
- 실제 데이터·API·GAS·계좌 접근 0. 모든 증빙은 합성(example.invalid, 해시 'a'×64).

### r2 미완료·미검증 (정직하게)
- 엔진은 원문을 가져오지 않는다. evidence.v2의 해시·검증자 기록이 **진짜인지**는 엔진이 확인할 수 없고, 이를 만드는 G0 시세 수집·SEC/DART 원문 수집 단계(독립 검증자)가 아직 없다 → 실제 자료는 지금 구조상 통과 불가(fail-closed). 이 단계 설계·구현이 선행 과제.
- VAL_RANGE·CROSS_TOL 1%·VALUE_TOL 5%·현금 1일·환율 2일은 공학적 안전 범위(미검증 정책)이며 업종별 조정·백테스트 없음. `fcf-perpetuity` 단일 방법만 지원(성장 단계 DCF·자산가치법 등은 미산정 처리).
- `radar/data/universe-400.json` main 미존재 — 400종목 공식 출처·기준일 검증 완료를 주장하지 않음.
- 순태씨 결정 필요(변동 없음): 비상현금 하한 금액·통화, 안전마진 구간 초기 정책 채택·업종별 조정.

---

# (r1 보고 — 아래는 a2a4c79 기준 원문)

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
