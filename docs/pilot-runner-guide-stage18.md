# 5종목 실가격 파일럿 — 순태씨 PC 실행 안내 (승인 후에만)

지금은 **실행하지 않습니다.** 아래는 약관을 직접 확인하고 가입까지 마친 뒤에 쓰는 순서입니다. Claude는 가입·키 발급·키 입력을 대신하지 않습니다.

1. 공급자(예: Tiingo) 사이트에서 순태씨 명의로 **무료** 가입(결제수단 등록 요구 시 중단). 약관에서 "본인 화면 표시·본인 기기 저장" 허용 여부를 직접 확인.
2. 저장소 밖(예: 문서 폴더의 `has-pilot`)에 `approval.json` 직접 작성: `approvedBy:"user"`, `approvedAt`, `provider:"tiingo"`, `termsConfirmedByUser:true`, `termsUrl`, `termsCheckedAt`, `freeNoPayment:true`, `tickers`(MSFT,GOOGL,AVGO,VRT,JPM 중), `maxPerDay`(≤10), `maxTotal`(≤200), 공급자 한도가 더 낮으면 `providerLowerLimit`.
3. 키는 **명령 창의 환경변수 `HAS_PRICE_KEY`** 로만 입력(파일·채팅·저장소에 쓰지 않음, 명령행 인자로 넣으면 거부됨).
4. 독립 대조용 `reference.json`(선택): 증권사 앱 등 **다른 출처**의 같은 날짜 정규장 종가를 직접 적음. `{"MSFT":{"source":"증권사 앱","date":"YYYY-MM-DD","close":000.00,"priceType":"close"}}`. 출처가 공급자와 같으면 독립 검증으로 세지 않음.
5. 점검: `node tools/us-pilot-runner.cjs --preflight` → 실행: `--live --approval=… --state=… --out-dir=… --reference=…`
6. 결과의 `apiCalls`, `fetchSuccess`, `independentVerified`, `activeMonitoring(항상 0)`만 보고합니다. 응답 원문은 PC 폴더에만 남고 저장소·ZIP에는 넣지 않습니다(재배포 금지 조항 때문).
7. 429가 나오면 도구가 남은 종목 조회를 중단합니다. 하루/전체 한도는 호출 **전에** 장부에 기록되어 실패·재시도도 포함됩니다.
