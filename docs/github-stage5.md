# GitHub 진단 — 2026-10-29

원격 main 읽기 결과 `fd2599398d2f2ef1816ca9b64ea134ea8811309d`, 변경 없음. 설치 id 175633756, kstgoup-bit, repository_selection=selected. 저장소 읽기 성공. 연결 도구는 설치 앱의 세부 Contents/Pull requests grant를 반환하지 않아 직접 확인 불가다. 사용자 계정 repo metadata의 push/admin=true는 설치 앱 권한 증거가 아니다.

정상 인자로 원격 브랜치 `work/kst-value-radar-stage5-20261029`를 main SHA에서 만들려 한 API 요청 **1회가 403 Resource not accessible by integration**으로 실패했다. 그 전에 잘못된 인자 3회는 도구 바인딩 오류로 API에 전달되지 않았다. 403 이후 재시도·다른 인증·PAT 요청·push·권한 확대 없음. 원격 branch/commit/PR은 없다. 정확한 원인이 Contents 미부여인지 저장소 grant/기타 앱 제한인지 도구 출력만으로 단정하지 않는다.

본인 설정에서 [설치 앱](https://github.com/settings/installations/175633756)의 저장소 선택 및 Contents/Pull requests 권한을 확인하는 것이 후속 절차다. 이번 작업에서 설정을 변경하지 않았다. 권한 변경은 사용자 별도 승인 대상이다.

## 본인의 인증된 개발 환경에서만 적용

ZIP source는 전체 파일, baseline-stage4는 기준 파일이다. 첨부 README의 patch 검증 절차를 따른다. 먼저 원격 main SHA와 자신의 stage4 SHA를 확인하고, 다른 값이면 자동 적용/덮어쓰기하지 말고 차이를 검토한다. 새 stage5 브랜치만 만든다. 기존 운영 브라우저의 site data를 삭제하거나 소스 ZIP에 투자 데이터를 넣지 않는다. 개발 테스트는 별도 origin/합성 데이터로 실행한다.

main에서 전체 patch를 적용하거나, 정확한 stage4에서 증분 patch를 적용한다. 둘을 연속 적용하지 않는다. format-patch는 단계2~5 커밋 재현 대안이며 patch와 중복 적용하지 않는다. 검토/시험 후 본인이 인증한 정상 git으로 해당 개발 브랜치만 push할 수 있다. 기본 브랜치 변경·강제 push·병합·배포 명령은 제공하지 않는다. PR이 필요하면 Draft로 만들되 base=main 병합은 하지 않는다. ZIP에 토큰이나 인증 설정을 포함하지 않는다.
