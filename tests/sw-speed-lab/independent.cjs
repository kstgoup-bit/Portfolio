'use strict';
// Independent synthetic checks only. No network, registration, browser data, or production edits.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {create}=require('./generation-cache.js');
const digest=async(_,b)=>crypto.createHash('sha256').update(Buffer.from(b)).digest();
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
class Cache{constructor(){this.data=new Map()}async match(k){return this.data.get(typeof k==='string'?k:k.url)?.clone()}async put(k,r){this.data.set(typeof k==='string'?k:k.url,r.clone())}async delete(k){return this.data.delete(k)}}
class Storage{constructor(){this.data=new Map()}async open(k){if(!this.data.has(k))this.data.set(k,new Cache());return this.data.get(k)}async keys(){return [...this.data.keys()]}async delete(k){return this.data.delete(k)}async match(k){for(const c of this.data.values()){const r=await c.match(k);if(r)return r}}}
const scope='https://synthetic.invalid/app/';
const assets=[['portfolio_v5.html','html','NEW_HTML','text/html'],['app.js','js','NEW_JS','text/javascript']];
const config={scope,shell:'portfolio_v5.html',release:'a'.repeat(64),assets:assets.map(([path,kind,body])=>({path,kind,size:Buffer.byteLength(body),sha256:sha(body)}))};
function fixture(storage=new Storage()){
 let client=scope+'portfolio_v5.html',fault=null;const calls=[];
 const env={caches:storage,digest,getClient:async()=>({url:client}),fetcher:async(input,options)=>{
  const url=typeof input==='string'?input:input.url;calls.push({url,options});
  if(fault==='offline')throw Error('synthetic offline');
  if(fault==='delay')await new Promise(r=>setTimeout(r,20));
  const a=assets.find(a=>scope+a[0]===url);if(!a)return new Response('NETWORK');
  return new Response(fault==='hash'?'BAD_JS':fault==='size'?'BAD_LENGTH':a[2],{status:fault==='status'?206:200,headers:{'content-type':fault==='mime'?'text/html':a[3]}});
 }};
 return {storage,worker:create(config,env),client:url=>client=url,calls,fault:value=>fault=value};
}
const event=(path,destination='script',mode='cors')=>({clientId:'synthetic',request:{url:scope+path,method:'GET',destination,mode,headers:new Headers()}});
(async()=>{
 const results=[];
 {
  const {storage,worker}=fixture();const legacy=await storage.open('portfolio-v5-2026-11-12');await legacy.put(scope+'portfolio_v5.html',new Response('OLD_HTML'));
  // Positive control reproduces the original unnamespaced candidate cache.
  const unnamespaced=await storage.open('synthetic-unnamespaced-control');
  await unnamespaced.put(scope+'app.js',new Response('NEW_JS'));
  // Exact fallback semantics of legacy service-worker.js: global caches.match.
  const shell=await storage.match(scope+'portfolio_v5.html'),script=await storage.match(scope+'app.js');
  assert.equal(await shell.text(),'OLD_HTML');assert.equal(await script.text(),'NEW_JS');
  results.push({case:'positive control: unnamespaced waiting-generation cache',outcome:'REPRODUCED mixed legacy old HTML and new candidate JS; original counterexample retained'});
 }

 {
  const {storage,worker}=fixture();const legacy=await storage.open('portfolio-v5-2026-11-12');
  await legacy.put(scope+'portfolio_v5.html',new Response('OLD_HTML'));
  await worker.install();
  assert.equal(await (await storage.match(scope+'portfolio_v5.html')).text(),'OLD_HTML');
  assert.equal(await storage.match(scope+'app.js'),undefined);
  assert.equal(await (await worker.route(event('app.js'))).text(),'NEW_JS');
  assert.equal(await (await worker.route(event('portfolio_v5.html','','navigate'))).text(),'NEW_HTML');
  results.push({case:'namespaced waiting-generation cache',outcome:'PASS candidate hidden from legacy original-URL lookup; candidate serving remains intact. Legacy own HTML fallback is not repaired.'});
 }
 {
  const {storage,worker}=fixture();await worker.install();
  const legacyName='portfolio-v5-2026-11-12';await storage.open(legacyName);
  await Promise.all((await storage.keys()).filter(k=>k!==legacyName).map(k=>storage.delete(k)));
  assert.equal((await worker.route(event('portfolio_v5.html','','navigate'))).type,'error');
  results.push({case:'legacy global activate cleanup',outcome:'REPRODUCED candidate cache removal and fail-closed navigation; cross-registration/rollback lifecycle precondition not browser-proven'});
 }
 for(const bad of ['offline','hash','size','mime','status']){
  const {storage,worker,fault,calls}=fixture();await worker.install();const cache=await storage.open(worker.name);await cache.delete(worker.assetKey('app.js'));fault(bad);calls.length=0;
  assert.equal(await (await worker.route(event('portfolio_v5.html','','navigate'))).text(),'NEW_HTML');
  assert.equal((await worker.route(event('app.js'))).type,'error');assert.equal(calls.length,1);
  assert.equal(await cache.match(worker.assetKey('app.js')),undefined);
  fault(null);assert.equal(await (await worker.route(event('app.js'))).text(),'NEW_JS');
  assert.equal(await (await cache.match(worker.assetKey('app.js'))).text(),'NEW_JS');
  results.push({case:'partial loss with '+bad,outcome:'PASS failed recovery writes nothing; later exact-generation recovery succeeds'});
 }
 {
  const {storage,worker,fault,calls}=fixture();await worker.install();const cache=await storage.open(worker.name);
  await cache.put(worker.assetKey('app.js'),new Response('POISON',{headers:{'content-type':'text/javascript'}}));fault('delay');calls.length=0;
  const responses=await Promise.all(Array.from({length:8},()=>worker.route(event('app.js'))));
  assert.deepEqual(await Promise.all(responses.map(r=>r.text())),Array(8).fill('NEW_JS'));
  assert.equal(calls.length,1);assert.equal(calls[0].options.cache,'no-store');assert.equal(calls[0].options.credentials,'omit');assert.equal(calls[0].options.redirect,'error');assert.ok(calls[0].options.signal instanceof AbortSignal);
  results.push({case:'concurrent corrupt-asset recovery',outcome:'PASS one fetch shared across eight responses with independently readable bodies'});
 }
 for(const whole of [false,true]){
  const {storage,worker,calls}=fixture();await worker.install();
  if(whole)await storage.delete(worker.name);else await(await storage.open(worker.name)).delete(worker.marker);
  calls.length=0;assert.equal((await worker.route(event('app.js'))).type,'error');assert.equal(calls.length,0);
  results.push({case:whole?'whole cache lost':'marker lost',outcome:'PASS fail closed without recovery attempt'});
 }
 {
  const {worker,client}=fixture();await worker.install();
  assert.equal((await worker.route(event('portfolio_v5.html?x=1','','navigate'))).type,'error');
  assert.equal(worker.route(event('other.html','','navigate')),null);
  client(scope+'other.html');assert.equal(await (await worker.route(event('unknown.js'))).text(),'NETWORK');
  client(scope+'portfolio_v5.html');assert.equal((await worker.route(event('unknown.js'))).type,'error');
  results.push({case:'query shell, unknown routes and unrelated-page scripts',outcome:'PASS expected isolation/fail-closed behavior'});
 }
 console.log(JSON.stringify({synthetic:true,results},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
