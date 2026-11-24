'use strict';
const test=require('node:test');const a=require('assert'),K=require('../has/kis-crosscheck.js');
test('KIS cross-check compares confirmed same-date closes only',()=>{
const now=Date.parse('2026-11-24T10:00:00+09:00');
const y={source:'yahoo-chart-v8',symbol:'005930.KS',currency:'KRW',bars:[{d:'2026-11-20',c:55000},{d:'2026-11-21',c:55500},{d:'2026-11-24',c:56000}]};
const k={source:'kis-daily',symbol:'005930',currency:'KRW',bars:[{d:'2026-11-20',c:55000},{d:'2026-11-21',c:55500},{d:'2026-11-24',c:57000}]};
let r=K.compare(y,k,{ticker:'005930',now});a.equal(r.status,'match');a.equal(r.checked,2);a.equal(r.latest.d,'2026-11-21');
r=K.compare(y,Object.assign({},k,{bars:[{d:'2026-11-20',c:50000},{d:'2026-11-21',c:55500}]}),{ticker:'005930',now});a.equal(r.status,'partial');
r=K.compare(y,Object.assign({},k,{bars:[{d:'2026-11-21',c:60000}]}),{ticker:'005930',now});a.equal(r.status,'mismatch');
a.equal(K.compare(y,null,{ticker:'005930',now}).status,'missing-kis');
a.equal(K.compare(y,Object.assign({},k,{symbol:'000660'}),{ticker:'005930',now}).status,'missing-kis');
a.equal(K.compare(Object.assign({},y,{source:'kis-daily'}),k,{ticker:'005930',now}).status,'missing-yahoo');
a.equal(K.compare(y,Object.assign({},k,{bars:[{d:'2026-11-24',c:1}]}),{ticker:'005930',now}).status,'no-common-date');a.equal(K.compare(y,Object.assign({},k,{bars:[{d:'2026-11-21',c:0}]}),{ticker:'005930',now}).status,'missing-kis');
});
test('KIS cross-check daily log: record, merge, streak breaks on missing trading day',()=>{
  const ok=d=>({ok:true,latest:{d,match:true}}),bad=d=>({ok:true,latest:{d,match:false}});
  const rec=K.recordFrom([{ticker:'005930',r:ok('2026-11-23')},{ticker:'000660',r:bad('2026-11-23')},{ticker:'035720',r:{ok:false}}],1);
  a.deepEqual([rec.d,rec.n,rec.matched,rec.bad],['2026-11-23',3,1,['000660','035720']]);
  a.equal(K.recordFrom([{ticker:'005930',r:{ok:false}}],1),null);
  let log=K.parseLog(null);a.deepEqual(log.rows,[]);a.equal(K.parseLog('{"v":2}'),null);a.equal(K.parseLog('x'),null);
  const full=d=>({d,at:1,n:2,matched:2,bad:[]});
  log=K.mergeLog(log,full('2026-11-20'),'2026-11-21');log=K.mergeLog(log,full('2026-11-21'));log=K.mergeLog(log,full('2026-11-24'));
  log=K.mergeLog(log,Object.assign(full('2026-11-24'),{at:2}));a.equal(log.rows.length,3);a.equal(log.autoDay,'2026-11-21');
  a.ok(K.parseLog(JSON.stringify(log)));
  const days=['2026-11-19','2026-11-20','2026-11-21','2026-11-24'];
  a.equal(K.streak(log,days),3);
  a.equal(K.streak(log,days.concat(['2026-11-25'])),3); // newest unrecorded day is skipped until recorded
  a.equal(K.streak(K.mergeLog(log,{d:'2026-11-21',at:1,n:2,matched:1,bad:['000660']}),days),1);
  a.equal(K.streak(K.mergeLog(K.mergeLog(K.parseLog(null),full('2026-11-19')),full('2026-11-24')),days),1); // gap breaks
});
