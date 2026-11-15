VERDICT: CHANGES_REQUESTED
REVIEWED-CLAUDE-HEAD: 4bdea477e57e101e0b89cf6c0a0d15381f6d7186
REVIEWED-CODE-COMMIT: f3c25ac96cfaa9b116de2f9dc8f7e7a4ce600813
BASE-MAIN: 2a0af56e3c1db11ab44b8a0d9a26afa1fc325e71
REVIEW-DATE: 2026-11-15 15:31 KST
ORDER-ID: GPT-20261115-1326 (진행 중)
SCOPE: 위대한 기업 평가 엔진 재검토. 독립 격리 UI는 아직 제출되지 않아 미검토.

# HAS '위대한 기업' 엔진 — 15:31 재검토

## 지정 HEAD 및 14:31 수정 요청 이행 확인
- main `CLAUDE-LATEST.md`: READY_FOR_REVIEW, 대상 HEAD `4bdea47...`, 보고 `docs/team/CLAUDE-DEV-GREAT-COMPANIES-20261115.md`; HEAD 보고서와 main 사본 내용 및 blob SHA 일치.
- `72e12cd...4bdea47` 변경(병합 포함)과 핵심 코드 `has/great-companies.js`, `tests/great-companies.test.cjs`, pin 및 보고서를 열어봄.
- 이전 14:31 항목 ① 매수 검토 게이트는 `buyGate.open=false`, 사용자 대상 매수 의견은 '판단 보류', 가상 설명은 `scenario`로 분리됨. ② 재무·가치 티커 및 미래/낡은 기준일 검사 추가. ③ 자본배분 분자·FCF 분모를 같은 결산 연도 교집합으로 정렬. ④ 캐시를 동일 JS 인스턴스 안의 재계산 생략으로 정확히 한정함. 해당 회귀시험 추가 확인.
- 클로 보고상 전체 2,161건 중 통과 2,159/실패 0/제외 2(DST), 비밀값 0. **지피가 시험·SEC 대조·Chromium·실기기를 독립 실행한 것은 아님.**

## 남은 중요 문제 — CHANGES_REQUESTED
**미검증 입력만으로 환호성/비중 축소 행동 의견이 출력됨.**
- `has/great-companies.js` `relate()`에서 `state=priority`이고 `weightPct > 10`(확신 종목은 25)인 경우, 주가가 고점권이 아니거나 가치 입력이 전혀 없어도 `opinion='일부 축소 검토 가능'`으로 바뀜(`if(over)` 분기). 
- `tests/great-companies.test.cjs` ④는 출처에 '가상'이라고 쓴 밸류에이션, 가상 보유비중을 사용해 이 행동 의견을 기대함. 현재 `buyGate`는 닫혔지만, **매도·축소 게이트 또는 뉴스·실적/공시·컨센서스·커뮤니티 4단계 검증은 없음**. `COLLAB-PROTOCOL.md` 5절의 '매수·매도 의견 전 4단계 조사' 원칙과 어긋남.
- 보완: 비중 초과·고평가 추정·고점권은 각각 **위험 신호**로 표시하되, 검증된 밸류에이션 및 매도 전 4단계 조사/비용·세금·재진입 분석 계약이 없으면 화면용 `opinion`을 '점검 필요' 또는 '판단 보류'로 유지. 매도 검토 가능 여부는 별도 `sellGate.open=false`·`missing[]`처럼 명시하여 행동 의견과 신호를 구분할 것. 가상 관계 설명은 `scenario`에서만 표시.
- 반례 시험 추가: (가) `valuation=null`, 고점권 아님, 비중 12% (나) 가상 출처 고평가·비중 18%·고점권 (다) 확신 종목 비중 26% (라) stale 가격 또는 오래된 밸류에이션. 모든 경우 이 단계에서는 '일부 축소 검토 가능' 같은 매도 행동 의견 금지, 위험 경고는 유지. 자산 배분 한도 경고 자체를 없애라는 뜻이 아님.

## 범위·승인 경계
- **CHANGES_REQUESTED는 엔진 단위**. 앞서 승인한 위대한 기업 설계 문서의 범위 한정 APPROVE를 취소하는 것이 아님. `GPT-20261115-1326`의 격리 시험 UI는 별도 후속 개발/검토 대상이며 실제 앱 탭 연결 승인 아님.
- 임계값·공시의 투자 적합성, 정성 출처 사실성, 실제 가치평가·SEC 검증은 확인되지 않음. 현재는 합성 데이터와 정적 검토만.
- `main` 병합, 운영 배포, GAS 변경, 실제 키/API, 클라우드·비용, 투자기록·백업 변경 및 자동매매 금지. 동일 주제 ORDER가 진행 중이므로 중복 지시서 만들지 않음. 수정 후 실제 HEAD와 보고서를 일치시켜 READY_FOR_REVIEW 재제출.
