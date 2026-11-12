STATUS: WIP
ORDER-ID: (없음 — 일지 승인 작업 #1~5, 다비 제출 719692c 이어받기)
BASE: main ffd07f8   HEAD: 26ad6db (다비 719692c + main 병합) + 이 문서 커밋

# 400종목 곡소리 — 다비 제출(719692c) 클로 검토 1차 (2026-11-12 14:15 KST)

다비 인계(DAVI-universe-handoff) 요청대로 독립 재작성 대신 다비 SHA를 이 브랜치로 이어받았다. 다비 브랜치는 건드리지 않음.
병합 충돌: tests/lib/live-data-pins.json 1건 — portfolio_v5.html은 main 값(bb9a75f6…), radar/ui.js는 다비 값(6c2b07c2…, 실제 파일 해시와 일치)으로 해소.

## 시험 결과 (클로 환경)
- 전체 `node --require ./tests/lib/no-network.cjs --test tests/*.test.cjs`: **1973 중 1971 통과, 0 실패, 2 skip**. 다비 환경의 network-guard 1실패는 여기서 재현 안 됨(환경 차이로 판단).
- `tools/scan-secrets.cjs`: findings 0.
- Chromium(사전 설치판, 기본 launch): 다비 하니스(합성 GAS JSONP, 외부 요청 차단) **360/390/430 통과**, 가로 넘침 없음, 원장(v5_gen) 불변, 반복 조회 시 추가 요청 0. 하니스의 `executablePath:'/usr/bin/chromium'`만 빼고 실행.

## 발견 사항 (다음 실행에서 이 브랜치에 보완)
1. **운영 화면에서 진입 링크가 안 보임**: radar/ui.js render()는 실제 모드+HASLivePricePanel(운영 기본)일 때 일찍 return 하며, 다비 링크는 데모/합성 화면 nav에만 추가됨. 실제 앱 `#kst-radar/real/list`에서 링크 0개 확인. → 실제 모드 nav에 링크 추가 필요.
2. 화면 문구 "보유·확신 종목 별도 포함"은 현재 사실과 다름(GAS가 extras 거부, 개인 경로 미구현). → "보유·확신 종목은 기존 곡소리 화면에서 확인" 등으로 수정.
3. 상태 줄이 UTC ISO 원문(예: 2026-11-12T05:05:20Z)과 영문 사유 코드(invalid-input)를 그대로 표시 → 한국시간·한국어 사유로.
4. `evidence-universe/` 산출물이 커밋돼 있음 — 규칙상 시험 산출물 커밋 금지. 하니스 출력 경로도 저장소 밖(임시 폴더)으로.
5. 하니스의 Chromium 경로 하드코딩 제거.
6. 로컬 서버로 앱→화면→돌아가기 확인 중 pageerror "Unexpected token '<'" 1건 — 원인 미확인(클로 임시 서버 경로 처리일 가능성). 다음 실행에서 main과 비교 확인.

## 가장 큰 미완료 (운영 차단)
- 공식 400종목 구성목록(코스피200·나스닥100·S&P100·S&P500 시총순) 원본·기준일 확보 — 미검증. 가짜 목록으로 채우지 않음.
- GAS 실제 설치·트리거 — 순태씨 승인 전 하지 않음. 12개월 수익률 null 유지, 매수 검토 후보 없음(재무 연결 전).

## 순태씨 결정 필요
지금 없음.
