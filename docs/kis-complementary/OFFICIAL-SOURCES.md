# KIS 보조 시세: 공식 자료 확인 기록

확인일: 2026-11-09 (UTC). 공개 문서만 열람했다. 실제 시세 API 호출, 로그인, 키 접근, 가입, 외부 연락, 클라우드 생성·배포는 하지 않았다. GitHub 링크는 확인 당시 `main`이며 커밋 고정 인용은 아니다. 아래 내용은 실행 승인이나 비용 0원의 보장이 아니다.

## 1. 공식 본문 직접 확인

- [국내 현재가 호출 샘플](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/inquire_price/inquire_price.py): 경로 `/uapi/domestic-stock/v1/quotations/inquire-price`, TR `FHKST01010100`. 시장 입력은 `J=KRX`, `NX=NXT`, `UN=통합`. REST 현재가와 웹소켓 실시간 수신을 구별한다.
- [국내 응답 매핑](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/inquire_price/chk_inquire_price.py): `stck_prpr`는 현재가, `stck_sdpr`는 기준가다. 확인한 매핑에 현재 체결시각·지연 여부 확정 필드는 보이지 않는다. 샘플 매핑 확인은 실제 응답 검증과 다르다.
- [해외 현재체결가 호출 샘플](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/overseas_stock/price/price.py): 경로 `/uapi/overseas-price/v1/quotations/price`, TR `HHDFS00000300`, 입력 `AUTH/EXCD/SYMB`. 실전·모의 분기가 있지만 사용자 계정의 지원 범위·품질·권한을 검증한 것은 아니다.
- [해외 응답 매핑](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/overseas_stock/price/chk_price.py): `last=현재가`, `base=전일종가`, `zdiv=소수점자리수`. `EXCD`는 NAS/NYS/AMS와 주간 BAQ/BAY/BAA 등을 구별한다. `rsym`의 이름만으로 실시간 권한이나 무지연을 판정할 수 없다. 확인한 매핑에는 체결시각·지연 여부 필드가 없다.
- [해외 상세 응답 매핑](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/overseas_stock/price_detail/chk_price_detail.py): `curr=통화`, `last=현재가`, `base=전일종가`, `t_rate=당일환율`, `t_xprc=원환산당일가격`. 현지통화 현재가와 원환산가격을 혼용하지 않는다.

## 2. 공식 사이트 검색 색인에서만 확인

아래 페이지의 직접 열람 결과는 JavaScript 본문이 비어 있었다. 검색 색인에서 확인한 내용을 원문 직접 재검증 완료로 취급하지 않는다.

- [API 호출 유량 공지](https://apiportal.koreainvestment.com/community/10000000-0000-0011-0000-000000000001/post/d0d1a83f-6f8d-4437-9700-6d26702fd989): 색인 본문은 **2026-04-20 기준** 실전 18건/초, 모의 1건/초, 계좌 단위 제한을 명시한다. 웹소켓은 1세션, 상품 합산 41건이다. 이는 현재 계정의 적용 한도나 이벤트·예외를 확인한 결과가 아니며, 과거 20TPS를 현행 확정값으로 쓰면 안 된다.
- [FAQ 목록](https://apiportal.koreainvestment.com/community/10000000-0000-0011-0000-000000000002): 2026-10-06 「Open API 데이터 이용 범위 및 사용 정책 안내」의 존재를 확인했다. 게시글 본문은 확보하지 못했다.
- [FAQ 색인](https://apiportal.koreainvestment.com/faq): 2026-06-22 「Open API - 미국주식시세 이용시 유의사항」의 존재를 확인했다. 게시글 본문은 확보하지 못했다.

## 3. 미확인 및 계정별 확인사항

현행 전체 무료 여부, 사용자 계정의 미국 실시간 시세 권한·신청·비용, 시세 전용 키 제한, IP 제한, 1인 서버 중계의 약관상 허용, 최신 데이터 이용 정책의 적용은 미확인이다. 제휴기관 사용자 약관을 개인 개발자 약관으로 대신 적용하지 않는다. 공식 샘플 존재를 모든 해외 시세의 실시간·무료 제공 근거로 삼지 않는다.

최소 다음 단계는 이미 받은 약관·회신을 먼저 재사용하고, 실제 연결을 결정할 때 부족한 최신 정책과 계정 조건만 확인하는 것이다. 동일한 포괄 캡처를 반복 요청할 필요는 없다. 확인·문의·키 사용·실제 호출에 대한 지속적 승인을 추정하지 않는다.

## 4. HAS 설계 경계

- GAS를 유지하고 KIS는 추가 공식 공급자 후보로만 둔다. GAS는 전달수단이므로 독립 공급자라고 간주하지 않는다. KIS의 서로 다른 API 역시 독립 출처 두 개가 아니다.
- 공급자·API·시장/거래장소·통화·가격 종류·시장 기준시각·수신시각·지연 상태·계정 권한을 분리한다. 정보가 없으면 미확인으로 둔다. 수신시각을 시장 체결시각으로 대체하지 않으며, 최근 수신만으로 실시간 승격하지 않는다.
- 국내 `J/NX/UN` 및 해외 정규/주간 거래소 코드를 자동 대체하거나 추정 매핑하지 않는다. 교차검증은 동일 종목·시장·통화·가격 종류·비교 가능한 시각과 검증된 출처 관계가 필요하다.
- 모바일 단독 사용을 전제로 하되 실전 키를 브라우저, localStorage, GitHub, 백업에 넣지 않는다. 주문·자동매매 경로를 만들지 않는다.
- 개인 중계는 미승인 후보이며, 실제 키 입력·사용, 라이브 호출, 유료 이용, 클라우드 생성·변경·배포는 별도 명시 승인 및 필수 안전 절차 전까지 수행하지 않는다. 이 문서는 API 런타임 설정을 활성화하지 않는다.
