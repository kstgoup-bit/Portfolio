'use strict';
/* Offline KIS request contracts. Only two price endpoints; no account/order operations. */
const P=require('./closing-stage22.cjs');
const day=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
const same=(a,b)=>{if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;const keys=Object.keys(a).sort();return JSON.stringify(keys)===JSON.stringify(Object.keys(b).sort())&&keys.every(k=>same(a[k],b[k]));};
function quotePlan(symbol,date){
 const c=P.CANDIDATES.find(c=>c.symbol===symbol);if(!c||!day(date))throw Error('INVALID_QUOTE_REQUEST');
 const d=date.replaceAll('-','');
 return {operation:c.market==='KR'?'KR_CLOSE':'US_CLOSE',method:'GET',path:c.market==='KR'?'/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice':'/uapi/overseas-price/v1/quotations/dailyprice',trId:c.market==='KR'?'FHKST03010100':'HHDFS76240000',symbol,date,market:c.market,currency:c.currency,timezone:c.timezone,exchange:c.exchange,priceKind:'regular-close',adjustment:'none',syntheticOnly:true,params:c.market==='KR'?{FID_COND_MRKT_DIV_CODE:'J',FID_INPUT_ISCD:symbol,FID_INPUT_DATE_1:d,FID_INPUT_DATE_2:d,FID_PERIOD_DIV_CODE:'D',FID_ORG_ADJ_PRC:'1'}:{AUTH:'',EXCD:'NAS',SYMB:symbol,GUBN:'0',BYMD:d,MODP:'0'}};
}
function validQuotePlan(p){try{return same(p,quotePlan(p.symbol,p.date));}catch{return false;}}
function validateFixture(p,envelope,ctx){if(!validQuotePlan(p))return {ok:false,code:'REQUEST_NOT_ALLOWED',held:true,quotes:[]};return P.normalizeFixture(P.plan('kis',p.symbol,p.date),envelope,ctx);}
function errorPolicy(status,attempt,retryAfter){
 if(status===401||status===403)return {retry:false,stop:true,code:'AUTH_OR_PERMISSION_FAILED'};
 const r=P.retryAdvice(status,attempt,retryAfter);return {...r,stop:!r.retry,code:r.retry?'RETRY_BUDGET_REQUIRED':'STOP_NO_RETRY'};
}
module.exports={quotePlan,validQuotePlan,validateFixture,errorPolicy};
