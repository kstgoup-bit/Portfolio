/* Provider contract only. No endpoint, key lookup, storage or live connection. */
(function(root,f){if(typeof module==='object'&&module.exports)module.exports=f();else root.KSTRadarProviders=f();})(globalThis,function(){
 'use strict';
 const PILOT=Object.freeze(['MSFT','GOOGL','AVGO','VRT','JPM']);
 const SECTOR=Object.freeze({MSFT:'XLK',GOOGL:'XLC',AVGO:'XLK',VRT:'XLI',JPM:'XLF'});
 const date=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
 const url=x=>{try{const u=new URL(x);return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&!u.search;}catch{return false;}};
 const finite=x=>typeof x==='number'&&Number.isFinite(x);
 function error(code){const e=new Error(code);e.code=code;return e;}
 function gate(grant,now){
  const reasons=[];
  if(!grant || !['apiQuery','store','display','personalUse','authenticationReady'].every(k=>grant[k]===true))reasons.push('RIGHTS_OR_AUTH_UNCONFIRMED');
  if(!date(grant?.checkedAt)||!url(grant?.termsURL)||typeof grant?.provider!=='string'||!grant.provider.trim())reasons.push('GRANT_EVIDENCE_MISSING');
  if(!date(grant?.expiresOn)||!date(now)||grant.expiresOn<now||grant.checkedAt>now)reasons.push('GRANT_DATE_INVALID');
  return {allowed:reasons.length===0,reasons};
 }
 function freshness(asOf,{expectedSession=null,today=new Date().toISOString().slice(0,10),maxCalendarDays=4}={}){
  if(!date(asOf)||!date(today)||asOf>today)return {status:'unknown',asOf,expectedSession};
  if(expectedSession!==null){if(!date(expectedSession)||expectedSession>today)return {status:'unknown',asOf,expectedSession};return {status:asOf===expectedSession?'fresh':asOf<expectedSession?'stale':'unknown',asOf,expectedSession};}
  const ageDays=(Date.parse(today)-Date.parse(asOf))/86400000;
  return {status:ageDays>maxCalendarDays?'stale':'dated',asOf,ageDays}; // No exchange calendar: never assert latest/fresh.
 }
 function calendarCheck(calendar){
  if(!calendar||!date(calendar.asOf)||!date(calendar.windowStart)||!date(calendar.comparisonStart)||!date(calendar.checkedAt)||!url(calendar.sourceURL)||typeof calendar.closeTime!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(calendar.closeTime)||!Number.isFinite(Date.parse(calendar.closeTime))||!Array.isArray(calendar.sessions))throw error('CALENDAR_MISSING');
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(calendar.closeTime)).map(p=>[p.type,p.value]));if(parts.year+'-'+parts.month+'-'+parts.day!==calendar.asOf)throw error('CALENDAR_CLOSE_DATE_INVALID');
  const days=(Date.parse(calendar.asOf)-Date.parse(calendar.windowStart))/86400000;
  const rel=(Date.parse(calendar.asOf)-Date.parse(calendar.comparisonStart))/86400000;
  if(days<360||days>370||rel<80||rel>100||calendar.sessions.length<240||calendar.sessions.length>265||!calendar.sessions.includes(calendar.comparisonStart)||calendar.sessions.at(-1)!==calendar.asOf)throw error('CALENDAR_RANGE_INVALID');
  calendar.sessions.forEach((d,i,a)=>{if(!date(d)||d<calendar.windowStart||d>calendar.asOf||(i&&d<=a[i-1]))throw error('CALENDAR_SESSIONS_INVALID');});
 }
 function currentCalendar(calendar,now){
  calendarCheck(calendar);if(!Number.isFinite(Date.parse(now)))throw error('CLOCK_MISSING');
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now)).map(p=>[p.type,p.value]));const today=parts.year+'-'+parts.month+'-'+parts.day;
  if(calendar.checkedAt!==String(now).slice(0,10)||!['dated'].includes(freshness(calendar.asOf,{today}).status)||Date.parse(now)<Date.parse(calendar.closeTime))throw error('CALENDAR_STALE_OR_PREMATURE');
 }
 function normalizedSeries(row,calendar,now){
  if(!row||typeof row.ticker!=='string'||!['NASDAQ','NYSE','NYSEARCA','AMEX'].includes(row.exchange)||row.currency!=='USD'||row.timezone!=='America/New_York'||row.adjustment!=='split-adjusted'||row.session!=='regular'||!url(row.source?.url)||(typeof row.source?.name!=='string'||!row.source.name.trim())||!['eod','delayed','none'].includes(row.delay))throw error('PRICE_METADATA_MISSING');
  if(row.asOf!==calendar.asOf)throw error('STALE_OR_MISMATCHED_SESSION');
  if(typeof row.fetchedAt!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(row.fetchedAt)||!Number.isFinite(Date.parse(row.fetchedAt))||Date.parse(row.fetchedAt)>Date.parse(now)+60000||Date.parse(row.fetchedAt)<Date.parse(row.asOf))throw error('FETCH_TIME_INVALID');
  if(Date.parse(row.fetchedAt)<Date.parse(calendar.closeTime)||Date.parse(now)<Date.parse(calendar.closeTime))throw error('BEFORE_REGULAR_CLOSE');
  if(!Array.isArray(row.bars)||row.bars.length>1000)throw error('BARS_MISSING');
  const map=new Map();for(const b of row.bars){if(!date(b.date)||map.has(b.date)||!finite(b.close)||b.close<=0||!finite(b.high)||b.high<b.close)throw error('DUPLICATE_OR_INVALID_BAR');map.set(b.date,b);}
  if(calendar.sessions.some(d=>!map.has(d)))throw error('SESSION_GAP');
  return {row,map,close:map.get(calendar.asOf).close,high:Math.max(...calendar.sessions.map(d=>map.get(d).high)),pct:(map.get(calendar.asOf).close/map.get(calendar.comparisonStart).close-1)*100};
 }
 function normalizeBatch(payload,{calendar,now,allowSynthetic=false}={}){
  currentCalendar(calendar,now);
  if(payload?.schemaVersion!==1||!Array.isArray(payload.instruments)||!Array.isArray(payload.references)||(!allowSynthetic&&payload.synthetic===true))throw error('PAYLOAD_MODE_OR_SCHEMA_INVALID');
  const stocks=new Map(),refs=new Map();
  for(const row of payload.instruments){if(!PILOT.includes(row.ticker)||stocks.has(row.ticker))throw error('UNEXPECTED_OR_DUPLICATE_TICKER');stocks.set(row.ticker,row);}
  const referenceSymbols=new Set(['SPY',...Object.values(SECTOR)]);
  for(const row of payload.references){if(!referenceSymbols.has(row.ticker)||refs.has(row.ticker)||stocks.has(row.ticker))throw error('UNEXPECTED_OR_DUPLICATE_REFERENCE');refs.set(row.ticker,row);}
  const quotes=[],failures=[],referenceFailures=[];const normalizedRefs=new Map();
  for(const[ticker,row]of refs)try{normalizedRefs.set(ticker,normalizedSeries(row,calendar,now));}catch(e){referenceFailures.push({ticker,code:e.code||'REFERENCE_INVALID'});}
  for(const ticker of PILOT){
   try{
    const n=normalizedSeries(stocks.get(ticker),calendar,now),r=n.row,m=normalizedRefs.get('SPY'),s=normalizedRefs.get(SECTOR[ticker]);
    quotes.push({ticker,company:r.company||ticker,exchange:r.exchange,asOf:r.asOf,close:n.close,high52w:n.high,high52wStart:calendar.windowStart,high52wEnd:r.asOf,currency:r.currency,timezone:r.timezone,adjustment:r.adjustment,source:{name:r.source.name,url:r.source.url},fetchedAt:r.fetchedAt,delay:r.delay,session:r.session,synthetic:payload.synthetic===true,calendarSource:calendar.sourceURL,
     performance:{start:calendar.comparisonStart,end:r.asOf,stockPct:n.pct,marketPct:m?.pct??null,sectorPct:s?.pct??null,benchmark:'SPY',sectorETF:SECTOR[ticker],adjustment:r.adjustment,currency:r.currency},
     comparisonSources:{SPY:m?.row.source??null,sector:s?.row.source??null}});
   }catch(e){failures.push({ticker,code:e.code||'PRICE_INVALID'});}
  }
  return {schemaVersion:1,mode:payload.synthetic===true?'demo':'real',quotes,assessments:[],collection:{requestedSymbols:PILOT.slice(),valid:quotes.length,failed:failures.length,failures,referenceFailures,synthetic:payload.synthetic===true}};
 }
 function createPilotProvider({transport,grant,calendar,clock=()=>new Date().toISOString()}={}){
  return {id:'kst-daily-bars-contract-v1',mode:'real',async load({signal}={}){
   const now=clock(),g=gate(grant,String(now).slice(0,10));if(!g.allowed)throw error('PILOT_BLOCKED_RIGHTS_OR_AUTH');
   currentCalendar(calendar,now);if(calendar.verification!=='verified')throw error('CALENDAR_UNVERIFIED');
   if(typeof transport!=='function')throw error('TRANSPORT_UNCONFIGURED');
   if(signal?.aborted)throw error('ABORTED');
   let r;try{r=await transport({tickers:PILOT.slice(),signal});}catch{throw error(signal?.aborted?'ABORTED':'TRANSPORT_FAILED');}
   if(!r||r.status!==200)throw error('HTTP_'+([401,403,429,500,503].includes(r?.status)?r.status:'ERROR'));
   if(signal?.aborted)throw error('ABORTED');
   if(r.data?.Information||r.data?.Note||r.data?.['Error Message'])throw error('PROVIDER_LIMIT_OR_ERROR');
   const result=normalizeBatch(r.data,{calendar,now});
   if(result.quotes.some(q=>q.source.name!==grant.provider||Object.values(q.comparisonSources).some(s=>s&&s.name!==grant.provider)))throw error('PROVIDER_IDENTITY_MISMATCH');
   return result;
  }};
 }
 function planBudget({stockCount=200,referenceCount=12,requestsPerSymbol=1,perMinute,perDay=null}={}){
  if(![stockCount,referenceCount].every(n=>Number.isInteger(n)&&n>=0)||!Number.isInteger(requestsPerSymbol)||requestsPerSymbol<1||!finite(perMinute)||perMinute<=0||(perDay!==null&&(!finite(perDay)||perDay<=0)))throw error('BUDGET_INPUT_INVALID');
  const requests=(stockCount+referenceCount)*requestsPerSymbol;
  return {assumedRequests:requests,minuteWindows:Math.ceil(requests/perMinute),dailyCapacitySufficient:perDay===null?null:requests<=perDay,assumed:true,actualRequests:0};
 }
 async function collectSynthetic({symbols,transport,concurrency=4,maxAttempts=2}={}){
  if(!Array.isArray(symbols)||symbols.length>200||new Set(symbols).size!==symbols.length||symbols.some(t=>!/^TEST\d+$/.test(t))||transport?.synthetic!==true||!Number.isInteger(concurrency)||concurrency<1||concurrency>8||![1,2,3].includes(maxAttempts))throw error('SYNTHETIC_ONLY_CONTRACT');
  let next=0,attempts=0,peak=0,inFlight=0;const results=new Array(symbols.length);
  async function worker(){while(next<symbols.length){const i=next++,ticker=symbols[i];let success=false,used=0;while(used<maxAttempts&&!success){used++;attempts++;inFlight++;peak=Math.max(peak,inFlight);try{success=(await transport(ticker,{attempt:used}))?.ok===true;}catch{}finally{inFlight--;}}results[i]={ticker,success,attempts:used};}}
  await Promise.all(Array.from({length:Math.min(concurrency,symbols.length)},worker));
  return {mode:'synthetic-load-test',requested:symbols.length,succeeded:results.filter(r=>r.success).length,failed:results.filter(r=>!r.success).length,attempts,peakConcurrency:peak,actualMarketRequests:0,results};
 }
 return {PILOT,SECTOR,gate,freshness,normalizeBatch,createPilotProvider,planBudget,collectSynthetic};
});
