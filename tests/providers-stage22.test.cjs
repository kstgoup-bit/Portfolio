'use strict';
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),P=require('../providers/closing-stage22.cjs'),T=require('../has/price-trust');
const date='2026-10-29',now='2026-10-30T09:00:00Z';
const ctx=market=>({synthetic:true,fetchedAt:'2026-10-30T08:00:00Z',now,calendar:{synthetic:true,market,timezone:P.PROFILES[market].timezone,date,tradingDay:true,regularClosed:true,closeAt:market==='US'?'2026-10-29T20:00:00Z':'2026-10-29T06:30:00Z'}});
function fixture(p){return{synthetic:true,binding:{symbol:p.symbol,exchange:p.exchange,currency:p.currency,timezone:p.timezone},adjustment:'none',session:'regular',payload:p.provider==='kis'?{rt_cd:'0',output2:[p.market==='US'?{xymd:'20261029',clos:'100'}:{stck_bsop_date:'20261029',stck_clpr:'100'}]}:p.provider==='twelve'?{meta:{symbol:p.symbol,currency:p.currency,exchange_timezone:p.timezone,mic_code:p.exchange,interval:'1day'},values:[{datetime:date,close:'100'}]}:{OutBlock_1:[{ISU_SRT_CD:p.symbol,BAS_DD:'20261029',TDD_CLSPRC:'100'}]}};}
const evidence={synthetic:true,routesReviewed:true,evidenceId:'SYN-ROUTES-22'};
for(const c of P.CANDIDATES)test('22 offline candidate '+c.symbol,()=>{const providers=['kis',c.market==='KR'?'krx':'twelve'];const results=providers.map(provider=>{const p=P.plan(provider,c.symbol,date),f=fixture(p),snap=JSON.stringify(f),r=P.normalizeFixture(p,f,ctx(c.market));a.equal(r.ok,true);a.equal(JSON.stringify(f),snap);a.equal(r.realVerified,false);const q=r.quotes[0];a.equal(q.verification,'synthetic');a.equal(T.gateSignals(()=>a.fail('synthetic price must never reach evaluator'),q,null,now).held,true);return r;});a.equal(P.reconcileSynthetic(...results,evidence).ok,true);a.equal(P.reconcileSynthetic(...results,evidence).held,true);});
const invalid={
 'missing synthetic context':(p,f,c)=>delete c.synthetic,
 'missing synthetic envelope':(p,f)=>delete f.synthetic,
 'mismatched symbol':(p,f)=>f.binding.symbol='OTHER',
 'mismatched exchange':(p,f)=>f.binding.exchange='XNYS',
 'mismatched currency':(p,f)=>f.binding.currency='KRW',
 'missing timezone':(p,f)=>delete f.binding.timezone,
 'future fetched':(p,f,c)=>c.fetchedAt='2027-01-01T00:00:00Z',
 'missing fetched offset':(p,f,c)=>c.fetchedAt='2026-10-30T08:00:00',
 'stale fetched':(p,f,c)=>c.fetchedAt='2026-10-20T08:00:00Z',
 'unclosed market':(p,f,c)=>c.calendar.regularClosed=false,
 'closed in future':(p,f,c)=>c.calendar.closeAt='2027-01-01T00:00:00Z',
 'wrong calendar date':(p,f,c)=>c.calendar.date='2026-10-28',
 'non trading day':(p,f,c)=>c.calendar.tradingDay=false,
 'adjustment unknown':(p,f)=>delete f.adjustment,
 'adjustment splits':(p,f)=>f.adjustment='splits',
 'extended hours':(p,f)=>f.session='extended',
 'provider rejection':(p,f)=>f.payload.rt_cd='1',
 'missing schema':(p,f)=>delete f.payload.output2,
 'missing date':(p,f)=>f.payload.output2[0].xymd='20261028',
 'impossible date':(p,f)=>f.payload.output2[0].xymd='20260230',
 'duplicate date':(p,f)=>f.payload.output2.push({...f.payload.output2[0]}),
 'negative price':(p,f)=>f.payload.output2[0].clos='-10',
 'blank price':(p,f)=>f.payload.output2[0].clos='',
 'non numeric price':(p,f)=>f.payload.output2[0].clos='1,000',
 'infinity price':(p,f)=>f.payload.output2[0].clos=Infinity,
 'tampered plan':p=>p.operation='order'
};
for(const [name,mut]of Object.entries(invalid))test('22 holds '+name,()=>{const p={...P.plan('kis','MSFT',date)},f=fixture(p),c=ctx('US');mut(p,f,c);const r=P.normalizeFixture(p,f,c);a.equal(r.ok,false);a.equal(r.held,true);a.deepEqual(r.quotes,[]);a.equal(r.realVerified,false);});
test('22 no unsupported symbols, invalid days or US KRX routing',()=>{for(const args of [['kis','00593',date],['kis','MSFT','2026-02-30'],['krx','MSFT',date],['unknown','MSFT',date]])a.equal(P.plan(...args).ok,false);});
test('22 Twelve metadata, rate and schema checks',()=>{const p=P.plan('twelve','MSFT',date);for(const mutate of [f=>f.payload.meta.currency='KRW',f=>f.payload.meta.interval='1min',f=>f.payload={status:'error',code:429,message:'DO NOT ECHO SECRET'},f=>f.payload.values=[]]){const f=fixture(p);mutate(f);const r=P.normalizeFixture(p,f,ctx('US'));a.equal(r.ok,false);a.ok(!JSON.stringify(r).includes('SECRET'));}});
test('22 KRX six character code stays distinct and response mismatch holds',()=>{const p=P.plan('krx','005930',date),f=fixture(p);f.payload.OutBlock_1[0].ISU_SRT_CD='5930';a.equal(P.normalizeFixture(p,f,ctx('KR')).code,'MISSING_DATE');a.equal(p.symbol,'005930');});
test('22 disagreement never averaged; same provider or unreviewed routes held',()=>{const p=P.plan('kis','MSFT',date),q=P.plan('twelve','MSFT',date),left=P.normalizeFixture(p,fixture(p),ctx('US')),right=P.normalizeFixture(q,fixture(q),ctx('US'));a.equal(P.reconcileSynthetic(left,left,evidence).ok,false);a.equal(P.reconcileSynthetic(left,right,{}).ok,false);right.quotes[0].close=100.01;a.equal(P.reconcileSynthetic(left,right,evidence).code,'PRICE_MISMATCH');right.quotes[0].close=100;right.quotes[0].asOf='2026-10-28';a.equal(P.reconcileSynthetic(left,right,evidence).code,'BASIS_MISMATCH');});
test('22 retry bounded and Retry-After never shortened',()=>{a.deepEqual(P.retryAdvice(429,0,30),{retry:true,delaySeconds:30,countsAgainstBudget:true});for(const args of [[429,0,NaN],[429,0,61],[429,2,1],[401,0,1],[403,0,1],[503,-1,0]])a.equal(P.retryAdvice(...args).retry,false);a.equal(P.retryAdvice(503,1,0).delaySeconds,2);});
test('22 pure adapter has no credential interface, storage or network import',()=>{const s=fs.readFileSync(require.resolve('../providers/closing-stage22.cjs'),'utf8');a.ok(!/require\(|fetch\(|localStorage|process\.env|https?:\/\/(?!example\.invalid)/.test(s));a.ok(!/order|token|secret|apikey/i.test(JSON.stringify(P.plan('kis','MSFT',date))));a.deepEqual(Object.keys(P).sort(),['CANDIDATES','PROFILES','normalizeFixture','plan','reconcileSynthetic','retryAdvice'].sort());});
test('22 malformed rows and null arrays return hold without throwing',()=>{for(const provider of ['kis','twelve','krx']){const p=P.plan(provider,'005930',date),f=fixture(p);if(provider==='kis')f.payload.output2=[null];else if(provider==='twelve')f.payload.values=[null];else f.payload.OutBlock_1=[null];a.equal(P.normalizeFixture(p,f,ctx('KR')).code,'SCHEMA_MISMATCH');}});
test('22 close instant must belong to selected market day',()=>{const p=P.plan('kis','MSFT',date),c=ctx('US');c.calendar.closeAt='2026-10-28T20:00:00Z';a.equal(P.normalizeFixture(p,fixture(p),c).code,'CALENDAR_UNCONFIRMED');});
