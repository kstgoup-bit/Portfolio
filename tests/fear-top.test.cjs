'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('fs');const path=require('path');const crypto=require('crypto');
const {JSDOM}=require('jsdom');
const Screen=require('../has/universe-screen.js');const Fear=require('../has/fear-top.js');
const NOW=Date.parse('2026-11-14T06:00:00Z');
function summary(n,over){const items=[];for(let i=0;i<n;i++)items.push({ticker:'T'+String(i).padStart(2,'0'),market:i%2?'KR':'US',scope:'core',status:'reference',asOf:'2026-11-13T21:00:00Z',drawdownPct:-(5+i*2),price:100+i,currency:i%2?'KRW':'USD',source:'synthetic',returns:{}});return Object.assign({generatedAt:'2026-11-14T00:00:00Z',generation:'synthetic-test-only',items,sources:[]},over||{});}
test('select: top 10 by deepest drawdown, 3 visible + 7 hidden; stale/missing never ranked',()=>{
  const s=summary(14);s.items[0].status='stale';s.items[1].drawdownPct=null;
  const r=Fear.select(s,NOW,Screen.rank);assert.equal(r.rows.length,10);assert.equal(r.visible.length,3);assert.equal(r.hidden.length,7);
  assert.ok(r.rows.every(x=>x.status==='reference'&&Number.isFinite(x.drawdownPct)));
  for(let i=1;i<r.rows.length;i++)assert.ok(r.rows[i-1].drawdownPct<=r.rows[i].drawdownPct);
  assert.equal(r.rows[0].ticker,'T13');
});
test('select: fewer than 10 → all shown, expired summary → empty',()=>{
  assert.equal(Fear.select(summary(2),NOW,Screen.rank).hidden.length,0);
  assert.equal(Fear.select(summary(12,{generatedAt:'2026-11-10T00:00:00Z'}),NOW,Screen.rank).total,0);
  assert.equal(Fear.select(null,NOW,Screen.rank).total,0);
});
function dom(deps){const d=new JSDOM('<!doctype html><body><div id="b"></div></body>',{url:'https://example.test/'});global.document=d.window.document;global.window=d.window;
  const box=d.window.document.getElementById('b');const api=Fear.mount(box,Object.assign({screen:{rank:Screen.rank,validateSummary:s=>s},now:()=>NOW},deps));return {box,api,d};}
test('mount: nothing fetched until button; 3 shown, expand shows rest, collapse hides',async()=>{
  let calls=0;const {box,api}=dom({endpoint:()=>'https://script.google.com/macros/s/x/exec',transport:async()=>{calls++;return summary(14);}});
  assert.equal(calls,0);assert.equal(box.querySelectorAll('article').length,0);
  await api.refresh();assert.equal(calls,1);
  const all=[...box.querySelectorAll('article')];assert.equal(all.length,10);
  const more=box.querySelector('#fear-top-more');assert.equal(more.hidden,true);assert.equal(all.filter(a=>!more.contains(a)).length,3);
  const tg=[...box.querySelectorAll('button')].find(b=>/펼치기/.test(b.textContent));assert.ok(tg);assert.match(tg.textContent,/7개/);assert.equal(tg.getAttribute('aria-expanded'),'false');
  tg.click();assert.equal(box.querySelector('#fear-top-more').hidden,false);
  const tg2=[...box.querySelectorAll('button')].find(b=>/접기/.test(b.textContent));assert.equal(tg2.getAttribute('aria-expanded'),'true');tg2.click();assert.equal(box.querySelector('#fear-top-more').hidden,true);
  await api.refresh();assert.equal(calls,1,'same KST day reuses memory cache');
});
test('mount: provisional label, no buy wording, opinion held; no GAS → hold message',async()=>{
  const a=dom({endpoint:()=>{throw Error('Invalid URL');},transport:async()=>summary(3)});await a.api.refresh();
  assert.match(a.box.textContent,/GAS가 연결되지 않았거나/);assert.equal(a.box.querySelectorAll('article').length,0);
  const b=dom({endpoint:()=>'https://script.google.com/macros/s/x/exec',transport:async()=>summary(5)});await b.api.refresh();
  const t=b.box.textContent;assert.match(t,/임시 순위/);assert.match(t,/기업 확인\(재무\) 전/);assert.match(t,/판단 보류/);assert.match(t,/반론/);assert.ok(!/매수 검토 후보|매수하세요|추천/.test(t.replace(/매수 권유가 아닙니다|매수를 권하지 않습니다/g,'')));
});
test('mount: transport failure keeps hold state, no storage use',async()=>{
  const {box,api,d}=dom({endpoint:()=>'https://script.google.com/macros/s/x/exec',transport:async()=>{throw Error('요약 조회 실패');}});
  await api.refresh();assert.match(box.textContent,/조회 보류/);assert.equal(d.window.localStorage.length,0);assert.equal(d.window.sessionStorage.length,0);
});
test('fear-top.js pinned and wired before radar/ui.js',()=>{
  const pins=require('./lib/live-data-pins.json');const f=path.join(__dirname,'..','has/fear-top.js');
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),pins.addedRuntimeFiles['has/fear-top.js']);
  const html=fs.readFileSync(path.join(__dirname,'..','portfolio_v5.html'),'utf8');
  assert.ok(html.indexOf('has/universe-screen.js')<html.indexOf('has/fear-top.js')&&html.indexOf('has/fear-top.js')<html.indexOf('radar/ui.js'));
});

test('mount: GAS without screen route (plain non-summary reply) → clear not-installed hold message, no cards',async()=>{
  const {box,api}=dom({endpoint:()=>'https://script.google.com/macros/s/x/exec',screen:{rank:Screen.rank,validateSummary:Screen.validateSummary},transport:async()=>({MSFT:{price:1},ok:true})});
  await api.refresh();const t=box.textContent;
  assert.match(t,/곡소리 계산\(200종목\)이 아직 설치되지 않았습니다/);assert.match(t,/순태씨 승인/);assert.ok(!/invalid-summary/.test(t));assert.equal(box.querySelectorAll('article').length,0);
});
