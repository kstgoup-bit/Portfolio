STATUS: MERGED — 순태씨 대화창 지시("시작해", 상시 "직접 바꾸고 올려")로 main 반영
ORDER-ID: USER-20261124-KIS-CROSSCHECK
BRANCH: work/claude-kis-crosscheck-20261124 → main

# 국내 종가 두 출처 대조(Yahoo 이력 · KIS 일봉) — 표시 전용 1단계

## 무엇을 했나
- `has/kis-crosscheck.js` 추가: 국내 보유 종목(6자리, 최대 15개)의 **확정 종가**를 같은 날짜끼리 비교.
  - Yahoo: 기존 배포 GAS `type=history&market=KR` (12개씩). KIS: 기존 배포 GAS `type=kis` (5개씩, 서버 하루 150회 예산).
  - 오늘(한국 날짜) 막대·provisional 막대 제외. 최근 공통 거래일 20개까지, 허용 차이 0.5%(설계 제안값).
  - 상태: 일치 / 최근 일치·과거 일부 차이 / 최근 종가 차이 / 자료 없음.
  - 수동 버튼으로만 조회, 같은 세션 10분 안 재조회 막음. 결과는 메모리만(저장소·백업·평가가격·신호 변경 0).
- 위치: 상단 "가격 신뢰도" 띠 → 자세히 보기 아래(`has/price-trust-ui.js` 1줄 mount).
- GAS 변경 0(11-20 배포본 그대로 사용).

## 시험
- 전체 2342 · pass 2341 · fail 0 (신규 `tests/kis-crosscheck.test.cjs`). scan-secrets 통과.
- Chromium 390폭: 가짜 GAS 응답(8종목, 2종목 1일 2.7% 차이)으로 표시·오류 0 확인.
- live-data-edits/pins: portfolio_v5.html 스크립트 태그 1쌍, has/price-trust-ui.js 1쌍(새 기준 핀), addedRuntimeFiles에 kis-crosscheck.js.

## 미검증 · 다음
- 실제 KIS·Yahoo 응답으로 순태씨 폰에서 첫 대조 필요.
- 신호 보류 해제 없음: B 등급 승격·공식 휴장 달력·20거래일 관측 기록(G0)은 아직. 다음 단계 후보 = 대조 결과 일별 기록(저장 키 추가는 순태씨 승인 필요).
- 지피: 사후 검토 요청(특히 같은 GAS 전달 경로를 출처 독립으로 보는 판단, 0.5% 기준).
