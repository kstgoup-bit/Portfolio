'use strict';
// Server only. Native HTTPS follows no redirects and performs no automatic retries.
const https=require('node:https'),Q=require('./kis-readonly-stage22c.cjs'),A=require('./kis-auth-plan-stage22c.cjs');
const secret=s=>typeof s==='string'&&s.length>0&&s.length<=4096&&/^[\x21-\x7e]+$/.test(s);
function createWire({request=https.request,timeoutMs=10000,maxBytes=262144}={}){
 const [major,minor]=process.versions.node.split('.').map(Number);if(major<22||major===22&&minor<21||major===23||major===24&&minor<5)throw Error('NODE_PROXY_SUPPORT_REQUIRED');
 if(/http|https|tls/i.test(process.env.NODE_DEBUG||'')||process.execArgv.some(a=>a.startsWith('--tls-keylog'))||/--tls-keylog/.test(process.env.NODE_OPTIONS||''))throw Error('INSECURE_DEBUG_ENVIRONMENT');
 if(typeof request!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000||!Number.isInteger(maxBytes)||maxBytes<1||maxBytes>262144)throw Error('INVALID_WIRE_CONFIG');
 return Object.freeze({send(plan,credentials,token){
  if(!A.validAuthPlan(plan)&&!Q.validQuotePlan(plan))return Promise.reject(Error('REQUEST_NOT_ALLOWED'));
  if(!secret(credentials?.appKey)||!secret(credentials?.appSecret)||Q.validQuotePlan(plan)&&!secret(token))return Promise.reject(Error('CREDENTIALS_REQUIRED'));
  const auth=A.validAuthPlan(plan),body=auth?JSON.stringify({grant_type:'client_credentials',appkey:credentials.appKey,appsecret:credentials.appSecret}):undefined;
  const headers={'content-type':'application/json; charset=utf-8','accept':'application/json','accept-encoding':'identity'};
  if(auth)headers['content-length']=Buffer.byteLength(body);else Object.assign(headers,{authorization:'Bearer '+token,appkey:credentials.appKey,appsecret:credentials.appSecret,tr_id:plan.trId,custtype:'P'});
  const proxyEnv={};for(const k of ['HTTP_PROXY','HTTPS_PROXY','NO_PROXY','http_proxy','https_proxy','no_proxy'])if(process.env[k])proxyEnv[k]=process.env[k];
  const agent=new https.Agent({keepAlive:false,maxCachedSessions:0,proxyEnv});
  const options={protocol:'https:',hostname:'openapi.koreainvestment.com',port:9443,method:auth?'POST':'GET',path:plan.path+(auth?'':'?'+new URLSearchParams(plan.params)),headers,minVersion:'TLSv1.2',rejectUnauthorized:true,agent};
  return new Promise((resolve,reject)=>{
   let req,done=false,bytes=0,chunks=[];
   const finish=(code,value)=>{if(done)return;done=true;clearTimeout(timer);chunks=[];agent.destroy();if(code){reject(Error(code));req?.destroy();}else resolve(value);};
   const timer=setTimeout(()=>finish('REQUEST_TIMEOUT'),timeoutMs);
   try{
    req=request(options,res=>{
     try{
      res.on('error',()=>finish('RESPONSE_INTERRUPTED'));res.on('aborted',()=>finish('RESPONSE_INTERRUPTED'));
      if(res.statusCode!==200){res.resume();finish('HTTP_'+(Number.isInteger(res.statusCode)?res.statusCode:'INVALID'));return;}
      if(!/^application\/json(?:\s*;|$)/i.test(res.headers?.['content-type']||'')||res.headers?.['content-encoding']&&res.headers['content-encoding']!=='identity'){res.resume();finish('RESPONSE_TYPE_INVALID');return;}
      res.on('data',chunk=>{if(done)return;try{const b=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);bytes+=b.length;if(bytes>maxBytes){finish('RESPONSE_TOO_LARGE');return;}chunks.push(b);}catch{finish('INVALID_JSON');}});
      res.on('end',()=>{if(done)return;try{const p=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!p||typeof p!=='object'||Array.isArray(p))throw Error();finish(null,p);}catch{finish('INVALID_JSON');}});
      res.on('close',()=>{if(!done)finish('RESPONSE_INTERRUPTED');});
     }catch{finish('INVALID_RESPONSE');}
    });
    req.on('error',()=>finish('NETWORK_FAILURE'));
    req.end(body);
   }catch{finish('NETWORK_FAILURE');}
  });
 }});
}
module.exports={createWire};
