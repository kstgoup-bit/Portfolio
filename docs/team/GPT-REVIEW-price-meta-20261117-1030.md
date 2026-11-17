VERDICT: CHANGES_REQUESTED
REVIEWED_CLAUDE_SHA: af286d2d2763294a171689907e011203ec061902
ORDER-ID: GPT-20261117-0731
MAIN_SHA_AT_REVIEW: d8f07604606c7d65e3b881a00e0afdcdc028164c
REVIEW_SCOPE: 1단계 가격 메타 계약 설계·미로드 모듈·합성시험 정적 검토만. 운영·GAS 승인 아님.

# HAS 가격 신뢰도 메타 계약 v1 — 지피 2026-11-17 10:30 검토

## 검토한 실제 증거
- main docs/team/CLAUDE-LATEST.md의 STATUS=READY_FOR_REVIEW, REPORT=docs/team/CLAUDE-DEV-PRICE-META-20261117.md, BRANCH=work/claude-price-meta-20261117, HEAD=af286d2d2763294a171689907e011203ec061902 확인.
- main README-CLAUDE-REPORTS, COLLAB-PROTOCOL, CLAUDE-WORKLOG, UNIVERSE-SCREEN-REQUEST-20261112 및 처리된 GPT-20261117-0731 확인. 400종목 universe 목록은 별도 진행: 중복 지시 없음. GPT-20261117-0940 충돌 dry-run 복구 지시 대기 유지.
- 기준 ced106c... → 지정 HEAD 비교 결과 1커밋, 변경 3파일: has/quote-meta-contract.js(신규 146행), tests/price-meta-contract.test.cjs(신규 118행), tests/lib/live-data-pins.json(핀 보강). 지정 HEAD의 실제 파일과 브랜치 완료보고 내용을 정적 대조.
- 긍정: GAS 평면 가격 응답 하위 호환, U/A/C 기본 보류, 수신시각과 공급자 asOf 구분, 시장·통화·조정 기준 검사, 공급자 자가 검증 문자열 무시, 기존 price-trust/quote-model 자가 선언 우회 반례 3건 기록, 운영 앱 미로드.
- 클로 보고: 개별 합성 29건 통과; 전체 2278 중 2276 통과/0 실패/2 skip, 비밀값 0. **지피가 이 시험을 독립 실행·재현한 것은 아님.** Playwright와 실제 GAS, 갤럭시 실기기 시험 미실행.

## 변경 요청 (운영 미반영 설계/합성 범위에서 보완)
**CR-1 — B 증거 없는 보류 해제 차단 (필수).**
has/quote-meta-contract.js의 signalPolicy(priceState,gates)는 단순 문자열 'B'와 네 개 true가 들어오면 hold:false. 교차 대조 함수가 낸 증거가 전혀 없이 호출자가 'B'를 자가 선언할 수 있으므로 설계상의 fail-closed 보장을 위반한다. **문자열 B 자체를 신뢰하지 말고**, 앱 내부에서 생성·검증한 대조 결과(양쪽 시세·검증 규칙·출처 증거 포함)를 직접 확인하도록 계약을 바꾸거나, 실제 B 증거를 전달할 수 없는 동안에는 무조건 hold:true로 제한. 'B' 문자열만 넣고 모든 관문=true인 합성 반례에서 반드시 보류를 증명.

**CR-2 — 공급자 이름 두 개 ≠ 독립 공급자 두 개 (필수).**
crossCheck는 qa.meta.source.toLowerCase() !== qb.meta.source.toLowerCase() 만으로 공급자 독립성을 판정한다. 동일한 GAS 데이터가 서로 다른 임의 이름을 달고 두 번 제공되어도 B로 승격할 수 있다. 공급자 식별 문자열은 단지 표시 메타이며, **서로 독립한 승인된 실제 전송·수집 경로 및 원천 계보**를 앱 내부 신뢰 설정과 연결해서만 B 허용. 연결·계보 정보가 없으면 C/보류. 서로 다른 이름이지만 동일 기초 공급자를 재포장한 반례 시험 추가. 사용자의 실제 GAS 또는 두 번째 API에 접속하지 말 것.

**CR-3 — '정규장 종가' 시간·거래일 검증 불충분 (필수).**
checkQuote는 kind='regular-close' 와 거래소 달력상 같은 날짜만 확인하고, 실제 장 마감 이전 시각인지·공휴일/조기폐장인지 확인하지 않는다. 따라서 11:00 ET를 16:00 종가로 위장한 메타도 A→B로 진입 가능. 공식 장 마감/휴장 캘린더를 검증 못한 현재 단계에는 종가 확정 근거가 없는 입력의 B 승격을 차단하고, 평일 장중을 regular-close로 입력한 반례를 시험에 추가. 시장 시간대 DST 처리도 포함. 단순 수신시각을 종가 확정 근거로 대체 금지.

**CR-4 — 대조 허용오차 무제한 조정 방지 (필수).**
crossCheck(opts.tolerance)는 유한·비음수·상한 검사 없이 값을 받는다. Infinity나 1 등의 입력이 들어오면 서로 다른 가격도 B가 될 수 있다. 비정상 허용오차를 거부/보류하고 보수적인 고정 정책값만 사용. Infinity·NaN·음수·1 등의 반례, 경계값 0.5% 시험 추가. 0.5%는 공식 검증된 수준이 아닌 설계 제안임을 계속 명시.

## 완료 판정 기준
- CR-1~4를 해결한 새 지정 HEAD와 READY_FOR_REVIEW 보고서(각 CR 재현 시험·파일 변경 목록·전체 시험 통계·미검증 표시 포함).
- 안전 상태 U/A/C는 계속 판단 보류, 검증이 부족한 B 후보도 판단 보류. '검토 후보'는 투자 매수·매도 권유 아님.
- 수정은 클로 작업 브랜치 한정, 원래 운영 앱·GAS·키·API·실투자기록·백업·클라우드 변경 없음.
- main 병합 및 운영 배포는 이번 검토 범위 밖이며 사전 사용자 승인 필요. 새 GPT-ORDER 중복 발행 불필요(기존 ORDER-ID 보완).
