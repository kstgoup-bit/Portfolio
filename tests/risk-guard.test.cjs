'use strict';
// has/risk-guard.js + portfolio_v5.html fetchRiskData 시험(외부 접속 없음, fetch·저장소 가짜).
const test=require('node:test'),a=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path');
const G=require('../has/risk-guard.js');
const NOW=Date.parse('2026-11-26T08:00:00Z');
const csv=(id,rows)=>'DATE,'+id+'\n'+rows.map(r=>r.join(',')).join('\n');
test('FRED: 머리글 ID 일치·형식 정상이면 마지막 숫자 줄, "."는 건너뜀',()=>{a.deepEqual(G.parseFred(csv('DGS10',[['2026-11-24','4.02'],['2026-11-25','.']]),'DGS10'),{v:4.02,d:'2026-11-24'});a.deepEqual(G.parseFred('observation_date,VIXCLS\n2026-11-25,17.2','VIXCLS'),{v:17.2,d:'2026-11-25'});});
test('FRED: 오류 HTML·다른 ID·형식 어긋남은 거부(예전엔 1을 읽던 입력)',()=>{for(const [t,id] of [['<html>\n<p>Error, 1 requests blocked</p>','DGS10'],[csv('DGS2',[['2026-11-24','4']]),'DGS10'],[csv('DGS10',[['x','4']]),'DGS10'],[csv('DGS10',[['2026-11-24','4abc']]),'DGS10'],['',"DGS10"],[null,'DGS10'],['DATE,DGS10,EXTRA\n2026-11-24,4,5','DGS10']])a.equal(G.parseFred(t,id),null);});
const ychart=(sym,p,t)=>JSON.stringify({chart:{result:[{meta:{symbol:sym,regularMarketPrice:p,regularMarketTime:t}}]}});
test('Yahoo: 심볼 일치·가격·시각이 숫자일 때만',()=>{const t=Date.parse('2026-11-25T21:00:00Z')/1000;a.deepEqual(G.parseYahoo(ychart('^VIX',17.2,t),'^VIX'),{v:17.2,d:'2026-11-25'});for(const x of [ychart('^TNX',17.2,t),ychart('^VIX','17',t),ychart('^VIX',0,t),ychart('^VIX',17,0),'{',JSON.stringify({chart:{result:[]}})])a.equal(G.parseYahoo(x,'^VIX'),null);});
test('accept: 범위·관측일·HY는 %→bps 변환',()=>{a.deepEqual(G.accept('hy',{v:3.05,d:'2026-11-25'},NOW),{ok:true,v:305,asOf:'2026-11-25'});a.equal(G.accept('hy',{v:1.0,d:'2026-11-25'},NOW).reason,'out-of-range');a.equal(G.accept('vix',{v:3.0,d:'2026-11-25'},NOW).reason,'out-of-range');a.equal(G.accept('vix',{v:17.24,d:'2026-11-25'},NOW).v,17.2);a.equal(G.accept('vix',{v:17,d:'2026-11-10'},NOW).reason,'old');a.equal(G.accept('vix',{v:17,d:'2026-12-10'},NOW).reason,'future');a.equal(G.accept('vix',null,NOW).reason,'no-data');a.equal(G.accept('zzz',{v:1,d:'2026-11-25'},NOW).reason,'unknown-kind');a.equal(G.accept('dxy',{v:'100',d:'2026-11-25'},NOW).reason,'no-data');});
const good=()=>({vix:G.accept('vix',{v:17.2,d:'2026-11-25'},NOW),rate:G.accept('rate',{v:4.02,d:'2026-11-25'},NOW),hy:G.accept('hy',{v:3.05,d:'2026-11-25'},NOW),rate2:G.accept('rate2',{v:3.6,d:'2026-11-25'},NOW),dxy:G.accept('dxy',{v:99.4,d:'2026-11-25'},NOW),oil:G.accept('oil',{v:58.1,d:'2026-11-25'},NOW)});
test('merge: 전부 정상이면 핵심 충족·금리차 계산·기본값 없음',()=>{const m=G.merge({},good(),NOW);a.ok(G.hasCore(m.vals));a.equal(G.spread(m.vals),0.42);a.equal(m.vals.hy.v,305);a.ok(!m.vals.vix.stale);a.deepEqual(G.describe(m.vals,m.reasons).miss,[]);});
test('merge: 실패한 값은 7일 안의 검증된 이전 값만 stale로, 없으면 "없음"(가짜 기본값 금지)',()=>{const first=G.merge({},good(),NOW);const f=good();f.vix={ok:false,reason:'no-data'};f.dxy={ok:false,reason:'no-data'};const m=G.merge(first.vals,f,NOW+DAY());a.equal(m.vals.vix.stale,true);a.equal(m.vals.vix.asOf,'2026-11-25');
 const m2=G.merge({},f,NOW);a.equal(m2.vals.vix,undefined);a.equal(m2.vals.dxy,undefined);a.ok(G.hasCore(m2.vals)===false);const d=G.describe(m2.vals,m2.reasons);a.ok(d.miss.includes('VIX')&&d.miss.includes('DXY'));
 const m3=G.merge(first.vals,f,NOW+9*DAY());a.equal(m3.vals.vix,undefined);});
function DAY(){return 86400000;}
test('crossCheck: 10Y·2Y·HY가 같은 값이거나 10Y·2Y가 같은 정수면 폐기(화면의 1.00/1.00/100bps 재현)',()=>{const f=good();f.rate=G.accept('rate',{v:1.0,d:'2026-11-25'},NOW);f.rate2=G.accept('rate2',{v:1.0,d:'2026-11-25'},NOW);f.hy=G.accept('hy',{v:1.5,d:'2026-11-25'},NOW);
 let m=G.merge({},f,NOW);a.equal(m.vals.rate,undefined);a.equal(m.vals.rate2,undefined);a.ok(!G.hasCore(m.vals));a.ok(m.issues.length>0);
 const f2=good();f2.rate=G.accept('rate',{v:1,d:'2026-11-25'},NOW);f2.rate2=G.accept('rate2',{v:1,d:'2026-11-25'},NOW);m=G.merge({},f2,NOW);a.equal(m.vals.rate,undefined);});
test('sanitize: 옛 형식(기본값 280·4.5·18·100, VIX 3.0 포함)은 전부 버림, 손상·조작·오래된 값도 버림',()=>{
 for(const old of [{hy:280,rate:4.5,vix:18,dxy:100,spread:0.5,ts:NOW},{hy:100,rate:1,vix:3,dxy:100,spread:0,ts:NOW},null,5,[],{v:1},{v:2,vals:5}])a.deepEqual(G.sanitize(old,NOW).vals,{});
 const m=G.merge({},good(),NOW),raw=G.serialize(m.vals,40,NOW);a.equal(Object.keys(G.sanitize(raw,NOW+3600000).vals).length,6);
 const forged=JSON.parse(JSON.stringify(raw));forged.vals.vix.v=3;a.equal(G.sanitize(forged,NOW).vals.vix,undefined);
 const f2=JSON.parse(JSON.stringify(raw));f2.vals.vix.asOf='bad';a.equal(G.sanitize(f2,NOW).vals.vix,undefined);
 a.equal(G.sanitize(raw,NOW+9*DAY()).vals.vix,undefined);const f3=JSON.parse(JSON.stringify(raw));f3.vals.hy.at=NOW+10*60000*60;a.equal(G.sanitize(f3,NOW).vals.hy,undefined);
 a.equal(G.sanitize(raw,NOW).fg,40);const f4=JSON.parse(JSON.stringify(raw));f4.fg=500;a.equal(G.sanitize(f4,NOW).fg,null);});
test('mirror: 브리핑이 읽는 값은 검증된 v2만, 옛 값·없는 값은 null',()=>{const m=G.mirror({hy:280,rate:4.5,vix:18},NOW);a.equal(m.hy,null);a.equal(m.vix,null);a.equal(m.spread,null);const ok=G.mirror(G.serialize(G.merge({},good(),NOW).vals,31,NOW),NOW);a.equal(ok.vix,17.2);a.equal(ok.hy,305);a.equal(ok.spread,0.42);a.equal(ok.fg,31);});
test('모듈은 저장소·외부 접속·eval을 쓰지 않음',()=>{const s=fs.readFileSync(path.join(__dirname,'..','has/risk-guard.js'),'utf8');for(const w of ['localStorage','sessionStorage','fetch(','XMLHttpRequest','eval(','innerHTML','document.'])a.ok(!s.includes(w),w);});
// ---- 화면 함수(fetchRiskData) 시험: html에서 함수 본문을 꺼내 가짜 환경에서 실행 ----
const html=fs.readFileSync(path.join(__dirname,'..','portfolio_v5.html'),'utf8');
const fsrc=html.slice(html.indexOf('async function fetchRiskData()'),html.indexOf('function shortLabel(name, ticker)'));
function run(routes,stored){
  const store=new Map(stored?[['v5_riskData',JSON.stringify(stored)]]:[]);const els={};const el=id=>els[id]||(els[id]={id,textContent:'',style:{},disabled:false,value:''});
  const ui=[];const urls=[];
  const ctx={window:{HASRiskGuard:G},document:{getElementById:id=>id==='usdKrw'?{value:'1343'}:el(id)},localStorage:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v))},quietSet:(k,v)=>{store.set(k,v);return true;},
   rkUpdateUI:(...args)=>ui.push(args),AbortController,setTimeout,clearTimeout,encodeURIComponent,Date:class extends Date{constructor(...x){super(...(x.length?x:[NOW]));}static now(){return NOW;}},JSON,Promise,Math,parseFloat,isFinite,
   fetch:(u)=>{urls.push(u);const text=routes(u);return Promise.resolve(text===null?{ok:false,text:async()=>''}:{ok:true,text:async()=>text});}};
  vm.createContext(ctx);vm.runInContext(fsrc,ctx);return ctx.fetchRiskData().then(()=>({ctx,ui,store,els,urls}));
}
const fredBody=(id)=>({VIXCLS:csv('VIXCLS',[['2026-11-25','17.2']]),DGS10:csv('DGS10',[['2026-11-25','4.02']]),BAMLH0A0HYM2:csv('BAMLH0A0HYM2',[['2026-11-25','3.05']]),DGS2:csv('DGS2',[['2026-11-25','3.6']]),DCOILWTICO:csv('DCOILWTICO',[['2026-11-25','58.1']])}[id]);
const T=Date.parse('2026-11-25T21:00:00Z')/1000;
const route=(over)=>(u)=>{const raw=decodeURIComponent(u);const id=(raw.match(/fredgraph\.csv\?id=([A-Z0-9]+)/)||[])[1];if(id&&!/allorigins|corsproxy|codetabs|thingproxy/.test(u)){return over&&over[id]!==undefined?over[id]:fredBody(id);}
  const ys=raw.match(/chart\/([^?]+)\?/);if(ys&&!id){const sym=ys[1];if(sym==='DX-Y.NYB'&&!/allorigins/.test(u))return null;if(sym==='DX-Y.NYB')return ychart('DX-Y.NYB',99.4,T);}return null;};
test('화면 함수: 정상 응답이면 검증된 값으로 화면 갱신·저장, 기본값 없음',async()=>{const r=await run(route());a.equal(r.ui.length,1);const [hy,rate,vix,,dxy,spread,fg,oil]=r.ui[0];a.deepEqual([hy,rate,vix,dxy,spread,oil],[305,4.02,17.2,99.4,0.42,58.1]);const saved=JSON.parse(r.store.get('v5_riskData'));a.equal(saved.v,2);a.equal(saved.vix,17.2);a.match(r.els.rkStatus.textContent,/^✅/);a.ok(!/실패→이전값/.test(r.els.rkStatus.textContent));});
test('화면 함수: 오류 HTML이 먼저 와도 숫자로 읽지 않음 → 핵심 자료 없음, 점수 계산 안 함, 가짜 값 저장 안 함',async()=>{const junk='<html>\n<p>Rate limit, 1 request per second</p></html>';const r=await run(()=>junk,{hy:280,rate:4.5,vix:3,dxy:100,ts:NOW});a.equal(r.ui.length,0);a.match(r.els.rkStatus.textContent,/^❗ 핵심 지표/);const saved=JSON.parse(r.store.get('v5_riskData'));a.equal(saved.vix,null);a.equal(saved.hy,null);a.equal(saved.dxy,null);a.deepEqual(saved.vals,{});});
test('화면 함수: 일부 실패(VIX·WTI)면 이전 검증값을 "이전값"으로 표시하고 경고색, 옛 손상 저장값(VIX 3.0)은 쓰지 않음',async()=>{
 const prev=G.serialize(G.merge({},good(),NOW-86400000).vals,null,NOW-86400000);prev.vals.vix.at=NOW-86400000;
 const r=await run(route({VIXCLS:'garbage',DCOILWTICO:'garbage'}),prev);a.equal(r.ui.length,1);a.equal(r.ui[0][2],17.2);a.match(r.els.rkStatus.textContent,/^⚠️.*이전값/);a.equal(r.els.rkStatus.style.color,'#d97706');
 const bad=await run(route({VIXCLS:'garbage'}),{hy:280,rate:4.5,vix:3,ts:NOW});a.equal(bad.ui.length,0);a.match(bad.els.rkStatus.textContent,/^❗/);});
test('화면 함수: 모듈이 없으면 조회하지 않음',async()=>{const ctx={window:{},document:{getElementById:()=>({style:{}})}};vm.createContext(ctx);vm.runInContext(fsrc,ctx);await ctx.fetchRiskData();});
test('portfolio_v5.html: 검증 모듈 로드, 예전 파서·가짜 기본값·^IRX 2Y 대체 제거',()=>{a.ok(html.includes('<script defer src="has/risk-guard.js"></script>'));const f=fsrc;for(const w of ['||280','||4.5','||18','||100','%5EIRX','^IRX','function parseFred','function parseYahoo'])a.ok(!f.includes(w),w);a.ok(html.includes('HASRiskGuard.mirror'));a.ok(!/getItem\("v5_rkCache"\)/.test(html));});
