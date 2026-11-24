'use strict';
const test=require('node:test'),a=require('node:assert/strict'),R=require('../has/review-cards.js'),fs=require('node:fs'),path=require('node:path');
test('review cards: published latest.json validates; bad cards and non-https links are dropped',()=>{
  const doc=JSON.parse(fs.readFileSync(path.join(__dirname,'../reviews/latest.json'),'utf8'));const v=R.validate(doc);
  a.ok(v);a.equal(v.cards.length,doc.cards.length);a.match(v.notice,/투자 자문이 아닙니다/);
  const bad=JSON.parse(JSON.stringify(doc));bad.cards[0].verdict='strong-buy';bad.cards[1].sources=[{title:'x',url:'http://x.invalid'}];bad.cards[2].headline='';
  a.equal(R.validate(bad).cards.length,doc.cards.length-3);
  a.equal(R.validate({v:2}),null);a.equal(R.validate(Object.assign({},doc,{notice:''})),null);
});
test('review cards: holdings-latest.json validates with all verdict kinds known',()=>{
  const doc=JSON.parse(fs.readFileSync(path.join(__dirname,'../reviews/holdings-latest.json'),'utf8'));const v=R.validate(doc);
  a.ok(v);a.equal(v.cards.length,doc.cards.length);a.ok(v.cards.some(c=>c.verdict==='trim-review'));a.match(v.notice,/투자 자문이 아닙니다/);
});
test('review cards: buy-review cards carry priority rank and post-buy watch criteria',()=>{
  const v=R.validate(JSON.parse(fs.readFileSync(path.join(__dirname,'../reviews/latest.json'),'utf8')));
  const buys=v.cards.filter(c=>c.verdict==='buy-review');a.ok(buys.length);for(const c of buys){a.ok(Number.isInteger(c.rank));a.ok(c.watch.length>=2);}
  a.deepEqual(buys.map(c=>c.rank).sort(),[1,2,3,4]);
});
