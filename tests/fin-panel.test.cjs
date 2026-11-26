'use strict';
// has/fin-panel.js + review-cards 연결 시험(JSDOM, 가짜 fetch). 판단 라벨을 바꾸지 않고 재무 근거만 붙이는지 확인.
const test=require('node:test'),a=require('node:assert/strict'),fs=require('fs'),path=require('path'),{JSDOM}=require('jsdom');
const R=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const tick=()=>new Promise(r=>setTimeout(r,0));
const NOW=Date.parse('2026-11-26T01:00:00Z');
const yrs=(n)=>Array.from({length:n},(_,i)=>{const y=2025-i;return {end:y+'-12-31',filed:(y+1)+'-02-10',revenue:1e9+i,operatingIncome:2e8,netIncome:1.5e8,ocf:1.8e8,capex:0.6e8,interest:1e6,equity:9e8,cash:3e8,debt:1e8,sources:{},conflicts:[]};});
const rec=(t,o)=>Object.assign({version:1,ticker:t,cik:'1',fetchedAt:'2026-11-26T00:00:00.000Z',source:'x',verification:'unverified',normalized:{ok:true,version:'has-fundamental-v1',financial:false,cik:'1',name:t,ticker:t,years:yrs(5)}},o||{});
const card=(t,v,m)=>({ticker:t,market:m||'US',name:t+' Co',verdict:v,headline:'h '+t,reasons:['r'],risks:['k'],sources:[{title:'s',url:'https://example.com/'}]});
function dom(files,cards,withFile){
  const d=new JSDOM('<!doctype html><body><section id="m"></section></body>',{url:'https://example.test/',runScripts:'outside-only'});const w=d.window;w.Date.now=()=>NOW;w.__fetched=[];
  const doc={v:1,reviewedAt:'2026-11-26T07:10:00+09:00',reviewer:'Claude',notice:'AI 검토 의견이며 투자 자문이 아닙니다.',cards};
  w.fetch=(u)=>{w.__fetched.push(u);const m=/data\/fundamentals\/([A-Z.\-]+)\.json/.exec(u);
    if(m){const f=files[m[1]];if(f==='ERR')return Promise.reject(Error('net'));if(f===undefined)return Promise.resolve({ok:false,status:404,json:async()=>({})});return Promise.resolve({ok:true,status:200,json:async()=>JSON.parse(JSON.stringify(f))});}
    return Promise.resolve({ok:/fear-us-latest|\/latest\.json$/.test(u),status:200,json:async()=>JSON.parse(JSON.stringify(doc))});};
  w.eval(R('has/fundamental-filter.js'));w.HASFundamentalFilter=w.HASFundamentalFilter;
  if(withFile!==false){w.eval(R('has/review-fin-gate.js'));w.eval(R('has/fin-panel.js'));}
  w.eval(R('has/review-cards.js'));return w;}
async function show(w){const m=w.document.getElementById('m');w.HASReviewCards.mount(m);for(let i=0;i<6;i++)await tick();return m;}
const art=(m,t)=>[...m.querySelectorAll('article')].find(x=>x.textContent.includes('('+t+')'));
test('매수 후보: 재무 판정·결산일·수집시각을 보여 주되 보류 라벨과 합의 표시는 그대로, 시세 미연결로 보류 유지',async()=>{
  const w=dom({AAA:rec('AAA')},[card('AAA','buy-review')]);const m=await show(w);const x=art(m,'AAA');
  a.match(x.textContent,/🧠 매수 후보 · 판단 보류\(재무·시세 검증 전\)/);a.doesNotMatch(x.textContent,/🟢/);
  const fp=x.querySelector('[data-testid=fin-panel]');a.ok(fp);a.match(fp.textContent,/📊 재무 확인\(SEC 공시 자동 수집 · 검증 전\)/);
  a.match(fp.querySelector('[data-testid=fin-meta]').textContent,/최근 결산 2025-12-31 · 수집/);
  const g=fp.querySelector('[data-testid=fin-gate]').textContent;a.match(g,/판단 보류 유지 — 남은 조건/);a.match(g,/시세 독립 대조 미연결/);a.match(g,/지피 합의 없음\(클로 단독\)/);a.doesNotMatch(g,/해제 조건 충족/);
  a.ok(w.__fetched.some(u=>/data\/fundamentals\/AAA\.json$/.test(u)));});
test('합의 agreed여도 시세 미연결이라 해제되지 않음(재무가 양호해도)',async()=>{
  const c=card('AAA','buy-review');c.consensus={status:'agreed',review:'GPT-REVIEW-ai-review-20261126-0730.md',date:'2026-11-26',ticker:'AAA',market:'US',verdict:'buy-review'};
  const w=dom({AAA:rec('AAA')},[c]);const m=await show(w);const g=art(m,'AAA').querySelector('[data-testid=fin-gate]').textContent;a.doesNotMatch(g,/해제 조건 충족/);a.doesNotMatch(g,/지피 합의 없음/);a.match(g,/시세 독립 대조 미연결/);a.match(art(m,'AAA').textContent,/판단 보류/);});
test('자료 없음(404)·읽기 실패·형식 불량: 매수 카드에만 안내, 판단 보류, 다른 카드엔 아무것도 안 붙임',async()=>{
  const bad=rec('CCC');bad.normalized.years[0].end='not-a-date';
  const w=dom({AAA:undefined,BBB:'ERR',CCC:bad,DDD:undefined},[card('AAA','buy-review'),card('BBB','buy-review'),card('CCC','add-review'),card('DDD','wait')]);const m=await show(w);
  a.match(art(m,'AAA').querySelector('[data-testid=fin-panel]').textContent,/자동 수집 대상 아님·자료 없음 · 판단 보류/);
  a.match(art(m,'BBB').querySelector('[data-testid=fin-panel]').textContent,/자료를 읽지 못함 또는 형식 불명 · 판단 보류/);
  a.match(art(m,'CCC').querySelector('[data-testid=fin-panel]').textContent,/형식 불명/);
  a.equal(art(m,'DDD').querySelector('[data-testid=fin-panel]'),null);});
test('재무 취약이면 취약으로 표시, 수집 4일 초과면 재무 없음으로 취급하고 경고',async()=>{
  const weak=rec('WWW');weak.normalized.years.forEach(y=>{y.netIncome=-1e8;y.operatingIncome=-1e8;y.ocf=-2e8;y.equity=-1e8;});
  const old=rec('OLD',{fetchedAt:'2026-11-20T00:00:00.000Z'});
  const w=dom({WWW:weak,OLD:old},[card('WWW','buy-review'),card('OLD','buy-review')]);const m=await show(w);
  a.match(art(m,'WWW').querySelector('[data-testid=fin-label]').textContent,/취약/);a.match(art(m,'WWW').querySelector('[data-testid=fin-gate]').textContent,/재무 취약|재무 자료 없음|우량 근거 충분.이 아님/);
  a.match(art(m,'OLD').querySelector('[data-testid=fin-meta]').textContent,/수집한 지 6일 지남/);a.match(art(m,'OLD').querySelector('[data-testid=fin-gate]').textContent,/재무 자료 없음·형식 불명/);});
test('국내 종목은 DART 연결 전 안내만(자료 요청 없음)',async()=>{
  const w=dom({},[card('267260','buy-review','KR'),card('000660','wait','KR')]);const m=await show(w);
  a.match(art(m,'267260').querySelector('[data-testid=fin-panel]').textContent,/국내\(DART\) 재무 연결 전 · 판단 보류/);a.equal(art(m,'000660').querySelector('[data-testid=fin-panel]'),null);
  a.ok(!w.__fetched.some(u=>/data\/fundamentals/.test(u)));});
test('재무 모듈이 없으면(로드 전) 기존 카드 표시는 그대로이고 모듈 로드를 한 번만 요청',async()=>{
  const w=dom({},[card('AAA','buy-review')],false);const m=await show(w);a.match(art(m,'AAA').textContent,/🧠 매수 후보 · 판단 보류/);
  const tags=[...w.document.head.querySelectorAll('script')].map(s=>s.getAttribute('src'));a.deepEqual(tags,['./has/review-fin-gate.js','./has/price-verify-us.js','./has/fin-panel.js']);
  w.HASReviewCards.mount(w.document.getElementById('m'));await tick();a.equal(w.document.head.querySelectorAll('script').length,3);});
test('티커별 자료는 한 번만 요청(다시 그려도 재요청 없음)·XSS 문자열은 글자로만 표시',async()=>{
  const r=rec('AAA');r.normalized.name='<img src=x onerror=alert(1)>';const w=dom({AAA:r},[card('AAA','buy-review')]);const m=await show(w);w.HASReviewCards.mount(m);await tick();w.HASReviewCards.mount(m);await tick();
  a.equal(w.__fetched.filter(u=>/AAA\.json$/.test(u)).length,1);a.equal(m.querySelectorAll('img').length,0);});
test('fin-panel은 쓰기·주문·저장소·키를 쓰지 않음',()=>{const s=R('has/fin-panel.js');for(const w of ['localStorage','sessionStorage','indexedDB','method:','POST','innerHTML','eval(','crtfc_key'])a.ok(!s.includes(w),w);a.ok(!/fetch\([^)]*https?:/.test(s));});
test('review-cards 변경은 연결 한 줄과 지연 로드 함수뿐(판단 라벨 코드 불변)',()=>{const s=R('has/review-cards.js');a.ok(s.includes("finHook(art, c, cs); box.appendChild(art);"));a.match(s,/var HELD = \{ 'buy-review': \['🧠 매수 후보 · 판단 보류\(재무·시세 검증 전\)', '#333'\], 'add-review': \['🧠 추가 매수 후보 · 판단 보류\(재무·시세 검증 전\)', '#333'\] \};/);});
// ---- 시세 독립 대조 연결 ----
const days=(from,to)=>{const out=[];for(let t=Date.parse(from+'T00:00:00Z');t<=Date.parse(to+'T00:00:00Z');t+=86400000){const d=new Date(t).toISOString().slice(0,10),wd=new Date(t).getUTCDay();if(wd&&wd<6)out.push(d);}return out;};
const ALL=days('2026-10-20','2026-11-25');
const ybars=(t)=>({source:'yahoo-chart-v8',symbol:t,currency:'USD',bars:ALL.map((d,i)=>({d,c:100+i}))}),kbars=(t,f)=>({source:'kis-overseas-daily',symbol:t,currency:'USD',bars:ALL.map((d,i)=>({d,c:f?f(i):100+i}))});
const mem=()=>{const m=new Map();return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>{m.set(k,String(v));}};};
function withPrice(files,cards,kisFactor,autoOn,calls){const w=dom(files,cards);w.eval(R('has/price-verify-us.js'));w.HASPriceVerifyUS._reset(autoOn?mem():null);
  // 가짜 GAS 주소와 JSONP: script 태그 대신 verify의 jsonp를 가로챈다(주입 지점: 모듈 내부 jsonp는 외부 접속이므로 시험에서는 사용하지 않음).
  const base=w.HASPriceVerifyUS;const opt={now:()=>NOW,jsonp:async(p)=>{if(calls)calls.push(p.type);const l=p.tickers.split(',');const o={};l.forEach(t=>o[t]=p.type==='history'?ybars(t):kbars(t,kisFactor));return o;}};w.HASPriceVerifyUS=Object.assign({},base,{verify:(ts)=>base.verify(ts,opt),auto:(ts)=>autoOn?base.auto(ts,opt):Promise.resolve({ok:false,reason:'off'})});return w;}
test('시세 대조 전: 버튼·안내만, 대조 후 일치하면 재무 strong+합의 agreed에서 해제 조건 충족 문구(라벨은 그대로 판단 보류)',async()=>{
  const c=card('AAA','buy-review');c.consensus={status:'agreed',review:'GPT-REVIEW-ai-review-20261126-0730.md',date:'2026-11-26',ticker:'AAA',market:'US',verdict:'buy-review'};
  const w=withPrice({AAA:rec('AAA')},[c]);const m=await show(w);let x=art(m,'AAA');
  a.match(x.querySelector('[data-testid=fin-price]').textContent,/조회 전\(하루 1회 자동 조회/);a.match(x.querySelector('[data-testid=fin-gate]').textContent,/시세 독립 대조 미연결/);
  x.querySelector('[data-testid=fin-price-btn]').click();for(let i=0;i<10;i++)await tick();x=art(m,'AAA');
  a.match(x.querySelector('[data-testid=fin-price]').textContent,/✅ 두 출처\(Yahoo·KIS\) 확정 종가 일치 · 확정 종가 기준일 2026-11-25/);
  const g=x.querySelector('[data-testid=fin-gate]').textContent;a.match(g,/보류 해제 조건은 모두 충족/);a.match(g,/카드 라벨 변경은 순태씨 승인 후 별도/);
  a.match(x.textContent,/🧠 매수 후보 · 판단 보류\(재무·시세 검증 전\)/);a.doesNotMatch(x.textContent,/🟢/);});
test('시세가 불일치하면 해제 안 됨, 합의가 없으면 시세가 일치해도 해제 안 됨',async()=>{
  const w=withPrice({AAA:rec('AAA')},[card('AAA','buy-review')],(i)=>(100+i)*1.2);const m=await show(w);art(m,'AAA').querySelector('[data-testid=fin-price-btn]').click();for(let i=0;i<10;i++)await tick();let x=art(m,'AAA');
  a.match(x.querySelector('[data-testid=fin-price]').textContent,/❗ 최근 종가 차이/);a.match(x.querySelector('[data-testid=fin-gate]').textContent,/판단 보류 유지/);
  const w2=withPrice({AAA:rec('AAA')},[card('AAA','buy-review')]);const m2=await show(w2);art(m2,'AAA').querySelector('[data-testid=fin-price-btn]').click();for(let i=0;i<10;i++)await tick();
  const g=art(m2,'AAA').querySelector('[data-testid=fin-gate]').textContent;a.doesNotMatch(g,/모두 충족/);a.match(g,/지피 합의 없음/);a.doesNotMatch(g,/시세 독립 대조 미연결/);});
test('버튼은 화면의 매수 쪽 미국 카드 티커를 한꺼번에(최대 5) 대조하고 버튼 전에는 verify 호출 없음',async()=>{
  const w=dom({AAA:rec('AAA'),BBB:rec('BBB')},[card('AAA','buy-review'),card('BBB','add-review'),card('CCC','wait')]);w.eval(R('has/price-verify-us.js'));w.HASPriceVerifyUS._reset();let seen=null,calls=0;const base=w.HASPriceVerifyUS;w.HASPriceVerifyUS=Object.assign({},base,{auto:()=>Promise.resolve({ok:false}),verify:(ts)=>{calls++;seen=ts;return Promise.resolve({ok:true});}});
  const m=await show(w);a.equal(calls,0);art(m,'AAA').querySelector('[data-testid=fin-price-btn]').click();await tick();a.equal(calls,1);a.deepEqual([...seen],['AAA','BBB']);});
test('가격 대조 모듈이 없어도 재무 블록은 그대로(시세 미연결 취급)',async()=>{const w=dom({AAA:rec('AAA')},[card('AAA','buy-review')]);const m=await show(w);const x=art(m,'AAA');a.equal(x.querySelector('[data-testid=fin-price]'),null);a.match(x.querySelector('[data-testid=fin-gate]').textContent,/시세 독립 대조 미연결/);});

test('자동 조회: 버튼 없이 하루 1회 Yahoo 1번+KIS 1번 호출 후 결과가 카드에 나타나고, 다시 열어도 호출이 늘지 않음',async()=>{
  const c=card('AAA','buy-review');c.consensus={status:'agreed',review:'GPT-REVIEW-ai-review-20261126-0730.md',date:'2026-11-26',ticker:'AAA',market:'US',verdict:'buy-review'};
  const calls=[];const w=withPrice({AAA:rec('AAA')},[c],undefined,true,calls);const m=await show(w);for(let i=0;i<15;i++)await new Promise(r=>setTimeout(r,10));
  a.deepEqual(calls,['history','kis-us']);const x=art(m,'AAA');a.match(x.querySelector('[data-testid=fin-price]').textContent,/✅ 두 출처\(Yahoo·KIS\) 확정 종가 일치/);a.match(x.querySelector('[data-testid=fin-gate]').textContent,/모두 충족/);a.match(x.textContent,/🧠 매수 후보 · 판단 보류\(재무·시세 검증 전\)/);
  w.HASReviewCards.mount(m);for(let i=0;i<15;i++)await new Promise(r=>setTimeout(r,10));a.equal(calls.length,2);});
