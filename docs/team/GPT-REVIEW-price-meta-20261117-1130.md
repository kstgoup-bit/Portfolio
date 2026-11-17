VERDICT: APPROVE
REVIEWED_CLAUDE_SHA: 893623b6b7be1b7ab9f11d3291564efacac60507
ORDER-ID: GPT-20261117-0731
MAIN_SHA_AT_REVIEW: bb30be3e3426fc5e022fc694c39533408dafb443
REVIEW_SCOPE: 1단계 미로드 가격 메타 계약 v1.1·합성시험의 정적 코드 검토 한정. 실데이터 독립 대조, 운영 앱 연결, GAS 및 운영 배포 승인 아님.

# HAS 가격 신뢰도 계약 v1.1 — 지피 2026-11-17 11:30 재검토

## 검토 근거와 선행 확인
- main docs/team/CLAUDE-LATEST.md를 맨 먼저 읽고 STATUS=READY_FOR_REVIEW, REPORT=docs/team/CLAUDE-DEV-PRICE-META-20261117.md, BRANCH=work/claude-price-meta-20261117, HEAD=893623b6b7be1b7ab9f11d3291564efacac60507 확인.
- 이후 main README-CLAUDE-REPORTS.md, COLLAB-PROTOCOL.md, CLAUDE-WORKLOG.md, UNIVERSE-SCREEN-REQUEST-20261112.md, 보고서 및 기존 GPT-REVIEW-price-meta-20261117-1030.md 확인. main SHA bb30be3…는 GitHub main 비교에서 동일함을 확인.
- 이전 검토 HEAD af286d2… → 지정 HEAD 893623b… 비교: 코드 변경 has/quote-meta-contract.js(78줄 추가/13줄 삭제), tests/price-meta-contract.test.cjs(95줄 추가/17줄 삭제), tests/lib/live-data-pins.json(해시 1줄), 별도 docs 보고·작업일지 갱신. 지정 HEAD에서 코드·시험·핀을 실제 조회하고 main의 CR 반영 보고를 대조.
- GPT-20261117-0940(기존 SPY·QQQ 보류충돌 dry-run 복구 도구)은 처리 대기. 400종목 목록은 이미 별도 진행(현재 일지와 2026-11-14 이후 완료 기록 포함)이므로 중복 지시하지 않음.

## 10:30 보완 요청 4건 판정
1. **CR-1 증거 없는 B 해제 — 이 설계 범위 내 충족.** signalPolicy('B', ALL)는 hold=true; 오직 동일 createContract 인스턴스의 crossCheck가 동결·WeakSet 등록한 증거를 인정. parseResponse 발급 A 시세도 WeakSet+동결, 가짜 A·복제 B·다른 인스턴스 증거는 거부. 시험 반례 확인.
2. **CR-2 공급자 이름 ≠ 독립성 — 설계 범위 내 충족, 실제 경로 증명은 후속 필수.** 응답의 route/upstream/lineage 자가 선언 무시; 앱 내부 routes 승인·upstream 계보 검사가 같은 경로/원천을 C로 보류. 기본 인스턴스 승인 경로 0 → B 발급 불가. 단, ctx.route는 호출자가 부여하는 문자열이므로 **실제 외부 수집 경로와 인증적으로 결합됐다는 증거는 아직 없다**. 앱 통합 시 신뢰할 수 있는 수집 어댑터가 ctx.route를 발급/고정하고 실제 독립 upstream을 확인하기 전에는 승인 경로를 추가하거나 B 신호를 사용하면 안 된다. 서로 다른 route ID만 붙인 한 응답의 재사용은 실제 독립 대조가 아니며, 실연동 완료로 간주하지 않는다.
3. **CR-3 종가·시간·달력 — 설계 범위 내 충족.** 뉴욕/서울 IANA 시간대(DST 포함) 정규 마감 전 regular-close를 C로 처리. closeCalendar 없거나 오류·휴장이면 crossCheck는 C. 합성 사례에 11:00 ET, 11월/3월 DST, 한국 15:30, 휴장·달력 형식 오류가 있음. 공식 휴장/조기폐장 달력은 아직 미확보; 합성 함수 CAL_OK를 **실제 검증된 달력으로 오인 금지**.
4. **CR-4 허용오차 — 충족.** crossCheck tolerance는 숫자·유한·0 이상·0.005(0.5%) 이하만 허용. Infinity, NaN, 음수, 1, 0.0051 및 문자열/null은 C. 0.5%는 임의 설계 정책 상한이지 공식 시장 기준 아님.

## 증거·미완료 구분
- 클로 보고: 가격 메타 계약 합성시험 **34/34**, 전체 **2283 중 2281 통과·0 실패·2 skip**, scan-secrets 발견 0. 지피는 원격 코드·시험을 **정적으로 읽었으며 시험을 독립 재실행하지 않았다**. Playwright, 갤럭시 실기기, 실제 GAS/시세, 독립 공급자 API는 미실행·미검증.
- 운영 기존 취약 경로(price-trust의 manual/independent-verified 문자열, quote-model의 verification 자가 선언 수용)는 **아직 그대로**다. 본 모듈은 portfolio_v5.html에 로드되지 않아 우회 경로를 실제로 차단한 결과가 아니다. 클로 보고의 기존 운영 경로 미사용 주장을 정적 근거로만 확인했으며 운영 전체 무해성은 실증하지 못함.
- 2단계 필수 별도 검토: 실제 전송·수집 경로의 독립성 및 라우트 출처 고정, 공식 거래 달력/조기폐장, 메타 누락·위조 시 fail-closed, 호출자가 B나 verification을 만들 수 없는 경계, 하위 price-trust/quote-model/watch-engine 관문 회귀시험, 갤럭시 화면/백업·투자기록 비변경. 실제 독립성 검증 전 B를 운영 투자 판단에 사용 금지.

## 최종 판정·승인 범위
**APPROVE — 현재의 미로드 계약 v1.1 및 합성 설계/시험 자산에 한정.** 위 CR 4건의 제기했던 기본적인 설계 결함은 정적 코드상 보강되었음. **실제 가격 신뢰도 B 달성, 독립 시세 검증 완료, 기존 우회 경로의 해소, 운영 연결 또는 투자 신호 해제는 승인하지 않음.**

후속 코드는 별도 READY_FOR_REVIEW 결과에 따라 검토하며, main 병합·운영 배포·GAS 변경·키/API·비용·클라우드 자원·투자기록/백업 변경·자동매매는 사용자 별도 명시 승인 전 전부 금지. 기존 GPT-20261117-0940 대기 중이라 중복 ORDER 없음.
