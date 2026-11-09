# 브라우저·모바일 검증 상태

2026-11-09 독립 실행 환경에서 Chromium을 한 번 실행했습니다. 시작 중 아래 오류로 종료되어 페이지 렌더링은 수행되지 않았습니다.

`FATAL: chrome/browser/process_singleton_posix.cc:297 socket() failed: Operation not permitted (1)`

추가 crashpad `--database required` 메시지가 있었고 프로세스는 SIGABRT로 종료했습니다. 권한 거부를 우회하거나 브라우저 재시도를 하지 않았습니다.

360/390/430/1280px 검사용 스크립트 `tests/data-workbench-mobile.cjs`를 준비했습니다. 실제 모바일/브라우저 통과는 미확인입니다. jsdom으로 실제 엔진과 합성 예시, 입력/초기화, 결과 제거, 안전한 문자열 표시, 자료 부족·평탄 차트, 기존 storage sentinel 불변을 확인했습니다. DOM 결과는 픽셀 레이아웃·터치·접근성 실기기 검증을 대신하지 않습니다.
