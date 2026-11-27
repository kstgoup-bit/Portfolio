# 다비 최종 인계 요약 (PDF 원본: 순태씨가 2026-11-26 전달, 3쪽 "HAS / 공식 데이터 명세 인계")
정리: 클로. 다비 자료는 **검토 입력**이며, 코드 반영은 지피 검토와 순태씨 승인 후.

## 1. KIS (공식 GitHub 예제 기준 응답 키)
| 항목 | 해외(HHDFS76200200) | 국내(FHKST01010100) |
|---|---|---|
| PER/PBR | perx/pbrx | per/pbr |
| EPS/BPS | epsx/bpsx | eps/bps |
| 시가총액 | tomv | hts_avls |
| 상장주식수 | shar | lstn_stcn |
- 해외 mcap은 자본금(시가총액 아님), curr는 통화, 국내 stac_month는 결산 월.
- **미확인**: 단위 배율, TTM인지 최근 결산인지, EPS 기본/희석, 갱신 시점·지연, 초당 제한(공지 본문 못 읽음).
- 한도: 150건/일은 HAS 자체 설정. 두 API는 한 요청에 한 종목 → 전송 시도마다 1건 차감 권고(재시도 별도, 캐시 제외). 수신 시각을 지표 기준일로 쓰지 말 것.

## 2. OpenDART (공식 가이드 기준)
- fnlttSinglAcntAll: crtfc_key·corp_code(8자리, 종목코드 아님)·bsns_year·reprt_code(11011 사업, 11013 1Q, 11012 반기, 11014 3Q)·fs_div(CFS/OFS) 모두 필수. 2015년 이후.
- status: 000 정상, 013 없음(결측, 0 아님), 020 제한 초과(해당 키 수집 중단), 010/011/012 키·IP 문제, 014 파일 없음, 100 필드 오류, 800 점검. 20,000건은 일반 안내일 뿐 보장 한도 아님.
- 분·반기 IS/CIS는 thstrm_amount=3개월, thstrm_add_amount=누적. 현금흐름·재무상태표에 같은 환산 금지.
- corpCode.xml은 **ZIP 바이너리**(안에 XML). stock_code↔corp_code는 문자열로 매핑(선행 0 보존).
- account_id 후보는 클로 어댑터와 대체로 일치. **차이 1건**: 다비 `ifrs-full_PurchaseOfPropertyPlantAndEquipment` vs 클로 어댑터 `ifrs-full_PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities`. 실제 응답으로 어느 쪽인지 확인 전까지 어댑터 미변경(두 후보 모두 인식하는 방안은 지피 검토 후 제안). 실제 회사 응답과 1:1 일치는 다비도 미확인.

## 3. 이익 전망·업종 평균(선택 조사)
- 미국 선행 EPS 후보: Alpha Vantage EARNINGS_ESTIMATES(무료 25건/일, 약관 개인·비상업). 무료 키 실제 권한·한국 커버리지 미확인.
- 업종 PER: NYU Damodaran 미국 업종표(2026-01 기준 공개 참고치, 자동 재수집 권리 미확인). KRX 웹 PER은 공식 API·자동 이용 범위 미확인(약관 비상업).
- 결론: 무료로 안정적인 선행 EPS·업종 평균은 **아직 확정 출처 없음** → 설계 1단계(자기 과거 분포 대비)만 진행.

## 4. 설계 반영 메모
- 증권사 PER은 대조용·기준 표시 필수(TTM/결산 미확인이므로 "기준 미확인" 표시, 허용 오차 대조는 기준 확인 후).
- 필요 후속: KIS 필드 단위 실측(실제 호출 1회씩), DART corpCode ZIP 처리(GAS Utilities.unzip) 설계, account_id 실응답 확인.
