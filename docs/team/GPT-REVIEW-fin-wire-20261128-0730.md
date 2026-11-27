VERDICT: CHANGES_REQUESTED
REVIEW-KIND: STATIC_ONLY
REVIEWED-HEAD: 6415e1e751e4c3d5994c069fad0e2d86f8f45798
BASE: ed4e2a0ffa50e76b3f5ba953596577aa32a92504
MAIN-AT-REVIEW: ae7e9989272c5e6d1e6f9529895b932470a3431d
ORDER-ID: 순태씨 2026-11-26 '시작해' — 재무 연결 단계 4
BRANCH: work/claude-fin-wire-20261126
2026-11-28 07:30 KST

## 범위와 근거
CLAUDE-LATEST, README, COLLAB-PROTOCOL, WORKLOG, UNIVERSE 요청서, 11-25/27 일정 공지 확인. 보고서 CLAUDE-DEV-FIN-WIRE-20261126.md와 BASE..HEAD 실제 비교(1커밋, 6파일: 보고서, 일지, fin-panel.js, review-cards.js, fin-panel.test.cjs, live-data-pins.json), 지정 SHA diff 및 기존 fundamental-filter.js/review-fin-gate.js/review-cards.js 계약을 대조했다. 포트폴리오 HTML 변경 없음. price:null, 기존 HELD 라벨 불변, textContent 렌더와 상대 경로 읽기 전용은 방향 적합. 승인 범위는 현재 없음(수정 후 정적 재검토). 실제 SEC 원문·실기기·운영 승인·판단 해제·합의 발행 승인 아님.

## 한 단위 수정 요청 (CR-FIN-1~3, 모두 같은 기능에 한정)
1. **재무 식별자·시점 교차검증 누락.** fin-panel valid()는 외피 rec.ticker와 Date.parse(fetchedAt), F.validNormalized만 확인한다. 후자는 normalized.ticker를 검사하지 않고 공시일 순서/미래 여부도 검사하지 않는다. 따라서 외피 AAA + normalized BBB의 재무를 AAA 카드에 표시할 수 있다(후속 G.evaluate는 불일치 차단하지만 이미 잘못된 재무 라벨 표시). 또한 미래 fetchedAt은 음수 ageDays라 4일 초과 분기를 통과하고, assess는 미래 결산/공시를 선행 차단하지 않는다. 기존 F.display의 ticker 및 end/filed 검사를 공유하고 rec/normalized ticker·CIK 등 확인 가능한 식별자를 대조, 엄격한 시간 형식과 0 <= ageDays, 공시일 <= 수집 시점/현재 시점 및 결산일 <= 공시일을 확인. 일치 불가/미검증이면 자료 없음 또는 검증 불가로 표시; stale은 신뢰 가능한 현재 '양호'로 읽히지 않게 과거 참고·보류를 먼저 표시. 임계값은 미검증 제안 기준임을 명시. IFRS/20-F 등 미지원은 별도 안내하되 허위 결론 금지. 외피와 내부 불일치, 미래 수집/공시, 결산 전 공시, 4일 경계, 자료 부족 합성 시험 추가.
2. **보유종목 팝업의 비동기 갱신 누락.** openHoldings()의 body는 render() 직접 호출 후 mounts에 등록되지 않는다. finHook은 모듈 onload 및 fetch onReady 모두 renderAll만 호출하고 renderAll은 등록된 곡소리 mounts만 갱신한다. 따라서 첫 팝업이 새 모듈/자료를 불러오면 팝업 자체는 갱신되지 않아 비매수 카드는 계속 재무 블록 없음, 매수 카드는 '불러오는 중'으로 남을 수 있다. 열린 팝업의 동일 카드/컨테이너만 안전하게 갱신, 닫은 팝업이나 이전 세대 응답 무시, 스크롤·접힘 상태와 중복 요청 보호. 실제 모듈 지연 로드와 fetch 완료, 팝업 닫기/재열기, 국내/미국 탭 전환을 합성 DOM에서 확인. 기존 판단·합의·차트 안내는 변경하지 말 것.
3. **로드/캐시 실패가 세션 동안 영구화.** finLoad=1 설정 뒤 스크립트 onerror 없음; request는 cache[ticker] 존재 시 loading/error/missing/ok 모두 무기한 반환한다. 네트워크 일시 오류나 새 공시 수집 이후에도 재시도·갱신이 불가. attach 예외는 삼키고 로더 자체 예외는 try 밖이다. 로딩 실패 시 명시적 보류/오류 안내, 대기 시간 상한, 안전한 제한적 수동 재시도 또는 만료 후 갱신 설계(정적 같은 사이트 JSON만, KIS/GAS 호출 추가 금지), 동시 요청 병합 및 오래된 응답 배제. 두 모듈 의존성 확인 후 준비 완료 처리; 하나만 실패해도 기존 카드 표시 보호. 테스트는 성공·실패·지연·중복 방지와 실제 loader onload/onerror 경로를 포함할 것. 사용자 승인 필요 정책이 있다면 해당 결정은 별도 표시.

## 시험 근거 및 완료 조건
클로 보고: 2506 중 pass 2501, fail 3, skip 2, 비밀값 검사 0; 실패 683/1175/1754는 main 동일 주장. 독립 재실행 없음. 신규 시험 9건의 소스는 정적 검토(실행 결과 재현 아님). 모듈 미로드 시험은 태그 삽입까지만 보며 실제 로드 완료/실패와 팝업 갱신은 미검증. 다음 결과에 전체 시험과 동일 환경 BASE/HEAD 실패 비교(실패명·원인·로그), 360/390/430 및 PC 브라우저 합성 검증과 실제 기기 미실시 여부, 보호 시험 역방향 쌍/핀 적용 범위 근거 명시. 보고서에 실제 BASE·HEAD 전체 SHA 명시. 기존 3실패 및 2skip은 통과로 간주하지 않음. 운영 반영 전 별도 순태씨 승인 필요.

## 큐 및 신규 승인 과제
최신 일정은 11-27 공지 우선. 주말 아침 종목 검토 없음. 현재 우선순위 fin-wire 수정/재검토 → price-verify(67bf711...) → risk-guard(eb46aec...) → bench-reason(54e10f9...)의 실제 미검토 범위. 최신 LATEST 상단 valuation-v1 및 SEC 수집 사후 검토 요청도 큐 보존. 위 SHA의 코드 검토는 이번 회차에 하지 않았음. 402종목 manifest 기존 저장(coreCount 402, declared-snapshot-not-independently-verified), 자동매매 장기 설계 GPT-20261120-2132 및 2330 문서 승인 일지 확인: 중복 지시 없음. 신규 시장·산업 사이클/주가 패턴 설계는 사용자 승인됨. 선행 재무/시세 미처리 검토와 CR을 우선하므로 이번 회차에는 별도 신규 ORDER를 만들지 않음. 여력 있는 첫 회차에 기존 모듈/데이터 가용성·시간축·합성 평가 설계 1단위부터 착수. NVDA wait 유지, 엄격 계약 승인 전 합의 발행 비활성. 실제 주문/키/API, GAS, 비용, main, 배포, 실제 기록/백업 변경 금지. 이번 작업은 문서만.
