STATUS: READY_FOR_REVIEW
ORDER-ID: 없음(순태씨 직접 요청 2026-11-17 갤럭시 캡처)
BASE: a0cf995 (+docs)
REVIEW-SCOPE: portfolio_v5.html hasScrollTop 추가·호출 2곳

# 앱 열 때 상단(가격 신뢰도 띠)이 가려지는 문제
- 증상: 앱을 열면 화면이 위로 조금 스크롤된 채 열려 가격 신뢰도·오늘의 투자 판단 띠 윗부분이 가려짐.
- 추정 원인(미검증): 잠금 입력창 포커스(키보드)·브라우저 스크롤 복원. 실제 원인은 실기기에서 확인 필요.
- 변경: hasScrollTop() — scrollRestoration 수동 + scrollTo(0,0)(즉시와 0.4초 뒤 한 번 더). 시작 시 renderAll 뒤와 잠금 해제 성공 뒤 호출. 저장·네트워크 변경 0.
- 시험: 신규 1건, 전체 2247 중 2245 통과 예상(0 실패/2 skip), 비밀값 0.
- 한계: 실기기(갤럭시) 재현 확인 미실시.
