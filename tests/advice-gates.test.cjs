'use strict';
// Authored synthetic regressions. No provider, storage, portfolio, or API calls.
const test = require('node:test');
const a = require('node:assert/strict');
const Q = require('../has/quote-model.js');
const W = require('../has/watch-engine.js');
const A = require('../has/advisor-core.js');
const F = require('./lib/fixtures-stage23.cjs');
const advice = (s, c = F.ctx(), now = F.NOW, watch) => A.analyze(s, watch || W.evaluateStock(s, c, now), c, now);

for (const verification of [undefined, null, '', 'unverified', 'provider-claimed']) {
  test('fundamentals require explicit independent verification: ' + verification, () => {
    const s = F.stock({quote: F.quote({price:60}), fundamentals:F.fund({verification})});
    a.equal(W.evaluateStock(s, F.ctx(), F.NOW).fundamentalsStatus, 'unverified');
    a.equal(advice(s).opinion, '판단 보류');
  });
}
for (const price of [95, 80, 60]) {
  test('held stock without financial evidence is not called hold at price ' + price, () => {
    const s = F.stock({quote:F.quote({price}), fundamentals:null, held:{quantity:1,avgPrice:60}});
    const r = advice(s);
    a.equal(r.opinion,'판단 보류'); a.equal(r.aggressive.stance,'판단 보류'); a.equal(r.defensive.stance,'판단 보류');
  });
}
test('known concentration risk is retained even when financials are missing', () => {
  const s = F.stock({fundamentals:null,held:{quantity:1,avgPrice:60}});
  a.equal(advice(s,F.ctx({weightPct:31})).opinion,'비중 축소 검토');
});
for (const patch of [{fundamentals:null},{quote:null},{thesis:null}]) {
  test('cached/forged healthy watch cannot bypass current data: ' + Object.keys(patch), () => {
    const s = F.stock({quote:F.quote({price:60})}), w = W.evaluateStock(s,F.ctx(),F.NOW);
    a.equal(advice(s,F.ctx(),F.NOW,w).opinion,'매수 검토');
    Object.assign(s,patch);
    a.equal(advice(s,F.ctx(),F.NOW,w).opinion,'판단 보류');
  });
}
test('cached watch is re-evaluated after time advances', () => {
  const s = F.stock({quote:F.quote({price:60})}), w = W.evaluateStock(s,F.ctx(),F.NOW);
  a.equal(advice(s,F.ctx(),'2026-11-20T14:00:00+09:00',w).opinion,'판단 보류');
});
test('malformed timestamp cannot vanish through normalize into valid close quote', () => {
  for(const field of ['asOfTime','fetchedAt']) {
    const raw = {...F.quote(), [field]:'2026-02-30T12:00:00Z'};
    a.equal(Q.normalize(raw).ok,false);
  }
});
test('KR date follows Seoul and US date follows New York around UTC midnight', () => {
  a.equal(Q.marketDate('2026-11-08T16:00:00Z','KR'),'2026-11-09');
  a.equal(Q.marketDate('2026-11-08T01:00:00Z','US'),'2026-11-07');
  const kr = {...F.quote(),asOfDate:'2026-11-09',asOfTime:null,fetchedAt:null};
  a.equal(Q.usableForSignals(kr,'2026-11-08T16:00:00Z').ok,true);
  const us = {...F.quote(),market:'US',currency:'USD',asOfDate:'2026-11-08',asOfTime:null,fetchedAt:null};
  a.equal(Q.usableForSignals(us,'2026-11-08T01:00:00Z').ok,false);
});
for (const [field, patch] of [
  ['high52w',{asOfDate:'2026-11-06'}], ['high52w',{asOfDate:'2026-11-04'}],
  ['high52w',{price:1}], ['high52w',{source:' '}],
  ['returns',{asOfDate:'2026-11-06'}], ['returns',{asOfDate:'2026-11-04'}],
  ['returns',{stockPct:-101}], ['returns',{periodDays:0}], ['returns',{source:' '}],
]) test('auxiliary price evidence rejects incompatible input ' + field + JSON.stringify(patch), () => {
  const s=F.stock();s[field]={...s[field],...patch};
  const r=W.evaluateStock(s,F.ctx(),F.NOW);
  a.equal(r.signals.some(x=>x.type===(field==='high52w'?'drawdown':'relative-overdrop')),false);
  a.ok(r.missing.length);
});
test('missing quote produces no relative-overdrop, drawdown, or loss-risk', () => {
  const s=F.stock({quote:null,held:{quantity:1,avgPrice:100}}),r=W.evaluateStock(s,F.ctx({weightPct:20}),F.NOW);
  a.equal(r.signals.some(x=>['relative-overdrop','drawdown','loss-risk'].includes(x.type)),false);
});
for (const fx of [
  {asOfDate:'2026-11-06'}, {prevAsOfDate:'2026-11-05'}, {prevAsOfDate:'2026-11-06'},
  {prevRate:1e-300}, {rate:Infinity}, {asOfDate:'2026-02-30'}, {source:' '}
]) test('FX signal rejects future, unordered, malformed or unusable evidence ' + JSON.stringify(fx), () => {
  const c=F.ctx({fx:{rate:1500,prevRate:1400,asOfDate:'2026-11-05',prevAsOfDate:'2026-11-04',source:'SYNTHETIC',...fx}});
  a.equal(W.evaluatePortfolio(c,F.NOW).signals.some(x=>x.id==='market-risk|fx'),false);
});
test('future VIX and FX timestamp do not yield reliable current signals', () => {
  const c=F.ctx({market:{vix:{level:80,asOfDate:'2026-11-06',source:'SYNTHETIC'}}});
  a.equal(W.evaluatePortfolio(c,F.NOW).signals.some(x=>x.type==='market-risk'),false);
  a.equal(Q.fxView({rate:1400,appliedAt:'2026-11-06T10:00:00Z',source:'SYNTHETIC'},F.NOW).ok,false);
});
test('invalid evaluation clock yields no stock or portfolio signals', () => {
  a.deepEqual(W.evaluateStock(F.stock(),F.ctx(),'invalid').signals,[]);
  a.deepEqual(W.evaluatePortfolio(F.ctx({cashPct:1}),'invalid').signals,[]);
  a.equal(advice(F.stock(),F.ctx(),'invalid').opinion,'판단 보류');
});
test('invalid out-of-domain fields are not reported as genuine financial deterioration', () => {
  const f=F.fund({revenueGrowthPct:-1e300,freeCashFlow:-1e300,debtToEquity:1e300});
  const r=W.evaluateStock(F.stock({fundamentals:f}),F.ctx(),F.NOW);
  a.equal(r.fundamentalsStatus,'missing');
  a.equal(r.signals.some(x=>x.type==='fundamental-deterioration'),false);
});
test('future fetch time and failed price fetch preserve previous records without enabling a signal', () => {
  const q=F.quote(), b=Q.applyFetch(Q.emptyBook(),q.ticker,{ok:true,quote:q},F.NOW), before=JSON.stringify(b);
  const next=Q.applyFetch(b,q.ticker,{ok:false,issues:['SYNTHETIC FAILURE']},F.NOW);
  a.equal(JSON.stringify(b),before);a.equal(next.current[q.ticker],q);a.equal(next.lastVerified[q.ticker],q);
  a.equal(Q.usableForSignals({...q,fetchedAt:'2026-11-06T12:00:00Z'},F.NOW).ok,false);
});
