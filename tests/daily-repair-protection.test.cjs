'use strict';
const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
require('./lib/no-network.cjs');
const ROOT=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(ROOT,p),'utf8'),sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const P=require('./lib/daily-repair-projection.cjs'),pins=require('./lib/daily-repair-pins.json');
test('daily repair reverses enumerated reviewed edits to exact remote baseline bytes',()=>{
 a.equal(pins.remoteBaseline,'d3f123fc757f4c6ad0a5017de8be894a3ae6e71b');
 for(const[file,hash]of Object.entries(pins.baselineSha256))a.equal(sha(P.beforeDailyRepairBytes(file)),hash,file);
 for(const[file,hash]of Object.entries({...pins.reviewedSha256,...pins.addedRuntimeFiles}))a.equal(sha(require('./lib/daily-followup-projection.cjs').beforeFollowupBytes(file)),hash,file);
 a.equal(require('./lib/has-daily-repair-edits.json')['portfolio_v5.html'].length,pins.htmlHunks);
 a.equal(Object.keys(pins.reviewedSha256).length,6);
});
test('portable proof needs neither Git executable nor local commit refs',()=>{
 a.equal(P.assertPortableKisPreservation(),167);
 for(const file of ['tests/lib/daily-repair-projection.cjs','tests/kis-auth-independent.test.cjs'])a.doesNotMatch(read(file),/execFileSync|spawnSync|git diff|eba37f0/);
});
test('only approved v2 benchmark sidecar storage key is added, never credentials',()=>{
 const keys=s=>[...new Set(s.match(/\b(v5_[A-Za-z0-9_]+|has_[a-z_0-9]+|kst\.[a-z.A-Z0-9_]+)/g)||[])].sort();
 const old=keys(P.beforeDailyRepairText('portfolio_v5.html')),now=keys(read('portfolio_v5.html'));
 a.deepEqual(now.filter(x=>!old.includes(x)),['v5_benchHistV2']);a.deepEqual(old.filter(x=>!now.includes(x)),[]);
 const B=require('../backup/core.js');a.equal(B.VERSION,7);a.ok(B.allowed('v5_benchHistV2'));
 for(const k of ['v5_pw','v5_geminiKey','v5_alphaVantageKey','v5_auth','KIS_APP_SECRET','v5_kisKey'])a.equal(B.allowed(k),false);
});
test('endpoint occurrences match exact reviewed changes and no KIS live path is activated',()=>{
 const urls=s=>(s.match(/https?:\/\/[^\s"'<>)]+/g)||[]).sort();
 const expected=urls(P.beforeDailyRepairText('portfolio_v5.html'));
 for(const u of pins.removedExternalURLOccurrences){const at=expected.indexOf(u);a.ok(at>=0);expected.splice(at,1);}
 expected.push(...pins.addedExternalURLOccurrences);a.deepEqual(urls(read('portfolio_v5.html')),expected.sort());
 const html=read('portfolio_v5.html');a.doesNotMatch(html,/kis-free-auth|openapi\.koreainvestment/);
 a.equal(require('../has/benchmark-history-policy.js').liveGasEnabled,true);
});
test('analysis pure modules cannot read storage, call providers or submit orders',()=>{
 for(const f of ['has/return-assessment.js','has/benchmark-history-policy.js']){
  const s=read(f).replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');
  a.doesNotMatch(s,/\b(?:localStorage|sessionStorage|XMLHttpRequest|WebSocket|fetch|indexedDB|eval)\s*[.(]|\b(?:submitOrder|placeOrder)\s*\(/,f);
 }
});
test('main and synthetic rehearsal load policy dependencies before backup exactly once',()=>{
 const dependencies=['has/snapshot-policy.js','has/return-assessment.js','has/quote-model.js','has/benchmark-history-policy.js'];
 for(const file of ['portfolio_v5.html','has/restore-rehearsal.html']){
  const scripts=[...read(file).matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map(m=>path.posix.normalize(path.posix.join(path.posix.dirname(file),m[1])));
  const core=scripts.indexOf('backup/core.js');a.ok(core>=0,file);
  for(const d of dependencies){a.equal(scripts.filter(x=>x===d).length,1,d);a.ok(scripts.indexOf(d)<core,d);}
  a.ok(scripts.indexOf('has/snapshot-policy.js')<scripts.indexOf('has/return-assessment.js'));
  a.ok(scripts.indexOf('has/quote-model.js')<scripts.indexOf('has/benchmark-history-policy.js'));
 }
});
