# KIS daily-price source evidence and unresolved gaps

Reviewed 2026-11-09, read-only, using only the official `koreainvestment/open-trading-api` GitHub samples below. No sample was executed, no KIS endpoint called, and no login, key, order, deployment, or cloud change occurred. GAS remains in place; KIS is an additional potential source.

## Confirmed sample mappings

### Domestic historical daily bars

- Endpoint: `/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice`; TR ID `FHKST03010100`.
- `FID_PERIOD_DIV_CODE=D` selects daily bars. `FID_INPUT_DATE_1` and `FID_INPUT_DATE_2` are start/end dates. The sample describes a maximum of 100 records per call.
- `FID_COND_MRKT_DIV_CODE`: `J=KRX`, `NX=NXT`, `UN=integrated`. These must not be silently treated as the same venue.
- Adjustment switch: `FID_ORG_ADJ_PRC=1` means original/raw price; `0` means adjusted price.
- Test mapping labels `stck_bsop_date` as `주식 영업 일자` and `stck_clpr` as `주식 종가`. These are the candidate daily-row date/close fields; the wrapper returns `output2` as the historical array.
- Do not substitute `stck_prpr` (`주식 현재가`) or `stck_prdy_clpr` (`주식 전일 종가`) from the combined mapping for the target dated row.

Sources:
1. https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/inquire_daily_itemchartprice/inquire_daily_itemchartprice.py
2. https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/inquire_daily_itemchartprice/chk_inquire_daily_itemchartprice.py

### Overseas historical daily bars

- Endpoint: `/uapi/overseas-price/v1/quotations/dailyprice`; TR ID `HHDFS76240000`.
- Test documentation: `GUBN=0` daily, `1` weekly, `2` monthly. Its executable example uses `2`, so copying that example unchanged would request monthly bars.
- `BYMD` is the reference date in YYYYMMDD; blank defaults to today according to the test documentation. An explicit request date is not proof of the returned row's trading date or finality.
- Adjustment switch: `MODP=0` means adjustment not reflected; `1` means adjustment reflected. This is the opposite numeric convention to the domestic switch.
- Test mapping labels `xymd` as `일자(YYYYMMDD)` and `clos` as `종가`. These are the candidate daily-row date/close fields. The wrapper processes both `output1` and `output2`; the shared test mapping is not a formal raw-response schema or captured response.
- Documented exchange codes include `NYS` (New York), `NAS` (Nasdaq), and `AMS` (Amex). Map venue explicitly rather than copying a ticker-only label.

Sources:
3. https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/overseas_stock/dailyprice/dailyprice.py
4. https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/overseas_stock/dailyprice/chk_dailyprice.py

## Not established by these four files

- They do not show a provider publication timestamp, an exchange observation timestamp, an explicit finalized-bar flag, or a documented time after which the current day's bar is final.
- The labels `종가` / `주식 종가` do not by themselves establish the normalized definition `official-regular-close`, an official closing-auction price, or exclusion of extended-session/revision effects.
- `mod_yn` is labeled only `변경 여부` in the domestic test. It must not be promoted to a finality indicator.
- Neither a requested date nor a returned date proves that the session was valid, latest, completed, or aligned with GAS. An authoritative venue calendar and independently supported close semantics remain necessary.
- These are official source-code examples, not observed market data or a comprehensive API specification. Absence here does not prove that no other KIS documentation or response can supply the missing evidence. URLs use mutable `main`; recheck before any real adapter implementation.

## Consequence for the local normalized contract

The existing comparison core accepts synthetic or normalized declarations; it is **not a raw KIS adapter**. Do not populate `completion=final`, `definition=official-regular-close`, or `publishedAt` solely from these mappings. Do not invent `publishedAt` or `observedAt` from request/receipt time, the wall clock, the trading date, or scheduled market close. A genuine locally recorded receipt time can describe `retrievedAt` only, not the market event/publication time.

The current contract permits absent `publishedAt`; it requires retrieval at or after scheduled close and checks publication chronology when publication is supplied. Optional `observedAt` stays absent unless real observation evidence supports it. Mandatory typed `closeEvidence` declares the official-close definition and finality; unknown or missing evidence is withheld independently of timestamps. These labels are declarations, not authenticated proof, and `finalityVerified` remains false.

Optional publication time does not authorize a raw KIS adapter or make a current daily row final. Documented provider official-close semantics and finality evidence are still missing from the reviewed files; neither receipt after scheduled close nor a guessed grace period supplies them. Matching prices and dates do not resolve these gaps or establish source independence. No live freshness or signal usability is demonstrated by this review.
