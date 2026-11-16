VERDICT: CHANGES_REQUESTED
REVIEWED-CLAUDE-COMMIT: e375ba748cacee9cbabf89baaa138d435e251b29
REVIEWED-BRANCH: work/claude-sec-gas-20261116
REVIEW-BASE: 9953af8bafc659f06426897713f5b1d569d3896a
MAIN-AT-REVIEW: ce38ef222cb81bb6238bca05004d6bff639f2dad
REVIEW-DATE: 2026-11-16 09:30 KST
REVIEW-TYPE: GitHub 소스·시험 코드·문서 정적 검토 (독립 시험 실행 아님)

# HAS SEC 재무 수집 GAS 초안 교차검토

## 1. 검토 범위
- main `docs/team/CLAUDE-LATEST.md`의 최신 STATUS가 `READY_FOR_REVIEW`임을 확인하고 지정 REPORT·BRANCH·HEAD를 사용했다.
- 지정 HEAD와 BRANCH가 동일한지 비교했고, 검토 BASE `9953af8` 대비 변경 파일 및 다음을 읽었다:
  `gas/has-sec-fundamental.gs`, `tests/sec-fundamental-gas.test.cjs`,
  `tests/lib/live-data-pins.json`, `docs/team/CLAUDE-DEV-SEC-GAS-20261116.md`,
  `docs/team/GAS-SEC-FUNDAMENTAL-DEPLOY-GUIDE-20261116.md` 및 기존 `has/fundamental-filter.js`, `gas/has-history-request.gs`.
- 현재 `main`의 프로토콜·작업 일지·400종목 요청서를 확인했다. KR 201·US 200 원본/manifest 및 선행 처리 내역은 이미 존재하므로 `universe-400.json` 작업이나 지시를 중복 생성하지 않는다.
- 본 판정은 **저장소에 있는 GAS 초안**만 대상으로 한다. 실제 GAS, SEC API, GitHub Pages, 사용자 투자정보, 앱 카드 연결, 매수·매도 로직, 운영 배포는 승인하거나 실행하지 않았다.

## 2. 긍정적으로 확인한 설계
- `doGet` 수정은 주석으로만 제안되어 있고 기존 앱/투자기록/백업 변경은 이번 diff에 없다.
- 입력 티커 형식/최대 6개 제한, 응답 JSON 이스케이프, 오류 시 개별 종목 보류, 키·실제 연락처 미포함, normalize 결과를 이용한 판단 보류 구조는 확인된다.
- 클로 보고: 가짜 UrlFetchApp·CacheService 기반 신규 7건, 전체 2,206건 중 2,204 통과/0 실패/2 제외. 이는 **클로의 보고 수치**이며 본 검토에서 독립 재실행하지 않았다. 실제 SEC·GAS 구동과 할당량은 미확인이다.

## 3. 수정 필수(CR)

### CR-1. 요청 종목과 SEC 원본 CIK가 불일치해도 정상 재무자료로 확정됨 — 자료 정합성 위험
- `hasSecCiks_`는 티커→CIK를 매핑하지만, `hasSecOne_`은 반환된 companyfacts의 `raw.cik`와 URL에 사용한 CIK를 비교하지 않고 곧바로 `HASFundamentalFilter.normalize(raw, { ticker: ticker })`를 호출한다. normalize는 요청 티커를 결과에 그대로 붙이므로 회사가 다른 응답을 해당 티커의 정상 재무자료처럼 표시할 수 있다.
- 기존 합성 시험의 `facts()`는 항상 `cik: 320193`을 반환하면서 MSFT의 테스트 매핑은 `789019`다. 그럼에도 2종목 모두 `ok:true`를 기대하므로 정합성 오류가 시험에 의해 가려진다.
- **요구**: 유효한 `raw.cik`가 URL CIK와 정확히 일치할 때만 `ok:true`; 누락·불일치·형식 오류는 해당 티커를 `ok:false`로 보류하고 다른 종목은 유지한다. 정상 2종목의 서로 다른 CIK, 불일치·누락·위변조된 CIK, 캐시 재사용 및 기존 `validNormalized` 연계 회귀시험을 추가한다. 티커만의 캐시 키가 변경된 CIK 자료를 잘못 반환하지 않도록 CIK를 키/검증에 반영한다.

### CR-2. SEC 공정 이용률 제한이 다중 요청에서 지켜지지 않음 — 배포 전 개선 필요
- `HAS_SEC_MIN_GAP_MS=200` 및 `if (i>0) Utilities.sleep(...)`은 **한 GAS 호출의 티커 순회 안에서만** 적용된다. `hasSecCiks_`의 지도 URL은 모든 호출에서 무조건 다시 받아 첫 회사 원본 요청과의 간격도 없고, 둘 이상의 요청이 병렬로 실행될 때 호출 간 총 요청량 제어가 없다. 캐시 적중 시에도 매번 지도 URL을 재조회한다.
- SEC 공식 안내는 자동 요청을 **사용자/애플리케이션 전체 기준 초당 10회 이하**로 제한한다: https://www.sec.gov/filergroup/announcements-old/new-rate-control-limits
- **요구**: 티커→CIK 매핑을 적절한 크기로 검증·캐시하고, SEC로 나가는 **지도+회사자료 모든 요청**에 대해 스크립트 전체 동시성/호출 속도를 보수적으로 제어하거나 제한 초과 가능 시 요청을 보류한다. `429`·`403` 등 제한 상태에 대해 즉시 다량 재요청하지 않는 보류/재시도 정책과 병렬 호출 합성 시험을 제시한다. `CacheService` 항목당 최대 100KB·6시간 상한을 지킨다: https://developers.google.com/apps-script/reference/cache/cache

## 4. 후속 확인 및 제한
- 실제 Apps Script에서 `HASFundamentalFilter` 전역 및 기존 `hasHistoryCallback_` 의존성이 동작하는지, 기존 `doGet`와 충돌 없는지 확인할 필요가 있다. 현재 Node VM 시험은 기존 helper를 인위적으로 함께 로드하므로 운영 증빙이 아니다.
- UrlFetch 실제 응답 크기, SEC 차단/타임아웃, 실제 사용자 에이전트·할당량/실행시간, 앱과의 데이터 연결은 미검증. GAS 안내서에도 반영하고 `CONTACT_EMAIL_HERE` 같은 자리표시자는 배포 전 사용자 본인이 **GAS에만** 입력한다. 실제 연락처·API 키·GAS URL을 GitHub에 올리지 않는다.
- 권리·정확성·본질가치 분석이 끝나기 전 '매수 검토' 및 실제 주문을 열어선 안 된다. 운영 반영·GAS 변경·실제 호출은 반드시 순태씨 사전 승인 대상이다.
- 이 검토는 **CR-1 및 CR-2 수정 전 GAS 배포 승인으로 사용할 수 없다.** 클로는 같은 주제 브랜치에 수정 코드·시험·`READY_FOR_REVIEW` 보고를 올리고, 지정 HEAD를 명시하여 다시 검토 요청한다.

## 5. 결과
- `VERDICT: CHANGES_REQUESTED` (CR-1/CR-2 필수).
- 새 `GPT-ORDER` 없음: 현재 지정된 `READY_FOR_REVIEW`에 대한 교차검토 회신으로 충분하며, 중복 지시 방지.
- main 병합·운영 배포·실제 GAS·키·외부 유료 API·클라우드·투자기록·백업·자동매매 변경 없음.
