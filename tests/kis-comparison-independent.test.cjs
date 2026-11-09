'use strict';
// Independent adversarial coverage. Synthetic inputs only, no transport or credentials.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../has/kis-comparison.js');
function quote() { return {ticker:'005930',market:'KR',exchange:'KRX',currency:'KRW',priceKind:'realtime',adjustment:'raw',exchangeTimestamp:'2026-11-09T01:00:00.000Z',price:100,upstreamOrigin:'unknown',delaySeconds:0}; }
function sample() { return {version:1,gas:quote(),kis:quote()}; }
function run(p) { return C.compareJSON(JSON.stringify(p)); }
function invariant(r) {
  assert.equal(r.verification,'unverified');
  assert.equal(r.independenceVerified,false);
  assert.equal(r.usableForSignals,false);
  assert.equal(r.freshnessVerified,false);
  assert.ok(Object.isFrozen(r));
  assert.ok(r.spreadPct === null || Number.isFinite(r.spreadPct));
  assert.deepEqual(JSON.parse(JSON.stringify(r)),r);
}
test('independent: equal declarations are never verification or signal permission',()=>{
  for (const priceKind of ['realtime','delayed','close']) {
    const p=sample(); for (const q of [p.gas,p.kis]) Object.assign(q,{priceKind,delaySeconds:priceKind==='delayed'?900:0});
    const r=run(p); assert.equal(r.status,'agree'); invariant(r);
  }
});
test('independent: every comparability dimension blocks same-price agreement',()=>{
  const differences={ticker:'000660',market:'US',exchange:'NXT',currency:'USD',priceKind:'close',adjustment:'split-adjusted',exchangeTimestamp:'2026-11-09T01:00:00.001Z'};
  for (const [field,value] of Object.entries(differences)) {const p=sample();p.kis[field]=value;const r=run(p);assert.notEqual(r.status,'agree',field);assert.equal(r.spreadPct,null,field);invariant(r);}
});
test('independent: omitted required dimensions on either source withhold comparison',()=>{
  for (const source of ['gas','kis']) for (const field of ['ticker','market','exchange','currency','priceKind','adjustment','exchangeTimestamp','price']) for (const value of [null,undefined]) {
    const p=sample();p[source][field]=value;const r=run(p);assert.equal(r.status,'incomparable',source+'.'+field);assert.equal(r.spreadPct,null);invariant(r);
  }
});
test('independent: unknown or receipt-only time never substitutes for exchange time',()=>{
  for (const field of ['receivedAt','fetchedAt','receiptTimestamp']) {const p=sample();delete p.kis.exchangeTimestamp;p.kis[field]='2026-11-09T01:00:00.000Z';assert.equal(run(p).status,'invalid');}
  for (const t of ['2026-02-30T01:00:00.000Z','2026-11-09','2026-11-09T01:00:00Z','2026-11-09T10:00:00.000+09:00','unknown']) {const p=sample();p.kis.exchangeTimestamp=t;assert.equal(run(p).status,'invalid');}
});
test('independent: distinct or shared origin declarations cannot confer independence',()=>{
  for (const [a,b,expected] of [['kis','kis','shared'],['kis','google','distinct-declared'],['unknown','kis','unknown']]) {const p=sample();p.gas.upstreamOrigin=a;p.kis.upstreamOrigin=b;const r=run(p);assert.equal(r.originRelationship,expected);invariant(r);}
  for(const field of ['independentVerified','independenceVerified','verification','trusted']) {const p=sample();p.kis[field]=true;assert.equal(run(p).status,'invalid');}
});
test('independent: delayed observations require exact nonmissing delay duration',()=>{
  for(const [a,b] of [[null,900],[900,null],[900,901],[0,900]]) {const p=sample();Object.assign(p.gas,{priceKind:'delayed',delaySeconds:a});Object.assign(p.kis,{priceKind:'delayed',delaySeconds:b});assert.equal(run(p).status,'incomparable');}
  for(const priceKind of ['realtime','close']) {const p=sample();for(const q of [p.gas,p.kis]) Object.assign(q,{priceKind,delaySeconds:900});assert.equal(run(p).status,'incomparable');}
});
test('independent: combined venues and US daytime codes cannot masquerade as normalized exchanges',()=>{
  for(const exchange of ['UN','KRX/NXT','NAS','BAQ','BAY','BAA']) {const p=sample();p.kis.exchange=exchange;assert.equal(run(p).status,'invalid');}
  const p=sample();for(const q of [p.gas,p.kis])Object.assign(q,{ticker:'AAPL',market:'US',exchange:'NASDAQ',currency:'USD'});assert.equal(run(p).status,'agree');p.kis.exchange='NYSE';assert.equal(run(p).status,'incomparable');
});
test('independent: unknown, secret and prototype keys fail closed without echo',()=>{
  const marker='SYNTHETIC_SECRET_DO_NOT_ECHO';
  for(const field of ['appkey','appsecret','authorization','rawPayload','__proto__','constructor']) for(const scope of ['root','gas','kis']) {
    const p=sample();Object.defineProperty(scope==='root'?p:p[scope],field,{value:marker,enumerable:true});const r=run(p);assert.equal(r.status,'invalid');assert.ok(!JSON.stringify(r).includes(marker));invariant(r);
  }
});
test('independent: object input does not invoke getters or coercion',()=>{
  let touched=0;const p={get gas(){touched++;throw Error('getter');},toString(){touched++;throw Error('coercion');}};
  for(const value of [p,new String(JSON.stringify(sample())),null,[],false,42]) {assert.equal(C.compareJSON(value).status,'invalid');}assert.equal(touched,0);
});
test('independent: invalid numeric prices and nested values fail closed',()=>{
  for(const price of [0,-1,1e13,'100',[],{},true]) {const p=sample();p.kis.price=price;assert.equal(run(p).status,'invalid');}
  for(const value of ['NaN','Infinity','-Infinity','1e999']) {const text=JSON.stringify(sample()).replace('"price":100','"price":'+value);assert.equal(C.compareJSON(text).status,'invalid');}
});
test('independent: extreme finite input prices never produce nonfinite output',()=>{
  for(const [a,b] of [[Number.MIN_VALUE,1],[1,Number.MIN_VALUE],[1e-300,1e12],[1e12,1e-300]]) {const p=sample();p.gas.price=a;p.kis.price=b;const r=run(p);invariant(r);assert.notEqual(r.status,'agree');}
});
test('independent: UTF-8 budget includes legal Unicode whitespace string values',()=>{
  const text=JSON.stringify(sample());const exact=text+' '.repeat(C.MAX_BYTES-Buffer.byteLength(text));assert.equal(C.compareJSON(exact).status,'agree');assert.equal(C.compareJSON(exact+' ').status,'invalid');
  for(const value of ['한'.repeat(2800),'😀'.repeat(2100)]) {const p=sample();p.gas.ticker=value;const json=JSON.stringify(p);assert.ok(Buffer.byteLength(json)>C.MAX_BYTES);assert.equal(C.compareJSON(json).status,'invalid');}
});
test('independent: input immutable; output and module frozen; price rounding never hides conflict',()=>{
  const p=sample();const text=JSON.stringify(p);const r=C.compareJSON(text);assert.equal(JSON.stringify(p),text);invariant(r);assert.ok(Object.isFrozen(C));assert.throws(()=>{r.verification='verified';},TypeError);
  p.kis.price=100.5000001;assert.equal(run(p).status,'conflict');p.kis.price=100.5;assert.equal(run(p).status,'agree');
});
test('independent: malformed envelopes and absent sources never agree',()=>{
  for(const raw of ['','{','null','[]','1','true','{"version":1}','{"version":2,"gas":null,"kis":null}'])assert.equal(C.compareJSON(raw).status,'invalid');
  for(const source of ['gas','kis']){const p=sample();p[source]=null;const r=run(p);assert.equal(r.status,'incomparable');invariant(r);}
});
test('independent: duplicate known and escaped-equivalent keys cannot override evidence',()=>{
  const s=JSON.stringify(sample());
  for(const raw of [s.replace('"version":1','"version":2,"version":1'),s.replace('"price":100','"price":1,"price":100'),s.replace('"price":100','"pr\\u0069ce":1,"price":100'),s.replace('"market":"KR"','"market":"US","market":"KR"')]) {
    const r=C.compareJSON(raw);assert.equal(r.status,'invalid');invariant(r);
  }
});
test('independent: bounded adversarial JSON never throws or leaks input strings',()=>{
  const values=[null,{},[],true,false,0,1,-1,1e-200,1e200,'','SYNTHETIC_MARKER','"}{:', '\\', '😀'];
  for(const field of Object.keys(quote())) for(const value of values) {const p=sample();p.gas[field]=value;const r=run(p);invariant(r);assert.ok(!JSON.stringify(r).includes('SYNTHETIC_MARKER'));}
  for(const raw of ['['.repeat(1000)+'0'+']'.repeat(1000),'{"a":'.repeat(600)+'null'+'}'.repeat(600)]) {const r=C.compareJSON(raw);assert.equal(r.status,'invalid');invariant(r);}
});
test('independent: delayed zero contradicts declared delayed quote',()=>{
  const p=sample();for(const q of [p.gas,p.kis])Object.assign(q,{priceKind:'delayed',delaySeconds:0});const r=run(p);assert.equal(r.status,'incomparable');invariant(r);
});
