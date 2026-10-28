/* Proposal only. Not a service worker; never registered by the app. */
'use strict';
const CACHE='kst-radar-experimental-v1';
function createHandler({fetcher,cache,origin}){
 return async function(request){
  const u=new URL(request.url),same=u.origin===origin;
  const navigation=request.mode==='navigate';
  const staticAsset=same&&!u.search&&/\.(?:css|js|png|svg|woff2)$/.test(u.pathname);
  const cacheable=request.method==='GET'&&same&&!u.search&&(navigation||staticAsset);
  try{
   const response=await fetcher(request);
   const type=response.headers.get('content-type')||'';
   const correct=navigation?type.includes('text/html'):u.pathname.endsWith('.js')?/(?:javascript|ecmascript)/.test(type):u.pathname.endsWith('.css')?type.includes('text/css'):!type.includes('text/html');
   if(cacheable&&correct&&response.ok)await cache.put(request,response.clone());
   return response;
  }catch{
   const cached=cacheable?await cache.match(request):null;
   if(cached)return cached;
   if(navigation)return new Response('<!doctype html><meta charset="utf-8"><p>오프라인입니다. 연결 후 다시 시도하세요.</p>',{status:503,headers:{'Content-Type':'text/html; charset=utf-8'}});
   return new Response(JSON.stringify({error:'offline',evaluation:'unavailable'}),{status:503,headers:{'Content-Type':'application/json'}});
  }
 };
}
function ownedCaches(keys){return keys.filter(k=>k.startsWith('kst-radar-experimental-'));}
module.exports={CACHE,createHandler,ownedCaches};
