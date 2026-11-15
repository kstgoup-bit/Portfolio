STATUS: READY_FOR_REVIEW (위대한 기업 1단계 — 설계·데이터 계약·판단 보류 정책·성능 조사, 문서만 · 코드 변경 0)
ORDER-ID: 순태씨 대화 2026-11-15 'HAS 위대한 기업 탭 신설 및 장기보유 판단체계 개발 지시서'
BASE: 67417022098d2896cbdb83c7b3e38c605194af2c (main)
HEAD: main CLAUDE-LATEST.md의 HEAD(이 보고서가 든 브랜치 최신 커밋)
BRANCH: work/claude-great-companies-20261115
REVIEW-SCOPE: 이 문서 전체(설계 타당성·철학 일치·판단 상태 규칙·데이터 계약·성능 계획). 앱·GAS·시험 코드 변경 없음.

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
