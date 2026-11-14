'use strict';
/* SYNTHETIC / TEST-ONLY. 실제 코스피200·나스닥100·S&P 편입종목이 아니다.
 * 종목코드는 실제 상장코드와 겹치지 않게 KR '9ZZ###', US 'ZSYN###' 형식만 쓴다.
 * radar/data/universe-400.json 을 대신하지 않으며, 앱·GAS 운영 경로에서 읽지 않는다. */
const SOURCE = Object.freeze({ url: 'https://example.invalid/synthetic-test-only', asOf: '2026-11-11', version: 'synthetic-test-only-1' });
const META = Object.freeze({ synthetic: true, testOnly: true, notForProduction: true, note: '합성 시험용 — 실제 지수 구성종목 아님' });
const kr = i => '9ZZ' + String(i).padStart(3, '0');
const us = i => 'ZSYN' + String(i).padStart(3, '0');
function input() {
  const source = { ...SOURCE };
  // 나스닥100 0..99, S&P100 80..179 → 합집합 180, 나머지 20개는 S&P500 시총순 보충.
  const group = (n, f, start = 0) => Array.from({ length: n }, (_, i) => ({ ticker: f(start + i), marketCap: 1e12 - (start + i) * 1e9 }));
  const x = {
    kospi200: { members: group(200, kr), source, complete: true, expectedConstituents: 200 },
    nasdaq100: { members: group(100, us), source, complete: true, expectedConstituents: 100 },
    sp100: { members: group(100, us, 80), source, complete: true, expectedConstituents: 100 },
    sp500: { members: group(500, us), source, complete: true, expectedConstituents: 500 }
  };
  x.sp500.marketCapCurrency = 'USD';
  x.sp500.marketCapAsOf = '2026-11-11';
  return x;
}
/* 거래일(주말 제외) 종가 형태의 합성 관측값. 실제 가격 아님. */
function record(ticker, market, endDay, seed) {
  const days = [];
  const d = new Date(endDay + 'T00:00:00Z');
  while (days.length < 140) { const w = d.getUTCDay(); if (w && w < 6) days.unshift(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() - 1); }
  const base = market === 'KR' ? 50000 + seed * 100 : 100 + seed;
  const bars = days.map((day, i) => ({ d: day, c: Math.round(base * (1 + 0.2 * Math.sin((i + seed) / 9)) * 100) / 100 }));
  const max = Math.max(...bars.map(b => b.c));
  return { symbol: market === 'KR' ? ticker + '.KS' : ticker, source: 'yahoo-chart-v8', currency: market === 'KR' ? 'KRW' : 'USD', timezone: market === 'KR' ? 'Asia/Seoul' : 'America/New_York', exchange: market === 'KR' ? 'KSE' : 'NMS', instrumentType: 'EQUITY', adjustment: 'unverified', barCount: bars.length, bars, fiftyTwoWeekHigh: max * 1.1 };
}
module.exports = { SOURCE, META, input, record, kr, us };
