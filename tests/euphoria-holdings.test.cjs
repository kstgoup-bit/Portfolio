'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(path.join(__dirname,'../has/live-price-panel.js'),'utf8');
const tick=()=>new Promise(r=>setImmediate(r));
function run(drawdown,weights){
  const dom=new JSDOM('<input id="usdKrw" value="1400"><div id="b"></div>',{url:'https://app.test',runScripts:'outside-only'}),w=dom.window;
  w.genStocks=[];w.domStocks=[{ticker:'005930',name:'삼성전자',quantity:1,currentPrice:1}];w.penStocks=[];w.ovStocks=[{ticker:'MSFT',name:'마이크로소프트',quantity:1,currentPrice:100}];w.gasUrl='https://script.google.com/macros/s/test/exec';
  w.HASPortfolioReader={read(){return {complete:true,holdings:Object.entries(weights).map(([k,v])=>({market:k.split(':')[0],ticker:k.split(':')[1],weightPct:v}))};}};
  w.HASLivePriceReference={createService(){return {load:async()=>({items:[{ticker:'MSFT',market:'US',status:'ready',record:{}},{ticker:'005930',market:'KR',status:'ready',record:{}}]})};},analyze(rec,o){return {ok:true,source:'GAS',asOf:'2026-11-13',currency:'USD',drawdownPct:drawdown[o.ticker],returns:{}};}};
  w.eval(source);w.HASLivePricePanel.mount(w.document.querySelector('#b'),'euphoria');return {w,box:w.document.querySelector('#b')};
}
test('euphoria: holdings only (no universe tickers), sorted by weight desc, high-zone label',async()=>{
  const {box}=run({MSFT:-3,'005930':-30},{'US:MSFT':30,'KR:005930':8});box.querySelector('button').click();await tick();
  const names=[...box.querySelectorAll('article h4')].map(h=>h.textContent);assert.deepEqual(names,['마이크로소프트 (MSFT)','삼성전자 (005930)']);
  const t=box.textContent;assert.match(t,/52주 고점권 · 고점 대비 -3.0%/);assert.match(t,/52주 고점권 아님 · 고점 대비 -30.0%/);assert.match(t,/기업가치 대비 과열 여부는 재무 연결 전 판단 보류/);
});
test('euphoria: weight over 10% flags limit note without sell/buy wording; at or under 10% no flag',async()=>{
  const a=run({MSFT:-3,'005930':-30},{'US:MSFT':30,'KR:005930':8});a.box.querySelector('button').click();await tick();
  assert.match(a.box.textContent,/한도 10% 초과 · 확신 종목이면 한도 25%/);assert.equal((a.box.textContent.match(/한도 10% 초과/g)||[]).length,1);assert.ok(!/매도하세요|팔|매도 추천/.test(a.box.textContent));
  const b=run({MSFT:-3,'005930':-30},{'US:MSFT':10,'KR:005930':8});b.box.querySelector('button').click();await tick();assert.ok(!/한도 10% 초과/.test(b.box.textContent));
});
