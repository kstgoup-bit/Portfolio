'use strict';
// TEST ONLY. No SKIP, claim, unregister, registration update, or cache mutation.
function workerAuditPrefix(){return '('+function(){
 const audit=self.__HAS_LAB_AUDIT={bootId:Date.now()+'-'+Math.random().toString(16).slice(2),startedAt:Date.now(),memoryOnly:true,bodyCompletionObserved:false,eventLifetimeObserved:false,pendingFetch:[],pendingRespondWith:[],history:[],probes:0,respondWithHookFailures:0};let serial=0;
 const record=(phase,item)=>{audit.history.push({...item,phase,at:Date.now()});if(audit.history.length>300)audit.history.shift();};
 const urlOf=x=>{try{const u=new URL(typeof x==='string'?x:x.url,self.location.href);return u.origin+u.pathname;}catch{return 'unparseable';}};
 const nativeFetch=self.fetch.bind(self);self.fetch=function(input,init){const item={id:++serial,url:urlOf(input),started:Date.now()};audit.pendingFetch.push(item);record('fetch-start',item);return Promise.resolve().then(()=>nativeFetch(input,init)).then(r=>{audit.pendingFetch=audit.pendingFetch.filter(x=>x.id!==item.id);record('fetch-headers-resolved',item);return r;},e=>{audit.pendingFetch=audit.pendingFetch.filter(x=>x.id!==item.id);record('fetch-rejected',item);throw e;});};
 const add=self.addEventListener.bind(self);self.addEventListener=function(type,listener,options){if(type!=='fetch')return add(type,listener,options);return add(type,function(event){const original=event.respondWith.bind(event);const wrapped=function(value){const item={id:++serial,url:urlOf(event.request),started:Date.now()};audit.pendingRespondWith.push(item);record('respondWith-start',item);const observed=Promise.resolve(value).then(r=>{audit.pendingRespondWith=audit.pendingRespondWith.filter(x=>x.id!==item.id);record('respondWith-promise-resolved',item);return r;},e=>{audit.pendingRespondWith=audit.pendingRespondWith.filter(x=>x.id!==item.id);record('respondWith-promise-rejected',item);throw e;});observed.catch(()=>{});try{return original(observed);}catch(e){audit.pendingRespondWith=audit.pendingRespondWith.filter(x=>x.id!==item.id);record('respondWith-native-call-threw',item);throw e;}};try{event.respondWith=wrapped;}catch{audit.respondWithHookFailures++;}if(event.respondWith!==wrapped)audit.respondWithHookFailures++;return listener.call(self,event);},options);};
 // Settled headers/promises DO NOT prove response-body consumption or event-lifetime completion.
}.toString()+')();\n';}
function instrumentLabWorker(script,metadata,{audit=false}={}){
 const listener=function(metadata){self.addEventListener('message',event=>{
  const request=typeof event.data==='string'?{type:event.data,closePorts:false}:event.data;if(!request||!event.ports[0])return;const port=event.ports[0];
  const respond=value=>{port.postMessage(value);if(request.closePorts)port.close();};
  if(request.type==='HAS_LAB_PROBE'){if(self.__HAS_LAB_AUDIT)self.__HAS_LAB_AUDIT.probes++;respond(metadata);}
  if(request.type==='HAS_LAB_DIAGNOSTIC')event.waitUntil((async()=>{
   const pick=c=>{let safeUrl;try{const u=new URL(c.url);safeUrl=/^https?:$/.test(u.protocol)?u.origin+u.pathname:u.protocol+'[non-http-client]';}catch{safeUrl='unparseable';}return {id:c.id,url:safeUrl,type:c.type,visibilityState:c.visibilityState,focused:c.focused};};
   const controlled=(await self.clients.matchAll({type:'all'})).map(pick),all=(await self.clients.matchAll({type:'all',includeUncontrolled:true})).map(pick);
   respond({...metadata,controlledClients:controlled,allSameOriginClients:all,audit:self.__HAS_LAB_AUDIT||null,diagnosticAddsItsOwnMessageEvent:true});
  })().catch(e=>respond({...metadata,diagnosticError:String(e)})));
 });};
 return (audit?workerAuditPrefix():'')+script+'\n('+listener.toString()+')('+JSON.stringify(metadata)+');\n';
}
async function probeWorker(page,{target='controller',closePorts=true,diagnostic=false}={}){
 return page.evaluate(async({target,closePorts,diagnostic})=>{const reg=await navigator.serviceWorker.getRegistration('/app/'),sw=target==='controller'?navigator.serviceWorker.controller:reg&&reg[target];if(!sw)return null;
  return new Promise((resolve,reject)=>{const channel=new MessageChannel();let timer,finished=false;
   const finish=(error,value)=>{if(finished)return;finished=true;clearTimeout(timer);if(closePorts){channel.port1.onmessage=null;channel.port1.close();channel.port2.close();}if(error)reject(error);else resolve(value);};
   timer=setTimeout(()=>finish(Error('lab probe timed out')),3000);channel.port1.onmessage=e=>finish(null,{...e.data,workerState:sw.state});
   try{sw.postMessage({type:diagnostic?'HAS_LAB_DIAGNOSTIC':'HAS_LAB_PROBE',closePorts},[channel.port2]);}catch(e){finish(e);}
  });
 },{target,closePorts,diagnostic});
}
async function saveWaitingIdentity(page){return page.evaluate(async()=>{const reg=await navigator.serviceWorker.getRegistration('/app/');window.__HAS_LAB_EXPECTED_WAITING=reg&&reg.waiting;return !!window.__HAS_LAB_EXPECTED_WAITING&&window.__HAS_LAB_EXPECTED_WAITING.state==='installed';});}
async function readPassiveState(page){return page.evaluate(async()=>{const reg=await navigator.serviceWorker.getRegistration('/app/');if(!reg)return {registered:false};return {registered:true,activeState:reg.active?.state||null,waitingState:reg.waiting?.state||null,installingState:reg.installing?.state||null,expectedActive:!!window.__HAS_LAB_EXPECTED_WAITING&&reg.active===window.__HAS_LAB_EXPECTED_WAITING};});}
function activationReady(s){return !!s&&s.registered&&s.expectedActive&&s.activeState==='activated'&&!s.waitingState&&!s.installingState;}
function createServerAudit(){let serial=0;const pending=new Map(),history=[];return {observe(req,res){const item={id:++serial,path:new URL(req.url,'http://127.0.0.1').pathname,started:Date.now()};pending.set(item.id,item);const end=phase=>{if(!pending.has(item.id))return;pending.delete(item.id);history.push({...item,phase,status:res.statusCode,ended:Date.now()});if(history.length>1000)history.shift();};res.once('finish',()=>end('response-finished'));res.once('close',()=>end('closed-before-finish'));req.once('aborted',()=>end('request-aborted'));},snapshot(){return {pending:[...pending.values()],recent:history.slice(-100)};}};}
module.exports={workerAuditPrefix,instrumentLabWorker,probeWorker,saveWaitingIdentity,readPassiveState,activationReady,createServerAudit};
