'use strict';
// Independent review: synthetic values and memory storage only.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const B=require('../backup/core.js');
function memory(seed={}){
 const map=new Map(Object.entries(seed));const writes=[];
 return {get length(){return map.size;},key:i=>[...map.keys()][i]??null,getItem:k=>map.get(k)??null,
 setItem(k,v){writes.push(k);map.set(k,String(v));},removeItem(k){writes.push(k);map.delete(k);},writes};
}
const parse=(fg,version='v5')=>B.parse(JSON.stringify({version,domStocks:[],fg}));
test('null FG and absent general account never enter preview or journal ownership, including intervening edits',()=>{
 const storage=memory({v5_dom:'[]',v5_fg:'25',v5_gen:'[]'}),plan=parse(null);
 assert.equal(B.preview(storage,plan).some(x=>['v5_fg','v5_gen'].includes(x.key)),false);
 storage.setItem('v5_fg','75'); storage.setItem('v5_gen','[]'); storage.writes.length=0;
 const journal=B.apply(storage,plan);
 for(const key of ['v5_fg','v5_gen']){
  assert.equal(Object.hasOwn(journal.before,key),false);assert.equal(Object.hasOwn(journal.after,key),false);
  assert.equal(storage.writes.includes(key),false);
 }
 B.undo(storage);assert.equal(storage.getItem('v5_fg'),'75');assert.equal(storage.writes.includes('v5_fg'),false);
});
test('FG string change after preview blocks apply before any write',()=>{
 const storage=memory({v5_dom:'[]',v5_fg:'25'}),plan=parse('50');B.preview(storage,plan);
 storage.setItem('v5_fg','75');storage.writes.length=0;
 assert.throws(()=>B.apply(storage,plan),/미리보기 이후/);assert.deepEqual(storage.writes,[]);
 assert.equal(storage.getItem('v5_fg'),'75');assert.equal(storage.getItem(B.JOURNAL),null);
});
test('null alone is not a restore plan and null cannot bypass other invalid fields',()=>{
 assert.throws(()=>B.parse('{"version":"v5","fg":null}'),/지원 자료/);
 assert.throws(()=>B.parse('{"version":"v5","domStocks":null,"fg":null}'));
 assert.throws(()=>B.parse('{"version":"v5","domStocks":[],"fg":null,"usdKrw":"1400"}'));
});
test('all supported legacy version tags keep identical FG conversion semantics',()=>{
 for(const version of ['v4',4,'v5',5]){
  assert.equal(parse('50',version).values.v5_fg,'50');
  assert.equal(Object.hasOwn(parse(null,version).values,'v5_fg'),false);
  assert.equal(parse(50,version).values.v5_fg,'50');
 }
});
test('valid numeric spelling is preserved verbatim rather than normalized',()=>{
 for(const raw of ['-0','0.00','5e1','1E+2','1e-2','100.000'])assert.equal(parse(raw).values.v5_fg,raw);
});
test('malformed numeric strings, non-numeric types and overflow do not enter plans',()=>{
 for(const raw of ['+50','.5','50.',' 0','0\n','1_0','0b10','0o10','1e309','-0.1','100.0001','null','false',false,{},[]])assert.throws(()=>parse(raw),String(raw));
 assert.throws(()=>B.parse('{"version":"v5","domStocks":[],"fg":1e309}'));
 assert.throws(()=>B.parse('{"version":"v5","domStocks":[],"fg":null,"fg":"50"}'),/중복/);
});
test('no actual general-account source is synthesized from its snapshots or calculator fields',()=>{
 const plan=B.parse(JSON.stringify({version:'v5',domStocks:[],fg:'50',snapshots:{gen:[{ts:1,val:100}]},calcData:{calc_q1_gen_4:'2'}}));
 assert.equal(Object.hasOwn(plan.values,'v5_gen'),false);
 assert.match(plan.warnings.join(' '),/불완전 백업/);
 const target=memory();B.apply(target,plan);assert.equal(target.getItem('v5_gen'),null);
 assert.throws(()=>B.create(target),/4개 계좌/);
});
