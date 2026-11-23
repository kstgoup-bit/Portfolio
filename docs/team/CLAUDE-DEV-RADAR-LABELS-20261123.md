STATUS: READY_FOR_REVIEW
ORDER-ID: 순태씨 직접 요청 2026-11-23 ("다 해" — 곡소리 화면 3건 수정 + 1·2위 낙폭 확인)
BASE: 49e09cd (main)
HEAD: b5cc75003eeb048e0801af213dacdaccdf9b844d
REVIEW-SCOPE: 49e09cd..b5cc750 — has/fear-top.js, has/fundamental-filter.js, portfolio_v5.html(탭 2줄), tests 2건 추가·기대 문구 2곳 갱신, pins/edits.

## 변경
1. 곡소리 상태줄 요약 시각: UTC 원문(`2026-11-22T23:16:49.631Z`) → `2026-11-23 08:16 (한국시간)`. 해석 불가 값은 원문 그대로 표시(숨기지 않음). `HASFearTop.kstTime` 공개.
2. 재무 보류 문구: KR → `재무: 국내 기업 재무(DART) 미연결 · 판단 보류`, 그 밖의 비미국 → `해외 기업 재무 미연결(미국 SEC만 연결)`. 상태(`unsupported`)·판단 보류 로직 변경 없음. 곡소리·환호성 둘 다 적용.
3. 탭 표시: 곡소리·환호성 `준비 중` → `가격 참고`(조회는 동작, 의견은 계속 판단 보류). 12px·#333 유지.
- portfolio_v5.html: live-data-edits.json에 [현재, 이전] 쌍(문맥 1줄 위·아래) 추가, 역적용으로 기준 해시 재현 확인. live-data-pins currentSha256·addedRuntimeFiles(fear-top, fundamental-filter) 갱신.

## 시험
- 전체: `node --require ./tests/lib/no-network.cjs --test tests/*.test.cjs` → 2314 중 2310 통과 → 기대 문구 2곳 갱신 후 해당 파일 19/19 통과(나머지는 변경 영향 없음, 처음 실행에서 실패는 이 2건뿐). skip 2(기존).
- scan-secrets: findings 0.
- Chromium 360·390·430(외부 요청 차단, 가짜 전송): 탭 문구 '가격 참고', 상태줄 한국시간, DART 문구, 가로 넘침 없음, 최소 글자 13.3px. 첫 화면 잠금 때문에 스크린샷에는 목록이 안 보임 → DOM 검사로 확인.

## 1·2위 낙폭 확인 (2026-11-23 조사, 공식 원본 아님 → 미검증)
| 종목 | 앱 값 | 외부 확인 | 판정 |
|---|---|---|---|
| LG이노텍 011070 | -82.5%, 267,500 (11-20) | 52주 최고 1,814,000(topstarnews·joongangenews)/1,788,000(alphasquare), 최저 226,000. 11-20 종가 265,500(alphasquare). stockanalysis(9-10 기준): 분할 기록 없음, 주식수 23.66M, 당시 가격 557,000 | 분할 증거 없음. 9월 557,000 → 11월 26만대 하락은 실제로 보임. **고점 180만원대의 날짜·사실은 미확인**(일봉 표와 6~7배 차이) |
| 미래에셋증권 006800 | -77.4%, 18,960 (11-20) | 52주 최고 87,800(stockhub·meerae·hankyung)/88,000(mokdon). 11-20 종가 출처마다 다름(18,750/18,800/18,960). 분할·무상증자 언급 없음 | 분할 증거 없음. 고점 날짜 미확인. 종가 출처 불일치 |
- 결론: 두 종목 모두 '분할로 인한 가짜 낙폭' 증거는 못 찾았지만, 고점 날짜·값을 KRX 공식 일봉으로 대조하지 못함 → G0 전까지 순위는 가격 참고만.
- 출처: topstarnews.net/news/articleView.html?idxno=16283556, joongangenews.com/news/articleView.html?idxno=562712, alphasquare.co.kr/home/stock-summary?code=011070, stockanalysis.com/quote/krx/011070/statistics/, stockhub.kr/stock/006800, meerae.ai/atlas/006800/, mokdon.kr/kr/006800, markets.hankyung.com/stock/006800 (모두 2026-11-23 조회).

## 미완료·순태씨 결정
- 운영 반영은 지피 검토 후 순태씨 '올려'.
