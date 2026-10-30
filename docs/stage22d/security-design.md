# HAS 22D — 서버 인증·실제 HTTPS 조회 전송 설계
작성일 2026-10-30 (한국시간). 실제 전송 가능한 코드를 구현했으나 이번 실행은 합성 HTTPS 이벤트 스트림으로만 시험했다. 실제 KIS 호출은0회다. 기본 개인 시세 개발에 고객센터 문의를 필수로 요구하지 않는다.

## 공식 규격과 적용
[개인 인증 안내](https://apiportal.koreainvestment.com/about-open-api)는 개인 Client Credentials와24시간 접근토큰을 안내한다. [공식 인증 응답 예제](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/auth/auth_token/chk_auth_token.py)에서 access_token·token_type·expires_in·access_token_token_expired를 확인했다. [공식 인증 공통 코드](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/kis_auth.py)는 POST /oauth2/tokenP, grant_type=client_credentials, appkey/appsecret을 사용하며6시간 내 재요청에서 같은 토큰이 반환될 수 있다고 설명한다. 코드 본문 일부는 공식 검색 결과로 확인했다. 단일 auth_token.py 직접 열람은 검색 도구에서 실패했으며 이를 실API 오류로 세지 않는다.

제휴법인90일·refresh_token 방식을 개인 인증에 적용하지 않았다. 토큰은 메모리에서만 보유하고 유효하면 재사용한다. 만료 이후에는 명시적인 authenticate 호출로만 재발급하며 요청을 새로 차감한다. 24시간을 상한으로 expires_in과 절대 만료일 중 이른 시각에서60초 여유를 뺀다. 시간대 없는 절대 만료 필드는 Asia/Seoul(+09:00)로 처리하며 실제 응답과의 일치 검증은 남는다. 시계 역행·잘못된 만료일·잘못된 토큰유형·오류 응답은 중단한다. 인증 실패·시세 인증 오류 이후 자동 재발급이나 자동 재시도를 하지 않는다. 초당1요청과 인증 분당1요청의 보수적 간격도 장부에서 확인한다. 더 엄격한 실제 계정 제한은 실행 전 확인한다.

[공식 API 개요](https://apiportal.koreainvestment.com/apiservice-summary)의 HTTPS9443·TLS1.2/1.3과 기본시세 분류를 적용했다. [국내 일봉](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/inquire_daily_itemchartprice/inquire_daily_itemchartprice.py), [해외 일봉](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/overseas_stock/dailyprice/dailyprice.py)의 기존 요청계획을 재사용한다. 원시세 옵션을 요청하더라도 확정 정규 종가/기업행위 처리까지 입증했다고 간주하지 않는다.

## 구현 파일
| 파일 | 기능 |
|---|---|
| providers/kis-https-stage22d.cjs | 고정 HTTPS 목적지, 인증 POST·두 가격 GET만 허용, TLS 검증, 원문을 노출하지 않는 통신 오류 처리 |
| providers/kis-live-stage22d.cjs | 서버 비밀 주입 콜백, 메모리 토큰·명시적 갱신·만료, 예산 예약/완료, 첫 국내005930 제한, 검증되지 않은 종가 반환 |
| providers/kis-ledger-stage22d.cjs | 기존 승인 장부 개방·검사, 실행 전체의 프로세스 잠금, 자동 생성/초기화 없음 |
| tests/kis-live-stage22d.test.cjs | 가짜 HTTPS 스트림 및 합성 토큰·가격·장부·프로세스 시험 |

기존 C의 합성 전용 정규화기를 real 플래그로 속여 재사용하지 않고 별도의 실제 응답 파서를 추가했다. 종목·거래소·통화는 허용목록과 고정 요청에서 바인딩한다. 국내 응답 종목코드가 제공되면 요청과 비교한다. 응답의 날짜·양수 가격·중복 거래일·KIS rt_cd를 검사한다. 응답이 종목/거래소/통화를 독립적으로 증명하지 못하는 한계 때문에 verified로 표시하지 않는다. 각 응답은 daily-close-unverified·adjustment unconfirmed·held true·realVerified false·signalEnabled false다. 독립 대조·기업행위·확정 종가 검증을 대체하지 않는다.

## 비밀과 통신 경계
사용자가 통제하는 서버의 안전한 비밀 저장소가 getCredentials 콜백으로 App Key/App Secret을 주입하는 인터페이스다. 비밀 저장소 자체는 이번에 연결하지 않았다. 키·토큰은 객체의 공개 속성이나 상태 반환값에 넣지 않는다. 인증 본문과 가격 HTTPS 헤더에서만 사용하며 URL·HTML·브라우저·로그·장부·GitHub로 보내지 않는다. 서버 라이브러리만 제공하고 웹 경로·CLI·자동 실행 명령·브라우저 키 입력 폼을 만들지 않았다. 문자열 메모리가 즉시 물리 삭제됨을 보장하지는 않으며 악성 프로세스/디버거/메모리 덤프까지 보호하는 구현은 아니다.

Node HTTP/TLS 디버그 및 TLS 키 로그 설정을 발견하면 거부한다. 신뢰할 수 없는 APM·프록시 TLS 복호화·프로세스 덤프·운영 서버 로그 수집 정책은 별도 검증해야 한다. 조회용 코드가 증권사 차원의 조회 전용 App Key를 만든다는 뜻은 아니다. 범용 주문 SDK와 계좌번호/잔고 API는 사용하지 않는다.

고정 도메인 openapi.koreainvestment.com:9443, 인증 /oauth2/tokenP 및 기존 두 일봉 경로만 전송한다. 임의 URL·호스트·TR·인자·키 추가를 거부한다. Node 기본 HTTPS는 리다이렉트를 따라가지 않으며3xx를 오류로 처리한다. 숨은 재시도·토큰 갱신·연속 페이지 처리는 없다. 전체 요청 타임아웃10초, JSON 크기256KiB 상한, 비JSON/압축 응답/중단 스트림은 거부한다. HTTP 상태 오류와 KIS rt_cd 오류를 구분하고 공급자 msg1·예외 원문은 외부에 반환하지 않는다.

각 요청의 HTTPS Agent는 keep-alive와 TLS 세션 캐시를 끄고 종료 시 정리한다. [Node 공식 proxyEnv 규격](https://nodejs.org/api/https.html)에 따라 기존 HTTP_PROXY/HTTPS_PROXY/NO_PROXY 설정과 소문자 설정을 상속한다. 프록시를 우회하거나 TLS 검증을 해제하지 않는다. Node22.21 또는24.5 이상 지원 계열이 필요하며 본 시험은24.22.1이다. 실제 프록시·인증서·DNS·KIS 연결은 미검증이다.

## 요청 예산·동시 실행
기존 createBudget/fileStore를 재사용한다. 총40회와 인증2회 한도를 유지한다. 자동 재시도는0회로 더 좁혔다. 명시적으로 재실행해도 같은 승인 장부의 사용 횟수에 더한다. 정상·실패·타임아웃·응답 불확실 요청 모두 반환 전에 차감하며 결과가 기록되지 않아도 reserved 상태로 남는다. 미해결 reserved가 있으면 다음 호출을 중단한다. 장부 개방 실패·쓰기 실패·리비전 충돌·완료 기록 실패도 차단하고 가격을 반환하지 않는다.

동일 승인 장부는 공급자·날짜·프로세스마다 새로 만들지 않는다. openLedger는 기존 절대경로의 개인 소유0700 디렉터리·0600 파일만 개방하며 자동 초기화/복구/교체 API를 제공하지 않는다. 실행 잠금은 클라이언트 close까지 유지한다. 다른 프로세스는 잠금을 얻지 못한다. 프로세스 강제 종료로 남은 잠금은 자동 삭제하지 않는다. 장부와 요청 결과를 사람이 확인한 후 같은 사용 횟수를 보존하는 복구가 필요하다. 현재 다른 공급자 전송 기능은 없으며, 추가할 때도 같은 중앙 장부를 공유해야 한다.

신뢰 디렉터리·POSIX 로컬 파일시스템을 전제로 한다. 관리자에 의한 장부 삭제/재생성, 다른 경로를 지정한 별도 실행, 공유 네트워크 파일시스템·장애 전원차단까지 강제 통제하는 기능은 아니다. 실제 호출 이력과 장부 경로는 최초 연결 전에 확정해야 한다. 실제 투자/백업 저장소와 이 장부를 섞지 않는다.

## 안전한 첫 조회
최초에는005930 최근 거래일 일봉만 허용한다. 서버가 제공한 시장·시간대·거래일·장마감 시각·달력 출처를 검사하며, 열린 장·미래/14일 초과 거래일·잘못된 입력을 거부한다. 달력의 내용은 신뢰된 서버 책임이며 모듈 자체가 거래소 달력을 조회하지 않는다. 국내 최초 응답 성공 이후 미국/ETF 후보를 기술적으로 처리할 수 있으나 이번 단계의 실제 실행 계획은 첫 국내1종목까지만이다. 숫자를 받아도 독립 검증 또는 신호 활성화를 뜻하지 않는다.
