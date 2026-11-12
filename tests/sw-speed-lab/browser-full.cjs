'use strict';
/* PREPARED TEST, NOT A PRODUCTION SW. Actual 42 pinned app assets, empty synthetic
 * accounts, fresh disposable Chromium profile, loopback server, no live APIs.
 * Run: HAS_CHROMIUM_EXECUTABLE=/usr/bin/chromium node tests/sw-speed-lab/browser-full.cjs
 * Rollback positive control: HAS_SW_SCENARIO=rollback <same command>
 * Pure checks only: node tests/sw-speed-lab/browser-full.cjs --self-test
 */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {build}=require('./build.cjs'),{pollAsync}=require('./async-poll.cjs');
const root=path.resolve(__dirname,'../..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const mime={html:'text/html; charset=utf-8',js:'text/javascript',css:'text/css',json:'application/json',png:'image/png',svg:'image/svg+xml',ico:'image/x-icon',woff2:'font/woff2'};
// Defense in depth. Original HTML is unmodified; CSP is a response header.
const CSP="default-src 'none'; script-src 'self' 'unsafe-inline'; connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; media-src 'self'; worker-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-src 'none'; object-src 'none'";
const protectedSeed={v5_gen:'[]',v5_dom:'[]',v5_ov:'[]',v5_pen:'[]',v5_memos:'[{"text":"SYNTHETIC_SW_ONLY","ts":1700000000000}]','unrelated-key':'SYNTHETIC_KEEP'};
function bundle(){const b=build();assert.equal(b.config.assets.length,42);const files=new Map(b.config.assets.map(a=>{assert.ok(!/^[a-z]+:|^\/|\.\./i.test(a.path));const bytes=fs.readFileSync(path.join(root,a.path));assert.equal(sha(bytes),a.sha256);assert.equal(bytes.length,a.size);return [a.path,{...a,bytes}];}));return {...b,files};}
function cacheName(origin,cfg){return 'has-generation-v1:'+encodeURIComponent(origin+'/app/')+':'+cfg.release;}
function instrument(script,kind,release,revision){return script+'\nself.addEventListener("message",e=>{if(e.data==="HAS_LAB_PROBE")e.ports[0].postMessage('+JSON.stringify({kind,release,revision})+');});\n';}
async function probe(page,target='controller'){return page.evaluate(async target=>{const reg=await navigator.serviceWorker.getRegistration('/app/');const sw=target==='controller'?navigator.serviceWorker.controller:reg&&reg[target];if(!sw)return null;return new Promise((resolve,reject)=>{const channel=new MessageChannel(),timer=setTimeout(()=>reject(Error('lab probe timed out')),3000);channel.port1.onmessage=e=>{clearTimeout(timer);resolve({...e.data,workerState:sw.state});};sw.postMessage('HAS_LAB_PROBE',[channel.port2]);});},target);}
async function snapshot(page,cfg,origin){return page.evaluate(async({cfg,origin,types})=>{
 const scope=origin+'/app/',name='has-generation-v1:'+encodeURIComponent(scope)+':'+cfg.release;
 if(!(await caches.keys()).includes(name))return {ready:false,name,reason:'missing cache'};
 const c=await caches.open(name),keys=(await c.keys()).map(r=>r.url),marker=new URL('__has_generation_complete__/'+cfg.release,scope).href;
 const proof=await c.match(marker),marked=!!proof&&await proof.text()===cfg.release,failures=[];
 for(const a of cfg.assets){const key=new URL('__has_generation_asset__/'+cfg.release+'/'+encodeURIComponent(a.path),scope).href,r=await c.match(key);if(!r){failures.push(a.path+':missing');continue;}const contentType=(r.headers.get('content-type')||'').split(';')[0].trim().toLowerCase(),bytes=await r.arrayBuffer(),digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');if(r.status!==200||r.redirected||!types[a.kind].includes(contentType)||bytes.byteLength!==a.size||digest!==a.sha256)failures.push(a.path+':invalid');}
 return {ready:marked&&failures.length===0&&keys.length===cfg.assets.length+1,name,marked,keys:keys.length,failures};
 },{cfg,origin,types:require('./generation-cache.js').TYPES});}
async function legacySnapshot(page){return page.evaluate(async()=>{const name=(await caches.keys()).find(n=>n.startsWith('portfolio-v5-'));if(!name)return null;const cache=await caches.open(name),assets=[];for(const p of ['portfolio_v5.html','manifest.json','icon-192.png','icon-512.png']){const r=await cache.match(new URL('/app/'+p,location.origin).href);if(!r)return null;const b=await r.arrayBuffer();assets.push({path:p,sha256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),n=>n.toString(16).padStart(2,'0')).join('')});}return {name,assets};});}
async function updateTerminal(page){return page.evaluate(()=>new Promise(async(resolve,reject)=>{
 const reg=await navigator.serviceWorker.getRegistration('/app/');let observed;const timer=setTimeout(()=>{reg.removeEventListener('updatefound',found);reject(Error('update terminal state timed out'));},20000);
 function inspect(){if(observed&&['installed','redundant'].includes(observed.state)){clearTimeout(timer);reg.removeEventListener('updatefound',found);resolve(observed.state);}}
 function found(){const installing=reg.installing;if(!installing)return;observed=installing;observed.addEventListener('statechange',inspect);inspect();}
 reg.addEventListener('updatefound',found);try{await reg.update();found();}catch(e){clearTimeout(timer);reg.removeEventListener('updatefound',found);reject(e);}
 }));}
async function protectedStorage(page){return page.evaluate(keys=>Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)])),Object.keys(protectedSeed));}
async function fetchAsset(page,asset){return page.evaluate(async asset=>{try{const r=await fetch('./'+asset.path);const bytes=await r.arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');return {ok:r.ok,size:bytes.byteLength,hash};}catch{return {ok:false};}},asset);}
async function run(){
 const {chromium}=require('playwright'),b=bundle(),cfg=b.config,scenario=process.env.HAS_SW_SCENARIO||'lifecycle';assert.ok(['lifecycle','rollback'].includes(scenario));
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'has-sw-full-synthetic-')),requests=[],blocked=[],pageErrors=[];let mode='legacy',revision=0,fault=null,context,origin;
 const legacy=fs.readFileSync(path.join(root,'service-worker.js'),'utf8');
 const server=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://127.0.0.1');requests.push({path:u.pathname,query:u.search,method:req.method});res.setHeader('Content-Security-Policy',CSP);res.setHeader('Cache-Control','public, max-age=0');
  if(req.method!=='GET'||u.search){res.statusCode=400;return res.end('synthetic server rejects non-GET/query');}
  if(u.pathname==='/keeper.html'){res.setHeader('Content-Type','text/html');return res.end('<title>SW synthetic test coordinator</title>');}
  if(u.pathname==='/app/service-worker.js'){res.setHeader('Content-Type','text/javascript');res.setHeader('Cache-Control','no-store');return res.end(instrument(mode==='legacy'?legacy:b.worker,mode,cfg.release,revision));}
  const a=u.pathname.startsWith('/app/')&&b.files.get(u.pathname.slice(5));if(!a){res.statusCode=404;return res.end('not in pinned manifest');}
  res.setHeader('Content-Type',mime[a.kind]);if(fault&&fault.path===a.path){if(fault.type==='503'){res.statusCode=503;return res.end('synthetic unavailable');}return res.end(Buffer.concat([a.bytes,Buffer.from('\n/* synthetic wrong generation */')]));}res.end(a.bytes);
 });
 const openContext=async()=>{
  const c=await chromium.launchPersistentContext(profile,{headless:true,...(process.env.HAS_CHROMIUM_EXECUTABLE?{executablePath:process.env.HAS_CHROMIUM_EXECUTABLE}:{})});
  c.setDefaultTimeout(15000);c.setDefaultNavigationTimeout(20000);
  await c.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===origin)return route.continue();blocked.push(u.origin);return route.abort('blockedbyclient');});
  await c.addInitScript(({seed,origin})=>{if(location.origin!==origin)return;sessionStorage.setItem('v5_auth','1');if(!localStorage.getItem('__HAS_SW_SYNTHETIC_PROFILE__')){for(const [k,v] of Object.entries(seed))localStorage.setItem(k,v);for(const k of ['v5_debtBank','v5_debtHouse','v5_nonFinAssets','v5_div'])localStorage.setItem(k,'[]');localStorage.setItem('v5_snap',JSON.stringify({all:[],gen:[],dom:[],ov:[],pen:[]}));localStorage.setItem('v5_gas',origin+'/synthetic-gas-disabled');localStorage.setItem('__HAS_SW_SYNTHETIC_PROFILE__','1');}}, {seed:protectedSeed,origin});
  c.on('page',page=>page.on('pageerror',e=>pageErrors.push(e.message)));return c;
 };
 try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});origin='http://127.0.0.1:'+server.address().port;
  context=await openContext();const keeper=await context.newPage();await keeper.goto(origin+'/keeper.html');let first=await context.newPage();await first.goto(origin+'/app/portfolio_v5.html');
  await first.evaluate(()=>navigator.serviceWorker.register('./service-worker.js'));await pollAsync(()=>probe(first),{accept:x=>x?.kind==='legacy',label:'legacy controller'});
  const initial=await protectedStorage(first);assert.deepEqual(initial,protectedSeed);const second=await context.newPage();await second.goto(origin+'/app/portfolio_v5.html');assert.equal((await probe(second)).kind,'legacy');
  await keeper.evaluate(async()=>{await(await caches.open('synthetic-unrelated-full')).put('/synthetic-preserve',new Response('KEEP'));});
  const legacyBefore=await legacySnapshot(first);assert.ok(legacyBefore);
  // Partial new-generation install must fail without deleting old app/other caches.
  mode='candidate';revision++;fault={path:'has/live-price-panel.js',type:'503'};assert.equal(await updateTerminal(first),'redundant');
  assert.equal((await probe(first)).kind,'legacy');assert.equal((await snapshot(first,cfg,origin)).ready,false);
  assert.equal(await first.evaluate(name=>caches.keys().then(names=>names.includes(name)),cacheName(origin,cfg)),false,'failed install must remove incomplete candidate cache');
  assert.deepEqual(await legacySnapshot(first),legacyBefore,'legacy shell/manifest/icons must remain exact');
  assert.equal(await keeper.evaluate(async()=>await(await caches.match('/synthetic-preserve')).text()),'KEEP');
  fault=null;revision++;assert.equal(await updateTerminal(first),'installed');const full=await pollAsync(()=>snapshot(first,cfg,origin),{accept:x=>x.ready,label:'all 42 assets plus marker'});assert.equal(full.keys,43);
  assert.equal((await probe(first)).kind,'legacy');assert.equal((await probe(second)).kind,'legacy');
  await first.close();assert.equal((await probe(second)).kind,'legacy');assert.equal((await probe(second,'waiting')).kind,'candidate');
  await second.close();const __closedAt=Date.now(),__reqStart=requests.length;
  const __timer=setInterval(async()=>{try{const a=await probe(keeper,'active').catch(e=>String(e)),w=await probe(keeper,'waiting').catch(e=>String(e)),i=await probe(keeper,'installing').catch(e=>String(e));console.log('TICK',Date.now()-__closedAt,JSON.stringify({a,w,i}),'newReq',JSON.stringify(requests.slice(__reqStart).map(r=>typeof r==='string'?r:JSON.stringify(r)).slice(-6)),'mode',mode,'rev',revision);}catch(e){}},1500);
  try{ await pollAsync(()=>probe(keeper,'active'),{accept:x=>x?.kind==='candidate'&&x.workerState==='activated',label:'activation after BOTH old tabs close',timeoutMs:Number(process.env.HAS_SW_ACTIVATION_TIMEOUT_MS||15000)});
  console.log('ACTIVATED_AFTER_CLOSE_MS', Date.now()-__closedAt);
  } finally { clearInterval(__timer); }
  let app=await context.newPage();await app.goto(origin+'/app/portfolio_v5.html');assert.equal((await probe(app)).kind,'candidate');await app.waitForFunction(()=>typeof switchTab==='function'&&!!document.getElementById('panel-dashboard'));
  assert.deepEqual(await protectedStorage(app),initial);
  // Every pinned response must be exact, not just HTML and one sample script.
  const warmStart=requests.length;for(const asset of cfg.assets)assert.deepEqual(await fetchAsset(app,asset),{ok:true,size:asset.size,hash:asset.sha256});
  const warmStaticRequests=requests.slice(warmStart).filter(x=>b.files.has(x.path.slice(5)));assert.equal(warmStaticRequests.length,0);
  await context.setOffline(true);await app.reload();assert.equal((await probe(app)).kind,'candidate');for(const asset of cfg.assets)assert.deepEqual(await fetchAsset(app,asset),{ok:true,size:asset.size,hash:asset.sha256});
  // Delete one synthetic CacheStorage entry, never user records.
  const selected=cfg.assets.find(a=>a.path==='has/live-price-panel.js'),name=cacheName(origin,cfg),key=origin+'/app/__has_generation_asset__/'+cfg.release+'/'+encodeURIComponent(selected.path);
  await app.evaluate(async({name,key})=>{await(await caches.open(name)).delete(key);},{name,key});assert.equal((await fetchAsset(app,selected)).ok,false);
  await context.setOffline(false);fault={path:selected.path,type:'wrong'};assert.equal((await fetchAsset(app,selected)).ok,false);fault=null;assert.deepEqual(await fetchAsset(app,selected),{ok:true,size:selected.size,hash:selected.sha256});
  // Real Chromium process/profile restart, same origin and synthetic data only.
  await context.close();context=null;context=await openContext();await context.setOffline(true);app=await context.newPage();await app.goto(origin+'/app/portfolio_v5.html');assert.equal((await probe(app)).kind,'candidate');assert.deepEqual(await protectedStorage(app),initial);assert.equal((await snapshot(app,cfg,origin)).ready,true);
  await context.setOffline(false);const limitations=[];
  if(scenario==='rollback'){
   // Positive control: the unchanged legacy SW deletes ALL foreign caches.
   mode='legacy';revision++;await updateTerminal(app);await pollAsync(()=>probe(app),{accept:x=>x?.kind==='legacy'&&x.workerState==='activated',label:'legacy rollback claim'});
   const names=await app.evaluate(()=>caches.keys());assert.equal(names.includes(name),false);assert.equal(names.includes('synthetic-unrelated-full'),false);limitations.push('REPRODUCED: legacy rollback deletes candidate and unrelated CacheStorage; rollback NOT safe');
  }else{
   const marker=origin+'/app/__has_generation_complete__/'+cfg.release;
   await app.evaluate(async({name,marker})=>{await(await caches.open(name)).delete(marker);},{name,marker});assert.equal((await fetchAsset(app,selected)).ok,false);limitations.push('marker loss fails closed, no automatic recovery');
   await app.evaluate(name=>caches.delete(name),name);assert.equal((await fetchAsset(app,selected)).ok,false);limitations.push('whole-cache loss fails closed, no automatic recovery');
  }
  assert.deepEqual(await protectedStorage(app),initial);assert.deepEqual(pageErrors,[]);
  console.log(JSON.stringify({status:'SCENARIO_ASSERTIONS_PASS_NOT_RELEASE_APPROVAL',scenario,base:'a6ab1cbaaac4d374787d8041455b51ce38a63a62',release:cfg.release,assets:cfg.assets.length,snapshot:full,warmStaticRequests:warmStaticRequests.length,syntheticProtectedKeysUnchanged:true,persistentProfileRestart:true,externalRequestsBlocked:blocked.length,pageErrors,limitations,scope:'actual 42 pinned app bytes with empty synthetic accounts; external APIs blocked; no elapsed performance claim'},null,2));
 }finally{if(context)await context.close();if(server.listening)await new Promise(resolve=>server.close(resolve));fs.rmSync(profile,{recursive:true,force:true});}
}
function selfTest(){const b=bundle();assert.equal(b.files.size,42);assert.ok(b.files.has('has/live-price-reference.js'));assert.ok(b.files.has('has/live-price-panel.js'));assert.match(CSP,/connect-src 'self'/);assert.match(CSP,/script-src 'self' 'unsafe-inline'/);assert.doesNotMatch(CSP,/https:|\*/);assert.equal(Object.values(protectedSeed).some(x=>/TEST-KEY|sk-/.test(x)),false);new Function(instrument(b.worker,'candidate',b.config.release,1));console.log(JSON.stringify({status:'PASS_PURE_CHECKS_ONLY',assets:b.files.size,release:b.config.release,bytes:b.config.assets.reduce((n,a)=>n+a.size,0),browser:'NOT RUN'}));}
if(require.main===module){if(process.argv.includes('--self-test'))selfTest();else run().catch(e=>{console.error(e);process.exitCode=1;});}
module.exports={bundle,cacheName,instrument,CSP,protectedSeed,selfTest};
