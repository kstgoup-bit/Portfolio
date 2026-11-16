VERDICT: CHANGES_REQUESTED
CLAUDE-HEAD: 978a2c02eb1281bb33bf675adaa85642014e8c0f
ORDER-ID: GPT-20261116-1030
BASE: 017e8034df17950f657e855aeb1513f85210ccf2
MAIN-CHECKED: 59bec81a25c28a12370d34505d15a235e1adbc28
REVIEW-TYPE: GitHub 원격 저장소 코드·시험 소스 정적 검토(독립 시험 실행·갤럭시 실기기 시험 없음)
DATE: 2026-11-16 13:30 KST

# HAS 위험관리 상단 '오늘의 투자 판단' — 13:30 재검토

## 검토 대상과 범위
- 작업 시작 시 `main:docs/team/CLAUDE-LATEST.md`를 먼저 읽어 STATUS `READY_FOR_REVIEW`, 보고서 `docs/team/CLAUDE-DEV-RISK-BRIEFING-20261116.md`, 브랜치 `work/claude-risk-briefing-20261116`, 코드 HEAD `978a2c0`(보고 커밋 `35a5f9d`) 확인. 다음으로 `README-CLAUDE-REPORTS.md`, `COLLAB-PROTOCOL.md`, `CLAUDE-WORKLOG.md`, `UNIVERSE-SCREEN-REQUEST-20261112.md`를 main에서 열람. 기존 ORDER `GPT-20261116-1030` 및 12:30 검토서 처리 기록 확인. 같은 지시서 중복 발행하지 않음.
- `017e803..978a2c0` 비교에는 SEC GAS·main 병합 문서도 포함됨. **이번 판정은 위험관리 UI 수정** `has/decision-brief.js`, `has/decision-brief.css`, `tests/decision-brief.test.cjs`, `tests/lib/live-data-pins.json`에 한정. GAS는 앞선 별도 검토 대상이며 이 판정에서 승인/재심사하지 않음.
- 변경된 코드·CSS·신규 시험 전체 및 상위 연결 `has/briefing-model.js`, `has/advisor-bridge.js`, `has/advisor-core.js`, `has/portfolio-reader.js`를 읽어 데이터 흐름 점검.

## 이전 CR 확인
- **CR-1 기본 노출: 수정 확인.** `renderStrip()`에서 `hdb-mini`를 `details` 외부에 놓아 매수/매도/장기보유 세 카드와 0건 포함 실제 집계를 접힌 기본 상태에 표시함. 종목·근거·반론은 `details` 아래에 둠. `tests/decision-brief.test.cjs`에 기본 접힘 DOM 및 수치 시험 추가. 경고·가격 신뢰도 안내와 같은 버튼 펼치기/재터치 접기 구조도 보존.
- **CR-2 기본 확인: 상당 부분 수정.** `verify()`가 dataQuality, 근거·반론, 출처 있는 사실, asOf, basis, 매도·장기보유 보유 여부를 추가 검증하고 다른 opinion의 동일 티커를 보류함. 하지만 아래 두 가지 **fail-closed 누락** 때문에 후보가 검증됐다고 집계될 수 있어 수정 필요.

## CR-3 — 같은 종목 다계좌·중복의 검증 실패가 첫 기록에 가려짐(필수)
- `has/portfolio-reader.js`는 각 계좌의 `holdings`를 종목별로 합치지 않고 배열에 적재하고, `has/advisor-bridge.js`가 이를 각각 조언으로 생성하므로 동일 ticker 여러 조언이 실제로 발생할 수 있음.
- `has/decision-brief.js:classify()`에서 `groups[ticker]`로 묶은 뒤 `var a = g[0]` **첫 원소 한 건만** `verify(a,k,brief)`에 전달함. 나머지의 의견 문자열이 같으면 데이터 신뢰성·기준일·출처·보유 여부가 불일치해도 무시함.
- 재현 가능한 **정적 코드 경로**: `opinions:[mk('MSFT','보유',true), mk('MSFT','보유',true,{dataQuality:{ok:false}})]`이고 첫 원소는 유효라면 `hold` 1건으로 승격됨(같은 opinion이므로 상충 검출 없음). 역순이면 결과가 달라짐. 데이터 순서에 따라 검증 판단이 달라지는 건 '검증된 실제 후보만 집계'와 배치됨.
- **수정:** 동일 ticker의 모든 조언을 검사하고 한 건이라도 검증 실패·보유 여부/시각/시장 등 중요한 속성 상충이면 해당 ticker 전체를 `판단 보류`로 표시하고 구체적 이유를 남길 것. 유효한 완전 동일 중복은 1건만 세기. 다계좌 동일 티커 정상·역순·한쪽 불신뢰·한쪽 기준일 상충·미보유/보유 혼합 반례 시험 추가. 티커 그룹 키 안전성(예: `constructor`, `__proto__`)도 방어하여 손상 입력이 화면 전체 오류를 일으키지 않게 할 것.

## CR-4 — 상위 브리핑 기준시각·실제/합성 구분이 빠져도 후보 승격(필수)
- `verify()`는 `Date.parse(brief.generatedAt)`가 NaN이면 미래 시각 확인을 **건너뛰고 통과**시킴. `a.asOf`가 형식상 유효한 미래 날짜라도 `brief.generatedAt`이 없거나 손상되면 적극 후보로 승격될 수 있음. 이 검증은 '기준 시각 존재·미래 아님' 요구의 fail-closed 조건이 아님.
- `a.basis==='real'`일 때 `brief.basis`가 빈 문자열·누락이어도 허용됨(`bb==='synthetic'`만 차단). 상위 보고서가 실제/합성 미확정인데도 실제 후보라 표시할 수 있음.
- **수정:** `brief.generatedAt`을 유효한 현재 판단 시각으로 필수 검증, `a.asOf <= generatedAt + 허용 오차`를 항상 강제. `brief.basis`도 `real` 또는 `synthetic` 필수, 조언 basis와 명시적 일치 요구. 누락·형식 오류·불일치는 `판단 보류`와 원인 표시. 정상 합성·실제 계약 회귀, 생성시각 누락/손상·조언 미래 시각·basis 누락/불일치 반례 시험 추가.

## 시험 증거와 미검증
- 클로 보고: 신규 시험 2건(하위 반례 다수), 전체 2,237건 중 **2,235 통과 / 0 실패 / 2 skip**, 비밀값 0. Chromium 360/390/430/1280에서 접힌 3카드, 2회 토글, 가로 넘침 0, 12px 미만 0, 페이지 오류 0을 확인했다고 보고함. 이전 `universe-screen-dom` 실패 1건은 이번에는 재발하지 않았으나 원인 미조사.
- 위 시험은 **클로의 보고**이며 지피가 독립 재실행하거나 실물 갤럭시 화면을 확인한 것이 아님. 브라우저 캡처는 저장소에 커밋되지 않아 원본 증거를 직접 보지 못함.
- 실제 SEC/DART 및 독립 주가·밸류에이션 검증은 이 화면에서 실행되지 않음. 실제 운영에서는 신뢰할 데이터가 없을 때 **0건·판단 보류**를 유지해야 하며 '매수 확정' 또는 '매도 확정'으로 표현하지 말 것.

## 결론·승인 경계
**VERDICT: CHANGES_REQUESTED.** 기본 노출/상세 접기는 수정된 것으로 정적으로 확인됐으나 CR-3/CR-4를 보완한 새 코드 HEAD와 반례 시험·업데이트된 READY_FOR_REVIEW 보고서가 필요함. 기존 `GPT-20261116-1030`에 대한 재검토이므로 신규 ORDER 발행 불필요.
이번 검토는 **저장소 정적 검토**로 한정. `main` 병합·GitHub Pages 운영 배포·GAS·실제 API·비밀값·유료/클라우드 자원·투자기록·백업·자동매매 변경 및 실제 실행은 하지 않음. 운영 반영에는 별도 사용자 승인 필요.
