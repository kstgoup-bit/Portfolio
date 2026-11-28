'use strict';
// 원화 환산 알파(순태씨 2026-11-28 '1번으로 하자'): 환율 수집 도구(가짜 fetch·임시 폴더), 환율 검증 모듈, 앱 지수 비교 연결(JSDOM, 외부 요청 없음).
const test=require('node:test'),a=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const ROOT=path.join(__dirname,'..'),X=require('../has/fx-history.js'),T=require('../tools/fetch-usdkrw.cjs');
const P=require('../has/snapshot-policy.js'),R=require('../has/return-assessment.js');
const NOW=Date.parse('2026-11-28T01:00:00Z'),DAY=86400000;
const near=(v,w,e)=>a.ok(Math.abs(v-w)<(e||1e-9),v+' != '+w);
const days=(from,n)=>Array.from({length:n},(_,i)=>new Date(Date.parse(from+'T00:00:00Z')+i*DAY).toISOString().slice(0,10));
function doc(points,extra){return Object.assign({version:1,pair:'USDKRW',unit:'KRW per 1 USD',fetchedAt:'2026-11-28T00:00:00.000Z',sources:{},tolerance:0.01,verification:'unverified',points},extra||{});}
const pts=(list)=>list.map(([d,v,check])=>({d,v,check:check||'ok'}));

// ── 수집 도구
function yahooBody(dates,vals,meta){return JSON.stringify({chart:{result:[{meta:Object.assign({symbol:'KRW=X',currency:'KRW'},meta||{}),timestamp:dates.map(d=>Date.parse(d+'T00:00:00Z')/1000),indicators:{quote:[{close:vals}]}}],error:null}});}
function fredBody(dates,vals){return 'observation_date,DEXKOUS\n'+dates.map((d,i)=>d+','+(vals[i]==null?'.':vals[i])).join('\n')+'\n';}
function fake(o){const calls=[];return {calls,fetchFn:async(url,opt)=>{calls.push({url,opt});const k=/yahoo/.test(url)?'y':/fred/.test(url)?'f':'x';const r=o[k];
  if(r instanceof Error)throw r;if(typeof r==='number')return {status:r,text:async()=>'<html>'};return {status:200,text:async()=>r};}};}
const tmpFile=()=>path.join(fs.mkdtempSync(path.join(os.tmpdir(),'fx-')),'fx','usdkrw.json');
const D=days('2025-11-01',395).filter(d=>d<='2026-11-27');

test('수집: 두 출처 날짜 대조 — 1% 이내 ok, 넘으면 conflict, 연준 없는 최근 날짜 unchecked, 야후 없는 날짜 fred',async()=>{
  const fd=D.filter(d=>d<='2026-11-20'),yv=D.map(()=>1400),fv=fd.map((d)=>d==='2026-11-02'?1500:d==='2025-11-01'?null:1395);
  const {fetchFn,calls}=fake({y:yahooBody(D.filter(d=>d!=='2026-11-03'),D.filter(d=>d!=='2026-11-03').map(()=>1400)),f:fredBody(fd,fv)}),out=tmpFile();
  const r=await T.run({fetchFn,outFile:out,now:new Date(NOW)});a.equal(r.ok,true);const j=JSON.parse(fs.readFileSync(out,'utf8'));
  const by=Object.fromEntries(j.points.map(p=>[p.d,p]));a.equal(by['2026-11-20'].check,'ok');a.equal(by['2026-11-02'].check,'conflict');a.equal(by['2026-11-27'].check,'unchecked');
  a.equal(by['2026-11-03'].check,'fred');a.equal(by['2026-11-03'].v,1395);a.equal(by['2025-11-01'].check,'unchecked');
  a.equal(j.pair,'USDKRW');a.equal(j.unit,'KRW per 1 USD');a.equal(j.sources.fred.latest,'2026-11-20');a.ok(X.parse(j,NOW).ok,'앱 검증 통과');
  a.ok(calls.every(c=>/^https:\/\/(query1\.finance\.yahoo\.com|fred\.stlouisfed\.org)\//.test(c.url)));a.equal(calls.length,2);
  a.ok(!JSON.stringify(calls).match(/api_key|token|secret/i),'키 없음');});
test('수집: 야후 차단(429)이면 연준 값만으로 저장, 둘 다 실패면 아무것도 쓰지 않고 이전 파일 유지',async()=>{
  const fd=D.filter(d=>d<='2026-11-20'),out=tmpFile();
  const r1=await T.run({fetchFn:fake({y:429,f:fredBody(fd,fd.map(()=>1390))}).fetchFn,outFile:out,now:new Date(NOW)});a.equal(r1.ok,true);
  const j=JSON.parse(fs.readFileSync(out,'utf8'));a.ok(j.points.every(p=>p.check==='fred'));a.equal(j.sources.yahoo.status,'http-429');
  const before=fs.readFileSync(out,'utf8');const r2=await T.run({fetchFn:fake({y:Error('net'),f:500}).fetchFn,outFile:out,now:new Date(NOW+DAY)});
  a.equal(r2.ok,false);a.equal(fs.readFileSync(out,'utf8'),before);});
test('수집: 형식 이상(다른 종목·단위, 헤더 다름)·값 범위 밖·점 부족·충돌 5% 초과는 저장 안 함',async()=>{
  a.throws(()=>T.parseYahoo(yahooBody(['2026-11-20'],[1400],{symbol:'JPY=X'})));a.throws(()=>T.parseYahoo(yahooBody(['2026-11-20'],[1400],{currency:'JPY'})));
  a.throws(()=>T.parseFred('DATE,DEXJPUS\n2026-11-20,150\n'));
  a.deepEqual(T.parseYahoo(yahooBody(['2026-11-19','2026-11-20'],[14.0,null])),{});
  a.deepEqual(T.parseFred(fredBody(['2026-11-19','2026-11-20','2026-13-01'],[99999,'abc',1400])),{});
  const out=tmpFile();a.equal((await T.run({fetchFn:fake({y:yahooBody(D.slice(0,50),D.slice(0,50).map(()=>1400)),f:404}).fetchFn,outFile:out,now:new Date(NOW)})).reason,'too-few-points');
  const fd=D.filter(d=>d<='2026-11-20');a.equal((await T.run({fetchFn:fake({y:yahooBody(D,D.map(()=>1400)),f:fredBody(fd,fd.map((d,i)=>i%10===0?1500:1400))}).fetchFn,outFile:out,now:new Date(NOW)})).reason,'too-many-conflicts');
  a.equal(fs.existsSync(out),false);});
test('수집 워크플로: data/fx만 커밋, 비밀값·키 없음, 실패 시 커밋 없음',()=>{
  const y=fs.readFileSync(path.join(ROOT,'.github/workflows/fx-usdkrw.yml'),'utf8');a.match(y,/node tools\/fetch-usdkrw\.cjs/);a.match(y,/git add data\/fx\n/);
  a.doesNotMatch(y,/secrets\./);a.doesNotMatch(y,/git add (-A|\.)/);const t=fs.readFileSync(path.join(ROOT,'tools/fetch-usdkrw.cjs'),'utf8');a.doesNotMatch(t,/process\.env\./);});

// ── 검증 모듈
test('환율 검증: 형식·단위·날짜·순서·범위·미래 수집이 하나라도 이상하면 전체 보류',()=>{
  const good=doc(pts([['2026-11-20',1340],['2026-11-21',1342]]));a.equal(X.parse(good,NOW).ok,true);
  const bad=[null,[],doc([]),doc(pts([['2026-11-21',1340],['2026-11-20',1342]])),doc(pts([['2026-11-20',1340],['2026-11-20',1342]])),doc(pts([['2026-13-01',1340]])),
    doc(pts([['2026-11-20',13.4]])),doc(pts([['2026-11-20',1340,'maybe']])),doc(pts([['2026-11-29',1340]])),doc(pts([['2026-11-20',1340]]),{pair:'USDJPY'}),doc(pts([['2026-11-20',1340]]),{unit:'USD per KRW'}),
    doc(pts([['2026-11-20',1340]]),{version:2}),doc(pts([['2026-11-20',1340]]),{fetchedAt:'2026-11-28T01:05:01.000Z'}),doc(pts([['2026-11-20',1340]]),{fetchedAt:'2026-11-28'}),doc(pts([['2026-11-20',NaN]])),doc(pts([['2026-11-20',1340]]),{points:'x'})];
  bad.forEach((d,i)=>a.equal(X.parse(d,NOW).ok,false,'bad '+i));for(const n of [NaN,null,'1'])a.equal(X.parse(good,n).ok,false);});
test('환율 조회: 관측일 당일 또는 이전 4일 안, 충돌 날짜는 건너뛰고 그 앞 날짜 사용, 더 멀면 보류',()=>{
  const p=X.parse(doc(pts([['2026-11-13',1330],['2026-11-18',1332,'unchecked'],['2026-11-19',1500,'conflict'],['2026-11-20',1340,'fred']])),NOW);
  a.deepEqual(X.at(p,'2026-11-20'),{ok:true,d:'2026-11-20',v:1340,check:'fred'});a.equal(X.at(p,'2026-11-19').d,'2026-11-18');a.equal(X.at(p,'2026-11-22').d,'2026-11-20');
  a.equal(X.at(p,'2026-11-24').d,'2026-11-20');a.equal(X.at(p,'2026-11-25').reason,'fx-date-missing');a.equal(X.at(p,'2026-11-17').d,'2026-11-13','4일 경계 포함');a.equal(X.at(p,'2026-11-12').reason,'fx-date-missing');
  const c=X.parse(doc(pts([['2026-11-19',1500,'conflict']])),NOW);a.equal(X.at(c,'2026-11-20').reason,'fx-source-conflict');a.equal(X.at(p,'2026-02-30').ok,false);});
test('원화 환산: (1+달러 수익률)×(끝 환율/시작 환율)−1 — 달러 +10%, 환율 +10% → 원화 +21%; 환율 하락이면 줄어듦',()=>{
  const p=X.parse(doc(pts([['2026-11-02',1300],['2026-11-20',1430,'unchecked'],['2026-11-21',1170]])),NOW);
  const r=X.toKrwReturn(p,10,'2026-11-02','2026-11-20');a.equal(r.ok,true);near(r.valuePct,21);a.equal(r.unchecked,true);
  near(X.toKrwReturn(p,10,'2026-11-02','2026-11-21').valuePct,-1);a.equal(X.toKrwReturn(p,10,'2026-11-02','2026-11-21').unchecked,false);
  a.equal(X.toKrwReturn(p,NaN,'2026-11-02','2026-11-20').ok,false);a.equal(X.toKrwReturn(p,10,'2026-10-01','2026-11-20').reason,'fx-date-missing');});

// ── 앱 연결(portfolio_v5.html 인라인 스크립트, 외부 요청 없음)
function app(fxDoc){
  const {JSDOM}=require('jsdom');const html=fs.readFileSync(path.join(ROOT,'portfolio_v5.html'),'utf8');
  const dom=new JSDOM(html,{runScripts:'outside-only',url:'https://offline.invalid/'}),w=dom.window,net=[],timers=[];
  const mem=()=>{const m=new Map();return {get length(){return m.size;},key:i=>[...m.keys()][i]??null,getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};};
  Object.defineProperty(w,'localStorage',{value:mem()});Object.defineProperty(w,'sessionStorage',{value:mem()});
  class FixedDate extends Date{constructor(...x){super(...(x.length?x:[NOW]));}static now(){return NOW;}}w.Date=FixedDate;
  for(const n of ['XMLHttpRequest','WebSocket','EventSource','open'])w[n]=()=>{net.push(n);throw Error('external '+n);};
  w.fetch=(u)=>{net.push(String(u));if(!/^\.\/data\/fx\/usdkrw\.json$/.test(String(u)))throw Error('external '+u);return fxDoc===undefined?Promise.resolve({ok:false,status:404,json:async()=>({})}):Promise.resolve({ok:true,status:200,json:async()=>JSON.parse(JSON.stringify(fxDoc))});};
  w.setTimeout=(f,ms)=>{timers.push({f,ms});return timers.length;};w.clearTimeout=()=>{};w.setInterval=w.requestAnimationFrame=()=>1;w.clearInterval=()=>{};w.alert=w.confirm=()=>true;
  const noop=()=>{},ctx=new Proxy({},{get:()=>noop,set:()=>true});w.HTMLCanvasElement.prototype.getContext=()=>ctx;w.HTMLElement.prototype.scrollIntoView=noop;
  w.addEventListener=noop;const listen=w.document.addEventListener.bind(w.document);w.document.addEventListener=(n,f,o)=>{if(n!=='DOMContentLoaded')listen(n,f,o);};
  for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(!/\bsrc\s*=/.test(m[1])&&m[2].trim())w.eval(m[2]);
  for(const f of ['has/fx-history.js','has/return-assessment.js'])w.eval(fs.readFileSync(path.join(ROOT,f),'utf8'));
  let renders=0;w.renderAllReturnsTables=()=>{renders++;};
  // 지수 이력은 고정 가짜(선택 규칙 자체는 benchmark-history-policy 시험이 담당): KS200 100→105(+5%), QQQ 100→110(+10% 달러)
  const close={KS200:{'2026-11-02':100,'2026-11-20':105},QQQ:{'2026-11-02':100,'2026-11-20':110}};
  w.HASBenchmarkHistory={selectPointAtOrBefore:(h,id,ts)=>{const d=new Date(ts).toISOString().slice(0,10)<'2026-11-10'?'2026-11-02':'2026-11-20';return {ok:true,date:d,point:{close:close[id][d]}};}};
  w.eval('_benchState={ok:true,series:{}};');
  return {w,net,timers,renders:()=>renders,close:()=>dom.window.close()};}
const tick=async()=>{for(let i=0;i<20;i++)await new Promise(r=>setImmediate(r));};
const FROM=Date.parse('2026-11-02T06:00:00Z'),TO=Date.parse('2026-11-20T06:00:00Z');
const FX=doc(pts([['2026-11-02',1300],['2026-11-20',1430,'unchecked']]));
test('앱: 환율 자료 받기 전에는 이전과 같음(전체=혼합, 해외=USD, 알파 보류), 받은 뒤 수익률 표만 다시 그림',async()=>{
  const h=app(FX);try{
    const b0=h.w.benchmarkAssessmentForInterval('all',FROM,TO);a.equal(b0.currency,'mixed');near(b0.valuePct,5*0.2+10*0.8);a.ok(b0.warnings.includes('fx-history-unavailable'));
    a.deepEqual(h.net,['./data/fx/usdkrw.json']);await tick();a.equal(h.renders(),1,'받은 뒤 다시 그림');
    const b1=h.w.benchmarkAssessmentForInterval('all',FROM,TO);a.equal(b1.currency,'KRW');near(b1.valuePct,5*0.2+21*0.8);a.equal(b1.status,'unverified');
    a.ok(b1.warnings.includes('benchmark-fx-converted')&&b1.warnings.includes('fx-official-unchecked'));a.match(b1.detail,/환율 2026-11-02 1300원 → 2026-11-20 1430원/);
    for(const k of ['ov','pen']){const b=h.w.benchmarkAssessmentForInterval(k,FROM,TO);a.equal(b.currency,'KRW');near(b.valuePct,21);}
    for(const k of ['dom','gen']){const b=h.w.benchmarkAssessmentForInterval(k,FROM,TO);a.equal(b.currency,'KRW');near(b.valuePct,5);a.ok(!b.warnings.includes('benchmark-fx-converted'));}
    a.equal(h.net.length,1,'6시간 안 재요청 없음');
  }finally{h.close();}});
test('앱: 원화 환산 지수로 알파 계산(입출금 반영 수익률 − 원화 환산 지수), 환율 없으면 이전처럼 알파 보류',async()=>{
  const snap=(ts,price)=>{const r=P.evaluate({key:'gen',now:ts,accounts:{gen:[{id:1,ticker:'SYN',quantity:10,currentPrice:price,avgPrice:80}]},freshPrice:{'KR:SYN':true},quoteMeta:{'KR:SYN':ts-1,FX:ts-1},quoteValues:{'KR:SYN':price,FX:1400},fx:1400});a.equal(r.ok,true);return r.snapshot;};
  const s0=snap(FROM,100),s1=snap(TO,130);
  const run=async(fxDoc)=>{const h=app(fxDoc);try{h.w.benchmarkAssessmentForInterval('all',FROM,TO);await tick();const b=h.w.benchmarkAssessmentForInterval('all',s0.ts,s1.ts);delete b.detail;
    return R.assess({key:'gen',records:[s0],targetTs:s0.ts,endTs:s1.ts,currentCandidate:s1,flows:[],benchmark:b});}finally{h.close();}};
  const r=await run(FX);a.equal(r.dietz.valuePct!=null,true);near(r.alpha.valuePct,r.dietz.valuePct-(5*0.2+21*0.8),1e-9);a.equal(r.alpha.status,'unverified');a.ok(!r.alpha.reasons.includes('benchmark-currency-mismatch'));
  const none=await run(undefined);a.equal(none.alpha.status,'hold');a.ok(none.alpha.reasons.includes('benchmark-currency-mismatch'));
  const bad=await run(doc(pts([['2026-11-20',1430]]),{pair:'EURKRW'}));a.equal(bad.alpha.status,'hold','형식 이상 문서는 쓰지 않음');
  const conflict=await run(doc(pts([['2026-11-02',1300],['2026-11-20',1600,'conflict']])));a.equal(conflict.alpha.status,'hold');});
test('앱: 화면 문구 — 환율 연결 시 "원화 환산" 표시, 보류 사유 한국어, 안내 문구에 출처·대조 기준',()=>{
  const html=fs.readFileSync(path.join(ROOT,'portfolio_v5.html'),'utf8');a.match(html,/fxOk\?"원화 환산"/);
  for(const k of ['benchmark-fx-converted','fx-official-unchecked','fx-history-unavailable','fx-date-missing','fx-source-conflict'])a.match(html,new RegExp('"'+k+'":"[^"]+"'));
  a.match(html,/미국 연준 H\.10 공식값과 1% 이내 대조/);a.match(html,/<script defer src="has\/fx-history\.js"><\/script>/);
  a.doesNotMatch(fs.readFileSync(path.join(ROOT,'has/fx-history.js'),'utf8').replace(/^\s*\/?\*.*$/gm,''),/https?:\/\//,'모듈은 외부 주소 없음');});
