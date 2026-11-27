# 다비(dots)에게: 11월 30일까지 마지막 요청 (구독 종료 예정)

순태씨 안내(2026-11-26): 다비는 11월 말일까지만 쓴다. 아래는 **클로가 직접 못 하는 일(공식 문서 페이지를 읽을 수 없음)** 만 모았다. 코드·앱·저장소 변경, 키·주소·이메일 기재는 요청하지 않는다. 결과는 순태씨가 받아 `docs/team/DAVI-FINAL-20261130.md` 형식의 문서(또는 대화 내용)로 전달하면 클로가 반영한다. 모르면 "확인 못 함"이라고 쓸 것(추측 금지).

## 요청 1 (우선): 한국투자증권 KIS Open API 공식 명세 확인 — 밸류에이션용
공식 포털(apiportal.koreainvestment.com) 또는 공식 GitHub(koreainvestment/open-trading-api)에서:
1. **해외주식 현재가상세**(HHDFS76200200) 응답의 PER·PBR·EPS·BPS·시가총액·상장주식수에 해당하는 필드 이름·단위·기준(최근 12개월인지 결산 기준인지)·갱신 시점.
2. **국내주식 현재가**(FHKST01010100) 응답의 PER·PBR·EPS·BPS·시가총액·상장주식수 필드 이름·단위·기준.
3. 위 호출이 KIS 일일 호출 한도(우리 설정 150건, 국내·해외 공유)에서 1건으로 세는지, 초당 제한은 얼마인지.
클로가 가진 정보는 제3자 글뿐이라 미검증이다(CLAUDE-ASK-GPT-VALUATION-SOURCES-20261126.md 참고).

## 요청 2: OpenDART 공식 명세 확인 — 국내 재무용
공식 사이트(opendart.fss.or.kr)에서 **단일회사 전체 재무제표**(fnlttSinglAcntAll) 개발가이드:
1. 요청 변수(corp_code, bsns_year, reprt_code 11011, fs_div CFS/OFS)와 응답 변수(account_id, account_nm, thstrm_amount, sj_div 등) 이름.
2. 응답 status 코드 의미(000 정상, 013 조회 없음, 020 한도 초과 등)와 일일 요청 한도.
3. 연결재무제표에서 매출액·영업이익·당기순이익·영업활동현금흐름·유형자산 취득·자본총계·현금및현금성자산의 account_id 값이 IFRS 표준 태그와 같은지(예: ifrs-full_Revenue, dart_OperatingIncomeLoss).
4. corp_code 목록(고유번호) 내려받는 공식 방법(파일 형식).
클로의 어댑터는 제3자 문서 기준이라 미검증이다(gas/has-dart-fundamental.gs, has/dart-facts-adapter.js).

## 요청 3 (선택, 시간이 되면): 이익 전망·업종 평균 무료 출처
미국·한국 개별 종목의 선행 EPS(이익 전망)나 업종 평균 PER을 **무료·합법·안정적으로** 얻을 수 있는 출처가 있는지. 약관(자동 수집 허용 여부)과 갱신 주기 포함. 없으면 "없음"으로.

## 하지 말 것
주문·매매, 비밀값(키·토큰·이메일·GAS 주소) 기재, 앱 코드 수정, 과거 검토 기록 수정.
