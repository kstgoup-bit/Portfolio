# KIS 시세 중계 GAS 초안 (클로, 2026-11-15)

범위: 국내 종목 일봉 종가 조회 전용. 주문·계좌·잔고 경로 없음. 앱(portfolio_v5.html) 변경 없음.

## 파일
- `gas/has-kis-request.gs` — `type=kis` 처리. `has-history-request.gs`의 `hasHistoryCallback_`·`hasHistoryTicker_`를 재사용하므로 두 파일을 같이 붙여넣는다.
- `tests/kis-gas-relay.test.cjs` — 모의(Stub) 시험 5건. 실제 KIS 호출 없음.

## 적용 순서 (순태씨)
1. GAS 프로젝트 설정 → 스크립트 속성에 `KIS_APP_KEY`, `KIS_APP_SECRET` 입력 (코드·채팅에 키 쓰지 않음).
2. 새 파일 `has-kis-request` 추가 후 위 `.gs` 내용 붙여넣기.
3. 기존 `doGet`의 `type==="history"` 분기 바로 아래에 한 줄 추가:
   `if (e.parameter && e.parameter.type === 'kis') return hasKisResponse_(e, e.parameter.callback);`
   (기존 변수명이 다르면 기존 history 분기와 같은 방식으로 맞춘다.)
4. 같은 URL로 새 버전 배포.
5. 브라우저에서 `…/exec?type=kis&tickers=069500&callback=t` 호출 → 응답만 복사해서 전달 (주소는 보내지 않아도 됨).

## 안전 장치
- 키는 스크립트 속성에만 존재, 응답·오류에 키/토큰 미반사.
- 호출 주소는 토큰 발급 + 일봉 조회 두 가지뿐. 6자리 종목코드만 허용, 최대 5개.
- 토큰은 속성에 저장해 재사용(만료 10분 전 갱신), LockService로 동시 발급 방지.
- 하루 150회 호출 예산(토큰 포함, 환불 없음).

## 미검증 (실제 호출 전까지 단정하지 않음)
- KIS가 Google 서버 IP 호출을 허용하는지.
- 토큰 재발급 제한 수치, 초당 호출 제한.
- 엔드포인트·필드명(공개 가이드 기준: `/oauth2/tokenP`, `inquire-daily-itemchartprice`, `FHKST03010100`, `stck_bsop_date`, `stck_clpr`).
- `FID_ORG_ADJ_PRC=0`(수정주가)이 가이드 표기대로인지. 앱 연결 전 원본가와 대조 필요.
- 약관상 개인 앱 시세 사용 범위.

## 앱 연결은 아직 하지 않음
응답 확인 후, 별도 승인으로 기존 Yahoo 값과의 교차검증(불일치 표시만, 자동 덮어쓰기 없음)을 설계한다.
