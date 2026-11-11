# Draft PR 초안 — 원격 미생성

제목: Add gated pilot data contract and versioned universe review safeguards

Head: work/kst-value-radar-stage4-20261029
Base: main
Draft: true

지정 5종목 MSFT/GOOGL/AVGO/VRT/JPM의 정규화 일봉 어댑터 계약과 오류·결측·기간·수정가격 검증을 추가합니다. 실제 이용권/인증이 없어 API 요청은0이고 파일럿은 미실시입니다. 공식 문서의 회사/티커/거래소 식별만 별도 기록합니다.

16개 보류 후보를 그대로 유지하면서 검증 레지스트리·증분 버전·무근거 활성/제외 차단, UI의 파일럿 차단/기준일 지연 상태를 추가합니다. 200개 부하는 TEST 심볼과 고정 합성 transport로만 시험했습니다. 가격만으로 정성 점수를 만들지 않습니다.

기존 v6 전체 백업과 점수/가격 임계치, manifest·운영 워커는 그대로입니다. 단위132개, 모바일21묶음 통과. 실제 Android는 미실시입니다. 실제 활성0/보류16/제외0이며 원격 브랜치 생성이403으로 막혀 이 초안만 제공합니다.

**main 병합·자동 병합·운영 배포·Pages/운영 워커 반영·유료 리소스 생성 금지.**
