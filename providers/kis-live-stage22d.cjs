'use strict';
// Server API: credentials and token remain in closures. No CLI, browser route, or logging.
const Q=require('./kis-readonly-stage22c.cjs'),A=require('./kis-auth-plan-stage22c.cjs'),{createWire}=require('./kis-https-stage22d.cjs');
const fields=(v,n)=>!!v&&Object.keys(v).sort().join(',')===n.slice().sort().join(',');
const safe=(code,requestId=null)=>({ok:false,code,requestId,held:true,realVerified:false,signalEnabled:false,quotes:[]});
const text=s=>typeof s==='string'&&s.length>0&&s.length<=4096&&/^[\x21-\x7e]+$/.test(s);
function expiry(payload,started,now){
 if(!payload||payload.rt_cd!==undefined&&payload.rt_cd!=='0'||payload.token_type!=='Bearer'||!text(payload.access_token)||!Number.isInteger(payload.expires_in)||payload.expires_in<1||payload.expires_in>86400||!/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(payload.access_token_token_expired||''))throw Error('AUTH_RESPONSE_INVALID');
 const absolute=Date.parse(payload.access_token_token_expired.replace(' ','T')+'+09:00');
 if(!Number.isFinite(absolute)||new Date(absolute+9*3600000).toISOString().slice(0,19).replace('T',' ')!==payload.access_token_token_expired)throw Error('AUTH_RESPONSE_INVALID');
 const expiresAt=Math.min(started+payload.expires_in*1000,absolute)-60000;
 if(expiresAt<=now)throw Error('TOKEN_EXPIRED');return expiresAt;
}
function calendarOK(p,c,now){
 if(!c||c.market!==p.market||c.timezone!==p.timezone||c.date!==p.date||c.tradingDay!==true||c.regularClosed!==true||typeof c.source!=='string'||!c.source.trim()||!/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(c.closeAt||''))return false;
 const t=Date.parse(c.closeAt);if(!Number.isFinite(t)||t>now||now-t>14*86400000)return false;
 const local=new Intl.DateTimeFormat('en-CA',{timeZone:p.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t));return local===p.date;
}
function parseQuote(p,payload,fetchedAt){
 if(!payload||payload.rt_cd!=='0')return safe('KIS_RESPONSE_ERROR');
 if(payload.output1?.stck_shrn_iscd&&payload.output1.stck_shrn_iscd!==p.symbol)return safe('IDENTITY_MISMATCH');
 const rows=payload.output2;if(!Array.isArray(rows))return safe('SCHEMA_MISMATCH');
 const daykey=p.market==='KR'?'stck_bsop_date':'xymd',pricekey=p.market==='KR'?'stck_clpr':'clos',date=p.date.replaceAll('-','');
 const selected=rows.filter(r=>r&&r[daykey]===date);if(selected.length!==1)return safe(selected.length?'DUPLICATE_DATE':'MISSING_DATE');
 const raw=selected[0][pricekey];if(typeof raw!=='string'||!/^\d+(?:\.\d+)?$/.test(raw)||!Number.isFinite(Number(raw))||Number(raw)<=0)return safe('INVALID_PRICE');
 return {ok:true,code:'OBSERVED_NOT_INDEPENDENTLY_VERIFIED',held:true,realVerified:false,signalEnabled:false,quotes:[{symbol:p.symbol,market:p.market,currency:p.currency,exchange:p.exchange,timezone:p.timezone,asOf:p.date,fetchedAt,close:Number(raw),provider:'KIS',source:'https://openapi.koreainvestment.com:9443'+p.path,priceKind:'daily-close-unverified',requestedPriceKind:p.priceKind,adjustment:'unconfirmed',verification:'unverified',corporateActionChecked:false,isSynthetic:false}]};
}
function createClient({budget,lease,getCredentials,readiness,wire=createWire(),now=Date.now}={}){
 if(!budget||!['reserve','complete','snapshot'].every(k=>typeof budget[k]==='function')||!lease||typeof lease.assertHeld!=='function'||typeof lease.release!=='function'||typeof getCredentials!=='function'||readiness?.secureServerContext!==true||readiness?.freeBasicRestConfirmed!==true||typeof wire.send!=='function'||typeof now!=='function')throw Error('LIVE_READINESS_REQUIRED');
 let credentials=null,token=null,expiresAt=0,busy=false,authPreparing=false,stopped=false,lastTime=-Infinity,lastAttempt=-Infinity;
 function clock(){const t=now();if(!Number.isFinite(t)||t<lastTime)throw Error('CLOCK_INVALID');lastTime=t;return t;}
 function finishStop(){stopped=true;credentials=null;token=null;expiresAt=0;}
 async function run(plan,parse){
  if(stopped)return safe('SESSION_STOPPED');if(busy)return safe('SESSION_BUSY');busy=true;let entry;
  try{
   lease.assertHeld();const started=clock();
   if(started-lastAttempt<1000)return safe('RATE_WAIT_REQUIRED');
   // Any unresolved earlier attempt blocks a new call, including after process restart.
   const history=budget.snapshot().entries;
   if(history.some(e=>e.status==='reserved'))throw Error('UNRESOLVED_REQUEST');
   if(history.some(e=>started-Date.parse(e.startedAt)<1000))return safe('RATE_WAIT_REQUIRED');
   if(plan.operation==='AUTH'&&history.some(e=>e.operation==='AUTH'&&started-Date.parse(e.startedAt)<60000))return safe('AUTH_RATE_WAIT_REQUIRED');
   entry=budget.reserve(plan,new Date(started).toISOString());lastAttempt=started;
   let payload;
   try{payload=await wire.send(plan,credentials,token);}catch(e){
    const code=/^(?:REQUEST_TIMEOUT|NETWORK_FAILURE|RESPONSE_INTERRUPTED|RESPONSE_TYPE_INVALID|RESPONSE_TOO_LARGE|INVALID_JSON|INVALID_RESPONSE|HTTP_\d{3})$/.test(e?.message||'')?e.message:'TRANSPORT_FAILED';
    budget.complete(entry.id,code==='REQUEST_TIMEOUT'?'timeout':'error');finishStop();return safe(code,entry.id);
   }
   const out=parse(payload,started,clock());
   budget.complete(entry.id,out.ok?'ok':'error');if(!out.ok)finishStop();return {...out,requestId:entry.id};
  }catch{finishStop();return safe('EXECUTION_BLOCKED',entry?.id||null);}finally{busy=false;}
 }
 return Object.freeze({
  async authenticate(){
   if(stopped)return safe('SESSION_STOPPED');if(busy||authPreparing)return safe('SESSION_BUSY');authPreparing=true;
   try{
    lease.assertHeld();const t=clock();if(token&&t<expiresAt){authPreparing=false;return {ok:true,code:'TOKEN_REUSED',expiresAt:new Date(expiresAt).toISOString()};}
    token=null;credentials=await getCredentials();
    if(!fields(credentials,['appKey','appSecret'])||!text(credentials.appKey)||!text(credentials.appSecret))throw Error();
    credentials=Object.freeze({appKey:credentials.appKey,appSecret:credentials.appSecret});
   }catch{authPreparing=false;finishStop();return safe('CREDENTIALS_UNAVAILABLE');}
   try{return await run(A.authPlan(),(payload,started,t)=>{try{expiresAt=expiry(payload,started,t);token=payload.access_token;return {ok:true,code:'AUTHENTICATED',expiresAt:new Date(expiresAt).toISOString()};}catch{return safe('AUTH_RESPONSE_INVALID');}});}finally{authPreparing=false;}
  },
  async quote(input){
   if(stopped)return safe('SESSION_STOPPED');if(busy||authPreparing)return safe('SESSION_BUSY');
   let p;try{if(!fields(input,['symbol','date','calendar']))throw Error();p=Q.quotePlan(input.symbol,input.date);if(!calendarOK(p,input.calendar,clock()))throw Error();}catch{return safe('QUOTE_BASIS_INVALID');}
   try{
    lease.assertHeld();if(!token||clock()>=expiresAt){token=null;return safe('AUTHENTICATION_REQUIRED');}
    const past=budget.snapshot().entries;if(!past.some(e=>e.operation==='KR_CLOSE'&&e.status==='ok')&&p.symbol!=='005930')return safe('FIRST_KR_QUOTE_REQUIRED');
   }catch{finishStop();return safe('EXECUTION_BLOCKED');}
   return run(p,(payload,started,t)=>parseQuote(p,payload,new Date(t).toISOString()));
  },
  close(){if(busy||authPreparing)return safe('SESSION_BUSY');finishStop();try{lease.release();return {ok:true,code:'CLOSED'};}catch{return safe('LEASE_RELEASE_FAILED');}}
 });
}
module.exports={createClient,expiry,parseQuote,calendarOK};
