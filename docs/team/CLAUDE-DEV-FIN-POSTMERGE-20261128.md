STATUS: READY_FOR_REVIEW
REVIEW-KIND: POST_MERGE
ORDER-ID: GPT-REVIEW-fin-wire-20261128-1530 CR-FIN-R5
BASE: 6ec2422ea52bd73e16bacc3de5933c6ce6535661 (main, 6개 파일이 하나도 없던 마지막 커밋 = f83e9eb의 부모)
HEAD: 9e3ee3c4084e1b6f9f7f04266562d04ab50c6ef6 (main, 6개 파일이 모두 들어온 병합 커밋)
MAIN-AT-WRITE: 8ac596dfd297962ecf0e35119e29d1a087fae5a2 (6개 파일 바이트가 HEAD 이후 바뀌지 않음 — `git diff --quiet 9e3ee3c 8ac596d -- <6파일>` 6/6 동일)
REVIEW-SCOPE: `git diff 6ec2422 9e3ee3c -- gas/has-kis-overseas.gs gas/has-fear-sheet.gs has/dart-facts-adapter.js gas/has-dart-fundamental.gs has/review-fin-gate.js tools/fetch-sec-facts.cjs` (6파일 모두 신규 파일, 전체 내용 593줄). 관련 시험 4파일·워크플로 1파일은 참고 범위(아래 3절). 범위 밖의 6ec2422..9e3ee3c 다른 커밋(postmerge 등)은 이번 검토 대상 아님.
BRANCH: work/claude-fin-postmerge-20261128 (문서만, 코드 변경 0)
UPDATED: 2026-11-28 16시대 KST

# 사후 검토 요청 — main에 이미 들어온 재무·GAS 6개 파일 (CR-FIN-R5)

## 0. 이 문서의 성격
- 지피 1530 검토 CR-FIN-R5에 따라, fin-wire 7495cca에서 해시만 등록한 6개 파일의 **코드 자체**를 지피가 사후 검토할 수 있도록 정식 범위를 게시한다.
- 7495cca는 fin-wire 브랜치의 **잠정 무결성 재현 근거**로만 둔다. main 병합·다른 브랜치(fx-alpha 포함) 복제·최종 허용 목록 채택을 하지 않는다. 시험 통과 수로 이 6개 기능이 승인됐다고 표시하지 않는다.
- 지피 사후 검토는 소급 운영 승인이 아니며, 실제 GAS 배포본 검증도 아니다. 실제 키·네트워크 호출은 하지 않았다(합성 근거만).

## 1. 원래 커밋과 사용자 승인 출처

| 파일 | 줄 | 원래 커밋(전체 SHA) | main 진입 경로 | 사용자 승인 기록 |
|---|---|---|---|---|
| gas/has-kis-overseas.gs | 142 | f83e9ebba0b2b3d2ec2c4035fce2d862a81897b7 (초안), 5ae3412135ed68e478611cb98d171c89dce1ab8d (장중 봉 제외) | main 직접 커밋(2026-11-25 23:26·23:32 KST, 순태씨 대화 중 PC 배포용) | WORKLOG 397행 "2026-11-25 23:5x 순태씨 PC(GAS) 작업 완료" — 순태씨가 PC에서 직접 붙여넣기·배포 |
| gas/has-fear-sheet.gs | 90 | 8fc0837d65817c4d8fa4ba2ee2f8cacb602373b6 (초안), 1ad846596cf32e84730230f11843a12918ca7214 (국내 티커 앞 0 보존) | main 직접 커밋(2026-11-25 23:35·23:45 KST) | 같은 WORKLOG 397행 |
| has/dart-facts-adapter.js | 134 | b28615e65c5919c7989bf65537a9c2adde47647c (단계 1), 0149abeb5db04bb6bc0c2c6e21e0efa372309362 (단계 2~3) | 병합 9e3ee3c (브랜치 끝 5e9489e) | WORKLOG 401행(보류 해제 규칙 승인), 406행 순태씨 '올려' |
| gas/has-dart-fundamental.gs | 112 | 0149abeb5db04bb6bc0c2c6e21e0efa372309362 | 병합 9e3ee3c | WORKLOG 406행 '올려' — **저장소 초안만, doGet 연결·GAS 배포 승인 아님**(파일 주석 "순태씨 승인 후에만") |
| has/review-fin-gate.js | 44 | 0149abeb5db04bb6bc0c2c6e21e0efa372309362 | 병합 9e3ee3c | WORKLOG 401행 규칙 승인, 406행 '올려' |
| tools/fetch-sec-facts.cjs | 71 | 5e9489e01f7db6004a837eb7e473f77380dde9da | 병합 9e3ee3c | WORKLOG 405행 순태씨 '승인'(Actions 전환), 406행 '올려' |

- 6개 모두 **지피 독립 코드 검토 기록 없음**(이번이 첫 정식 범위).
- GAS 2개(kis-overseas, fear-sheet)는 **브랜치·검토 없이 main에 직접 커밋**됐다. 순태씨 대화 중 작업이었지만 프로토콜상 지피 검토 단계를 거치지 않았다.

## 2. 파일별 실제 동작·의존성·검토 관점

### 2-1. gas/has-kis-overseas.gs (type=kis-us, 미국 일봉 확정 종가 중계)
- 의존: 저장소 밖 GAS 프로젝트의 국내 KIS 함수(토큰·하루 예산 `hasKisSpend_`·콜백 검사)를 재사용. **저장소에 그 함수가 없어 이 파일만으로는 실행·시험 불가.** 순태씨 PC의 Code.gs 분기 3줄도 저장소에 없음.
- 네트워크: KIS `/uapi/overseas-price/v1/quotations/dailyprice`(tr_id HHDFS76240000) 1개 경로만. 주문·계좌·잔고 경로 없음.
- 쓰기: 스크립트 속성 `KIS_US_EX_<티커>`(찾은 거래소 기억)만. 키는 속성 `KIS_APP_KEY/SECRET`에서 읽기만.
- 검토 관점: 규격 출처가 **2차 블로그**(algolab, 파일 12행) — KIS 공식 문서 대조 **미검증**. 수정주가 MODP=1, 동부 16:30 전 당일 봉 제외(장중 미확정 배제), 가격 범위 0.0001~1,000,000, 최대 5티커, 120ms 간격, 실패 종목 null. 거래소 기억이 잘못 고정될 때 정정 경로(현재는 기억한 거래소가 실패하면 나머지 순서로 재탐색 후 덮어씀).
- 시험: **저장소 자동 시험 없음.** 근거는 순태씨 PC 자체 시험(AAPL NAS·KO NYS 99일 성공, WORKLOG 397행) 기록뿐 — 클로·지피 재현 불가.

### 2-2. gas/has-fear-sheet.gs (곡소리 Top10 → 구글 시트)
- 의존: 저장소 밖 GAS의 `hasScreenRead_('PUBLIC')`, `HASUniverseScreen.validateSummary/rank`(저장소 has-universe-screen 계열과 같은 이름 — 배포본 동일성 미검증).
- 쓰기: **순태씨 드라이브에 시트를 새로 만들 수 있음**(`SpreadsheetApp.create`, 속성 HAS_FEAR_SHEET_ID 없을 때), latest 탭 덮어쓰기, history 탭 추가(같은 세대 중복 방지), 국내 티커 열 글자 형식 보정(기존 행 수정). 파일 주석의 "읽기 전용"은 곡소리 계산·doGet을 바꾸지 않는다는 뜻이며 시트 쓰기는 한다.
- 개인정보: core 공개 목록 종목만, 보유·계좌·금액 미기록(주석 기준 — 지피 확인 요청).
- 잠금: LockService 30초, 계산 중이면 건너뜀. 매일 06시대 트리거는 `hasFearSheetSetup`이 등록.
- 시험: **저장소 자동 시험 없음.** 근거는 순태씨 PC 실행 기록(국내 티커 6자리 확인)뿐.

### 2-3. has/dart-facts-adapter.js (DART 연간 재무 → 앱 표준형 변환, 순수 함수)
- 의존: 없음(UMD, 전역 `HASDartFacts`). 네트워크·저장소·키 미사용(시험 45행이 문자열로 확인).
- 데이터 관점: 12월 결산·연결(CFS)만, 원 단위 정수, capex 부호 통일, status 013=자료 없음, 다른 회사·연도·보고서 코드·통화 행 섞이면 그 해 전체 거부, 접수번호 형식·접수일이 결산일 전/오늘 이후면 거부, 종목·회사 확인 필수(이름·번호 추정 금지), 합성 표시를 imported가 세탁 못 함, 미검증 표시 유지.
- 미검증: DART `fnlttSinglAcntAll` 실제 응답 규격 대조(계정 ID 매핑) — 합성 자료로만 시험.
- 운영 앱 연결: **없음**(portfolio_v5.html·main has/*.js가 불러오지 않음. fin-wire 브랜치가 연결 예정, 미승인).
- 시험: tests/dart-facts-adapter.test.cjs 30건.

### 2-4. gas/has-dart-fundamental.gs (DART 재무 중계 GAS 초안, type=dart-fundamental)
- 상태: **저장소 초안. doGet 연결은 주석 안내뿐(110~112행), GAS 배포 기록 없음.**
- 네트워크: opendart.fss.or.kr `fnlttSinglAcntAll.json` 1경로, 리다이렉트 안 따름, 250ms 이상 직렬, 종목당 5개 연도.
- 비밀: 키는 속성 HAS_DART_KEY에서 읽어 **URL 쿼리 crtfc_key로 전송**(DART 규격상 불가피). 오류 응답은 `dart-http-<코드>`·`dart-status-<3자리>` 등 코드만 — 주소·키 미노출(시험 확인). 응답 JSONP는 안전 콜백만, `< > &` 이스케이프, 크기 상한.
- 오류 보류: 010·011·012·020 등 키·한도 오류는 즉시 전체 중단, 013은 그 해만 비움, 전부 013이면 변환 거부. 캐시(CacheService) 위조 시 거부, 잠금 중이면 `dart-busy`.
- 시험: tests/dart-fundamental-gas.test.cjs 13건(vm 안 가짜 UrlFetchApp·PropertiesService·CacheService·LockService).

### 2-5. has/review-fin-gate.js (AI 카드 매수 쪽 판단 보류 해제 규칙, 순수 함수)
- 의존: 입력으로 fundamental-filter 판정·시세 대조·지피 합의 결과를 받음. 네트워크·저장소 미사용.
- 규칙(순태씨 승인, WORKLOG 401행): 재무 strong + 시세 독립 대조·정상·최근 + 지피 합의 agreed 7일 이내일 때만 해제, 해제해도 라벨은 '밸류에이션 미확인'까지. weak=막힘, insufficient·mixed·오래됨·3년 미만·충돌·합성 표시·형식 불량=보류, 빠진 조건 모두 기록.
- 투자 철학 관점: 가격 하락만으로 매수 권유 금지·재무 연결 후에만 '매수 검토' 원칙을 코드로 강제하는 관문 — 지피가 반대 방향(해제가 너무 쉬운 경로) 확인 요청.
- 운영 앱 연결: **없음**(fin-wire 브랜치 has/review-cards.js 124행이 불러올 예정, 미승인).
- 시험: tests/review-fin-gate.test.cjs 13건.

### 2-6. tools/fetch-sec-facts.cjs (SEC companyfacts 수집, GitHub Actions에서 실행)
- **실제로 운영 중**: .github/workflows/sec-fundamentals.yml(같은 병합 9e3ee3c)이 평일 06:17 KST(UTC 21:17 일~목)에 실행해 main의 data/fundamentals/에 직접 커밋(최근 0b1db84 2026-11-27, ed4e2a0 2026-11-26). 6개 중 유일하게 실제 네트워크·저장소 쓰기를 하는 코드.
- 네트워크: www.sec.gov/files/company_tickers.json, data.sec.gov/api/xbrl/companyfacts 두 호스트만, User-Agent는 비밀값 SEC_USER_AGENT(env로만, 출력 안 함), 403·429면 남은 요청 0·재시도·우회 없음·실패 종료.
- 쓰기: data/fundamentals/<티커>.json(임시 파일→rename)과 index.json. 원본 facts·us-gaap 저장 안 함, 정규화 결과·verification 'unverified'만. 워크플로 권한 contents: write 하나.
- 종목 목록: data/fundamentals/tickers.json 1~40개, 형식·중복 검사.
- 시험: tests/fetch-sec-facts.test.cjs 10건(가짜 fetch, 워크플로 정적 검사 포함).
- 관련 참고(6핀 밖): 워크플로 파일 자체도 지피 독립 검토 기록 없음 — 같은 범위로 함께 봐 주길 요청.

## 3. 시험 결과 (이번 실행, 2026-11-28 16시대 KST, main 8ac596d)
- `node --require ./tests/lib/no-network.cjs --test tests/dart-facts-adapter.test.cjs tests/dart-fundamental-gas.test.cjs tests/fetch-sec-facts.test.cjs tests/review-fin-gate.test.cjs` → 66건 pass 66 · fail 0 · skip 0.
- 전체 시험은 코드 변경이 없어 재실행하지 않음(직전 fin-wire 0887887 기준 2542 중 2540 pass·0 fail·2 skip은 그 브랜치 근거).
- `node tools/scan-secrets.cjs` 0건(이 문서 포함).
- GAS 2개(kis-overseas, fear-sheet)는 저장소 시험 0건.

## 4. 미검증 (명시)
- **저장소 코드와 순태씨 PC GAS 배포본의 일치 — 미검증.** 클로·지피 모두 배포본에 접근할 수 없다. Code.gs 분기 3줄, 국내 KIS 공용 함수, hasScreenRead_/HASUniverseScreen 배포본은 저장소에 없다.
- KIS 해외 일봉 규격(2차 출처 기준), DART 실제 응답 규격, SEC 실제 응답 — 합성 자료로만 시험. SEC는 Actions 실제 실행 결과가 data/fundamentals에 있으나 내용 정확성(원문 대조)은 미검증.
- has-dart-fundamental.gs는 배포·연결 안 됨(운영 영향 없음).

## 5. 지피에게 요청
- 위 범위의 실제 코드를 사후 검토하고 6핀(7495cca)의 최종 승인 여부를 결정해 주세요. 결과는 fin-wire 승인 판단과 분리.
- 특히: (1) fear-sheet의 시트 생성·기존 행 수정이 '읽기 전용' 원칙과 맞는지, (2) kis-us 규격 2차 출처 의존, (3) DART 키가 URL에 실리는 구조의 노출 경로, (4) review-fin-gate 해제 조건의 우회 가능성, (5) SEC 워크플로의 main 직접 커밋 권한.

## 6. 순태씨 결정 필요
- 없음(문서·승인 범위 정리). 운영 반영·GAS 변경은 여전히 별도 승인.
