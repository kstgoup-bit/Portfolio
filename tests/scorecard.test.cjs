'use strict';
const test=require('node:test'),a=require('node:assert/strict'),S=require('../has/scorecard.js'),fs=require('node:fs'),path=require('node:path');
const bars=(arr)=>arr.map(([d,c])=>({d,c}));
test('scorecard: excess vs benchmark decides hits; wait is not scored; too-early when no new close',()=>{
  const now=Date.parse('2026-12-24T10:00:00+09:00'),at='2026-11-24T22:30:00+09:00';
  const series={'KR:001440':bars([['2026-11-23',16590],['2026-11-24',16000],['2026-12-23',19908]]),'KR:069500':bars([['2026-11-24',50000],['2026-12-23',55000]]),
    'KR:011070':bars([['2026-11-24',256500],['2026-12-23',230000]]),'US:SOXL':bars([['2026-11-23',43.21],['2026-12-23',40]]),'US:QQQ':bars([['2026-11-23',500],['2026-12-23',520]]),'US:MSFT':bars([['2026-11-23',492.5]])};
  const r=S.score([{ticker:'001440',market:'KR',name:'대한전선',verdict:'buy-review',reviewedAt:at},{ticker:'011070',market:'KR',name:'LG이노텍',verdict:'wait',reviewedAt:at},
    {ticker:'SOXL',market:'US',name:'SOXL',verdict:'trim-review',reviewedAt:at},{ticker:'MSFT',market:'US',name:'MSFT',verdict:'hold-long',reviewedAt:at},{ticker:'X',market:'US',name:'X',verdict:'buy-review',reviewedAt:at}],series,now);
  const by=Object.fromEntries(r.rows.map(x=>[x.ticker,x]));
  a.equal(by['001440'].base,16000);a.ok(Math.abs(by['001440'].ret-24.425)<0.01);a.ok(Math.abs(by['001440'].excess-14.425)<0.01);a.equal(by['001440'].hit,true);
  a.equal(by['011070'].hit,undefined);a.equal(by.SOXL.hit,true);a.equal(by.MSFT.status,'too-early');a.equal(by.X.status,'no-data');
  a.equal(r.groups['buy-review'].hits,1);
  a.equal(S.baseDate('US',Date.parse('2026-11-24T23:00:00+09:00')),'2026-11-23');a.equal(S.baseDate('KR',Date.parse('2026-11-24T22:30:00+09:00')),'2026-11-24');a.equal(S.baseDate('KR',Date.parse('2026-11-24T10:00:00+09:00')),'2026-11-23');a.equal(r.groups['buy-review'].scored,1);
});
test('scorecard: review index lists only existing immutable review files',()=>{
  const ix=JSON.parse(fs.readFileSync(path.join(__dirname,'../reviews/index.json'),'utf8'));a.ok(ix.files.length>=2);
  for(const f of ix.files){a.match(f,/^[a-z0-9-]+\.json$/);a.ok(fs.existsSync(path.join(__dirname,'../reviews',f)),f);}
});
test('trial trades: validation, return and excess vs benchmark, card link, sold trade uses sell price',()=>{
  const t1={id:'trial-a',market:'KR',ticker:'001440',date:'2026-11-25',qty:10,price:16000},t2={id:'trial-b',market:'US',ticker:'SOXL',date:'2026-11-25',qty:2,price:40,sellDate:'2026-12-10',sellPrice:44};
  a.ok(S.validTrade(t1));a.ok(S.validTrade(t2));a.equal(S.validTrade({...t1,ticker:'1440'}),false);a.equal(S.validTrade({...t2,sellDate:'2026-11-01'}),false);
  a.deepEqual(S.parseTrades(JSON.stringify([t1,t2])).length,2);a.equal(S.parseTrades('[{"x":1}]'),null);a.deepEqual(S.parseTrades(null),[]);
  const series={'KR:001440':bars([['2026-11-25',16000],['2026-12-23',20000]]),'KR:069500':bars([['2026-11-25',50000],['2026-12-23',55000]]),'US:QQQ':bars([['2026-11-25',500],['2026-12-10',490]])};
  const r=S.trialScore([t1,t2],series,[{market:'KR',ticker:'001440',name:'대한전선',verdict:'buy-review',reviewedAt:'2026-11-24T22:30:00+09:00'}]);
  a.ok(Math.abs(r.rows[0].ret-25)<1e-9);a.ok(Math.abs(r.rows[0].excess-15)<1e-9);a.equal(r.rows[0].card.name,'대한전선');
  a.ok(Math.abs(r.rows[1].ret-10)<1e-9);a.ok(Math.abs(r.rows[1].excess-12)<1e-9);a.equal(r.rows[1].card,null);
  a.equal(r.total.KR.cost,160000);a.equal(r.total.KR.val,200000);
});
