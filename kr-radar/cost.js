/* KST (stage10): offline call-volume and cost scenarios. Pure arithmetic over documented limits; no provider is called.
   Billing units that the official page does not state are flagged as uncertain, never assumed. */
'use strict';
const TRADING_DAYS_PER_MONTH = 22; // upper-bound assumption (a month has ~20-22 sessions)
const LIMITS = Object.freeze({
  'twelve-data-basic': { perDay: 800, perMinute: 8, unit: '심볼당 1 크레딧(문서)', source: 'https://twelvedata.com/docs', monthlyUsd: 0, displayAllowed: false, note: 'Basic은 비표시 전용이라 화면 표시에는 부적격' },
  'fsc-stock-price': { perDay: 10000, perMinute: null, unit: '호출 단위(한 호출이 몇 심볼·몇 일자를 주는지 원문에 없음 → 불확실)', source: 'https://www.data.go.kr/data/15094808/openapi.do', monthlyUsd: 0, displayAllowed: null, note: 'T+1, 수정주가 미확인' },
  'krx-open-api': { perDay: 10000, perMinute: null, unit: '인증키당 호출(데이터 항목 원문에 없음 → 불확실)', source: 'https://openapi.krx.co.kr/contents/OPP/INFO/OPPINFO005.jsp', monthlyUsd: null, displayAllowed: null, note: '요금 원문에 없음' }
});
// Published monthly prices that were actually read (USD, before tax). Per-minute limits per tier are NOT stated in what was read.
const PRICE_POINTS = Object.freeze([
  { provider: 'twelve-data-personal', tier: 'Grow', usdMonth: [29, 49, 79], source: 'https://twelvedata.com/pricing.md', unknown: ['분당 한도 수치', '한국 지원', '약관 문구 불일치'] },
  { provider: 'twelve-data-personal', tier: 'Pro', usdMonth: [99, 149, 229], source: 'https://twelvedata.com/pricing.md', unknown: ['분당 한도 수치'] },
  { provider: 'massive-individual', tier: 'Stocks Advanced', usdMonth: [199], source: 'https://massive.com/pricing', unknown: ['지연·조정·한도·캐시', '한국 미지원 추정 아님: 원문에 없음'] }
]);
function estimate({ symbols, benchmarks = 3, crossCheck = true, backfill = false, providers = Object.keys(LIMITS) } = {}) {
  if (!Number.isInteger(symbols) || symbols < 1 || symbols > 1000 || !Number.isInteger(benchmarks) || benchmarks < 0) throw new Error('입력 오류');
  const primary = symbols + benchmarks;
  const second = crossCheck ? primary : 0;
  const daily = primary + second;
  const out = { symbols, benchmarks, crossCheck, requestsPerDay: daily, requestsPerMonth: daily * TRADING_DAYS_PER_MONTH, backfillOneTime: backfill ? primary + second : 0, assumptions: ['일봉 1회/일, 종목당 1요청', '벤치마크 ' + benchmarks + '개', crossCheck ? '2차 출처가 동일 요청 수를 추가' : '교차검증 없음', '월 ' + TRADING_DAYS_PER_MONTH + '거래일(상한 가정)'], fits: {} };
  for (const id of providers) {
    const l = LIMITS[id]; if (!l) throw new Error('알 수 없는 공급자: ' + id);
    // The second source is a different provider, so each provider sees only its own share.
    const perProvider = primary;
    out.fits[id] = { requestsPerDay: perProvider, limitPerDay: l.perDay, fitsDaily: perProvider <= l.perDay, minutesAtPerMinuteLimit: l.perMinute ? Math.ceil(perProvider / l.perMinute) : null, uncertainUnit: /불확실/.test(l.unit) };
  }
  return out;
}
function scenarioTable() {
  const rows = [];
  const by = { US: ['twelve-data-basic'], KR: ['fsc-stock-price', 'krx-open-api'] };
  for (const n of [5, 10, 100, 200]) for (const m of ['US', 'KR']) rows.push({ market: m, ...estimate({ symbols: n, benchmarks: 3, providers: by[m] }) });
  return rows;
}
module.exports = { TRADING_DAYS_PER_MONTH, LIMITS, PRICE_POINTS, estimate, scenarioTable };
