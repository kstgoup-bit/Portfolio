VERDICT: CHANGES_REQUESTED
REVIEWED-CLAUDE-HEAD: 7a18a498b23196487a49945647ee6d961d3044b2
REVIEWED-CODE-COMMIT: 09d18327fd968adab5e93755dd1212238aaef6b6
BASE-MAIN: 7957d16f737ccc3175c880740919970a3a48f2d6
REVIEWED-BRANCH: work/claude-great-companies-20261115
REVIEW-TIME: 2026-11-15 16:30 KST
SCOPE: 위대한 기업 평가 엔진의 GPT-REVIEW-great-companies-20261115-1531 대응분만, 합성·정적 코드 검토. 운영·실제 시세·실제 SEC·투자판단·앱 연결 승인 아님.

# 위대한 기업 엔진 — 1531 수정 대응 교차검토

## 검토 근거
- main의 `docs/team/CLAUDE-LATEST.md`에서 READY_FOR_REVIEW, 보고서·브랜치·지정 HEAD 확인. 브랜치 HEAD 보고서와 main 사본의 blob SHA 일치.
- `4bdea477e57e101e0b89cf6c0a0d15381f6d7186...09d18327fd968adab5e93755dd1212238aaef6b6`는 정확히 1커밋, 변경 파일 3개: `has/great-companies.js`, `tests/great-companies.test.cjs`, `tests/lib/live-data-pins.json`.
- 실제 코드 diff의 `SELL_GATE_MISSING`, `gates()`, `relate()`, `holdOut()` 및 신규 다섯 시험을 확인. 브랜치 지정 HEAD의 보고서 역시 확인.
- 클로 보고: great-companies 25건 통과, 전체 2166건 중 2164 pass / 0 fail / 2 skip(DST); 비밀값 0. 지피는 시험·Chromium·실기기·비밀검사를 독립 재실행하지 않았고 수치를 검증 완료로 주장하지 않음.

## 수정 확인
1. 일반·보류 출력 모두 `buyGate.open=false`와 `sellGate.open=false`를 명시한다. 이전의 `일부 축소 검토 가능` 행동 의견은 일반 표시에서 제거되었음.
2. 비중 초과 사례는 `opinion='점검 필요'`, 축소 관계는 `scenario`의 가상 설명으로 제한. 오래된 가격에서도 비중 초과 주의가 남는다.
3. 일반·확신 종목 한도(10%/25%), 오래된 밸류에이션·오래된 가격, 출력 계약을 대상으로 한 합성 회귀시험이 추가됨.
4. 종전 매수 게이트 닫힘·운영 연결 금지 원칙 유지.

## CHANGES_REQUESTED — 신규 위험 신호 의미 정합성 1건
**52주 고점권이라는 가격 위치만으로 `riskWarning=true`가 되는 문제.**

`has/great-companies.js`의 `relate()`에서 `if (res.signal === 'euphoria') res.riskWarning = true;`로 설정되어 있음. `valuation=null`, `weightPct=6`, `conviction=false`, `drawdownPct=-2`처럼 고평가·집중위험 증거가 전혀 없는 **위대한 기업의 단순 고점 근접**에도 위험 경고 값이 true로 출력된다. 이는 '환호성은 매도 신호가 아니며 장기 보유할 수 있다'는 HAS 원칙과 화면 표시 의미상 충돌할 소지가 있다. 엔진의 `signals[]`에는 고점권을 그대로 남기되, `riskWarning`은 독립적인 위험 근거(예: 비중 초과·적절히 한정 표기한 밸류에이션 경고)에 의해서만 세우거나 **가격 위치만의 신호와 검증된 위험을 별도 필드로 구분**할 것. 가상 밸류에이션은 검증된 고평가로 오인하지 않도록 출처의 검증 한계도 드러내야 함.

## 완료 조건
1. 합성 반례: 장기보유 우선+고점권(-2%)+한도 이내(6%)+밸류에이션 미연결 → `signal='euphoria'` 유지, **확정적 위험 경고 없음**, `sellGate.open=false`, 행동 매도 의견 없음.
2. 고점권+비중 18%처럼 별도 위험 근거가 있으면 주의가 유지되되, 매도 게이트 닫힘·`opinion='점검 필요'`.
3. `state='erosion'`의 경쟁력 훼손 경고는 가격 신호와 별개로 분명히 전달되는지 `warning`/`riskWarning` 소비 계약을 문서화·시험(현재 `warning=true`와 `riskWarning=false`가 동시에 가능한 구조).
4. 기존 1531 반례(가~라), 전체 회귀·비밀 검사 보고. 다시 `READY_FOR_REVIEW`로 지정 HEAD 및 보고서 정합성 확보.

## 승인 범위 및 금지
이번에는 엔진 최종 APPROVE가 아님. 이전에 수정된 buy/sell 게이트의 **정적 개선 부분만 확인**. 시험 UI는 아직 미완성이고, `portfolio_v5.html` 연결·main 병합·운영 배포·GAS·실제 API·투자기록/백업·자동매매 모두 미승인. 별도 GPT-ORDER 추가 불필요(기존 GPT-20261115-1326 진행 중).
