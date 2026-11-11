'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const C = require('../has/kis-comparison'), F = require('../has/kis-comparison-fixtures');
const run = p => C.compareJSON(JSON.stringify(p));
function changed(field, value) { const p = F.create(); p.kis[field] = value; return run(p); }
test('synthetic agreement and conflict never certify independence, freshness or signals', () => {
  for (const scenario of ['agree', 'conflict', 'shared-origin', 'missing-time', 'different-venue', 'missing-source']) {
    const p = F.create(scenario), before = JSON.stringify(p), r = run(p);
    assert.equal(r.verification, 'unverified');
    for (const flag of ['independenceVerified', 'freshnessVerified', 'usableForSignals']) assert.equal(r[flag], false);
    assert.ok(Object.isFrozen(r)); assert.equal(JSON.stringify(p), before);
  }
  assert.equal(run(F.create()).status, 'agree');
  assert.equal(run(F.create('conflict')).status, 'conflict');
  assert.equal(run(F.create('shared-origin')).originRelationship, 'shared');
  assert.equal(run(F.create()).originRelationship, 'distinct-declared');
});
test('requires instrument, venue, currency, kind, adjustment and exact exchange clock', () => {
  for (const field of ['ticker','market','exchange','currency','priceKind','adjustment','exchangeTimestamp','price']) {
    assert.equal(changed(field, null).status, 'incomparable', field);
    const p = F.create(); delete p.gas[field]; delete p.kis[field];
    assert.equal(run(p).status, 'incomparable', field);
  }
  for (const [field, value] of Object.entries({ticker:'000660',market:'US',exchange:'NXT',currency:'USD',priceKind:'close',adjustment:'split-adjusted',exchangeTimestamp:'2026-11-09T06:00:00.001Z'})) assert.equal(changed(field,value).status,'incomparable',field);
  assert.equal(run(F.create('missing-source')).status,'incomparable');
});
test('rejects receipt clock fallback, ambiguous price basis and malformed clocks', () => {
  for (const timestamp of ['2026-11-09','2026-11-09T15:00:00+09:00','2026-02-30T06:00:00.000Z','2026-11-09T24:00:00.000Z','2026-11-09T06:00:00Z']) assert.equal(changed('exchangeTimestamp',timestamp).status,'invalid');
  for (const [field,value] of [['receiptTimestamp','2026-11-09T06:00:00.000Z'],['priceKind','last'],['adjustment','adjusted'],['exchange','UN'],['exchange','BAQ']]) assert.equal(changed(field,value).status,'invalid');
});
test('delayed quotes require known matching delay and price kinds never merge', () => {
  const p = F.create(); p.gas.priceKind = p.kis.priceKind = 'delayed';
  assert.equal(run(p).reason,'missing-delaySeconds');
  p.gas.delaySeconds = p.kis.delaySeconds = 900; assert.equal(run(p).status,'agree');
  p.kis.delaySeconds = 901; assert.equal(run(p).reason,'different-delaySeconds');
  p.gas.delaySeconds = p.kis.delaySeconds = 0; assert.equal(run(p).reason,'inconsistent-delaySeconds');
  p.kis.delaySeconds = -1; assert.equal(run(p).status,'invalid');
  assert.equal(changed('delaySeconds',900).status,'incomparable');
});
test('US quotes use explicit venue and clocks without calendar inference', () => {
  const p = F.create();
  for(const q of [p.gas,p.kis]) Object.assign(q,{ticker:'AAPL',market:'US',exchange:'NASDAQ',currency:'USD'});
  assert.equal(run(p).status,'agree');
  p.kis.exchange = 'NYSE'; assert.equal(run(p).status,'incomparable');
});
test('bounded primitive JSON rejects unknown and secret fields without echo', () => {
  let calls = 0; const proxy = new Proxy({}, {get(){calls++;throw Error('secret');}});
  for (const v of [proxy, new String('{}'), null, 1, undefined, '{', 'null', '[]', ' '.repeat(8193), '"'+'가'.repeat(3000)+'"']) assert.equal(C.compareJSON(v).status,'invalid');
  assert.equal(calls,0);
  for (const field of ['appkey','appsecret','access_token','url','__proto__','constructor','stck_prpr']) {
    const p = F.create(); Object.defineProperty(p.kis,field,{value:'PRIVATE_CANARY',enumerable:true});
    const r = run(p); assert.equal(r.status,'invalid'); assert.ok(!JSON.stringify(r).includes('PRIVATE_CANARY'));
  }
  const p = F.create(); p.extra = {}; assert.equal(run(p).status,'invalid');
  for (const v of [0,-1,Infinity,NaN,1e13,'10000']) assert.notEqual(changed('price',v).status,'agree');
});
test('tolerance uses full precision and no rounding into agreement', () => {
  assert.equal(changed('price',10050).status,'agree');
  assert.equal(changed('price',10050.00001).status,'conflict');
  assert.equal(changed('price',10049.99999).status,'agree');
});
test('origin declarations never prove independence and unknown origin is visible', () => {
  assert.equal(changed('upstreamOrigin',null).originRelationship,'unknown');
  assert.equal(changed('upstreamOrigin','unknown').originRelationship,'unknown');
  const p=F.create(); p.gas.upstreamOrigin=p.kis.upstreamOrigin='exchange'; assert.equal(run(p).originRelationship,'shared');
});
test('subnormal prices and ambiguous duplicate JSON members fail closed', () => {
  assert.equal(changed('price',5e-324).status,'invalid');
  const text=JSON.stringify(F.create());
  assert.equal(C.compareJSON(text.replace('"price":10020','"price":1,"price":10020')).status,'invalid');
  assert.equal(C.compareJSON(text.replace('"version":1','"version":0,"\\u0076ersion":1')).status,'invalid');
  const p=F.create(); p.gas.price=1e-9; p.kis.price=1e12; assert.ok(Number.isFinite(run(p).spreadPct));
});
