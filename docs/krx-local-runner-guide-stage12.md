# 로컬 실행기 가이드 — KRX상장종목정보 조회 (12단계)

> **이 문서와 실행기는 실조회 승인이 아닙니다.** 순태씨가 별도로 승인하고, 본인 PC에서 직접 키를 설정한 경우에만 `--live`가 동작합니다. 클로에게 키를 보내지 마세요.

## 1. 구성
| 파일 | 역할 |
|---|---|
| `tools/krx-live-runner.cjs` | 개인 PC 전용 실행기. 기본은 OFF(계획만 출력) |
| `kr-radar/krx-run.js` | 호출 계획·재시도·상한·마스킹·부분 실패 재개(순수 함수, 네트워크 없음) |
| `kr-radar/krx-api.js` | 응답 파서·검증기·후보 대조 |
| `kr-radar/krx-status.js` | VERIFIED / MISMATCH / PENDING / EXCLUDED 4상태 |
| `tools/kr-krx-verify.cjs` | 이미 받은 응답 파일을 오프라인으로 대조 |
| `tools/scan-secrets.cjs` | 저장소·ZIP 압축 해제 폴더의 키/원본 응답 유출 검사 |

## 2. 설치(Node 18 이상)
```
git clone <저장소> && cd Portfolio && git checkout work/kst-krx-quality-stage12-20261029
npm ci            # 실행기 자체는 외부 패키지를 쓰지 않음(시험용만)
npm test          # 가짜 데이터·네트워크 차단기로만 동작
```

## 3. OFF(기본) — 계획 확인
```
node tools/krx-live-runner.cjs --basDt=20261028
```
네트워크 0회, 키를 읽지 않습니다. 출력에 최소 호출수(탐색 1 + 쪽당 1)가 나옵니다. 상장 종목 수가 10,000 이하이면 보통 2회입니다.

## 4. LIVE 전환 — 모든 조건이 있을 때만
1. **승인 파일**을 저장소 **밖** 폴더에 직접 만듭니다(예: `~/krx-private/approval.json`).
```json
{ "approvedBy": "user", "approvedAt": "2026-10-30", "basDt": "20261028", "maxCalls": 3, "scope": "후보 73개 신원 대조용 1회 조회", "expiresAt": "2026-11-05" }
```
`maxCalls`는 1~20(재시도 포함 하드 상한). `basDt`는 요청과 같아야 합니다.
2. **키**는 환경변수로만 설정합니다(명령행 인자·파일·채팅 금지).
 - macOS/Linux: `read -s KRX_SERVICE_KEY; export KRX_SERVICE_KEY` (입력 시 화면에 보이지 않음)
 - Windows PowerShell: `$env:KRX_SERVICE_KEY = Read-Host "키 입력"` (현재 창에서만 유효, 창을 닫으면 사라짐. 입력은 화면에 보이므로 주변을 확인하세요)
3. **출력 폴더**도 저장소 밖(`~/krx-private/out`)이어야 합니다.
4. 실행
```
node tools/krx-live-runner.cjs --basDt=20261028 --live --approval=$HOME/krx-private/approval.json --out-dir=$HOME/krx-private/out
```
5. 끝나면 `unset KRX_SERVICE_KEY`(또는 터미널 종료).

## 5. 무엇이 어디에 남는가
- `out-dir/raw/<basDt>/page-N.xml` — **원본 응답**(권한 0600). 저장소·ZIP·PR·Pages에 넣지 않습니다. 이용허락상 보관·재배포는 미확정이므로 확인이 끝날 때까지 삭제를 권장합니다.
- `out-dir/normalized/<basDt>/verification-log.json` — 정규화·검증 결과(코드·종목명·시장·ISIN·기준일·응답 해시·규칙·상태·검증 버전). 원본과 별도 파일.
- 부분 실패 시 `resume-state.json` — 누락 쪽 번호만 기록.
- 화면 출력은 건수·상태 합계뿐이며, 모든 문자열은 키 마스킹을 거칩니다.

## 6. 키 유출 방지 장치
- 키는 환경변수에서만 읽고 `--key` 계열 인자는 거부(종료코드 2).
- URL·예외·로그·결과 JSON에서 원문/URL 인코딩/`serviceKey=` 패턴을 모두 `***`로 치환(시험으로 증명).
- 호스트는 `apis.data.go.kr`(https)만 허용, 리다이렉트를 따르지 않음.
- 승인 파일·출력 폴더가 저장소 안이면 거부. `.gitignore`에 `krx-private/`, `*.approval.json`, `.env*` 추가.
- 제출 전 `node tools/scan-secrets.cjs`(저장소) 실행 — 발견 값은 출력하지 않고 파일·줄만 표시.

## 7. 오류 대응
| 증상(분류) | 의미 | 동작 | 조치 |
|---|---|---|---|
| unauthorized | 키 없음/무효 | 즉시 중단, 재시도 없음 | 키 확인(채팅에 붙이지 말 것) |
| forbidden | 활용 신청/승인 미확인 | 즉시 중단 | 포털에서 승인 상태 확인 |
| rate-limited(429) | 동시 요청 초과 | 1초→2초 백오프, 최대 2회 재시도 | 잠시 후 재실행 |
| quota-exceeded | 일일 허용량 초과 | 즉시 중단 | 다음 날 초기화 후 |
| backend/5xx/timeout | 기관 서버·네트워크 | 최대 2회 재시도 | 반복 시 활용지원센터 |
| result-code≠00, 비정상 XML | 응답 이상 | 해당 쪽 실패, 이미 받은 쪽 유지 | `resume-state.json`로 누락 쪽만 재시도 |
| basDt 불일치/빈 데이터 | 휴일·미개방일(다음 영업일 13시 이후 개방) | 차단 | 기준일 변경 |
| 호출 상한 | 계획+재시도가 maxCalls 초과 | 차단 | 승인 파일의 maxCalls 확인(최대 20) |

## 8. 승인 전 하지 않는 것
실조회, 키 입력/전달, 시세 API 호출, 응답 원본 커밋·공유, 공개 배포, 결과를 앱 화면에 노출하는 연동(앱은 이 모듈을 불러오지 않으며 시험으로 확인).
