# 곡소리 선별 GAS 배포 안내 (순태씨 직접 실행용, 2026-11-14)

클로는 순태씨의 Apps Script에 접근할 수 없어서 **직접 배포할 수 없습니다.** 아래는 순태씨가 하실 순서입니다. 순서·코드는 저장소 파일 기준이고, 실제 Apps Script 화면·할당량은 클로가 확인하지 못했습니다(미검증).

## 준비된 것(main)
- `has/universe-screen.js` (선별 계산, 새 v2 목록 지원) · `has/live-price-reference.js` · `gas/has-universe-screen.gs` (배치·저장·응답)
- 목록(manifest): `radar/data/universe-manifest-20261112.json` — 코스피200 201 + 미국 201티커(200사), 기준일 2026-11-12, 개인 종목 없음.

## 순서
1. Apps Script 프로젝트(기존 HAS GAS)를 열고 **새 파일 3개**를 만들어 위 3개 파일 내용을 그대로 붙여넣기: `live-price-reference.js` → 파일명 `live-price-reference.gs`, `universe-screen.js` → `universe-screen.gs`, `has-universe-screen.gs`. (기존 `doGet`·히스토리 코드는 수정하지 않음. 이미 live-price-reference 가 들어 있으면 그 파일은 건너뜀.)
2. 기존 `doGet(e)` 맨 위에 한 줄만 추가: `if (e.parameter && e.parameter.type === 'screen') return hasScreenResponse_(e.parameter.callback);`
3. manifest JSON 전체를 새 함수에 붙여 한 번 실행: `function hasScreenKickoff(){ hasScreenStart_(<manifest JSON>); }` → 실행(권한 승인 창이 뜨면 본인 계정으로 허용).
4. 시간 기반 트리거 1개: `hasScreenRun_` 를 **10~15분마다** 실행(묶음 34개를 이어 처리, 한 번에 4.5분 예산). 완료되면 'PUBLIC'에 공개 요약이 저장됩니다. 야간 갱신은 매일 새벽 `hasScreenKickoff` 를 부르는 트리거를 하나 더 두면 됩니다(자동 설치는 코드에 없음).
5. 웹앱 새 버전으로 **배포 관리 → 새 버전 배포**(기존 URL 유지).
6. 앱: 곡소리 탭 → '곡소리 후보 조회'. 처음엔 "screen-not-published"이면 아직 계산 중이니 몇십 분 뒤 다시.

## 주의
- 이 작업은 순태씨의 Apps Script를 바꾸는 일이라, 하시기 전 기존 스크립트를 **복사본으로 백업**해 두세요.
- 가격 조회는 기존 `hasGetHistories_`(야후 차트)를 씁니다. 미지원·실패 종목은 '자료 부족'으로 표시되고 나머지는 계속됩니다.
- 갱신: 분기마다 QQQ·SPY 보유종목을 새로 받아 목록을 다시 만들어 manifest 를 교체(앱에 기준일 90일 경과 표시는 다음 단위).
- 클로가 확인하지 못한 것: 실제 GAS 실행 시간·일일 호출 할당량, 야후 응답 형식 변화, 허니웰 에어로스페이스(HONA)·스페이스X(SPCX) 같은 신규 종목의 조회 지원 여부.
