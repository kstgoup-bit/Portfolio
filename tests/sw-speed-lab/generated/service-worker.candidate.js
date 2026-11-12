// UNREGISTERED LAB CANDIDATE. Requires transition review before deployment.
/* UNREGISTERED LAB CANDIDATE. Production service-worker.js never imports this. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.HASGenerationCache=factory();})(typeof self!=='undefined'?self:globalThis,function(){
'use strict';
const TYPES={html:['text/html'],js:['text/javascript','application/javascript','text/ecmascript','application/ecmascript'],css:['text/css'],json:['application/json','application/manifest+json'],png:['image/png'],svg:['image/svg+xml'],ico:['image/x-icon','image/vnd.microsoft.icon'],woff2:['font/woff2']};
const hex=bytes=>Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
function create(config,env){
 const {caches,fetcher,digest,getClient,ResponseClass=Response}=env,base=new URL(config.scope);
 if(!base.pathname.endsWith('/')||base.search||base.hash||!/^https?:$/.test(base.protocol))throw Error('Invalid scope');
 if(!/^[a-f0-9]{64}$/.test(config.release))throw Error('Invalid release');
 const prefix='has-generation-v1:'+encodeURIComponent(base.href)+':',name=prefix+config.release;
 const marker=new URL('__has_generation_complete__/'+config.release,base).href;
 // Internal keys keep waiting generations invisible to the legacy global caches.match(URL).
 const items=new Map();
 for(const a of config.assets){const url=new URL(a.path,base);if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname)||url.search||url.hash||!TYPES[a.kind]||!/^[a-f0-9]{64}$/.test(a.sha256)||!Number.isSafeInteger(a.size)||a.size<0||items.has(url.href)||url.href===marker)throw Error('Invalid manifest');items.set(url.href,{...a,url:url.href,cacheKey:new URL('__has_generation_asset__/'+config.release+'/'+encodeURIComponent(a.path),base).href});}
 const shell=new URL(config.shell,base).href;if(!items.has(shell)||items.get(shell).kind!=='html')throw Error('Missing pinned HTML shell');
 async function valid(response,item,network){
  if(!response||response.status!==200||response.redirected||['opaque','opaqueredirect','error'].includes(response.type))return false;
  if(network&&response.url&&response.url!==item.url)return false;
  const mime=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  if(!TYPES[item.kind].includes(mime)||response.headers.has('content-range')||(response.headers.get('vary')||'').split(',').some(x=>x.trim()==='*'))return false;
  if(network&&/(?:^|,)\s*(?:no-store|private)\b/i.test(response.headers.get('cache-control')||''))return false;
  const b=await response.clone().arrayBuffer();return b.byteLength===item.size&&hex(await digest('SHA-256',b))===item.sha256;
 }
 async function marked(cache){const r=await cache.match(marker);return !!r&&r.status===200&&await r.text()===config.release;}
 async function verify(cache){if(!await marked(cache))return false;for(const item of items.values())if(!await valid(await cache.match(item.cacheKey),item,false))return false;return true;}
 async function install(){
  const cache=await caches.open(name);
  // Never overwrite/delete a completed same-generation cache during reinstall.
  if(await marked(cache)){if(await verify(cache))return;throw Error('Preserved corrupt existing generation');}
  try{
   for(const item of items.values()){
    const response=await fetcher(item.url,{cache:'no-store',credentials:'omit',redirect:'error'});
    if(!await valid(response,item,true))throw Error('Rejected static asset: '+item.path);
    await cache.put(item.cacheKey,response.clone());
   }
   await cache.put(marker,new ResponseClass(config.release,{headers:{'content-type':'text/plain'}}));
   if(!await verify(cache))throw Error('Incomplete cache write');
  }catch(e){await caches.delete(name);throw e;}
 }
 // Rejected activate.waitUntil does NOT restore the old worker. Serving still fails closed.
 async function activate(){
  if(!await verify(await caches.open(name)))throw Error('Unusable generation; cleanup skipped (not lifecycle rollback)');
  const owned=(await caches.keys()).filter(k=>k.startsWith(prefix)&&/^[a-f0-9]{64}$/.test(k.slice(prefix.length))&&k!==name);
  await Promise.all(owned.map(k=>caches.delete(k)));
  // No skipWaiting or clients.claim. Existing documents retain their own worker.
 }
 const repairs=new Map();
 async function repair(item,cache){
  // Recovery is same-generation only. Never substitute newer network code.
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{
   const response=await fetcher(item.url,{cache:'no-store',credentials:'omit',redirect:'error',signal:controller.signal});
   if(!await valid(response,item,true)||!await marked(cache))return ResponseClass.error();
   await cache.put(item.cacheKey,response.clone());
   return await valid(await cache.match(item.cacheKey),item,false)?response:ResponseClass.error();
  }catch{return ResponseClass.error();}finally{clearTimeout(timer);}
 }
 async function cached(item){
  const cache=await caches.open(name);if(!await marked(cache))return ResponseClass.error();
  const response=await cache.match(item.cacheKey);if(await valid(response,item,false))return response;
  if(!repairs.has(item.url))repairs.set(item.url,repair(item,cache).finally(()=>repairs.delete(item.url)));
  // Each fetch event owns a fresh body, including concurrent recovery requests.
  return (await repairs.get(item.url)).clone();
 }
 async function appClient(id){
  if(!id)return null;
  try{const c=await getClient(id);if(!c||!c.url)return null;const u=new URL(c.url);return !u.search&&u.origin===base.origin&&u.pathname===new URL(shell).pathname;}catch{return null;}
 }
 function route(event){
  const request=event.request;if(request.method!=='GET')return null;
  const url=new URL(request.url);if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname))return null;
  const canonical=new URL(url.href);canonical.search='';canonical.hash='';const item=items.get(canonical.href);
  if(request.mode==='navigate'){
   if(canonical.href!==shell)return null; // Do not turn other apps/tools into the portfolio shell.
   if(url.search||request.headers.has('range'))return Promise.resolve(ResponseClass.error());
   return cached(items.get(shell));
  }
  const code=request.destination==='script'||request.destination==='style';
  if(!item&&!code)return null; // Unknown same-origin data/API requests are never cached.
  return (async()=>{
   const owned=await appClient(event.clientId);
   if(owned===false)return fetcher(request); // Other pages keep their own network/cache semantics.
   if(owned===null||!item||url.search||request.headers.has('range'))return ResponseClass.error();
   return cached(item);
  })();
 }
 return Object.freeze({name,prefix,marker,install,activate,route,verify,assetKey:path=>{const item=items.get(new URL(path,base).href);return item&&item.cacheKey;}});
}
return Object.freeze({create,TYPES});
});

const HAS_RELEASE={"release":"41e22f32247f88c9d1ad0ece765ff034c217d73dd77046be3f2c6e3e5eafc872","shell":"portfolio_v5.html","assets":[{"path":"backup/core.js","kind":"js","size":32218,"sha256":"ff1a15979d0dbca717538e2ec5197f641756440ac837da524a57218e56878b82"},{"path":"backup/ui.js","kind":"js","size":9131,"sha256":"0999a78cf1fa8c8bdd89d82afd4b905954b2c2bc27b1b8a24dd4866731345c3d"},{"path":"has/advice-guard.js","kind":"js","size":2785,"sha256":"7964682e8750f88efe289a9fc4a7482ea9ce93862727739834011caa5675ec83"},{"path":"has/advisor-bridge.js","kind":"js","size":5441,"sha256":"e5897e9f5a44821531eca02424c0b54174567e52f09b74886abaf9471cab4c62"},{"path":"has/advisor-core.js","kind":"js","size":13546,"sha256":"c6ad2a3c18d96f86c5926bd7f89fa738348cb979689d7756d876e286e17cb225"},{"path":"has/advisor-panel.css","kind":"css","size":3213,"sha256":"8bc90309e7a96f81585d39432d95099a6dcc0bed311230e26350fc99be2aae9d"},{"path":"has/advisor-panel.js","kind":"js","size":17130,"sha256":"2da44530135fe29fc9cd630ddad49ec18c68f3314b53133e94829e1aef1689b7"},{"path":"has/advisor-synthetic.js","kind":"js","size":2902,"sha256":"b8ef8d9070daf206b3b538bac39ef7d191fc0e0a68b495ae74029f762fed2dd5"},{"path":"has/benchmark-history-policy.js","kind":"js","size":31113,"sha256":"8d64e852feb00050449f3b66b51e0188059a77accc10dcff9e8880a3969893f9"},{"path":"has/briefing-model.js","kind":"js","size":6902,"sha256":"0833a65da131e81a21716170c83f53f41df56ab6f4b432ea3184c90da8ce949d"},{"path":"has/ledger-demo-model.js","kind":"js","size":6686,"sha256":"3f9ee9d13f004d7a18c795908c266d299d0d47e445ecbd599f8219a8f99f73c0"},{"path":"has/ledger-demo.css","kind":"css","size":3073,"sha256":"29bfaad35ed37c81b0d3b4c9d0feee567520cb0d8c85430b10b3bf34f6a98a42"},{"path":"has/ledger-demo.js","kind":"js","size":11176,"sha256":"ff5fc12f8ebec9533ea1f14d009a51dd3481aa95b5867d564c0f6f0dbbf11901"},{"path":"has/ledger-years.js","kind":"js","size":5271,"sha256":"f402fd4f1865ed560f5a9be7ad9db5b1081f0f3e5c1133890c1ba907c4280267"},{"path":"has/live-price-panel.js","kind":"js","size":9047,"sha256":"be25d2c7ecf19b9db69bb0913ddf9a07a0765944870546dc38a922974f72e65d"},{"path":"has/live-price-reference.js","kind":"js","size":9841,"sha256":"74ec48bfd7b9fe121eeccb1fe4849289ca2e8dd0cd18f38462c83bded92c2cb1"},{"path":"has/migration-sim.js","kind":"js","size":5488,"sha256":"2010b6f65f7c93e1e038c6eb309dd30376c963a3a683ee036684df3f82b0e3bd"},{"path":"has/opinion-conflict.js","kind":"js","size":3676,"sha256":"ffbc5f61bea1b9bae185ceda7463bcaf232550d85f30a185c54f5d79dd9b968e"},{"path":"has/portfolio-reader.js","kind":"js","size":7025,"sha256":"7c61ff4e2b505300bf76d3800b96d2bd2da6ff6ad34b1180eed06ec10efa3557"},{"path":"has/pretrade-log.js","kind":"js","size":13934,"sha256":"f91b32b3165720076d262614ca9f3e5dcbeace02f3eb316897e216789e938c7d"},{"path":"has/pretrade-panel.css","kind":"css","size":2119,"sha256":"1f0fa34af973d4573d972de0557d2bcc8aec25f62c072ba932552fb09439f183"},{"path":"has/pretrade-panel.js","kind":"js","size":10265,"sha256":"965caf8fd3c62d2b70dbd96d1dfd089fc65be767237a6cb70fd5a86b9dfa40e5"},{"path":"has/price-trust-ui.js","kind":"js","size":1784,"sha256":"5f5a735acdd9423de63a78f7f0319db585228274b6b8d9bd2fe3c77631c4cb8c"},{"path":"has/price-trust.js","kind":"js","size":7809,"sha256":"1f88ab2c631fd7c7d3de8fdf8f04959a7a69d592ea4706c406884dbd4bafb55a"},{"path":"has/quote-crosscheck.js","kind":"js","size":2742,"sha256":"f40a98ded939ea20d6d2ed8ab1fa770fbd559fbf5a938974a10b61e760f7624e"},{"path":"has/quote-model.js","kind":"js","size":12456,"sha256":"9431869be95490f921579546c2521a988ddd16001a43a4892d0712abfda2c52a"},{"path":"has/readability.css","kind":"css","size":5371,"sha256":"4146505481a15eef6c58f0ce1eac0f201538f2b9a6841cd3b2a6ee11ef773edf"},{"path":"has/return-assessment.js","kind":"js","size":27629,"sha256":"1b1c7a54d05443f0cd96f9677338aa9af7c79677fa8f589cbbca1c3d3aedfd51"},{"path":"has/risk-menu-shortcuts.css","kind":"css","size":558,"sha256":"b8d469d2e74508df97faf07a55a56c48f898580eba075f7b918311117c38043a"},{"path":"has/snapshot-policy.js","kind":"js","size":29233,"sha256":"9109c84c4f4a8bfdde046646e668dc1c4b9ebf4712f50ff271daadf2f2bc3d1a"},{"path":"has/watch-engine.js","kind":"js","size":15060,"sha256":"afbe032b3c6a3ad61339028880cd9e2e759d58b3b61bd9ab20992d9dc611e15b"},{"path":"icon-192.png","kind":"png","size":5493,"sha256":"604940c6eeda0d2d336c86c1f76553ba47d515becf1f164b2cfb17fcc2989eb4"},{"path":"icon-512.png","kind":"png","size":13587,"sha256":"e6d0ad649e5624004ff2e925ebff8da3947e931d73a90060e3a51e4b4d00f509"},{"path":"invest/ledger.js","kind":"js","size":23747,"sha256":"86d04b1e4db38901258b7f37a9e81508af995e2069d034b480c38cbb4ba6946e"},{"path":"manifest.json","kind":"json","size":434,"sha256":"33371c2e52960f0b862da0857723a5e7b2d603137e433afe1309bd1ab8d9d9ed"},{"path":"portfolio_icon_beach3.png","kind":"png","size":312704,"sha256":"975469f7cdabd13814257ee84eb4720d8c49ae165695cc63fdd1a355b9e1b41b"},{"path":"portfolio_v5.html","kind":"html","size":558695,"sha256":"69708265c1263cfa5d7f8bd30c09ceac7d6c01b213f1a7a5d7b9ba7cfe6247f7"},{"path":"radar/core.js","kind":"js","size":10772,"sha256":"5b02c7ffb11f329973262485d9716611fbd45382675e1103d6eb6c5466578eac"},{"path":"radar/providers.js","kind":"js","size":10457,"sha256":"93bbd4b6d7f9a414dae92e024e2716d2c8a7409a446d598a82a6d0d6948af31a"},{"path":"radar/radar.css","kind":"css","size":3404,"sha256":"2e03b57cbc7a44166f94cfcd7ae838800b8b7c6244d194755f6262ba51d1433b"},{"path":"radar/ui.js","kind":"js","size":20855,"sha256":"35b8db8b0fc3f32341ec807c165c6b5d8f75ac599bee4edc7b136aa8fa17e539"},{"path":"radar/verification.js","kind":"js","size":5396,"sha256":"c7dc28e502870b7e6f5171f0c227c4ad3fb87f9c7b32ec17130a7ca382ca3c1f"}]};
const generation=HASGenerationCache.create({...HAS_RELEASE,scope:self.registration.scope},{caches,fetcher:fetch.bind(self),digest:crypto.subtle.digest.bind(crypto.subtle),getClient:id=>self.clients.get(id)});
self.addEventListener("install",e=>e.waitUntil(generation.install()));
self.addEventListener("activate",e=>e.waitUntil(generation.activate()));
self.addEventListener("fetch",e=>{const response=generation.route(e);if(response)e.respondWith(response);});
