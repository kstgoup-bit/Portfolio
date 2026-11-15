STATUS: READY_FOR_REVIEW (위대한 기업 — ORDER GPT-20261115-1326 중 엔진 단위: 순수 평가 엔진 + 합성 시험. 시험 전용 UI 프로토타입은 다음 단위)
ORDER-ID: GPT-20261115-1326 (같은 내용의 순태씨 대화 지시서 2026-11-15 포함)
BASE: b410141 (main) — 브랜치에 work/claude-fundamental-filter-20261115(eb98f24, 재무 필터 3단계 검토 대기) 병합 위에 작업
HEAD: main CLAUDE-LATEST.md의 HEAD(이 보고서가 든 브랜치 최신 커밋) · CODE-COMMIT d2af13c11f82a803b5114548c91e7fff014a971f
BRANCH: work/claude-great-companies-20261115
REVIEW-SCOPE: has/great-companies.js, tests/great-companies.test.cjs, tests/lib/live-data-pins.json(새 파일 1줄 등록), 이 문서 0절(엔진 단위). 1~8절(설계)은 이전 검토 범위 그대로.

# 0. 엔진 단위 보고 (클로 정각 실행, 2026-11-15 14:14 KST)

## 변경 파일
- `has/great-companies.js` (신규, 순수 UMD): `validateInput` · `assess` · `createEvaluator`(메모리 캐시) · `valuationBand`. 네트워크·localStorage·DOM·타이머 사용 0(시험으로 소스 검사).
- `tests/great-companies.test.cjs` (신규, 합성 시험 16건 — 지시서 5절 ①~⑩ 전부 + 변경사항·점검일·금지어·순수성).
- `tests/lib/live-data-pins.json`: addedRuntimeFiles에 `has/great-companies.js` sha256 1줄(기존 보호 시험이 새 런타임 파일을 요구).
- `portfolio_v5.html`·GAS·서비스워커·백업·투자기록 변경 0. 운영 앱이 이 파일을 참조하지 않음(시험으로 확인).

## 재사용
- 재무 수치 판정은 `HASFundamentalFilter.assess()`를 그대로 호출(새 계산 중복 없음): 라벨 insufficient·태그 충돌·18개월 경과 → 판단 보류, 영역 4는 leverage·interest 판정 재사용, 영역 3은 ROIC 자료 없을 때 ROE 판정 재사용.
- 새 계산만 추가: 영업이익률 안정성·3년 연속 하락(영역 1 흔적), 매출 CAGR·FCF 추세(2), ROIC 근사(3, 세율 21% 가정), 희석·환원/FCF(5), 투자논리 상태·점검일(6).

## 판단 규칙 (1단계 설계 3절에서 바뀐 점 — 검토 요청)
1. 데이터 무결성 보류(형식 오류·중복·ETF·국내·재무 없음/판정 불가·태그 충돌·가격↔결산 15개월 초과) → 판단 보류. 가장 먼저.
2. **훼손 우려를 정성 미확인 보류보다 먼저 판정**(설계 3절은 영역 1·5 unverified면 바로 보류였음). 이유: 경고를 숨기지 않기 위해(지시서 4항 '경쟁력 훼손 시 별도 경고'). 조건: 수치 취약 ≥1 + 투자논리 약화/붕괴 기록(근거 2종) · 또는 수치 영역 취약 ≥3 · 또는 재무 라벨 취약 + 수치 취약 ≥2.
3. 재점검: 취약 1개·논리 약화·점검일 경과·직전 평가 대비 영역 하락.
4. 정성(1 경쟁우위·5 자본배분) 출처·확인일 12개월 이내 없음 → 판단 보류(긍정 상태는 fail-closed). 판정 가능 영역 4 미만 → 보류.
5. 장기보유 우선 검토: 취약 0·주의 ≤1·재무 라벨 strong·근거/반론/출처 모두 있음. '확정' 표현 없음.
- 영역 5는 희석 10% 초과면 정성 확인 없이도 '취약'(경고), 그 외는 정성 확인 없으면 '미확인'.
- 정성 입력 형식(신규, 읽기 전용 계약): `thesis.moat`, `thesis.capital` = `{text, confirmedAt(YYYY-MM-DD), sourceRefs[]}`. 기존 PRINCIPLE_KNOWLEDGE_TICKER에는 이 칸이 없음 → 결정 필요(8절) 그대로.

## 가격 신호 관계(표시 문구, 권유 아님)
- 곡소리(고점 대비 −20% 이하)+우선 검토: 밸류에이션 미연결 → 판단 보류 / 중간·낮음 → '분할매수 검토 대상(최종 결정 순태씨)'.
- 곡소리+(밸류에이션 높음 또는 비중 초과) → '신호 상충' 판단 보류 + 상충 목록(⑧).
- 고점권(−5% 이내)+우선 검토: 한도 이내 → '보유 지속 검토(매도 근거 부족)' / 비중 초과(10%, 확신 25%) → '일부 축소 검토 가능(세금·비용·재진입 위험 비교)' / 밸류에이션 높음만 → '일률 매도 아님, 분할매도 여부는 순태씨'.
- 훼손 우려: 곡소리면 '곡소리 아님', 상승 중이면 '상승 중이지만 경쟁력 훼손 신호', 신호 없음이어도 경고(warning:true).
- 가격 기준일 7일 초과 → 가격 신호 판단 보류. 밸류에이션 = 자기 과거 값 대비 위치(상위 80%↑ 높음, 20%↓ 낮음) — 합성 입력만, 실제 주식 수·FCF 배수 미연결.
- 출력 전체 금지어 검사(확정·자동 매수/매도·주문 실행·매수하세요 등) → 걸리면 판단 보류로 차단.

## 캐시(⑩)
- `createEvaluator()`: 키 = 기준일(UTC 날짜) + 입력 JSON. 같은 입력 재평가 시 계산 0회(시험: computed 2→2, cacheHits 2). 입력·날짜가 바뀌면 다시 계산. 최대 200개, 메모리만(저장소 0).

## 시험 결과 (이 실행, 클로 환경)
- 새 시험 16/16 통과.
- 전체: `node --require ./tests/lib/no-network.cjs --test tests/*.test.cjs` → 2153 중 2151 통과 / 0 실패 / 2 skip(기존 skip). 처음 실행에서 보호 시험 2건이 '새 런타임 파일 미등록'으로 실패 → pins 등록 후 통과.
- `node tools/scan-secrets.cjs` → findings 0.
- 브라우저(360/390/430px) 확인: 이번 단위는 화면이 없어 해당 없음 — 다음 단위(시험 전용 UI)에서 실시.

## 합성/실데이터 구분 · 미검증
- 모든 시험 입력은 합성(가상 기업 'SYN', 가상 출처 문자열). 실제 SEC·DART 공시 독립 검증 0건.
- 임계값(ROIC 12%/6%, 매출 CAGR 5%, 이익률 표준편차 8%p, 3년 누적 5%p, 희석 3%/10%, 환원/FCF 1.5배, 밸류에이션 80/20 백분위, 곡소리 −20%, 고점권 −5%)은 제안값, 백테스트 없음.
- 정성 영역은 순태씨 기록 기반이며 앱이 사실을 검증하지 않음.
- 브랜치가 재무 필터 3단계(검토 대기) 위에 있음 — 그쪽 수정이 생기면 다시 병합 필요.

## 다음 단위 / 순태씨 결정 필요
- 다음: 시험 전용 UI 프로토타입 `has/great-companies-lab.html`(운영 메뉴 미연결, '가상 자료' 표기) + Chromium 360/390/430 + 지연 로딩 측정.
- 결정 필요(변동 없음): 정성 확인일·출처를 어디에 기록할지. 운영 탭 연결·main 병합은 별도 승인.

# 위대한 기업 1단계 — 설계 및 데이터 계약 (클로, 2026-11-15)

지시서 9항 1단계 범위만. 2단계(평가 엔진)는 이 문서 검토(지피) 뒤 시작. 운영 앱 연결·GAS·실제 API·투자기록·백업 변경 없음.

## 1. 기존 자산 조사 (main 6741702 기준, 재사용 우선)
| 자산 | 위치 | 위대한 기업에서 쓸 곳 | 한계 |
|---|---|---|---|
| 재무 필터 v1 (SEC 연간 5년 정규화·8항목 판정·태그 충돌 보류·직전 결산 신선도) | has/fundamental-filter.js (브랜치 work/claude-fundamental-filter-20261115, 2단계 지피 APPROVE, 3단계 검토 대기) | 영역 2·3·4 수치 근거 그대로 재사용(normalize/assess/validNormalized) | 미국 SEC만, ROIC·자본배분 태그 없음, 밸류에이션 n/a |
| 종목 투자논리 기록 `PRINCIPLE_KNOWLEDGE_TICKER` (19종목: thesis·logic·logicBreak·role·survivalScore·confidence·logicState·sellCondition·reduceCondition·buyMoreCondition·checkpoints·maxWeight·nextCheckDate·holdRationale) | portfolio_v5.html 5404행~ | 영역 1·5·6 정성 근거의 입력(순태씨 작성 내용) | 수기·출처 링크 없음 → '순태씨 판단 기록'으로만 표시, 검증 완료로 보지 않음 |
| 투자논리 상태 `LOGIC_STATE_INFO`(유지/일부 약화/붕괴) | portfolio_v5.html 5313행 | 영역 6 상태 입력, 'weakened'→재점검 | 갱신 시각 없음 → nextCheckDate로 대신 판단 |
| 곡소리 Top10 · 400종목 가격 선별 | has/fear-top.js, has/universe-screen.js | 가격 위치(52주 고점 대비) 연결 | GAS `type=screen` 미설치(운영 invalid-summary) |
| 환호성 보유종목 가격 근거·비중 | has/live-price-panel.js, has/portfolio-reader.js | 비중·집중위험(10%/25% 한도) | 확신 종목 지정 미연결 |
| 자본배분 비교 | has/capital-allocation.js | 환호성 축소 시 세금·비용·재진입 비교(6-B) | 합성·읽기 전용 |
| 규칙·검증 핵심 | has/advisor-core.js(validateAdvice) | 화면 문구 금지어·근거 필수 검사 재사용 | — |

중복 금지: 재무 계산을 새로 만들지 않고 fundamental-filter를 확장(영역별 집계만 새 모듈).

## 2. 평가 영역과 근거 (지시서 4항)
각 영역 결과 = `{status: pass|warn|fail|unverified|na, evidence[], counter[], sources[{kind,ref,asOf}], unknowns[]}`.
| 영역 | 수치 근거(SEC, 자동) | 정성 근거(순태씨 기록·공시 확인) | 자동으로 pass 가능? |
|---|---|---|---|
| 1 경쟁우위 | 영업이익률 5년 안정성(표준편차·최저), ROIC 5년 최저 — '우위의 흔적'일 뿐 | thesis·logic + 확인 출처(10-K Item1·사업보고서) | **아니오** — 정성 확인(출처·확인일) 없으면 unverified |
| 2 장기 성장 | 매출·영업이익·FCF 5년 연평균 성장, 성장의 질(OCF/순이익) | 시장 확장성 메모 | 수치만으로 pass 가능 |
| 3 수익성·자본효율 | ROE(기존), ROIC 근사 = 영업이익×(1−21%) ÷ (자본+부채−현금) — **근사·세율 가정 명시** | — | 예 |
| 4 재무건전성 | 순부채/OCF, 이자보상, FCF 흑자 연수(기존 판정 재사용) | — | 예 |
| 5 경영진·자본배분 | 신규 태그: 자사주 매입·배당·인수 지출·희석(주식 수 증감) | 순태씨 확인(주주가치 훼손 사례) | **아니오** — 정성 확인 없으면 unverified |
| 6 장기 지속가능성 | — | logicState·logicBreak·checkpoints·nextCheckDate | 정성 전용. nextCheckDate 경과 → unverified |

## 3. 판단 상태 규칙 (지시서 5항, 총점으로 결정하지 않음)
우선순위 위→아래, 먼저 맞는 것.
1. **판단 보류**: 재무 라벨 insufficient/형식 불명 · 태그 충돌 보류 · 최신 결산 18개월 초과 · 가격 기준일과 재무 기준일 차이 > 15개월 · 국내(DART 미연결)·IFRS · 영역 1 또는 5가 unverified · 판정 가능 영역 4개 미만.
2. **보유 논리 훼손 우려**: 서로 다른 근거 종류(수치/정성) 2개 이상에서 fail — 예: 재무 라벨 weak + logicState weakened/broken, 또는 영역 3·4 동시 fail + 영역 1 fail. **단일 지표·미검증 뉴스만으로는 이 상태로 가지 않음**(→ 재점검).
3. **경쟁력 재점검**: fail 1개, 또는 logicState weakened, 또는 영업이익률 추세 fail, 또는 nextCheckDate 경과, 또는 직전 평가 대비 영역 상태 하락.
4. **장기보유 우선 검토**: fail 0 · warn ≤ 1 · 재무 라벨 strong · 영역 1·5 정성 확인일 12개월 이내.
5. 그 외 → 경쟁력 재점검.
- '위대한 기업 확정'이라는 표시는 만들지 않음(4번도 '검토'). 모든 상태에 근거·반론·출처·기준일·미확인 사항 필수(없으면 엔진이 판단 보류로 낮춤).
- **보조 점수**(표시만, 결정에 미사용): 영역별 pass=100·warn=50·fail=0, unverified·na는 제외, 6영역 동일 가중(1/6) 평균, '참고 점수(n/6 영역)'로 표시. 가중치 변경은 문서·시험 동시 변경.

## 4. 곡소리·환호성 통합 (지시서 6항)
| 가격 신호 | 위대한 기업 상태 | 표시(권유 아님, 최종 결정 순태씨) |
|---|---|---|
| 곡소리(-20% 이하) | 장기보유 우선 검토 | '가격 하락·경쟁력 유지 근거 — 밸류에이션 연결 후 분할매수 검토 대상' (밸류에이션 연결 전엔 판단 보류 유지) + 현재 비중·한도 |
| 곡소리 | 훼손 우려 | '곡소리 아님 — 가격 하락과 기업가치 훼손 동시' |
| 곡소리 | 재점검·보류 | '판단 보류 — 경쟁력 확인 먼저' |
| 환호성(고점권) | 장기보유 우선 검토, 비중 한도 이내 | '보유 지속 검토 — 매도 근거 부족' |
| 환호성 | 장기보유 우선 검토, 비중 한도 초과(10%/확신 25%) | '집중위험 — 일부 축소 검토 가능(세금·비용·재진입 위험 비교)' |
| 환호성 | 훼손 우려 | '상승 중이지만 경쟁력 훼손 신호 — 점검 필요'(6-C) |
| 신호 없음 | 훼손 우려 | 별도 경고 카드 |
- 고평가 정도(6-B)는 밸류에이션(주가×주식 수 ÷ FCF·이익, 자기 5년 범위 대비)이 필요 → 2단계에서 합성으로 엔진만, 실제 연결은 주식 수 태그 수집 후. 연결 전엔 '고평가 판단 보류'.

## 5. 공통 데이터 계약 `hasGreatCompanyInput.v1` (합성 시험 기준, GAS 미구현)
```
{ schema:'hasGreatCompanyInput.v1', generatedAt:ISO,
  company:{ ticker, market:'US'|'KR', name, industry|null, listType:'holding'|'watch' },
  fundamental: <fundamental-filter normalize() 결과 | null>,           // 기존 계약 그대로
  capitalAllocation:{ end, buybacks|null, dividends|null, acquisitions|null, dilutedShares|null, sources:[{tag,filed,accn}] }[] | null,  // 신규 SEC 태그(미수집)
  thesis:{ text, logic, logicBreak, logicState, checkpoints[], nextCheckDate, confirmedAt|null, sourceRefs[] } | null,  // PRINCIPLE_KNOWLEDGE_TICKER에서 읽기 전용 매핑
  price:{ asOf, drawdownPct, weightPct|null, conviction:boolean|null } | null,
  previous:{ state, domains:{...}, evaluatedAt } | null }              // 최근 평가 변경사항용(세션 메모리)
```
출력 `hasGreatCompanyAssessment.v1`: `{state, stateKo, domains{1..6}, reasonsToHold[≤3], risks[], changes[], sources[], asOf, unknowns[], auxScore{value,coveredDomains}, priceRelation, signalHold:true, opinion:'판단 보류'|'보유 지속 검토'…}` — 주문·매수/매도 권유 문구 금지(advisor-core 금지어 검사 재사용).
신규 SEC 태그 후보(미검증, 2단계 픽스처로만): PaymentsForRepurchaseOfCommonStock, PaymentsOfDividends(CommonStock), PaymentsToAcquireBusinessesNetOfCashAcquired, WeightedAverageNumberOfDilutedSharesOutstanding.

## 6. 성능·기존 앱 보호 계획 (지시서 8항)
조사 사실(기존 보고): 로그인 지연 주원인은 `load`(글꼴) 대기 → DOMContentLoaded 시작으로 개선(CLAUDE-DEV-LOGIN-SPEED-20261112, Chromium CPU4x 4.0→1.1초); 추세선 지연은 Intl.DateTimeFormat 반복 생성(CLAUDE-DEV-CHART-SPEED-20261113). 현재 portfolio_v5.html에 defer 스크립트 36개 — 시작 시 모두 내려받고 실행.
- 위대한 기업 코드는 **defer 태그로 넣지 않음**. 탭 진입 시 `has/great-companies.js`·`-panel.js`를 동적 `<script>` 1회 주입(재진입 시 재사용).
- 평가는 탭 진입 시 보유·관심 종목만(400종목 아님), 결과는 메모리 캐시(키 = ticker + 재무 filed + thesis nextCheckDate + 가격 asOf). localStorage·백업·원장 쓰기 없음.
- 종목별 계산을 나눠 실행(setTimeout 0 / requestIdleCallback 묶음)해 입력 차단 방지. 카드는 판정 결과부터 그리고 상세는 펼칠 때 생성.
- 측정: 기존 tests/login-speed-browser.cjs 방식으로 3단계에서 전후 동일 조건(Chromium, CPU4x, 외부 차단) 측정. 목표 2초·0.3초는 **목표일 뿐, 실기기 전 달성 보고 안 함**.

## 7. 단계 계획
- 2단계: has/great-companies.js(순수, 네트워크·저장 0) + 필수 시험 10건 중 1~8(합성). 9·10은 3·4단계.
- 3단계: 분리 시험 화면 has/great-companies-lab.html(앱과 분리), 360/390/430px, 지연 로딩·성능 측정.
- 4단계: 통합 사전 검토(충돌·백업 불변·회귀) → 운영 연결은 순태씨 승인 후.

## 8. 미검증·위험·결정 필요
- 국내 보유종목은 DART 미연결이라 전부 '판단 보류' — 순태씨 보유 다수가 국내/ETF라면 탭 효용이 제한됨. ETF는 기업 평가 대상 아님(구성 종목 평가 별도) → 2단계에서 'ETF 제외' 처리 제안.
- ROIC 근사(세율 21% 고정)·성장 임계값은 제안값(미검증, 백테스트 없음).
- 정성 영역(1·5·6)은 순태씨 기록 기반 — 기록의 사실 여부는 앱이 검증하지 못함. '확인일·출처' 입력 칸이 기존 기록에 없음 → **결정 필요: 정성 확인일을 어디에 기록할지**(제안: 기존 기록 불변, 새 읽기 전용 매핑 + 확인일은 3단계 화면에서 세션 입력만, 저장은 별도 승인).
- 실제 자료 검증 0건(이번 단계는 문서). 재무 필터 3단계(eb98f24)가 운영 전이라 위대한 기업도 그 위에 쌓임.
