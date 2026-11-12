'use strict';
const crypto=require('node:crypto'),vm=require('node:vm'),fs=require('node:fs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),digest=(name,b)=>crypto.webcrypto.subtle.digest(name,b);
const url=x=>typeof x==='string'?x:x.url;
class MemoryCache{
 constructor(owner){this.owner=owner;this.items=new Map();}
 async match(key){const r=this.items.get(new URL(url(key),this.owner.scope).href);return r?r.clone():undefined;}
 async put(key,response){const u=new URL(url(key),this.owner.scope).href;if(this.owner.failPut&&this.owner.failPut(u))throw Error('Synthetic quota');this.owner.puts=(this.owner.puts||0)+1;this.items.set(u,response.clone());}
 async delete(key){return this.items.delete(new URL(url(key),this.owner.scope).href);}
 async addAll(keys){const pairs=[];for(const k of keys){const u=new URL(k,this.owner.scope).href,r=await this.owner.fetcher(u);if(!r.ok)throw Error('Synthetic addAll rejected');pairs.push([u,r]);}for(const[k,r]of pairs)await this.put(k,r);}
}
class MemoryCaches{
 constructor(scope){this.scope=scope;this.buckets=new Map();this.deleted=[];}
 async open(name){if(!this.buckets.has(name))this.buckets.set(name,new MemoryCache(this));return this.buckets.get(name);}
 async keys(){return [...this.buckets.keys()];}
 async delete(name){this.deleted.push(name);return this.buckets.delete(name);}
 async match(key){for(const c of this.buckets.values()){const r=await c.match(key);if(r)return r;}}
}
function response(body,type='application/javascript',status=200){const r=new Response(body,{status,headers:{'content-type':type}});Object.defineProperty(r,'type',{value:'basic'});const clone=r.clone.bind(r);r.clone=()=>{const c=clone();Object.defineProperty(c,'type',{value:'basic'});return c;};return r;}
function environment(assets,scope='https://synthetic.invalid/Portfolio/'){
 const caches=new MemoryCaches(scope),routes=new Map(),calls=[],clients=new Map([['app',{url:scope+'portfolio_v5.html'}],['other',{url:scope+'has/valuation-lab.html'}]]);
 for(const a of assets)routes.set(new URL(a.path,scope).href,{body:a.body,mime:a.mime||({'html':'text/html','js':'application/javascript','css':'text/css','png':'image/png','json':'application/json','svg':'image/svg+xml'})[a.kind]});
 const fetcher=async(r,options)=>{const u=url(r);calls.push({url:u,options});const x=routes.get(u);if(!x||x.fail)throw Error('Synthetic network failure');return response(x.body,x.mime,x.status||200);};
 caches.fetcher=fetcher;return {scope,caches,routes,calls,clients,fetcher,digest,getClient:id=>clients.get(id)};
}
function manifest(assets,release='a'.repeat(64),scope='https://synthetic.invalid/Portfolio/'){
 return {scope,release,shell:'portfolio_v5.html',assets:assets.map(a=>({path:a.path,kind:a.kind,size:Buffer.byteLength(a.body),sha256:sha(a.body)}))};
}
function event(path,{scope='https://synthetic.invalid/Portfolio/',mode='cors',destination='',clientId='app',method='GET',headers={}}={}){
 return {request:{url:new URL(path,scope).href,method,mode,destination,headers:new Headers(headers)},clientId};
}
function worker(file,env){
 const handlers={},flags={skipWaiting:0,claim:0};const self={location:new URL(env.scope),addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting:()=>{flags.skipWaiting++;},clients:{claim:()=>{flags.claim++;}},registration:{scope:env.scope}};
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{self,caches:env.caches,fetch:env.fetcher,URL,Response,Date,console});
 return {flags,async lifecycle(name){const waited=[];handlers[name]({waitUntil:p=>waited.push(p)});await Promise.all(waited);},async fetch(ev){let result=null;handlers.fetch({...ev,respondWith:p=>result=p});if(!result)return null;const r=await result;await new Promise(setImmediate);return r;}};
}
module.exports={sha,digest,MemoryCaches,environment,manifest,event,worker,response};
