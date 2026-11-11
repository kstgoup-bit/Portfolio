'use strict';
const test=require('node:test'),a=require('node:assert/strict');
const M=require('../has/market-data'),F=require('../has/market-fixtures');
const run=p=>M.analyzePack(p,F.NOW),raw=s=>M.analyzeJSON(s,F.NOW);
const bad=r=>a.equal(r.status,'invalid');
test('JSON-text and trusted-object fixture results match without input mutation',()=>{
  const p=F.create(),s=JSON.stringify(p);a.deepEqual(raw(s),run(p));a.equal(JSON.stringify(p),s);
});
test('untrusted API rejects non-string inputs without inspecting or coercing them',()=>{
  let hits=0;const proxy=new Proxy({}, {get(){hits++;throw Error();},ownKeys(){hits++;throw Error();},getPrototypeOf(){hits++;throw Error();}});
  for(const x of [proxy,new String('{}'),null,undefined,1])bad(raw(x));a.equal(hits,0);
  for(const x of ['{','null','[]','1','"text"'])bad(raw(x));
});
test('byte, depth, node, and sparse-array limits reject before expansion',()=>{
  for(const x of [' '.repeat(1000001),'"'+'가'.repeat(333334)+'"','['.repeat(18)+'0'+']'.repeat(18),'['+'0,'.repeat(150000)+'0]'])bad(raw(x));
  for(const value of [new Array(4294967295),'x'.repeat(1000001),'가'.repeat(333334),Array(150000).fill(0)]){const p=F.create();p.extra=value;bad(run(p));}
});
test('ordinary accessors and own toJSON never execute',()=>{
  let hits=0;const p=F.create();Object.defineProperty(p,'extra',{enumerable:true,get(){hits++;return 1;}});bad(run(p));
  const q=F.create();q.toJSON=()=>{hits++;return {};};bad(run(q));a.equal(hits,0);
});
test('descriptor snapshot does not revisit root getter introduced by nested Proxy',()=>{
  let hits=0,traps=0;const p=F.create();p.extra=new Proxy({}, {ownKeys(){traps++;Object.defineProperty(p,'version',{get(){hits++;return 1;}});return [];}});
  a.equal(run(p).status,'preview');a.ok(traps>0);a.equal(hits,0);
  // Reflection traps DID execute: this test is not a generic Proxy sandbox claim.
});
test('inherited toJSON hooks do not run at snapshot or legacy valuation handoff',()=>{
  const p=F.create(),s=JSON.stringify(p);let hits=0;
  for(const proto of [Object.prototype,Array.prototype]){
    Object.defineProperty(proto,'toJSON',{configurable:true,value(){hits++;throw Error('hook');}});
    try{a.equal(run(p).status,'preview');a.equal(raw(s).status,'preview');}finally{delete proto.toJSON;}
  }
  a.equal(hits,0);
});
test('JSON prototype-looking keys stay inert, do not grant envelope fields',()=>{
  bad(raw('{"__proto__":{"version":1,"mode":"synthetic"},"constructor":{"prototype":{"boundaryPolluted":true}}}'));
  const p=JSON.parse(JSON.stringify(F.create()));p.extra=JSON.parse('{"__proto__":{"boundaryPolluted":true},"constructor":{"prototype":{"boundaryPolluted":true}}}');
  a.equal(run(p).status,'preview');a.equal({}.boundaryPolluted,undefined);
});
test('undefined object fields and sparse array slots keep JSON omission/null behavior',()=>{
  const p=F.create();p.extra=undefined;p.unused=[undefined,,null];a.equal(run(p).status,'preview');
});
