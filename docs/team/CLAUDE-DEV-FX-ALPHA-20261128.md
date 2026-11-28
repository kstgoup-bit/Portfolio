STATUS: READY_FOR_REVIEW (운영 미반영, 순태씨 '올려' 전 main 병합 금지)
ORDER-ID: 순태씨 대화 2026-11-28 '1번으로 하자' — 현황 '같은 통화·기간의 참고 알파'를 원화 환산으로 계산
BRANCH: work/claude-fx-alpha-20261128
BASE: 638eb82a3059e142fcf4a18488f067bc7282fb24
HEAD: 8b20ea466883700949c9d9fda758f011f62dddc8
REVIEW-SCOPE: BASE..HEAD 코드 1커밋 — has/fx-history.js(신규), tools/fetch-usdkrw.cjs(신규), .github/workflows/fx-usdkrw.yml(신규), portfolio_v5.html(5곳), tests/fx-alpha.test.cjs(신규 10), tests/lib/live-data-edits.json(5쌍 추가)·live-data-pins.json(portfolio_v5 해시, addedRuntimeFiles fx-history).
UPDATED: 2026-11-28 11시대 KST (순태씨 대화)

## 배경
순태씨 갤럭시 화면: 현황 '전체 같은 통화·기간의 참고 알파'가 모든 기간 '-'. 원인: 전체 계좌는 원화 평가인데 비교 지수가 KS200(원화) 20% + QQQ(달러) 80% 혼합이라 has/return-assessment.js applyBenchmark가 'benchmark-currency-mismatch'로 항상 보류(해외·연금도 QQQ 달러라 같은 이유로 항상 보류). 설계상 정상 보류였고, 순태씨가 원화 환산 계산(1번)을 선택.

## 변경
- **환율 수집(서버 쪽, 비밀값 없음)**: tools/fetch-usdkrw.cjs — Yahoo KRW=X 일별 종가(최근 날짜까지, 비공식)와 미국 연준 H.10(FRED DEXKOUS, 뉴욕 정오 매입률, 공식, 약 1주 지연)을 받아 같은 날짜는 차이 1% 이내만 ok, 넘으면 conflict, 연준 없는 최근 날짜는 unchecked, 야후 없는 날짜는 연준 값(fred). 점 200개 미만·충돌 5% 초과·형식(종목 KRW=X·통화 KRW·CSV 헤더) 이상·둘 다 실패면 저장하지 않음(마지막 성공 파일 유지, 재시도·우회 없음). 출력 data/fx/usdkrw.json 하나.
- **워크플로**: .github/workflows/fx-usdkrw.yml — 한국 07:23 화~토 + 수동 실행, data/fx만 커밋. main 병합 전엔 실행 안 됨.
- **앱 검증 모듈** has/fx-history.js — 형식·단위(KRW per 1 USD)·날짜 실존·오름차순·값 500~3000·미래 수집(+5분 초과) 하나라도 이상하면 전체 사용 안 함. 지수 관측일 당일 또는 이전 4일 안 환율만(충돌 날짜는 건너뜀). 원화 수익률 = (1+달러 수익률)×(끝 환율/시작 환율)−1.
- **앱 연결** portfolio_v5.html benchmarkAssessmentForInterval — QQQ 성분을 환산해 전체(KS200 20% + QQQ원화 80%)·해외·연금 지수를 currency 'KRW'로 넘김 → 기존 return-assessment 규칙 그대로 알파 계산(수정 없음). 환율 자료 없음·날짜 없음·충돌이면 이전과 완전히 같음(달러/혼합 그대로, 알파 보류)과 사유 경고. 같은 사이트 정적 JSON 1회 조회(15초 상한, 실패 60초·성공 6시간 뒤 다시), 받으면 수익률 표만 다시 그림. 제목 'ETF 관측 수익률 (원화 환산)', 사유 문구 5개, 안내 문구(출처·1% 대조·최근 대조 전) 갱신. 국내·일반(KS200) 계산 불변.
- 원화 비교선(그래프)은 범위 밖, 계속 보류.

## 시험
- 신규 tests/fx-alpha.test.cjs 10건: 수집 대조 4종 상태·야후 차단 시 연준만·둘 다 실패 시 기존 파일 유지·형식/범위/점 부족/충돌 과다 미저장·워크플로 범위, 검증 모듈 16가지 이상 문서 거부·4일 경계·충돌 건너뜀·환산 산식(달러+10%, 환율+10% → +21%), 앱 연결(받기 전 동일·받은 뒤 원화·국내 불변·재요청 없음), 알파 = Dietz − 원화 환산 지수(환율 없음·형식 이상·충돌이면 보류), 문구.
- 전체: tests 2507 · pass 2503 · fail 2 · skip 2. 실패 2건은 main과 같은 Git 이식 증명 시험(683, 1176). 중간에 speed-minimal-independent 1건이 새 함수 미정의로 실패 → typeof 방어로 수정해 통과.
- scan-secrets findings 0. live-data 역방향 투영(5쌍 역적용 → baseline 해시) 통과.
- Chromium(실제 portfolio_v5.html, 외부 요청 차단, 합성 환율 JSON, 잠금 화면은 표시 확인용으로 숨김) 360·390·430px: 제목 '원화 환산'·안내 문구 표시, 가로 넘침 없음, 페이지 오류 0. 사용자 자료가 없어 값은 '-'(계산은 JSDOM 시험으로 확인). 실기기 미실시.

## 미검증·주의
- 실제 야후·FRED 응답은 이 환경에서 받지 못함(네트워크 제한) — FRED 페이지(https://fred.stlouisfed.org/series/DEXKOUS, 2026-11-28 확인: 일별, H.10, 최신 관측 2026-11-20 1,342.41, 다음 발표 11-30)만 확인. CSV 주소·야후 KRW=X 응답 형식은 첫 워크플로 실행으로 확인 필요(형식 다르면 저장 안 하고 실패로 끝남).
- 야후 일별 캔들 날짜(UTC)와 QQQ 미국 거래일은 몇 시간 어긋날 수 있음 → 참고값(미검증) 표기 유지.
- 1~5년 칸은 기록 시작(26-05-22) 이전이라 계속 '-'.

## 순태씨 결정 필요
- 운영 반영 시 GitHub Actions 워크플로 1개 추가(하루 1회, 비용·키 없음). 지피 APPROVE 뒤 '올려'로 승인.
