'use strict';
// 재무 필터 3단계: 곡소리 카드·환호성 보유종목 재무 라벨(합성 자료만, 네트워크·저장 없음).
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {JSDOM}=require('jsdom');
const F=require('../has/fundamental-filter.js');const Fear=require('../has/fear-top.js');const Screen=require('../has/universe-screen.js');
const NOW=Date.parse('2026-11-15T00:00:00Z');
function facts(years){const g={};function put(tag,end,val,flow){if(val==null)return;g[tag]=g[tag]||{units:{USD:[]}};const y=+end.slice(0,4);const e={end,val,form:'10-K',fp:'FY',fy:y,filed:(y+1)+'-02-15',accn:'0000000000-'+y};if(flow)e.start=y+'-01-01';g[tag].units.USD.push(e);}
  years.forEach((r,i)=>{const end=(2025-i)+'-12-31';put('Revenues',end,r.rev,1);put('OperatingIncomeLoss',end,r.op,1);put('NetIncomeLoss',end,r.ni,1);put('NetCashProvidedByUsedInOperatingActivities',end,r.ocf,1);put('PaymentsToAcquirePropertyPlantAndEquipment',end,r.capex,1);put('InterestExpense',end,r.int,1);put('StockholdersEquity',end,r.eq,0);put('CashAndCashEquivalentsAtCarryingValue',end,r.cash,0);put('LongTermDebt',end,r.debt,0);});
  return {cik:1,entityName:'Synthetic Co',facts:{'us-gaap':g}};}
const good=Array.from({length:5},()=>({rev:1000,op:250,ni:200,ocf:260,capex:60,int:10,eq:1000,cash:300,debt:400}));
const bad=[{rev:1000,op:20,ni:-50,ocf:-10,capex:80,int:30,eq:500,cash:50,debt:900},{rev:1100,op:150,ni:60,ocf:40,capex:90,int:28,eq:550,cash:60,debt:850},{rev:1150,op:200,ni:-5,ocf:30,capex:90,int:25,eq:560,cash:60,debt:800},{rev:1200,op:220,ni:100,ocf:120,capex:80,int:20,eq:600,cash:80,debt:700},{rev:1250,op:240,ni:120,ocf:150,capex:70,int:18,eq:650,cash:90,debt:650}];
const G=F.normalize(facts(good),{ticker:'SYNG'}),B=F.normalize(facts(bad),{ticker:'SYNB'});
const BANNED=/매수하세요|매도하세요|매수 추천|매도 추천|사세요|파세요|지금 매수/;
test('display: none/invalid/KR → 판단 보류 without label; valid → label text, evidence+counter lines, as-of',()=>{
  assert.equal(F.display(undefined,{now:NOW}).state,'none');assert.match(F.display(undefined,{now:NOW}).text,/미연결.*판단 보류/);
  for(const x of [{},[],'x',{ok:true,version:'other',financial:false,years:[]},Object.assign({},G,{years:[{end:'2025-13-01',filed:''}]}),Object.assign({},G,{years:G.years.slice().reverse()}),Object.assign({},G,{years:[Object.assign({},G.years[0],{netIncome:'200'})]})])
    assert.equal(F.display(x,{now:NOW}).state,'invalid');
  assert.equal(F.display(G,{now:NOW,market:'KR'}).state,'unsupported');
  const s=F.display(G,{now:NOW,market:'US'});assert.equal(s.state,'assessed');assert.equal(s.label,'strong');assert.match(s.text,/^재무: 우량 근거 충분 .* 판단 보류$/);assert.match(s.note,/매수 검토 아님/);
  assert.ok(s.lines.some(l=>/반론:/.test(l)));assert.ok(s.lines.some(l=>/2025-12-31.*2026-02-15.*SEC/.test(l)));
  const w=F.display(B,{now:NOW});assert.equal(w.label,'weak');assert.match(w.note,/곡소리로 보지 않음/);
  const we=F.display(B,{now:NOW,context:'euphoria'});assert.match(we.note,/탈출 신호 여부 점검.*순태씨/);
  const ifrs=F.display(F.normalize({cik:1,facts:{'ifrs-full':{}}}),{now:NOW});assert.equal(ifrs.label,'insufficient');assert.match(ifrs.text,/IFRS/);
  for(const d of [s,w,we,ifrs])assert.ok(d.signalHold===true&&d.opinion==='판단 보류'&&!BANNED.test(d.text+d.note+d.lines.join('')));
});
test('display: stale normalized data (now far later) → 공시 부족, never strong',()=>{
  assert.equal(F.display(G,{now:Date.parse('2027-12-01T00:00:00Z')}).label,'insufficient');
});
function summary(){const mk=(t,m,dd,fund)=>Object.assign({ticker:t,market:m,scope:'core',status:'reference',asOf:'2026-11-13T21:00:00Z',drawdownPct:dd,price:100,currency:m==='US'?'USD':'KRW',source:'synthetic',returns:{}},fund===undefined?{}:{fundamental:fund});
  return {generation:'synthetic-test',generatedAt:'2026-11-14T22:00:00Z',sources:[],items:[mk('SYNB','US',-50,B),mk('SYNG','US',-40,G),mk('000001','KR',-35),mk('NOFU','US',-30),mk('BADF','US',-25,{ok:true})]};}
test('fear-top: cards show 재무 label per row (strong/weak/KR/none/invalid), details carry evidence; opinion stays held',async()=>{
  const d=new JSDOM('<!doctype html><body><div id="b"></div></body>',{url:'https://example.test/'});global.document=d.window.document;global.window=d.window;
  const box=d.window.document.getElementById('b');
  const api=Fear.mount(box,{screen:{rank:Screen.rank,validateSummary:s=>s},now:()=>NOW,fundamental:F,endpoint:()=>'https://script.google.com/macros/s/x/exec',transport:async()=>summary()});
  await api.refresh();const cards=[...box.querySelectorAll('article')].map(a=>a.textContent);
  assert.equal(cards.length,5);
  assert.match(cards[0],/재무: 취약.*판단 보류/);assert.match(cards[0],/곡소리로 보지 않음/);
  assert.match(cards[1],/재무: 우량 근거 충분/);assert.match(cards[1],/반론:/);
  assert.match(cards[2],/국내·해외 기업 재무 확인 미연결/);assert.match(cards[3],/재무: 미연결/);assert.match(cards[4],/자료 형식 확인 필요/);
  assert.ok(!BANNED.test(box.textContent));assert.ok(!/AI 의견: 매수/.test(box.textContent));
});
test('fear-top: without fundamental module keeps old held line',async()=>{
  const d=new JSDOM('<!doctype html><body><div id="b"></div></body>',{url:'https://example.test/'});global.document=d.window.document;global.window=d.window;
  const box=d.window.document.getElementById('b');
  const api=Fear.mount(box,{screen:{rank:Screen.rank,validateSummary:s=>s},now:()=>NOW,endpoint:()=>'https://script.google.com/macros/s/x/exec',transport:async()=>summary()});
  await api.refresh();assert.match(box.textContent,/AI 의견: 판단 보류 · 기업 확인\(재무\) 전/);
});
test('euphoria panel: US holding gets 재무 label from record.fundamental, KR holding unsupported, no sell wording',async()=>{
  const src=fs.readFileSync(path.join(__dirname,'../has/live-price-panel.js'),'utf8'),fsrc=fs.readFileSync(path.join(__dirname,'../has/fundamental-filter.js'),'utf8');
  const dom=new JSDOM('<input id="usdKrw" value="1400"><div id="b"></div>',{url:'https://app.test',runScripts:'outside-only'}),w=dom.window;
  w.genStocks=[];w.domStocks=[{ticker:'005930',name:'삼성전자',quantity:1,currentPrice:1}];w.penStocks=[];w.ovStocks=[{ticker:'SYNB',name:'합성취약',quantity:1,currentPrice:100}];w.gasUrl='https://script.google.com/macros/s/test/exec';
  w.HASPortfolioReader={read(){return {complete:true,holdings:[{market:'US',ticker:'SYNB',weightPct:30},{market:'KR',ticker:'005930',weightPct:8}]};}};
  w.HASLivePriceReference={createService(){return {load:async()=>({items:[{ticker:'SYNB',market:'US',status:'ready',record:{},fundamental:B},{ticker:'005930',market:'KR',status:'ready',record:{}}]})};},analyze(){return {ok:true,source:'GAS',asOf:'2026-11-13',currency:'USD',drawdownPct:-2,returns:{}};}};
  w.eval(fsrc);w.eval(src);const box=w.document.querySelector('#b');w.HASLivePricePanel.mount(box,'euphoria');box.querySelector('button').click();await new Promise(r=>setImmediate(r));
  const cards=[...box.querySelectorAll('article')].map(a=>a.textContent);
  assert.match(cards[0],/재무: (취약|공시 부족)/);assert.match(cards[1],/국내·해외 기업 재무 확인 미연결/);assert.ok(!BANNED.test(box.textContent));
});
test('pins: fundamental-filter/fear-top/live-price-panel sha match, script order fear-top→fundamental-filter→radar/ui.js',()=>{
  const pins=require('./lib/live-data-pins.json');
  for(const f of ['has/fundamental-filter.js','has/fear-top.js','has/live-price-panel.js'])assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'..',f))).digest('hex'),pins.addedRuntimeFiles[f],f);
  const html=fs.readFileSync(path.join(__dirname,'../portfolio_v5.html'),'utf8');const i=html.indexOf('has/fundamental-filter.js');
  assert.ok(i>html.indexOf('has/fear-top.js')&&i<html.indexOf('radar/ui.js'));
});
