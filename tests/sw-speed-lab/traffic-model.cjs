'use strict';
// Deterministic request/body-byte model. Not a timing, HTTP-cache or phone benchmark.
const fs=require('node:fs'),path=require('node:path'),a=require('node:assert/strict');
const H=require('./harness.cjs'),{create}=require('./generation-cache.js'),{build}=require('./build.cjs');
const root=path.resolve(__dirname,'../..'),{config}=build();
const assets=config.assets.map(x=>({...x,body:fs.readFileSync(path.join(root,x.path))}));
const bytes=env=>env.calls.reduce((sum,c)=>sum+Buffer.byteLength(env.routes.get(c.url).body),0);
(async()=>{
 const oldEnv=H.environment(assets),old=H.worker(path.join(root,'service-worker.js'),oldEnv);
 await old.lifecycle('install');const oldInstall={requests:oldEnv.calls.length,responseBodyBytes:bytes(oldEnv),cacheWrites:oldEnv.caches.puts};
 oldEnv.calls.length=0;oldEnv.caches.puts=0;
 for(const item of assets)await old.fetch(H.event(item.path,{mode:item.kind==='html'?'navigate':'cors',destination:item.kind==='js'?'script':item.kind==='css'?'style':''}));
 const oldWarm={requests:oldEnv.calls.length,responseBodyBytes:bytes(oldEnv),cacheWrites:oldEnv.caches.puts};
 a.ok(oldEnv.calls.every(c=>c.options&&c.options.cache==='no-store'));
 const env=H.environment(assets),g=create({...config,scope:env.scope},env);await g.install();await g.activate();
 const candidateInstall={requests:env.calls.length,responseBodyBytes:bytes(env),cacheWrites:env.caches.puts};env.calls.length=0;env.caches.puts=0;
 for(const item of assets){const r=await g.route(H.event(item.path,{mode:item.kind==='html'?'navigate':'cors',destination:item.kind==='js'?'script':item.kind==='css'?'style':''}));a.equal(r.status,200);a.equal(H.sha(Buffer.from(await r.arrayBuffer())),item.sha256);}
 const candidateWarm={requests:env.calls.length,responseBodyBytes:bytes(env),cacheWrites:env.caches.puts};
 a.equal(oldWarm.requests,assets.length);a.equal(candidateWarm.requests,0);a.equal(candidateWarm.cacheWrites,0);
 const result={scope:'Synthetic, controlled request trace over the exact manifest. NOT observed browser/phone traffic or elapsed time.',base:'c7de558f2b134009b5a9ca6bfc2edc6444f4568f',release:config.release,manifestAssets:assets.length,manifestBodyBytes:assets.reduce((s,x)=>s+x.size,0),oldInstall,oldWarm,candidateInstall,candidateWarm,excludes:['Initial uncontrolled navigation','Service-worker update checks/download','External fonts and market/data requests','HTTP compression/headers/304 behavior','Install/activation lifecycle and device CPU time']};
 fs.writeFileSync(path.join(root,'evidence-sw-c7de558/traffic-model.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
