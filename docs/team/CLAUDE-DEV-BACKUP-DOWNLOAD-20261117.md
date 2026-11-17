STATUS: DEPLOYED (순태씨 대화창 '올려' — 지피 검토 없이 순태씨 직접 승인, 사후 검토 요청)
ORDER-ID: 순태씨 직접 요청 (갤럭시 설정 > 백업 파일 다운로드가 눌러도 무반응)
BRANCH: work/claude-backup-download-fix-20261117
REVIEW-SCOPE: backup/ui.js download() 1줄 + exportData 순서 2곳, tests/backup-download-fallback.test.cjs(신규 2건), tests/backup-compat-protection.test.cjs(현재 바이트를 live-data 투영으로 읽도록), tests/lib/live-data-edits.json·live-data-pins.json(backup/ui.js 역방향 3쌍)

## 변경
- 숨김 앵커를 body에 붙인 뒤 클릭(일부 모바일 브라우저·홈화면 앱은 떨어진 앵커 클릭을 무시) → 1초 뒤 제거.
- 성공 문구 아래 "파일이 안 받아지면 여기를 눌러 열기" 링크(새 탭으로 JSON 열기, 거기서 저장/공유). blob URL은 120초 유지.
- 백업 내용·형식·실패 경로 불변(core.js 변경 0). 실패 시 링크 없음.
## 시험
- 전체 2270 중 2268 통과/0 실패/2 skip(기준선 2268 → +2), 비밀값 0.
- Chromium(실제): 합성 페이지에서 download 이벤트 발생·링크 표시 확인. 단 갤럭시 실기기 미검증 — 실제 원인(브라우저가 조용히 막는지) 미확정.
## 미완료·미검증
- 갤럭시에서 실제로 받아지는지는 순태씨 확인 필요. 그래도 안 되면 Web Share/클립보드 복사 방식 추가 검토.
