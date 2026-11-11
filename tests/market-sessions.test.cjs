'use strict';
const test=require('node:test'),a=require('node:assert/strict'),M=require('../has/market-data'),F=require('../has/market-fixtures');
function pack(date='2026-11-06',close='2026-11-06T21:00:00Z',market='US'){
 const p=F.create();delete p.history;delete p.valuationDocument;delete p.secFacts;
 p.instrument={ticker:'TEST',market,currency:market==='US'?'USD':'KRW'};
 p.quotes=[{...p.quotes[0],...p.instrument,asOfDate:date,asOfTime:close,receivedAt:close,rights:{...p.quotes[0].rights,checkedAt:close}}];return p;
}
function calendar(p,through,exceptions={}){
 const from=p.quotes[0].asOfDate,market=p.instrument.market;
 p.sessionCalendar={market,timeZone:market==='US'?'America/New_York':'Asia/Seoul',source:'Invented test schedule',reference:'SYNTHETIC: test calendar',reviewStatus:'declared',reviewedAt:p.quotes[0].asOfTime,from,through,sessions:[]};
 for(let t=Date.parse(from);t<=Date.parse(through);t+=86400000){const d=new Date(t),date=d.toISOString().slice(0,10);p.sessionCalendar.sessions.push({date,...(exceptions[date]||(d.getUTCDay()%6?{status:'regular',closeAt:date+(market==='US'?'T21:00:00Z':'T06:30:00Z')}:{status:'closed',reason:'Weekend'}))});}return p;
}
const run=(p,now)=>M.analyzePack(p,now).quote;
test('normal synthetic fixture stays usable, visibly invented and unverified',()=>{const q=M.analyzePack(F.create(),F.NOW).quote;a.equal(q.status,'consistent-unverified');a.equal(q.selected.freshness.basis,'synthetic-regular-weekdays');a.equal(q.selected.freshness.verification,'unverified');});
test('close grace boundary withholds old and new close',()=>{
 for(const now of ['2026-11-09T20:59:59Z','2026-11-09T21:00:00Z','2026-11-09T21:04:59Z','2026-11-09T21:05:00Z'])a.equal(run(pack(),now).status!=='invalid',now.includes('20:59'),now);
 for(const [now,ok] of [['2026-11-09T21:00:00Z',false],['2026-11-09T21:04:59.999Z',false],['2026-11-09T21:05:00Z',true]])a.equal(run(pack('2026-11-09','2026-11-09T21:00:00Z'),now).status!=='invalid',ok,now);
});
test('US DST real local clock handles summer and winter closes',()=>{
 for(const [date,close,now] of [['2026-03-09','2026-03-09T20:00:00Z','2026-03-09T20:05:00Z'],['2026-11-02','2026-11-02T21:00:00Z','2026-11-02T21:05:00Z']]){
  const p=pack(date,close);a.notEqual(run(p,now).status,'invalid');calendar(p,date,{[date]:{status:'regular',closeAt:close}});a.notEqual(run(p,now).status,'invalid');
  p.sessionCalendar.sessions[0].closeAt=date+'T19:00:00Z';a.equal(run(p,now).status,'invalid');
 }
});
test('KR 15:30 KST close and grace',()=>{
 const p=pack('2026-11-06','2026-11-06T06:30:00Z','KR');
 a.notEqual(run(p,'2026-11-09T06:29:59Z').status,'invalid');a.equal(run(p,'2026-11-09T06:30:00Z').status,'invalid');a.equal(run(p,'2026-11-09T06:35:00Z').status,'invalid');
 a.notEqual(run(calendar(p,'2026-11-08'),'2026-11-08T10:00:00Z').status,'invalid');
});
test('complete declared long holiday removes obsolete four calendar day gate',()=>{
 const days={};for(let i=9;i<=13;i++)days['2026-11-'+i.toString().padStart(2,'0')]={status:'closed',reason:'Invented holiday'};
 const p=calendar(pack(),'2026-11-16',days),q=run(p,'2026-11-16T19:00:00Z');a.notEqual(q.status,'invalid');a.equal(q.selected.classification.stale,false);a.equal(q.selected.freshness.latestSessionDate,'2026-11-06');a.equal(q.selected.freshness.calendar.verification,'unverified');a.equal(run(p,'2026-11-16T21:05:00Z').status,'invalid');
});
test('early close expires prior close at declared early boundary',()=>{
 const p=calendar(pack(),'2026-11-09',{'2026-11-09':{status:'early',closeAt:'2026-11-09T18:00:00Z',reason:'Invented early close'}});
 a.notEqual(run(p,'2026-11-09T17:59:59Z').status,'invalid');a.equal(run(p,'2026-11-09T18:00:00Z').status,'invalid');a.equal(run(p,'2026-11-09T18:05:00Z').status,'invalid');
 const fresh=calendar(pack('2026-11-09','2026-11-09T18:00:00Z'),'2026-11-09',{'2026-11-09':p.sessionCalendar.sessions[3]});a.notEqual(run(fresh,'2026-11-09T18:05:00Z').status,'invalid');
});
test('missing imported calendar fails closed even if caller asserts quote verified',()=>{
 const p=pack();p.mode='imported';Object.assign(p.quotes[0],{synthetic:false,source:'Declared provider',verification:'independent-verified'});Object.assign(p.quotes[0].rights,{synthetic:false,reference:'https://example.invalid/rights'});
 a.equal(run(p,F.NOW).status,'invalid');calendar(p,'2026-11-08');Object.assign(p.sessionCalendar,{source:'Declared sample calendar',reference:'https://example.invalid/calendar',reviewStatus:'reviewed'});const q=run(p,F.NOW);a.notEqual(q.status,'invalid');a.equal(q.selected.verification,'unverified');a.equal(q.selected.freshness.calendar.declaredReviewStatus,'reviewed');a.equal(q.selected.freshness.calendar.verification,'unverified');
});
test('invalid missing out-of-range contradictory calendar withholds, never fallback',()=>{
 const changes=[p=>p.sessionCalendar=null,c=>delete c.source,c=>delete c.reference,c=>delete c.reviewStatus,c=>c.reviewStatus='verified',c=>c.reviewedAt='2027-01-01T00:00:00Z',c=>c.market='KR',c=>c.timeZone='UTC',c=>c.from='2026-11-07',c=>c.through='2026-11-07',c=>c.through='2028-11-08',c=>c.sessions.pop(),c=>c.sessions.reverse(),c=>c.sessions[1]=c.sessions[0],c=>c.sessions[0].status='closed',c=>c.sessions[0].closeAt='2026-11-06T20:00:00Z',c=>c.sessions[0].closeAt='2026-11-07T21:00:00Z',c=>c.sessions[0].status='early',c=>c.sessions[1]={date:'2026-11-07',status:'regular',closeAt:'2026-11-07T21:00:00Z'},c=>delete c.sessions[1].reason];
 for(const change of changes){const p=calendar(pack(),'2026-11-08');if(change===changes[0])change(p);else change(p.sessionCalendar);a.equal(run(p,F.NOW).status,'invalid',String(change));}
});
test('future quote and future receipt rejected; supplied schedule may contain future session closes',()=>{
 const p=calendar(pack(),'2026-11-09');a.notEqual(run(p,F.NOW).status,'invalid');p.quotes[0].receivedAt='2026-11-09T21:00:00Z';a.equal(run(p,F.NOW).status,'invalid');a.equal(run(pack('2026-11-09','2026-11-09T21:00:00Z'),F.NOW).status,'invalid');
});
test('weekend DST transitions change the next session close UTC time',()=>{
 for(const [date,close,before,atClose] of [
  ['2026-03-06','2026-03-06T21:00:00Z','2026-03-09T19:59:59Z','2026-03-09T20:00:00Z'],
  ['2026-10-30','2026-10-30T20:00:00Z','2026-11-02T20:59:59Z','2026-11-02T21:00:00Z']
 ]){const p=pack(date,close);a.notEqual(run(p,before).status,'invalid');a.equal(run(p,atClose).status,'invalid');}
});
test('calendar and close input remain unchanged and unverified',()=>{
 const p=calendar(pack(),'2026-11-08'),before=JSON.stringify(p),q=run(p,F.NOW);a.equal(JSON.stringify(p),before);q.selected.freshness.calendar.source='changed output';a.equal(JSON.stringify(p),before);
});

test('imported calendar cannot launder explicit synthetic provenance',()=>{
 const p=pack();p.mode='imported';Object.assign(p.quotes[0],{synthetic:false,source:'Declared provider'});Object.assign(p.quotes[0].rights,{synthetic:false,reference:'https://example.invalid/rights'});
 calendar(p,'2026-11-08');a.equal(run(p,F.NOW).status,'invalid');
 Object.assign(p.sessionCalendar,{source:'Declared sample calendar',reference:'https://example.invalid/calendar'});a.notEqual(run(p,F.NOW).status,'invalid');
 for(const change of [c=>c.synthetic=true,c=>c.source='Invented calendar',c=>c.source='SYNTHETIC calendar',c=>c.reference='https://example.invalid/synthetic',c=>c.reference='calendar reference',c=>c.reference='http://example.invalid/calendar']){const copy=JSON.parse(JSON.stringify(p));change(copy.sessionCalendar);a.equal(run(copy,F.NOW).status,'invalid',String(change));}
});

test('long holiday session preview explicitly withholds incompatible legacy valuation',()=>{
 const p=F.create(),exceptions={};for(let i=9;i<=13;i++)exceptions['2026-11-'+String(i).padStart(2,'0')]={status:'closed',reason:'Invented holiday'};
 calendar(p,'2026-11-16',exceptions);const r=M.analyzePack(p,'2026-11-16T19:00:00Z');
 a.equal(r.quote.status,'consistent-unverified');a.equal(r.quote.selected.freshness.status,'current-declared');a.equal(r.quote.selected.classification.stale,false);a.equal(r.quote.selected.verification,'unverified');a.equal(r.valuation,null);a.ok(r.issues.some(x=>x.includes('기존 가치평가의 4일 정책')));
 const normal=M.analyzePack(F.create(),F.NOW);a.equal(normal.valuation.decision.code,'review-buy');a.ok(!normal.issues.some(x=>x.includes('기존 가치평가의 4일 정책')));
});
