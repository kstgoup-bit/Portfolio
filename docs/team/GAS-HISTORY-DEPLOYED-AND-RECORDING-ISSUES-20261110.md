# GAS history 배포 결과 + 자산기록/기준지수 기록 문제 진단 (클로 → 다비)

작성: 클로 / 2026-11-10 / 대상: 다비(메인 개발)

## 1. 순태씨 GAS 배포 결과 (실제 호출, 주소·키 미공개)
- 기존 Code.gs에 `type==="history"` 분기(3줄) + `gas/has-history-request.gs` 78줄 추가, 같은 URL로 새 버전 배포.
- 실호출 결과(순태씨 브라우저, JSONP):
  - `type=history&tickers=QQQ&market=US` → source yahoo-chart-v8, USD, NasdaqGM, America/New_York, barCount 251, regularMarketTime 2026-11-09T21:00Z, price 679.35, 52wHigh 762.86, adjustment "unverified"
  - `type=history&tickers=069500&market=KR` → 069500.KS, KRW, KSE, Asia/Seoul, barCount 245, price 81835, 52wHigh 152455(검증 필요: 현재가 대비 -46%, bars 최대값과 대조할 것)
  - 기존 `?tickers=QQQ&market=US` → {"QQQ":679.35} (불변), `?type=exchange` → {"usdKrw":1344} (불변)
- 기존 응답 형태 불변 확인. 응답은 비공식 Yahoo 기반 '미검증'.

## 2. 현재 앱(운영) 자산기록·기준지수 문제 (순태씨 폰 화면 + main 코드 대조)
1. KODEX200(KS200) 지수 22일째 정체(10/19). fetchBenchmarkHistory가 069500.KS를 무료 프록시 5곳+직접호출 1바퀴로만 시도 → 계속 실패, "기존 데이터 유지". 전체탭 기준지수(KS200 20%+QQQ 80%)·알파가 낡은 값으로 계산됨.
   - 해법: GAS `type=history`를 1순위 경로로 사용(프록시는 보조). bars는 {d:'YYYY-MM-DD', c} → 기존 {ts, close} 변환 필요(ts는 해당 거래일 장 마감 근처로, 기존 ts 규칙과 일치시킬 것).
2. 거짓 "데이터가 오래됐습니다" 경고: getBenchDataLatestLabel이 `ageDays>3`(달력일) 기준 → 월요일 새벽엔 금요일 최신 데이터도 stale. 거래일 기준(주말·휴장 감안)으로 변경 필요. (fetchBenchmarkHistory의 isStale 4일 기준도 점검)
3. 전체 자산 기록 누락(10/27, 11/10만 존재, 해외 탭은 11/3부터 매일): autoSnapshot의 'all'은 국내·연금·일반·해외 모든 보유 종목이 이번 세션에서 freshPrice일 때만 기록. 한 종목이라도 GAS가 null이면 전체 기록이 통째로 누락. 원인 종목을 화면에 남기지 않음(console.log만).
   - 요청: (a) 시세 미갱신 종목을 화면에 표시, (b) 일부 누락 시 정책 결정(예: 누락 종목은 직전 확정 시세 사용+표식 / 또는 계좌별 기록은 유지하고 전체는 '부분' 표식), 과거 점을 부풀리지 않는 기존 원칙 유지.
   - 추가 확인 대기: 순태씨가 일반/ISA/연금 탭 그래프의 최근 2주 점 유무 회신 예정.

## 3. 승인 상태(변경 없음)
A–E(운영 반영 포함) 미승인. main 병합·운영 배포 없음. 이번 GAS 변경은 순태씨 본인이 직접 수행(앱 코드 변경 없음).
