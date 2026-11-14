'use strict';
// 합성 시험: 미국 지수(QQQ·SPY)도 설정된 GAS 경로로 받고, 장 마감 후 기록한 점은 마감 후 받은 당일 종가를 쓸 수 있다.
const test=require('node:test'),a=require('node:assert/strict');
const H=require('../has/benchmark-history-policy.js'),B=require('../backup/core.js');
const mk=(sym,receipt,rmt,dates)=>({[sym]:{source:'yahoo-chart-v8',symbol:sym,currency:'USD',exchange:'NMS',timezone:'America/New_York',instrumentType:'ETF',adjustment:'unverified',regularMarketTime:rmt,regularMarketPrice:103,fiftyTwoWeekHigh:150,barCount:dates.length,bars:dates.map((d,i)=>({d,c:101+i}))}});
const R1='2026-11-13T00:30:00.000Z',N1=Date.parse(R1),DATES=['2026-11-10','2026-11-11','2026-11-12'];
const store=(sym,receipt,rmt)=>{const c=H.parseGasHistory(mk(sym,receipt,rmt,DATES),sym,receipt,{mode:'configured-gas'});a.equal(c.ok,true);a.equal(c.source,'yahoo-chart-v8-via-gas');const m=H.mergeHistoryStore(null,null,c,sym,Date.parse(receipt));a.equal(m.ok,true);return m.store;};
test('QQQ·SPY GAS 후보 수용, 모드 생략·잘못된 거래소는 거부, 저장 검증 통과',()=>{
 for(const sym of ['QQQ','SPY']){const s=store(sym,R1,'2026-11-12T21:05:00.000Z');a.equal(H.validateStore(s,null,N1).ok,true);B.validateStoredValue('v5_benchHistV2',JSON.stringify(s));
  a.equal(H.parseGasHistory(mk(sym,R1,'2026-11-12T21:05:00.000Z',DATES),sym,R1).ok,false);
  const bad=mk(sym,R1,'2026-11-12T21:05:00.000Z',DATES);bad[sym].exchange='KSE';a.equal(H.parseGasHistory(bad,sym,R1,{mode:'configured-gas'}).ok,false);}
 a.equal(H.parseGasHistory(mk('QQQ',R1,'2026-11-12T21:05:00.000Z',DATES),'KS200',R1,{mode:'configured-gas'}).ok,false);
});
test('마감 후 기록한 점만 마감 후 받은 당일 종가 사용(옵션), 기본·마감 전·마감 전 수신은 이전 날짜',()=>{
 const s=store('QQQ',R1,'2026-11-12T21:05:00.000Z'),pts=H.readStore(s,null,N1).series.QQQ.points;
 const after=Date.parse('2026-11-12T22:00:00Z'),before=Date.parse('2026-11-12T18:00:00Z');
 const on=H.selectPointAtOrBefore(pts,'QQQ',after,{now:N1,sameDayAfterClose:true});a.equal(on.ok,true);a.equal(on.date,'2026-11-12');a.equal(on.sameDayClose,true);a.equal(on.lagged,false);a.equal(on.finality,'provisional');a.equal(on.latestness,'unconfirmed');
 const off=H.selectPointAtOrBefore(pts,'QQQ',after,{now:N1});a.equal(off.date,'2026-11-11');a.equal(off.sameDayClose,false);a.equal(off.lagged,true);
 const pre=H.selectPointAtOrBefore(pts,'QQQ',before,{now:N1,sameDayAfterClose:true});a.equal(pre.date,'2026-11-11');a.equal(pre.sameDayClose,false);
 const early='2026-11-12T20:30:00.000Z',s2=store('QQQ',early,'2026-11-12T20:20:00.000Z'),p2=H.readStore(s2,null,N1).series.QQQ.points;
 const early1=H.selectPointAtOrBefore(p2,'QQQ',after,{now:N1,sameDayAfterClose:true});a.equal(early1.date,'2026-11-11');a.equal(early1.sameDayClose,false);
});
test('한국 ETF도 15:30 마감 이후 수신·기록한 당일만 허용',()=>{
 const R='2026-11-12T07:30:00.000Z',N=Date.parse(R),d=['2026-11-10','2026-11-11','2026-11-12'];
 const c=H.parseGasHistory({'069500':{source:'yahoo-chart-v8',symbol:'069500.KS',currency:'KRW',exchange:'KSE',timezone:'Asia/Seoul',instrumentType:'ETF',adjustment:'unverified',regularMarketTime:'2026-11-12T06:40:00.000Z',regularMarketPrice:103,fiftyTwoWeekHigh:150,barCount:3,bars:d.map((x,i)=>({d:x,c:101+i}))}},'KS200',R,{mode:'configured-gas'});a.equal(c.ok,true);
 const pts=H.readStore(H.mergeHistoryStore(null,null,c,'KS200',N).store,null,N).series.KS200.points;
 a.equal(H.selectPointAtOrBefore(pts,'KS200',Date.parse('2026-11-12T07:00:00Z'),{now:N,sameDayAfterClose:true}).date,'2026-11-12');
 a.equal(H.selectPointAtOrBefore(pts,'KS200',Date.parse('2026-11-12T05:00:00Z'),{now:N,sameDayAfterClose:true}).date,'2026-11-11');
});
