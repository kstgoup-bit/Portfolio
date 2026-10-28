# 전체 포트폴리오 백업 v6

`format: kst-portfolio-backup`, `schemaVersion: 6`, `exportedAt`, `scope`, `storage`를 사용한다. `storage`의 값은 기존 localStorage 원문 문자열이다. 새 형식은 일반/ISA/해외/연금 네 계좌 키를 모두 요구한다. 파일 최대 20MiB, 계좌당 종목 10,000개 한도, 중복 종목 ID·비유한 숫자·필수 필드 손상·실행 가능한 HTML·금지 속성은 거절한다. 같은 티커라도 다른 ID의 기존 별도 항목은 자동 병합/삭제하지 않는다.

실제 저장 코드를 조사해 확인한 범위:

| 범위 | 저장 키/자료 |
|---|---|
| 보유 종목 4계좌 | `v5_gen/dom/ov/pen`; `{id,name,ticker,quantity,avgPrice,currentPrice}` 배열. id는 음이 아닌 안전 정수 |
| 자산·입금 기록 | `v5_snap`의 all/dom/ov/pen/gen `{ts,val,cost?}` 배열, `v5_deposits`의 계좌별 `{ts,amount}` 배열 |
| 배당 | `v5_div`; `{name?,date,amount,broker?,cat?,usd?}` 배열 |
| 가계부·투자 납입 | `v5_ledger`; 연월→income/expense/invest→`{name,amount,date,broker,cat}` 배열. 별도 증권사 체결 원장 키는 발견되지 않음 |
| 투자 노트·메모·분류 | `v5_investPrinciples`, `v5_memos`, `v5_userThemeMap` |
| 자산·부채·CMA | `v5_debtBank`, `v5_debtHouse`, `v5_nonFinAssets`, `v5_cma_amount` |
| 환율·비중·표시 설정/캐시 | `v5_fx`, `v5_fg`, `v5_fxHistory`, `v5_balGoals`, `v5_benchHist`, `v5_riskData`, `v5_rkCache`, `v5_lastAutoSnap`, 배당 필터 4개 |
| 평단 계산기 | `calc_[qp][1-3]_(dom/ov/pen/gen)_숫자ID` |
| 제외 | 기존 Gemini/Alpha Vantage 키·잠금 비밀번호·GAS URL, 세션 인증, 알 수 없는 미래 저장 키, 모든 `kst.radar.*` |

보유·자산/입금·배당·비중·환율 및 앱이 기본값으로 보여주는 자산/부채는 내보내기 시 메모리의 유효 상태를 캡처한다. 그 밖의 지원 설정/기록은 실제 저장된 키를 포함한다. 원본 저장값이 손상되어 앱이 메모리 대체값을 보여주는 경우에는 잘못된 대체 백업을 만들지 않고 실패 처리한다. 기존 API 키를 백업/로그/서버에 보내지 않는다. API 키 평문 저장 자체는 변경하지 않았다.

## 교체·누락·구버전 정책

미리보기는 읽기 전용이다. 적용 시 포함된 키의 배열/기록을 교체하고 병합하지 않는다. 명시적인 `[]`는 빈 계좌/기록으로 복원한다. 파일에 없는 설정 키는 그대로 둔다. 구버전 `version:v5`의 genStocks가 없으면 **현재 일반계좌를 유지**한다. `version:v4`의 시장별 stocks·pension·normal 자산기록을 변환한다. 구버전 자산/입금 객체의 빠진 하위 계좌 기록은 현재 값을 유지하고 제공된 배열만 교체한다. 구버전 GAS URL은 자동 복원하지 않고 알린다. 구버전임을 식별할 version이 없거나 미래 버전이면 거절한다.

전체 백업은 `kst.radar.state/preRestore`를 포함하지 않는다. 레이더 설정은 레이더의 데이터 상태 화면에서 별도 백업/복원한다. 전체 복원 중 레이더 키·API 키·잠금·GAS URL·타 앱 키는 건드리지 않는다.

## 실패·되돌리기

적용 전 변경 대상 키의 원문/부재(null)를 `kst.portfolio.restoreJournal`에 prepared 상태로 먼저 저장한다. 사본 저장이 실패하면 실제 계좌 키를 쓰지 않는다. 다중 키 쓰기 중 실패하면 새 값을 비워 공간을 확보한 뒤 원본을 복구한다. 중단된 prepared 상태는 다음 페이지 시작 때 복구를 시도한다. 성공 후 journal은 applied로 남아 최근 복원 전으로 되돌릴 수 있다. 되돌리기는 대상 항목의 복원 후 편집도 취소하므로 UI에서 확인한다.

다중 localStorage 키는 데이터베이스 트랜잭션처럼 원자적이지 않다. 영구적인 저장 장치 오류로 rollback마저 실패하면 성공/보존 완료로 표시하지 않고 사본을 유지하며 앱 사용 중단과 사본 내보내기를 안내한다. 사본 파일은 기술 복구용으로 일반 백업 입력에 넣을 수 없다. 여러 번 복원하면 가장 최근 복원 직전 사본만 유지한다. 여러 탭에서 동시에 편집하는 경우는 지원하지 않으며 복원 중 다른 탭에서 앱을 편집하지 않아야 한다. IndexedDB 트랜잭션 기반 전체 저장 개선은 별도 범위다.

백업 버튼/복원 파일 선택/미리보기 적용·취소/되돌리기는 사용자가 직접 실행한다. 실제 기기 자료를 자동으로 읽거나 바꾸는 작업은 이번 개발에서 하지 않았다. 시험 데이터는 모두 합성 자료다.
