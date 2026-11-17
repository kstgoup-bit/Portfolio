'use strict';
// GPT-20261117-0730: 기준지수 보류충돌 원인 합성 진단(1단계) + 2단계 수정(장 마감+30분 전 당일 봉 미저장) 회귀 시험. 합성 자료만.
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

test('(a) 같은 시장일 장중 두 번 다른 값 → 당일 봉 미저장, 충돌 0 (2단계 수정)',()=>{
 const s1=merge(null,gas('SPY',R_IN1,bars(D16,748.12)),'SPY',R_IN1);a.equal(s1.ok,true);
 a.equal(H.readStore(s1.store,null,Date.parse(R_IN1)).series.SPY.byDate['2026-11-16'],undefined);
 a.deepEqual(s1.failures.filter(f=>f.reason==='intraday-not-persisted').map(f=>f.d),['2026-11-16']);
 const s2=merge(s1.store,gas('SPY',R_IN2,bars(D16,745.82)),'SPY',R_IN2);a.equal(s2.ok,true);
 a.equal(conflicts(s2.store,'SPY').length,0);a.equal(s2.changed,false);
});
test('(a2) 장중 미저장 → 한국 아침(미국 마감+30분 이후) 수신만 저장, 같은 값 재수신은 변화 없음',()=>{
 const s1=merge(null,gas('SPY',R_IN2,bars(D16,748.12)),'SPY',R_IN2);
 const s2=merge(s1.store,gas('SPY',R_POST,bars(D16,745.82)),'SPY',R_POST);
 a.equal(s2.ok,true);a.deepEqual(s2.acceptedDates,['2026-11-16']);a.equal(conflicts(s2.store,'SPY').length,0);
 const p=H.readStore(s2.store,null,Date.parse(R_POST)).series.SPY.byDate['2026-11-16'];a.equal(p.close,745.82);a.equal(p.finality,'provisional');
 const R2='2026-11-16T23:30:00.000Z',s3=merge(s2.store,gas('SPY',R2,bars(D16,745.82)),'SPY',R2);a.equal(s3.changed,false);a.equal(conflicts(s3.store,'SPY').length,0);
});
test('(a3) 마감 직후~30분 이내 수신(16:10 ET)도 미저장, 16:31 ET 이후 저장',()=>{
 const early='2026-11-16T21:10:00.000Z',late='2026-11-16T21:31:00.000Z';
 a.equal(merge(null,gas('SPY',early,bars(D16,745)),'SPY',early).failures.some(f=>f.d==='2026-11-16'&&f.reason==='intraday-not-persisted'),true);
 a.deepEqual(merge(null,gas('SPY',late,bars(D16,745)),'SPY',late).acceptedDates.slice(-1),['2026-11-16']);
});
test('(b) 마감 후 저장값 → 다음 시장일 같은 출처 다른 값은 provisional-successor (기존 규칙 유지)',()=>{
 const one=merge(null,gas('SPY',R_POST,bars(D16,748.12)),'SPY',R_POST);
 const ok=merge(one.store,gas('SPY',R_NEXT,bars(D17,750)),'SPY',R_NEXT);
 a.equal(ok.ok,true);a.equal(conflicts(ok.store,'SPY').length,1);a.equal(conflicts(ok.store,'SPY')[0].status,'provisional-successor');
 a.deepEqual(ok.acceptedDates,[],'11-17 은 장중이라 미저장');
});
test('(b2) 다음 날 장중에 여러 번 열어도 그날 봉은 비교·저장하지 않아 pending 0',()=>{
 const one=merge(null,gas('SPY',R_POST,bars(D16,748.12)),'SPY',R_POST);
 let st=one.store;for(const v of [751,752,753]){const m=merge(st,gas('SPY',R_NEXT,bars(D17,v).map(b=>b.d==='2026-11-16'?{d:b.d,c:748.12}:b)),'SPY',R_NEXT);a.equal(m.ok,true);st=m.store;}
 a.equal(conflicts(st,'SPY').filter(c=>c.status==='pending-review').length,0);
 a.equal(conflicts(st,'SPY').length,1,'같은 값 다음날 재확인은 successor 1건(기존 규칙, 1회만)');
});
test('(c) 남은 원인: 출처가 다르면(GAS → Yahoo 직접) successor 불가 → pending-review (이번 수정 범위 밖)',()=>{
 const one=merge(null,gas('SPY',R_POST,bars(D16,748.12)),'SPY',R_POST);
 const y=merge(one.store,yahoo('SPY',R_NEXT,bars(D17,750)),'SPY',R_NEXT);
 a.equal(y.ok,true);a.equal(conflicts(y.store,'SPY')[0].status,'pending-review');a.equal(conflicts(y.store,'SPY')[0].alternative.source,'yahoo-chart-v8');
});
test('(c2) 남은 원인: Yahoo 직접 경로는 봉 시각만 달라도 같은 값이 별도 충돌(dedup 키에 providerBarTs)',()=>{
 const P1='2026-11-16T22:00:00.000Z',P2='2026-11-16T23:00:00.000Z',P3='2026-11-16T23:30:00.000Z';
 const base=merge(null,yahoo('SPY',P1,bars(D16,748.12),Date.parse(P1)/1000-60),'SPY',P1);
 const x1=merge(base.store,yahoo('SPY',P2,bars(D16,747),Date.parse(P2)/1000-120),'SPY',P2);
 const x2=merge(x1.store,yahoo('SPY',P3,bars(D16,747),Date.parse(P3)/1000-60),'SPY',P3);
 a.equal(conflicts(x2.store,'SPY').length,2,'같은 값 747이 봉 시각만 달라 2건');
});
test('(d) 가격 종류 불일치(AV 원가격 vs Yahoo) 시 과거 날짜 전체가 충돌로 들어갈 수 있음 — 당일 장중 봉은 제외',()=>{
 const one=merge(null,gas('SPY',R_POST,bars(D16,748.12)),'SPY',R_POST);
 const adj=bars(D17,750).map(b=>({d:b.d,c:+(b.c*0.99).toFixed(4)}));
 const m=merge(one.store,av('SPY',R_NEXT,adj),'SPY',R_NEXT);a.equal(m.ok,true);
 a.equal(conflicts(m.store,'SPY').filter(c=>c.status==='pending-review').length,D16.length,'기존 날짜 5개 모두 충돌');
});
test('(e) DST: persistAfterMs 는 IANA 시간대 기준(서머타임 20:30Z, 표준시 21:30Z, 한국 07:00Z), closeTimeMs 는 기존 그대로',()=>{
 a.equal(new Date(H.persistAfterMs('2026-07-15','US')).toISOString(),'2026-07-15T20:30:00.000Z');
 a.equal(new Date(H.persistAfterMs('2026-11-16','US')).toISOString(),'2026-11-16T21:30:00.000Z');
 a.equal(new Date(H.persistAfterMs('2026-03-09','US')).toISOString(),'2026-03-09T20:30:00.000Z','2026-03-08 서머타임 시작 다음 날');
 a.equal(new Date(H.persistAfterMs('2026-11-16','KR')).toISOString(),'2026-11-16T07:00:00.000Z');
 a.equal(Number.isNaN(H.persistAfterMs('bad','US')),true);
 a.equal(new Date(H.closeTimeMs('2026-07-15','US')).toISOString(),'2026-07-15T21:00:00.000Z');
 const d=['2026-07-13','2026-07-14','2026-07-15'];
 a.equal(merge(null,gas('QQQ','2026-07-15T20:20:00.000Z',bars(d,500)),'QQQ','2026-07-15T20:20:00.000Z').acceptedDates.includes('2026-07-15'),false);
 a.equal(merge(null,gas('QQQ','2026-07-15T20:40:00.000Z',bars(d,500)),'QQQ','2026-07-15T20:40:00.000Z').acceptedDates.includes('2026-07-15'),true);
});
test('(e2) 한국 069500: 15:30+30분(16:00 KST) 전 수신 당일 미저장, 이후 저장',()=>{
 const kr=(R,last)=>H.parseGasHistory({'069500':{source:'yahoo-chart-v8',symbol:'069500.KS',currency:'KRW',exchange:'KSE',timezone:'Asia/Seoul',instrumentType:'ETF',adjustment:'unverified',regularMarketTime:null,regularMarketPrice:null,fiftyTwoWeekHigh:null,barCount:3,bars:[{d:'2026-11-12',c:80000},{d:'2026-11-13',c:80100},{d:'2026-11-16',c:last}]}},'KS200',R,{mode:'configured-gas'});
 const R1='2026-11-16T06:50:00.000Z',R2='2026-11-16T07:05:00.000Z';
 a.equal(H.mergeHistoryStore(null,null,kr(R1,80685),'KS200',Date.parse(R1)).acceptedDates.includes('2026-11-16'),false);
 a.equal(H.mergeHistoryStore(null,null,kr(R2,79625),'KS200',Date.parse(R2)).acceptedDates.includes('2026-11-16'),true);
});
test('(f) 충돌 256 상한(남은 위험): 257번째 충돌이 생기면 새 날짜까지 포함한 병합 전체가 store-bound로 거절',()=>{
 const t0=Date.parse(R_POST);let st=merge(null,gas('SPY',R_POST,bars(D16,700)),'SPY',R_POST).store;
 for(let i=1;i<=256;i++){const r=new Date(t0+i*60000).toISOString();const m=merge(st,gas('SPY',r,bars(D16,700+i/100)),'SPY',r);a.equal(m.ok,true,'i='+i+' '+m.reason);st=m.store;}
 a.equal(conflicts(st,'SPY').length,256);
 const view=H.readStore(st,null,Date.parse(R_NEXT));a.equal(view.ok,true);a.equal(view.series.SPY.ok,true,'256건은 읽기·차트 가능');
 const RN='2026-11-17T22:00:00.000Z';
 a.equal(merge(st,gas('SPY',RN,bars(D16,700)),'SPY',RN).ok,true,'기존 값과 같고 새 날짜 없으면 통과');
 const next=merge(st,gas('SPY',RN,bars(D17,750)),'SPY',RN);
 a.equal(next.ok,false);a.equal(next.reason,'store-bound','11-17 새 날짜도 함께 거절');
 // 256건 저장소 검증 통과만 확인. 복원 경로 (g)는 benchmark-conflict-backup-g.test.cjs 에서 분리 시험
 a.equal(H.validateStore(st,null,Date.parse(RN)).ok,true);
 a.doesNotThrow(()=>B.validateStoredValue('v5_benchHistV2',JSON.stringify(st)));
});
test('(f2) 장중 재조회만으로는 상한에 다가가지 않음(장중 300회 → 충돌 0)',()=>{
 const t0=Date.parse(R_IN1);let st=merge(null,gas('SPY',R_IN1,bars(D16,700)),'SPY',R_IN1).store;
 for(let i=1;i<=300;i++){const r=new Date(t0+i*60000).toISOString();const m=merge(st,gas('SPY',r,bars(D16,700+i/100)),'SPY',r);a.equal(m.ok,true);st=m.store;}
 a.equal(conflicts(st,'SPY').length,0);
});
test('(g2) 레거시 점(finality 없음)과 다른 과거 값은 여전히 pending-review, 당일 장중 봉은 미저장',()=>{
 const legacy=JSON.stringify({SPY:BASE.map((d,i)=>({ts:Date.parse(d+'T14:30:00Z'),close:100+i}))});
 const R=R_IN1,c=gas('SPY',R,bars(D16,748).map(b=>b.d==='2026-11-13'?{d:b.d,c:99}:b));
 const m=H.mergeHistoryStore(null,legacy,c,'SPY',Date.parse(R));a.equal(m.ok,true);
 const cf=conflicts(m.store,'SPY');a.equal(cf.length,1);a.equal(cf[0].status,'pending-review');a.equal(cf[0].d,'2026-11-13');
 a.deepEqual(m.acceptedDates,[]);a.equal(H.readStore(m.store,legacy,Date.parse(R)).ok,true);
});
