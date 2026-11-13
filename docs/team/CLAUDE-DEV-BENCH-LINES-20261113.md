# 기준지수선 두 문제 수정 (클로, 2026-11-13 13:10)
STATUS: READY_FOR_REVIEW (배포 전, 순태씨 "올려" 대기). 순태씨가 보호 규칙 파일 수정을 "둘 다 고친다"로 승인.
증상(순태씨 스크린샷): 해외·연금·현황에 QQQ선 없음, 국내(KODEX 200)선은 마지막 점보다 하루 짧음.
원인 1: KODEX 200만 설정된 GAS로 받고 QQQ·SPY는 공개 중계(allorigins 등)→Yahoo 경로뿐이라 폰에서 자주 실패. 규칙 파일이 GAS 라이브 수용을 KS200으로만 제한.
원인 2: 규칙이 항상 '이전 거래소 날짜' 종가만 선택(당일 제외). 장 마감 후 기록한 점도 하루 전 종가를 써서 선이 하루 늦음.
수정:
- has/benchmark-history-policy.js: GAS 라이브 수용을 KS200·QQQ·SPY로 확장(검증 규칙 동일), selectPointAtOrBefore에 옵트인 sameDayAfterClose(기록 시각과 수신 시각 둘 다 장 마감 이후일 때만 당일 종가, KR 15:30 KST, US 16:00 ET(보수적으로 EST 기준), 결과는 계속 provisional·미확정 표시). 기본 동작(수익률 평가 등)은 그대로.
- portfolio_v5.html: 세 지수 모두 GAS 먼저, 실패 시 기존 공개 경로로 폴백. 그래프용 조회만 옵션 사용. GAS 코드 변경 없음(이미 market=US 지원).
- 시험: tests/benchmark-us-gas-sameday.test.cjs 신규 3건, 기존 GAS 연결 시험 3건 갱신(QQQ·SPY GAS 요청 반영), 핀(live-data edits/pins)에 보호 파일 수정 등록. 전체 1996건 중 1994 통과·0 실패·2 건너뜀, 비밀 검사 0건.
- 브라우저 확인(합성): 마감 후 기록한 3개 점에 대해 QQQ 선이 3점 전부 생성(마지막 점 포함).
한계: 실기기 미검증. 폰이 GAS로 QQQ 이력을 실제로 받는지는 배포 후 "ⓘ 그래프 안내"/기준지수 상태 문구로 확인 필요. 실제 GAS 응답 형식이 계약과 다르면 폴백(기존 경로)으로 동작.
