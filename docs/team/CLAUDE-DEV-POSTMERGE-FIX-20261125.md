STATUS: READY_FOR_REVIEW
ORDER-ID: GPT-REVIEW-postmerge-queue-20261125-1330 CR-D1·D2 (+ 1230 CR-C1·C2, 1130 CR-B1~B3, 1030 CR-A1·A2, 0930 CR-1~CR-5, 순태씨 D1~D5 승인)
BRANCH: work/claude-postmerge-fix-20261125
BASE: d5f011497dfd30bb776f09e047b340d9f9a04be5
HEAD: 8b2c9b296d7c4793387a6ac967cd6f7fadc1604c
REVIEW-SCOPE: BASE..HEAD 전체. 이번 새 범위는 `9ef7ee1..8b2c9b2`(merge main `0efc63b` + `8b2c9b2`) — tools/consensus-evidence.cjs(영역 계약·ref·CLI), tests/postmerge-crd.test.cjs(신규 11건), tests/postmerge-crc.test.cjs(근거를 영역으로 감싸게 기대값 갱신·index.json 목록 파일 제외·없는 커밋은 오류), tests/lib/live-data-pins.json. 앱 런타임 파일·portfolio_v5.html·reviews 변경 0.
UPDATED: 2026-11-25 14시대 KST (정각 예약 실행)

## 단위 G — 지피 1330 CR-D1·D2 반영 (`8b2c9b2`, 최신 main `0efc63b` 병합 후)
- CR-D1 예시가 합의로 인정되던 경로 차단: 근거는 **단일 기계 판독 영역**에서만 읽는다(계약 제안, 적용은 순태씨 승인 대상).
  - 지피 파일: 줄 맨 앞 `BEGIN-CONSENSUS-EVIDENCE` / `DOC-STATUS: FINAL` / `REVIEW-DATE: YYYY-MM-DD` / `CONSENSUS-EVIDENCE: …` 줄들 / `END-CONSENSUS-EVIDENCE`. 클로 재검토 파일: `BEGIN-CLAUDE-ACCEPT` … `CLAUDE-ACCEPT: …` … `END-CLAUDE-ACCEPT`(같은 머리줄).
  - 근거 아님(무시): 영역 밖 줄(설명·예시·원문 인용 — 그대로 보존), 코드펜스(``` · ~~~) 안, HTML 주석(한 줄·여러 줄) 안, 들여쓴 줄, 인용(`>`) 줄.
  - 실패(발행 보류): 영역 0개·2개 이상·중첩·닫히지 않음·END만, 영역 안 다른 문장·들여쓴 근거 줄·펜스/주석, DOC-STATUS가 정확히 FINAL 아님(DRAFT·소문자 등), 머리줄 누락·중복, REVIEW-DATE ≠ 카드 날짜. 지피 파일이 있는데 영역이 없으면 no-response도 실패(fail-closed).
  - 지피 반례(코드펜스 안 `CONSENSUS-EVIDENCE: 005930 KR sell-review 2026-11-25 AGREE` 한 줄) → `gpt-no-region`, agreed 불가 확인. 양성: 설명·예시 펜스와 함께 올바른 영역 1개 → agreed.
- CR-D2 원문 고정·실패 폐쇄:
  - `--gpt-ref SHA` / `--claude-ref SHA`(둘 다는 `--ref`)로 지피 원문과 클로 수락 원문을 **서로 다른 커밋**에 각각 고정. ref는 40자리이고 `git cat-file -e <sha>^{commit}`로 실제 커밋인지 **카드 0건이어도 먼저** 검사(아니면 종료 2).
  - CLI: 입력 파일 0개·알 수 없는 옵션·ref 값 누락 → 종료 2. JSON 읽기 실패·객체 아님·`cards` 비배열·잘못된 카드 → 실패 항목(종료 1, 빈 성공 없음). 합의 카드 0건이면 `0 consensus cards — 합의 근거 검사 대상 없음(solo N)`으로 범위 명시. 모든 출력 끝에 `gpt@<sha|working-tree> claude@<…>`, 고정 안 되면 '(원문 고정 안 됨 — 발행용 아님)'.
  - 합성 git 저장소 시험: ref 원문으로 검사(커밋 안 한 작업 트리 변경 무시, 작업 트리 검사는 바뀐 원문을 봄), 다른 원문 커밋은 실패, 지피·클로 SHA 분리(수락 이전 커밋을 claude-ref로 주면 `claude-accept-missing`), 지피 파일이 없는 커밋 → `review-file-missing`, 잘못된 ref·없는 커밋·인자 없음·잘못된 카드 배열.
  - 한계(지피 지적 그대로 명시): 이 검사는 '그 커밋의 파일명·영역 줄이 계약에 맞다'만 증명한다. 실제 두 AI가 작성했다는 출처 증명은 아니다. 앱은 여전히 원문을 읽지 않는다.
- 문서 제안(적용 안 함 — 순태씨 승인 대상):
  1. 출처 결합: 카드 consensus에 `gptReviewSha`(지피 검토 파일이 처음 들어온 docs/gpt-* 커밋), `claudeOriginSha`(07:05 클로 원판단 reviews JSON 커밋), 이견 수락 시 `claudeAcceptSha`(CLAUDE-AI-RECHECK 커밋)를 저장하고, 발행 검사는 각 SHA에서 해당 경로만 읽는다. 원판단은 `git show <claudeOriginSha>:reviews/<file>`의 같은 종목 verdict와 카드 원판단 일치로 확인.
  2. 필수 관문: 07:45 발행 절차에서 최종 reviews JSON에 `node tools/consensus-evidence.cjs --gpt-ref … --claude-ref … <파일>`이 종료 0일 때만 커밋·push, 1·2면 consensus를 넣지 않고(클로 단독 유지) 일지에 실패 사유 기록.
  3. 과거 카드 불변: 이미 게시된 날짜의 카드에는 consensus를 나중에 추가·변경하지 않는다(새 날짜 파일만). 전체 시험의 게시 JSON 검사(`postmerge-crc` 마지막 시험)는 유지.
- 시험: 신규 `tests/postmerge-crd.test.cjs` 11건(D1 7, D2 4). 기존 `postmerge-crc` C1 시험 본문을 영역으로 감싸 같은 반례 유지 + 영역 밖 수락 줄 무시, 파일 있는데 영역 없음 실패 추가. 전체 2419 · pass 2417 · fail 0 · skip 2, scan-secrets findings 0. 화면 변경 없음(노드 도구만) → Chromium 재확인 생략.
- 고정 파일: live-data-pins `tools/consensus-evidence.cjs` 해시 갱신(addedRuntimeFiles, 앱에 안 실림).
- 유지: reviews JSON consensus 0건·과거 카드 승격 없음·agreed 발행 없음, 자동 대조 하루 1회·재시도 보류, 공식 거래일·시세 종류·G0·실제 앱·폰·GAS·백업 복원 미검증, 운영 미반영.
- 순태씨 결정 필요: (1) 영역 계약을 지피 검토 파일·07:45 절차·COLLAB-PROTOCOL에 적용할지 (2) 위 SHA 3필드 저장 계약 (3) 운영 반영은 지피 APPROVE 뒤 '올려'.

## 단위 F — 지피 1230 CR-C1·C2 반영 (`ee4ece5`, 최신 main `a935349` 병합 후)
- CR-C1 합의 발행 근거(차단 해소 제안): `tools/consensus-evidence.cjs` 신규(노드 전용, 발행 단계 검사). **기계 판독 계약(제안)**: 지피 검토 파일 줄 `CONSENSUS-EVIDENCE: <종목> <KR|US> <클로 원판단> <YYYY-MM-DD> AGREE|DISAGREE [PROPOSE=<지피 판단>]`, 지피 이견에 클로가 동의한 경우에만 클로 파일 `docs/team/CLAUDE-AI-RECHECK-YYYYMMDD.md` 줄 `CLAUDE-ACCEPT: <종목> <시장> <지피 판단> <날짜> <지피 검토 파일>`. 
  - agreed = 그 종목·시장·날짜 근거 줄 정확히 1개 + (AGREE·원판단=카드 판단·클로 수락 줄 없음) 또는 (DISAGREE PROPOSE=카드 판단 + 같은 파일을 가리키는 클로 수락 정확히 1개). disagree = DISAGREE·원판단=카드 판단·수락 없음. no-response = 그 종목 근거 줄 없음(파일 없어도 됨) — 응답이 있으면 차단. 그 밖(문장 속 AGREE·`005930: DISAGREE`·AGREE_NO_CHANGE·APPROVE, 다른 종목/시장/판단/날짜, 중복·충돌, 형식 오류 줄, 파일 없음, 카드 consensus 필드·발행일 불일치)은 모두 실패.
  - 원문 위치·SHA 결합: 기본은 작업 트리 `docs/team/<review>`. `--ref <40자리 커밋 SHA>`를 주면 그 커밋의 `docs/team/<review>`를 git에서 읽어 검사(없으면 실패=보류). 지피 원문이 `docs/gpt-*` 브랜치에만 있으면, 그 브랜치 커밋 SHA로 `--ref` 검사하거나 main docs/team 사본을 둔 뒤 검사해야 한다. 카드 JSON에 `reviewSha` 같은 새 필드로 SHA를 묶는 것은 **데이터 계약 변경이라 넣지 않음**(순태씨 승인 대상 제안).
  - 우회 여부: 앱(has/review-cards.js)은 원문을 읽지 않고 카드 consensus 필드만 본다(기존 한계 그대로, 런타임 합의 표시는 발행 단계의 검증된 기록에 의존). 발행 검사는 ① 전체 시험 `tests/postmerge-crc.test.cjs` 마지막 시험이 게시된 `reviews/*.json`의 모든 consensus 카드에 실제 `verifyFile()`을 호출 ② 수동 `node tools/consensus-evidence.cjs reviews/<파일>.json [--ref SHA]`(실패 시 종료코드 1). 07:45 예약 발행 절차가 이 검사를 반드시 실행하도록 하는 것과 지피 검토 파일 형식에 위 줄을 쓰는 것은 **COLLAB-PROTOCOL·예약 작업 변경이라 이번에 바꾸지 않음**(지피 확인 + 순태씨 승인 후 적용). 그 전까지 클로는 consensus `agreed`를 발행하지 않는다(현재 게시 JSON consensus 0건, 과거 카드 승격 없음, reviews 파일 변경 0).
  - 옛 `body.includes(ticker) && /APPROVE|AGREE/` 시험은 삭제하고 위 검사로 대체.
- CR-C2 KIS 20일 과대표시: `compare()`에 `full`(공통 응답 날짜 ≥ 20) 추가, 전부 일치해도 20개 미만이면 status `short`('✅ 최신 종가 일치 · 20일 자료 부족', #333). `match` 라벨은 '✅ 공통 응답 20일 일치(참고)'. 결과 줄 '최신 종가 일치 N · 공통 응답 20일 일치(참고) N · 20일 자료 부족 N'(20일 일치는 checked ≥ 20인 match만). 종목별 '최근 N거래일' → '공통 응답 날짜 N일 중 M일 일치 (자료 부족 · 20일 미만 | 공식 거래일 아님)'. 기록 줄 '(공통 응답 20일 일치와는 별개)'. 저장 형식·recordFrom·trustSummary·연속 집계 변경 0(최신일 일치 판정은 그대로).
- 시험: 신규 `tests/postmerge-crc.test.cjs` 11건 — C2 순수(1/1·19/19 short, 20/20 match, 20일 중 과거 차이 partial, 30일→20개 제한, 출처 지연 stale) + 실제 kis-crosscheck.js DOM(1/1, 19/19, 20/20, 20일 중 과거 차이, Yahoo 누락일→공통 19일 자료 부족, KIS 최신일 지연 ⏳미검증); C1 양성 AGREE, 음성(지피 반례 `005930: DISAGREE (매도 검토 반대)`, AGREE_NO_CHANGE, APPROVE, 문장 속 AGREE, DISAGREE 줄, AGREE_NO_CHANGE 토큰), 다른 종목·시장·판단·날짜·중복·충돌·형식 오류·추가 토큰·파일 없음·발행일·필드 불일치·파일명 날짜, 이견→클로 동의(수락 없음/다른 판단/다른 파일/정상, 원판단 agreed 불가, AGREE+수락 모호 차단), disagree·no-response 별도 규칙, `--ref` 40자리 SHA만·없는 커밋은 보류, 게시 JSON 발행 계약. 기존 기대값 갱신: kis-crosscheck(2일 일치 match→short), d2d3(같음), crb(결과 문구).
- 고정 파일: live-data-pins `has/kis-crosscheck.js` currentSha256 갱신, `tools/`가 보호 경로라 `tools/consensus-evidence.cjs`를 addedRuntimeFiles에 검토된 추가로 등록(앱 런타임에는 안 실림, portfolio_v5.html 변경 0).
- 전체 2408 · pass 2406 · fail 0 · skip 2, scan-secrets findings 0, `node tools/consensus-evidence.cjs reviews/*.json` → all ok(합의 카드 0건). Chromium 360/390/430 합성 하네스(실제 kis-crosscheck.js, 20일 일치 1종목 + 1일 자료 부족 1종목, 외부 요청 차단): 가로 넘침 0, scrollWidth=뷰포트, 최소 글자 13px.
- 지피 잔여 제한 수용: 자동 대조는 '이 기기 저장 기록 기준 하루 1회(동시 탭·백업 복원 미검증)', lastFail은 메모리 상태라 새 인스턴스의 최근 실패로 주장하지 않음, 하루 2회 재시도 보류 유지. 공식 거래일·시세 종류·G0·실제 앱·폰·GAS·백업 복원 미검증. 운영 미반영.
- 순태씨 결정 필요: (1) 합의 근거 계약(위 두 줄 형식)을 지피 검토 파일·07:45 발행 절차에 적용할지 — 승인 전에는 '지피 합의' 발행 없음. (2) 카드 consensus에 검토 원문 SHA 필드 추가 여부(데이터 계약 변경). (3) 운영 반영은 지피 APPROVE 뒤 '올려'.

## 단위 E — 지피 1130 CR-B1·B2·B3 반영 (`0c7e93d`, 최신 main `c5b0a40` 병합 후)
- CR-B1 가격 신뢰도 띠: `currentSet()`(수량>0·중복 제거, KIS 대조와 같은 기준·앞 15개 지문) 추가. `trustSummary(row, now, hasUS, cur, lastFail)` — 기록 지문·총수가 현재 보유와 다르면(같은 개수 다른 집합·추가·삭제) warn '보유 종목이 바뀌어 … 현재 보유 검증이 아님', 0종목·미확인은 info '참고만', 최근 조회 실패는 warn. 모두 맞아도 공식 거래일·시세 종류 미확인이라 **녹색(ok)·✅ 없음**(info '참고 대조'). 띠 등급은 앱 가격 경로(gas-jsonp, 미검증 warn)보다 낮아지지 않고, KIS 문구는 `hpt-kis` 보조 줄로만.
- CR-B2: `streak()` 날짜 중복 제거, 응답 날짜 사이에 평일이 비면(공급자 누락·휴장 불명) 보수적으로 끊음(예: 11/20·11/24만 → 1). 화면은 '확인된 응답 날짜 기준 연속 일치 N일 (참고 집계 · 공식 거래일 연속·G0 근거 아님)', 최근 실패·부분 성공·집합 불일치면 연속 미표시. '최신 종가 일치'와 '20일 비교창 전체 일치'를 결과·기록 줄에서 분리. 하단 안내에서 '20거래일 쌓이면 보류 해제 검토' 문구 → '참고용, 보류 해제 근거로 쓰지 않음'.
- CR-B2 자동 재시도: 메모리 횟수 대신 **자동 대조 시작 전에 기존 기록(`has_kisCrossLog_v1`)의 기존 필드 `autoDay`에 오늘을 기록** → 앱 재시작·새 탭·10분 경과에도 같은 날 자동 1회만(AUTO_MAX 1), 실패해도 자동 재시도 없음(버튼 수동 대조는 그대로). 기록을 쓸 수 없으면 자동 대조 안 함. 새 키·새 필드·백업 형식 변경 없음. → 순태씨 D3에서 승인한 '하루 2회 재시도'는 증명 가능한 설계 전까지 **보류**(아래 결정 필요).
- CR-B3: `policyOf()/tally()/tallyParts()` 공통 정책 — 합의(agreed, 7일 이내)된 비매수 판단만 '지피 합의 매도 검토 N' 등 판단 건수, 단독·기록 불일치·만료·무응답·불일치는 상태 건수(행동 집계 제외), 매수 쪽은 합의여도 '매수 쪽 판단 보류'(건수 없음). 곡소리 카드 요약줄·보유 띠·상세 라벨에 동일 적용. 상세에서 합의 전 비매수 카드는 상태 라벨 + '클로 조사 원문 판단: … (합의 전 참고 · 현재 합의된 행동 아님)' #333, 헤드라인 '📝 클로 조사 의견(원문 인용 · 합의 전 참고)'. 불일치·무응답은 기존처럼 원 판단 숨김. 매수 잠금 유지.
- CR-B3 발행 계약(제안 + 시험): 게시 JSON 카드에 `consensus`가 있으면 `docs/team/<review>` 파일이 실제로 있고 종목·APPROVE/AGREE 근거가 있어야 시험 통과(아침 문서만으로 과거 카드 일괄 승격 방지). 현재 게시 JSON엔 consensus 없음 → 모두 '클로 단독'.
- 시험: 신규 `tests/postmerge-crb.test.cjs` 14건 — B1 순수(동일 개수 다른 집합, 추가/삭제/0종목/null, 6일 이내 오래된 동일 종가·주말, 실패 후 과거 row) + 실제 price-trust.js·kis-crosscheck.js·price-trust-ui.js DOM(warn 유지, 수량 0·중복 제거, 집합 변경·0종목 문구); B2 평일 누락·중복, 실제 스케줄러 경로(DOMContentLoaded→첫 1회, visibilitychange·10분 뒤·새 인스턴스 0회, 날짜 변경 1회), 저장 실패 시 자동 없음·수동 가능, 부분 성공 후 연속 미표시, 최신일/20일창 분리; B3 합의/단독/불일치/무응답/만료/기록 불일치 매도·축소·보유 혼합(보유 띠·상세·요약 합계 7, 매수 쪽 건수 없음), 7일 경계, 다른 종목·판단·잘못된 시각, 발행 계약. 기존 시험 기대값 갱신: d2d3(ok→info+현재 집합, 하루 1회), held(관망 라벨→원문 인용), gate-neutral(비매수 헤드라인 인용·보유 띠 상태 건수).
- 전체 2397 · pass 2395 · fail 0 · skip 2, scan-secrets 0. Chromium 360/390/430 합성 하네스(실제 4개 모듈, 외부 요청 차단): 가로 넘침 0, 최소 글자 13px, 띠 `hpt-warn` 유지, 집합 변경 문구, 보유 띠 '지피 합의 매도 검토 1 · 클로 단독 의견 2 · 매수 쪽 판단 보류', 정찰병/30% 문구 0.
- 미완료·미검증: 공식 KRX 거래일 달력·시세 종류 연결(GAS 변경, 별도 승인 과제), 실제 앱·폰·GAS·백업 복원 미확인, 성적표 5% 예외 입력 안내(별도 큐). 운영 미반영.
- 순태씨 결정 필요: (1) 자동 대조 실패 시 재시도 — 지금은 하루 1회로 보류. 재시도를 원하면 기존 `autoDay` 대신 일별 시도 횟수 메타데이터(새 필드, 백업 포함) 설계 승인이 필요. (2) 운영 반영은 지피 APPROVE 뒤 '올려'.

## 단위 D — 지피 1030 CR-A1·CR-A2 반영 (`5ad779c`, 최신 main `b122791` 병합 후)
- 1030 검토는 `9449668`(단위 A) 기준이었고 11시대 `6d96cf0`에도 CR-A1·A2가 남아 있음을 코드로 확인 → 반영.
- CR-A1: 카드의 차트 관문 줄을 `G.describe().label/color` 대신 표시 계층 중립 문구로: 하락 추세 / 바닥 다지기 / 20일선 회복 / 60일선 회복·저점 상승 / 차트 자료 부족 + ' · 타이밍 참고(판단 보류)', 색 #333. buy·add·hold-long 모두. 숫자 참고줄(종가일·20/60일선 방향·저점 상승)은 유지. chart-gate.js 산식·STAGE·캐시·분할정책 변경 0.
- CR-A2: 보유 현황 띠 '추가 매수 후보(판단 보류) N' 건수 제거 → '매수 쪽 판단 보류'(숫자 없음), 장기보유·비중 축소 등 다른 건수 유지. 매수 쪽(buy/add) 카드 헤드라인 앞에 '📝 클로 조사 의견(원문 인용 · 매수 권유 아님):' 표시. JSON 원문·verdict·성적표·실전 기록 변경 0.
- 시험: 신규 9건 — 실제 chart-gate.js 를 로드해 describe 계약(basing에 '정찰병' 포함) 확인 후 5단계 전부·국내/미국·buy/add/hold·재렌더(다시 확인)·관문 없는 목록에서 '정찰병/10%/30%/가능/5%/예외 정찰' 미표시·#333 검증, 단정적 헤드라인 구분, 보유 띠 건수 숨김/유지. 기존 held 시험 1줄 기대값 갱신.
- 전체 2383 · pass 2381 · fail 0 · skip 2, scan-secrets 0. Chromium 360/390/430 합성 하네스(실제 chart-gate.js + review-cards.js, 외부 요청 차단): 가로 넘침 0, 최소 글자 13px, 관문 줄 3, 행동 문구 0.
- 범위 밖(지피 지시대로 손대지 않음): 성적표 과거 의견·실전 기록의 5% 예외 입력 안내 — 별도 큐 검토. 실제 앱 전체 화면·폰·GAS 미확인. 운영 미반영.

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
