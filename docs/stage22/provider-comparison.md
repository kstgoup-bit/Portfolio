# 22단계 공급자 공식 조건 비교
조사일 2026-10-30 한국시간. 공개 공식 문서만 열람. 가입·키 발급·샘플 API·가격 API 호출 0. 페이지에 우연히 표시된 가격은 검증 자료로 사용하지 않음. 문서 열람/검색과 시세 API 호출을 구분한다.

| 항목 | KIS 한국투자증권 | Twelve Data | KRX OPEN API |
|---|---|---|---|
| 공식 API·시장 | REST/WS, 국내·해외 | REST/WS, 미국·한국 포함 글로벌 | 공식 국내 주식·ETF 일별자료, 미국 없음 |
| 종가와 지연 | 기간별 일봉 제공. 실시간/지연/통합장 여부는 엔드포인트별 확인 필요 | 미국 실시간·EOD, 한국 XKRX EOD·Pro 이상 시장 목록에 표시 | 일별매매정보. 실시간 서비스로 간주 금지 |
| 기준시각 | 응답 거래일·시장선택 확인 필요, 취득시각은 로컬 UTC 별도 기록 | 거래소 시간대 메타, 일봉 datetime과 취득시각 구분 | BAS_DD 등 필드 초안. 게시 지연·확정 시각 미확인 |
| 기업행위 | 국내 공식 예제 FID_ORG_ADJ_PRC 0 수정/1 원주가, 시장 J KRX / NX NXT / UN 통합. 해외 MODP 의미 상세 미확인 | adjust none/splits/dividends/all, 기본 splits. 비교 시 명시적으로 none 선택 | 원주가/수정주가 명세 확정 미완료. 조정주가라고 추정하지 않음 |
| 최신 호출 한도 | 2026-03 신규 고객 제한, 2026-04 기준 유량, 2026-09 제한 공지 존재. 일부 본문 미노출/로그인 제한. 현재 계정별 숫자는 **미확인**. 오래된 18/20 TPS를 확정값으로 사용하지 않음 | Basic 8 credits/min, 800/day. 엔드포인트·종목별 credit 가중치. 유료는 선택 credit 등급별 | 약관 제8조: 키당 1일 10,000회 이하. 초과 중단 가능 |
| 요금 | API 기본 무료 안내는 이전 단계 조사값. 이번 공식 본문에서 현재 국내/해외 비용표 완전 확인 못함 → **미확인**, 0원 확정 후 신청 | Basic $0. 열람 화면 Grow $79, Pro $229, Ultra $999/month 표시. 선택 등급별 달라 최저요금으로 단정 금지 | 열람 약관/소개에서 금액표 확인 못함 → **미확인**. '비상업'을 무료 보증으로 해석하지 않음 |
| 개인용 표시 | 계좌 보유 개인의 자기 자산 투자 목적 허용 안내, 제3자 제공 불가 | 내부 표시와 내부 비표시 계산은 요금제/추가권리별 구분. Basic은 시험용 제한; 실제 개인 앱 표시·자동 대조 가능 여부 별도 확정 | 비상업 목적, 결과 화면에 한국거래소 통계정보 사용 표시, 제3자 제공 금지 |
| 저장·해지 후 | 개인 시세 영구보존·백업·다른 공급자 대조에 대한 직접 조항 **미확인** | 약관 2/16조: 구독·문서·원천 데이터 제한 범위 내 보존, 종료 후 30일 이내 데이터 삭제 원칙. 구체 보존기간/무료 처리권은 **미확인** | 계약 종료 뒤 정보 이용 불가. 구체 보존·백업 삭제기한 및 대조 허용 조항은 **미확인** |
| 독립 대조 허용 | 자기자산 이용 범위만으로 일괄 허용 추정하지 않음 → **미확인** | 경쟁상품 결합 제한 있음. 이 개인용 10종목 대조 허용은 **미확인** | 비상업 가공 가능성과 개별 대조 목적 허용은 구분 → **미확인** |
| 키 관리 | APP Key/Secret으로 접근토큰, 공식 설명 24시간 유효. 브라우저/로그에 전달 금지 | Authorization 헤더 방식 공식 지원. 쿼리 키 방식은 사용 금지 설계 | AUTH_KEY 요청 헤더. 키 발급 후 API별 활용 승인 필요, 1년 이용·연장 |

## 조건부 추천과 진행 판단
1순위 후보 KIS(두 시장 통합), 한국 대조 후보 KRX, 미국 대조 후보 Twelve Data. **현재 10종목 전부에 대해 비용·보존·대조 권리가 확인된 조합은 없다.** 무료 실검증을 반드시 완수할 수 있다고 약속하지 않는다. 한국 XKRX가 Twelve Data 유료 시장에 포함돼 있어 무료 Basic으로 한국 전 종목을 검증할 수 있다고 주장하지 않는다.

KIS/TD/KRX라는 서비스명이 다르더라도 같은 상위 거래소 자료를 전달할 수 있다. 비교 경로가 다름과 원천 데이터가 독립적임을 구분하고, 공급 경로·정규 종가 정의·타임스탬프를 기록한다. 동일 원천의 동일 오류 가능성을 남은 위험으로 명시한다.

## 공식 근거와 열람 한계
- KIS 소개: https://apiportal.koreainvestment.com/about-open-api (검색 본문 확보, 직접 페이지는 일부 동적 본문 미노출)
- KIS 이용안내: https://apiportal.koreainvestment.com/about-howto
- KIS 공지: https://apiportal.koreainvestment.com/community/10000000-0000-0011-0000-000000000001 (공식 검색 목록에 2026-09-16 제한 공지; 일부 직접 열람 시간초과)
- KIS 국내 공식 예제: https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/inquire_daily_itemchartprice/inquire_daily_itemchartprice.py
- KIS 해외 공식 예제: https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/overseas_stock/dailyprice/dailyprice.py
- 공개 PDF '제휴 이용기관_사용자' 약관은 개인 직접 이용약관으로 대체하지 않음: https://file.koreainvestment.com/updata/namo/오픈API서비스이용약관_전문.pdf
- Twelve 약관(2026-01-01): https://twelvedata.com/terms
- Twelve 요금: https://twelvedata.com/pricing
- Twelve 한국시장: https://twelvedata.com/exchanges?country=South+Korea
- Twelve API/헤더/조정: https://twelvedata.com/docs
- KRX API 약관(2025-12-26 시행): https://openapi.krx.co.kr/contents/OPP/INFO/OPPINFO002.jsp
- KRX 이용 절차: https://openapi.krx.co.kr/contents/OPP/INFO/OPPINFO003.jsp
- KRX 서비스 목록: https://openapi.krx.co.kr/contents/OPP/INFO/service/OPPINFO004.cmd
- KRX 주식/ETF 명세 화면은 공개 필드표가 비어 있어 실스키마 미검증. sample/test 버튼 실행 안 함.

## 장애·보안 운영 설계 (미실행)
- 조회는 날짜·거래소·종목 허용목록과 GET 시세 경로만. KIS 인증 토큰 발급 POST는 B 승인 후 인증 경로만 별도 허용, 주문·계좌/잔고 API 제외.
- 10초 타임아웃, 최대 2회 재시도. 401/403은 재시도하지 않고 정지. 429는 Retry-After와 예산을 준수; 60초 초과/값 불명은 자동 대기·호출 대신 정지. 502/503/504만 지수 간격.
- 유효한 이전 가격으로 실패를 덮지 않고 검증 보류. 호출 장부에는 종목·날짜·공급자·상태만, URL/헤더/본문/키/공급자 오류 원문 로깅 금지.
- 공급자 약관 보존과 사용자 투자기록 백업을 분리한다. 가격 캐시 보존기한이 끝나도 거래 원장을 지우지 않음. 실제 분리 저장 구현은 B 범위 검토 후, 기존 저장소 자동 이전 없음.
