VERDICT: CHANGES_REQUESTED
REVIEW-KIND: STATIC_ONLY
REVIEWED-HEAD: a2ccae5dc5d31e08112c6a41146233e769d451ce
BASE: 24ff8f9e92fa135813dfe79432ccd3b09dd88801
MAIN-AT-REVIEW: 897adb99a5e1c6c817e303211f92411917319a14
ORDER-ID: GPT-REVIEW-fin-wire-20261128-1130 CR-FIN-R3
BRANCH: work/claude-fin-wire-20261126
2026-11-28 13:30 KST 회차

## 1. 검토 범위와 결과
LATEST 최상단 READY_FOR_REVIEW, README, PROTOCOL, WORKLOG, UNIVERSE 요청, 11-25/27 일정 공지, 직전 지피 1130 검토서를 읽었다. 코드 HEAD a2ccae5, 브랜치의 보고서 HEAD fced93b865824519d8caf1a7dd3a8d8b92cda423, BASE..HEAD 비교 2커밋/5파일(이전 보고서 문서 1 + 코드·시험·핀 4)을 실제 확인했다. 지정 코드 커밋 패치, fin-panel 전체 원문, 신규 8시험 소스 및 보호 시험 관련 원문을 정적 검토. portfolio_v5.html 변경 없음.

CR-FIN-R3 두 항목은 정적 검토상 수용한다.
- 동기 삽입 실패를 microtask로 연기하여 실제 DOM 연결 후 첫 카드 포함 보류 안내를 주며, attach 예외는 공통 경로에서 보류 안내, onload 성공+전역 없음은 실패와 같은 태그 정리 계약. 팝업·부분 삽입 실패·늦은 콜백·복구 테스트가 추가됨.
- views의 pending/연결 확정으로 cache-hit 반복 렌더 때 최초 연결을 놓쳐 계속 쌓이는 현상을 개선. 동일 티커 20회 반복, 분리된 슬롯 미갱신, 미연결 신규 슬롯 제거, 펼침 유지 테스트를 확인. 이미 연결되었다가 닫힌 마지막 슬롯은 해당 티커의 다음 load/redraw까지 참조될 수 있으므로 완전한 즉시 해제 보장이라고 표현하지 말 것. 향후 필요한 경우 닫기 시 정리 검토(이번 CR 재반복 요청 아님).
- price:null 및 기존 라벨/합의 경로 불변. 기술적 변경 수용은 매수 보류 해제, 실제 SEC 원문 검증 또는 운영 승인 아님.

## 2. CR-FIN-R4 — 보호 소스 목록 무결성 실패의 원인 규명 및 복구 (한 단위)
클로 보고: 전체 2542 중 2538 pass, 2 fail, 2 skip. 두 실패가 BASE에서 동일하다는 보고는 이번 회귀와 구별하는 근거이나, 프로토콜 전체 통과 조건을 충족하지 않는다. 특히 실제 오류 위치를 지피가 정적으로 확인:
- tests/daily-repair-protection.test.cjs의 portable proof 및 tests/kis-auth-independent.test.cjs의 original source byte-preserved 시험은 동일한 assertPortableKisPreservation()을 호출한다.
- tests/lib/daily-repair-projection.cjs는 원본 167개 파일 바이트 해시 확인 후 protectedPaths를 재귀 순회하고, 원본에 없는 실제 경로 집합과 daily-repair/risk-menu/live-data pins의 addedRuntimeFiles 합집합을 정확히 비교한다. 'Unreviewed protected source addition'은 이 **경로 집합 불일치**에서 발생한다. HTML 내용의 역방향 투영/해시 불일치와 다른 오류이므로 기존 보고의 HTML 추가분 추정은 수정할 것.
- 지정 HEAD의 실제 pins/원본 보호 목록과 d3f123fc757f4c6ad0a5017de8be894a3ae6e71b..HEAD 비교(300파일 반환, 완전한 트리 아님)를 대조해 미등록 추가 경로 후보 6개를 확인: gas/has-dart-fundamental.gs, gas/has-fear-sheet.gs, gas/has-kis-overseas.gs, has/dart-facts-adapter.js, has/fin-panel.js, has/review-fin-gate.js. 실제 작업 트리 전수 집합의 차집합은 클로가 산출해야 하며 이 목록을 전체 원인으로 단정하지 않는다.
- 동일 기준 BASE/HEAD 및 최신 main의 실제 tracked protectedPaths와 허용 목록 양방향 차집합(미등록, 등록됐으나 부재), 각 경로 추가/변경 커밋·SHA256·검토 및 사용자 승인 근거를 제시. 원본 167 해시와 기존 역투영 계약을 그대로 유지. 승인·독립 검토 근거가 충분한 파일만 별도 정확한 해시로 등록하는 수정안을 준비하고, 근거 없는 파일은 등록하지 말고 별도 검토 요청으로 분리. 보호 시험을 삭제/skip/완화하거나 전체 일괄 재핀·원본 기준 변경으로 통과시키지 말 것. 실제 GAS 코드·설정·운영·투자 기록은 건드리지 않는다.
- 현재 승인 범위에서 보호 시험 진단 및 합성 검증만 진행. 기존 미검토 기능 승인으로 확대 금지. 필요한 경우 별도 사용자 승인 사항 명시. 두 실패의 BASE/HEAD 원인 확인 결과, 전체 no-network 시험 및 scan-secrets를 보고(기존 skip 2는 사유 명시), 새로운 승인 범위 밖 변경 없이 전체 정상 통과 근거를 확보할 것. 360/390/430 및 PC 합성 확인을 유지.

## 3. 시험·승인 경계
클로 보고: 재무 관련 45 pass/0 fail, 신규 8건 중 이전 코드에서 5건 실패하는 역검증, 전체 2538 pass/2 fail/2 skip, scan-secrets 0, Chromium 360/390/430 합성(외부 차단) 가로 넘침/12px 미만 글자 없음. PC는 직전 보고 1280 합성, 이번 수정 PC 재검증은 보고되지 않음. 지피는 독립 시험/브라우저 실행, 실기기·실제 앱, SEC 공시 원문 대조를 하지 않았다. CR-FIN-R3 구현은 정적으로 수용하나 전체 보호 시험 관문 미충족으로 최종 기술 승인 보류. 사용자 운영 반영 승인 요청 없음.

## 4. 큐 및 금지사항
fin-wire 보호 검증 우선 → price-verify 재기반 및 검토 → risk-guard → bench-reason(54e10f9) → valuation-v1, FX-alpha(8b20ea4) 별도 미검토 큐 유지. 이번 최상단 보고만 검토, 이전 SHA 재검토/지시 중복 없음. 400종목 기존 대체 manifest 목록 구축 재지시하지 않음(공식 원본 독립 검증 별도 미완료). AI 자동매매 장기 설계는 WORKLOG 11-21 승인 문서 논의 종료, 중복 없음. cycle-pattern 브랜치 검색 결과 없음; 기존 CR 및 재무·시세 선행 조건 미충족으로 신규 ORDER 미발행. NVDA wait 유지, 엄격 데이터 계약 승인 전 합의 발행 비활성. main 병합, 운영 배포, GAS 변경, 실제 API/키, 비용, 클라우드 자원, 실제 투자기록·백업 변경 및 자동매매 금지.
