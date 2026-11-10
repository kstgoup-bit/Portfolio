# Workers Free + Firebase Spark 공식 조건 검증

확인일: **2026-11-10 UTC**. 공개 공식 문서만 읽어 검증했다. 실제 계정의 요금제·결제 연결·권한·리소스는 조회하거나 변경하지 않았다. 로그인, 배포, 실 KIS/GAS 호출, 실제 키 사용, SDK 인증은 하지 않았다.

## 판단

Workers Free와 Firebase Spark의 Google 로그인 조합은 **카드 없는 후보 구성**으로 유지할 수 있다. 다만 무료 한도, 실제 계정 상태, Worker CPU, 모바일 로그인 및 KIS 이용 권한을 확인하기 전에는 운영 가능 또는 영구 무과금으로 확정할 수 없다. KIS 키의 권한과 이용약관은 클라우드 무료 조건과 별개이며 이번 조사로 확인되지 않았다.

## 요금·한도 근거표

| 항목 | 공식 문서에서 확인한 조건 | 이 후보에 적용할 주의사항 | 출처 |
| --- | --- | --- | --- |
| Workers 가입 | 무료 시작에 신용카드를 요구하지 않는다고 안내한다. | 사용자의 실제 가입 가능 여부와 현재 요금제는 미확인이다. | [Workers 제품 안내](https://www.cloudflare.com/products/workers/) |
| Workers Free 실행 | 요청 100,000/일, HTTP 요청당 CPU 10 ms, 메모리 128 MB, 요청당 subrequest 50개. 네트워크 대기 시간과 CPU 시간은 다르다. | 암호 검증·JSON 처리까지 포함한 실제 CPU 적합성은 측정하지 않았다. 한도를 반복 초과하면 실행이 종료될 수 있다. 로컬 wall-clock 측정은 운영 CPU 증명이 아니다. | [Workers 한도](https://developers.cloudflare.com/workers/platform/limits/) |
| Workers 유료 전환 | Paid/Standard는 구독료와 포함량 초과 사용료가 있는 별도 요금제다. 문서 예시의 기본 구독료는 월 US$5다. | 한도 부족을 이유로 자동 전환하거나 결제수단을 연결하지 않는다. 다른 유료 부가 제품도 별도 확인 대상이다. | [Workers 가격](https://developers.cloudflare.com/workers/platform/pricing/) |
| Durable Objects Free | **SQLite 기반만** 사용 가능. 요청 100,000/일, 실행 시간 13,000 GB-s/일, 읽기 5,000,000행/일, 쓰기 100,000행/일, 총 저장량 5 GB. | Free 한도를 넘는 해당 작업은 오류로 실패하며 일일 한도는 00:00 UTC에 초기화된다. DO 요청·저장소와 호출 Worker의 한도를 모두 고려해야 한다. KV 방식의 get/put도 SQLite 행 사용량에 포함된다. 앱 요청당 여러 저장 작업이 있으면 요청 수보다 쓰기 한도가 먼저 소진될 수 있다. | [DO 가격 및 무료 제한](https://developers.cloudflare.com/durable-objects/platform/pricing/) |
| Firebase Spark | 결제정보 없이 시작 가능하며 소셜 로그인은 무상 제품에 포함된다. Cloud Billing 연결은 Blaze로 자동 전환한다. 일부 Google Cloud 서비스를 같은 프로젝트에서 켜는 과정에도 Billing 연결이 필요하다. | Spark 유지, Billing 미연결, Google 로그인만 사용한다는 조건이다. 무료 크레딧 연결도 무과금 보장이 아니다. 기존 프로젝트 상태는 확인하지 않았다. | [Firebase 요금제](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans) |
| Firebase 인증 제한 | 새 계정 생성은 IP당 시간당 100개. **Identity Platform을 사용하는 Spark**의 instrumentless 한도는 Tier 1 DAU 3,000/일, Tier 2 DAU 2/일이다. 남용 방지 제한도 적용될 수 있다. | Identity Platform의 별도 조건을 모든 기본 Google 로그인 프로젝트의 공통 DAU 한도로 단정하지 않는다. 무상 인증을 무제한 호출 보장으로 설명하지 않는다. | [Firebase Authentication 한도](https://firebase.google.com/docs/auth/limits) |

## Google 로그인과 서버 검증 계약

기준: [Firebase ID 토큰 검증](https://firebase.google.com/docs/auth/admin/verify-id-tokens).

- Worker가 받는 것은 **Firebase ID token**이다. Google OAuth access token 또는 임의의 Google ID token을 대체품으로 받지 않는다.
- 서명 알고리즘은 RS256이며, `kid`는 Firebase securetoken 공식 공개키 집합에 존재해야 한다. 해당 키로 실제 서명을 검증한다. payload 디코딩만으로 인증하지 않는다.
- `aud`는 고정된 Firebase project ID, `iss`는 `https://securetoken.google.com/<projectId>`여야 한다.
- `sub`는 비어 있지 않은 Firebase UID여야 한다. 이 후보의 단일 사용자 접근은 검증된 `sub`와 서버측 허용 UID를 대조한다. 이메일 일치만으로 권한을 주지 않는다. UID 허용목록은 앱의 추가 접근정책이다.
- `exp`는 미래, `iat`와 `auth_time`은 과거여야 한다. 타입·유한 숫자·초 단위를 검증한다. 허용 시계 오차 및 최대 인증 경과시간은 앱 정책으로 명시한다.
- 공식 공개키 응답의 `Cache-Control: max-age`에 맞춰 키를 갱신한다. 토큰이 지정한 임의 URL로 키를 가져오는 방식은 사용하지 않는다.

### 긴급 차단은 서명 검증과 별도다

기준: [Firebase 세션 관리](https://firebase.google.com/docs/auth/admin/manage-sessions).

- Firebase ID token의 수명은 약 1시간이다. refresh token 취소와 이미 발급된 JWT의 오프라인 유효성 확인은 다르다. 서명·만료 검사만 하는 Worker는 Firebase의 취소·사용자 비활성화를 자동으로 알지 못한다.
- Firebase의 현재 취소 상태 확인에는 추가 백엔드 조회 또는 별도의 취소 메타데이터 검사가 필요하다. 이 후보가 Admin SDK를 사용하지 않는다면 Firebase 전역 취소 확인을 구현했다고 설명하지 않는다.
- 앱 자체 차단은 모든 보호 요청에서 전역 차단 상태, UID 허용목록, 필요하면 `auth_time` 기준의 세션 폐기 시각을 확인하는 별도 설계다. 토큰 갱신은 과거 로그인 자체를 새 로그인으로 만들지 않는다.
- 이 차단은 HAS/KIS 프록시 접근을 막는 것이며 Google 계정·모든 Firebase 세션을 취소하는 것은 아니다. 설정 배포 전파, 캐시, 이미 허용된 진행 중 요청까지 즉시 중단된다는 보장은 없다. 차단 저장소 장애 시 허용으로 돌아가지 않는지, 재시작 후에도 차단이 유지되는지 별도로 시험해야 한다.

## 전역 호출 한도와 Durable Object

기준: [Workers Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/), [DO 수명주기](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/), [SQLite DO 저장소](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/).

- Workers rate-limit binding은 **Cloudflare 위치별·근사치 제한**이다. 같은 위치에서도 지연된 동기화 때문에 초과 허용이 가능하다. 같은 namespace/key를 써도 전 세계 엄격한 합산 한도가 되지 않는다.
- 공식 문서는 엄격한 upstream 자격증명별 제한에 같은 DO로 요청을 모으고, 카운터 검사와 갱신을 함께 수행하며, 카운터를 영속 저장할 것을 권한다. 실제 KIS 한도 주기·계정 범위는 별도 확인해야 한다.
- DO 메모리는 hibernation·재시작 때 사라질 수 있다. 메모리 카운터만으로 재시작을 견디는 제한을 주장하지 않는다. SQLite `transactionSync`는 동기 저장 작업을 트랜잭션으로 묶을 수 있다. 같은 공식 SQLite 저장소 문서는 비동기 KV API와 `transaction(async txn => ...)`, `txn.get/put`도 지원한다. 따라서 후보의 비동기 저장 트랜잭션 인터페이스는 문서상 API 형태에 부합하지만, 실제 런타임 검증을 대신하지 않는다.
- 앱 설계 조건: 실제 upstream 요청 전에 허용량을 예약하고 저장 완료를 보장한다. 동일 KIS 자격증명을 사용하는 모든 경로·Worker·환경이 동일한 제한 상태를 공유해야 한다. 다른 앱에서 같은 키를 사용하는 호출은 이 DO가 통제하지 못한다.
- quota 오류·저장소 오류·불확실한 재시도에서는 보수적으로 차단한다. upstream의 429도 처리한다. DO를 추가했다는 사실만으로 코드의 원자성·우회 경로·중복 호출 안전성이 검증되지는 않는다.

## 모바일·PWA·로컬 시험의 범위

| 항목 | 공식 조건 및 남은 검증 | 출처 |
| --- | --- | --- |
| 로그인 UI | Google provider는 popup/redirect를 지원하며 모바일에는 redirect를 권장한다. 팝업은 기기·브라우저에 의해 차단되거나 모바일 사용성이 떨어질 수 있다. | [Google 로그인](https://firebase.google.com/docs/auth/web/google-signin), [redirect 지침](https://firebase.google.com/docs/auth/web/redirect-best-practices) |
| 외부 호스팅 redirect | 교차 출처 iframe 저장소 의존 때문에 제3자 저장소 차단에 대응해야 한다. Firebase가 아닌 호스팅은 popup 또는 문서의 proxy/self-host 등 적절한 대안을 선택해야 한다. `authDomain` 값만 임의로 바꾸면 해결된다고 가정하지 않는다. | [redirect 지침](https://firebase.google.com/docs/auth/web/redirect-best-practices) |
| 로그인 유지 | LOCAL은 창을 닫아도 유지되며 단일 host origin에 한정된다. SESSION은 현재 탭/세션, NONE은 메모리만 사용한다. 지원 저장소와 브라우저 설정에 영향을 받는다. | [인증 상태 지속성](https://firebase.google.com/docs/auth/web/auth-state-persistence) |
| Auth Emulator | 에뮬레이터 토큰은 **서명되지 않는다**. 명시적으로 에뮬레이터 모드인 Admin SDK 등이 허용하며 운영 기본 검증기는 거부한다. 에뮬레이터 성공은 실제 Google 서명·공개키 갱신·운영 로그인 성공의 증거가 아니다. | [Auth Emulator](https://firebase.google.com/docs/emulator-suite/connect_auth) |

실제 Galaxy의 Chrome/Samsung Internet/PWA에서 로그인, 취소·뒤로가기, 새로고침, 앱 종료 후 재진입, 만료 갱신, 로그아웃, 저장소 차단, 긴급 차단은 **이번 검증에서 실행하지 않았다**. 모의 토큰·로컬 암호 테스트는 해당 분기 시험으로만 표시하며 실제 Google OAuth, Workers Free 배포, 운영 CPU, DO 전역 동작의 합격으로 확대하지 않는다.

## 운영 전 남아 있는 확인

1. 사용자 승인 범위 안에서 실제 Free/Spark 및 Billing 미연결 상태 확인.
2. 실제 프로젝트·허용 UID·origin·redirect 설정 확인 및 Google 로그인 실기기 시험.
3. cold/warm 공개키 캐시를 포함한 Workers CPU 측정, DO 저장소 오류·재시작·동시 요청 시험.
4. 긴급 차단 적용 경로와 지연, 로컬 실패 시 차단 동작 검증.
5. KIS 키의 실제 기능 범위, 시세 이용·저장·전달 권리, 호출 한도 확인. 이를 확인하기 전 실 키 입력·실 호출·운영 배포를 진행하지 않는다.

위 항목은 검증 과제이며, 계정 변경·권한 확대·결제 연결·배포를 승인하는 문서가 아니다.
