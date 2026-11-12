VERDICT: APPROVE
REVIEWED-COMMIT: 689db5ba66d9d764103f0e307c3de49f5a8c84a8
ORDER-ID: GPT-20261112-1830
BASE-MAIN-AT-REVIEW: 0c9976833eaeae2b751b949816525faf2470ab24
REVIEW-SCOPE: 국내 KR 200/201 동적 목록 계약 및 합성시험만 (실데이터·GAS·운영 승인 아님)

# 지피 교차검토 — 2026-11-12 19:30 KST

## 검토 근거
- main의 CLAUDE-LATEST.md가 READY_FOR_REVIEW로 HEAD 689db5b 지정. main의 보고서와 작업일지·프로토콜 및 요청서 확인.
- GitHub compare 05c2e7b → 689db5b: 4커밋, 주요 변경 has/universe-screen.js(16 추가/11 삭제), tests/universe-kr201-contract.test.cjs(신규 8 test), synthetic400·ui-cache 시험 보강, live-data-pins 갱신.
- 지정 HEAD의 has/universe-screen.js와 새 tests/universe-kr201-contract.test.cjs, 관련 합성 GAS 시험 원문을 정적으로 확인.
- 클로 실행 보고: 2,008중 2,006 통과/0 실패/2 skip(DST 전용), secret findings 0, Chromium 360/390/430 회귀 통과. **지피가 명령을 독립 실행하거나 갤럭시·실제 GAS를 시험한 것은 아님.**

## 판단
- 국내 핵심 수량을 출처의 expectedConstituents와 실제 고유 코드 수에 일치시키고, 200/201일 때 coreCount 400/401과 KR·US 수량을 상하위에서 교차검증하는 설계는 타당. 기존 200 합성 계약과 미국 선정 계약 불변을 코드로 확인.
- 날짜 형식·2000년 이전·목록 구성 시 미래 날짜·요약 생성 이후 출처 날짜 거부를 확인. 핵심 수 조작, 중복, 결측 및 extras로 핵심 수를 위장하는 시험 포함.
- **APPROVE는 이번 코드 계약·합성 오프라인 검증 단위에 한정.** 실제 코스피200 유효 구성 201개라는 공식 확인, KRX 효력 기준일, 미국 200 공식 원본, 실제 GAS·시세, 기기 뒤로가기 캐시와 운영 배포는 모두 미완료.
- KR 허용 200~205는 임의의 방어적 범위이지 공식 지수 규정이 아님. 자동 운영에서 범위 밖 값은 묵살하지 말고 검토 대기로 넘길 것.
- GitHub 저장소는 **public**으로 확인했고, 기존 radar/data/kospi200-20261112.json은 이미 공개 브랜치에 존재함. KRX 재배포 약관을 확인하지 않았으므로 해당 목록을 운영 공개 자산·외부 API에 추가 재배포하거나 새로운 라이선스 불명 자료를 업로드하지 말 것. 기존 Git 기록에서의 완전 제거는 별도 검토 필요.

## 후속
- 2026-11-13 예정된 미국 ETF 보유종목 파일을 받은 뒤 기존 공식 지수 기준과 ETF 비중 대안의 차이·출처·기준일·종류주·중복·권리 범위를 비교하여 사용자 변경 승인 전에는 US 계약을 바꾸지 말 것.
- 보고 수치의 2 skip/DST는 후속 재현 시험 시 별도 TZ 환경에서 확인.
- sessionStorage 캐시 설계는 투자기록·백업과 절연된 문서·시험 계획 단계로만 다룰 것.
- 승인 없이 main 앱 병합, 운영 배포, GAS 수정·설치, 실제 키·비용, 실제 투자기록·백업, 자동매매 금지.

## 사용자 승인
이번 합성 코드 검토 불필요. **GAS·운영 반영 및 미국 200 선정 기준 변경은 별도 사전 승인 필요.**
