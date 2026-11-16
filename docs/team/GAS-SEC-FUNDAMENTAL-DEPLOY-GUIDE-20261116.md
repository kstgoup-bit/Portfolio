# SEC 재무 수집 GAS 배포 안내 (순태씨 직접 실행용, 초안 2026-11-16)

STATUS: DRAFT — 순태씨 GAS 승인 전. 클로는 Apps Script에 접근할 수 없어 직접 배포하지 않습니다. 실제 Apps Script 화면·할당량은 미검증.

## 무엇을 하나
앱이 미국 종목의 SEC 공시 재무(최근 5년 연간)를 GAS 경유로 받아 '위대한 기업'·곡소리·환호성 카드에 재무 라벨을 보여 주게 합니다. 요청에는 **티커만** 보냅니다(보유·금액 없음). 키·비용 없음(SEC 공개 API). 판단은 계속 '판단 보류'이며 매수·매도 권유 없음.

## 규칙 출처(2026-11-16 확인)
- https://www.sec.gov/os/accessing-edgar-data — 최대 초당 10건, 요청 헤더에 User-Agent 선언 필요(회사명+연락처 형식). 이 코드는 요청 간 200ms 간격, 한 번에 최대 6종목.
- https://www.sec.gov/search-filings/edgar-application-programming-interfaces — companyfacts URL, 인증 불필요, CORS 미지원(그래서 GAS 경유).

## 순서
1. 기존 스크립트를 **복사본으로 백업**.
2. 새 파일 2개: `has/fundamental-filter.js` 내용 → `fundamental-filter.gs`, `gas/has-sec-fundamental.gs` 내용 → `has-sec-fundamental.gs`.
3. `has-sec-fundamental.gs` 맨 위 `HAS_SEC_USER_AGENT`의 `CONTACT_EMAIL_HERE`를 **순태씨 연락처로 직접 교체**(저장소·클로에게 알릴 필요 없음).
4. 기존 `doGet(e)` 맨 위에 한 줄: `if (e.parameter && e.parameter.type === 'fundamental') return hasSecFundamentalResponse_(e, e.parameter.callback);`
5. 새 버전 배포(기존 URL 유지). 권한 창에 "외부 서비스 연결(UrlFetch)"이 뜨면 허용.
6. 확인: 주소 뒤에 `?type=fundamental&tickers=AAPL` 을 붙여 열면 `{"ok":true,...}` JSON이 나와야 합니다.

## 한계(미검증)
- 실제 SEC 응답 크기·GAS 실행시간(대형주 companyfacts는 수 MB)·UrlFetch 일일 할당량.
- 티커→CIK 표(company_tickers.json)는 SEC가 정확성을 보증하지 않음. 모르는 티커는 'unknown-ticker'로 보류.
- 결과는 6시간 캐시(CacheService 한도). 앱 쪽 연결(가져와서 카드에 싣기)은 **다음 단계**이며 이 GAS만 올리면 화면은 아직 '미연결'.
