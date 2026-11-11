# HAS 24단계 — main 대비 변경 339개 파일 원인 분석

생성: `node tools/diff-analysis-stage24.cjs` (git 기록만 읽음 · 파일 삭제·되돌림 없음) · 기준 origin/main → HEAD d08e418 · 총 변경 339개, +25670/-109줄

## 1. 결론 먼저
1. **지시서의 316개(23단계 보고 시점; 보고서 커밋 포함 지금은 339개)는 23단계 신규 변경이 아니라 2~23단계가 main에 한 번도 병합되지 않고 쌓인 누적 결과입니다.** 23단계가 처음 추가·수정한 파일은 15개(보고서 포함)입니다. (main은 아직 fd25993 그대로)
2. 운영 앱이 **실제로 불러오는 파일**은 17개(134 KB)뿐이고, 나머지 322개는 문서·시험·PC 도구·증빙·데이터·앱 미연결 모듈입니다. 운영 영향은 변경 개수가 아니라 **앱 본체 2개(portfolio_v5.html, manifest.json)와 그것이 불러오는 파일**로 판단해야 합니다.
3. 투자 원장·백업에 영향을 주는 변경은 **백업 v6 모듈(backup/core.js, backup/ui.js)과 portfolio_v5.html의 내보내기·복원 함수 교체**입니다(§4). 이것이 운영 반영에서 가장 위험한 부분입니다.
4. 임의로 파일을 삭제하거나 기능을 되돌리지 않았습니다.

## 2. 단계별 최초 추가 파일 수 (커밋 메시지 기준)
| 단계 | 최초 추가·수정 파일 수 |
|---|---|
| 2~5단계 | 54 |
| 6단계 | 9 |
| 7단계 | 22 |
| 8단계 | 11 |
| 9단계 | 14 |
| 10단계 | 12 |
| 11단계 | 12 |
| 12단계 | 18 |
| 13단계 | 13 |
| 14단계 | 22 |
| 15단계 | 29 |
| 16단계 | 15 |
| 17단계 | 10 |
| 18단계 | 10 |
| 19단계 | 14 |
| 20단계 | 27 |
| 21(KIS)단계 | 6 |
| 21(연도별 합계)단계 | 4 |
| 23단계 | 15 |
| 24단계 | 22 |

## 3. 기능별 분류
| 분류 | 파일 | 줄(추가/삭제) | 크기 | 예 |
|---|---|---|---|---|
| 기타(설정·시험도구) | 20 | +3925/-0 | 297 KB | `.gitignore`, `experimental/cache-policy.cjs`, `management/pilot-readiness.json` |
| 운영 앱 본체(기존 파일 수정) | 2 | +49/-109 | 515 KB | `manifest.json`, `portfolio_v5.html` |
| 앱 모듈(has·radar·backup·invest; 일부만 앱이 불러옴) | 35 | +2404/-0 | 269 KB | `backup/core.js`, `backup/ui.js`, `has/advice-guard.js` |
| 국장 레이더 모듈(앱이 읽지 않음) | 34 | +2040/-0 | 200 KB | `kr-radar/adapters.js`, `kr-radar/buy.js`, `kr-radar/common.js` |
| PC 도구(앱이 읽지 않음) | 17 | +493/-0 | 55 KB | `tools/build-invest-lab.cjs`, `tools/build-mobile-lab.cjs`, `tools/capture-stage15-screens.cjs` |
| 시험 코드 | 70 | +4294/-0 | 556 KB | `tests/advisor-app-stage24.cjs`, `tests/advisor-lab-stage23.cjs`, `tests/advisor-reliability-stage24.test.cjs` |
| 시험 고정자료·도구 | 9 | +187/-0 | 23 KB | `tests/fixtures/krx/guide-example.xml`, `tests/fixtures/ledger-cases.cjs`, `tests/fixtures/no-net.cjs` |
| 문서 | 115 | +5152/-0 | 568 KB | `docs/KST-stage10-report.md`, `docs/KST-stage11-report.md`, `docs/KST-stage12-report.md` |
| 캡처·증빙 이미지/요약 | 28 | +749/-0 | 5917 KB | `docs/evidence-ledger-years-390.png`, `docs/evidence-stage20/e2e-fail-after.png`, `docs/evidence-stage20/e2e-fail-before.png` |
| 데이터 스냅샷(JSON) | 9 | +6377/-0 | 214 KB | `kr-radar/data/provider-selection-stage12.json`, `kr-radar/data/providers-stage10.json`, `kr-radar/data/providers-stage9.json` |

운영 앱이 불러오는 파일(17개): `backup/core.js`, `backup/ui.js`, `has/ledger-demo-model.js`, `has/ledger-demo.css`, `has/ledger-demo.js`, `has/ledger-years.js`, `has/migration-sim.js`, `has/price-trust-ui.js`, `has/price-trust.js`, `has/readability.css`, `invest/ledger.js`, `manifest.json`, `radar/core.js`, `radar/providers.js`, `radar/radar.css`, `radar/ui.js`, `radar/verification.js`
앱이 읽지 않는 모듈(시험·합성 화면 등, 52개): `has/advice-guard.js`, `has/advice-journal.js`, `has/advisor-app.html`, `has/advisor-app.js`, `has/advisor-bridge.js`, `has/advisor-core.js`, `has/advisor-lab.html`, `has/advisor-lab.js`, `has/alerts-core.js`, `has/portfolio-reader.js`, `has/quote-crosscheck.js`, `has/quote-model.js`, `has/relay-policy.js`, `has/watch-engine.js`, `invest/backtest.js`, `invest/draft-store.js`, `invest/format.js`, `invest/risk.js`, `kr-radar/adapters.js`, `kr-radar/buy.js`, `kr-radar/common.js`, `kr-radar/cost.js`, `kr-radar/eligibility.js`, `kr-radar/fixtures.js`, `kr-radar/identity.js`, `kr-radar/integrity.js`, `kr-radar/krx-api.js`, `kr-radar/krx-run.js`, `kr-radar/krx-status.js`, `kr-radar/listing.js`, `kr-radar/load.js`, `kr-radar/mobile-flow.js`, `kr-radar/mobile-status.js`, `kr-radar/pack.js`, `kr-radar/pilot-gate.js`, `kr-radar/pipeline.js`, `kr-radar/price-normalizers.js`, `kr-radar/pricefeed.js`, `kr-radar/provider.js`, `kr-radar/providers.js` …

## 4. 기존 투자 원장·백업·복원에 영향을 주는 변경
| 변경 | 위치 | 영향 | 위험 평가 |
|---|---|---|---|
| 내보내기·복원 함수 교체 | portfolio_v5.html 의 exportData/importData 본문(-109줄 대부분) → backup/core.js·ui.js 가 덮어씀 | **백업 파일 형식이 새 v6로 바뀜**(구버전 v4/v5는 읽기 호환). 복원은 미리보기→사본 보관→적용→되돌리기 | **높음** — 실제 기록 복원 경로 변경. 합성 시험은 통과했으나 실제 백업 파일 복원 리허설 0회 |
| 저장 키 | 없음 | v5_* 키 이름·형식 변경 없음, 새 키 `kst.portfolio.restoreJournal` 만 복원 시 추가 | 낮음 |
| 원장 시범·연도별 합계 | has/ledger-*.js | 읽기 전용(연도별 합계는 renderLedger 를 감싸 표시만 추가), 시범은 별도 키 미사용 | 낮음 |
| 가격 신뢰 띠 | has/price-trust*.js | 표시 전용 | 낮음 |
| 위험 조회 버튼 문구 | portfolio_v5.html | "미검증 출처" 표기만 변경 | 낮음 |
| 앱 이름·제목 | portfolio_v5.html, manifest.json | 홈 화면 아이콘 이름·제목 변경(사용자가 눈으로 바로 보는 변화) | 중간(기록 영향 없음) |
| 신규 탭 2개 | portfolio_v5.html | 곡소리 레이더·원장 시범(합성) | 낮음, 운영에는 불필요 |

## 5. 불필요한 생성물·시험 산출물 포함 여부
- 캡처·증빙 이미지/요약 28개(5917 KB), 데이터 스냅샷 JSON 9개(214 KB)는 **운영 앱에 불필요**합니다. 문서 115개도 마찬가지입니다.
- 100 KB 초과 파일: `docs/stage15-screens/backtest-390.png` 842KB, `docs/stage15-screens/risk-390.png` 732KB, `docs/stage15-screens/risk-430.png` 732KB, `docs/stage15-screens/risk-360.png` 732KB, `portfolio_v5.html` 515KB, `docs/stage15-screens/pnl-390.png` 458KB, `docs/screenshots-stage14/2-confirm.png` 315KB, `docs/screenshots-stage14/3-result-synthetic.png` 306KB, `docs/screenshots-stage14/4-partial-429.png` 281KB, `docs/stage15-screens/pilot-390.png` 252KB, `docs/screenshots-stage14/1-locked.png` 220KB, `docs/evidence-stage24/advisor-staff-360.png` 171KB, `docs/evidence-stage24/advisor-staff-430.png` 170KB, `docs/evidence-stage24/advisor-staff-390.png` 170KB, `docs/evidence-stage24/advisor-alerts-360.png` 138KB, `docs/evidence-stage24/advisor-alerts-430.png` 138KB, `docs/evidence-stage24/advisor-alerts-390.png` 138KB, `mobile-lab/bundle.js` 136KB
- 비밀값 검사: `node tools/scan-secrets.cjs` 결과 findings 0 (24단계 실행 시점).
- 참고(기존 사항): portfolio_v5.html 에는 main 에도 있는 기본 비밀번호 상수(PW_DEFAULT)가 있습니다. 이번 변경이 만든 것이 아니며 값은 이 문서에 적지 않습니다.

## 6. 운영 앱에 필요한 최소 변경 집합 제안 (적용은 별도 승인)
| 단계 | 내용 | 변경 | 위험 | 비고 |
|---|---|---|---|---|
| A | 연도별 합계 카드(읽기 전용) | has/ledger-years.js + script 태그 1줄 | 낮음 | 사용자가 요청한 기능. 이름·탭·백업 변경 없이 단독 반영 가능 |
| B | 가격 신뢰 띠·가독성 | has/price-trust*.js, has/readability.css + 태그 | 낮음 | 표시 전용 |
| C | 백업 v6 | backup/core.js, backup/ui.js, 내보내기·복원 교체 | **높음** | 사용자의 실제 백업 파일로 복원 리허설을 먼저. 별도 승인 |
| D | 이름·아이콘 변경 | title·manifest·헤더 문구 | 중간 | 선택 사항 |
| E | AI 참모(읽기 전용 연결) | has/advisor-bridge 등 + 화면 | 낮음~중간 | 합성 단계. 실제 시세·키 없이는 '판단 보류'만 나옴 |
| 제외 | 곡소리 레이더·원장 시범 탭, kr-radar, tools, docs, tests, 증빙, 데이터 JSON | — | — | 운영 불필요 |

권장 순서: A → B → (사용자 백업으로 리허설 후) C. 한 번에 316개를 병합하는 것은 권하지 않습니다.
