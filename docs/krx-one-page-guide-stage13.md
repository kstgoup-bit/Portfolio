# KRX 공식 종목정보 실조회 — 1장 안내 (순태씨 본인 PC용)

> **이 안내를 읽었다는 것만으로는 실행이 승인되지 않습니다.** 아래 6단계 중 4~5단계는 순태씨가 별도로 "실조회 승인"을 하신 뒤에만 하세요. 키는 **채팅·스크린샷·파일·GitHub 어디에도** 붙여넣지 않습니다. 이 도구는 종목 **신원(이름·시장·ISIN)** 만 확인하며 **주가 검증도, 매수 신호 활성화도 아닙니다.**

## 준비 (한 번만)
1. Node.js 18 이상 설치(`node -v`로 확인). 소스 ZIP을 풉니다(예: `C:\kst`).
2. 공공데이터포털에서 "금융위원회_KRX상장종목정보" 활용신청 → **본인 일반 인증키(Decoding 값)** 를 비밀번호 관리자 등 본인만 아는 곳에 둡니다.
3. 소스 폴더 **밖**에 폴더 2개를 만듭니다: 출력 `C:\krx-out`, 승인 파일 `C:\krx-approval.json`(메모장으로 직접 작성):
```json
{"approvedBy":"user","approvedAt":"2026-10-29","basDt":"20261028","maxCalls":3,"scope":"krx-identity-only"}
```
(`approvedAt`=오늘 날짜, `basDt`=조회 기준일 YYYYMMDD. 기준일은 보통 **영업일 하루 뒤 13시 이후**부터 열립니다. `maxCalls`는 1~3 권장, 최대 20.)

## 1단계 — 점검 (호출 0, 키 불필요)  *기본 OFF*
```
cd C:\kst
node tools\krx-live-runner.cjs --preflight --basDt=20261028 --max-calls=3 --approval=C:\krx-approval.json --out-dir=C:\krx-out
```
`ready:false`면 `checks`에서 `false`인 항목만 고치세요(키 항목은 4단계 전까지 false가 정상).

## 2단계 — 합성 리허설 (호출 0, 가짜 응답)
```
node tools\krx-live-runner.cjs --rehearsal --basDt=20261028 --out-dir=C:\krx-rehearsal
```
`status: complete`, `transportCalls: 2`가 나오면 도구 동작 확인입니다. 이 숫자는 **가짜 데이터**라 실제 검증이 아닙니다.

## 3단계 — 승인 여부 결정 (순태씨)
실조회를 하실지 정합니다. 안 하시면 여기서 끝이며 공식 검증 종목 수는 **0**으로 유지됩니다.

## 4단계 — 키 입력 + 실조회 (승인 후에만, 호출 ≤ 3회)
**Windows PowerShell** (입력이 화면에 보이지 않고 명령 기록에 남지 않습니다):
```powershell
$s = Read-Host "KRX 서비스키" -AsSecureString
$b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
$env:KRX_SERVICE_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b)
node tools\krx-live-runner.cjs --live --basDt=20261028 --max-calls=3 --approval=C:\krx-approval.json --out-dir=C:\krx-out
Remove-Item Env:KRX_SERVICE_KEY
```
**macOS/Linux**: `read -rs KRX_SERVICE_KEY && export KRX_SERVICE_KEY` → 위와 같은 `node tools/krx-live-runner.cjs --live ...` → `unset KRX_SERVICE_KEY`.
키는 명령줄 인자로 넘기지 않습니다(환경변수만). 이 PowerShell 절차는 Linux 개발환경에서 환경변수 요구 방식까지만 시험했고 **Windows 실기 시험은 하지 못했습니다(미실시)**.

## 5단계 — 결과 공유 (비밀값·종목목록 제거본만)
```
node tools\krx-share.cjs summary C:\krx-out\normalized\20261028\verification-log.json
```
출력(합계·출처·기준일·해시·호출 수)만 알려 주세요. `raw` 폴더의 원본 응답은 **보내지 마세요**. 응답 구조 확인이 필요하면 `node tools\krx-share.cjs shape <응답파일>` 결과(필드 이름만, 값 없음)만 공유합니다.

## 6단계 — 정리 / 중단
- 이상(오류·401/403·요청 제한)이 보이면 **즉시 중단**하고 재시도하지 마세요. 도구도 인증·권한·한도 오류에서 자동으로 멈춥니다.
- 끝나면 PowerShell 창을 닫고, 키가 노출됐다고 느끼면 포털에서 **재발급**하세요.
- `C:\krx-out\raw`(원본 응답)는 본인만 접근하는 곳에 보관하거나 삭제합니다. 공공누리 4유형(출처표시·비상업·변경금지)이므로 재배포 금지입니다.

**알아둘 점**: 실제 JSON/XML 응답은 아직 본 적이 없어 응답 구조는 가이드 예시 기반 가정입니다(우선주는 API 범위 밖). 100개 목표에 부족한 27개는 임의로 채우지 않습니다.
