'use strict';
// Pure synthetic scheduling tests; no browser, sockets, registration or production edits.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const H=require('./harness.cjs'),{create}=require('./generation-cache.js');
const assets=[{path:'portfolio_v5.html',kind:'html',body:'<html>SYNTHETIC</html>'},{path:'app.js',kind:'js',body:'const synthetic=1;'}];
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
function fixture(){const env=H.environment(assets),config=H.manifest(assets);return {env,config,g:create(config,env)}}
function actualInstallListener(env,config){
 const kernel=fs.readFileSync(path.join(__dirname,'generation-cache.js'),'utf8');
 const generated=fs.readFileSync(path.join(__dirname,'generated/service-worker.candidate.js'),'utf8');
 const start=generated.lastIndexOf('const generation=');assert.ok(start>=0,'generated wrapper found');
 const handlers={};const self={registration:{scope:env.scope},clients:{get:env.getClient},addEventListener:(kind,fn)=>handlers[kind]=fn};
 const ctx={...self,caches:env.caches,fetch:env.fetcher,crypto:{subtle:{digest:env.digest}},URL,Response,AbortController,setTimeout,clearTimeout};
 ctx.self=ctx;
 vm.runInNewContext(kernel+'\nconst HAS_RELEASE='+JSON.stringify(config)+';\n'+generated.slice(start),ctx);
 return ()=>{const promises=[];handlers.install({waitUntil:p=>promises.push(p)});assert.equal(promises.length,1);return promises[0]};
}
(async()=>{
 const results=[];
 for(const stage of ['html-put','js-put','marker-put','final-verify']){
  const {env,config,g}=fixture(),cache=await env.caches.open(g.name),entered=deferred(),release=deferred();let puts=0,hashes=0,settled=false;
  const originalPut=cache.put.bind(cache),originalDigest=env.digest;
  cache.put=async(...args)=>{puts++;if(puts===({'html-put':1,'js-put':2,'marker-put':3})[stage]){entered.resolve();await release.promise}return originalPut(...args)};
  env.digest=async(...args)=>{hashes++;if(stage==='final-verify'&&hashes===4){entered.resolve();await release.promise}return originalDigest(...args)};
  const pending=actualInstallListener(env,config)();pending.then(()=>{settled=true},()=>{settled=true});
  await entered.promise;assert.equal(settled,false,stage+' must retain install waitUntil');
  assert.equal(cache.items.size,({'html-put':0,'js-put':1,'marker-put':2,'final-verify':3})[stage]);
  if(stage==='final-verify')assert.ok(await cache.match(g.marker),'marker visible before final verification but install still pending');
  else assert.equal(await cache.match(g.marker),undefined);
  release.resolve();await pending;assert.equal(settled,true);assert.equal(cache.items.size,3);assert.ok(await g.verify(cache));
  results.push({case:stage,outcome:'PASS actual generated install listener waitUntil stays pending through gate'});
 }
 {
  const {env,config,g}=fixture();await g.install();const puts=env.caches.puts;env.calls.length=0;env.routes.clear();await create(config,env).install();
  assert.equal(env.calls.length,0);assert.equal(env.caches.puts,puts);assert.equal(env.caches.deleted.length,0);
  results.push({case:'sequential completed same-release reinstall',outcome:'PASS no fetch, overwrite or deletion'});
 }
 {
  const {env,config,g}=fixture();await g.install();const c=await env.caches.open(g.name);await c.delete(g.assetKey('app.js'));env.calls.length=0;
  await assert.rejects(create(config,env).install(),/Preserved corrupt/);assert.equal(env.calls.length,0);assert.ok(env.caches.buckets.has(g.name));
  results.push({case:'sequential completed but partial same-release reinstall',outcome:'PASS rejects while preserving cache; install does not perform repair'});
 }
 {
  const {env,config,g}=fixture(),entered=deferred(),release=deferred();
  const other=create(config,{...env,fetcher:async()=>{entered.resolve();await release.promise;throw Error('synthetic stalled installer failure')}});
  const failed=other.install();const caught=failed.then(()=>null,e=>e);await entered.promise;
  await g.install();assert.ok(await g.verify(await env.caches.open(g.name)));
  release.resolve();assert.match((await caught).message,/stalled installer/);assert.equal(env.caches.buckets.has(g.name),false);
  results.push({case:'concurrent same-release installers, one fails after other commits',outcome:'COUNTEREXAMPLE: failure deletes already-completed shared cache. Synthetic simultaneous create/install only; reachability under one real SW registration NOT proven.'});
 }
 {
  const {env,config,g}=fixture();await Promise.all([g.install(),create(config,env).install()]);assert.ok(await g.verify(await env.caches.open(g.name)));
  results.push({case:'concurrent successful same-release installers',outcome:'PASS consistent final cache in this schedule; duplicate network/work possible, not a concurrency guarantee'});
 }
 console.log(JSON.stringify({browserRun:false,syntheticOnly:true,results},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
