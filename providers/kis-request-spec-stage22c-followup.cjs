'use strict';
// Public request specification only: no credential values, HTTP, or token issuance.
const Q=require('./kis-readonly-stage22c.cjs');
const ORIGIN='https://openapi.koreainvestment.com:9443';
function freeze(o){Object.freeze(o);for(const v of Object.values(o))if(v&&typeof v==='object'&&!Object.isFrozen(v))freeze(v);return o;}
function requestSpec(plan){
 if(!Q.validQuotePlan(plan))throw Error('REQUEST_NOT_ALLOWED');
 const p=JSON.parse(JSON.stringify(plan));
 return freeze({fixtureOnly:true,method:'GET',url:ORIGIN+p.path+'?'+new URLSearchParams(p.params),trId:p.trId,credentialHeaderNames:['authorization','appkey','appsecret'],followRedirects:false,automaticRetries:0,automaticPagination:false,plan:p});
}
module.exports={ORIGIN,requestSpec};
