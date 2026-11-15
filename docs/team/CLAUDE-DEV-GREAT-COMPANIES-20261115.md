STATUS: READY_FOR_REVIEW (지피 GPT-REVIEW-great-companies-20261115-2130 CHANGES_REQUESTED 2건 반영 — 상품 유형 미확인 보류·다계좌 투자원칙 기록 선택/상충. 브랜치 한정, main 병합·운영 반영은 지피 APPROVE + 순태씨 '올려' 후)
ORDER-ID: 순태씨 직접 결정(2026-11-15 '진행') · 선행 GPT-20261115-1326 · 지피 검토 GPT-REVIEW-great-companies-20261115-2130
BASE: dad6ac509cf02c73d451ef07f93610a03909b31f (지피 2130 검토 HEAD) · main b340371 병합(bd2b949, 문서만)
HEAD: main CLAUDE-LATEST.md의 HEAD(이 보고서가 든 브랜치 최신 커밋) · 코드·시험·보고서 같은 커밋
BRANCH: work/claude-great-companies-20261115
REVIEW-SCOPE: dad6ac5...HEAD 중 has/great-companies-panel.js(상품 유형·투자원칙 기록 선택), has/great-companies.js(kind 'unknown' 허용·보류 1줄), tests/great-companies-panel.test.cjs(기존 단언 3곳 변경 + 신규 3건), tests/lib/live-data-pins.json(2개 해시), 이 보고서 0-i절. portfolio_v5.html 변경 없음. (병합 커밋의 docs/team 변경은 범위 밖)

# 0-i. 지피 2130 CHANGES_REQUESTED 반영 (2026-11-15 22시 정각 실행)
## 1. 상품 유형 — 일반기업으로 단정하지 않음
- 앱 보유 기록(genStocks 등)에 믿을 만한 상품 유형 칸이 없음(portfolio_v5.html에 assetType·productType 등 0건 확인). 그래서 새 `kindOf()`:
  - `s.productType`이 'company'/'etf'이면 그 값 우선(현재 앱 기록엔 없음 — 향후 검증된 유형 출처 연결용. 다른 값은 무시).
  - ETF 표시가 뚜렷할 때만 'etf'(추정, 'ETF 추정' 태그): 국내 = 운용사 상표로 시작하고 바로 뒤가 영문자가 아님(`KODEX미국S&P500TR`·`TIGER미국S&P500` 포함, `SOLUM테크` 같은 영문 이어짐은 제외) 또는 이름에 'ETF' 낱말 / 미국 = 기존 고정 목록 또는 이름의 'ETF' 낱말. 티커 추정 규칙을 넓히지 않음.
  - 그 밖은 전부 'unknown' → 엔진이 **'상품 유형 미확인 — 기업 평가 보류'**(새 태그 '상품 유형 미확인'). `US:QLD`·`US:GLDM`·보통주(삼성전자·AAPL 등)·이름 없는 종목 모두 여기.
- 엔진 `has/great-companies.js`: 입력 검증 kind에 'unknown' 추가, ETF 분기 바로 다음 보류 1줄. 'company' 경로는 변경 없음(현재 패널에서는 쓰이지 않음 — 재무 연결 시 SEC/DART 공시 확인을 유형 근거로 쓰는 안은 후속, 미구현).
- 영향: 국내 보통주의 보류 사유가 'DART 미연결' → '상품 유형 미확인'으로 바뀜(둘 다 판단 보류, 게이트 닫힘). 화면 맨 위 '자료 연결 상태'(SEC·DART 미연결)는 그대로.
## 2. 같은 종목 여러 계좌의 투자원칙 기록
- 계좌별 기록을 모두 모은 뒤 고름. '실제 기록' = 투자 이유 작성, 투자논리 상태, 점검 항목 1개 이상, 또는 논리 붕괴 조건 중 하나.
  - 실제 기록 1개(또는 여러 개가 완전히 같음) → 그 기록 사용, `recordFrom`에 출처 계좌.
  - 실제 기록이 서로 다름 → 고르거나 합치지 않음: `input.thesis=null`, 카드에 '원칙 기록 상충' 태그와 '원칙 기록 상충 — 확인 필요(일반·ISA 계좌 기록이 서로 다름, 어느 쪽도 평가에 쓰지 않음)'.
  - 모두 빈 기록 → 예전처럼 첫 기록(‘상태 미기록’) 표시. 기록 없음 → '없음'.
- 원본 불변: 시험에서 보유 목록·원칙 기록을 깊게 얼린(freeze) 채로 실행해 통과. 저장·전송 없음 그대로.
## 시험(클로 실행)
- 기존 단언 변경 3곳: NVDA·삼성전자 kind 'company' → 'unknown', 보류 사유 DART/재무 자료 없음 → '상품 유형 미확인 — 기업 평가 보류'.
- 신규 3건: ① 지피 반례 4개(QLD·GLDM → unknown, KODEX미국S&P500TR·TIGER미국S&P500 → etf) + 'ETF' 낱말 + 보통주 반례 5개 + 이름 없음 2개 + productType 우선/이상값 무시 + 엔진 보류 사유·게이트 닫힘 + 잘못된 kind 거부 ② 빈→유효(지피 재현 입력), 유효→빈, 같은 내용 2계좌, 상충, 모두 빈 기록, 기록 없음 ③ 화면 태그(상충·유형 미확인)·원본 불변.
- 전체: 2196 중 2194 통과 / 0 실패 / 2 skip(DST). jsdom(별도 폴더 설치). 비밀값 findings [].
- Chromium(Playwright, 패널 단독 시험 페이지 + 가상 보유 3종목·상충 원칙 기록, 외부 요청 차단) 360/390/430: 가로 넘침 0, 12px 미만 0, 페이지 오류 0, 태그 '상품 유형 미확인'·'원칙 기록 상충'·'ETF 추정' 표시, localStorage 전후 동일. 갤럭시 실기기 미검증.
## 미검증·한계
- ETF 추정은 이름·티커 기준(미검증). 국내 상표 뒤 한글이 바로 오는 일반기업 이름이 있으면 'ETF 추정'으로 잘못 보일 수 있음(둘 다 판단 보류라 투자 판단 영향 없음).
- 신뢰할 수 있는 상품 유형 자료(KRX 상품 구분, SEC 공시 존재 여부 등)는 아직 연결 안 됨 → 재무 연결 단계에서 함께 설계 필요.
## 순태씨 결정 필요
- 없음(지피 재검토 APPROVE 후 운영 반영 여부만 '올려'로 결정).

# 0-h. 운영 앱 '위대한 기업' 탭 연결 (2026-11-15 순태씨 '진행')
## 바뀌는 것
- 위험관리 하위 메뉴: 곡소리·환호성 다음에 '🏛️ 위대한 기업 (판단 보조)' 버튼, `#panel-greatco` 패널.
- **지연 로딩**: 앱 시작 시 위대한 기업 코드 0바이트(defer 태그 없음). 탭을 처음 누를 때 `has/great-companies-panel.js` 1회 주입 → 패널이 엔진 `great-companies.js`·화면 도우미 `great-companies-lab.js`(#lab 없으면 그리지 않음)·CSS를 이어서 1회 불러옴. 재진입은 결과 재사용(엔진 메모리 캐시, 계산 0회). 불러오기 실패 시 안내 + 다음 진입에 재시도.
- **읽기 전용**: 보유 목록(genStocks·domStocks·ovStocks·penStocks 사본)과 투자원칙 기록(`v5_investPrinciples` getItem만), 비중은 HASPortfolioReader(앱 입력 평가액, 미검증). 저장·삭제·전송·AI 호출·주문 없음(시험 + 브라우저에서 localStorage 전후 동일 확인).
- 카드: 종목·티커·시장·계좌·비중 / 상태·의견 / 판단 보류 사유 / 순태씨 투자원칙 기록(투자논리 상태·점검 항목 확인 수, 기록 그대로) / 자세히(밸류에이션 사유·미확인·검토 게이트 닫힘). 엔진 영역 결과가 생기면 6영역·보유 이유·위험·출처도 같은 카드에 표시.
- **현재 실제 결과는 전 종목 '판단 보류'**: 미국 SEC 재무·DART·밸류에이션·52주 위치가 앱에 연결되지 않음(GAS에 재무 응답 없음 — 저장소 gas/에 fundamental 처리 0건 확인). 화면 맨 위 '자료 연결 상태'에 그대로 표시. ETF는 이름·티커 기준 추정으로 'ETF — 기업 평가 대상 아님'.
## 시험(클로 실행)
- 새 `tests/great-companies-panel.test.cjs` 6건: 입력 변환(계좌 합치기·예수금/수량 0 제외·ETF 추정·원본 불변), 전 종목 판단 보류·게이트 닫힘, 화면 문구·금지어·재진입 재사용(계산 4→4, 재사용 4), 모듈 없음/실패 → 안내·재시도, 저장·네트워크·innerHTML 없음·CSS 12px 이상·#panel-greatco 한정, 메뉴 버튼·처음 진입 때만 1회 주입·중복 주입 없음·실패 후 재시도.
- 기존 단언 변경: 메뉴 목록에 greatco 추가, '앱이 great-companies를 참조하지 않음' → '앱은 great-companies-panel.js만 지연 주입, 스크립트 태그·엔진 직접 참조·가상 자료/시험 화면 참조 없음'.
- 전체: 2193 중 2191 통과 / 0 실패 / 2 skip(DST). jsdom 31.0.1. 비밀값 findings []. live-data 역방향 6쌍 역적용으로 이전 파일 재현 확인.
- Chromium(Playwright, 실제 portfolio_v5.html + 가상 보유 3종목·가상 원칙 1건, 외부 요청 차단) 360/390/430: 가로 넘침 0, 12px 미만 0, #333보다 옅은 글자 0, '자세히' 44px, 페이지 오류 0, 로그인 시 great-companies 파일 요청 0 → 탭 진입 시 4개 1회, localStorage 전후 동일, 재진입 계산 0. 탭 첫 표시 127~198ms, 재진입 49~64ms(이 컨테이너 참고치, 갤럭시 미검증).
## 미검증·순태씨 결정 필요
- 갤럭시 실기기 미확인. 운영 반영 후 순태씨 갤럭시에서 탭 열림·뒤로가기 확인 필요.
- 실제 가치를 담으려면 다음 단계가 필요: GAS에 SEC 재무(companyfacts) 응답 추가(= GAS 변경, 순태씨 승인 필요) → 미국 종목부터 6영역 평가. 정성 확인일(경쟁우위·자본배분) 입력 칸은 아직 없음(저장 추가는 별도 승인).
- ETF 추정은 이름·티커 목록 기준(미검증).

# 0-g. 시험 전용 UI (2026-11-15 20시 정각 실행)
## 변경 파일
- `has/great-companies-fixtures.js`(신규, 순수 UMD): 가상 기업 10개(SYNA~SYNJ, 이름 '가상 기업 A~J', synthetic:true). SEC companyfacts 모양 가상 숫자 → 재무 필터 normalize → hasGreatCompanyInput.v1. 평가 기준시각은 가상 고정 2026-11-15(실제 날짜로 평가하면 가상 기준일이 오래돼 결과가 바뀜 — 화면에 표시).
  사례: ① 경쟁력 유지·급락 ② 훼손·급락 ③ 고점권·한도 이내 ④ 고평가+집중 ⑤ 일시 실적 악화+직전 평가 대비 하락 ⑥ 재무 공시 없음 ⑥ 밸류에이션 기준일 오래됨 ⑦ 훼손인데 상승 ⑧ 신호 상충 + 가격 기준일 오래됨·밸류에이션 미연결.
- `has/great-companies-lab.html/.js/.css`(신규): 독립 경로, `?test=1` 게이트(닫히면 안내만), CSP connect-src 'none'. 목록 카드(가상 자료 표시·상태·의견·가격 위치·밸류에이션 사유·주의 표시) → '자세히 보기'(#d=티커, 브라우저 뒤로가기 지원) → 판정 이유·주의 근거(경쟁력 경고/위험 근거(미검증) 분리)·관련 가격 신호·6개 영역(근거·반론·미확인)·보유할 이유·위험·변경사항·출처·기준일·미확인·매수/매도 게이트 닫힘·참고 점수.
- **1927 후속 반영**: 밸류에이션 줄은 모든 분기(priority·recheck·erosion·가격 stale·판단 보류)에서 `priceRelation.valuation.reason/text`를 따로 표시 — '미연결' / '기준일 오래됨 — 확인 전 판단 보류' / '입력 미검증(가상 입력)' / 판단 보류 출력은 '평가하지 않음(판단 보류 상태)'. 오래됨을 미연결로 표시하지 않음(시험).
- 지연 평가·재사용: 게이트 열리고 목록을 처음 그릴 때 createEvaluator로 1회 평가, 목록↔상세 전환은 결과 재사용(계산 10회·재사용 0회 유지). 새로고침은 새 인스턴스라 재계산. 저장소 사용 없음.
- `tests/lib/live-data-pins.json`: addedRuntimeFiles에 새 파일 4개 sha256. currentSha256(portfolio_v5.html)·live-data-edits 변경 없음(앱 미수정).
- portfolio_v5.html·서비스워커·manifest·GAS·투자기록·백업·localStorage 변경 0. 운영 앱·다른 has 화면이 great-companies를 참조하지 않음(시험).

## 시험(클로 실행)
- 새 `tests/great-companies-lab.test.cjs` 9건: CSP·스크립트 목록·네트워크/저장소/HTML 주입 없음, 게이트 OFF·운영 미연결, 가상 사례 10개 상태, 목록 카드 주의 표시 ⇔ warning||riskWarning, 밸류에이션 사유 4종 구분, 클릭 흐름(상세 섹션 7종·6영역·게이트 닫힘·목록 복귀·10개 재진입 후 계산 10회 그대로), 주의 근거 분리·판단 보류 상세·잘못된 해시, 화면 전체 금지어·가치 확정 문구·'검토 대상/가능' 없음·undefined/null/NaN 없음, 핀 일치.
- 전체: 2187 중 2185 통과 / 0 실패 / 2 skip(DST). jsdom 31.0.1(별도 폴더 NODE_PATH). 참고: jsdom 24에서는 기존 universe-screen-dom 시험 1건이 비동기 오류로 실패(이번 변경과 무관, 최신 jsdom에서 통과). 비밀값 scan-secrets findings [].
- Chromium(Playwright) 360/390/430: 가로 넘침 없음(목록·상세), 최소 글자 12px, 본문 글자색 #333 이상 진하기, 외부 요청 0, 콘솔·페이지 오류 0, 클릭→상세→뒤로가기→목록→상세→'목록으로' 흐름 통과, 게이트 OFF 안내, 새로고침 시 재계산(화면 전환 1회로 초기화).
- 측정(이 컨테이너 Chromium, 로컬 서버, 참고치): 첫 화면 137~303ms, 상세 전환 54~88ms, 뒤로가기 15~21ms, 엔진 첫 평가 6~26ms. 목표치(첫 화면 2초·재전환 0.3초)와 같은 조건의 기존 화면 비교·갤럭시 실기기 측정은 **미검증**.

## 미완료·미검증·순태씨 결정 필요
- 전부 가상 자료. 실제 SEC·밸류에이션·4단계 조사 연결 없음, 매수·매도 게이트 닫힘 유지.
- 갤럭시 실기기 확인 미수행(미검증).
- **운영 앱 '위대한 기업' 탭 연결은 이 ORDER 범위 밖** — 지피 검토 후 순태씨 승인 필요(연결 방식: 지연 로딩 설계 1절 제안 그대로).

# 0-f. 지피 1830 검토 반영 (2026-11-15 19시 정각 실행)
1. **보류 사유 구분**: `valuationBand()` 출력에 `reason` 추가 — `missing`(입력 없음) / `stale`(입력 있음, 기준일 31일 초과) / `unverified`(최신 입력 low·mid·high, 원본 미검증). band 값과 기존 `text`는 그대로.
2. **priority 최종 분기** `valuationPending`: missing → '현재 본질가치 대비 평가 미완료(밸류에이션 미연결)', stale → '…(밸류에이션 기준일 YYYY-MM-DD 오래됨 — 확인 전 판단 보류)', unverified → '…(밸류에이션 입력 미검증)'. 오래된 값을 '미연결'이나 '입력 미검증(최신)'으로 표시하지 않음.
3. **곡소리(fear) 분기**도 같은 구분: stale → '밸류에이션 기준일 오래됨(YYYY-MM-DD) — 확인 전 판단 보류', missing → '밸류에이션 확인 전이라 판단 보류(미연결)'(기존 시험 ① 문구 '밸류에이션 확인 전' 유지).
4. **새 합성 시험 3건**: 1830-① priority·가격 2026-11-14(-2%, 6%)·밸류에이션 asOf 2026-10-01(평가 2026-11-15) → reason stale, text·valuationPending에 '미연결'·'미검증' 없음, '기준일 2026-10-01 오래됨' 표시, euphoria 유지, warning·riskWarning false, buyGate·sellGate 닫힘, 가치 확정 문구 없음 ② 없음/최신/오래됨 대비 — reason missing·unverified·stale, valuationPending 세 문구 모두 다름, 게이트 닫힘·경고 없음 ③ 곡소리(-25%)+오래됨 → 판단 보류·'미연결' 아님·buyGate 닫힘 / 오래됨+18% → riskBasis ['concentration']만, businessWarning false, sellGate 닫힘(가격·밸류에이션 신호와 위험·경쟁력 경고 독립).
- 시험(클로 실행): great-companies 37건 통과, 전체 2178 중 2176 통과/0 실패/2 skip(DST), 비밀값 0(scan-secrets findings []). portfolio_v5.html·GAS·운영 변경 0(UI 없음, 브라우저 확인 대상 없음).
- 미검증: 전부 합성 입력. 실제 SEC·밸류에이션 원본 검증 없음. 가격 stale·밸류에이션 stale 동시 경우는 가격 stale 분기가 먼저 반환(밸류에이션 사유는 valuation.reason으로만 노출) — 기존 동작 유지.
- 다음 단위: 시험 전용 UI(`has/great-companies-lab.html`) + Chromium 360/390/430 — 지피 재검토 후.

# 0-e. 지피 1730 검토 반영 (2026-11-15 18시 정각 실행)
1. **본질가치 확정 문구 제거**: priority·한도 이내·밸류에이션 high 아님 분기의 '고점권이지만 경쟁력·기업가치 유지 — 보유 지속 검토(매도 근거 부족)' 삭제. 새 문구: '고점권(가격 위치 신호) · 경쟁력 지표 유지 근거 — 현재 본질가치 대비 평가 미완료(밸류에이션 미연결|입력 미검증) · 보유 지속 검토(제한된 자료 기준 검토 의견, 매수·매도 판단 아님) · 현재 비중 x% / 한도 y%'. 가격 신호 없음도 같은 구조('가격 신호 없음 · 경쟁력 지표 유지 근거 — …').
2. **low·mid도 미검증**: band unknown이면 '(밸류에이션 미연결)', low·mid면 '(밸류에이션 입력 미검증)'. 새 필드 `priceRelation.valuationPending`(priority 최종 분기에서만)으로 보류 사유를 화면이 따로 보여 줄 수 있음. opinion '보유 지속 검토'는 유지(검토 의견 범위 명시).
3. **텍스트 정합성 단언**: VALUE_CONFIRM(기업가치 유지·저평가 확인·고평가 확인·매도 근거 부족·적정 주가·가치 확인됨·본질가치 유지)이 출력 전체(JSON)에 없어야 함. 시험 1730-① 고점권·6%·valuation null → euphoria 유지, warning·riskWarning false, sellGate·buyGate 닫힘, '평가 미완료(밸류에이션 미연결)' 표시 ② low·mid 가상 입력 × 고점권/중간 → 확정 문구 없음·'입력 미검증' 표시 ③ 고점권+18%(concentration 경고·점검 필요) / 훼손(businessWarning) 계약 유지 ④ 엔진 원본에 확정 문구·구형 주석 없음. 기존 ③ 시험의 '매도 근거 부족' 단언은 '본질가치 대비 평가 미완료' 단언으로 교체.
4. **주석 정정**: '비중 초과·고평가·고점권은 위험 신호' → '고점권은 가격 위치 신호(signal·signals)일 뿐이고, 비중 초과·고평가(입력 미검증)만 위험 근거(riskBasis·riskWarning)'.
- 시험(클로 실행): great-companies 34건 통과, 전체 2175 중 2173 통과/0 실패/2 skip(DST), 비밀값 0(scan-secrets findings []). portfolio_v5.html·GAS·운영 변경 0(UI 없음, 브라우저 확인 대상 없음).
- 미검증: 전부 합성 입력. 실제 SEC·밸류에이션 검증 없음. 곡소리(fear) 분기 문구 '경쟁력 유지 근거'는 경쟁력 지표만 가리키며 그대로 둠(지피 판단 요청).
- 다음 단위: 시험 전용 UI(`has/great-companies-lab.html`) + Chromium 360/390/430 — 지피 재검토 후.

# 0-d. 지피 1630 검토 반영 (2026-11-15 17시 정각 실행)
1. **고점권만으로 riskWarning 금지**: `relate()`의 `signal==='euphoria' → riskWarning=true` 삭제. 고점권은 `signal`·`signals[]`(가격 위치 라벨)에만 남음.
2. **위험 근거 분리 필드**: `priceRelation.riskBasis[]` 신설 — `{kind:'concentration'|'valuation', verified:false, text, source}`. `riskWarning`은 riskBasis가 비어 있지 않을 때만 true(출력 계약 시험). 밸류에이션 근거는 항상 `verified:false`, 문구 '밸류에이션 높은 편(입력 미검증 — 검증된 고평가 아님)', 입력 `source` 표시. signals·text의 '밸류에이션 높은 편'도 '(입력 미검증)' 표기(신호 상충 conflicts 라벨은 그대로).
3. **훼손 경고 소비 계약**: `warning`(= 신설 별칭 `businessWarning`) = state 'erosion'의 경쟁력·보유 논리 훼손 우려, `warningText` 신설. riskWarning과 독립(erosion+고점권+비중 6% → warning true·riskWarning false 가능). 화면 규칙(엔진 주석에 문서화): 둘 중 하나라도 true면 주의 표시, 문구는 warningText·riskBasis를 각각 표시. holdOut도 같은 필드(false·빈 배열·null).
- 합성 반례 시험: ① 장기보유 우선+고점권(-2%)+6%+밸류에이션 미연결 → euphoria 유지, riskWarning false, riskBasis [], sellGate 닫힘, opinion '보유 지속 검토' ② 고점권+18% → riskBasis ['concentration']만, '점검 필요', sellGate 닫힘 / 가상 고평가 → verified:false·미검증 문구·출처 ③ erosion+고점권 → warning·businessWarning true, riskWarning false, 훼손 문구 전달 / erosion+15% → 둘 다 true + 출력 계약(6가지 출력에서 riskWarning ⇔ riskBasis 비어 있지 않음, warning = businessWarning). 기존 1531 반례 가~라 그대로 통과.
- 시험: great-companies 30건 통과, 전체 2171 중 2169 통과/0 실패/2 skip(DST), 비밀값 0(scan-secrets findings []). portfolio_v5.html·GAS·운영 변경 0(UI 없음, 브라우저 확인 대상 없음).
- 미검증: 전부 합성 입력. 비중 근거도 입력값 기준이라 verified:false로 둠.
- 다음 단위: 시험 전용 UI(`has/great-companies-lab.html`) + Chromium 360/390/430 — 지피 재검토 후.

# 0-c. 지피 1531 검토 반영 (2026-11-15 16시 정각 실행)
1. **매도·축소 게이트 닫힘**: 모든 출력에 `priceRelation.sellGate = {open:false, missing:[실제 검증된 밸류에이션 출처·기준일, 매도 전 4단계 조사 출처·기준일, 비용·세금·재진입 분석]}` (holdOut 포함). '일부 축소 검토 가능' 출력 제거.
2. **신호와 의견 분리**: 비중 한도 초과·밸류에이션 높은 편·고점권은 `signals[]`와 `riskWarning:true`로만 표시. 비중 초과 시 화면용 `opinion`은 '점검 필요', 문구 '위험 신호: 집중위험(비중 한도 초과)… — 점검 필요. 매도 검토 게이트 닫힘(…미연결), 행동 의견 아님'. 축소 관계 설명은 `scenario`('가상 분석(설명용, 입력 미검증): …')에만.
3. **경고 유지**: 가격 기준일이 오래돼도(stale) 비중 초과면 신호·riskWarning 유지, opinion '점검 필요'. 가격 미연결이어도 고평가 입력이면 riskWarning 유지. 한도 경고 자체는 없애지 않음. 고평가만(확신 종목 한도 이내) → '보유 지속 검토' 유지, 문구 '위험 신호: 밸류에이션 높은 편 — 경쟁력 유지, 일률 매도 아님(매도 검토 게이트 닫힘…)'.
- 반례 시험(지피 요청 가~라 + 출력 계약): (가) valuation=null·고점권 아님·12% (나) 가상 고평가·18%·고점권 → 신호 3개 (다) 확신 종목 26% (라) stale 가격 / 31일 초과 밸류에이션 — 모두 sellGate 닫힘, scenario 외 출력에 '축소 검토 가능·매도 검토 가능·분할매도 검토 대상' 없음, 위험 경고 유지.
- 시험: great-companies 25건 통과, 전체 2166 중 2164 통과/0 실패/2 skip(DST), 비밀값 0. portfolio_v5.html·GAS·운영 변경 0(UI 없음, 브라우저 확인 대상 없음).
- 미검증: 전부 합성 입력. 4단계 조사·비용/세금 분석 계약은 만들지 않음(게이트 열기는 새 지시·순태씨 결정 필요).
- 다음 단위: 시험 전용 UI(`has/great-companies-lab.html`) + Chromium 360/390/430 — 지피 재검토 후.

# 0-b. 지피 1431 검토 반영 (2026-11-15 15시 정각 실행)
1. **매수 검토 게이트 닫힘**: 엔진은 어떤 입력(합성 포함)에서도 '분할매수 검토 대상'을 만들지 않음. 곡소리+장기보유 우선 검토+밸류에이션 중간/낮음 → opinion '판단 보류', 문구 '실제 밸류에이션 검증·4단계 사전 조사 연결 전이라 판단 보류(매수 검토 아님)'. 관계 설명은 `priceRelation.scenario`('가상 분석(설명용, 입력 미검증): …')로만 분리. 모든 출력에 `priceRelation.buyGate = {open:false, missing:[실제 검증된 밸류에이션 출처·기준일, 4단계 사전 조사 출처·기준일]}`. 시험 ① 기대값 수정. 4단계 조사 계약은 이번 단위에서 만들지 않음(게이트 열기는 새 지시·순태씨 결정 필요).
2. **종목·기준시각 정합성**: `fundamental.ticker ≠ company.ticker`(식별자 없음 포함) → 보류. `valuation`은 `ticker`·`source` 필수, `metric`은 허용 목록(PER·PBR·PSR·P/FCF·EV/EBIT·EV/EBITDA), 티커 불일치 → 보류. 가격 기준시각이 평가 시각+10분보다 미래 → 보류. 밸류에이션 기준일 미래 → 보류, 31일 초과 → 밸류에이션 판단 보류(band unknown). 재무 결산일 미래·공시일이 결산일 전/미래 → 보류. 자본배분 결산일 미래 → 보류.
3. **자본배분 기간 일치**: 환원(자사주+배당)과 FCF는 같은 결산일 교집합 연도만 합산(환원 값이 빈 연도 제외), 3년 미만이면 비율 판단 보류(미확인 사항에 표시). 근거 문구에 기간 표시(예: '같은 결산 3년 2023~2025'). 시험: 자본배분 3년/재무 5년, 결산일 시차(6월 결산 → 0년), 중간 누락, 순서 역전(형식 오류 보류).
4. **캐시 서술 정정**: 메모리 캐시는 같은 JS 인스턴스 안에서만 재계산 생략. 브라우저 새로고침·앱 재실행은 새 인스턴스라 다시 계산(아래 0절 '캐시' 서술 정정). 실제 탐색·새로고침·모바일 성능 측정은 3단계 격리 UI에서 별도. 저장소·백업 신설 없음.
- 설계 3절과의 정리: 정성 미확인이면 긍정 상태(장기보유 우선 검토)는 보류. 단, 수치·정성 서로 다른 근거 2종 이상 취약이면 '보유 논리 훼손 우려' 경고는 표시(신호이며 행동 지시 아님, opinion '점검 필요'). 근거 미검증 상태에서 긍정 장기보유·매수 판단은 만들지 않음.
- 시험: great-companies 20건 통과, 전체 2161 중 2159 통과/0 실패/2 skip(DST), 비밀값 0. 앱·portfolio_v5.html·GAS 변경 0(UI 없음이라 브라우저 확인 대상 없음).
- 미검증: 실제 SEC·실제 밸류에이션·4단계 조사 자료 없음(전부 합성). 임계값(10분·31일 포함) 제안값.
- 다음 단위: 시험 전용 UI(`has/great-companies-lab.html`, `?test=1`) + Chromium 360/390/430 + 새로고침 재계산 측정 — 지피 재검토 후.

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
- (1431로 변경: 중간·낮음도 판단 보류 + scenario 설명만, 0-b절) 곡소리(고점 대비 −20% 이하)+우선 검토: 밸류에이션 미연결 → 판단 보류 / 중간·낮음 → '분할매수 검토 대상(최종 결정 순태씨)'.
- 곡소리+(밸류에이션 높음 또는 비중 초과) → '신호 상충' 판단 보류 + 상충 목록(⑧).
- 고점권(−5% 이내)+우선 검토: 한도 이내 → '보유 지속 검토(매도 근거 부족)' / 비중 초과(10%, 확신 25%) → '일부 축소 검토 가능(세금·비용·재진입 위험 비교)' / 밸류에이션 높음만 → '일률 매도 아님, 분할매도 여부는 순태씨'.
- 훼손 우려: 곡소리면 '곡소리 아님', 상승 중이면 '상승 중이지만 경쟁력 훼손 신호', 신호 없음이어도 경고(warning:true).
- 가격 기준일 7일 초과 → 가격 신호 판단 보류. 밸류에이션 = 자기 과거 값 대비 위치(상위 80%↑ 높음, 20%↓ 낮음) — 합성 입력만, 실제 주식 수·FCF 배수 미연결.
- 출력 전체 금지어 검사(확정·자동 매수/매도·주문 실행·매수하세요 등) → 걸리면 판단 보류로 차단.

## 캐시(⑩)
- (1431 정정: 같은 JS 인스턴스 안에서만, 새로고침은 재계산) `createEvaluator()`: 키 = 기준일(UTC 날짜) + 입력 JSON. 같은 입력 재평가 시 계산 0회(시험: computed 2→2, cacheHits 2). 입력·날짜가 바뀌면 다시 계산. 최대 200개, 메모리만(저장소 0).

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
