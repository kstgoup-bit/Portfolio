STATUS: READY_FOR_REVIEW
ORDER-ID: 순태씨 2026-11-12 직접 요청("2번째 화면(잠금화면)에서 한참 정지, 로그인 후에도 반응이 조금씩 느려")
BASE: 24e124d (main)   HEAD: 495fdb92d0035cb3ff5b9733cc19327be3be6a82
REVIEW-SCOPE: portfolio_v5.html `hasStartApp` 첫머리 2줄(그리기 함수 3개 감싸기: 잠금 중 그리기 미룸 + 검증 재사용 구간), has/snapshot-policy.js(`withValidationCache`·`passMemo` 추가, validateRecord 구간 캐시), has/return-assessment.js(assess의 이력 크기 검사 1줄을 구간 1회로), tests/lib/live-data-edits.json·pins(역방향 쌍 5개·해시), 새 tests/render-pass-cache.test.cjs(5건)·tests/render-equivalence-browser.cjs·tests/startup-profile-browser.cjs. 계산식·판정 규칙·저장 변경 없음.

# 잠금화면 멈춤·로그인 후 느림 (2026-11-12 21:30 KST)

## 원인 (Chromium 프로파일, 합성 41종목·170일, CPU 6배, 390×844 DPR3)
1. 잠금화면이 떠 있는데도 시작 시 가려진 전체 앱을 그림(renderAll) — 한 번에 3.0~3.6초 멈춤. 시세·지수 응답 때마다 다시 그려 또 멈춤. 잠금 해제 때 checkPw가 어차피 다시 그림(중복).
2. 그리기 한 번에 수익률 판정 15회(표 10줄+그래프 5개)가 매번 자산기록 170일×5계정 전체를 처음부터 다시 검증(validateRecord 1,530회).

## 변경
- 잠금화면이 보이는 동안 renderAll·수익률 표·그래프 그리기는 건너뜀 → 잠금 해제 시 checkPw의 renderAll이 한 번에 그림. 자동 기록(autoSnapshot)·저장·시세 갱신은 그대로 진행(화면 그리기만 미룸).
- 그리기 한 번(동기 구간) 동안만 같은 기록 객체 검증 결과 재사용, 구간 끝나면 즉시 폐기. 결과는 캐시 유무와 동일(시험).

## 측정 (각 3회, 위 조건, 실제 폰 아님)
| | 이전(main) | 이번 |
|---|---|---|
| 잠금화면 준비 | 4.4~5.7초 | 1.4~1.7초 |
| 잠금화면 중 최대 멈춤 | 3.0~4.0초 | 0.16초 이하 |
| 확인 → 화면 | 2.5~3.5초 | 1.7~2.4초 |
| 전체 긴 작업 합계(약 20초) | 8.2~10.2초 | 1.8~2.7초 |

## 시험
- 새 render-pass-cache 5건(캐시 안팎 결과 동일·손상 기록·중첩·예외·assess 동일·앱 연결).
- 화면 동일성(Chromium 360/390/430, 시각 고정): 잠금 해제 후 보이는 화면+숨은 패널 글자 35,804자 이전과 완전히 같음, pageerror 0.
- 로그인 브라우저 시험 360/390/430 통과. 전체 1977 중 1975 통과/0 실패/2 skip, 비밀값 0.

## 미검증·남은 것
실제 갤럭시 체감. 메뉴 전환 때 표 계산(switchTab 경로)은 이번 재사용 구간 밖. 실제 자료 크기에 따라 수치 다름.
