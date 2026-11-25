VERDICT: CHANGES_REQUESTED
ORDER-ID: GPT-REVIEW-postmerge-queue-20261125-1430 CR-E1·E2
REVIEWED-HEAD: 4bff0adef832eaeac43d9394e46f662bc79ff2bd
REVIEWED-BASE: d5f011497dfd30bb776f09e047b340d9f9a04be5
MAIN-AT-CHECK: 4fa66043516b3a5ceba314a8bc026595f99d1e0d
REVIEW-SCOPE: BASE..HEAD 누적 변경 목록 및 직전 8b2c9b2..HEAD 신규 변경/시험
REVIEW-MODE: STATIC_ONLY (2026-11-25 15:30 회차 KST)

## 1. 부분 적합 — 기존 CR-E1/E2 반영 확인
필수 main 문서 5종, 다비 인계 문서, 처리 일지, 직전 1430 검토서, 지정 브랜치 보고서, API compare 및 고정 HEAD 소스·시험을 확인했다. BASE...HEAD 24커밋/20파일, 직전 HEAD 대비 8파일(문서 포함), 신규 코드 커밋 4파일. 이번 변경은 노드 도구·시험·핀으로 앱 런타임/portfolio_v5.html/reviews 변경 없음.
- CR-E1: 이전 4백틱 안 3백틱 반례, 혼합·짧은 닫힘, 미닫힌 펜스/주석 차단 및 양성 시험 확인. 해당 반례에 대한 수정 적합.
- CR-E2: --publish와 진단 모드 분리, 두 ref 필수, 정확한 commit 객체 유형, ls-tree 및 blob 조회 실패/부재 구분과 합성 시험 확인. 진단/검사 인터페이스 개선 적합. 실제 발행 승인이나 두 AI 출처 인증은 아니다.
- 클로 보고 전체 2428, pass 2426, fail 0, skip 2, scan-secrets 0. 신규 9건. 화면 변경 없음으로 Chromium 미재실행. 지피는 독립 실행하지 않았으며 실제 앱/폰/GAS/복원 미검증.

## 2. CR-F1 — Markdown 예시의 잔존 오인; 파서 확장 반복 중지 권고
현재 plainScan은 펜스와 HTML 주석만 인식하고 raw HTML 블록은 인식하지 않는다. 다음 합성 줄 배열을 newline으로 결합하면 HTML pre 블록 안의 예시가 실제 영역으로 파싱된다(정적 코드 추적, 실행하지 않음).

    ["<pre>", "BEGIN-CONSENSUS-EVIDENCE", "DOC-STATUS: FINAL", "REVIEW-DATE: 2026-11-25", "CONSENSUS-EVIDENCE: 005930 KR sell-review 2026-11-25 AGREE", "END-CONSENSUS-EVIDENCE", "</pre>"]

plainScan은 전 줄을 그대로 반환하고 extractRegion은 pre 여닫는 줄을 영역 밖으로 무시한다. 일치하는 합성 agreed 카드에는 gpt-agree/ok:true 경로가 남는다. 클로 수락도 같은 파서. 단순히 pre만 추가 차단하는 식의 반복 수정은 권하지 않는다.
**권고: 사람용 Markdown과 기계 판독 근거를 분리하는 클로의 대안을 채택하는 방향으로 설계 종료하자.** 전체 파일이 엄격한 데이터 문법만 허용되는 독립 텍스트 또는 JSON 계약(임의 설명·코드 예시·HTML 금지, 중복/미지 필드·형식 위반 실패, 종목별 유일 키)을 문서로 정리하고 사용자 승인 전 실제 아침 예약/저장/발행 연결은 하지 않는다. 현 Markdown 도구는 진단·합성 연구용으로만 인정한다. 실제 발행 준비가 끝났다는 오해가 없도록 현 제안 모드도 agreed 발행에 사용하지 않음을 명시할 것. 다음 검토는 엄격 데이터 계약과 합성 검증 계획 또는 발행 경로 비활성 근거에 집중하고 Markdown 파서 예외를 끝없이 늘리지 말 것.

## 3. 실제 발행 승인 게이트 — 아직 미충족(기존 제안 범위)
--publish는 두 ref가 실제 커밋인지만 검증하며, 동일 ref도 허용한다. 클로의 원판단 reviews JSON, 해당 원판단의 SHA/종목/시장/판단과 GPT 근거의 일치, 변경된 카드 본문, 이견 수락의 해당 원문 SHA까지 실제로 결합하는 검사는 아직 구현하지 않았다(보고서도 제안으로 명시). 커밋 존재와 독립 작성자 출처 검증은 다르다. 실제 발행 시에는 승인된 날짜/대상 원문·원판단·수락의 고정 SHA/출처, 검증 결과와 발행할 JSON의 동일성 및 검증 실패 시 차단이 필요하다. 0건 성공은 근거가 없음이지 합의 발행 허가가 아니다. no-response 역시 임의 과거 SHA의 파일 부재로 오늘의 무응답을 확정하면 안 된다. 이 사항들은 향후 승인 대상 계약의 완료 조건이지 지금 실제 연결하라는 지시가 아니다.
사용자 결정 요청: 엄격한 별도 데이터 계약, SHA 3필드와 원판단 대조 및 필수 발행 관문 적용 범위. 승인 전 agreed 발행 없음, 과거 카드 승격 없음, 기존 아침 프로토콜/예약/스키마 수정 금지. 실제 투자 의견 또는 주문 승인이 아니다.

## 4. 기존 과제·안전
KIS 20일 참고 집계 및 G0 보류, 자동 대조 하루 1회·2회 재시도 보류, 성적표와 나머지 사후검토 큐 유지. main radar/data에는 universe-400.json 이름 자체는 없지만 승인된 대체 구성 kospi200-20261112.json(201), us200-20261112.json(200사/201티커), universe-manifest-20261112.json(coreCount 402, declared-snapshot-not-independently-verified)이 이미 있어 중복 목록 지시하지 않는다. 실제 공급자 자료/효력일·권리 미검증은 별도 유지. 장기 자동매매 설계는 2026-11-20-2330 APPROVE 문서 종료를 일지에서 확인하여 중복 ORDER 없음.
main 병합·운영 배포·GAS·실제 키/API·비용·클라우드·계좌/주문/자동매매·실제 투자기록/백업 변경 금지. 이번 지피 작업은 검토 문서만.
