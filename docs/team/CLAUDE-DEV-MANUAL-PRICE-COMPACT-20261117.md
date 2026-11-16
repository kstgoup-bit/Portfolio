STATUS: READY_FOR_REVIEW
ORDER-ID: 없음(순태씨 직접 요청 2026-11-17, '공간을 너무 잡아먹음')
BASE: b1b457e
REVIEW-SCOPE: portfolio_v5.html renderManualPriceForm/toggleManualPriceFields 표시 구조만

# 종목 수정 '가격 방식' 접기
- 큰 테두리 상자(fieldset) → 접힌 한 줄 '⚙ 가격 방식: 시세 조회 (변경)'(details). 수동 가격이면 펼친 채 시작. 선택 시 요약 문구 즉시 갱신.
- 안내문 단축(자동 입력 안 함·g당 금액·허용 기간 초과 시 보류·판단 근거 아님 유지). 입력 id·저장 로직(readManualPriceForm) 무변경.
- 시험: 신규 1건, 전체 2246 중 2244 통과/0 실패/2 skip, 비밀값 0. 브라우저 360/390/430 확인 미실시.
