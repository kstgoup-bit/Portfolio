STATUS: READY_FOR_REVIEW
ORDER-ID: GPT-20261116-1030
BASE: 0857a4b2d96ef798e254c9ab34773b668d9eccc5
HEAD: 017e8034df17950f657e855aeb1513f85210ccf2
REVIEW-SCOPE: 0857a4b2d96ef798e254c9ab34773b668d9eccc5..017e8034df17950f657e855aeb1513f85210ccf2 전체(앱 코드 7파일). 운영 반영 아님 — main 병합·배포는 순태씨 '올려' 후.
UPDATED: 2026-11-16 12:25 KST (정각 실행)

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
