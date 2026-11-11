# 종목별 검증 상태 — 2026-10-29

**실제 활성 0 · 보류 후보 16 · 제외 0.** 현재 모두 편입 적격성 미검증이다. 아래 기존 회사명·업종·거래소는 이전 후보 초안의 값이며 공식 식별 자료가 연결된 일부 종목 외에는 재검증하지 않았다. 이 표는 실시간 감시 성공 목록이 아니다.

| 티커 | 회사명(초안) | 업종(초안) | 거래소(초안) | 현재 상태 | 시총/재무/경쟁력 | 원자료·검증일 |
|---|---|---|---|---|---|---|
| AAPL | Apple | 정보기술 | NASDAQ | 보류 | 미검증 | 미확인 · 편입 검증일 없음 |
| MSFT | Microsoft | 정보기술 | NASDAQ | 보류 | 미검증 | [기업 식별 자료](https://www.microsoft.com/investor/reports/ar26/index.html) · 2026-10-29 식별만 확인 |
| NVDA | NVIDIA | 정보기술 | NASDAQ | 보류 | 미검증 | 미확인 · 편입 검증일 없음 |
| GOOGL | Alphabet | 커뮤니케이션 | NASDAQ | 보류 | 미검증 | [기업 식별 자료](https://www.sec.gov/Archives/edgar/data/1652044/000165204426000066/googexhibit991q22026.htm) · 2026-10-29 식별만 확인 |
| META | Meta Platforms | 커뮤니케이션 | NASDAQ | 보류 | 미검증 | 미확인 · 편입 검증일 없음 |
| AMZN | Amazon | 경기소비재 | NASDAQ | 보류 | 미검증 | 미확인 · 편입 검증일 없음 |
| COST | Costco Wholesale | 필수소비재 | NASDAQ | 보류 | 미검증 | 미확인 · 편입 검증일 없음 |
| PG | Procter & Gamble | 필수소비재 | NYSE | 보류 | 미검증 | 미확인 · 편입 검증일 없음 |
| JNJ | Johnson & Johnson | 헬스케어 | NYSE | 보류 | 미검증 | 미확인 · 편입 검증일 없음 |
| ABT | Abbott Laboratories | 헬스케어 | NYSE | 보류 | 미검증 | 미확인 · 편입 검증일 없음 |
| JPM | JPMorgan Chase | 금융 | NYSE | 보류 | 미검증 | [기업 식별 자료](https://jpmorganchaseco.gcs-web.com/ir/shareholder-information/faqs) · 2026-10-29 식별만 확인 |
| V | Visa | 금융 | NYSE | 보류 | 미검증 | 미확인 · 편입 검증일 없음 |
| CAT | Caterpillar | 산업재 | NYSE | 보류 | 미검증 | 미확인 · 편입 검증일 없음 |
| UNP | Union Pacific | 산업재 | NYSE | 보류 | 미검증 | 미확인 · 편입 검증일 없음 |
| XOM | Exxon Mobil | 에너지 | NYSE | 보류 | 미검증 | 미확인 · 편입 검증일 없음 |
| NEE | NextEra Energy | 유틸리티 | NYSE | 보류 | 미검증 | 미확인 · 편입 검증일 없음 |

상장 상태·시총 50억 달러·재무·경쟁력·업종·이용권 6개 체크는 현재 모두 unknown이다. 금융기업은 자본적정성·자산건전성·조달, 고성장은 현금 소진 기간·희석·단위 경제성을 추가로 확인한다. 회사 식별 자료를 읽은 것을 모든 체크 통과로 바꾸지 않았다.

## 지정 5종목 파일럿과의 구분

| 티커 | 문서상 식별 정보 | 공식 출처 | 가격 검증 | 편입 |
|---|---|---|---|---|
| MSFT | Microsoft · NASDAQ | [발행회사/SEC 문서](https://www.microsoft.com/investor/reports/ar26/index.html) | 미실시 · API 0건 | 기존 후보 보류 유지 |
| GOOGL | Alphabet Class A · NASDAQ | [발행회사/SEC 문서](https://www.sec.gov/Archives/edgar/data/1652044/000165204426000066/googexhibit991q22026.htm) | 미실시 · API 0건 | 기존 후보 보류 유지 |
| AVGO | Broadcom · NASDAQ | [발행회사/SEC 문서](https://investors.broadcom.com/company-information/faqs) | 미실시 · API 0건 | 보류; 기존 목록 밖은 자동 추가하지 않음 |
| VRT | Vertiv · NYSE | [발행회사/SEC 문서](https://investors.vertiv.com/news/news-details/2026/Vertiv-Announces-Date-of-Third-Quarter-2026-Earnings-Release-and-Conference-Call/) | 미실시 · API 0건 | 보류; 기존 목록 밖은 자동 추가하지 않음 |
| JPM | JPMorgan Chase · NYSE | [발행회사/SEC 문서](https://jpmorganchaseco.gcs-web.com/ir/shareholder-information/faqs) | 미실시 · API 0건 | 기존 후보 보류 유지 |

AVGO·VRT는 파일럿 대상이지만 기존 16개 감시 후보에는 없다. 둘을 자동 추가하거나 후보를 200개로 채우지 않았다. FAQ의 명시적 문서 기준일은 미확인이며, 조회일 2026-10-29와 구분한다. 원문 필드는 radar/data/pilot-status.json에 있다. 모든 가격·기준 종가일·52주 기간·수정 방식·가격 조회시각·지연 정보는 null이다.
