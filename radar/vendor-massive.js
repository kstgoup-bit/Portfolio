/* Offline raw JSON parser only. No fetch, authentication, persistence or live wiring.
 * Docs: https://massive.com/docs/rest/stocks/aggregates/custom-bars (2026-10-29).
 * Output intentionally incomplete: daily raw JSON alone cannot prove regular-session scope.
 */
'use strict';
function parseMassiveDaily(raw,{ticker,synthetic,requestTimespan,requestMultiplier}={}){
 const fail=()=>{throw new Error('MASSIVE_RAW_CONTRACT_INVALID');};
 if(synthetic!==true||requestTimespan!=='day'||requestMultiplier!==1||!['MSFT','GOOGL','AVGO','VRT','JPM','SPY','XLK','XLC','XLI','XLF'].includes(ticker))fail();
 if(!raw||raw.status!=='OK'||raw.ticker!==ticker||raw.adjusted!==true||raw.next_url||!Array.isArray(raw.results)||!raw.results.length||raw.results.length>1000||raw.resultsCount!==raw.results.length)fail();
 const dates=new Set();const bars=raw.results.map(b=>{
  if(!Number.isSafeInteger(b.t)||b.t<0||!Number.isFinite(b.h)||!Number.isFinite(b.c)||b.c<=0||b.h<b.c)fail();
  let date;try{const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(b.t);const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));date=p.year+'-'+p.month+'-'+p.day;}catch{fail();}
  if(dates.has(date))fail();dates.add(date);return {date,high:b.h,close:b.c};
 }).sort((a,b)=>a.date.localeCompare(b.date));
 return {synthetic:true,ticker,bars,adjustment:'split-adjusted',dividendAdjusted:false,session:'unverified',currency:null,exchange:null,fetchedAt:null,delay:null,source:{name:'Massive',url:'https://massive.com/docs/rest/stocks/aggregates/custom-bars'},missing:['정규장 한정 확인','통화·거래소','수집 시각·지연','검증된 거래일 캘린더','실제 이용권·인증'],readyForSignals:false};
}
module.exports={parseMassiveDaily};
