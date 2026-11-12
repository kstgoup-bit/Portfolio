# 곡소리 400/401 — 시험 전용 세션 캐시 설계 (GPT-20261112-1930)

작성: 클로 2026-11-12 20:10 KST · 상태: **시험 게이트 전용 구현(운영 비활성)** · 운영 활성화는 순태씨 별도 승인 필요

## 1. 문제
`has/universe-screen.html`의 가격 선별 요약은 메모리 캐시만 쓴다. 갤럭시에서 곡소리로 갔다가 뒤로가기(bfcache 미복원 = 새 로드)나 새로고침을 하면 메모리가 사라져 같은 날에도 GAS 요약을 다시 받는다(18:00 보고 미해결 항목, headless Chromium에서 back_forward 새 로드 확인).

## 2. 결정
- **sessionStorage 독립 키 1개** `kst.has.screen.public.v1`. localStorage·IndexedDB·백업·투자원장 키(`v5_*`)는 읽기(기존 `v5_gas` 읽기 외)·쓰기 모두 없음.
- **게이트**: `window.HAS_SCREEN_TEST_SESSION_CACHE === true`일 때만 읽기·쓰기. 운영 페이지는 이 값을 설정하지 않으므로 운영 저장 0, 운영 자동 조회 0(기존 `HAS_SCREEN_TEST_AUTO` 게이트 유지).
- 순서: 메모리 캐시 → (게이트 시) 세션 캐시 → GAS 1회 조회(동시 요청은 기존 `inflight`로 1건 합류) → 성공 시 메모리·세션 저장.

## 3. 저장 형식
```
{ schema: "kst.has.screen.public", version: 1,
  day: "YYYY-MM-DD"(저장 시각의 KST 날짜), ep: GAS 주소 FNV-1a 32비트 지문(8자리 16진, 주소 자체 저장 안 함),
  savedAt: epoch ms, value: 공개 core 요약(허용목록 투영) }
```
- **허용목록 투영**: 요약 최상위 14개 키, 행 17개 키, 기간 6개 키, 출처 `group/source{url,asOf,version}/expectedConstituents/complete`만 복사. 알 수 없는 필드는 버린다.
- **공개 core만**: `total === coreCount`이고 모든 행 `scope === 'core'`일 때만 저장. 보유·확신 추가 감시(`extra`)가 하나라도 있으면 저장하지 않고 기존 키도 삭제(화면은 메모리로 정상 표시).
- **크기 상한** 1,000,000자(합성 400 전체 가격 ≈ 377,000자). 초과 시 저장 안 함·삭제.
- 저장 금지 확인: GAS 주소·`v5_gas`·`v5_gen`·암호·토큰·키·투자기록. 시험이 원문에서 0건 확인.

## 4. 읽을 때 무효화(하나라도 걸리면 키 삭제 후 새 조회)
JSON 파싱 실패, 문자열 아님, 크기 초과, schema/version 불일치, `day ≠ 오늘 KST`, 저장 시각의 KST 날짜 ≠ day, `savedAt` 미래(+60초 초과), GAS 지문 불일치, `validateSummary` 실패(만료 2일 초과·매수 후보/매수 의견·개수 불일치·미래 날짜·형식 오류 등), extras 포함. 통과 시 투영본을 다시 `validateSummary`.

## 5. 예외·후퇴
`sessionStorage` 접근 자체 예외(차단 브라우저), `getItem` 예외, `setItem` 예외(QuotaExceededError) → 세션 캐시 없이 기존 메모리 방식으로 동작. 화면 오류 없음, 오류 횟수만 `stats().session.errors`.

## 6. 경로별 동작(게이트 켜짐)
| 경로 | 동작 |
|---|---|
| bfcache 복원(pageshow persisted) | 메모리 캐시(추가 요청 0) |
| 뒤로가기 새 로드·새로고침 | 같은 KST 날짜면 세션 캐시(요청 0, "오늘(한국 기준일) 받은 요약 재사용") |
| 00:00 KST 이후 | 세션 캐시 거부·삭제 → 1회 조회 |
| 같은 날 생성 2일 초과 | 만료 거부 → 1회 조회, 실패 시 판단 보류 |
| 새 탭 | sessionStorage가 탭별이라 공유 없음 → 1회 조회 |
| 탭 닫기 | 브라우저가 자동 파기 |
| GAS 주소 변경 | 지문 불일치 거부 |

휴장일: 가격을 추정하지 않음. 각 행은 기존대로 자료 기준일(`asOf`)을 표시. 화면은 항상 "매수 검토 후보 없음(판단 보류)".

## 7. 검증(합성 전용)
- jsdom `tests/universe-screen-session-cache.test.cjs` 12건: 게이트 꺼짐 저장 0, 400·401 새로고침 재사용, KST 경계, 만료, 위변조 13종(깨진 JSON·숫자·매수 의견·매수 후보·개수·버전·스키마·지문·미래 저장·날짜·크기·extras·XSS), extras 미저장, 투영, 예외 후퇴, 요청 합류, 탭 격리, 주소 변경.
- Chromium `tests/universe-screen-session-browser.cjs` 360/390/430 × 게이트 켬/끔: 실제 sessionStorage로 새로고침·뒤로가기(back_forward) 요청 0(켬)/재조회(끔), 새 탭 1회, 키 1개, 원문에 GAS 주소·원장 없음, 44px·12px·넘침 없음, pageerror 0. 외부 요청 전부 차단.

## 8. 미검증·보류
실제 갤럭시(삼성 인터넷/Chrome) bfcache·탭 복원, 실제 GAS, 코스피200 201 공식 효력 기준일·재배포 권리, 미국 200 원본(11-13). 운영 활성화(게이트 기본 켬)·main 병합·배포는 순태씨 승인 전 금지.
