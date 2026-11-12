'use strict';
/* PREPARED, NOT BROWSER-EXECUTED in restricted sandbox.
 * Synthetic two-asset app + unchanged repository legacy SW and candidate kernel.
 * This is a lifecycle test, not actual portfolio startup, performance or user-data QA.
 * Run manually in a permitted local environment: node tests/sw-speed-lab/browser-lifecycle.cjs
 * Optional installed Chromium: HAS_CHROMIUM_EXECUTABLE=/usr/bin/chromium node tests/sw-speed-lab/browser-lifecycle.cjs
 * Pure helper check (no sockets/browser): node tests/sw-speed-lab/browser-lifecycle.cjs --self-test
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const {pollAsync}=require('./async-poll.cjs');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const bodies={
 'portfolio_v5.html':{kind:'html',mime:'text/html',body:'<!doctype html><title>Synthetic lifecycle</title><script src="app.js"></script><p>No user data or external resources</p>'},
 'app.js':{kind:'js',mime:'text/javascript',body:'window.syntheticPinned="B";'}
};
function makeCandidate(){
 const kernel=fs.readFileSync(path.join(__dirname,'generation-cache.js'),'utf8');
 const assets=Object.entries(bodies).map(([p,v])=>({path:p,kind:v.kind,size:Buffer.byteLength(v.body),sha256:hash(v.body)}));
 const config={release:hash(kernel+JSON.stringify(assets)),shell:'portfolio_v5.html',assets};
 const probe='self.addEventListener("message",e=>{if(e.data==="probe")e.ports[0].postMessage("candidate");if(e.data==="inspect")e.ports[0].postMessage({revision:self.__syntheticRevision||0,events:self.__syntheticEvents||[]});});';
 return {config,script:kernel+'\nconst generation=HASGenerationCache.create({...'+JSON.stringify(config)+',scope:self.registration.scope},{caches,fetcher:fetch.bind(self),digest:crypto.subtle.digest.bind(crypto.subtle),getClient:id=>self.clients.get(id)});self.__syntheticEvents=[];self.addEventListener("install",e=>e.waitUntil((async()=>{self.__syntheticEvents.push("install-start");await generation.install();self.__syntheticEvents.push("install-resolved-after-verify");})()));self.addEventListener("activate",e=>e.waitUntil(generation.activate()));self.addEventListener("fetch",e=>{const r=generation.route(e);if(r)e.respondWith(r);});'+probe};
}
function assetHeaders(asset){return {'Content-Type':asset.mime,'Cache-Control':'public, max-age=0'};}
function assertLocalManifest(config,origin){for(const a of config.assets){assert.ok(!/^[a-z]+:|^\/\//i.test(a.path));assert.ok(localAllowed(new URL(a.path,origin+'/app/').href,origin));}return true;}
function localAllowed(url,origin){try{return new URL(url).origin===origin}catch{return false}}
async function run(){
 const {chromium}=require('playwright'),candidate=makeCandidate();let next=false,corrupt=false,sameReleaseRevision=0,browser,context;const requestLog=[];
 const legacy=fs.readFileSync(path.join(root,'service-worker.js'),'utf8')+'\nself.addEventListener("message",e=>{if(e.data==="probe")e.ports[0].postMessage("legacy");});';
 const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://127.0.0.1').pathname;requestLog.push(pathname);
  res.setHeader('Cache-Control','no-store');
  if(pathname==='/app/service-worker.js'||pathname==='/fresh/service-worker.js'){res.setHeader('Content-Type','text/javascript');return res.end(pathname.startsWith('/fresh/')||next?candidate.script+'\nself.__syntheticRevision='+sameReleaseRevision+';':legacy)}
  const name=pathname.replace(/^\/(app|fresh)\//,'');
  if(bodies[name]){for(const [key,value] of Object.entries(assetHeaders(bodies[name])))res.setHeader(key,value);return res.end(corrupt&&name==='app.js'?'window.syntheticPinned="WRONG";':bodies[name].body)}
  if(name==='manifest.json'){res.setHeader('Content-Type','application/json');return res.end('{}')}
  if(/^icon-(192|512)\.png$/.test(name)){res.setHeader('Content-Type','image/png');return res.end('synthetic-unused-icon')}
  if(pathname==='/keeper.html'){res.setHeader('Content-Type','text/html');return res.end('<title>Out of scope test coordinator</title>')}
  res.statusCode=404;res.end('not found');
 });
 try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
  const origin='http://127.0.0.1:'+server.address().port;
  assertLocalManifest(candidate.config,origin);
  browser=await chromium.launch({headless:true,...(process.env.HAS_CHROMIUM_EXECUTABLE?{executablePath:process.env.HAS_CHROMIUM_EXECUTABLE}:{})});context=await browser.newContext({serviceWorkers:'allow'});
  // Context routing may not intercept SW-initiated fetches. Hermetic synthetic
  // scripts/manifest contain only same-origin loopback URLs; no actual app starts.
  await context.route('**/*',route=>localAllowed(route.request().url(),origin)?route.continue():route.abort('blockedbyclient'));
  const keeper=await context.newPage();await keeper.goto(origin+'/keeper.html');
  let page=await context.newPage();await page.goto(origin+'/app/portfolio_v5.html');
  await page.evaluate(()=>navigator.serviceWorker.register('./service-worker.js'));
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  const probe=p=>p.evaluate(()=>new Promise((resolve,reject)=>{const ch=new MessageChannel(),timer=setTimeout(()=>reject(Error('probe timeout')),5000);ch.port1.onmessage=e=>{clearTimeout(timer);resolve(e.data)};navigator.serviceWorker.controller.postMessage('probe',[ch.port2])}));
  assert.equal(await probe(page),'legacy');
  await page.evaluate(async()=>{const c=await caches.open('synthetic-unrelated');await c.put('/preserve',new Response('keep'));});
  next=true;
  await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();});
  await pollAsync(()=>page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();return !!(r&&r.waiting&&r.waiting.state==='installed');}),{label:'candidate waiting installed'});
  assert.equal(await probe(page),'legacy','waiting update must not replace old controller');
  const complete=await pollAsync(()=>page.evaluate(async({release,assets})=>{
   const r=await navigator.serviceWorker.getRegistration();
   const name='has-generation-v1:'+encodeURIComponent(r.scope)+':'+release;
   if(!(await caches.keys()).includes(name))return {ready:false,reason:'absent'};
   const cache=await caches.open(name),keys=(await cache.keys()).map(x=>x.url);
   const marker=new URL('__has_generation_complete__/'+release,r.scope).href;
   const expected=assets.map(x=>new URL('__has_generation_asset__/'+release+'/'+encodeURIComponent(x.path),r.scope).href).concat(marker);
   const proof=await cache.match(marker);
   const marked=!!proof&&await proof.text()===release;
   return {ready:!!r.waiting&&r.waiting.state==='installed'&&marked&&keys.length===expected.length&&expected.every(k=>keys.includes(k)),name,keys,marked,waiting:r.waiting?.state||null};
  },candidate.config),{accept:x=>x.ready,label:'installed worker and exact complete cache snapshot'});
  const candidateName=complete.name,keys=complete.keys;
  assert.ok(keys.every(u=>u!==origin+'/app/app.js'&&u!==origin+'/app/portfolio_v5.html'),'only internal candidate keys');
  // Repeated byte-identical update checks must not begin a new install or mutate cache keys.
  await page.evaluate(async()=>{window.__expectedSyntheticWaiting=(await navigator.serviceWorker.getRegistration()).waiting;});
  const repeated=[];
  for(let i=0;i<3;i++){
   const state=await page.evaluate(async({name})=>{const r=await navigator.serviceWorker.getRegistration();await r.update();return {sameWaiting:r.waiting===window.__expectedSyntheticWaiting,installing:!!r.installing,waiting:r.waiting?.state||null,keys:(await(await caches.open(name)).keys()).map(x=>x.url)};},{name:candidateName});
   assert.equal(state.sameWaiting,true);assert.equal(state.installing,false);assert.equal(state.waiting,'installed');assert.deepEqual(state.keys,keys);repeated.push(state);
  }
  // Change only a lab diagnostic byte, retaining manifest release, to force a
  // sequential same-release install. This does not alter production builder rules.
  const beforeReinstall=requestLog.length;sameReleaseRevision++;
  await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();});
  const reinstall=await pollAsync(()=>page.evaluate(async()=>{
   const r=await navigator.serviceWorker.getRegistration();if(!r.waiting||r.waiting.state!=='installed')return null;
   return new Promise((resolve,reject)=>{const ch=new MessageChannel(),timer=setTimeout(()=>reject(Error('waiting inspection timeout')),3000);ch.port1.onmessage=e=>{clearTimeout(timer);resolve(e.data);};r.waiting.postMessage('inspect',[ch.port2]);});
  }),{accept:x=>!!x&&x.revision===1&&x.events.includes('install-resolved-after-verify'),label:'same-release reinstall completed'});
  const reinstallRequests=requestLog.slice(beforeReinstall);
  assert.equal(reinstallRequests.filter(p=>candidate.config.assets.some(a=>p==='/app/'+a.path)).length,0,'same-release install must not download pinned static assets');
  const afterReinstallKeys=await page.evaluate(async name=>(await(await caches.open(name)).keys()).map(r=>r.url),candidateName);
  assert.deepEqual(afterReinstallKeys,keys);
  // Delete only synthetic legacy script entry; ensure global lookup cannot expose waiting candidate.
  assert.equal(await page.evaluate(async()=>{for(const n of await caches.keys())if(n.startsWith('portfolio-v5-'))await(await caches.open(n)).delete(location.origin+'/app/app.js');return !!await caches.match(location.origin+'/app/app.js');}),false);
  await page.close();
  // Keeper is outside scope, so it does not hold old registration active.
  await pollAsync(()=>keeper.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration('/app/');return !!(r&&r.active&&r.active.state==='activated'&&!r.waiting&&!r.installing);}),{label:'candidate activated after old clients close'});
  page=await context.newPage();await page.goto(origin+'/app/portfolio_v5.html');assert.equal(await probe(page),'candidate');
  assert.equal(await page.evaluate(()=>window.syntheticPinned),'B');
  assert.equal(await page.evaluate(async()=>await(await caches.match('/preserve')).text()),'keep');
  await context.setOffline(true);await page.reload();assert.equal(await page.evaluate(()=>window.syntheticPinned),'B');
  const scriptKey=keys.find(u=>u.includes('__has_generation_asset__')&&u.endsWith('/app.js')); // encoded path is app.js.
  // Resolve by manifest suffix, not by any original-URL lookup.
  const internalKey=scriptKey||keys.find(u=>u.includes('__has_generation_asset__')&&decodeURIComponent(u.split('/').pop())==='app.js');
  assert.ok(internalKey);
  const erase=()=>page.evaluate(async({name,key})=>{await(await caches.open(name)).delete(key)},{name:candidateName,key:internalKey});
  const fetchScript=()=>page.evaluate(async()=>{try{const r=await fetch('./app.js');return {ok:r.ok,body:await r.text()}}catch{return {ok:false}}});
  await erase();assert.equal((await fetchScript()).ok,false,'offline loss fails closed');
  await context.setOffline(false);corrupt=true;assert.equal((await fetchScript()).ok,false,'changed network bytes rejected');
  corrupt=false;assert.deepEqual(await fetchScript(),{ok:true,body:bodies['app.js'].body},'same-hash partial-loss repair');
  // Separate first-install check: candidate must NOT claim already-open uncontrolled clients.
  const fresh=await context.newPage();await fresh.goto(origin+'/fresh/portfolio_v5.html');
  assert.equal(await fresh.evaluate(()=>navigator.serviceWorker.controller),null);
  await fresh.evaluate(()=>navigator.serviceWorker.register('./service-worker.js'));
  await pollAsync(()=>fresh.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();return !!r?.active&&r.active.state==='activated';}),{label:'fresh candidate activation without claim'});
  assert.equal(await fresh.evaluate(()=>navigator.serviceWorker.controller),null,'no clients.claim on first install');
  await fresh.reload();assert.equal(await probe(fresh),'candidate');
  console.log(JSON.stringify({status:'PASS',scope:'synthetic two-asset lifecycle, not actual app startup',repeatedIdenticalUpdates:repeated.length,sameReleaseReinstall:{inspection:reinstall,requests:reinstallRequests},completeSnapshot:complete,checks:['legacy controller retained while waiting','waiting cache original-URL isolation','activation after controlled tabs close','offline pinned assets','unrelated cache preserved','partial loss rejects offline/wrong bytes and repairs exact bytes','no claim on first install']},null,2));
 }finally{if(context)await context.close();if(browser)await browser.close();if(server.listening)await new Promise(resolve=>server.close(resolve));}
}
if(require.main===module){if(process.argv.includes('--self-test')){const c=makeCandidate();assert.equal(c.config.assets.length,2);assert.match(c.config.release,/^[a-f0-9]{64}$/);new Function(c.script);assertLocalManifest(c.config,'http://127.0.0.1:1');for(const asset of Object.values(bodies)){const headers=assetHeaders(asset);assert.equal(headers['Content-Type'],asset.mime);assert.equal(/(?:^|,)\s*(?:no-store|private)\b/i.test(headers['Cache-Control']),false);}assert.throws(()=>assertLocalManifest({assets:[{path:'https://example.com/app.js'}]},'http://127.0.0.1:1'));assert.ok(localAllowed('http://127.0.0.1:1/app','http://127.0.0.1:1'));assert.equal(localAllowed('https://example.com','http://127.0.0.1:1'),false);console.log('PASS pure helpers only; browser NOT RUN');}else (async()=>{const runs=Number(process.env.HAS_SW_RUNS||1);assert.ok(Number.isInteger(runs)&&runs>0&&runs<=20);for(let i=1;i<=runs;i++){console.log('SYNTHETIC_LIFECYCLE_RUN '+i+'/'+runs);await run();}})().catch(e=>{console.error(e);process.exitCode=1});}
module.exports={makeCandidate,localAllowed,assetHeaders,assertLocalManifest};
