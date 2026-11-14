# 추세선 기간 버튼 지연 수정 (클로, 2026-11-13)
STATUS: READY_FOR_REVIEW (배포 전, 순태씨 "올려" 대기)
원인: has/quote-model.js marketDate가 호출마다 new Intl.DateTimeFormat을 만들어(수 ms) 그래프 점 수만큼 느려짐. CPU 프로파일에서 해당 함수가 약 90%.
수정: portfolio_v5.html 첫 스크립트로 Intl.DateTimeFormat 객체 재사용(캐시 40개 한도, 결과 동일). KIS 보호 파일은 무변경.
측정(CPU4x, 합성): 6달 전환 점170개 331→68ms, 1000개 1749→304ms, 4000개 6555→1143ms (약 5배). renderAll 점1000개 139→79ms.
시험: 1990건 중 1988 통과·0 실패·2 건너뜀, 비밀 검사 0건, 신규 tests/intl-format-cache.test.cjs.
미해결: "조금 되다가 멈춤"은 재현 못함(실기기 자료 필요). 실기기 미검증.
