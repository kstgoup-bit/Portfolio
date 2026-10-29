# 18단계 공급자 약관 확인표 (미국 5종목 파일럿 관문) — 확인일 2026-10-29

규칙(지시서 §2): 개인용 무료 조회·표시·저장/캐싱·자동 요청·재배포·지연/수정주가 정책이 **현재 공식 약관에서 확인되지 않으면 호출하지 않는다.** 아래는 공식 페이지 본문을 읽고 요지만 적은 것이며, 법률 해석이 아니다. "약관에 없음"은 허용이 아니라 **불분명**이다.

| 공급자 | 개인 무료 조회 | 표시 | 저장·캐싱 | 자동 요청 | 재배포 | 한도 | 판정 |
|---|---|---|---|---|---|---|---|
| Alpha Vantage [AV1][AV2] | "personal, non-commercial use" 허용(2a). 무료 키는 "Get Free API Key" 클릭 시 약관 동의 | 약관에 명시 없음 | 명시 없음 | 명시 없음 | 양도·재허가 불가 | 무료 25회/일 | **불분명 → 호출 불가**. 또 실시간/15분 지연 미국 시세는 프리미엄 전용 [AV2] |
| Twelve Data [TD1] | Free Tier 상업 사용 금지(2.3(l)) | 외부 표시는 추가 계약 필요(2.2(e)), 허가된 사용자 한정 | 문서에 정한 기간 초과 저장 금지(2.3(g)) | 한도 초과 자동화 금지 | 명시 허가 없이 금지 | 무료 800 크레딧/일(페이지 대조 필요) | **내부 사용(Internal Use)만 허용 — 본인 화면 표시가 내부 사용인지 불분명 → 호출 불가** |
| Massive(구 Polygon) [MS1][MS2][MS3] | 개인 플랜은 "personal, non-business" 한정 | "display use only"(시장데이터 약관 2) | 타 컴퓨터·서버로 복사·전송 금지, 해지 시 삭제 의무 | 과부하 금지 | 금지 | 무료 Basic 5회/분 (플랜 상세는 요금 페이지) | **무료 Basic에 대한 약관 문구가 없음 + 복사 제한 → 불분명 → 호출 불가** |
| Tiingo [TG1] | "All accounts are free", Basic·Power는 "internal and personal use only" | 별도 항목 **없음(불분명)** | 별도 항목 없음 | 분·초 단위 제한 없음, 시간·일·월 대역폭 제한 | "You may not redistribute the data in any form" | 1,000회/일·50회/시·월 500종목(요금 페이지) | **개인 사용 문구가 가장 명확. 단, 표시·저장은 불분명하고 약관 페이지 본문은 직접 열람하지 못함(허용목록 차단)** → 사용자가 약관 원문을 직접 확인해야 호출 가능 |

## 결론 (이번 단계의 판정)
- **자동 호출 승인 조건 충족 공급자: 0곳.** 따라서 이번 단계의 실제 외부 호출은 **0회**가 올바른 결과다(지시서 §2-5).
- 가장 가능성 있는 후보는 Tiingo(개인 사용 문구 명확, 무료). 선결 과제: ① 순태씨가 직접 가입(본인 명의 약관 동의·키 발급 — 자동 생성 불가) ② 순태씨가 약관 본문에서 "본인 화면 표시·본인 기기 저장"이 허용되는지 직접 확인하고 근거 URL/날짜를 승인 파일에 적기 ③ 재배포 금지이므로 **응답 원문을 저장소·보고서·ZIP에 넣지 않음**(실행기는 PC 안 폴더에만 저장).
- 키 취급: 브라우저 앱(HTML/localStorage)에 넣지 않는다. 서버를 만들지 않고 안전하게 쓰는 방법은 **순태씨 PC에서 실행하는 로컬 도구 + 환경변수**뿐이다(`tools/us-pilot-runner.cjs`). 브라우저 직접 호출은 키가 화면 소스·저장소에 노출되어 부적합하다.

## 한국 주식·ETF (이번 승인 범위 밖: 실제 호출 없음)
공공데이터포털 금융위원회 주식시세정보·증권상품시세정보는 일 1회(기준일 다음 영업일 13시 이후), 개발계정 일 10,000건, 공공누리 4유형(출처표시·상업적 이용금지·변경금지)이다 [KR1]. 수정주가 미확인. 상세는 `docs/provider-comparison-final-stage16.md`. KRX 정보데이터시스템은 자동 수집 금지 조항으로 부적합.

## 출처 (확인일 2026-10-29)
[AV1] https://www.alphavantage.co/terms_of_service/ · [AV2] https://www.alphavantage.co/support/ · [TD1] https://twelvedata.com/terms · [MS1] https://massive.com/individuals-terms-of-service · [MS2] https://massive.com/legal/market-data-terms-of-service · [MS3] https://massive.com/knowledge-base/article/which-plan-do-i-need-to-show-massive-data-in-my-app · [TG1] https://www.tiingo.com/documentation/ (개인/재배포 문구) · [KR1] https://www.data.go.kr/data/15094808/openapi.do
미확인: Tiingo 약관 페이지·Massive 약관 페이지 일부는 세션 허용목록 때문에 직접 열람 못함(검색 요약·문서 본문으로 대체). Finnhub는 여전히 미조사.
