STATUS: READY_FOR_REVIEW
ORDER-ID: GPT-20261112-1630
BASE: 2f6772f   HEAD: 7fd93f11f88d35ba65e8dbdb5f10c4ebf7451f7d
REVIEW-SCOPE: `gas/has-universe-screen.gs`(초안 보완), `tests/universe-screen-synthetic400.test.cjs`(새 12건), `tests/lib/synthetic-universe-400.test-only.cjs`(합성 픽스처), `tests/universe-screen-gas.test.cjs`(가짜 Utilities에 SHA-256 추가 1줄), `tests/lib/live-data-pins.json`(gs 해시 1줄). 앱(portfolio_v5.html)·`has/universe-screen.js`·실제 GAS 변경 없음. 중간의 `fd3eb3d`는 main 문서 병합.

# #3 GAS 야간 계산 — 저장소 전용 합성 시험 초안 (2026-11-12 17:30 KST)

## 이름 정리
일지의 `gas/has-screen.gs`는 계획 단계 이름이고, 실제 코드는 다비가 만든 **`gas/has-universe-screen.gs`**(GAS 쪽) + **`has/universe-screen.js`**(계산·검증, 앱·GAS 공용)다. 새 파일을 만들지 않고 기존 `.gs`만 보완했다. 일지 #3 이름도 이 기준으로 고침.

## 바꾼 것 (기존 대비)
| 항목 | 이전(다비 초안) | 이번 |
|---|---|---|
| 저장 무결성 | 조각 존재·개수만 확인 | HEAD에 `len`·`sha256` 기록, 읽을 때 길이·SHA-256 불일치면 `screen-integrity`로 거부(같은 길이 변조도 차단) |
| 6분 한계 | 트리거 1회 = 1묶음 | `hasScreenRun_(budget)` 추가: 예산 4.5분(최대) 안에서 묶음 반복, "지금까지 가장 느린 묶음 시간"을 더하면 예산 초과일 때 멈추고 다음 트리거에서 재개 |
| 공개 응답 | 저장된 PUBLIC을 그대로 반환 | 반환 전 `validateSummary`(형식·만료 2일·매수후보 0·판단 보류) + **extra(개인 보유·확신) 행 있으면 거부**, 60만 자 초과면 `screen-too-large`, 만료면 `screen-expired`, 손상이면 `screen-unavailable` |
| 기존 GAS와 충돌 | — | `doGet`/`hasHistory*` 변경 없음. 새 전역 이름이 기존 `has-history-request.gs`와 겹치지 않음을 시험으로 고정. `type=screen` 연결(doGet 분기)은 **여전히 순태씨 승인 후** |

## 합성 시험 근거 (`tests/universe-screen-synthetic400.test.cjs`, 12건 모두 통과)
- 픽스처: `synthetic/testOnly/notForProduction` 표시, 코드 `9ZZ###`(KR)·`ZSYN###`(US), 출처 `https://example.invalid/synthetic-test-only`. KR 200·US 200(나스닥 100 ∪ S&P100 100, 겹침 20 → 180 + S&P500 시총순 20 보충), 중복 0, 형식 검사, 실제 코스피200 스냅샷과 겹침 0, `radar/data/universe-400.json` 없음 확인.
- 묶음: 34묶음 모두 12종목 이하·한 시장만, GAS 단계별 종목 호출도 12개 이하.
- 전체 실행(가짜 GAS 환경, 실제 `live-price-reference.js`·`universe-screen.js`·`has-history-request.gs` 로드, 네트워크 차단): 400/400 reference, `complete:true`, 매수후보 0, 전 행 `판단 보류`, 12개월 수익률 null, 무관한 속성 보존, 조각 ≤8000자, 이전 세대 조각 삭제.
- 진행 중 새 세대(10묶음)는 응답에 안 나오고 이전 완료 세대 유지 → 끝나면 교체.
- 한 묶음 조회 실패 → 12행 missing, `complete:false`, 400행 유지.
- 저장 중 실패(할당량 가정) → 다음 단계에서 중복 없이 재개.
- 시간 예산: 묶음당 40초 가정 시 1회 실행 ≤300초에서 멈추고 이어서 완료, 완료 후 `finished`.
- 변조: 같은 길이 1글자 변경·HEAD 해시 변경 → 거부, 해시 없는 HEAD → `screen-invalid-pointer`.
- callback: 안전한 이름만 JSONP, `alert(1);x`·`a.b`·`__proto__`·`constructor`·81자·`</script>`·U+2028·빈값·숫자 → JSON으로만, 입력 반사 없음, 응답에 `<>` 없음.
- 만료(3일 후)·extra 행·매수후보·초과 크기·미발행 → 데이터 대신 오류. extra 포함 매니페스트는 시작 거부.
- 기준 불일치(통화·거래소·심볼 접미사·시간대·조정기준) → missing·판단 보류·가격 없음. 비교지수 통화 다름(KR 종목 vs SPY) → 초과수익 null. 22일 지난 관측 → stale.

## 계산상 가정과 측정(합성 자료, 실제 아님)
- 합성 400행 측정: PUBLIC 압축 10,148자(2조각), WORK 12,616자(2조각), 전체 속성 23,371자, JSONP 응답 411,719자. **합성 가격은 규칙적이라 압축이 실제보다 잘 될 수 있음 — 실제 크기 미검증.** 응답은 압축 전 기준 약 1,030자/행 → 500행이면 약 52만 자로 상한 60만 자에 가까움(필요 시 응답 필드 축소 검토).
- GAS 한계 가정: 실행 6분, 속성 값 9KB, 전체 속성 500KB, 트리거 최소 1분 간격 — **공식 문서로 이번에 재확인하지 않음(미검증)**. 묶음당 실제 Yahoo 조회 시간 미측정.
- 34묶음 + 비교지수 조회(묶음마다 1회) = 하루 약 68회 UrlFetch 가정 — 실제 할당량 대비 미검증.

## 시험 결과
- 전체: `node --require ./tests/lib/no-network.cjs --test tests/*.test.cjs` → **1990 중 1988 통과 / 0 실패 / 2 skip**(skip 2건은 이전과 동일).
- 처음 실행 시 2건 실패: `gas/has-universe-screen.gs`가 live-data 고정 해시 대상 → `live-data-pins.json` 해시 갱신 후 통과.
- `node tools/scan-secrets.cjs` → 0건. 앱 화면 변경 없음 → Chromium 360/390/430 해당 없음.

## 남은 차단·미검증
- #1 미국 200 공식 원본 없음(순태씨가 11-13 ETF 보유종목 파일 제공 예정) → 실데이터 가동 불가, #1 미완료.
- KR "정확히 200" 계약: 순태씨 결정은 "발표 201개 그대로" — **코드 계약은 아직 200 그대로**(지시서의 임의 변경 금지에 따라 지피 확인 전 미변경). 지피 동의 요청.
- 미국 기준 변경(나스닥100 ∪ S&P100 → 나스닥100 ∪ 국내상장 S&P500 ETF 비중 상위) 역시 계약 변경 → 지피 확인 요청, 순태씨 파일 확인 후 진행.
- 지피 1630 검토의 "라이선스 미확인 원본·종목 목록을 공개 저장소에 올리지 말 것"과 16:55 `radar/data/kospi200-20261112.json`(코드·이름만, 순태씨 지시로 브랜치에 커밋, main 미병합) 관계 — **저장소 공개 여부·KRX 재배포 조건 미확인**. 순태씨·지피 판단 필요.
- 실제 Apps Script 작동·트리거·할당량·실제 종가는 전혀 검증 안 됨. 시험 통과 ≠ 실제 작동.

## 순태씨 결정 필요
- 없음(이번 단위). 운영·GAS 반영은 #4 이후 묶어서 승인 요청 예정.

---

(이전 단위 머리말: STATUS: READY_FOR_REVIEW / ORDER-ID: GPT-20261112-1530 (부분 진행: 국내 코스피200 확보, 미국 200 미확보로 universe-400.json 아직 없음) / BASE: 1db85974e66a8dec3c3ff8d93fc2fa9ceb789104   HEAD: 659914ce72ebebd2b0307bdbec0537d96c498b56 / REVIEW-SCOPE: `radar/data/kospi200-20261112.json`, `tests/kospi200-snapshot.test.cjs`, `tests/lib/live-data-pins.json`(addedRuntimeFiles 1줄). 앱·GAS 코드 변경 없음.)

# #1-KR 코스피200 공식 스냅샷 (2026-11-12 16:55 KST)

- 원본: 순태씨가 KRX 정보데이터시스템에서 직접 내려받아 클로 대화창에 첨부한 엑셀(생성 2026-11-12 16:42 KST, Apache POI = KRX 다운로드 형식, 원본 SHA-256 파일에 기록). 열: 종목코드·종목명·종가·대비·등락률·상장시가총액.
- **201종목**(중복 0, 6자리 코드 형식 위반 0). 200이 아닌 이유는 2026-08 한화 인적분할 신설 **0220W0 한화머시너리앤서비스홀딩스** 임시 포함으로 추정 — **미검증**(KRX 공지 미확인).
- **순태씨 결정(2026-11-12 클로 대화창, "1번", "201개로")**: KRX 발표 201개 그대로 감시. → 다음 단위에서 `buildUniverse/validateUniverse`의 "KR 정확히 200"을 "발표 개수 그대로(≥200)"로 바꾸고, 지시서의 "정확히 200"과 다르므로 지피 확인 요청.
- 저장 범위: 종목코드·종목명·출처·기준일만. 가격·시가총액 열은 KRX 재배포 조건 미확인으로 저장 안 함. 원본 엑셀은 저장소에 올리지 않음.
- 조회 기준일: 파일에 표기 없음 → asOf는 다운로드일 2026-11-12로 기록(장중 다운로드라 전일 기준일 가능성 있음, 미검증).
- 시험: 전체 1978 중 1976 통과/0 실패/2 skip(새 시험 3건 포함), `tools/scan-secrets.cjs` 0건. 처음 실행 시 새 파일이 보호 경로(radar/) 추가로 2건 실패 → live-data-pins `addedRuntimeFiles`에 등록해 해결.
- 미완료: 미국 200(나스닥100 ∪ S&P100 + S&P500 시총 보충) 공식 원본 — 여전히 차단(아래 보고). 2 skip 원인 미기록.

---

# #1 공식 400종목 감시목록 — 차단 보고 (2026-11-12 16:10 KST)

지시서 GPT-20261112-1530 완료 조건 4("공식 목록·비교 가능한 시가총액을 확보 못 하면 임의로 400개를 만들지 말고 보고")에 따라 **`radar/data/universe-400.json`을 만들지 않았다.** 앱·GAS·시험 코드 변경 없음.

## 확인한 사실 (기준 2026-11-12 16:00~16:10 KST)
| 원본 | 시도 | 결과 |
|---|---|---|
| KRX 정보데이터시스템 지수구성종목 `https://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd?menuId=MDC0201010106` | 클라우드 셸 직접 접속, 웹 읽기 도구 | 셸: 연결 불가(응답 코드 000). 웹 읽기: 무인 실행이라 접근 허가 대기 중 차단. **로그인 필요 여부·재배포 조건 미검증** |
| Nasdaq 공식 `https://indexes.nasdaq.com/Index/Weighting/NDX`, `https://api.nasdaq.com/api/quote/list-type/nasdaq100` | 같음 | 셸 000, 웹 읽기 차단. **구성 증권 수·기준일 미검증** |
| S&P DJI `https://www.spglobal.com/spdji/en/indices/equity/sp-100/` (S&P 500 동일) | 같음 | 셸 000, 웹 읽기 차단. **미검증** |
| 대학 도서관 안내 `https://ask.lib.uiowa.edu/biz/faq/368583`(갱신 2025-05-12), `https://www.library.hbs.edu/services/help-center/index-constituents`(날짜 없음) | 웹 읽기 성공 | S&P 500 구성목록 취득 경로로 Net Advantage·Bloomberg·Morningstar Direct·Eikon/Datastream·Capital IQ 등 **유료·라이선스 데이터베이스만** 안내. S&P 공식 사이트 무료 전체 다운로드 언급 없음(이것은 두 안내문의 내용일 뿐, S&P 사이트를 직접 확인한 것은 아님) |

검색에 나온 위키백과·datahub·tradingview·종목정보 사이트 목록은 공식 발행자 원본이 아니므로 사용하지 않음(지시서 범위). S&P 500 **동일 기준일 USD 시가총액**(전체 vs 유통주식 기준 포함)도 확보 못 함 → 보충 순위 만들지 않음.

## 차단 사유
1. 이 예약 실행 환경에서는 공식 발행자 사이트에 접속할 수 없음(셸 네트워크 허용 목록 밖, 웹 읽기는 사람 허가가 필요한데 무인 실행).
2. S&P 100/500 전체 구성목록과 지수 기준 시가총액은 S&P DJI 라이선스 자료일 가능성이 큼(도서관 안내 근거, S&P 약관 직접 확인은 미검증). 공개 저장소(GitHub Pages) 재배포는 권리 확인 전 불가.
3. KRX 자료의 재배포 조건 미확인.

## 합법적 취득 방안 (순태씨 결정 필요)
- **A. 순태씨 직접 다운로드(무료, 권장 시작점)**: KRX 정보데이터시스템 [지수 → 지수구성종목, 코스피200] CSV, Nasdaq-100 공식 구성 페이지. 받은 파일을 클로 대화창에 첨부 → 클로가 변환·검증. 공개 저장소에는 **종목코드·기준일·출처만** 두고 원본 파일·가중치·시가총액은 올리지 않는 방식(재배포 범위는 각 약관 확인 후 확정).
- **B. 미국 보충 기준 변경**: S&P 500 시총순 대신 공개 확인 가능한 기준(예: 나스닥100 ∪ S&P100 + 보유·확신 종목)으로 미국 core 수를 200 미만 허용 — 현재 `buildUniverse` 계약(정확히 200)과 지시서 변경 필요(지피 지시서 + 순태씨 승인).
- **C. 유료 자료(S&P 라이선스·데이터 업체)**: 비용 발생 → 사전 승인 필수. 현재 권하지 않음.
- 클로 의견: A로 코스피200·나스닥100을 먼저 확보하고, S&P 100/500은 B 또는 순태씨 판단 후 진행이 비용 없이 가장 빠름. 단, 최종 결정은 순태씨.

## 이번 실행 시험
- 코드 변경 없어 전체 회귀시험 재실행 안 함(직전 기록 1975 중 1973 통과/0 실패/2 skip, HEAD 1db8597 기준). 2 skip 원인은 다음 코드 단위 보고 때 명시 예정(미기록).
- `node tools/scan-secrets.cjs`: 아래 일지에 결과 기록.

## 그 외 처리
- GPT-TEST-0001(GPT-ORDER-20261112-1430.md): 브랜치 `docs/gpt-universe-screen-20261112`에 실제 존재, STATUS/ORDER-ID/BASE 3줄 확인. 지피가 15:24 이후 **수동 대화로 작성**한 시험 — 예약 무인 실행 성공 증거 아님.
- GPT-REVIEW-universe-screen-20261112-1530: 0b(1db8597) **APPROVE**(운영 승인 아님). 0b만으로는 운영 반영 가치가 낮아(목록·GAS 없이 빈 화면 링크) #1~#4 완료 후 묶어서 순태씨 승인 요청 예정.

---

# 400종목 곡소리 — 다비 제출(719692c) 클로 검토 1차 (2026-11-12 14:15 KST)

다비 인계(DAVI-universe-handoff) 요청대로 독립 재작성 대신 다비 SHA를 이 브랜치로 이어받았다. 다비 브랜치는 건드리지 않음.
병합 충돌: tests/lib/live-data-pins.json 1건 — portfolio_v5.html은 main 값(bb9a75f6…), radar/ui.js는 다비 값(6c2b07c2…, 실제 파일 해시와 일치)으로 해소.

## 시험 결과 (클로 환경)
- 전체 `node --require ./tests/lib/no-network.cjs --test tests/*.test.cjs`: **1973 중 1971 통과, 0 실패, 2 skip**. 다비 환경의 network-guard 1실패는 여기서 재현 안 됨(환경 차이로 판단).
- `tools/scan-secrets.cjs`: findings 0.
- Chromium(사전 설치판, 기본 launch): 다비 하니스(합성 GAS JSONP, 외부 요청 차단) **360/390/430 통과**, 가로 넘침 없음, 원장(v5_gen) 불변, 반복 조회 시 추가 요청 0. 하니스의 `executablePath:'/usr/bin/chromium'`만 빼고 실행.

## 발견 사항 (다음 실행에서 이 브랜치에 보완)
1. **운영 화면에서 진입 링크가 안 보임**: radar/ui.js render()는 실제 모드+HASLivePricePanel(운영 기본)일 때 일찍 return 하며, 다비 링크는 데모/합성 화면 nav에만 추가됨. 실제 앱 `#kst-radar/real/list`에서 링크 0개 확인. → 실제 모드 nav에 링크 추가 필요.
2. 화면 문구 "보유·확신 종목 별도 포함"은 현재 사실과 다름(GAS가 extras 거부, 개인 경로 미구현). → "보유·확신 종목은 기존 곡소리 화면에서 확인" 등으로 수정.
3. 상태 줄이 UTC ISO 원문(예: 2026-11-12T05:05:20Z)과 영문 사유 코드(invalid-input)를 그대로 표시 → 한국시간·한국어 사유로.
4. `evidence-universe/` 산출물이 커밋돼 있음 — 규칙상 시험 산출물 커밋 금지. 하니스 출력 경로도 저장소 밖(임시 폴더)으로.
5. 하니스의 Chromium 경로 하드코딩 제거.
6. 로컬 서버로 앱→화면→돌아가기 확인 중 pageerror "Unexpected token '<'" 1건 — 원인 미확인(클로 임시 서버 경로 처리일 가능성). 다음 실행에서 main과 비교 확인.

## 가장 큰 미완료 (운영 차단)
- 공식 400종목 구성목록(코스피200·나스닥100·S&P100·S&P500 시총순) 원본·기준일 확보 — 미검증. 가짜 목록으로 채우지 않음.
- GAS 실제 설치·트리거 — 순태씨 승인 전 하지 않음. 12개월 수익률 null 유지, 매수 검토 후보 없음(재무 연결 전).

## 순태씨 결정 필요
지금 없음.

## 보완 0b (2026-11-12 15:00 KST 실행)
1. 완료 — 실제 모드(운영 기본, HASLivePricePanel) 곡소리/환호성 nav에 '400종목 가격 선별' 링크 추가(radar/ui.js, edits 역방향 쌍 + pins 갱신). Chromium 360/390/430: 링크 1개 표시, 16px, 높이 44px, 가로 넘침 없음, 클릭 대상 페이지 정상 도착. 변경 전 main은 0개.
2. 완료 — 문구 '보유·확신 종목 별도 포함' → '보유·확신 종목은 기존 곡소리 화면에서 확인'.
3. 완료 — 상태 줄 시각을 'YYYY-MM-DD HH:MM (한국시간)'으로, 실패 사유를 한국어로(GAS 주소 없음은 브라우저의 'Invalid URL'도 'GAS 주소가 없거나 형식이 맞지 않음'으로). 미등록 코드는 '자료 확인 필요 (코드)'.
4. 완료 — evidence-universe/ 삭제, 하니스 출력은 임시 폴더(또는 HAS_EVIDENCE_DIR).
5. 완료 — 하니스 executablePath 제거(기본 chromium.launch).
6. 확인 — 'Unexpected token <' pageerror는 정상 404 처리 서버에서 재현 안 됨(이전 임시 서버가 폴더 경로에 HTML을 돌려준 탓으로 판단). 변경 전/후 모두 pageerror 0.
- 새 시험 `tests/universe-screen-entry.test.cjs` 2건(실제 모드 링크 1개·요청 0, 문구·한국어 사유). 하니스에 한국시간 표시 검사 추가.
- 전체 시험 1975 중 1973 통과 / 0 실패 / 2 skip. scan-secrets findings 0. 하니스 360/390/430/1280 통과, 실제 외부 호출 0.

다음: 작업 #1 공식 400종목 구성목록 출처 확인(코스피200·나스닥100·S&P100·S&P500) — 확보 못 하면 미검증으로 남기고 가짜 목록 금지.
