# 11단계 — KRX 공식 API 보완 코드의 10단계 안전 통합

작성일 2026-10-29

## 1. 통합 방식과 계보
- 기준: `work/kst-marketdata-stage10-20261029` @ `a09dd47d20810487f46c191d621975770ef56f51` (작업 시작 전 원격 HEAD 조회로 확인)
- 보완 브랜치: `work/kst-marketdata-stage8-krxapi-20261029` @ `e52dfcd18486497ae2ad4cd198cec2d099773f17` (원격 존재 확인)
- 보완 브랜치는 8단계(`1a0b337`)에서 분기했으므로 **브랜치 병합을 하지 않고**, 전달 ZIP 안의 `stage8-krxapi.patch` **단일 경로**만 10단계 위에 적용했다(`git apply --check` 후 적용, mbox/ZIP 중복 적용 없음). 적용된 7개 파일은 `e52dfcd`의 파일과 바이트 단위로 동일함을 `cmp`로 확인.
- 파일명·모듈 충돌: 10단계에는 동일 경로 파일이 없어 충돌 0건. 기존 `listing.js`는 `krx-api.js`가 `classifyByName`/`MAX_LISTING_AGE_DAYS`만 읽기 전용으로 사용.

## 2. 통합 변경 목록
| 구분 | 파일 | 비고 |
|---|---|---|
| 보완 코드(패치) | `kr-radar/krx-api.js`, `tools/kr-krx-verify.cjs`, `tests/kr-krx-api.test.cjs`, `tests/fixtures/krx/guide-example.xml`, `docs/krx-official-api-supplement-stage8.md`, `docs/KST-stage8-krxapi-report.md`, `docs/stage8-krxapi-instructions.md` | 신규 7 |
| 11단계 추가 | `kr-radar/identity.js`, `tests/kr-krx-integration.test.cjs`, `docs/krx-integration-stage11.md`, `docs/KST-stage11-report.md`, `docs/stage11-instructions.md` | 신규 5 |
| 변경 | 없음(패치 적용 후 `krx-api.js`에 선택 옵션 `expectedBaseDate`만 추가 — 요청 기준일과 응답 기준일 불일치 차단용, 기존 동작·시험 영향 없음) | 신규 파일 내부 변경 |
| 보존 | `portfolio_v5.html`, `portfolio.html`, `service-worker.js`, `manifest.json`, 백업·투자기록 로직, 10단계 모듈 전부 | 변경 0 |

## 3. 신원 검증과 시세 검증의 분리 (`kr-radar/identity.js`)
- **신원**(KRX 공식 종목정보와 코드·종목명·시장 일치)과 **시세**(종가·52주·벤치마크)는 서로 다른 증거다. 신원 `verified`는 `priceVerified:false`, `monitorable:false`, `HOLD / DATA_UNAVAILABLE`를 항상 동반한다.
- `advanceWithIdentity`: 한국 종목은 신원 `verified`가 아니면 파이프라인 '미연결'을 벗어날 수 없다. 신원 verified여도 `pipeline.js`의 정책(`realActivationAllowed=false`)과 시세 단계 증거 부족으로 활성화되지 않는다.
- `integrityEvidenceFromListing`: 파이프라인 '원본 무결성' 단계 증거로 변환. 합성/예시(`origin: fixture`)는 `official:false`라 그 단계에서 차단된다.
- `integrationSummary`: 개별주 73 · ETF 5(별도) · 우선주 0(별도) · 공식 검증 0 · 보류 78 · 제외 0 · 목표 부족 27 · 활성 0 · API 호출 0. 27개를 근거 없이 채우지 않는다.

## 4. 공식 응답 스키마 가정 (미확정)
- XML은 가이드 응답 예제 구조를 따른다(문서 예시 1건).
- **JSON 구조는 가이드에 예제가 없어 공공데이터포털 공통 형태 `response.header/body.items.item`을 가정**했다. `ASSUMED_JSON_SHAPE.status = 'assumed-unconfirmed'`.
- 실응답을 확보하면 `checkAssumedJsonShape(text)`로 경계에서 재검증하고, 어긋나면 파서를 수정하기 전까지 검증을 진행하지 않는다. 통과해도 가정이 확정되는 것은 아니며 사람이 원본과 대조해야 한다.

## 5. 이용권·보안 상태
- 공공누리 제4유형(출처표시·비상업적·변경금지), 가이드 안내의 제3자 제공·재배포 엄격 금지, 상업적 이용 시 KRX Data Marketplace 유료 구매. 상세는 `krx-official-api-supplement-stage8.md` §3~4.
- **미확정(확인 전 미사용)**: 개인 내부 조회, 코드·이름 비교(가공), 로컬 저장, 결과 표시, 출처표시 방법, GitHub 커밋, 브라우저 배포. **API 승인(개발계정 보유)만으로 위 이용권이 해결됐다고 단정하지 않는다.**
- 사용자가 발급받은 개발계정의 **존재만 상태로 기록**한다(인증키는 받지도 저장하지도 않음).
- 인증키: 소스·HTML·GitHub·ZIP·로그·오류 메시지에 없음. `buildRequestSpec`은 키가 오면 예외, 반환은 `sendable:false`. 브라우저/PWA 직접 호출은 키 노출 위험으로 금지(정적 시험이 앱 HTML·서비스워커에 KRX 모듈·`serviceKey` 참조가 없음을 확인).

## 6. 기관 질의서 초안 (승인 전 발송하지 않음)
**수신: 금융위원회 / 공공데이터포털 활용지원센터 (cc: 한국거래소 데이터사업부)**
제목: 「금융위원회_KRX상장종목정보」 개인 비영리 앱에서의 이용 범위 문의

1. 비영리 개인 투자관리 앱에서 본인의 종목 후보 목록(코드·종목명·시장)이 공식 상장 정보와 일치하는지 **내부 대조**하는 용도로 `getItemInfo_V2`를 조회해도 공공누리 제4유형의 이용허락범위에 해당합니까?
2. 일치 여부(예/아니오), 기준일, 응답 해시만 로컬에 **저장**하는 것은 허용됩니까? 종목코드·ISIN을 함께 저장해도 됩니까?
3. 접두(`A`) 제거, 공백·유니코드 정규화, 분류 힌트 부여 등 비교를 위한 처리가 "변경금지"에 해당합니까?
4. 본인 기기(브라우저 앱 화면)에 일치/불일치 결과를 **표시**하는 것은 제3자 제공에 해당합니까? 앱을 가족·지인 소수에게 공유하면 어떻게 됩니까?
5. 출처표시 방법(문구, 기준일 표기 위치)을 안내해 주십시오.
6. 일일 호출 허용량(개발계정/운영계정), 휴일·미개방일 응답 형식, JSON 응답 공식 예제, ETF·리츠·스팩·외국법인 포함 범위, 상장폐지·거래정지·명칭 변경 반영 방식을 안내해 주십시오.
7. 개인이 무료로 운영하는 도구가 KRX Data Marketplace 유료 구매 대상인 "상업적 이용"에 해당하는 기준이 있습니까?

## 7. 시세 공급자 권리·비용 — 미해결
KRX 종목정보 API는 가격을 제공하지 않는다. 미국·한국 시세 공급자의 이용권·정확성·비용 판정은 9·10단계 문서의 미확정 상태 그대로이며 이번 통합으로 해결되지 않았다(`provider-rights-stage9.md`, `provider-cost-stage10.md`).

## 8. 다음 단계에 사용자의 명시적 승인이 필요한 항목
1. 기관 질의서 발송 및 회신 근거 확인(이용 범위 확정).
2. 공식 API 1회 조회 승인(기준일 1일, 페이지 수·최대 호출 횟수 상한 명시).
3. 인증키 보관 방식 승인(로컬 환경변수 또는 보호된 서버 비밀 저장소, 채팅·저장소 전달 금지).
4. 조회 결과 보관 위치·기간·삭제 방침, 출처표시 방식 승인.
5. 조회 전 투자기록 백업(v6) 확인 및 롤백 계획 승인.
6. 시세 공급자 선정·약관·비용 승인(별도).
7. 어떤 경우에도 main 병합, 운영 배포, 유료 가입, 자동매매는 별도 명시 승인 전 금지.

## 9. 키 노출 없는 공식 실데이터 파일럿 실행 절차 (초안, 실행하지 않음)
1. 백업 v6 내보내기 확인. 승인 항목 1~5 서면 확인.
2. 순태씨 로컬 컴퓨터(저장소 밖 폴더)에서 `KRX_SERVICE_KEY` 같은 환경변수에 키를 설정한다. 키는 채팅·저장소·HTML에 쓰지 않는다.
3. 로컬 전용 호출 스크립트(승인 후 별도 작성, 저장소 `kr-radar/*.js`에는 두지 않음)가 `basDt` 1일, `numOfRows` ≤ 10,000, 필요한 쪽 수만 호출하고 하루 상한을 코드로 강제한다. 429·quota 응답 시 자동 재시도 없이 중단.
4. 응답 파일은 저장소 밖에 두고 `node tools/kr-krx-verify.cjs <파일들> --attest-official --today=YYYY-MM-DD`로 오프라인 대조한다(출력에는 해시·결과만).
5. 결과를 사람이 검토하고 JSON 구조 가정을 `checkAssumedJsonShape`로 재검증한다.
6. 응답 원본은 승인된 보관 방침대로 삭제하며 커밋·ZIP·배포에 넣지 않는다.
7. 이 절차를 마쳐도 신원 확인일 뿐이며 시세 감시는 별도 공급자 판정 전까지 NO-GO다.
