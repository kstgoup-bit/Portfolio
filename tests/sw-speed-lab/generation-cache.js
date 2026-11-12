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
