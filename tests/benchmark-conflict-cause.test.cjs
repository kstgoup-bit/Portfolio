'use strict';
// GPT-20261117-0730 1단계: 기준지수 보류충돌 원인 합성 진단. 합성 자료만, 운영 코드·저장소 무변경.
const test=require('node:test'),a=require('node:assert/strict');
const H=require('../has/benchmark-history-policy.js'),B=require('../backup/core.js');
const BASE=['2026-11-10','2026-11-11','2026-11-12','2026-11-13'];
const gas=(sym,receipt,bars)=>{const c=H.parseGasHistory({[sym]:{source:'yahoo-chart-v8',symbol:sym,currency:'USD',exchange:'NYSEArca',timezone:'America/New_York',instrumentType:'ETF',adjustment:'unverified',regularMarketTime:null,regularMarketPrice:null,fiftyTwoWeekHigh:null,barCount:bars.length,bars}},sym,receipt,{mode:'configured-gas'});a.equal(c.ok,true,c.reason);return c;};
const yahoo=(sym,receipt,bars,lastTs)=>{const ts=bars.map((b,i)=>i===bars.length-1&&lastTs?lastTs:Date.parse(b.d+'T14:30:00Z')/1000);
 const c=H.parseYahoo({chart:{error:null,result:[{meta:{symbol:sym,currency:'USD',exchangeTimezoneName:'America/New_York',instrumentType:'ETF',dataGranularity:'1d',exchangeName:'PCX',fullExchangeName:'NYSEArca'},timestamp:ts,indicators:{quote:[{close:bars.map(b=>b.c)}]}}]}},sym,receipt);a.equal(c.ok,true,c.reason);return c;};
const av=(sym,receipt,bars)=>{const rows={};bars.forEach(b=>{const s=String(b.c);rows[b.d]={'1. open':s,'2. high':s,'3. low':s,'4. close':s,'5. volume':'100'};});
 const c=H.parseAlphaVantage({'Meta Data':{'1. Information':'Daily Prices (open, high, low, close) and Volumes','2. Symbol':sym,'3. Last Refreshed':bars[bars.length-1].d,'4. Output Size':'Compact','5. Time Zone':'US/Eastern'},'Time Series (Daily)':rows},sym,receipt);a.equal(c.ok,true,c.reason);return c;};
const bars=(dates,last)=>dates.map((d,i)=>({d,c:i===dates.length-1&&last!==undefined?last:100+i}));
const merge=(store,c,sym,receipt)=>H.mergeHistoryStore(store,null,c,sym,Date.parse(receipt));
const conflicts=(store,sym)=>store.series[sym]?store.series[sym].conflicts:[];
// 미국 장중: 2026-11-16 15:00Z(10:00 ET) / 16:45Z(11:45 ET, KST 01:45) / 장 마감 후 22:00Z(17:00 ET, KST 07:00) / 다음 시장일 2026-11-17 15:00Z
const R_IN1='2026-11-16T15:00:00.000Z',R_IN2='2026-11-16T16:45:00.000Z',R_POST='2026-11-16T22:00:00.000Z',R_NEXT='2026-11-17T15:00:00.000Z';
const D16=BASE.concat('2026-11-16'),D17=D16.concat('2026-11-17');

test('(a) 같은 시장일 장중 두 번 다른 값 → pending-review 충돌 1건(가설1 코드상 가능)',()=>{
 const s1=merge(null,gas('SPY',R_IN1,bars(D16,748.12)),'SPY',R_IN1);a.equal(s1.ok,true);
 const p=H.readStore(s1.store,null,Date.parse(R_IN1)).series.SPY.byDate['2026-11-16'];a.equal(p.finality,'provisional');
 const s2=merge(s1.store,gas('SPY',R_IN2,bars(D16,745.82)),'SPY',R_IN2);a.equal(s2.ok,true);
 a.equal(conflicts(s2.store,'SPY').length,1);a.equal(conflicts(s2.store,'SPY')[0].status,'pending-review');
});
test('(a2) 한국 시간 아침(미국 장 마감 후, 같은 미국 시장일) 수신도 provisional·successor 불가 → pending-review',()=>{
 const s1=merge(null,gas('SPY',R_IN2,bars(D16,748.12)),'SPY',R_IN2);
 const s2=merge(s1.store,gas('SPY',R_POST,bars(D16,745.82)),'SPY',R_POST);
 a.equal(s2.ok,true);a.equal(conflicts(s2.store,'SPY')[0].status,'pending-review');
 a.equal(H.readStore(s2.store,null,Date.parse(R_POST)).series.SPY.pendingConflicts.length,1);
});
test('(b) 장중 1회 후 다음 시장일 같은 출처 → provisional-successor(정상), 그러나 장중 2회였으면 pending이 successor를 막음',()=>{
 const one=merge(null,gas('SPY',R_IN1,bars(D16,748.12)),'SPY',R_IN1);
 const ok=merge(one.store,gas('SPY',R_NEXT,bars(D17,750)),'SPY',R_NEXT);
 // D17의 11-16 값은 bars()가 100+4=104로 만든다 → 원래 값과 다름. 같은 출처·다음 시장일이므로 successor.
 a.equal(ok.ok,true);a.equal(conflicts(ok.store,'SPY').length,1);a.equal(conflicts(ok.store,'SPY')[0].status,'provisional-successor');
 a.deepEqual(ok.acceptedDates,['2026-11-17']);
 const two=merge(one.store,gas('SPY',R_IN2,bars(D16,747)),'SPY',R_IN2);
 const blocked=merge(two.store,gas('SPY',R_NEXT,bars(D17,750)),'SPY',R_NEXT);
 a.equal(blocked.ok,true);a.equal(conflicts(blocked.store,'SPY').filter(c=>c.d==='2026-11-16'&&c.status==='pending-review').length,2);
 a.equal(conflicts(blocked.store,'SPY').some(c=>c.status==='provisional-successor'),false);
});
test('(c) 다음 시장일이라도 출처가 다르면(GAS → Yahoo 직접) successor 불가 → pending-review',()=>{
 const one=merge(null,gas('SPY',R_IN1,bars(D16,748.12)),'SPY',R_IN1);
 const y=merge(one.store,yahoo('SPY',R_NEXT,bars(D17,750)),'SPY',R_NEXT);
 a.equal(y.ok,true);a.equal(conflicts(y.store,'SPY')[0].status,'pending-review');a.equal(conflicts(y.store,'SPY')[0].alternative.source,'yahoo-chart-v8');
});
test('(c2) Yahoo 직접 경로는 마지막 봉 시각이 바뀌면 같은 값도 별도 충돌로 중복 기록될 수 있음(dedup 키에 providerBarTs 포함)',()=>{
 const base=merge(null,yahoo('SPY',R_IN1,bars(D16,748.12),Date.parse(R_IN1)/1000-60),'SPY',R_IN1);
 const x1=merge(base.store,yahoo('SPY',R_IN2,bars(D16,747),Date.parse(R_IN2)/1000-120),'SPY',R_IN2);
 const x2=merge(x1.store,yahoo('SPY',R_IN2,bars(D16,747),Date.parse(R_IN2)/1000-60),'SPY',R_IN2);
 a.equal(conflicts(x2.store,'SPY').length,2,'같은 값 747이 봉 시각만 달라 2건');
});
test('(d) 가격 종류 불일치(AV 원가격 vs Yahoo) 시 과거 날짜 전체가 충돌로 들어갈 수 있음 — 날짜 수만큼 누적',()=>{
 const one=merge(null,gas('SPY',R_IN1,bars(D16,748.12)),'SPY',R_IN1);
 const adj=bars(D17,750).map(b=>({d:b.d,c:+(b.c*0.99).toFixed(4)}));
 const m=merge(one.store,av('SPY',R_NEXT,adj),'SPY',R_NEXT);a.equal(m.ok,true);
 a.equal(conflicts(m.store,'SPY').filter(c=>c.status==='pending-review').length,D16.length,'기존 날짜 5개 모두 충돌');
});
test('(e) DST: closeTimeMs는 -05:00 고정 → 서머타임 기간 실제 마감(20:00Z)보다 1시간 늦게 판단(보수적), 조기폐장 미반영',()=>{
 a.equal(new Date(H.closeTimeMs('2026-07-15','US')).toISOString(),'2026-07-15T21:00:00.000Z');
 a.equal(new Date(H.closeTimeMs('2026-11-16','US')).toISOString(),'2026-11-16T21:00:00.000Z');
 a.equal(new Date(H.closeTimeMs('2026-11-27','US')).toISOString(),'2026-11-27T21:00:00.000Z','조기폐장일도 16:00 기준');
 // 서머타임 실제 마감 30분 후 수신(20:30Z)은 당일 종가 옵션에서 제외됨(보수적).
 const R='2026-07-15T20:30:00.000Z',d=['2026-07-13','2026-07-14','2026-07-15'];
 const s=merge(null,gas('QQQ',R,bars(d,500)),'QQQ',R),pts=H.readStore(s.store,null,Date.parse(R)).series.QQQ.points;
 a.equal(H.selectPointAtOrBefore(pts,'QQQ',Date.parse(R),{now:Date.parse(R),sameDayAfterClose:true}).date,'2026-07-14');
});
test('(f) 충돌 256 상한: 257번째 충돌이 생기면 새 날짜까지 포함한 병합 전체가 store-bound로 거절(차트 갱신 정지)',()=>{
 let st=merge(null,gas('SPY',R_IN1,bars(D16,700)),'SPY',R_IN1).store;
 const t0=Date.parse(R_IN1);
 for(let i=1;i<=256;i++){const r=new Date(t0+i*60000).toISOString();const m=merge(st,gas('SPY',r,bars(D16,700+i/100)),'SPY',r);a.equal(m.ok,true,'i='+i+' '+m.reason);st=m.store;}
 a.equal(conflicts(st,'SPY').length,256);
 const view=H.readStore(st,null,Date.parse(R_NEXT));a.equal(view.ok,true);a.equal(view.series.SPY.ok,true,'256건은 읽기·차트 가능');
 const same=merge(st,gas('SPY',R_NEXT,bars(D16,700)),'SPY',R_NEXT);
 a.equal(same.ok,true,'기존 값과 같고 새 날짜 없으면 통과');
 const next=merge(st,gas('SPY',R_NEXT,bars(D17,750)),'SPY',R_NEXT);
 a.equal(next.ok,false);a.equal(next.reason,'store-bound','11-17 새 날짜도 함께 거절');
 // (g) 백업 호환: 256건 저장소는 백업 검증 통과
 a.equal(H.validateStore(st,null,Date.parse(R_NEXT)).ok,true);
 a.doesNotThrow(()=>B.validateStoredValue('v5_benchHistV2',JSON.stringify(st)));
});
test('(f2) 정상 successor 전이도 conflicts 배열을 소비 — 정리(prune) 경로 없음',()=>{
 const one=merge(null,gas('SPY',R_IN1,bars(D16,748.12)),'SPY',R_IN1);
 const ok=merge(one.store,gas('SPY',R_NEXT,bars(D17,750)),'SPY',R_NEXT);
 a.equal(conflicts(ok.store,'SPY').length,1);a.equal(conflicts(ok.store,'SPY')[0].status,'provisional-successor');
});
test('(g2) 레거시 점(finality 없음)과 다른 값은 항상 pending-review(successor 불가)',()=>{
 const legacy=JSON.stringify({SPY:BASE.map((d,i)=>({ts:Date.parse(d+'T14:30:00Z'),close:100+i}))});
 const R=R_IN1,c=gas('SPY',R,bars(D16,748).map(b=>b.d==='2026-11-13'?{d:b.d,c:99}:b));
 const m=H.mergeHistoryStore(null,legacy,c,'SPY',Date.parse(R));a.equal(m.ok,true);
 const cf=conflicts(m.store,'SPY');a.equal(cf.length,1);a.equal(cf[0].status,'pending-review');a.equal(cf[0].d,'2026-11-13');
 a.equal(H.readStore(m.store,legacy,Date.parse(R)).ok,true);
});
