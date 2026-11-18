'use strict';
// 규칙 A(순태씨 2026-11-18 'A로 해'): 센트까지 같은 값은 같은 시세 표기 차이 → 충돌 미생성 + 기존 같은 값 보류 dry-run 정리. 합성 자료만.
const test=require('node:test'),a=require('node:assert/strict');
require('./lib/no-network.cjs');
const P=require('../has/benchmark-history-policy.js');
const NOW='2026-11-10T22:00:00.000Z',MS=Date.parse(NOW);
const DATES=['2026-11-05','2026-11-06','2026-11-09'];
function yahoo(closes,dates=DATES){const s=P.specs.QQQ;return {chart:{result:[{meta:{symbol:s.symbol,currency:s.currency,exchangeTimezoneName:s.timezone,exchangeName:'NMS',fullExchangeName:'NasdaqGS',instrumentType:'ETF',dataGranularity:'1d',regularMarketTime:Date.parse('2026-11-10T21:00:00Z')/1000},timestamp:dates.map(d=>Date.parse(d+'T14:30:00Z')/1000),indicators:{quote:[{close:closes}]}}],error:null}};}
const legacyRaw=JSON.stringify({QQQ:DATES.map((d,i)=>({ts:Date.parse(d+'T14:30:00Z'),close:[701.53,702.1,700][i]}))});
const inc=closes=>{const r=P.parseYahoo(yahoo(closes),'QQQ',NOW);a.equal(r.ok,true,r.reason);return r;};

test('sameCent: 소수점 표기 차이만 같은 값, 1센트 차이는 다른 값',()=>{
 a.equal(P.sameCent(701.53,701.530029296875),true);a.equal(P.sameCent(702.1,702.0999755859375),true);a.equal(P.sameCent(84540,84540),true);
 a.equal(P.sameCent(701.53,701.54),false);a.equal(P.sameCent(759.75,759.81),false);a.equal(P.sameCent(NaN,NaN),false);a.equal(P.sameCent('1',1),false);
});
test('병합: 구버전 2자리 값과 부동소수 재수신은 충돌을 만들지 않고, 1센트 이상 차이만 보류',()=>{
 const same=P.mergeHistoryStore(null,legacyRaw,inc([701.530029296875,702.0999755859375,700.0000000001]),'QQQ',MS);
 a.equal(same.ok,true);a.equal(same.changed,false);a.deepEqual(same.unchangedDates,DATES);
 const diff=P.mergeHistoryStore(null,legacyRaw,inc([701.54,702.0999755859375,700]),'QQQ',MS);
 a.equal(diff.ok,true);a.equal(diff.store.series.QQQ.conflicts.length,1);a.equal(diff.store.series.QQQ.conflicts[0].d,'2026-11-05');
});
function storeWith(conflicts){
 // 실제 앱 경로(규칙 A 이전 동작)로 만들 수 없으므로, 과거 앱이 남긴 형태의 같은 값 보류를 직접 합성
 const base=P.mergeHistoryStore(null,legacyRaw,inc([701.54,702.1,700]),'QQQ',MS);a.equal(base.ok,true);
 const real=base.store.series.QQQ.conflicts[0],alt=real.alternative;
 const fake=(d,close,i)=>{const p={...alt,d,close,receivedAt:'2026-11-10T21:0'+i+':00.000Z',providerBarTs:Date.parse(d+'T14:30:00Z')};p.id='o:'+P.fingerprint(JSON.stringify([p.d,p.close,p.source,p.receivedAt,p.providerBarTs]));return {d,existing:JSON.parse(legacyRaw).QQQ[DATES.indexOf(d)],alternative:p,status:'pending-review'};};
 const extra=conflicts.map((c,i)=>fake(c[0],c[1],i));
 const store={...base.store,series:{...base.store.series,QQQ:{...base.store.series.QQQ,conflicts:[real,...extra]}}};
 return JSON.stringify(store);
}
test('planSameValueSettle: 같은 값 보류만 빼고 실제 다른 값 보류·활성값은 그대로, 입력 문자열 불변',()=>{
 const raw=storeWith([['2026-11-05',701.530029296875],['2026-11-06',702.0999755859375],['2026-11-09',700.0000001]]),copy=raw.slice();
 const v=P.validateStore(JSON.parse(raw),legacyRaw,MS);a.equal(v.ok,true,v.reason);
 const r=P.planSameValueSettle(raw,legacyRaw,MS);a.equal(r.ok,true,r.reason);a.equal(r.dryRun,true);a.equal(r.changed,true);
 a.deepEqual(r.counts.QQQ,{before:4,settled:3,after:1});a.equal(r.removed.length,3);a.equal(raw,copy);
 const next=JSON.parse(r.nextRaw);a.equal(next.series.QQQ.conflicts.length,1);a.equal(next.series.QQQ.conflicts[0].alternative.close,701.54);
 const before=P.readStore(JSON.parse(raw),legacyRaw,MS).series.QQQ,after=P.readStore(next,legacyRaw,MS).series.QQQ;
 a.deepEqual(after.points,before.points);a.equal(P.validateStore(next,legacyRaw,MS).ok,true);
});
test('planSameValueSettle: 정리할 것 없으면 변화 없음, 잘못된 입력은 거절',()=>{
 const raw=storeWith([]);const r=P.planSameValueSettle(raw,legacyRaw,MS);a.equal(r.ok,true);a.equal(r.changed,false);a.equal(r.nextRaw,raw);
 a.equal(P.planSameValueSettle('{',legacyRaw,MS).ok,false);a.equal(P.planSameValueSettle(raw,null,MS).ok,false);a.equal(P.planSameValueSettle(raw,'{"QQQ":[]}',MS).ok,false);
});
