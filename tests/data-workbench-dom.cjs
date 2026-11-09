'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
let JSDOM;try{({JSDOM}=require('jsdom'));}catch(_){console.error('jsdom 이 필요합니다: npm install (package.json 의 devDependencies) 후 다시 실행하세요.');process.exit(2);}
const root=path.join(__dirname,'../has');
const dom=new JSDOM(fs.readFileSync(path.join(root,'data-workbench.html'),'utf8'),{runScripts:'outside-only',url:'https://offline.invalid/has/data-workbench.html'});
const w=dom.window,d=w.document,$=id=>d.getElementById(id),click=id=>$(id).click();w.TextEncoder=TextEncoder;
w.localStorage.setItem('HAS_SENTINEL','unchanged');w.sessionStorage.setItem('HAS_SESSION','unchanged');
let writes=0;['setItem','removeItem','clear'].forEach(k=>{w.Storage.prototype[k]=()=>{writes++;throw Error('Forbidden storage mutation');};});
const input=v=>{$('document-input').value=v;$('document-input').dispatchEvent(new w.Event('input'));};
for(const file of ['quote-model.js','valuation-engine.js','valuation-fixtures.js','sec-facts-adapter.js','sec-facts-fixture.js','market-data.js','market-fixtures.js','data-workbench.js'])if(fs.existsSync(path.join(root,file)))w.eval(fs.readFileSync(path.join(root,file),'utf8'));
assert.equal($('document-input').value,'');click('analyze');assert.match($('status').textContent,/입력하세요/);
for(const value of ['{broken','null','[]','1']){input(value);click('analyze');assert.match($('status').textContent,/JSON/);}
input('가'.repeat(333334));click('analyze');assert.match($('status').textContent,/1 MB/);
const actual=w.HASMarketData;let called;
w.HASMarketData={analyzeJSON:(raw,now)=>{assert.equal(typeof raw,'string');const pack=JSON.parse(raw);called=now;return{status:'invalid',mode:pack.mode,instrument:{ticker:'<img src=x onerror=alert(1)>',currency:'KRW'},quote:{label:'거절',selected:{source:'<script>alert(1)</script>',asOfTime:'2000-01-01',receivedAt:'2000-01-01'},issues:['오래된 시세']},chart:{status:'ok',points:pack.points||[{date:'a',close:10},{date:'b',close:null},{date:'c',close:10}],metrics:{}},valuation:{ticker:'WRONG-VALUATION-IDENTITY',quality:{status:'missing'}},secFacts:{status:'ready',observations:{revenue:{value:1,source:'<img src=x onerror=alert(1)>'}},selectionEvidence:[{verification:'verified'}]},issues:['권리 확인 필요']};}};
input('{"mode":"synthetic"}');click('analyze');assert.match($('status').textContent,/검사 완료/);assert.match($('quote-body').textContent,/IMPORTED/);assert.ok(Date.now()-Date.parse(called)<60000);assert.equal(d.querySelectorAll('#quote-body img,#quote-body script').length,0);assert.match($('quote-body').textContent,/<script>/);assert.doesNotMatch($('chart-body').textContent,/WRONG-VALUATION/);assert.equal(d.querySelectorAll('svg polyline.close').length,2);assert.equal(d.querySelectorAll('[data-signal]').length,3);assert.match(d.querySelector('[data-sec-facts]').textContent,/미검증/);assert.equal(d.querySelectorAll('[data-sec-facts] img').length,0);
for(const points of [[],[{date:'one',close:0}],[{date:'a',close:1},{date:'b',close:1}]]){input(JSON.stringify({points}));assert.equal(d.querySelectorAll('svg').length,0);click('analyze');assert.doesNotMatch($('chart-body').innerHTML,/NaN|Infinity/);}
w.dispatchEvent(new w.Event('pageshow'));assert.equal(d.querySelectorAll('[data-signal]').length,0);
w.HASMarketData=null;click('analyze');assert.match($('status').textContent,/엔진/);
w.HASMarketData=actual;
assert.ok(actual&&w.HASMarketFixtures,'Market engine and fixture modules must load');
{input('{}');click('analyze');assert.equal(d.querySelectorAll('svg').length,0);click('load-sample');assert.match($('status').textContent,/SYNTHETIC/);click('analyze');assert.match($('status').textContent,/검사 완료/);assert.ok(d.querySelectorAll('svg polyline.close').length>0);assert.match($('quote-body').textContent,/SYNTHETIC/);console.log('PASS actual engine sample integration');}
for(const a of d.querySelectorAll('nav a'))assert.ok(d.querySelector(a.getAttribute('href')));
click('reset');click('reset');assert.equal($('document-input').value,'');assert.equal(d.querySelectorAll('svg').length,0);assert.equal(w.localStorage.getItem('HAS_SENTINEL'),'unchanged');assert.equal(w.sessionStorage.getItem('HAS_SESSION'),'unchanged');assert.equal(writes,0);assert.equal(w.localStorage.length,1);assert.equal(w.sessionStorage.length,1);
console.log('PASS DOM: controls, byte limit, invalid JSON, inert malicious strings, identity, finite/flat/gap charts, stale clearing, missing engine, reset, storage sentinel');w.close();
