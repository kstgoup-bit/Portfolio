# HAS KIS Free/Auth 독립 오프라인 후보 구현

작성: 2026-11-10 UTC. **실연결 없음, 운영 배포 불가, 합성 시험 전용**이다. 기본 Worker는 어떤 환경변수·비밀·binding을 전달해도 `503 live-disabled`를 반환한다. 이 문서는 배포·키 등록·실조회 승인이 아니다.

## 1. 기준과 변경 범위

- 로컬 기준 HEAD: `eba37f0dc231fb94382ee31e45b79260731197b7`.
- 그 HEAD의 tree: `31d9ce5ec99c3607d0eb881cddb1b00f52bcfd97`.
- 확인한 원격 소스 기준: `08fb2a537f29f97e4f8e35a8e626f5c76f27248f`. 이 구현 작업은 원격 HEAD나 파일을 수정하지 않았다.
- 별도 worktree/branch: `has-kis-free-auth-20261110`, `work/has-kis-free-auth-20261110`.
- 새 모듈: `kis-free-auth/auth.mjs`, `coordinator.mjs`, `worker.mjs`, `client.mjs`.
- 구현 시험: `tests/kis-free-auth.test.cjs`. 독립 검토 시험과 보호 시험은 별도 파일이다.
- 기존 `portfolio_v5.html`, `has/relay-policy.js`, GAS, 장부·백업·자동기록·기준일 모듈을 수정하거나 import하지 않았다. 신규 패키지, SDK, wrangler 설정, binding ID, 계정 식별자, 배포 명령을 추가하지 않았다. 원격 push는 없으며 최종 로컬 커밋은 패키지 manifest에 기록한다.

참조한 기존 계약:

- [22C 계약·예산 준비](https://github.com/kstgoup-bit/Portfolio/commit/7925550886b09cd7aac9db53dbe1ae8260536606), [22D 서버 전송](https://github.com/kstgoup-bit/Portfolio/commit/4ec1d992a2af59839cd7d8ac48a5d089a81f0735): 기존 준비 문서를 통해 고정 목적지·원자적 선예약·숨은 재시도 금지 계약을 재사용했다. 과거 일봉 구현/40회 승인 이력을 이번 현재가 실행 허가로 사용하지 않는다.
- [27단계](https://github.com/kstgoup-bit/Portfolio/commit/8787599ae03d5187c62660fa5e85ca5395ae9d64): 이번에 GitHub로 읽었다. 장기 브라우저 공유 bearer, 임의 `KIS_BASE`, 기본 redirect, 인스턴스 메모리 예산, NAS/NYS/AMS 순회는 복사하지 않았다.
- 현재 `has/relay-policy.js`: 읽기만 했다. 기존 정책의 시세 전용·fail-closed·응답 가림 원칙은 유지하지만 기존 공유 proof/메모리 제한을 실제 소유자 인증·전역 한도로 재해석하지 않는다.

## 2. 실제로 구현된 경계

### 기본 Worker와 합성 진입점은 분리되어 있다

`worker.mjs`의 default `fetch()`는 영구 닫힘이다. `LIVE_ENABLED`, 실제 URL, 비밀, Firebase 설정 등으로 켤 수 없다. 실전 전환에는 별도의 검토된 구현·권한·설정·시험이 필요하다.

명시적인 `createSyntheticWorker(...)`만 시험에서 호출할 수 있다. 서버 설정의 project/UID는 `synthetic-` 접두사, HTTP origin은 예약 도메인 `.invalid`, 전송 함수는 신뢰된 시험 코드에서 주입한 `mode: synthetic-only` 함수만 받는다. 전역 `fetch` fallback은 없다. 악의적인 개발자가 새 전송 함수를 작성해 외부로 보내는 것까지 이 소스가 통제한다고 주장하지 않는다. 여기 제공된 구현과 시험에는 그런 전송 함수가 없다.

허용 경로는 `GET /v1/quote/kr/005930` 하나다. OPTIONS는 동일 origin/경로, GET, Authorization 요청 헤더 조합만 허용한다. 주문·잔고·계좌·미국·FX·여러 종목·토큰 공개 API·설정 변경 API는 없다. URL은 `Request`가 정규화한 유효 URL 전체를 비교한다. 원시 wire상의 dot-segment 등을 조사했다는 의미는 아니다. query·fragment·다른 유효 경로·다른 origin은 거절한다.

### 인증 API

`createFirebaseVerifier({ config, keyProvider, subtle, now })`는 `verify(authorization)` 함수를 반환한다.

- `config`는 서버 소유 `projectId`, `ownerUid`이며 요청의 이메일/UID/project 값으로 바뀌지 않는다.
- Firebase 형식 JWT의 **실제 RS256 서명**을 WebCrypto로 확인한다. JSON payload 디코딩만 하는 인증이 아니다.
- `alg=RS256`, 문자열 `kid`, 허용된 JOSE 헤더만 받는다. `none`, HS256, emulator unsigned token, request/JWT의 JWK/JWKS URL·key·`crit`를 받지 않는다.
- 중복 JSON 키와 escaped-equivalent 키, prototype 관련 키, 비정상 UTF-8/JSON/base64url을 거절한다.
- 정확한 issuer `https://securetoken.google.com/<projectId>`, 단일 문자열 audience, `sub`와 서버 허용 UID를 비교한다. `user_id`가 있으면 같은 UID여야 한다. 이메일 일치는 권한 조건이 아니다.
- `firebase.sign_in_provider=google.com`만 허용하며 tenant 있는 토큰은 거절한다.
- 만료·발급·인증 시각을 정수 초로 확인한다. 미래 `iat/auth_time`, 만료, 1시간보다 긴 JWT 수명, `auth_time` 기준 15분 초과 로그인, 미래 `nbf`를 거절한다. 시계 오차는 0초로 보수적으로 적용한다.
- 공개키는 신뢰된 `keyProvider({kid, projectId})`만 제공한다. 응답은 `{kid, key: CryptoKey, validUntilMs}`이며 공개 RSA 2048비트 이상/SHA-256/verify 용도인지 확인한다. 키가 만료되거나 unknown이면 거절한다.
- 키 획득/서명 검증 await 뒤에도 안전한 정수·단조 시각, key TTL, JWT 만료/최대 로그인 경과시간을 재검사한다. 의존성 오류 원문은 인증 오류로 정규화한다.
- 반환 principal은 필요한 UID/project/authTime/issuedAt/expiresAt만 포함한다. raw JWT, 이메일, 프로필, 서명은 반환하지 않는다.

시험의 RSA 키쌍은 실행 시 로컬에서 생성한다. **이 통과는 실제 Firebase 공개키 신뢰 사슬, Google OAuth 또는 Firebase 실사용 인증 성공의 증거가 아니다.**

### 긴급 차단과 세션 폐기

`PilotCoordinator.setOwnerPolicy({blocked, cutoffAuthTime})`는 서버 내부 API다. 공개 HTTP endpoint가 없다. 실제 운영자가 이 상태를 어떻게 변경할지는 미구현이다.

- 모든 `begin`, 토큰/시세 `reserve`, `complete`, 최종 `publish`의 저장 트랜잭션에서 현재 차단 상태와 principal 만료/인증 경과시간/폐기 시각을 다시 읽고 검사한다.
- `auth_time <= cutoffAuthTime`인 세션은 거절한다. 동일 초 로그인도 보수적으로 거절하며 다음 초 이후 새 로그인만 후보가 된다. refresh로 `iat/exp`가 새로워져도 오래된 `auth_time`은 통과하지 않는다.
- cutoff는 감소할 수 없다. block=true는 이미 진행 중인 pilot을 terminal failed로 바꾼다. 같은 cutoff로 곧바로 unblock해도 이전 run/응답이 되살아나지 않는다.
- local 정책은 Google 계정 또는 Firebase 전체 세션 취소 기능이 아니다. Firebase Admin의 revoked/disabled 상태를 실시간으로 조회하지 않는다.
- 토큰/시세가 기다리는 동안 차단되면 다음 전송이나 표시가 억제된다. 이미 허용되어 전달된 요청을 되돌리거나 확정된 응답을 회수하는 기능은 아니다. 선예약 트랜잭션과 최종 publish 트랜잭션이 각각 전송 허용/표시 허용의 순서 기준이다. 그 직후 차단과 경합하는 in-flight I/O까지 취소됨을 보장하지 않는다.

### 하나의 계정 전역 예산과 재시작

`PilotCoordinator(storage, {now, makeRunId})`는 DO storage와 같은 `transaction(async tx => get/put)` 인터페이스를 요구한다. 인스턴스 배열/메모리 mutex만으로 전역 제한을 구현하지 않는다. 실제 namespace routing은 아직 없다.

하나의 upstream 자격증명을 쓰는 모든 보호 경로가 **서버에서 고정한 동일 DO**로 가야 한다. 사용자가 보낸 UID·경로·요청 ID로 DO를 분할하면 안 된다. 다른 앱이 동일 KIS 키로 보낸 호출은 이 장부가 통제하지 못하므로 실제 계정 전체 제한이라고 단정하지 않는다.

- 공유 상태는 하나의 고정 key에 저장한다. schema, 차단/cutoff/revision, 단조 시각, 1회 pilot ID/시작/종료시각/상태, 유형별 카운터와 pending만 둔다. JWT·KIS 토큰·UID·이메일·키·계좌·가격·원문은 넣지 않는다.
- `initializeSynthetic()`는 테스트 fixture 준비 전용이다. 요청 handler가 호출하지 않는다. 이미 state가 있으면 재초기화를 거절한다. 상태가 없거나 잘못됐거나 저장소가 실패하면 자동 생성/메모리 fallback 없이 닫힌다.
- `begin`은 계정당 1회 실행 잠금을 원자적으로 확정한다. 동시 클릭/다른 Worker 인스턴스의 begin은 거절한다.
- token 1회, quote 1회, 합계 최대 2회만 전송 **전에 원자적으로 선차감**한다. 저장 트랜잭션 안에서 transport/network를 호출하지 않으므로 저장소가 콜백을 재실행해도 전송이 중복되지 않는다.
- 실패·타임아웃·redirect·형식 오류·저장 commit 응답 유실 등 불확실한 결과에도 예약을 환불하지 않는다. 불명확하면 아예 전송하지 않는 경우에도 보수적으로 예산/잠금을 남긴다.
- 새 coordinator 인스턴스에도 기존 state가 유지된다. 메모리 접근토큰을 잃은 재시작은 재발급 권한이 아니다. run 자동 재개·재발급·reset·2차 pilot endpoint는 없다.
- 전체 pilot은 begin 시점부터 60초, 각 token/quote 시도는 최대 10초다. timeout은 AbortSignal과 Promise race로 종료하며 adapter가 abort를 무시해도 늦은 응답을 표시하지 않는다. timeout 발생 뒤 upstream 실제 처리 결과는 불확실하므로 예약은 남는다.

로컬 시험의 두 독립 storage 모델은 serializable transaction을 모사한다. **실제 SQLite Durable Object 내구성·재시작·commit gate·다중 지역 routing의 운영 검증은 아니다.** 실제 구현 시 SQLite Free 지원 방식과 해당 storage API 계약을 재검증해야 한다.

### 고정 합성 전송 계약

- 합성 token: POST `/oauth2/tokenP`, `https://kis.synthetic.invalid`에 해당하는 의미적 요청 descriptor만 만든다. 실제 key/body/network 구현 없음.
- 합성 quote: GET `/uapi/domestic-stock/v1/quotations/inquire-price`, `FHKST01010100`, `FID_COND_MRKT_DIV_CODE=J`, `FID_INPUT_ISCD=005930`, KRX만 지정한다.
- redirect='error', retries=0. 페이지·venue fallback·자동 실행 없음.
- transport 응답은 `synthetic=true`, status=200, redirected=false여야 한다. Location 정보나 비정상 상태를 거절한다. token은 `synthetic:`로 시작하는 시험 문자열만 허용한다.
- 실제 KIS 목적지와 공식 인증/현재가 전송은 이전 준비계획의 검토 대상이다. 여기에는 실전 URL을 실행할 코드, 실전 비밀을 받는 함수 또는 자동 endpoint 선택 기능이 없다.

### 출력·오류·로그

시세 출력은 KRX/005930/KRW의 유한한 양수와 합성/미검증 상태만 허용한다. provider가 넘긴 다른 종목·거래소·통화는 거절한다. 실제 거래소 시각을 수신시각으로 대체하지 않는다. `exchangeTimestamp=null`, `kind=unknown`, `verification=unverified`, `independent=false`, `usableForSignals=false`, `persistAllowed=false`다.

모든 응답은 no-store/private다. CORS는 고정 `.invalid` origin만 허용하고 credentials 허용은 하지 않는다. Origin/CORS는 사용자 인증을 대체하지 않는다. 오류는 고정 코드→고정 HTTP status 목록만 노출한다. 의존성이 `ClosedError` 형태로 임의 비밀/HTTP 200을 던져도 그것을 반사하지 않는다. request URL/헤더, raw JWT, provider body를 로그하는 코드 자체가 없다.

실제 HTTP upstream response size/stream 파싱/최종 URL 검사, 공식 인증키/키 캐시 fetch timeout·오류·회전·중복 요청 방지 등은 전송 adapter를 만들 때 추가 검증해야 한다. 현재 object transport 시험이 그 문제를 해결했다고 주장하지 않는다.

## 3. 브라우저 메모리 로그인 구조

`createMemoryLoginAdapter({authAdapter, requestAdapter})`는 합성 adapter 두 개만 받는다. 실제 Firebase SDK를 다운로드하거나 계정을 만들지 않는다.

- 로그인 전에 `useMemoryPersistence`를 호출하고 성공해야 `signInGoogle`로 넘어간다. 실제 구현에서는 Firebase `inMemoryPersistence`를 정확히 연결해야 한다.
- session은 closure에만, ID token은 요청 처리 중 변수에만 둔다. localStorage/sessionStorage/IndexedDB/GitHub/백업과 연결하지 않는다. 사용자 profile/원문/token을 출력하지 않는다.
- 고정 URL에 Authorization 헤더만 전송하며 credentials=omit, redirect=error, no-store, no-referrer를 사용한다.
- clear/signOut은 세대 번호를 바꾸고 진행 중 작업의 AbortSignal을 취소한다. await마다 cancellation race가 있어 provider/응답이 영원히 기다려도 UI 상태가 계속 busy로 고정되지 않는다. 오래된 finally가 새로운 작업의 busy/session을 덮어쓰지 않는다.
- 합성 경계의 최대 대기시간은 로그인 120초, quote 75초, signOut 10초다. KIS 전송 예산은 서버의 60초/10초가 별도로 더 엄격하게 적용된다.
- signOut cleanup에는 이전 session/generation/signal을 전달한다. 실제 Firebase의 전역 signOut은 이 세대 격리 계약을 자동으로 만족하지 않는다. 실제 SDK에서 늦은 로그인/로그아웃이 새 session을 바꾸지 않도록 격리·정리하는 구현과 기기 시험이 남았다.
- 참조를 지우고 표시를 억제하는 것과 JS heap/DevTools/네트워크 buffer를 보안 삭제하는 것은 다르다. 보안 메모리 삭제를 약속하지 않는다. browser-side abort도 서버 측 처리 취소나 예산 환불을 보장하지 않는다.

PWA UI, provider popup/redirect, 재인증, pagehide 연결, Google/Firebase 허용 origin/domain 설정은 이 후보에 없다. 특히 모바일 redirect의 제3자 저장소 문제와 memory-only 상태 재진입은 실제 Galaxy/Chrome/Samsung Internet/PWA에서 별도 검증해야 한다.

## 4. 실행한 시험과 한계

초기 구현 시험 29개와 별도의 독립 경계 시험을 focused 명령으로 실행했다. 최종 합계는 같은 패키지의 최종 보고서/독립 검토서에 기록한다.

```sh
node --require ./tests/lib/no-network.cjs --test tests/kis-free-auth.test.cjs tests/kis-auth-independent.test.cjs
```

검증 분야: 로컬 RS256 서명·서명 위조·JWT claim/키 혼동·JSON 중복키·키 TTL/시계, 폐기 기준과 block/unblock 경합, 20개 handler 동시 시작, 저장 실패/commit 불확실성/재시작/환불 금지, 60초/10초 deadline, 고정 route/origin/redirect, 오류 비밀 반사 금지, 브라우저 메모리/cancellation/동시 세대 경계.

전체 npm test와 브라우저 실행은 수행하지 않았다. 앞선 환경에서 거절된 runner/Chromium socket 경로를 재시도하지 않았다. 로컬 테스트 소요시간은 Workers Free의 **10 ms CPU 제한 충족 증거가 아니다**.

## 5. 아직 구현·검증하지 않은 실전 경계

1. **공식 공개키 adapter**: `unavailableOfficialKeyProvider()`는 항상 거절한다. 공식 Firebase securetoken 키 출처 고정, TLS/redirect 정책, Cache-Control max-age, unknown kid bounded refresh, 캐시 동시성/키 회전/다운로드 실패/응답 크기/CPU 예산 검증이 필요하다. 토큰의 URL/JWK를 사용해서는 안 된다.
2. **실제 OAuth·Firebase 현재 취소 상태**: Google 로그인, 실 프로젝트/UID, 사용자 disabled/global revoked 확인은 미연결이다. local cutoff는 그 대체 구현이 아니다.
3. **DO 실제 구성**: Free SQLite object와 binding/계정당 namespace 선택, 신뢰된 초기화·긴급 차단 관리 경로, 저장소 삭제/namespace 교체 시 기존 예산 복구 정책은 미구현이다. state 유실 때 새 예산을 자동 발급하면 안 된다.
4. **Workers CPU와 무료 조건**: cold/warm key cache 포함 실제 Free CPU 측정 없음. 실제 계정의 Workers Free·Firebase Spark·Billing 미연결 여부를 조회하지 않았다. 무료 한도 초과 시 중단해야 하며 유료 플랜/결제수단 연결을 자동 대안으로 사용하지 않는다. 공식 조건은 `OFFICIAL-CONDITIONS.md` 참고.
5. **KIS 실전 전송·비밀·권리**: 키 등록/읽기/발급/서버 저장, 실제 token 재사용, KIS 호출/계좌/요금/권리 확인 전부 미수행이다. 범용 키 유출 시 이 코드 밖의 주문 권한 위험도 별도 설명·확인이 필요하다.
6. **기존 HAS 통합**: 앱, GAS, 장부, 백업, 자동기록, 시세 대조/신호와 연결하지 않았다. 통신·인증 성공과 가격 품질/출처 독립성 검증을 구분한다.

실제 키·토큰 열람 0, KIS/GAS 실 호출 0, 실제 계정·프로젝트·리소스 조회/생성/설정/권한 변경 0, 원격 쓰기/배포 0, 새 패키지 설치 0. 카드 없는 구성의 **설계·합성 검증 후보**이며 “Google 로그인 완료” 또는 “KIS 연결 완료”가 아니다.
