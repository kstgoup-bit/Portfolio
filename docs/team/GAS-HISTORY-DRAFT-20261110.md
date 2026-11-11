# GAS 일별 종가 요청 초안과 기존 GAS 코드 점검 (클로 → 다비, 2026-11-10)

순태씨가 폰에서 GAS 코드 화면을 캡처해 주었다(1~183줄 확인, 183줄 이후 환율 대체 경로와 끝부분은 아직 미확인). 키·비밀번호로 보이는 줄은 확인된 범위에 없다.

## 기존 GAS 코드에서 읽은 사실
- doGet: `type=exchange`(환율), 기본 `stocks`(시세). 응답은 JSONP(`callback(json)`). 기존 응답 모양: 시세 `{티커:숫자|null}`, 환율 `{usdKrw:숫자}`.
- 미국: 야후 chart v8(`range=1d`)의 `regularMarketPrice`, 실패 시 quoteSummary v10. 한국: 네이버 모바일 `api/stock/{코드}/basic`에서 `closePrice`를 먼저, 없으면 `currentPrice`; 실패 시 네이버 PC 화면 HTML을 정규식으로 읽음. 환율: 야후 `USDKRW=X`, 실패 시 두나무(2순위, 183줄 이후라 미확인).
- 모두 **비공식 경로**다. 한국 가격은 종가/현재가 구분이 없다. 기준시각·거래소·통화·가격 종류 필드가 없다.

## 점검에서 눈에 띈 위험(확인 필요, 코드 수정 아님)
1. 네이버 PC 대체 경로의 `"nav":` 정규식은 ETF의 **순자산가치(NAV)** 를 가격으로 읽을 수 있다. 모바일 API가 실패했을 때만 쓰이지만, ETF 보유가 많아 오가격 가능성을 확인해야 한다(미재현, 실제 화면 기준 필요).
2. 기존 doGet은 `callback` 값을 검증하지 않고 그대로 출력에 붙인다(JSONP 반사). 웹앱 주소가 사실상 유일한 비밀이므로 주소를 공유하지 않아야 한다. 새 요청은 콜백 이름을 `^[A-Za-z_][A-Za-z0-9_]{0,60}$` 로 제한했다.
3. 티커를 URL 경로에 그대로 이어 붙인다(호스트는 고정). 새 요청은 티커를 `^[A-Za-z0-9.\-^=]{1,15}$` 로 제한하고 12개까지만 받는다.

## 초안: gas/has-history-request.gs (type=history)
- 요청: `?type=history&tickers=QQQ,MSFT&market=US&callback=cb`, 한국은 `market=KR`(야후 `.KS` 실패 시 `.KQ`).
- 응답(종목별): `source:'yahoo-chart-v8'`, `symbol`, `currency`, `exchange`, `timezone`, `instrumentType`, `regularMarketTime(ISO)`, `regularMarketPrice`, `fiftyTwoWeekHigh`(야후 메타, 장중 고가 기준일 수 있음), `adjustment:'unverified'`, `barCount`, `bars:[{d:'YYYY-MM-DD',c:종가}]`(최근 1년, 거래소 시간대 기준 날짜, 같은 날짜는 마지막 값, 오름차순). 실패 종목은 `null`.
- **기존 요청은 바꾸지 않는다.** doGet에 `type==="history"` 분기 3줄만 추가하고 새 함수는 모두 `has` 접두어(기존 이름 재정의 없음, 시험으로 고정).
- 시험: tests/gas-history-draft.test.cjs 7개(가짜 UrlFetchApp 사용, 실제 호출 없음). 전체 단위 시험 통과.
- 아직 실제 GAS에 올리지 않았다. 순태씨가 GAS 편집기에 붙여 넣고 새 버전을 배포한 뒤 실제 응답을 복사해 주면 그 표본으로 다시 대조한다.

## 다비에게 요청
- bars의 마지막 날짜 값을 '확정 종가'로 쓰지 말 것: 장중이면 현재가일 수 있다. 거래일 달력·마감 후 경과 시각 규칙(다비의 close-evidence 계약)에 맞춰 판단할 것.
- 위 응답을 advisor-evidence 입력으로 바꾸는 어댑터 설계(52주 고점 365일 연속 달력 요건과 야후의 거래일만 있는 막대가 맞지 않는 점 포함).
- 순태씨 확인 사항: 환율 두나무 대체 경로와 183줄 이후 코드는 추가 캡처 후 점검.

## 상태
브랜치 work/has-gas-history-claude-20261110. 실제 호출·키·클라우드 변경 없음. main 병합·운영 배포 없음. 승인 A~E 미승인.
