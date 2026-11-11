# 공급자 이용권·비용 판정 (10단계)

확인일 2026-10-29. 근거는 `kr-radar/data/providers-stage10.json`(항목별 URL), 판정은 `rights.js`가 계산합니다. 열람만 했고 **가입·결제·키 발급·API 요청은 0건**입니다.

**판정: 후보 적격 0 / 미확정 10 / 부적격 2** (12곳). 9단계(0/9/2)에서 KRX Open API를 새로 추가해 미확정이 1곳 늘었고, 기존 공급자의 판정은 바뀌지 않았습니다.

| 공급자 | 판정 | 이번에 새로 확인한 원문 근거 | 남은 장애물 |
|---|---|---|---|
| [금융위 KRX상장종목정보](https://www.data.go.kr/data/15094775/openapi.do) | 미확정(미확정 2) | 응답 항목 7개, 수정일 2026-10-28, 상태 필드 없음 | '변경금지'와 가공·로컬 저장 범위 |
| [금융위 주식시세정보](https://www.data.go.kr/data/15094808/openapi.do) | 미확정 | T+1, 종가 포함 | 수정주가·응답 필드·휴장일·권리 |
| [KRX Open API 약관](https://openapi.krx.co.kr/contents/OPP/INFO/OPPINFO005.jsp) | 미확정 | 비상업만, 키당 10,000건/일, 키 1년·양도 금지, 제3자 제공 금지 | 제공 데이터 항목·요금·지연·표시 권리 |
| [KRX Data Marketplace](https://data.krx.co.kr/contents/MDC/INFO/informationController/MDCINFO003.cmd) | 미확정 | 자동 수집·복제·배포 금지. [코스콤 정보 이용 정책서](https://data.krx.co.kr/inc/datasale/Market%20Data%20Usage%20Polices_ko.pdf)(시행 2024-01-01): 개인가입자=비즈니스 목적 아님·자기 자산 관리 | 가격표, 상품 약관, 로컬 계산(비조회형 이용 신고 대상 여부) |
| [KIS](https://apiportal.koreainvestment.com/provider-apply) | 미확정 | 개인은 제휴 대상이 아니라 홈페이지 신청. 시세는 거래소 정보이용계약이 필요(제휴사 대상) | 개인 단독 시세 표시 권리, 약관 본문, 비용 |
| [Twelve Data Basic](https://twelvedata.com/pricing.md) | **부적격** | 비표시 전용 | 표시 설계와 충돌 |
| [Twelve Data 개인 유료](https://twelvedata.com/docs) | 미확정(미확정 9) | 일봉 OHLCV, `adjust`(기본 splits), outputsize 최대 5000, 심볼당 1 크레딧, 1day는 거래소 현지 시간, exchange_schedule은 Ultra 이상 | 요금 페이지('개인·비상업')와 [약관](https://twelvedata.com/terms)('내부 업무 목적') 불일치, 한국 지원, 캐시 허용 기간 |
| [Alpha Vantage 무료](https://alphavantage.co/terms_of_service) | **부적격** | 약관 2(a): 개인·비상업 라이선스. 표시·저장·한도 조항 없음. [조정 일봉은 프리미엄](https://www.alphavantage.co/documentation/) | 무료 키로 조정 기준 일치 불가 |
| [Massive 개인](https://massive.com/individuals-terms-of-service) | 미확정 | 개인·비상업·비업무 목적, 키 공유 금지(§3.3). [시장 데이터 약관](https://massive.com/legal/market-data-terms-of-service): '표시 용도 전용', 공개 표시·게시 금지, 비전문가=본인 비업무 목적 | 낙폭 같은 로컬 계산이 '표시 용도 전용'에 맞는지, 캐시, 월 $199 |
| [Tiingo](https://www.tiingo.com/documentation/appendix/developers) | 미확정 | 사용자별 토큰, 재배포는 별도 라이선스, 출처 표기 | 요금·한도·개인 이용·조정가격(문서 열람 실패) |
| Finnhub | 미확정 | 공식 문서 열람 실패 | 전부 |

## 비용 (읽은 가격만, 월·세금 별도)
- 무료: 금융위 시세·상장종목(상업 이용 불가), KRX Open API(요금 원문에 없음)
- Twelve Data 개인: Grow $29/$49/$79, Pro $99/$149/$229, Ultra $329/$499/$999 (분당 한도 수치는 읽지 못함)
- Massive Stocks Advanced: $199 (다른 개인 플랜 가격은 가격 페이지에 없음)
- 위 금액으로 가입·결제하지 않았습니다.

## 호출량 시나리오 (일봉 하루 1회, 벤치마크 3개, 두 번째 출처 교차검증 포함, 월 22거래일 상한 가정)
| 종목 수 | 하루 합계 | 공급자 1곳당 하루 | 월 합계 | 비고 |
|---|---|---|---|---|
| 5 | 16 | 8 | 352 | Twelve Basic 8/분이면 1분 |
| 10 | 26 | 13 | 572 | 2분 |
| 100 | 206 | 103 | 4,532 | 13분 |
| 200 | 406 | 203 | 8,932 | 26분 |
미국은 Twelve Data(심볼당 1 크레딧, 문서), 한국은 금융위(10,000건/일)·KRX Open API(10,000건/일)와 비교했을 때 모두 하루 한도 안입니다. 다만 금융위·KRX는 **한 호출이 몇 종목·몇 일자를 주는지 원문에 없어** 호출 단위가 불확실합니다. 처음 1회 52주 이력 채우기는 심볼당 1요청(Twelve Data, outputsize 최대 5000)으로 가정했을 때 같은 규모의 추가 호출이 한 번 더 듭니다.

## 공개 GitHub Pages와 데이터 노출
- 개인 약관은 대체로 '본인만 보는' 사용을 허용하고(Massive: 타인이 보는 순간 Business), 가격 공개 게시·복사·재게시를 금지합니다.
- 저장소·ZIP·보고서·시험 로그에 시세를 넣지 않습니다. 앱은 순태씨 기기에서만 받아 순태씨 화면에만 보여야 합니다.
- 브라우저 코드에 키를 넣지 않습니다. 금융위 API는 키를 주소 파라미터에 붙이므로 PC에서 내려받아 파일로 가져오는 방식이 안전합니다. 공개된 중계 서버(예: 누구나 호출 가능한 GAS 주소)는 타인에게 가격이 노출되므로 금지입니다.
