'use strict';
// Node-only memory CacheStorage model over exact local pinned files.
// NOT a full-app browser test, HTTP server, performance measurement or production registration.
// Run: node --require ./evidence-speed/strict-network-preload.cjs --test tests/sw-speed-lab/full-manifest-model.cjs
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const H=require('./harness.cjs'),{create,TYPES}=require('./generation-cache.js'),{build}=require('./build.cjs');
const root=path.resolve(__dirname,'../..'),config=JSON.parse(fs.readFileSync(path.join(__dirname,'generated/manifest.json'),'utf8'));
assert.equal(config.assets.length,42,'exact full-manifest size');
assert.deepEqual(config,build().config,'generated manifest matches current local builder/kernel/files');
const files=config.assets.map(a=>{const body=fs.readFileSync(path.join(root,a.path));assert.equal(body.length,a.size,a.path+' size');assert.equal(H.sha(body),a.sha256,a.path+' hash');return {...a,body,mime:TYPES[a.kind][0]};});
function fixture(){const env=H.environment(files);return {env,g:create({...config,scope:env.scope},env)}}
const ev=a=>H.event(a.path,{mode:a.path===config.shell?'navigate':'cors',destination:a.kind==='js'?'script':a.kind==='css'?'style':''});
async function exactResponse(g,a){const r=await g.route(ev(a));assert.equal(r.status,200,a.path);assert.equal(H.sha(Buffer.from(await r.arrayBuffer())),a.sha256,a.path);}
async function install(){const f=fixture();await f.g.install();return {...f,cache:await f.env.caches.open(f.g.name)}}

test('42 exact local assets install, activate and serve offline with pinned hashes',async()=>{
 const {env,g,cache}=await install();assert.equal(env.calls.length,42);assert.equal(cache.items.size,43);assert.ok(await g.verify(cache));await g.activate();env.calls.length=0;env.routes.clear();
 for(const a of files)await exactResponse(g,a);assert.equal(env.calls.length,0);
});
test('failure after partial next-generation install removes only incomplete next cache',async()=>{
 const {env,g,cache}=await install();const next=create({...config,scope:env.scope,release:'b'.repeat(64)},env),beforePuts=env.caches.puts;
 env.routes.get(env.scope+files[20].path).fail=true;await assert.rejects(next.install(),/Synthetic network failure/);
 assert.equal(env.caches.puts-beforePuts,20);assert.equal(env.caches.buckets.has(next.name),false);assert.equal(env.caches.buckets.get(g.name),cache);assert.ok(await g.verify(cache));
 env.routes.clear();for(const a of files)await exactResponse(g,a);
});
test('missing full-manifest script repairs only same hash then serves offline',async()=>{
 const {env,g,cache}=await install(),a=files.find(a=>a.kind==='js');await cache.delete(g.assetKey(a.path));env.calls.length=0;
 await exactResponse(g,a);assert.equal(env.calls.length,1);assert.ok(await g.verify(cache));env.routes.clear();await exactResponse(g,a);assert.equal(env.calls.length,1);
});
test('same-size changed script bytes rejected without caching, exact retry succeeds',async()=>{
 const {env,g,cache}=await install(),a=files.find(a=>a.kind==='js');await cache.delete(g.assetKey(a.path));const mutated=Buffer.from(a.body);mutated[0]^=1;env.routes.get(env.scope+a.path).body=mutated;
 assert.equal((await g.route(ev(a))).type,'error');assert.equal(await cache.match(g.assetKey(a.path)),undefined);
 env.routes.get(env.scope+a.path).body=a.body;await exactResponse(g,a);assert.ok(await g.verify(cache));
});
test('completed same-generation sequential reinstall performs no fetch or writes',async()=>{
 const {env,g,cache}=await install(),puts=env.caches.puts;env.calls.length=0;env.routes.clear();await create({...config,scope:env.scope},env).install();
 assert.equal(env.calls.length,0);assert.equal(env.caches.puts,puts);assert.equal(env.caches.deleted.length,0);assert.equal(env.caches.buckets.get(g.name),cache);assert.ok(await g.verify(cache));
});
test('activation protects unrelated and other-scope caches; internal keys hide real URLs',async()=>{
 const {env,g}=fixture(),otherScope='https://synthetic.invalid/Other/';
 const protectedNames=['synthetic-unrelated','portfolio-v5-synthetic','has-generation-v1:'+encodeURIComponent(otherScope)+':'+'c'.repeat(64)];
 for(const name of protectedNames){const c=await env.caches.open(name);await c.put(env.scope+'synthetic-sentinel',H.response(name));}
 const old=g.prefix+'d'.repeat(64);await env.caches.open(old);await g.install();await g.activate();assert.deepEqual(env.caches.deleted,[old]);
 for(const name of protectedNames)assert.equal(await(await(await env.caches.open(name)).match(env.scope+'synthetic-sentinel')).text(),name);
 for(const a of files)assert.equal(await env.caches.match(env.scope+a.path),undefined,'original URL hidden: '+a.path);
});
test('whole full-manifest cache loss fails closed without downloading or rebuilding',async()=>{
 const {env,g}=await install();await env.caches.delete(g.name);env.calls.length=0;
 for(const a of files)assert.equal((await g.route(ev(a))).type,'error',a.path);
 assert.equal(env.calls.length,0);assert.equal((await env.caches.open(g.name)).items.size,0);
});
