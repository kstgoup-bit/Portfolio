'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('fs');const path=require('path');const crypto=require('crypto');
const FILE=path.join(__dirname,'..','radar/data/kospi200-20261112.json');
const snap=JSON.parse(fs.readFileSync(FILE,'utf8'));
test('KRX KOSPI200 snapshot: published count kept (201), unique valid 6-char codes',()=>{
  assert.equal(snap.group,'kospi200');assert.equal(snap.complete,true);
  assert.equal(snap.members.length,201);assert.equal(snap.expectedConstituents,snap.members.length);
  const codes=snap.members.map(m=>m.ticker);assert.equal(new Set(codes).size,codes.length);
  codes.forEach(c=>assert.match(c,/^[0-9][0-9A-Z]{5}$/));
  snap.members.forEach(m=>assert.ok(typeof m.name==='string'&&m.name.length>0));
  assert.ok(codes.includes('005930')&&codes.includes('0220W0'));
});
test('KRX KOSPI200 snapshot: source recorded, no price or market-cap columns redistributed',()=>{
  assert.match(snap.source.url,/^https:\/\/data\.krx\.co\.kr\//);assert.equal(snap.source.asOf,'2026-11-12');
  assert.match(snap.source.fileSha256,/^[0-9a-f]{64}$/);assert.ok(snap.source.version.length>0);
  snap.members.forEach(m=>assert.deepEqual(Object.keys(m).sort(),['name','ticker']));
});
test('KRX KOSPI200 snapshot is pinned',()=>{
  const pins=require('./lib/live-data-pins.json');
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(FILE)).digest('hex'),pins.addedRuntimeFiles['radar/data/kospi200-20261112.json']);
});
