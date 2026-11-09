'use strict';
// Independent synthetic-only boundary review. No network or real credentials.
const test=require('node:test'),a=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {createRequire}=require('node:module');
const M=require('../has/market-data'),F=require('../has/market-fixtures');
function isolated(code){const filename=path.join(__dirname,'../has/market-data.js');const c={module:{exports:{}},require:createRequire(filename),fixtureText:JSON.stringify(F.create()),now:F.NOW};vm.createContext(c);vm.runInContext(fs.readFileSync(filename,'utf8'),c);vm.runInContext(code,c,{timeout:2000});return c.result;}
test('independent: analyzeJSON accepts text only without object coercion',()=>{
 let calls=0;const hostile={toString(){calls++;return JSON.stringify(F.create());}};
 a.equal(M.analyzeJSON(hostile,F.NOW).status,'invalid');a.equal(calls,0);
 a.equal(M.analyzeJSON(JSON.stringify(F.create()),F.NOW).quote.status,'consistent-unverified');
});
test('independent: snapshot does not re-read previously checked properties',()=>{
 const r=isolated(`let calls=0;const p=JSON.parse(fixtureText);p.extra=new Proxy({}, {getPrototypeOf(){Object.defineProperty(p,'version',{configurable:true,enumerable:true,get(){calls++;return 999;}});return Object.prototype;}});const out=module.exports.analyzePack(p,now);this.result={calls,status:out.quote.status};`);
 a.equal(r.calls,0);a.equal(r.status,'consistent-unverified');
});
test('independent: inherited toJSON and inherited evidence are not trusted',()=>{
 const r=isolated(`let calls=0;Object.prototype.toJSON=function(){calls++;throw Error('must not run');};Array.prototype.toJSON=function(){calls++;throw Error('must not run');};Object.prototype.version=1;Object.prototype.mode='synthetic';Object.prototype.verification='independent-verified';const missing=module.exports.analyzeJSON('{}',now);const good=module.exports.analyzeJSON(fixtureText,now);this.result={calls,missing:missing.status,quote:good.quote.status,verification:good.quote.selected.verification};`);
 a.equal(r.calls,0);a.equal(r.missing,'invalid');a.equal(r.quote,'consistent-unverified');a.equal(r.verification,'unverified');
});
test('independent: accessor objects rejected without getter invocation',()=>{
 let calls=0;const p=F.create();Object.defineProperty(p,'version',{enumerable:true,get(){calls++;return 1;}});
 a.equal(M.analyzePack(p,F.NOW).status,'invalid');a.equal(calls,0);
});
test('independent: sparse arrays and excessive strings fail before serialization',()=>{
 const r=isolated(`let serializations=0;JSON.stringify=function(){serializations++;throw Error('must not serialize caller');};const sparse=module.exports.analyzePack({extra:new Array(4294967295)},now);const string=module.exports.analyzePack({extra:'x'.repeat(1000001)},now);this.result={serializations,sparse:sparse.status,string:string.status};`);
 a.equal(r.serializations,0);a.equal(r.sparse,'invalid');a.equal(r.string,'invalid');
 a.equal(M.analyzeJSON(' '.repeat(1000001),F.NOW).status,'invalid');
 a.equal(M.analyzeJSON('"'+'한'.repeat(333334)+'"',F.NOW).status,'invalid');
});
test('independent: invalid text does not echo confidential-looking input',()=>{
 const marker='synthetic-private-marker';const r=M.analyzeJSON('{"secret":"'+marker,F.NOW);
 a.equal(r.status,'invalid');a.ok(!JSON.stringify(r).includes(marker));
});
test('independent: imported declared verification never upgrades selected price',()=>{
 const p=F.create();p.mode='imported';delete p.history;delete p.secFacts;delete p.valuationDocument;
 p.quotes.forEach(q=>{q.synthetic=false;q.source='Declared provider';q.verification='independent-verified';q.rights.synthetic=false;q.rights.reference='https://example.invalid/rights';});
 p.sessionCalendar={market:'US',timeZone:'America/New_York',source:'Declared calendar',reference:'https://example.invalid/calendar',reviewStatus:'reviewed',reviewedAt:'2026-11-06T22:00:00Z',from:'2026-11-06',through:'2026-11-08',sessions:[{date:'2026-11-06',status:'regular',closeAt:'2026-11-06T21:00:00Z'},{date:'2026-11-07',status:'closed',reason:'weekend'},{date:'2026-11-08',status:'closed',reason:'weekend'}]};
 const r=M.analyzeJSON(JSON.stringify(p),F.NOW);a.equal(r.quote.status,'consistent-unverified');a.equal(r.quote.selected.verification,'unverified');a.equal(r.quote.selected.freshness.calendar.verification,'unverified');a.equal(r.quote.comparison.independenceVerified,false);
});
test('independent: readiness is unverified even when complete/imported',()=>{
 const S=require('../has/source-readiness');const p=JSON.parse(fs.readFileSync(path.join(__dirname,'../docs/data-workbench/source-readiness.synthetic.json'),'utf8'));p.mode='imported';
 const r=S.inspectJSON(JSON.stringify(p));a.equal(r.status,'declared-only');a.equal(r.verification,'unverified');a.equal(r.liveConnection,'unavailable');a.equal(r.independenceVerified,false);a.equal(r.secretScanPerformed,false);
});
test('independent: readiness CLI rejects malformed UTF-8/JSON without echoing input or path',()=>{
 const cli=fs.readFileSync(path.join(__dirname,'../tools/source-readiness-check.cjs'),'utf8');
 for(const bytes of [Buffer.from('{"secret":"synthetic-private-marker'),Buffer.from([0xff,0xfe])]){
  let output='',closed=0;const processMock={argv:['node','cli','synthetic-private-path'],stdout:{write(s){output+=s;}}};
  const fsMock={constants:{O_RDONLY:0,O_NOFOLLOW:0},lstatSync(){return {isFile:()=>true,size:bytes.length};},openSync(){return 7;},fstatSync(){return {isFile:()=>true,size:bytes.length};},readSync(fd,b,offset){if(offset)return 0;bytes.copy(b);return bytes.length;},closeSync(fd){a.equal(fd,7);closed++;}};
  vm.runInNewContext(cli,{process:processMock,Buffer,TextDecoder,require(name){if(name==='node:fs')return fsMock;if(name==='../has/source-readiness')return require('../has/source-readiness');throw Error('unexpected require');}});
  a.equal(processMock.exitCode,1);a.equal(closed,1);a.ok(!output.includes('synthetic-private'));a.equal(JSON.parse(output).status,'invalid');a.equal(JSON.parse(output).verification,'unverified');
 }
});

// --- 클로 통합 검토(2026-11-09): 결과 동결 ---
test('준비도 결과는 깊이 동결되어 호출자가 상태를 바꿀 수 없다', () => {
  const R = require('../has/source-readiness.js'), fs = require('fs'), a = require('node:assert/strict');
  const ex = fs.readFileSync(require('path').join(__dirname, '../docs/data-workbench/source-readiness.synthetic.json'), 'utf8');
  for (const raw of [ex, '{', null]) { const r = R.inspectJSON(raw); a.ok(Object.isFrozen(r)); a.ok(Object.isFrozen(r.checks) && Object.isFrozen(r.issues)); a.throws(() => { 'use strict'; r.status = 'verified'; }, TypeError); a.throws(() => { 'use strict'; r.independenceVerified = true; }, TypeError); }
  a.equal(R.inspectJSON(ex).status, 'declared-only');
});
