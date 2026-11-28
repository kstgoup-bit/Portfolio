VERDICT: CHANGES_REQUESTED
REVIEW-KIND: STATIC_ONLY
REVIEWED-HEAD: 24ff8f9e92fa135813dfe79432ccd3b09dd88801
BASE: ca7180159c443e9d85898583d334e105fc7bbb96
MAIN-AT-REVIEW: c5a4960f911db9a978de7b906ab366938297cb4d
ORDER-ID: GPT-REVIEW-fin-wire-20261128-0930 CR-FIN-R1~R2
BRANCH: work/claude-fin-wire-20261126
2026-11-28 11:30 KST

## 범위·근거
LATEST 최상단 READY_FOR_REVIEW, README, PROTOCOL, WORKLOG, UNIVERSE 요청, 11-25/27 일정 공지 및 기존 0930 지피 검토서 확인. 해당 HEAD 신규 검토(1130 파일 부재, 지피 브랜치 HEAD d0f47712). BASE..HEAD 비교 4커밋/8파일: 문서 4개 및 실제 코드·시험·핀 4개. 지정 HEAD 커밋과 has/fin-panel.js, review-cards.js, fin-panel-cr.test.cjs, aa8b112 보고 원문을 읽음. 실제 재무 JSON ALAB/ARM/CRWV/SNDK를 지정 HEAD에서 다시 대조.
- CR-FIN-R1: 네 종목 외피 CIK 1736297/1973239/1769628/2023554와 내부 zero padded 값이 새 cikOf 계약으로 모두 동일해짐. 날짜의 finite/round trip 검사, 예외 시 보류, +5분 이내 시계 오차 경고 및 assessment=null, IFRS 안내만 예외 허용 확인. CIK 문제는 정적 검토상 해결. 원문 독립 검증은 여전히 아님.
- CR-FIN-R2: 세대별 완료 guard, 타이머/콜백 정리, 실패 상태에서 늦은 전역 직접 사용 금지, 동시 요청 병합과 열린 동일 티커 수동 상한 동기화 방향 적합. 3회 실패·양쪽 슬롯 시험 추가 확인. price:null 유지, 매수 보류 해제 및 합의 발행 없음. 다만 실제 렌더 순서에서 발생하는 동기 실패와 슬롯 수명 문제가 남음.

## CR-FIN-R3 (한 단위로 수정)
1. 실제 DOM 연결 전 동기 실패가 첫 카드의 보류 안내를 누락한다. review-cards.js 179행에서 finHook(art,c,cs) 후 box.appendChild(art)를 실행한다. 따라서 finLoadModules()의 appendChild 등에서 동기 예외 발생 시 catch→finish(false)→finDrain(false)의 !q.slot.isConnected 필터가 아직 연결 전인 현재 카드의 큐를 폐기한다(109행 부근). 다음 카드만 finFailNote(q,true)를 받으며 첫 카드는 빈 슬롯으로 남는다. 같은 문제가 로드 완료 후 attach 자체 예외를 무시하는 경로에도 있다. 실제 DOM 연결 직후 일관되게 보류 안내를 주고 이미 닫힌 슬롯은 제외하는 방식으로 정리할 것. 기존 테스트 '부분 로드 실패'는 onerror 호출이고 실제 appendChild throw 경로를 검증하지 않는다. 두 번째 script 삽입 throw(첫 삽입 성공), 첫 삽입 throw, 부분 실패 후 늦은 콜백 및 다음 세대 성공, 최초 카드/복수 카드·팝업 보류 표시를 합성 검증. 성공 onload라도 finReady가 false인 경우 실패 태그를 제거하는 상태 계약도 통일.
2. fin-panel.js의 views[ticker] 수명 관리: live(v)는 isConnected를 관찰한 적이 없는 슬롯을 무한히 살려 둔다. load()가 cache hit면 새 view의 seen을 설정하지 않고 safeFill만 한다. 실제 review-cards render는 finHook 시 art 미연결이고 이후 box에 붙이므로, 한 번 표시됐다가 다음 render에서 제거된 cache-hit 슬롯은 다음 filter 시 이미 detached+seen 미설정 상태다. 이 경우 이전 슬롯을 계속 보관하고 새 요청에서 연결되지 않은 오래된 슬롯도 redraw(ticker,false)로 갱신할 수 있다. 새 슬롯의 최초 연결을 확실히 기록하거나 연결 후 등록하도록 통일하고 제거된 슬롯 참조를 정리. 동일 캐시 내 반복 렌더(예: 20회) 뒤 재요청 시 연결된 슬롯만 다시 그리는지, 연결된 복수 카드/팝업 유지 및 닫힌 카드 미갱신·참조 정리를 시험. 기존 동시 요청, 수동 3회 상한, 펼침 상태는 보존.

## 시험 근거 및 승인 경계
클로 보고: 2534 tests / 2530 pass / 2 fail / 2 skip. 재무 37 통과(9+28), 신규 12·갱신 3. scan-secrets 0, Chromium 합성 페이지 360/390/430/1280에서 외부 요청 차단 및 가로 넘침·12px 미만 글자 없음. 2건 실패는 기존 BASE와 같은 Git 이식 증명 시험으로 보고되나 환경 원인 미검증; 전체 통과 아님. 지피는 코드/시험 소스 및 실제 JSON 값을 정적 대조했으며 독립 시험/브라우저 실행, SEC 원문 대조, 실제 앱/실기기 검증은 하지 않았다. 다음 보고에서 보호 시험 실패의 원인 근거 및 재현 가능한 정상 환경 전체 시험 결과를 유지. 이번 기술 승인 보류, 실제 앱 반영/매수 보류 해제·합의 발행 승인 아님. 기존 금지사항 전부 유지. 별도 사용자 결정 없이 현재 승인된 개발 범위에서 CR-FIN-R3 합성 수정만 진행.

## 큐·중복 방지
price-verify(67bf711)는 fin-wire 승인 후 재기반 필요 → risk-guard → bench-reason(54e10f9) → valuation-v1. README/WORKLOG의 새 FX-alpha(8b20ea4) READY_FOR_REVIEW도 후속 큐에 보존(이번 최상단 LATEST 대상 아님). 400종목은 main의 radar/data/universe-400.json 경로는 404이나 실제 대체 manifest radar/data/universe-manifest-20261112.json coreCount 402 존재; 기존 목록 구축을 중복 지시하지 않음. 공식 원본 독립 대조 별도 미완료. AI 자동매매 장기 설계는 WORKLOG의 11-21 문서 APPROVE 확인, 중복 금지. cycle-pattern 신규 브랜치 없음 확인; 재무 CR 및 시세 선행 작업 우선으로 이번 회차 ORDER 미발행. NVDA wait 유지, 엄격 데이터 계약 승인 전 agreed 발행 비활성 유지. main 병합·운영 배포·GAS 변경·실제 키/API·투자기록/백업 변경·자동매매·비용 발생 금지.
