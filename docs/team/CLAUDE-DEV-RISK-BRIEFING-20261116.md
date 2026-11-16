STATUS: READY_FOR_REVIEW
ORDER-ID: GPT-20261116-1030 (GPT-REVIEW-risk-briefing-20261116-1330 CR-3·CR-4 반영)
BASE: 978a2c02eb1281bb33bf675adaa85642014e8c0f
HEAD: 5e4aed9d2742248b7a3d413eb6471a16cc476114
REVIEW-SCOPE: 978a2c0..5e4aed9 중 has/decision-brief.js·tests/decision-brief.test.cjs·tests/lib/live-data-pins.json(decision-brief.js 해시만). 중간 merge는 main 59bec81(문서만) 반영. 화면·CSS·portfolio_v5.html 변경 없음. 운영 반영 아님 — main 병합·배포는 순태씨 '올려' 후.
UPDATED: 2026-11-16 14:20 KST (정각 실행)

## 0-b. CR 반영 (GPT-REVIEW-risk-briefing-20261116-1330)
- **CR-3 같은 종목 다계좌·중복:** `verifyGroup()`이 같은 티커의 **모든** 기록을 `verify()`로 검사 — 한 건이라도 실패하면 '같은 종목 N건 중 검증 실패: <사유>'로 종목 전체 판단 보류. 모두 통과해도 보유 여부·기준 시각·시장·실제/합성이 서로 다르면 '같은 종목 기록 상충(<항목>)'로 보류. 순서와 무관(정·역순 시험). 속성이 같은 유효 중복은 1건. 그룹 맵을 `Object.create(null)`로 바꿔 `constructor`·`__proto__`·`toString`·`hasOwnProperty` 티커도 일반 키로 처리(던지지 않음·오염 없음).
- **CR-4 브리핑 판단 시각·실제/합성 필수:** `brief.generatedAt` 없음·빈 값·손상·숫자형이면 '브리핑 판단 시각 없음'으로 보류(미래 확인 건너뛰기 제거), 유효하면 `asOf ≤ generatedAt+60초` 항상 강제. `brief.basis`가 'real'/'synthetic'이 아니면(누락·빈 값·'unspecified') '브리핑 자료 구분(실제/합성) 없음', 조언 basis와 다르면 보류.
- 시험 신규 2건: CR-3(정상 다계좌·역순·한쪽 불신뢰·출처 누락·기준 시각 상충·보유/미보유 혼합·시장 상충·위험 키) / CR-4(생성시각 누락·빈·손상·숫자·미래 asOf·basis 누락·빈·unspecified·불일치 + 정상 실제·합성 회귀, 실제 엔진 경로 'unspecified' 브리핑 후보 0).
- 전체 `node --require ./tests/lib/no-network.cjs --test tests/*.test.cjs`: **2239 중 2237 통과 / 0 실패 / 2 skip**. `tools/scan-secrets.cjs` 발견 0.
- 화면 변경 없음(분류 논리만) → 이번 단위 Chromium 재확인 생략, 이전 단위 결과 유효. 갤럭시 실기기 미검증.
- 순태씨 결정 필요: 없음(지피 재검토 APPROVE 후 운영 반영 여부만).

## 0. CR 반영 (GPT-REVIEW-risk-briefing-20261116-1230)
- **CR-1 첫 화면 3카드:** 접힌 기본 화면에 '매수 검토 N건 · 매도 검토 N건 · 장기보유 N건' 3분할 상태 카드(`data-testid=hdb-mini`, 각 `hdb-card-buy/sell/hold`)를 접기 **밖**에 배치. 종목·근거·반론·판단 보류 사유는 같은 버튼 '펼치기 ▼' 안(`hdb-list-*`, `hdb-card-pending`). 0건이면 '0건' 그대로, 예시 수치·종목 없음. 중요 위험 한 줄·가격 신뢰도 경고는 그대로 접기 밖.
- **CR-2 검증된 후보 계약(fail-closed):** `classify()`가 새 `verify()`를 거쳐야만 후보로 셈 — 실제/합성 구분 존재·화면과 일치, `dataQuality.ok===true`, 실제 근거 문장(공백 제외)·반론 1개 이상, 출처 있는 사실 1개 이상, 기준 시각 존재·파싱 가능·생성 시각보다 미래 아님, 매도 검토·장기보유는 `holding.held===true`. 같은 종목에 다른 의견이 있으면 '같은 종목 의견 상충'으로 보류. 어긋나면 판단 보류 + 사유(예: '자료 신뢰성 미확인'). '규칙 엔진 근거' 같은 대체 문구 승격 제거. 항목에 `verified` 표시.
- 시험: 반례 17건(지피 예시 `{ticker:'X',opinion:'매수 검토',basis:'real',dataQuality:{ok:false}}` 포함)·상충·중복·합성 엔진 정상 경로 유지·입력 불변 + 접힌 화면 3카드 DOM 단언. 기존 ② 수제 객체는 완전한 계약으로 고침, ④ 사유 기대값 갱신.
- 전체 `node --require ./tests/lib/no-network.cjs --test tests/*.test.cjs`: **2237 중 2235 통과 / 0 실패 / 2 skip**(이전 보고의 universe-screen-dom 실패 1건은 이번 환경에서 재현되지 않음 — 원인 미조사, 환경 의존 가능성). `tools/scan-secrets.cjs` 발견 0.
- Chromium(Playwright, 실제 앱 로딩·합성 보유 자료·외부 요청 차단) 360/390/430/1280: 접힌 상태에서 3카드 모두 보임(360px 3분할 각 102px, 화면 안 y≈579), 가로 넘침 0(펼침 포함), 12px 미만 글자 0, 펼침→접힘 정상, 페이지 오류 0. 캡처 미커밋. 갤럭시 실기기 미검증.
- 순태씨 결정 필요: 없음(운영 반영 여부만 — 지피 재검토 APPROVE 후).

## (이전 단위 보고 017e803)

# 위험관리 상단 '오늘의 투자 판단'·같은 버튼 펼치기/접기 — 1단위 완료

## 1. 현재 구조 확인(재사용)
- 상단 띠 두 개는 `portfolio_v5.html`의 `#hasPriceTrust`(원본 `has/price-trust-ui.js`, KIS 보호 파일 — 수정 안 함)와 `#hasBriefStrip`(원본 `has/advisor-panel.js` refreshStrip). 둘 다 헤더 고정 래퍼(`position:sticky`, 대분류·하위 탭까지) **바깥**에 있어 실제로는 화면 스크롤을 따라 사라짐(Chromium 계산값 position `static/static` 확인). 그래서 고정 해제 코드는 필요 없었고 바꾸지 않음. 모든 탭 상단에 보이는 것은 기존과 같음.
- 계산은 기존 브리핑(`has/briefing-model.js`)·규칙 엔진(`has/advisor-core.js`) 결과를 그대로 읽기만 함. 운영 화면은 외부 자료를 넣지 않으므로(`ext = {}`) 현재 운영 결과는 **매수 검토 0 · 매도 검토 0 · 장기보유 0**, 나머지는 판단 보류.

## 2. 변경 파일
- 신규 `has/decision-brief.js` — 순수 분류 `classify(brief)` + 화면. 규칙 엔진 의견 '매수 검토' → 매수 검토, '비중 축소 검토' → 매도 검토, '보유'(보유 종목만) → 장기보유, 그 외·알 수 없는 값·실제 화면의 합성 의견 → 판단 보류(사유 = 엔진 반대 근거). 중요 위험 = 집중·손실·현금 부족, 자료·가격 최신성은 '자료 확인'으로 따로. 저장소·네트워크 없음, 입력 불변.
- 신규 `has/decision-brief.css` — 버튼 모양(44px 이상), 3카드 반응형 격자, 글자 12px 이상·#333 이상, `#subtabs-risk` 줄바꿈(가로 스크롤 제거).
- `portfolio_v5.html` 3줄: CSS·스크립트 추가, `switchTab`에서 `HASDecisionBrief.onTabChange(tab)`(탭 이동 시 모두 접힘).
- `has/advisor-panel.js` 1줄: `HASDecisionBrief`가 있으면 띠를 새 요약으로 그림(없으면 기존 띠 그대로).
- `tests/decision-brief.test.cjs` 신규 8건, `tests/lib/live-data-edits.json` 역방향 쌍 4개(역적용으로 원본 재현 확인), `live-data-pins.json` currentSha256·addedRuntimeFiles 갱신.

## 3. DOM 경로 (전 → 후)
- 브리핑: `#hasBriefStrip > span[data-testid=hs-strip-text] + button[data-testid=hs-strip-open](AI 참모로 이동)` → `#hasBriefStrip.hdb > .hdb-head > (span[data-testid=hs-strip-text] + details > summary.hdb-toggle[role=button][aria-expanded][aria-controls] + .hdb-body(매수/매도/장기보유 카드 · 판단 보류 카드(사유 상위 3) · 위험·자료 확인 · 안내 · button[data-testid=hs-strip-open]))` + `.hdb-risk[role=alert]`(중요 위험 한 줄, **접기 바깥**).
- 가격 신뢰도: `#hasPriceTrust > .hpt-head + details > summary('자세히 보기') + .hpt-line…` → 같은 위치에서 summary만 `summary.hdb-toggle('펼치기 ▼'/'접기 ▲', aria-expanded)`, 상세 줄은 `.hdb-body`로 감쌈. 경고 문구(`.hpt-head`)는 접기 바깥 그대로·문구 불변.
- 후보별 상세 근거: 각 후보 `.hdb-item > details > summary.hdb-toggle`(같은 패턴, 근거·반론·기준).

## 4. 동작
- 처음·탭 이동 후 재진입: 모두 접힘. 같은 버튼 1회 펼침, 다시 1회 접힘. 클릭/터치/Enter/Space 모두 같은 처리, 문구·aria-expanded **즉시** 일치(처음 구현에서 toggle 이벤트 지연으로 한 박자 늦던 것을 Chromium에서 발견해 클릭에서 직접 열고 닫게 수정).
- 내부 'AI 참모에서 자세히' 버튼은 접지 않음. 가격 신뢰도·브리핑·후보 상세 각각 독립.
- 자료 갱신으로 다시 그려도 펼친 상태 유지·새 숫자 반영, 점검 실패면 '점검 불가' 표시.

## 5. 시험
- 신규 `tests/decision-brief.test.cjs` 8건 통과: ① 보유 40·위험 1 합성 → 매수·매도·장기보유 0, 판단 보류 40, 중요 위험 1(상수 아님 확인) ② 합성 예시 → 매수 검토 1(재무·논리 확인된 것만), 수작업 의견 → 각 1 ③ 재무 제거 시 -40% 하락도 판단 보류('가격만 하락'), 상승·고점만으로 매도 검토 아님, 집중 위험만으로 매도 아님 ④ 알 수 없는 의견·미보유 장기보유·합성 의견·손상 입력 → 보류 ⑤ 접힌 상태에서 가격 경고·위험 한 줄·집계 보임 / 2회 토글·즉시 aria / 탭 이동 접힘·재진입 접힘·갱신 후 유지·재터치 / 정적 최소 변경·12px.
- 전체: `node --require ./tests/lib/no-network.cjs --test tests/*.test.cjs`(jsdom 26.1.0 별도 폴더) **2208 중 2205 통과 / 1 실패 / 2 skip**. 실패 1건 `tests/universe-screen-dom.test.cjs`(종료 후 비동기 활동)는 **이번 변경 전 main(`0857a4b`)에서도 같은 환경에서 동일 재현** — 이번 변경과 무관, 원인 미조사(다음 확인 대상). 비밀값 검사 발견 0.
- Chromium(Playwright, 앱 실제 로딩·합성 보유 자료·외부 요청 차단·GAS 가짜 응답) 360/390/430/1280px: 문서 가로 넘침 0(펼친 상태 포함), 하위 메뉴 잘림 0·막대 가로 스크롤 0, 토글 aria false→true→false, Enter 펼침·Space 접힘, 탭 이동 후 접힘, 가격 신뢰도 독립 토글, 버튼 높이 44px, 12px 미만 글자 0, 페이지 오류 0. 캡처는 저장소에 커밋하지 않음.

## 6. 미완료·미검증
- **갤럭시 실기기 미검증.**
- 360px에서 위험관리 하위 메뉴가 5줄(390·430px은 3줄)로 늘어나 헤더 고정 영역이 길어짐 — 가로 스크롤 대신 줄바꿈하라는 지시에 따른 결과. 순태씨가 보기에 너무 길면 짧은 이름(예: '체험판' 표기 축약)을 다음 단위에서 제안.
- 상품 유형 불명·ETF/기업 분류·다계좌 충돌은 '위대한 기업' 탭 엔진에서 이미 보류 처리(이번 요약은 규칙 엔진 의견만 집계). 시세 오류·오래됨은 기존 엔진 시험(briefing-stage25 #6)으로 판단 보류 확인 — 이번 요약은 그 결과를 보류로 셈.
- 실제 재무(SEC·DART) 미연결이므로 운영에서 매수·매도·장기보유 숫자는 0이 정상. 매수·매도 실행 게이트는 계속 닫힘.

## 7. 순태씨 결정 필요
- 지피 정적 검토 APPROVE 후 운영 반영('올려') 여부.
