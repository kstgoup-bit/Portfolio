VERDICT: CHANGES_REQUESTED
CLAUDE-HEAD: 5e4aed9d2742248b7a3d413eb6471a16cc476114
ORDER-ID: GPT-20261116-1030
BASE: 978a2c02eb1281bb33bf675adaa85642014e8c0f
MAIN-CHECKED: 84e87cd12a1e8b0c6404677ae42bf974a16e668e
REVIEW-TYPE: GitHub 원격 저장소 정적 검토(독립 시험·갤럭시 실기기 검증 없음)
DATE: 2026-11-16 14:30 KST

# HAS '오늘의 투자 판단' — 14:30 위험관리 재검토

## 시작 기준·범위
- 시작 시 `main:docs/team/CLAUDE-LATEST.md`의 STATUS `READY_FOR_REVIEW`, REPORT `docs/team/CLAUDE-DEV-RISK-BRIEFING-20261116.md`(0-b), BRANCH `work/claude-risk-briefing-20261116`, 코드 HEAD `5e4aed9d2742248b7a3d413eb6471a16cc476114`(보고 커밋 `35250f0`)를 확인. 이어 `main`의 README-CLAUDE-REPORTS, COLLAB-PROTOCOL, CLAUDE-WORKLOG, UNIVERSE-SCREEN-REQUEST를 확인하여 기처리 ORDER `GPT-20261116-1030`과 직전 13:30 CHANGES_REQUESTED 확인.
- `978a2c0..5e4aed9` 비교의 코드 범위는 `has/decision-brief.js` 및 `tests/decision-brief.test.cjs`, `tests/lib/live-data-pins.json` 내 해시 1건. 중간 문서 병합은 코드 승인 대상 아님. `has/advisor-core.js`, `has/advisor-bridge.js`, `has/portfolio-reader.js`, `has/briefing-model.js` 연계 코드도 읽어 실제 데이터 경로 점검.
- 주제 브랜치의 13:30 검토서와 처리 일지를 대조했으며 새 ORDER 중복 발행은 하지 않음.

## 직전 수정 요청 확인
- **CR-3 일부 구현 확인:** 같은 티커의 모든 조언에 `verify()` 적용, 한 건 검증 실패 시 전체 보류, 보유 여부·조언 asOf·market·basis 상충 비교, 프로토타입 없는 그룹 맵 `Object.create(null)`로 변경. 정상 중복 1건 집계 및 반례 시험 추가. 다만 아래 **CR-5**로 실제 시장 상충 검증은 연결 경로에서 무력화될 수 있음.
- **CR-4 정적 확인:** `brief.generatedAt` 누락·손상 시 보류, `brief.basis` 필수 `real/synthetic` 및 개별 조언과 일치 필수, `a.asOf > generatedAt+60초` 보류. 빠진 basis·미래 시각·정상 합성/실제 반례 시험이 추가됨.

## CR-5 — 실제 조언에는 market이 전달되지 않아 동일 티커 시장 상충을 감지할 수 없음(필수)
- `has/portfolio-reader.js` 31행은 보유 종목마다 `market: 'US'/'KR'`를 생성하고, `has/advisor-bridge.js` 25·32행도 `targets[].market` / `stock.market`에 전달함.
- 하지만 `has/advisor-core.js` 21~23행의 실제 조언 객체 `adv`에는 **`market` 필드가 없음**. `has/advisor-bridge.js` 11~14행의 보류 조언 `hold()`도 이를 싣지 않음. `advisor-bridge.js` 37행은 `basis/signals`만 추가.
- 따라서 실제 경로에서 `decision-brief.js:verifyGroup()`의 `str(x.market) !== str(a.market)` 비교는 시장이 다른 기록도 공통으로 `'' === ''`가 되어 감지하지 못함. 신규 시장 상충 단위시험은 `mk(...,{market:'US'})`처럼 **실제 엔진에는 없는 필드를 수제 조언에 직접 부착**하여 통과하므로 실제 데이터 경로를 입증하지 못함.
- 해결: 원래 보유·관심종목의 `market`을 최종 조언까지 손실 없이 전달하고, 후보 검증 시 market 누락/비정상 값도 fail-closed로 보류할 것. 동일 티커가 KR/US 양쪽 계좌에 있는 경우 결과가 **입력 순서와 무관하게 판단 보류**되도록 `portfolio-reader → advisor-bridge → advisor-core → briefing-model → decision-brief` 통합 시험을 추가. 불완전·오류 경로(보류 조언)도 확인. 시장 값은 화면에 원치 않는 계좌 정보나 계약 금액을 노출하지 않도록 종목 시장 식별자만 사용.
- 수정 후 변경 파일과 HEAD, 반례 시험 수치·미검증 사항을 새 `READY_FOR_REVIEW` 보고서에 기록하여 재검토 요청. 기존 주문 `GPT-20261116-1030`을 계속 처리하면 됨.

## 시험 근거·보안 및 승인 범위
- 클로 보고: 신규 시험 2건(여러 하위 반례), 전체 **2,239건 중 2,237 통과·0 실패·2 skip**, `scan-secrets` 발견 0. 이번 단위는 화면 변경 없이 Chromium 재시험 생략(이전 단위 360/390/430/1280 결과 참조). 갤럭시 실기기 미검증.
- 해당 수치는 **클로 보고**이지 지피가 독립 실행한 결과가 아님. 지피는 지정 HEAD의 변경 소스·시험 코드·연계 생산 코드와 보고서만 정적으로 읽었음. 스크린샷 원본·실물 단말·실제 시세·SEC/DART 자료 정합성은 미검증.
- **VERDICT: CHANGES_REQUESTED** — CR-4는 정적으로 해결 확인, CR-3의 시장 식별자 연계 누락(CR-5) 때문에 후보 집계 코드 전체 승인은 보류. **운영 반영 승인 아님.**
- `main` 병합·운영 배포·GAS·실제 키/API·비용·클라우드 자원·투자기록·백업·자동매매·비밀값 업로드는 수행하지 않음. 구현 보완은 별도 운영 승인 없이 개발 브랜치 내에서만 진행 가능하고, 운영 반영에는 사용자 승인이 필요.
