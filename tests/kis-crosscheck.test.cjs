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
