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
function plain(x){return !!x&&typeof x==='object'&&!Array.isArray(x);}
const BANNED=/매수하세요|매도하세요|매수 추천|매도 추천|사세요|파세요|지금 매수/;
test('display: none/invalid/KR → 판단 보류 without label; valid → label text, evidence+counter lines, as-of',()=>{
  assert.equal(F.display(undefined,{now:NOW,ticker:'SYNG'}).state,'none');assert.match(F.display(undefined,{now:NOW,ticker:'SYNG'}).text,/미연결.*판단 보류/);
  for(const x of [{},[],'x',{ok:true,version:'other',financial:false,years:[]},Object.assign({},G,{years:[{end:'2025-13-01',filed:''}]}),Object.assign({},G,{years:G.years.slice().reverse()}),Object.assign({},G,{years:[Object.assign({},G.years[0],{netIncome:'200'})]})])
    assert.equal(F.display(plain(x)?Object.assign({ticker:'SYNG'},x):x,{now:NOW,ticker:'SYNG'}).state,'invalid');
  assert.equal(F.display(G,{now:NOW,market:'KR',ticker:'SYNG'}).state,'unsupported');
  const s=F.display(G,{now:NOW,market:'US',ticker:'SYNG'});assert.equal(s.state,'assessed');assert.equal(s.label,'strong');assert.match(s.text,/^재무: 우량 근거 충분 .* 판단 보류$/);assert.match(s.note,/매수 검토 아님/);
  assert.ok(s.lines.some(l=>/반론:/.test(l)));assert.ok(s.lines.some(l=>/2025-12-31.*2026-02-15.*SEC/.test(l)));
  const w=F.display(B,{now:NOW,ticker:'SYNB'});assert.equal(w.label,'weak');assert.match(w.note,/곡소리로 보지 않음/);
  const we=F.display(B,{now:NOW,context:'euphoria',ticker:'SYNB'});assert.match(we.note,/탈출 신호 여부 점검.*순태씨/);
  const ifrs=F.display(F.normalize({cik:1,facts:{'ifrs-full':{}}},{ticker:'SYNI'}),{now:NOW,ticker:'SYNI'});assert.equal(ifrs.label,'insufficient');assert.match(ifrs.text,/IFRS/);
  for(const d of [s,w,we,ifrs])assert.ok(d.signalHold===true&&d.opinion==='판단 보류'&&!BANNED.test(d.text+d.note+d.lines.join('')));
});
test('display: stale normalized data (now far later) → 공시 부족, never strong',()=>{
  assert.equal(F.display(G,{now:Date.parse('2027-12-01T00:00:00Z'),ticker:'SYNG'}).label,'insufficient');
});
function summary(){const mk=(t,m,dd,fund)=>Object.assign({ticker:t,market:m,scope:'core',status:'reference',asOf:'2026-11-13T21:00:00Z',drawdownPct:dd,price:100,currency:m==='US'?'USD':'KRW',source:'synthetic',returns:{}},fund===undefined?{}:{fundamental:fund});
  return {generation:'synthetic-test',generatedAt:'2026-11-14T22:00:00Z',sources:[],items:[mk('SYNB','US',-50,B),mk('SYNG','US',-40,G),mk('000001','KR',-35),mk('NOFU','US',-30),mk('BADF','US',-25,{ok:true,ticker:'BADF'}),mk('XTKR','US',-22,G)]};}
test('fear-top: cards show 재무 label per row (strong/weak/KR/none/invalid), details carry evidence; opinion stays held',async()=>{
  const d=new JSDOM('<!doctype html><body><div id="b"></div></body>',{url:'https://example.test/'});global.document=d.window.document;global.window=d.window;
  const box=d.window.document.getElementById('b');
  const api=Fear.mount(box,{screen:{rank:Screen.rank,validateSummary:s=>s},now:()=>NOW,fundamental:F,endpoint:()=>'https://script.google.com/macros/s/x/exec',transport:async()=>summary()});
  await api.refresh();const cards=[...box.querySelectorAll('article')].map(a=>a.textContent);
  assert.equal(cards.length,6);
  assert.match(cards[0],/재무: 취약.*판단 보류/);assert.match(cards[0],/곡소리로 보지 않음/);
  assert.match(cards[1],/재무: 우량 근거 충분/);assert.match(cards[1],/반론:/);
  assert.match(cards[2],/국내·해외 기업 재무 확인 미연결/);assert.match(cards[3],/재무: 미연결/);assert.match(cards[4],/자료 형식 확인 필요/);assert.match(cards[5],/종목 불일치\(SYNG ≠ XTKR\)/);assert.ok(!/우량 근거 충분/.test(cards[5]));
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
// 지피 1430 검토 반영: 종목 정합성·날짜 충돌·실제 수집→캐시→스냅샷→카드 전 구간(합성 GAS 응답, 네트워크 없음).
test('display: cross-ticker / missing expected ticker / ifrs without ticker → 판단 보류 without label',()=>{
  const x=F.display(G,{now:NOW,market:'US',ticker:'SYNB'});assert.equal(x.state,'mismatch');assert.equal(x.label,null);assert.match(x.text,/종목 불일치\(SYNG ≠ SYNB\).*판단 보류/);
  assert.equal(F.display(G,{now:NOW,market:'US'}).state,'mismatch');assert.match(F.display(G,{now:NOW}).text,/대상 종목 미지정/);
  assert.equal(F.display(Object.assign({},G,{ticker:null}),{now:NOW,ticker:'SYNG'}).state,'mismatch');
  assert.equal(F.display(F.normalize({cik:1,facts:{'ifrs-full':{}}}),{now:NOW,ticker:'SYNI'}).state,'mismatch');
  assert.equal(F.display(undefined,{now:NOW}).state,'none');
  const ok=F.display(G,{now:NOW,ticker:'SYNG'});assert.ok(ok.lines.some(l=>/SYNG SEC 공시.*원본 독립 대조 미실시/.test(l)));
});
test('display: filed before fiscal end, future filed, future fiscal end → 판단 보류',()=>{
  const y0=G.years[0];
  for(const r of [{filed:'2025-12-30'},{filed:'2026-11-16'},{end:'2026-12-31',filed:''}])
    {const d=F.display(Object.assign({},G,{years:[Object.assign({},y0,r)].concat(G.years.slice(1))}),{now:NOW,ticker:'SYNG'});assert.equal(d.state,'invalid');assert.match(d.text,/결산일·공시일 충돌/);}
  assert.equal(F.display(Object.assign({},G,{years:[Object.assign({},y0,{filed:''})].concat(G.years.slice(1))}),{now:NOW,ticker:'SYNG'}).state,'assessed');
});
function liveFacts(){const n=new Date(),y=n.getUTCFullYear()-(n.getUTCMonth()>=2?1:2);const f=facts(good);
  // facts()는 2025 기준 → 실행 시점 기준 연도로 옮겨 날짜 충돌·노후화 없이 시험
  const d=y-2025;for(const t of Object.values(f.facts['us-gaap']))for(const e of t.units.USD){const fy=e.fy+d;e.end=fy+e.end.slice(4);e.fy=fy;e.filed=(fy+1)+e.filed.slice(4);if(e.start)e.start=fy+e.start.slice(4);}return f;}
test('euphoria end-to-end: real HASLivePriceReference collect→cache→snapshot→card keeps fundamental; mismatch/none/missing/stale paths; holdings untouched',async()=>{
  const LG=F.normalize(liveFacts(),{ticker:'SYNG'}),LO=F.normalize(liveFacts(),{ticker:'OLDG'});assert.equal(LG.ok,true);
  const dom=new JSDOM('<input id="usdKrw" value="1400"><div id="b"></div>',{url:'https://app.test',runScripts:'outside-only'}),w=dom.window;
  const held=[['SYNG','합성우량'],['XTKR','합성불일치'],['NOFU','재무없음'],['MISS','가격없음'],['OLDG','지난자료']].map(([t,n])=>({ticker:t,name:n,quantity:1,currentPrice:100}));
  w.genStocks=[];w.domStocks=[];w.penStocks=[];w.ovStocks=held;w.gasUrl='https://script.google.com/macros/s/test/exec';const before=JSON.stringify(held);
  w.eval(fs.readFileSync(path.join(__dirname,'../has/fundamental-filter.js'),'utf8'));w.eval(fs.readFileSync(path.join(__dirname,'../has/live-price-reference.js'),'utf8'));w.eval(fs.readFileSync(path.join(__dirname,'../has/live-price-panel.js'),'utf8'));
  const box=w.document.querySelector('#b');w.HASLivePricePanel.mount(box,'euphoria');box.querySelector('button').click();await new Promise(r=>setImmediate(r));
  const now=Date.now(),mkBars=off=>Array.from({length:210},(_,i)=>({d:new Date(now-(210-i+off)*86400000).toISOString().slice(0,10),c:100+i/10}));
  const fund={SYNG:LG,XTKR:LG,OLDG:LO};
  for(const script of Array.from(w.document.querySelectorAll('script'))){const u=new URL(script.src),market=u.searchParams.get('market'),response={};
    for(const ticker of u.searchParams.get('tickers').split(',')){if(ticker==='MISS')continue;const bars=mkBars(ticker==='OLDG'?20:0);
      response[ticker]=Object.assign({source:'yahoo-chart-v8',currency:market==='US'?'USD':'KRW',timezone:market==='US'?'America/New_York':'Asia/Seoul',exchange:market==='US'?'NMS':'KSE',instrumentType:'EQUITY',adjustment:'unverified',symbol:market==='US'?ticker:ticker+'.KS',bars,barCount:bars.length,fiftyTwoWeekHigh:150},fund[ticker]?{fundamental:fund[ticker]}:{});}
    w[u.searchParams.get('callback')](w.JSON.parse(JSON.stringify(response)));}
  await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));
  const card=t=>[...box.querySelectorAll('article')].find(a=>a.querySelector('h4').textContent.includes('('+t+')')).textContent;
  assert.match(card('SYNG'),/재무: 우량 근거 충분.*판단 보류/);assert.match(card('SYNG'),/SYNG SEC 공시.*원본 독립 대조 미실시/);
  assert.match(card('XTKR'),/종목 불일치\(SYNG ≠ XTKR\)/);assert.ok(!/우량 근거 충분/.test(card('XTKR')));
  assert.match(card('NOFU'),/재무: 미연결.*판단 보류/);
  assert.match(card('MISS'),/가격 근거 없음 · 판단 보류/);assert.ok(!/재무:/.test(card('MISS')));
  assert.match(card('OLDG'),/지난 성공 자료/);assert.match(card('OLDG'),/재무: 우량 근거 충분.*판단 보류/);
  assert.equal(JSON.stringify(w.ovStocks),before);assert.equal(w.localStorage.length,0);assert.ok(!BANNED.test(box.textContent));dom.window.close();
});
test('reference service: cache entry carries cloned fundamental, null when absent or non-plain',async()=>{
  const R=require('../has/live-price-reference.js');const now=Date.now(),bars=Array.from({length:30},(_,i)=>({d:new Date(now-(32-i)*86400000).toISOString().slice(0,10),c:100}));
  const raw=t=>({source:'yahoo-chart-v8',currency:'USD',timezone:'America/New_York',exchange:'NMS',instrumentType:'EQUITY',adjustment:'unverified',symbol:t,bars,barCount:bars.length});
  const resp={AAA:Object.assign(raw('AAA'),{fundamental:G}),BBB:raw('BBB'),CCC:Object.assign(raw('CCC'),{fundamental:[1]})};
  const s=R.createService({endpoint:'https://script.google.com/macros/s/x/exec',transport:async()=>JSON.parse(JSON.stringify(resp)),now:()=>now});
  const r=await s.load([{ticker:'AAA',market:'US'},{ticker:'BBB',market:'US'},{ticker:'CCC',market:'US'}]);const by=t=>r.items.find(x=>x.ticker===t);
  assert.deepEqual(by('AAA').fundamental,G);assert.equal(by('BBB').fundamental,null);assert.equal(by('CCC').fundamental,null);
  by('AAA').fundamental.ticker='ZZZ';assert.equal(s.peek([{ticker:'AAA',market:'US'}])[0].fundamental.ticker,'SYNG');
});
