'use strict';
const test=require('node:test'),a=require('node:assert/strict'),G=require('../has/chart-gate.js');
function series(fn,n=120){const out=[];let d=Date.parse('2026-05-01T00:00:00Z');for(let i=0;i<n;i++){out.push({d:new Date(d).toISOString().slice(0,10),c:fn(i)});d+=86400000;}return out;}
const now=Date.parse('2026-12-31T12:00:00+09:00');
test('chart gate: steady decline is falling knife (1차만)',()=>{a.equal(G.classify(series(i=>1000-6*i),'KR',now).stage,'falling');});
test('chart gate: decline then recovery above rising 20MA is stage2',()=>{a.equal(G.classify(series(i=>i<108?1000-8*i:136+10*(i-108)),'KR',now).stage,'stage2');});
test('chart gate: long recovery above rising 60MA is stage3',()=>{a.equal(G.classify(series(i=>i<40?1000-10*i:600+6*(i-40)),'KR',now).stage,'stage3');});
test('chart gate: short history or bad data is unknown; today bar excluded',()=>{
  a.equal(G.classify(series(i=>100,30),'KR',now).stage,'unknown');a.equal(G.classify(null,'US',now).stage,'unknown');
  const b=series(i=>1000-6*i);const r=G.classify(b.concat([{d:'2026-12-31',c:99999}]),'KR',now);a.equal(r.stage,'falling');
  a.match(G.describe(r).label,/매수 대기/);
});
test('chart gate: fresh() is false without a stored result and exported for the 6-hour reuse',()=>{
  a.equal(typeof G.fresh,'function');a.equal(G.fresh('US','WDC'),false);
});
