'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('fs');const path=require('path');const crypto=require('crypto');
const C=require('../has/universe-screen.js');
const S=require('./lib/synthetic-universe-400.test-only.cjs');
const R=p=>JSON.parse(fs.readFileSync(path.join(__dirname,'..',p),'utf8'));
const kr=R('radar/data/kospi200-20261112.json'),us=R('radar/data/us200-20261112.json'),man=R('radar/data/universe-manifest-20261112.json');
const flat={url:us.source.spy.url,asOf:'2026-11-12',version:'QQQ+SPY snapshot v2'};
const input=()=>({kospi200:{source:kr.source,members:kr.members.map(m=>({ticker:m.ticker})),complete:true,expectedConstituents:kr.members.length},us200:{source:flat,members:us.members.map(m=>({ticker:m.ticker})),complete:true,expectedConstituents:us.members.length}});
test('v2 universe: KR 201 + US 201 tickers (200 companies) builds, validates, batches ≤12',()=>{
  const u=C.buildUniverseV2(input());assert.equal(u.coreCount,402);assert.equal(u.members.filter(x=>x.market==='KR').length,201);assert.equal(u.members.filter(x=>x.market==='US').length,201);
  assert.deepEqual(u.sources.map(s=>s.group),['kospi200','us200']);C.validateUniverse(u);
  const b=C.batches(u);assert.ok(b.length>0&&b.every(x=>(x.length||x.tickers.length)<=12));
});
test('v2 universe rejects incomplete, count mismatch, duplicates, bad tickers, future date, too many extras',()=>{
  let i=input();i.us200.complete=false;assert.throws(()=>C.buildUniverseV2(i),/reviewed-complete/);
  i=input();i.us200.expectedConstituents=200;assert.throws(()=>C.buildUniverseV2(i),/reviewed-complete/);
  i=input();i.us200.members=i.us200.members.slice(0,150);i.us200.expectedConstituents=150;assert.throws(()=>C.buildUniverseV2(i),/reviewed-complete/);
  i=input();i.us200.members[1]={ticker:i.us200.members[0].ticker};assert.throws(()=>C.buildUniverseV2(i),/duplicate/);
  i=input();i.kospi200.members[0]={ticker:'abc'};assert.throws(()=>C.buildUniverseV2(i),/invalid-or-duplicate/);
  i=input();i.us200.source={...flat,asOf:'2999-01-01'};assert.throws(()=>C.buildUniverseV2(i),/future-source-date/);
  assert.throws(()=>C.buildUniverseV2(input(),Array.from({length:101},(_,n)=>({market:'US',ticker:'EX'+String.fromCharCode(65+n%26)+String.fromCharCode(65+Math.floor(n/26))}))),/too-many-extras/);
  assert.equal(C.buildUniverseV2(input(),[{market:'US',ticker:'ZZZZ'}]).members.at(-1).scope,'extra');
});
test('legacy 4-group universe still validates; mixed/unknown group sets rejected',()=>{
  const u=C.buildUniverseV2(input());const bad=JSON.parse(JSON.stringify(u));bad.sources[1].group='sp100';assert.throws(()=>C.validateUniverse(bad),/invalid-source-groups/);
  const bad2=JSON.parse(JSON.stringify(u));bad2.coreCount=401;assert.throws(()=>C.validateUniverse(bad2),/invalid-core-count/);
  const bad3=JSON.parse(JSON.stringify(u));bad3.sources=bad3.sources.slice(0,1);assert.throws(()=>C.validateUniverse(bad3),/invalid-universe/);
});
test('v2 universe flows through assemble → validateSummary (GAS/app path)',()=>{
  const u=C.buildUniverseV2(input());const now=Date.parse('2026-11-14T06:00:00Z'),day='2026-11-13';
  const rows=u.members.slice(190,214).map((t,i)=>C.summarize(t,S.record(t.ticker,t.market,day,i+3),null,now));
  const s=C.assemble(u,rows,{generation:'v2-synthetic-test',generatedAt:'2026-11-14T00:00:00Z'});
  const v=C.validateSummary(s,now);assert.equal(v.total,402);assert.equal(v.referenceCount,rows.filter(r=>r.status==='reference').length);assert.equal(v.sources.length,2);
});
test('manifest file matches builder output, has no extras/private data, and is pinned',()=>{
  const u=C.buildUniverseV2(input());assert.deepEqual(man.members,u.members);assert.equal(man.coreCount,402);assert.ok(man.members.every(m=>m.scope==='core'));
  C.validateUniverse(man);assert.ok(!/weight|price|quantity|보유/i.test(JSON.stringify(man.members)));
  const pins=require('./lib/live-data-pins.json'),f=path.join(__dirname,'..','radar/data/universe-manifest-20261112.json');
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),pins.addedRuntimeFiles['radar/data/universe-manifest-20261112.json']);
});
