STATUS: READY_FOR_REVIEW
ORDER-ID: (순태씨 대화 2026-11-14 '곡소리나 환호성 아직 작동 안하네')
BASE: 33f8c18c74a335bff8eaff58748abdf1e8d11e5f
HEAD: db22a493e7f05262c614a3442b6b9fa7730683df
REVIEW-SCOPE: has/fear-top.js accept/reason(2곳), has/live-price-panel.js 조회 전 카드 문구(1곳), 새 시험 2건, live-data-pins SHA 2개

# 곡소리·환호성 '작동 안 함' 원인과 문구 수정 (2026-11-14)

## 원인
- 곡소리 Top10: 앱은 GAS `type=screen` 요약을 요청하지만, 순태씨 GAS에는 200종목 계산(`gas/has-universe-screen.gs`, 배포 제안만)이 **설치·배포되지 않음**. 기존 GAS가 다른 모양의 응답을 돌려줘 `invalid-summary`로 보류됨(코드 결함 아님, 서버 미설치).
- 환호성: 화면 상태 문구가 기본값(조회 전)이었음 → '가격 근거 새로고침'을 누르기 전에는 모든 종목이 '가격 근거 없음'으로 보여 고장처럼 보임. 같은 GAS `type=history` 경로는 지수 진단에서 운영 중.

## 변경
- fear-top.js: schema·items 없는 응답 → `screen-not-installed` → "GAS에 곡소리 계산(200종목)이 아직 설치되지 않았습니다 · 설치는 순태씨 승인 후 진행".
- live-price-panel.js: 조회 전에는 종목마다 "아직 조회 전 · 위 '가격 근거 새로고침'을 눌러 주세요". 조회 후 자료 없음은 기존 문구 유지.

## 시험
- 전체 2108 중 2106 통과/0 실패/2 skip(DST), 비밀값 0, Chromium 360/390/430 가로 넘침 없음.

## 미완료·순태씨 결정 필요
- 곡소리 Top10 실제 작동 = GAS에 계산 파일 추가 + 야간 시간 트리거 설치(GAS 실제 변경 → 순태씨 승인 필요).
- 곡소리/환호성 '판단'은 재무 연결 전까지 계속 '판단 보류'(투자 철학: 가격만으로 매수·매도 권유 금지).
