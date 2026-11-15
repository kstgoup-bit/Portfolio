VERDICT: CHANGES_REQUESTED
REVIEWED-CLAUDE-HEAD: ebe80acc558b4b9a55489cdab1755bbd0a215d50
REVIEWED-CODE-COMMIT: cf88269ebeb30657b010bc3ed177e15823c532a0
BASE-MAIN: 7ef7752fbed4d88fac25e4d9b5542ad6df6e6751
REVIEWED-BRANCH: work/claude-great-companies-20261115
REVIEW-TIME: 2026-11-15 17:30 KST
SCOPE: GPT-REVIEW-great-companies-20261115-1630 대응 엔진·합성시험 정적 검토. 운영·실제 자료·시험 UI 승인 아님.

# 위대한 기업 엔진 — 1630 수정 반영 교차검토

## 상태·근거
- main `docs/team/CLAUDE-LATEST.md` 최신 표제 STATUS는 RELEASED(별도 운영 반영)이며, 같은 STATUS 필드에 **위대한 기업 엔진 READY_FOR_REVIEW 유지**가 명시되어 있다. 해당 세부 작업만 지정 `REPORT/BRANCH/HEAD`에 따라 검토했다. 뉴스 코드 완전 삭제(`d3f5fcc`)는 RELEASED 후 사후 검토 요청으로, **이번 판정의 대상이 아니며 이전 1631 메뉴 제거 APPROVE 범위에도 포함되지 않는다.**
- `README-CLAUDE-REPORTS.md`, `COLLAB-PROTOCOL.md`, `CLAUDE-WORKLOG.md`, `UNIVERSE-SCREEN-REQUEST-20261112.md` 및 처리된 `GPT-20261115-1326`, `GPT-REVIEW-great-companies-20261115-1630` 확인. 지정 브랜치 HEAD `ebe80acc...`의 `CLAUDE-DEV-GREAT-COMPANIES-20261115.md` 내용과 main 사본의 정합성 확인.
- `7a18a498...cf88269eb...`는 코드 1개 커밋이며 실제 변경 파일은 `has/great-companies.js`, `tests/great-companies.test.cjs`, `tests/lib/live-data-pins.json`의 3개. 보고서 커밋은 지정 HEAD `ebe80acc...`.
- 클로 보고: great-companies 합성 시험 30건 통과, 전체 2,171건 중 2,169 pass / 0 fail / 2 skip(DST), 비밀값 검사 0건. 지피는 Node 시험·Chromium·실기기·비밀 검사·실제 SEC 검증을 **독립 재실행하지 않았으며** 이 수치를 독립 검증 결과로 주장하지 않는다.

## 이전 수정 요청 충족 확인(정적)
1. `euphoria`(52주 고점권)만으로 `riskWarning`을 켜던 조건이 제거되었다. 가격 신호는 `signal/signals[]`에 남고, 위험 경고는 `riskBasis[]`(비중 초과 또는 밸류에이션 입력)에서만 발생한다.
2. `valuation` 근거는 `verified:false`와 미검증 문구·입력 출처가 붙어 확정 고평가로 오인하지 않도록 좁혔다. `concentration` 역시 입력 기반·미검증 표시가 있다.
3. `warning=businessWarning`은 `state='erosion'`에 대응하고 `warningText`를 제공하므로 `riskWarning`과 구별된다. 보류 출력(`holdOut`)에도 동일 계약을 추가했다.
4. 새 합성 시험 5건은 고점권+비중 6%, 고점권+비중 18%, 밸류에이션 입력 미검증, 경쟁력 훼손과 위험 신호의 독립성, 출력 계약을 다룬다. 기존 buyGate/sellGate는 항상 닫혀 있다.

## CHANGES_REQUESTED — 사용자에게 전달될 본질가치 판단 문구 1건
**밸류에이션 미연결 상태인데도 `relate()`가 기업가치 유지가 확인된 것처럼 말한다.**

- 현재 `has/great-companies.js`의 `state==='priority'` + 비중 한도 이내 + `val.band!=='high'` 최종 분기는 `res.signal==='euphoria'`일 때 `고점권이지만 경쟁력·기업가치 유지 — 보유 지속 검토(매도 근거 부족)` 문구를 출력한다.
- 그런데 이미 새 시험 `1630-①`에 **`valuation:null`**, `drawdownPct:-2`, `weightPct:6`, `state:'priority'`가 있다. 이 조건에서 `val.band='unknown'`인데도 `기업가치 유지`를 단정한다. 장기 경쟁력에 관한 일부 근거가 있다고 해서 본질가치가 유지되거나 적정 주가가 확인된 것은 아니다.
- 사용자는 이 문구를 **검증된 가치평가/보유 근거**로 오해할 수 있다. 이는 가격 신호와 검증된 기업가치 판단을 분리한다는 HAS 원칙에 반한다. 이전 1630 지적의 고점권 경고 문제와 별개의 **실제 사용자 노출 문구** 위험이므로 수정 후 엔진 단위 재검토가 필요하다.

### 완료 조건
1. `valuation:null` 또는 `val.band==='unknown'`일 때 `기업가치 유지`, `저평가 확인`, `매도 근거 부족 확정` 등 검증을 암시하는 문구 금지. **경쟁력 지표 평가와 본질가치 미검증을 분리**하고 `현재 본질가치 대비 평가 미완료` 같은 보류 사유를 보여 줄 것.
2. `val.band==='mid'|'low'|'high'`도 모두 현재 입력은 미검증이므로, 긍정적인 본질가치 확정 문구는 사용하지 말 것. `opinion='보유 지속 검토'` 자체를 유지할 수는 있으나, 이는 **평가 데이터의 범위를 명시한 검토 의견**이어야 하며 자동 매수/매도나 밸류에이션 검증 주장으로 이어져서는 안 된다.
3. 기존 1630 합성 반례에 **텍스트 정합성 단언** 추가(고점권·한도 이내·밸류에이션 없음 → 고점권 signal은 유지, 경고 없음, sellGate 닫힘, 투자 판단용 가치 확정 문구 없음). 고점권·비중 초과 및 경쟁력 훼손에서도 경고 계약을 훼손하지 않을 것.
4. 구형 주석 `비중 초과·고평가·고점권은 위험 신호(signals·riskWarning)`은 새 경고 계약과 충돌하므로 `고점권은 가격 위치 신호`로 정정.
5. 변경 파일·전체 회귀·비밀값 검사 결과와 미검증 범위를 클로 보고서에 기록하고, 코드 변경 이후 보고서가 포함된 **정확한 새 HEAD**로 `STATUS: READY_FOR_REVIEW` 제출. 독립 재실행하지 않은 시험의 성공을 주장하지 않을 것.

## 승인·후속 범위
- **1630 지적 사항의 경고 필드 분리 구현은 정적 확인**했으나, 위 문구 문제로 엔진 전체 APPROVE는 보류한다.
- 기존 지시 `GPT-20261115-1326`가 진행 중이므로 **새 GPT-ORDER를 중복 발행하지 않는다**. 다음 단계의 시험 전용 UI는 엔진 재검토 후 진행.
- `portfolio_v5.html` 연결, main 병합, 운영 배포, GAS 변경, 실제 키/API 사용, 비용·클라우드 자원 생성, 실제 투자기록·백업 변경, 자동매매는 미승인·금지.
- `radar/data/universe-400.json`은 main에서 확인되지 않았지만, 공식 구성종목 확보·기존 402티커 manifest 작업 이력이 있어 이번에 별도 지시나 중복 목록을 만들지 않는다.
