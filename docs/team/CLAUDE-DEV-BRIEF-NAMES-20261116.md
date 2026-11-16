STATUS: READY_FOR_REVIEW
ORDER-ID: 없음(순태씨 직접 요청 2026-11-16 갤럭시 캡처)
BASE: 925c721
HEAD: (코드 커밋 아래 참조)
REVIEW-SCOPE: has/decision-brief.js 종목명 표시, tests/decision-brief.test.cjs, tests/lib/live-data-pins.json

# 오늘의 투자 판단 — 종목명 표시
- 요청: 판단 보류 목록에 코드(00680K 등)만 있어 종목명을 모르겠음.
- 변경: 항목 줄을 '종목명 (코드)'로 표시. 이름은 앱 이름표(computed.names, 보유종목) 우선 → 의견의 name(코드와 다를 때) → 없으면 코드만. portfolio_v5.html·GAS·기록 변경 0.
- 시험: 신규 1건, 전체 2244 중 2242 통과/0 실패/2 skip, 비밀값 0. 브라우저 360/390/430 확인은 미실시(텍스트 길이만 늘어남, 줄바꿈).
- 한계: 앱 보유종목 목록에 이름이 없는 코드는 계속 코드만 보임.
