VERDICT: CHANGES_REQUESTED
REVIEWED-CLAUDE-HEAD: eb98f24675747510c6db53dfe7c310bf25aef36d
REVIEWED-CODE-COMMIT: 45beaa4a96f336f59b85b0d3e59cc149e3835f91
BASE-MAIN: ac3a0668cedd6b73d0ad70d9f5397a06873e4972
REVIEW-DATE: 2026-11-15 14:30 KST
SCOPE: 재무 필터 3단계, 독립 브랜치의 화면 라벨 연결과 증빙만. 2단계 계산 모듈 11:30 APPROVE를 취소하거나 운영 연결을 승인하는 문서가 아님.

# HAS 재무 필터 3단계 교차검토 — 수정 요청

## 확인한 근거
- 지정 HEAD의 `docs/team/CLAUDE-DEV-FUNDAMENTAL-FILTER-20261115.md`는 3단계 `READY_FOR_REVIEW`, 코드 커밋 `45beaa4`를 명시.
- `488cd55...eb98f24` 비교 및 지정 HEAD 실제 파일 확인: `has/fundamental-filter.js`의 `validNormalized/display`, `has/fear-top.js`, `has/live-price-panel.js`, `portfolio_v5.html`, `tests/fundamental-display.test.cjs`, live-data 보호 파일.
- 보고된 시험은 새 6건, 전체 2,137건 중 통과 2,135/실패 0/제외 2, Chromium 360/390/430 확인. **지피가 이 시험·브라우저를 독립 실행한 것은 아님.**

## 필수 수정
1. **환호성 재무자료 전달 경로 누락(기능 미작동).** `has/live-price-panel.js`는 `F.display(data.fundamental,...)`를 호출하지만 `has/live-price-reference.js`의 실제 `createService().start() → cache.set() → snapshot()` 경로는 반환 항목에 `fundamental`을 보존하지 않고 `record`만 저장한다. 현재 단위시험은 서비스 모의객체에서 `items[].fundamental`을 직접 만들어 전달하므로 이 단절을 검출하지 못한다. 실 서비스와 같은 데이터 계약을 통해 재무 객체가 검증되어 실제 패널까지 전달되도록 브랜치에서 수정하라. GAS 배포·네트워크 호출·운영 변경 없이 합성 수집→캐시→스냅샷→카드 전체 경로 시험을 추가한다.
2. **재무자료 종목 정합성 확인.** `validNormalized()`은 숫자·연도 형식을 확인하지만 `normalized.ticker`가 화면 대상 종목과 같은지는 확인하지 않는다. 다른 종목의 유효한 재무 객체를 주면 현재 종목의 '우량 근거 충분' 등으로 잘못 붙을 수 있다. `F.display()`의 기대 종목/시장과 실제 재무 원본 식별자의 일치 여부, 출처·기준일·형식 충돌 시 보류 처리를 추가하고 교차 종목 시험을 만든다. 원본 검증 미실시는 표시 문구에서 계속 구분한다.
3. **미연결·실패 경로 회귀시험.** 환호성에 가격 근거가 없거나 `record`가 stale/missing일 때 재무자료를 표시할지, 보류할지를 명시하고 검증한다. 새 경로 때문에 가격 조회·보유 정보·기존 캐시·투자기록을 변경하지 않는다. 기존 `fundamental` 미전송 GAS에서는 계속 '미연결'과 '판단 보류'가 표시되어야 한다.

## 범위 및 승인 경계
- 현재 판정은 **3단계 화면 연결에 한정한 CHANGES_REQUESTED**. 2단계 정적 검토 승인은 유지된다.
- `main` 병합, `portfolio_v5.html` 운영 반영, GAS 변경·배포, 실제 SEC/API/키 사용, 계좌·백업 변경, 자동매매·비용 발생 **미승인**.
- 다음 보고서는 수정된 실제 HEAD·변경 파일·합성 전 구간 시험·회귀시험 결과를 일치시켜 `READY_FOR_REVIEW`로 재제출. 지피 검토는 코드·보고서의 정적 검토이며 독립 시험 성공 선언이 아님.
