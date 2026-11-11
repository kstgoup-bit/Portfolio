# FX 비교 적합성 별도 검토

확인일: 2026-11-09 UTC. **설계 검토만 완료, FX 비교 구현·실제 데이터 검증은 하지 않았다.** 주식 종가 비교기에 FX를 추가하지 않는다. GAS는 유지하며 KIS는 추가 공급자 후보다. 모바일 단독 사용 전제와 기존 승인 경계를 유지한다. 키·로그인·실제 API·클라우드·운영·주문·자동매매·커밋 작업 없음.

## 1. 공식 근거와 미확인 경계

공식 저장소의 공개 본문을 직접 확인했다. 아래 링크는 조회 당시 main이며 커밋 고정본은 아니다. 샘플 존재는 현행 계정 지원·실시간 권한·무료 이용을 증명하지 않는다.

- [공식 호출 샘플](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/overseas_stock/inquire_daily_chartprice/inquire_daily_chartprice.py): `/uapi/overseas-price/v1/quotations/inquire-daily-chartprice`, TR `FHKST03030100`. `FID_COND_MRKT_DIV_CODE=X`가 환율, `FID_PERIOD_DIV_CODE=D`가 일 단위다. 시작·종료 입력은 YYYYMMDD이며 `FID_INPUT_ISCD`는 공식 마스터를 참조하도록 안내한다. 이 검토에서는 특정 통화쌍의 마스터 코드·방향·단위를 확인하지 못했다. 임의 USD/KRW 코드를 넣지 않는다.
- [공식 응답 표시 샘플](https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/overseas_stock/inquire_daily_chartprice/chk_inquire_daily_chartprice.py): `stck_bsop_date`는 영업일자, `ovrs_nmix_prpr`는 현재가, `ovrs_nmix_prdy_clpr`는 전일 종가로 매핑한다. 시가·고가·저가와 변경 여부도 있지만 이 이름만으로 FX 일별 확정 종가나 fixing을 인증할 수 없다. 표시 코드의 소수점 두 자리 반올림을 FX 정밀도 규칙으로 채택하지 않는다.

공식 샘플의 문서·필드 매핑 확인과 실제 응답 확인은 다르다. 이 두 본문에서 FX별 기준/표시 통화, 1 또는 100 단위, 관측시각·시간대, 마감/fixing 정의, bid/ask/mid, indicative/실거래 가능 여부, 은행 매매기준율 여부, 원천 공급자, 잠정/확정·정정 정책을 확정하지 못했다. 미확인은 없는 것으로 단정하지 않는다. 공식 포털 최신 세부 정의와 정책은 미확인이다. 검색에 노출된 제3자 자료를 공식 매핑 근거로 쓰지 않았다. 기존 [공식 자료 확인 기록](../kis-complementary/OFFICIAL-SOURCES.md)의 포털 색인 전용 근거는 본문 직접 확인으로 승격하지 않는다.

## 2. 왜 주식 종가 규칙을 그대로 쓰면 안 되는가

아래는 비교 설계 원칙이며 KIS가 특정 환율을 이렇게 산출한다는 주장이 아니다.

- 같은 YYYYMMDD와 일 단위 데이터라도 같은 시각·시장·산출 방식이라는 뜻이 아니다. 서울 영업일, 다른 지역 마감, 특정 fixing, 하루 평균, 은행 고시 시각을 자동 등치하지 않는다.
- 매수/매도 호가, 중간값, 최종 체결, 참고 환율, 은행 매매기준율, 현찰·송금 환율은 경제적 의미가 다르다. 가격이 비슷해도 동등하거나 거래 가능하다는 증거가 아니다.
- `receivedAt`은 수신시각이다. `observedAt` 또는 fixing 시각을 대체하지 않는다. 최근 수신, REST 성공, 일별 차트 존재만으로 실시간으로 표시하지 않는다.
- USD/KRW라는 문자열만 믿지 않는다. 계약상 `baseCurrency=USD`, `quoteCurrency=KRW`, `baseUnits=1`이면 값은 1 USD당 KRW로 정의한다. 100 JPY당 KRW는 명시된 단위로만 정규화한다. 이는 설계 예이며 KIS 실제 단위의 확인 결과가 아니다.
- 역수 변환 시 bid와 ask는 서로 바뀐다. 역수의 산술 mid와 원 mid의 역수는 일반적으로 동일하지 않다. 직접 통화쌍과 교차환율도 구분하며 자동 역수/교차환율 합성을 하지 않는다.
- GAS는 전달 경로다. GAS 원천과 KIS 원천이 같거나 불명확하면 독립 출처 2개로 인정하지 않는다.

## 3. 향후 별도 FX 계약의 최소 항목

1. **식별:** schemaVersion, provider, upstreamProvider, sourceRelationship 및 그 근거, endpoint/seriesId, 원본 instrumentCode와 매핑 근거·버전.
2. **단위:** baseCurrency, quoteCurrency, baseUnits, 원본 값·단위, 정규화 값, 변환식·정밀도·반올림 정책. 값은 유한한 양수로 검증하고 통화·단위 미확인 시 계산 중지.
3. **가격 의미:** rateKind(bid/ask/mid/last/fixing/average/bank-reference 등), indicative/executable/unknown, 현찰·송금 등 상품 구분, onshore/offshore·spot/forward 및 필요 시 tenor/valueDate, 산출 제공자와 방법론 식별자. 단순 이름 일치만으로 동등 판정 금지.
4. **시간:** sourceBusinessDate, sourceTimezone, observedAt 또는 fixingWindow와 산출 정의, publishedAt(있으면), receivedAt, requestedDate, actualDate, 휴일·지연·전일 대체·정정 상태, 확정 여부. 없는 필드는 unknown이며 자정이나 수신시각을 만들어 넣지 않는다.
5. **추적:** 공식 근거 URL·확인일·버전, 가공 단계, 원본의 비밀정보 없는 최소 표본, 품질·미확인 이유. 개인정보·키·토큰·계좌정보는 포함하지 않는다.

비교를 허용하려면 쌍·방향·단위·상품·가격 의미·산출 기준·기준일/관측 구간·확정 상태가 동일하거나 별도 검토로 명시적으로 동등해야 한다. 원천 독립성이 검증되어야 교차검증이라고 부른다. 그 전에는 `기준 미확인` 또는 `비교 불가`와 이유를 표시한다. 날짜만 같은 값을 억지로 정렬하거나 전일 값을 당일 값으로 채우지 않는다. 모든 조건을 통과한 뒤에만 사전 정의된 소수 정밀도와 기준값에 따른 차이 계산을 허용한다. 작은 차이를 신뢰성·실시간·거래 가능성 보증으로 표현하지 않는다.

## 4. 현재 막힌 부분과 다음 최소 확인

- **KIS 의미 정의 미확인:** 통화쌍 마스터, quote 단위·방향, FX별 가격 종류, 시간대·fixing/마감 시점, 잠정/확정·정정 규칙과 원천을 공식 근거로 확인해야 한다. 실제 호출을 통해 추측하지 않는다.
- **기존 GAS 연결 미확인:** 기존에 받은 자료를 먼저 재사용한다. 원천 공급자·필드·단위·가격 종류·기준일/시각이 남아 있는 비밀정보 제거 표본과 관련 변환 코드의 최소 부분이 필요하다. 이 검토에서는 GAS 실제 표본을 확인하지 않았고 사용자에게 직접 자료를 요청하지 않았다. 포괄 캡처나 약관 전체를 반복 요청하지 않는다.
- **정책·계정 조건 미확인:** 현행 이용 범위·비용·계정 권한 확인은 실제 연결 결정 시 별도로 남는다. 문서 검토는 키 입력·라이브 호출·중계 생성·배포 승인이 아니다.

상태: 문서 검토 완료, FX 구현 보류. 도구 접근 거부가 발생한 작업은 없다. 실데이터 적합성 판정은 필요한 의미·원천 근거가 없어 수행하지 않은 상태다. 나중에 별도 구현을 결정하면 방향 역전, 100단위, bid/ask 뒤바뀜, 날짜 경계·휴일 전일 대체, 잠정값, 같은 원천, 시각·단위 누락을 오프라인 실패 사례로 먼저 검증한다.
