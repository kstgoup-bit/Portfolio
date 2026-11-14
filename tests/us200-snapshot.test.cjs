'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('fs');const path=require('path');const crypto=require('crypto');
const FILE=path.join(__dirname,'..','radar/data/us200-20261112.json');
const snap=JSON.parse(fs.readFileSync(FILE,'utf8'));
test('US200 snapshot: 200 companies (GOOG+GOOGL one company), unique valid tickers, only ticker+name',()=>{
  assert.equal(snap.group,'us200');assert.equal(snap.complete,true);
  const t=snap.members.map(m=>m.ticker);assert.equal(t.length,snap.expectedTickers);assert.equal(new Set(t).size,t.length);
  t.forEach(x=>assert.match(x,/^[A-Z]{1,5}(\.[A-Z])?$/));
  assert.equal(new Set(t.map(x=>x==='GOOG'?'GOOGL':x)).size,snap.expectedCompanies);assert.equal(snap.expectedCompanies,200);
  snap.members.forEach(m=>{assert.deepEqual(Object.keys(m).sort(),['name','ticker']);assert.ok(m.name.length>0);});
  ['AAPL','NVDA','MSFT','GOOGL','GOOG','SPCX','HONA','BRK.B'].forEach(x=>assert.ok(t.includes(x),x));
});
test('US200 snapshot: sources and asOf recorded, no weights or prices redistributed',()=>{
  assert.equal(snap.source.qqq.asOf,'2026-11-12');assert.equal(snap.source.spy.asOf,'2026-11-12');
  assert.match(snap.source.spy.fileSha256,/^[0-9a-f]{64}$/);assert.match(snap.source.spy.url,/^https:\/\/www\.ssga\.com\//);
  assert.match(snap.source.qqq.url,/^https:\/\/invesco\.com\//);assert.ok(snap.source.rule.includes('승인'));
  assert.ok(!/weight|price/i.test(JSON.stringify(snap.members)));
});
test('US200 snapshot is pinned',()=>{
  const pins=require('./lib/live-data-pins.json');
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(FILE)).digest('hex'),pins.addedRuntimeFiles['radar/data/us200-20261112.json']);
});
