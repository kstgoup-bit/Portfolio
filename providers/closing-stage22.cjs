'use strict';
/* Stage22 A: offline fixture adapters only. No HTTP, credentials, storage or live execution.
 * KIS/KRX shapes remain draft until B-stage schema validation. Never upgrade to real verified. */
const PROFILES = Object.freeze({US:Object.freeze({timezone:'America/New_York',currency:'USD',exchange:'XNAS'}),KR:Object.freeze({timezone:'Asia/Seoul',currency:'KRW',exchange:'XKRX'})});
const CANDIDATES = Object.freeze([
  ...['MSFT','AVGO','GOOGL','NVDA','QTOP'].map(symbol=>Object.freeze({symbol,market:'US',instrument:symbol==='QTOP'?'etf':'stock',...PROFILES.US})),
  ...['005930','000660','035420','069500','360750'].map(symbol=>Object.freeze({symbol,market:'KR',instrument:['069500','360750'].includes(symbol)?'etf':'stock',...PROFILES.KR}))
]);
const fail = code => ({ok:false,code,held:true,label:'검증 보류',quotes:[],realVerified:false});
const day = s => typeof s==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10)===s;
const instant = s => typeof s==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(s) && Number.isFinite(Date.parse(s));
const date8 = s => typeof s==='string' && /^\d{8}$/.test(s) ? s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6):s;
const price = x => typeof x==='number'?x:(typeof x==='string' && /^\d+(?:\.\d+)?$/.test(x)?Number(x):NaN);
function plan(provider,symbol,date) {
  const c=CANDIDATES.find(c=>c.symbol===symbol); if(!c || !day(date))return fail('INVALID_REQUEST');
  if(!['kis','twelve','krx'].includes(provider) || provider==='krx' && c.market!=='KR')return fail('UNSUPPORTED_PROVIDER_MARKET');
  // Deliberately omit base URL, authentication, orders and real transport. Date is explicit, never "latest".
  const op=provider==='kis'?(c.market==='US'?'kis-us-daily-draft':'kis-kr-daily'):provider==='twelve'?'twelve-daily':'krx-'+c.instrument+'-daily-draft';
  return Object.freeze({ok:true,method:'GET',operation:op,provider,...c,date,adjustment:'none',session:'regular',priceKind:'regular-close',syntheticOnly:true});
}
function normalizeFixtureUnsafe(p,envelope,ctx) {
  if(!p || !p.ok || p.syntheticOnly!==true || !ctx || ctx.synthetic!==true || !envelope || envelope.synthetic!==true)return fail('SYNTHETIC_ONLY');
  const expected=plan(p.provider,p.symbol,p.date);
  if(!expected.ok || JSON.stringify(p)!==JSON.stringify(expected))return fail('PLAN_TAMPERED');
  const {fetchedAt,now,calendar}=ctx;
  if(!instant(fetchedAt)||!instant(now)||Date.parse(fetchedAt)>Date.parse(now)||Date.parse(p.date)>Date.parse(fetchedAt)||Date.parse(now)-Date.parse(fetchedAt)>4*86400000||Date.parse(now)-Date.parse(p.date)>5*86400000)return fail('TIME_INVALID');
  const profile=PROFILES[p.market];
  if(!calendar || calendar.synthetic!==true || calendar.market!==p.market || calendar.timezone!==p.timezone || calendar.date!==p.date || calendar.tradingDay!==true || calendar.regularClosed!==true || !instant(calendar.closeAt)|| Date.parse(calendar.closeAt)>Date.parse(fetchedAt))return fail('CALENDAR_UNCONFIRMED');
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:p.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(calendar.closeAt));
  const part=k=>parts.find(x=>x.type===k).value;
  if([part('year'),part('month'),part('day')].join('-')!==p.date)return fail('CALENDAR_UNCONFIRMED');
  const binding=envelope.binding;
  if(!binding || ['symbol','exchange','currency','timezone'].some(k=>binding[k]!==p[k]))return fail('IDENTITY_MISMATCH');
  const payload=envelope.payload; let rows;
  if(!payload || typeof payload!=='object')return fail('SCHEMA_MISMATCH');
  if(p.provider==='kis') {
    if(payload.rt_cd!=='0')return fail('PROVIDER_ERROR');
    if(!Array.isArray(payload.output2))return fail('SCHEMA_MISMATCH');
    rows=payload.output2.map(r=>({date:date8(p.market==='KR'?r.stck_bsop_date:r.xymd),close:p.market==='KR'?r.stck_clpr:r.clos}));
  } else if(p.provider==='twelve') {
    if(payload.status==='error')return fail(payload.code===429?'RATE_LIMITED':'PROVIDER_ERROR');
    if(!payload.meta || payload.meta.symbol!==p.symbol || payload.meta.currency!==p.currency || payload.meta.exchange_timezone!==p.timezone || payload.meta.mic_code!==p.exchange || payload.meta.interval!=='1day' || !Array.isArray(payload.values))return fail('IDENTITY_OR_SCHEMA_MISMATCH');
    rows=payload.values.map(r=>({date:r.datetime,close:r.close}));
  } else {
    if(!Array.isArray(payload.OutBlock_1))return fail('SCHEMA_MISMATCH');
    rows=payload.OutBlock_1.filter(r=>r.ISU_SRT_CD===p.symbol).map(r=>({date:date8(r.BAS_DD),close:r.TDD_CLSPRC}));
  }
  if(rows.some(r=>!day(r.date)))return fail('INVALID_MARKET_DATE');
  const selected=rows.filter(r=>r.date===p.date);
  if(selected.length===0)return fail('MISSING_DATE');
  if(selected.length!==1)return fail('DUPLICATE_DATE');
  const close=price(selected[0].close); if(!Number.isFinite(close)||close<=0)return fail('INVALID_PRICE');
  // Adjustment is bound to the reviewed fixture response, not inferred from numeric continuity.
  if(envelope.adjustment!=='none' || envelope.session!=='regular')return fail('BASIS_UNCONFIRMED');
  const quote={symbol:p.symbol,market:p.market,exchange:p.exchange,currency:p.currency,timezone:profile.timezone,asOf:p.date,fetchedAt,close,priceKind:'regular-close',adjustment:'none',session:'regular',provider:p.provider,source:{name:p.provider+' synthetic fixture',url:'https://example.invalid/'+p.provider},verification:'synthetic',status:'ok',corporateActionChecked:false,isSynthetic:true};
  return {ok:true,code:'SYNTHETIC_PARSED',held:true,realVerified:false,quotes:[quote]};
}
function normalizeFixture(...args) { try { return normalizeFixtureUnsafe(...args); } catch { return fail('SCHEMA_MISMATCH'); } }
function reconcileSynthetic(left,right,independence) {
  if(!left?.ok||!right?.ok||left.quotes?.length!==1||right.quotes?.length!==1)return fail('INPUT_UNAVAILABLE');
  const a=left.quotes[0],b=right.quotes[0];
  if(a.isSynthetic!==true||b.isSynthetic!==true||a.verification!=='synthetic'||b.verification!=='synthetic')return fail('SYNTHETIC_ONLY');
  if(a.provider===b.provider || !independence || independence.synthetic!==true || independence.routesReviewed!==true || !/^SYN-[A-Z0-9-]+$/.test(independence.evidenceId||''))return fail('INDEPENDENCE_UNCONFIRMED');
  for(const k of ['symbol','market','exchange','currency','timezone','asOf','priceKind','adjustment','session'])if(a[k]!==b[k])return fail('BASIS_MISMATCH');
  if(!Number.isFinite(a.close)||a.close<=0||!Number.isFinite(b.close)||b.close<=0)return fail('INVALID_PRICE');
  if(a.close!==b.close)return fail('PRICE_MISMATCH'); // No averaging, no tolerance guessed from tick size.
  return {ok:true,code:'SYNTHETIC_MATCH_ONLY',held:true,label:'합성 대조 일치 · 실제 검증 아님',realVerified:false,quotes:[],signalEnabled:false};
}
// Synthetic scheduling policy only: never sleeps or sends. Caller receives bounded retry advice.
function retryAdvice(status,attempt,retryAfterSeconds) {
  if(!Number.isInteger(attempt)||attempt<0||attempt>=2 || ![429,502,503,504].includes(status))return {retry:false};
  if(status===429 && (!Number.isFinite(retryAfterSeconds)||retryAfterSeconds<0||retryAfterSeconds>60))return {retry:false};
  return {retry:true,delaySeconds:Math.max(2**attempt,status===429?retryAfterSeconds:0),countsAgainstBudget:true};
}
module.exports={CANDIDATES,PROFILES,plan,normalizeFixture,reconcileSynthetic,retryAdvice};
