'use strict';
// Actual Chromium, isolated return-table fragment only. The production app boot
// and transport are never loaded. All valuations are invented, storage in memory.
const fs=require('node:fs'),path=require('node:path'),a=require('node:assert/strict'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'portfolio_v5.html'),'utf8');
const css=[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(x=>x[1]).join('\n');
const code=html.slice(html.indexOf('function returnRowHtml('),html.indexOf('function renderAllReturnsTables('));
(async()=>{const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE_PATH||'/usr/bin/chromium',args:['--no-sandbox']});try{
 for(const width of [360,430,1280]){const ctx=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block',isMobile:width<500,hasTouch:width<500});const attempts=[],errors=[];await ctx.route('**/*',r=>{attempts.push(r.request().url());return r.abort();});const page=await ctx.newPage();page.on('pageerror',e=>errors.push(String(e)));await page.setContent('<!doctype html><meta charset="utf-8"><style>'+css+'</style><div class="card" id="genReturnsCard" style="margin-top:14px"><div class="chart-title">합성 자료 · 일일기록 수정 시험</div><div id="genReturnsTable"></div></div>');
 for(const f of ['has/snapshot-policy.js','has/return-assessment.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,f),'utf8')});
 await page.evaluate(()=>{const now=Date.parse('2026-11-11T03:00:00Z'),start=now-30*86400000;
  function snap(ts,q){return HASSnapshotPolicy.evaluate({key:'gen',now:ts,accounts:{gen:[{id:1,ticker:'SYNTH',quantity:q,currentPrice:100,avgPrice:80}]},freshPrice:{'KR:SYNTH':true},quoteMeta:{'KR:SYNTH':ts-1},quoteValues:{'KR:SYNTH':100}}).snapshot;}
  window.snapshots={gen:[snap(start,10)]};window.candidate=snap(now,15);window.RETURN_PERIODS_LEFT=[{label:'1주',days:7}];window.RETURN_PERIODS_RIGHT=[{label:'1달',days:30}];window.snapshotEvaluation=()=>({ok:true,snapshot:candidate});window.snapshotEscape=s=>String(s).replace(/[<>&]/g,'');window.getReturnActivity=()=>({flows:[],flowAccounts:[]});window.benchmarkAssessmentForInterval=(k,fromTs,toTs)=>({valuePct:3,fromTs,toTs,currency:'KRW',status:'unverified',detail:'합성 ETF 관측'});window.getBenchDataLatestLabel=()=>({text:'합성 날짜',source:'SYNTHETIC'});window.getBenchFetchTimeLabel=()=>({text:'실호출 없음'});window._benchStatusMsg='합성 시험 · 실제 조회 없음';window.fetchBenchmarkHistory=()=>{};
 });
 await page.addScriptTag({content:code});await page.evaluate(()=>renderReturnsTable('gen','genReturnsTable'));
 a.match(await page.locator('#genReturnsTable').innerText(),/보유 변화 미검증/);a.match(await page.locator('#genReturnsTable').innerText(),/누락 여부 미검증/);a.equal(await page.locator('strong').filter({hasText:'미검증 참고값'}).count(),8);
 let layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth,small:[...document.querySelectorAll('#genReturnsTable button')].some(e=>{const r=e.getBoundingClientRect();return r.height<44||r.width<44;})}));a.ok(layout.overflow<=1,JSON.stringify(layout));a.equal(layout.small,false);
 await page.getByRole('button',{name:/ETF 이력 새로고침/}).click();await page.getByRole('button',{name:/ETF 이력 새로고침/}).click();await page.evaluate(()=>renderReturnsTable('gen','genReturnsTable'));a.equal(await page.locator('strong').count(),8);
 await page.evaluate(()=>{window.getReturnActivity=()=>({flows:null});renderReturnsTable('gen','genReturnsTable');});a.equal(await page.locator('strong').filter({hasText:'보류'}).count(),4);a.match(await page.locator('#genReturnsTable').innerText(),/입출금 자료 확인 필요/);
 a.deepEqual(attempts,[]);a.deepEqual(errors,[]);console.log('PASS '+width+'px: real Chromium fragment, warnings/holds/repeated render, no overflow or network');await ctx.close();}
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
