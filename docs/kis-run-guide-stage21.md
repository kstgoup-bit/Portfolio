# KIS 시세 1회 조회 — PC 실행 안내 (순태씨용)
준비: ① PC에 Node.js(LTS)가 있어야 합니다(없으면 nodejs.org에서 LTS 설치). ② 이 폴더의 `tools` 안 파일 2개(`kis-quote-runner.cjs`, `kis-run.ps1`)만 있으면 됩니다.
실행: 폴더에서 PowerShell을 열고 `.\tools\kis-run.ps1` 입력(실행 정책 오류가 나면 `powershell -ExecutionPolicy Bypass -File .\tools\kis-run.ps1`).
입력 순서: 종목코드(예 005930,000660) → 승인 문구 `APPROVE-B-KIS` 직접 입력(이것이 승인) → App Key, App Secret(화면에 안 보임).
결과: `내 문서 옆 사용자 폴더\has-kis-snapshots` 에 가격 파일이 생깁니다. 공개 장소·저장소에 올리지 마세요(약관 제5조③).
호출: 토큰 1회 + 종목당 1회, 최대 6회, 오류 나면 즉시 중단, 하루 1회만 실행됩니다. 키는 저장되지 않고 창을 닫으면 사라집니다.
결과 확인: 파일 속 가격을 증권사 앱 값과 비교해 같은지만 알려 주세요(키는 절대 보내지 마세요).
