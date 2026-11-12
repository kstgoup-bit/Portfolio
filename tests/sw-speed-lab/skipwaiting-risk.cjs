'use strict';
/* CONDITIONAL routing counterexample, NOT a browser lifecycle reproduction.
 * We explicitly model an already-loaded A document whose controller has switched
 * to B (the Activate algorithm updates clients using that registration).
 * No skipWaiting/claim implementation, sockets, user data, or production changes.
 * Sources checked 2026-11-12:
 * https://w3c.github.io/ServiceWorker/#activation-algorithm
 * https://web.dev/articles/service-worker-lifecycle
 * Run: node --require ./evidence-speed/strict-network-preload.cjs --test tests/sw-speed-lab/skipwaiting-risk.cjs
 */
const test=require('node:test'),assert=require('node:assert/strict');
const {create}=require('./generation-cache.js'),H=require('./harness.cjs');
const generation=version=>[
 {path:'portfolio_v5.html',kind:'html',body:'<html>DOCUMENT_'+version+'<script src="app.js"></script></html>'},
 {path:'app.js',kind:'js',body:'globalThis.syntheticVersion="'+version+'";'}
];
async function setup(){
 const a=generation('A'),b=generation('B'),env=H.environment(a);
 const old=create(H.manifest(a,'a'.repeat(64),env.scope),env);await old.install();await old.activate();
 const documentA=await(await old.route(H.event('portfolio_v5.html',{mode:'navigate'}))).text();
 for(const asset of b)env.routes.get(env.scope+asset.path).body=asset.body;
 const next=create(H.manifest(b,'b'.repeat(64),env.scope),env);await next.install();
 return {env,old,next,documentA};
}
test('control: B waits, A document routed through A still receives A script',async()=>{
 const {env,old,next,documentA}=await setup();env.routes.clear();
 const script=await(await old.route(H.event('app.js',{destination:'script'}))).text();
 assert.match(documentA,/DOCUMENT_A/);assert.match(script,/Version="A"/);
 assert.ok(env.caches.buckets.has(old.name));assert.ok(env.caches.buckets.has(next.name));
});
test('conditional forced controller switch without claim: A document receives B script',async()=>{
 const {env,old,next,documentA}=await setup();
 // Explicit model premise: force activation while old document remains alive.
 // create().activate() is cache cleanup, NOT a real browser activation operation.
 await next.activate();env.routes.clear();env.calls.length=0;
 const script=await(await next.route(H.event('app.js',{destination:'script',clientId:'app'}))).text();
 assert.match(documentA,/DOCUMENT_A/);assert.match(script,/Version="B"/);
 assert.equal(env.calls.length,0,'mixed response is valid B cache, not network fallback');
 assert.equal(env.caches.buckets.has(old.name),false,'B cleanup removes A cache');
 assert.equal(env.clients.get('app').url,env.scope+'portfolio_v5.html','same old document URL cannot identify its release');
});
test('forced B controller routes same-URL old and newly navigated clients identically',async()=>{
 const {env,next,documentA}=await setup();await next.activate();
 env.clients.set('new-document',{url:env.scope+'portfolio_v5.html'});
 const documentB=await(await next.route(H.event('portfolio_v5.html',{mode:'navigate'}))).text();
 const oldScript=await(await next.route(H.event('app.js',{destination:'script',clientId:'app'}))).text();
 const newScript=await(await next.route(H.event('app.js',{destination:'script',clientId:'new-document'}))).text();
 assert.match(documentA,/DOCUMENT_A/);assert.match(documentB,/DOCUMENT_B/);assert.equal(oldScript,newScript);assert.match(oldScript,/Version="B"/);
});
