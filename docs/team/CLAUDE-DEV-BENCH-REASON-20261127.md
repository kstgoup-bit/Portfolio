STATUS: READY_FOR_REVIEW (운영 미반영, 순태씨 '올려' 대기)
ORDER-ID: 순태씨 대화 2026-11-27 '개선해' (현황 그래프 지수 비교선이 조용히 사라진 문제)
BASE: 0b1db84
BRANCH: work/claude-bench-reason-20261127
REVIEW-SCOPE: portfolio_v5.html(renderLineChart 표시 블록 +12줄), tests/bench-reason-line.test.cjs(신규 3), tests/lib/live-data-edits.json(역방향 쌍 2)·live-data-pins.json(portfolio_v5.html 해시 1줄)

## 배경
순태씨 폰 현황 '전체 자산 변화' 1주 그래프에 지수 비교선(KODEX 200 20% + QQQ 80%)이 없었다(범례만 표시). 이유는 접힌 'ⓘ 그래프 안내' 안에만 적혀 있어 눈에 띄지 않았다. 하루 뒤(그래프 시작일 11/20 → 11/21) 선이 생겼다. 원인은 추정(시작일 이전 한 지수 기록 부재)이며 11/20 당시 저장 자료로 확인하지는 못했다.

## 변경(표시 전용)
- renderLineChart: 비교선이 없거나 보류일 때 이유를 '그래프 안내' 바로 아래에 한 줄(12px·#333, role=status)로 표시. "⚠ 지수 비교선 없음 — <기존 bWhy 사유>" 또는 "⚠ 지수 비교선 보류 — 수익률 계산이 보류 상태예요(ⓘ 그래프 안내 참고)". 선이 생기면 줄 제거.
- 계산(getBenchmarkSeriesForChart·computeCashFlowSeries)·저장값·판단·카드 라벨은 불변. 시험으로 표시 블록이 저장·계산 함수를 호출하지 않음을 고정.

## 시험
- 전체 2500 · pass 2496 · fail 2(main과 동일: 683·1169 — Git 실행·로컬 참조 필요 시험) · skip 2, scan-secrets 0. 신규 3 통과.
- Chromium(합성 자료, 외부 요청 차단) 360/390/430px: 줄 표시 확인, 글자 12px·rgb(51,51,51), 가로 넘침 0, 페이지 오류 0. 실기기 미확인.

## 미검증·참고
- 지수선이 빠진 실제 원인(11/20 시점 지수 기록)은 확정하지 못함. 문구는 기존 bWhy 분기를 그대로 사용(분기 추가·변경 없음).
- 같은 날 질문: 해외·현황 매수금(회색선) 마지막 날 하락 — 환율·수량·평균단가 변화 중 무엇인지 순태씨 확인 대기(코드상 매수금 = 수량×평균단가×기록 시점 환율).
- 순태씨 결정 필요: 운영 반영('올려') 여부.
