# HAS 명칭 적용: 호환성·롤백 (17단계 작업 A)

## 바꾼 것 (사용자에게 보이는 이름만, 7곳)
| 위치 | 이전 | 이후 |
|---|---|---|
| `portfolio_v5.html` 탭 제목 `<title>` | 순태씨의 5년 안에 10억! | HAS · Hidden Alpha System |
| 잠금화면 제목 | 동일 | HAS · Hidden Alpha System |
| 머리글 | 동일 💰 | HAS · Hidden Alpha System 💰 |
| 홈 화면 이름 메타(apple-mobile-web-app-title) | 10억 포폴 | HAS |
| `manifest.json` name | 순태씨의 5년 안에 10억 | HAS (Hidden Alpha System) |
| `manifest.json` short_name | 10억 포폴 | HAS |
| `manifest.json` description | 클로 & 재미가 함께하는… | HAS(Hidden Alpha System) — 개인 투자 연구·판단·기록 앱 |

"5년 안에 10억" 목표 문구가 들어간 본문 해설(3708행)은 이름이 아니라 투자 설명이라 그대로 두었다.

## 일부러 바꾸지 않은 것 (이유)
| 항목 | 이유 |
|---|---|
| localStorage 키 `v5_*`, `kst.portfolio.restoreJournal` | 이름을 바꾸면 기존 기록이 "사라진 것처럼" 보임 |
| 백업 형식 식별자 `kst-portfolio-backup`, schemaVersion 6 | 바꾸면 과거 백업 복원 불가 |
| 서비스워커 캐시명 `portfolio-v5-날짜` | 바꾸면 옛 캐시가 남아 중복·낡은 화면 위험 |
| 매니페스트 `start_url`, 아이콘, `id`/`scope` 미추가 | 설치 앱의 정체성이 바뀌어 중복 설치될 수 있음 |
| 저장소명 `Portfolio`, 파일명, 실험실 전역 이름(KST*) | 호환성 이득 없이 위험만 큼 |
| 로고·아이콘 | 지시서상 대규모 재디자인은 별도 승인 |

## 자동 시험으로 확인한 것
- 되돌림 증명: 새 이름 → 옛 이름으로 7곳을 역치환하면 16단계 파일과 SHA256 일치(다른 바이트 0).
- 같은 시작 데이터에서 16단계 앱과 HAS 앱의 저장소 결과가 동일(360/390/430px).
- 옛 이름으로 설치·캐시된 상태에서 새 버전 수신: 데이터 유지, 캐시 이름 1개, 제목·매니페스트가 HAS로 갱신.
- 오프라인 재열기 시 HAS 화면·데이터 유지.

## 확인하지 못한 것 (실기기 필요 — 실기기 시험 0건)
- 안드로이드가 **이미 설치된 홈 화면 아이콘 이름**을 언제 HAS로 바꾸는지(브라우저/기기마다 다르며 즉시가 아닐 수 있음). 이름이 안 바뀌어도 데이터에는 영향 없음.
- 삼성 인터넷/크롬에서 중복 설치 여부(id 미추가로 정체성 유지했으나 실기기 확인 전).
- 확인 방법은 `docs/galaxy-checklist-stage17.md` 참조.

## 롤백
`git revert <17단계 이름 변경 커밋>` 또는 `tests/lib/has-rename.cjs`의 역치환 목록으로 7곳만 원복. 저장 데이터는 건드리지 않았으므로 데이터 복구 절차 불필요.
