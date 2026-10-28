# KST 곡소리 레이더 5단계 개발 보고서

작성일: 2026-10-29 (한국). 판정: **조건부 로컬 완료 — 운영 가능 선언 아님**. 기준 stage4 `02159b25eb315b81c334804879f2cff8888ace01`. 개발 브랜치 `work/kst-value-radar-stage5-20261029`. 최종 SHA는 ZIP의 delivery.json에 기록한다.

## 결과와 보호 범위

| 항목 | 결과 |
|---|---|
| GitHub 개발 브랜치/업로드/PR | 설치 앱 branch 생성 API 1회 403, 원격 생성·업로드·PR 모두 미완료 |
| 앱 Contents/PR 쓰기 권한 | 연결 도구에 세부 grant 없음, 직접 확정 불가. 사용자 push/admin과 구별 |
| main | 착수 원격 SHA fd2599398d2f2ef1816ca9b64ea134ea8811309d, 수정·병합 없음 |
| 운영 배포/Pages/SW/유료 자원/자동매매 | 모두 수행하지 않음 |
| 실제 공급자/인증/이용권 | 미선정/미확보/미승인 |
| 실제 시세 API 요청 | **0건** |
| 실제 가격 검증 종목 | **0종목**, 고정 파일럿 MSFT/GOOGL/AVGO/VRT/JPM 전부 차단 |
| 실제 활성 감시 | **0종목**; 보류 16 / 제외 0 |
| 매도 레이더 | 순수 함수·5개 합성 사례·별도 연구 UI 구현. 실제 보유/실제 신호 연결 없음 |
| 200종목 | 선행 실제 5종목 검증 후 진행, 새 활성화/실수집 없음 |

4단계 ZIP CRC 및 49개 tracked source의 바이트 일치를 확인했다. 제공된 portfolio_v5.html 원본으로 최신 코드를 덮어쓰지 않았다. 실제 기기 저장소·키·투자 기록을 읽거나 변경하지 않았다. 테스트는 독립 origin의 가상 4계좌로만 실행했다. 신규 저장 키 없음. 운영 HTML portfolio_v5.html, 구형 portfolio.html, manifest, service-worker.js, backup/core.js 및 backup/ui.js, 매수 radar/core.js와 universe/demo/eligibility/pilot-status는 stage4와 바이트 동일하다. 연구 링크만 radar/ui.js에 추가했다.

## 변경 파일과 구현 구분

- `sell/core.js`: 합성 전용 수익률 알림/고평가/논리 훼손/집중/교체 검토. 설명·결측·반대근거·계산식과 5가지 결과 상태. 입력 불변, 주문 없음.
- `sell/fixtures.js`: 완전히 가상의 고정 연구일 5사례. `sell/index.html`, `style.css`, `ui.js`: 목록/상세/뒤로/오류 안내. CSP connect-src none, 텍스트 DOM 렌더링, 보유 저장소에 접근 없음.
- `radar/ui.js`: 연구 페이지 연결 링크. 기존 매수 신호·100점 배점 변경 없음.
- `radar/vendor-massive.js`: 공식 raw JSON 모양의 합성 전용 파서. 신호용 데이터가 아님. 통화/정규장/조회시각 등 미확인을 유지하며 실제 진입 차단.
- `tests/sell.test.cjs`, `tests/vendor-massive.test.cjs`, `tests/mobile.cjs`: 신규 계약·회귀·모바일 시험. 테스트 서버만 한국어 폰트를 제공하며 제품 CSP를 약화하지 않음.
- `docs/sell-radar-spec.md`: 신호·데이터·평가불가·계좌별 정책·합성 사례. 계좌마다 개별 한도를 저장하는 설정/실제 보유 연결/세금 자동 계산은 설계만 있고 미구현.
- `docs/provider-comparison-stage5.md`, `github-stage5.md`, `security-stage5.md`, `stage5-instructions.md`, 이 보고서: 권리/연결 장애·납품 안내.

고평가 연구 판정식과 60% 합성 한도는 투자 기본값이 아니다. 수익률 +20/+30/+50/+100/+200% 알림은 자동매도 트리거가 아니다. 실제 투자 논리 훼손을 발견했다고 주장하지 않는다. 세금/비용/기대수익액은 합성 가정이며 실세법·예측 수익이 아니다. 계좌별 연금 코어/해외 새틀라이트 제안은 승인 전 기존 매매 행동에 적용하지 않는다.

## 자동시험

기준 변경 전: 기존 단위 **132/132**, 모바일 **21/21묶음** 통과. 변경 후: 단위 **182/182 (실패0·skip0)**, 모바일 **25/25묶음 (실패0)** 통과. 기존132와 추가50다. 실제 데이터/공급자/실거래 시험이 아니며 실제 Android 기기 시험은 미실시다.

명령(저장소 root):

```sh
npm ci
npm test
npx playwright install chromium
npm run test:mobile
node tools/review-universe.cjs
```

이번 관리형 환경은 Playwright 1.62.1과 별도 Chromium138 실행 파일을 사용했다. 브라우저 실행환경 차이는 재현 시 기록한다. 실행 명령:

```sh
BROWSER_EXECUTABLE_PATH=/workspace/scratch/a983c2ddd102/test-tools/chromium KST_TEST_FONTS_DIR=/workspace/scratch/a983c2ddd102/test-tools/node_modules/@fontsource/noto-sans-kr node tests/mobile.cjs
```

모바일360/390/430px에서 기존21묶음(4계좌 CRUD·계산, 백업v6 다운로드·미리보기·취소·적용·되돌리기·레거시·quota·중단복구, 레이더 이력/필터/오류/키 비노출·XSS·오프라인 캐시)과 신규4묶음(매도 연구 목록·상세·뒤로·새로고침·오프라인 탐색·오류복귀·보존, 모듈실패복귀/XSS/CSP)을 실행한다. 신규 페이지는 오프라인 최초 방문/새로고침을 지원한다고 주장하지 않는다. 이미 로드한 자료로 오프라인 목록/상세 탐색을 검증한다. 새 SW는 등록하지 않는다.

최초 추가 모바일 실행은 CSP가 테스트용 addStyleTag 폰트 주입을 차단하여 실패했다. 제품 CSP는 그대로 두고 **시험 서버가 same-origin CSS에 폰트를 제공**하도록 도구를 수정했다. 초기 실패 로그를 포함한다. 합성 핵심 시험은 오래된 시세·결측·분할·급등/급락·집중·상충/불확실 근거·고평가와 구조악화 분리·세금/비용/대안질·실제/합성 혼입 차단을 검증한다. 상세 화면에서 집중도/한도·교체 계산식과 순 기대차익·근거별 출처/기준일/확인일도 표시한다. 과거 단계의 보안 점검을 완전한 침투시험으로 확대 해석하지 않는다.

## 남은 과제와 사용자 승인 필요사항

1. 사용자가 공식 설치 설정에서 선택 저장소/Contents/Pull requests 권한을 확인해야 한다. 이번 연결 도구는 세부 grant를 제공하지 않으며 403 원인을 특정 grant 누락으로 확정하지 못한다. 권한 확대·PAT·우회는 수행하지 않는다.
2. 공급자·실제 계정·본인 사용 분류, 표시/보관/가공/ETF 비교 권리와 안전한 인증 주입을 별도 승인/확보해야 한다. 이번 ZIP에 키나 설정이 없다. 기존 앱 저장 키에서 추출하지 않는다.
3. 승인 후 실제5종목의 정규장 종가·수정52주고가·분할·지연·캘린더·누락·독립 자료 교차검증 필요. 현재 모두 null/미확인이다. Massive 파서는 합성 계약일 뿐 실데이터 연결 완료가 아니다. Alpha Vantage/Twelve raw 파서는 미구현.
4. 실제5종목 검증 뒤 200종목의 근거·업종·재무·무형경쟁력·라이선스·처리량 검토 필요. 합성 부하를 실수집 성능으로 보고하지 않는다.
5. 매도 정책 승인·계좌별 개별 한도·실제 로컬 보유 연결·세금 모델·신뢰 가능한 재무 근거·실기기 시험은 후속 범위다. 자동 주문은 개발 범위가 아니다.

전체 source·stage4 기준 source·main 기준 HTML·전체/증분 patch·format-patch·시험 로그·합성 캡처·적용 안내·delivery.json을 ZIP에 포함한다. 운영 배포 없이 본인 개발 환경에서 검토할 수 있다.
