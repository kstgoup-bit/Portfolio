/* Synthetic data only. Blocks all third-party requests and legacy auto fetches.
 * Run npm install; npx playwright install chromium; npm run test:mobile.
 * Optional BROWSER_EXECUTABLE_PATH and KST_TEST_FONTS_DIR for managed runtimes.
 */
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const cp=require('node:child_process');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const repo=path.resolve(__dirname,'..');
const out=path.join(repo,'test-results');fs.mkdirSync(out,{recursive:true});
const baseRef='fd2599398d2f2ef1816ca9b64ea134ea8811309d';
let fonts=process.env.KST_TEST_FONTS_DIR;
if(!fonts){try {fonts=path.dirname(require.resolve('@fontsource/noto-sans-kr/400.css'));}catch{}}
const fontCSS=fonts?fs.readFileSync(path.join(fonts,'400.css'),'utf8').replaceAll('./files/','/__fonts/files/')+fs.readFileSync(path.join(fonts,'700.css'),'utf8').replaceAll('./files/','/__fonts/files/'):'';
const baselineFile=process.env.KST_BASELINE_HTML||path.join(repo,'..','baseline','portfolio_v5.html');
const baselineHTML=fs.existsSync(baselineFile)?fs.readFileSync(baselineFile,'utf8'):cp.execFileSync('git',['show',baseRef+':portfolio_v5.html'],{cwd:repo,encoding:'utf8',maxBuffer:2000000});
const mime=p=>p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.css')?'text/css':p.endsWith('.js')?'text/javascript':p.endsWith('.json')?'application/json':p.endsWith('.woff2')?'font/woff2':'application/octet-stream';
const server=http.createServer((req,res)=>{
 try {
  const pathname=decodeURIComponent(req.url.split('?')[0]);
  if(pathname==='/__baseline/portfolio_v5.html'){res.setHeader('Content-Type',mime('.html'));res.end(baselineHTML);return;}
  const font=pathname.startsWith('/__fonts/');
  const dir=font?fonts:repo;
  if(!dir)throw Error();
  const file=path.resolve(dir,'.'+(font?pathname.replace('/__fonts',''):pathname.replace('/__baseline','')));
  if(!file.startsWith(path.resolve(dir)+path.sep))throw Error();
  res.setHeader('Content-Type',mime(file));res.setHeader('Cache-Control','no-store');res.end(pathname==='/sell/style.css'?fs.readFileSync(file,'utf8')+'\n'+fontCSS+"\nbody{font-family:'Noto Sans KR',sans-serif}":fs.readFileSync(file));
 }catch{res.statusCode=404;res.end('not found');}
});
const checks=[];let browser,origin;
async function check(name,fn){try{const detail=await fn();checks.push({name,status:'pass',...(detail?{detail}: {})});console.log('PASS',name);}catch(e){checks.push({name,status:'fail',error:e.message});console.error('FAIL',name,e.message);throw e;}}
async function context(width,{sw=false,seed=true}={}){
 const ctx=await browser.newContext({viewport:{width,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,serviceWorkers:sw?'allow':'block'});
 await ctx.route('**/*',r=>{
  if(r.request().url().startsWith(origin+'/'))return r.continue();
  if(r.request().url().startsWith('https://fonts.googleapis.com/'))return r.fulfill({contentType:'text/css',body:fontCSS.replaceAll('/__fonts/',origin+'/__fonts/')});
  return r.abort();
 });
 await ctx.addInitScript(({seed})=>{
  sessionStorage.setItem('v5_auth','1');
  if(seed && !sessionStorage.getItem('kstTestSeeded')){
   for(const [i,k] of ['dom','ov','pen','gen'].entries())localStorage.setItem('v5_'+k,JSON.stringify([{id:1,name:'시험기업 '+k,ticker:'TEST'+i,quantity:2,avgPrice:40,currentPrice:50}]));
   localStorage.setItem('v5_snap',JSON.stringify({all:[{ts:Date.UTC(2026,9,1),val:100000,cost:90000}],dom:[],ov:[],pen:[],gen:[]}));
   for(const k of ['v5_debtBank','v5_debtHouse','v5_nonFinAssets'])localStorage.setItem(k,'[]');
   localStorage.setItem('v5_div','[{"ticker":"TEST1","date":"2026-10-01","amount":1}]');
   localStorage.setItem('v5_memos','[{"text":"보존 시험","ts":1790812800000}]');
   localStorage.setItem('v5_geminiKey','TEST-KEY-NEVER-SEND');
   localStorage.setItem('v5_alphaVantageKey','TEST-KEY-NEVER-SEND');
   localStorage.setItem('unrelated-key','KEEP');
   sessionStorage.setItem('kstTestSeeded','1');
  }
  document.addEventListener('DOMContentLoaded',()=>{for(const f of ['fetchBenchmarkHistory','fetchFX','fetchKR','fetchUS','fetchRiskData'])window[f]=()=>{};});
 },{seed});
 return ctx;
}
const storage=page=>page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).filter(k=>!k.startsWith('kst.radar')).map(k=>[k,localStorage.getItem(k)])));
async function settleFonts(page){if(page.url().includes('/sell/')){await page.evaluate(()=>document.fonts.ready);return;}if(fontCSS){await page.addStyleTag({content:fontCSS.replaceAll('/__fonts/',origin+'/__fonts/')+"\nbody{font-family:'Noto Sans KR',sans-serif!important}"});await page.evaluate(()=>document.fonts.ready);}}
async function geometry(page,full=false){
 const result=await page.evaluate((full)=>{
  const root=document.querySelector('#panel-radar');
  const bad=root?[...root.querySelectorAll('button,input,select')].filter(e=>e.getClientRects().length && e.getBoundingClientRect().height<43.9).map(e=>({id:e.id,text:e.textContent,height:e.getBoundingClientRect().height})):[];
  const over=root?[...root.querySelectorAll('*')].filter(e=>e.getClientRects().length && e.getBoundingClientRect().right>innerWidth+.5).map(e=>e.tagName+':'+e.textContent.slice(0,60)):[];
  return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,smallControls:bad,overflowElements:over};
 },full);
 assert.equal(result.scrollWidth,result.width);assert.deepEqual(result.smallControls,[]);assert.deepEqual(result.overflowElements,[]);return result;
}
async function openRadar(page){await page.locator('#gtab-risk').click();await page.locator('#subtabs-risk button').filter({hasText:'곡소리 레이더'}).click();await page.waitForFunction(()=>document.querySelector('#kr-rows')?.textContent.includes('16개 표시'));}
async function demo(page){await page.locator('#kr-mode').selectOption('demo');await page.waitForFunction(()=>document.querySelector('#kr-rows')?.textContent.includes('3개 표시'));}
async function shot(page,name){await settleFonts(page);await page.evaluate(()=>window.scrollTo({top:0,left:0,behavior:'instant'}));await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
 const opts={headless:true};if(process.env.BROWSER_EXECUTABLE_PATH){opts.executablePath=process.env.BROWSER_EXECUTABLE_PATH;opts.args=['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader'];}
 browser=await chromium.launch(opts);
 for(const width of [360,390,430]){
  await check('baseline '+width+'px',async()=>{const ctx=await context(width);try{const p=await ctx.newPage(),errs=[];p.on('pageerror',e=>errs.push(e.message));await p.goto(origin+'/__baseline/portfolio_v5.html');await shot(p,'baseline-'+width);const data=await geometry(p);assert.deepEqual(errs,[]);return data;}finally{await ctx.close();}});
  await check('mobile views, history, filters and preservation '+width+'px',async()=>{
   const ctx=await context(width);try {
   const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(origin+'/portfolio_v5.html');await settleFonts(page);const before=await storage(page);
   await openRadar(page);await shot(page,'radar-real-'+width);await geometry(page);
   assert.match(await page.locator('[data-testid="mode-banner"]').innerText(),/API 미연결/);
   await demo(page);await shot(page,'radar-demo-'+width);await geometry(page);
   await page.locator('#kr-search').fill('알파');assert.equal(await page.locator('.kr-candidate').count(),1);await page.locator('#kr-search').fill('');
   await page.locator('#kr-sector').selectOption('가상 소비재');assert.equal(await page.locator('.kr-candidate').count(),1);await page.locator('#kr-sector').selectOption('');
   await page.locator('#kr-sort').selectOption('drawdown');assert.equal(await page.locator('.kr-candidate').first().getAttribute('data-ticker'),'DEMO-B');
   await page.locator('#kr-sort').selectOption('score');assert.equal(await page.locator('.kr-candidate').first().getAttribute('data-ticker'),'DEMO-A');
   await page.locator('#kr-signal').click();assert.equal(await page.locator('.kr-candidate').count(),2);await page.locator('#kr-signal').click();
   await page.getByRole('button',{name:'상세 분석 · DEMO-A',exact:true}).click();assert.match(await page.locator('#panel-radar').innerText(),/데모 88/);assert.equal(await page.evaluate(()=>scrollY),0);await shot(page,'radar-detail-'+width);await geometry(page);
   await page.goBack();await page.waitForSelector('#kr-rows');
   await page.getByRole('button',{name:'상세 분석 · DEMO-C',exact:true}).click();assert.match(await page.locator('#panel-radar').innerText(),/평가 불가 \/ データ不足|평가 불가 \/ 데이터 부족/);await geometry(page);await page.getByRole('button',{name:'← 후보 목록으로',exact:true}).click();
   await page.getByRole('button',{name:'상세 분석 · DEMO-B',exact:true}).click();assert.match(await page.locator('#panel-radar').innerText(),/위험 우선/);
   await page.getByRole('button',{name:'감시 기준',exact:true}).click();await shot(page,'radar-criteria-'+width);await geometry(page);
   await page.locator('#kr-dd-0').fill('22');await page.getByRole('button',{name:'감시 기준 저장',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#kr-message')?.textContent.includes('저장했습니다'));
   await page.getByRole('button',{name:'데이터 상태',exact:true}).click();await shot(page,'radar-status-'+width);await geometry(page);
   // Download is scoped; backup must not contain portfolio or key names.
   const dl=page.waitForEvent('download');await page.getByRole('button',{name:'레이더 설정 백업',exact:true}).click();const download=await dl;const text=fs.readFileSync(await download.path(),'utf8');assert.equal(JSON.parse(text).settings.drawdowns[0],22);assert.doesNotMatch(text,/v5_|TEST-KEY|ovStocks/);
   const restore={schemaVersion:1,settings:{drawdowns:[10,20,30,40],marketUnderperformance:18,sectorUnderperformance:12}};
   page.once('dialog',d=>d.accept());await page.locator('#kr-restore').setInputFiles({name:'radar.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(restore))});await page.waitForFunction(()=>document.querySelector('#kr-message')?.textContent.includes('복원했습니다'));
   await page.getByRole('button',{name:'복원 전 설정 되돌리기',exact:true}).click();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('kst.radar.state')).settings.drawdowns[0]),22);
   await page.locator('#kr-restore').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"schemaVersion":99}')});await page.waitForFunction(()=>document.querySelector('#kr-message')?.textContent.includes('복원 실패'));
   await page.locator('#gtab-invest').click();assert.ok(await page.locator('#panel-dashboard').evaluate(e=>e.classList.contains('active')));await page.goBack();await page.waitForFunction(()=>document.querySelector('#panel-radar').classList.contains('active'));
   await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.reload();await page.waitForFunction(()=>document.querySelector('#panel-radar').classList.contains('active'));
   assert.deepEqual(await storage(page),before);assert.deepEqual(errors,[]);
   return {width,legacyStorageUnchanged:true,jsErrors:errors};
   }finally{await ctx.close();}
  });
 }
 for(const width of [360,390,430])await check('full portfolio backup restore preview, cancel, apply, undo and legacy '+width+'px',async()=>{
  const ctx=await context(width);try{const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(origin+'/portfolio_v5.html');await settleFonts(p);await p.evaluate(()=>switchTab('settings'));
  const original=await p.evaluate(()=>KSTPortfolioBackup.create(localStorage));
  const dl=p.waitForEvent('download');await p.evaluate(()=>exportData());const text=fs.readFileSync(await(await dl).path(),'utf8');const exported=JSON.parse(text);assert.ok(exported.storage.v5_gen);
  const modified=structuredClone(exported);for(const key of ['v5_gen','v5_dom','v5_ov','v5_pen'])modified.storage[key]=JSON.stringify([{id:7,name:'합성 한국어 & “특수”',ticker:'RESTORE_TEST',quantity:3.5,avgPrice:123.45,currentPrice:150}]);
  const file={name:'full.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(modified))};const before=await storage(p);
  await p.locator('#restoreFile').setInputFiles(file);await p.getByRole('button',{name:'복원 취소',exact:true}).waitFor();await shot(p,'backup-preview-'+width);assert.deepEqual(await storage(p),before);await p.getByRole('button',{name:'복원 취소',exact:true}).click();assert.deepEqual(await storage(p),before);
  await p.locator('#restoreFile').setInputFiles(file);await p.getByRole('button',{name:'복원 적용',exact:true}).click();await p.waitForFunction(()=>document.querySelector('#backupMsg').textContent.includes('복원 완료'));for(const key of ['v5_gen','v5_dom','v5_ov','v5_pen'])assert.equal(await p.evaluate(key=>JSON.parse(localStorage.getItem(key))[0].quantity,key),3.5);
  await p.reload();await p.evaluate(()=>switchTab('settings'));assert.equal(await p.evaluate(()=>genStocks[0].ticker),'RESTORE_TEST');p.once('dialog',d=>d.accept());await p.getByRole('button',{name:'전체 복원 되돌리기',exact:true}).click();for(const key of ['v5_gen','v5_dom','v5_ov','v5_pen'])assert.equal(await p.evaluate(key=>localStorage.getItem(key),key),before[key]);
  const legacy={version:'v5',domStocks:[]};const genBefore=await p.evaluate(()=>localStorage.getItem('v5_gen'));await p.locator('#restoreFile').setInputFiles({name:'legacy.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacy))});await p.getByRole('button',{name:'복원 적용',exact:true}).click();assert.equal(await p.evaluate(()=>localStorage.getItem('v5_gen')),genBefore);assert.equal(await p.evaluate(()=>localStorage.getItem('v5_dom')),'[]');
  const invalids=['{','{"format":"kst-portfolio-backup","schemaVersion":99}',JSON.stringify({version:'v5',genStocks:[{id:1,name:'<img src=x onerror=alert(1)>',ticker:'TEST',quantity:1,avgPrice:1,currentPrice:1}]})];
  for(const text of invalids){const before=await storage(p);await p.locator('#restoreFile').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from(text)});await p.waitForFunction(()=>document.querySelector('#backupMsg').textContent.includes('거절'));assert.deepEqual(await storage(p),before);}
  await shot(p,'backup-status-'+width);
  const dimensions=await p.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,small:[...document.querySelectorAll('#portfolioBackupCard button')].filter(e=>e.getBoundingClientRect().height<44).length}));assert.equal(dimensions.width,dimensions.scrollWidth);assert.equal(dimensions.small,0);assert.deepEqual(errors,[]);return {width,accounts:4,previewReadOnly:true,legacyGeneralPreserved:true,errors};
  }finally{await ctx.close();}
 });
 await check('portfolio restore journal quota failure leaves all account keys unchanged',async()=>{
  const ctx=await context(390);try{const p=await ctx.newPage();await p.goto(origin+'/portfolio_v5.html');await p.evaluate(()=>switchTab('settings'));const before=await storage(p);await p.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='kst.portfolio.restoreJournal')throw new DOMException('synthetic quota','QuotaExceededError');return original.call(this,k,v);};});await p.locator('#restoreFile').setInputFiles({name:'empty.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:'v5',genStocks:[]}))});await p.getByRole('button',{name:'복원 적용',exact:true}).click();assert.deepEqual(await storage(p),before);assert.equal(await p.locator('#portfolioRestorePreview').count(),1);
  }finally{await ctx.close();}
 });
 await check('hidden dashboard chart crash reproduced on baseline and fixed in development',async()=>{
  const ctx=await context(390);try{const p=await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(origin+'/__baseline/portfolio_v5.html');await p.evaluate(()=>{renderDashboard();switchTab('risk');});await p.waitForTimeout(200);assert.ok(errors.some(e=>e.includes('createLinearGradient')),'Baseline must demonstrate the original crash');const baselineErrors=errors.slice();errors.length=0;await p.goto(origin+'/portfolio_v5.html');await p.evaluate(()=>{renderDashboard();switchTab('risk');});await p.waitForTimeout(200);assert.deepEqual(errors,[]);return {baselineErrors,developmentErrors:errors};}finally{await ctx.close();}
 });
 await check('legacy holding CRUD, calculations and export (four accounts)',async()=>{
  const ctx=await context(390);try{const p=await ctx.newPage();await p.goto(origin+'/portfolio_v5.html');const protectedKeys=await p.evaluate(()=>Object.fromEntries(['v5_snap','v5_div','v5_memos','unrelated-key'].map(k=>[k,localStorage.getItem(k)])));
  for(const [type,tab] of [['dom','domestic'],['ov','overseas'],['pen','pension'],['gen','general']]){
   await p.evaluate(tab=>switchTab(tab),tab);
   const old=await p.evaluate(type=>JSON.parse(localStorage.getItem('v5_'+type)),type);
   await p.evaluate(type=>toggleAdd(type),type);await p.locator('#an_'+type).fill('회귀 시험 기업');await p.locator('#at_'+type).fill('QATEST');await p.locator('#aq_'+type).fill('4');await p.locator('#aa_'+type).fill('20');await p.locator('#ac_'+type).fill('25');await p.evaluate(type=>addStock(type),type);
   const id=await p.evaluate(type=>JSON.parse(localStorage.getItem('v5_'+type)).find(s=>s.ticker==='QATEST').id,type);
   await p.evaluate(({id,type})=>toggleEdit(id,type),{id,type});await p.locator('#eq_'+type+'_'+id).fill('6');await p.locator('#ea_'+type+'_'+id).fill('30');await p.locator('#ec_'+type+'_'+id).fill('35');await p.evaluate(({id,type})=>toggleEdit(id,type),{id,type});await p.waitForFunction(type=>JSON.parse(localStorage.getItem('v5_'+type)).some(s=>s.ticker==='QATEST'&&s.quantity===6),type);
   const calc=await p.evaluate(type=>{let arr=type==='dom'?domStocks:type==='ov'?ovStocks:type==='pen'?penStocks:genStocks;return calcGroup(arr,type==='ov');},type);assert.ok(calc.tv>calc.tc);
   p.once('dialog',d=>d.accept());await p.evaluate(({id,type})=>delStock(id,type),{id,type});assert.deepEqual(await p.evaluate(type=>JSON.parse(localStorage.getItem('v5_'+type)),type),old);
  }
  const dl=p.waitForEvent('download');await p.evaluate(()=>exportData());const backup=JSON.parse(fs.readFileSync(await (await dl).path(),'utf8'));assert.equal(backup.schemaVersion,6);for(const k of ['v5_gen','v5_dom','v5_ov','v5_pen'])assert.equal(JSON.parse(backup.storage[k]).length,1);assert.equal(JSON.parse(backup.storage.v5_snap).all.length,1);assert.doesNotMatch(JSON.stringify(backup),/TEST-KEY-NEVER-SEND/);
  assert.deepEqual(await p.evaluate(()=>Object.fromEntries(['v5_snap','v5_div','v5_memos','unrelated-key'].map(k=>[k,localStorage.getItem(k)]))),protectedKeys);
  return {accounts:4,exportSchema:6,generalAccountIncluded:true};
  }finally{await ctx.close();}
 });
 await check('loading, provider failure, missing data and retry UI',async()=>{
  const ctx=await context(360);try{const p=await ctx.newPage();await p.goto(origin+'/portfolio_v5.html');await openRadar(p);let release;await p.route('**/radar/data/demo.json',async r=>{await new Promise(resolve=>release=resolve);await r.fulfill({status:503,contentType:'application/json',body:'{}'});});
  await p.locator('#kr-mode').selectOption('demo');await p.getByText('데이터 불러오는 중…',{exact:true}).waitFor();assert.equal(await p.getByRole('button',{name:'데이터 다시 읽기',exact:true}).isDisabled(),true);await shot(p,'radar-loading-360');release();await p.getByRole('alert').filter({hasText:'데이터 불러오기 실패'}).waitFor();assert.equal(await p.locator('.kr-candidate').count(),0);await shot(p,'radar-error-360');await geometry(p);
  await p.unroute('**/radar/data/demo.json');await p.getByRole('button',{name:'데이터 다시 읽기',exact:true}).click();await p.waitForFunction(()=>document.querySelector('#kr-rows')?.textContent.includes('3개 표시'));
  }finally{await ctx.close();}
 });
 await check('malicious text is rendered without HTML execution',async()=>{
  const ctx=await context(390);try{const p=await ctx.newPage();const d=JSON.parse(fs.readFileSync(path.join(repo,'radar/data/demo.json')));d.quotes[0].company='<img src=x onerror="window.KSTXSS=1">';await p.route('**/radar/data/demo.json',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(d)}));await p.goto(origin+'/portfolio_v5.html');await openRadar(p);await demo(p);assert.equal(await p.locator('#panel-radar img').count(),0);assert.equal(await p.evaluate(()=>window.KSTXSS),undefined);assert.match(await p.locator('#kr-rows').innerText(),/<img/);
  }finally{await ctx.close();}
 });
 await check('duplicate provider ticker is shown as error',async()=>{
  const ctx=await context(390);try{const p=await ctx.newPage();const d=JSON.parse(fs.readFileSync(path.join(repo,'radar/data/demo.json')));d.quotes.push(d.quotes[0]);await p.route('**/radar/data/demo.json',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(d)}));await p.goto(origin+'/portfolio_v5.html');await openRadar(p);await p.locator('#kr-mode').selectOption('demo');await p.getByRole('alert').filter({hasText:'데이터 불러오기 실패'}).waitFor();assert.equal(await p.locator('.kr-candidate').count(),0);
  }finally{await ctx.close();}
 });
 for(const width of [360,390,430])await check('stage4 pilot blocked status and dated synthetic demo '+width+'px',async()=>{
  const ctx=await context(width);try{const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(origin+'/portfolio_v5.html');await openRadar(p);const before=await storage(p);await p.getByRole('button',{name:'데이터 상태',exact:true}).click();const text=await p.locator('#kr-pilot-status').innerText();for(const ticker of ['MSFT','GOOGL','AVGO','VRT','JPM'])assert.ok(text.includes(ticker));assert.match(text,/실제 가격 API 요청 0건/);assert.match(text,/활성 0 \/ 보류 16 \/ 제외 0/);await shot(p,'radar-pilot-status-'+width);await geometry(p);
  const d=JSON.parse(fs.readFileSync(path.join(repo,'radar/data/demo.json')));for(const q of d.quotes){q.asOf='2020-01-02';q.high52wStart='2019-01-03';q.high52wEnd=q.asOf;q.performance.start='2019-10-02';q.performance.end=q.asOf;}
  await p.route('**/radar/data/demo.json',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(d)}));await p.locator('#kr-mode').selectOption('demo');await p.waitForFunction(()=>document.querySelector('#kr-freshness')?.dataset.state==='stale');assert.match(await p.locator('#kr-freshness').innerText(),/기준일 지연/);assert.match(await p.locator('[data-testid="mode-banner"]').innerText(),/데모/);await shot(p,'radar-delayed-demo-'+width);await geometry(p);assert.deepEqual(await storage(p),before);assert.deepEqual(errors,[]);return {width,pilot:'blocked',actualPriceRequests:0,staleDemoExplicit:true};
  }finally{await ctx.close();}
 });
 await check('stage4 eligibility version mismatch fails closed and retries',async()=>{
  const ctx=await context(390);try{const p=await ctx.newPage();const r=JSON.parse(fs.readFileSync(path.join(repo,'radar/data/eligibility.json')));r.universeVersion='wrong';await p.route('**/radar/data/eligibility.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(r)}));await p.goto(origin+'/portfolio_v5.html');await p.evaluate(()=>switchTab('radar'));await p.getByRole('alert').filter({hasText:'데이터 불러오기 실패'}).waitFor();assert.equal(await p.locator('.kr-candidate').count(),0);await shot(p,'radar-review-error-390');await p.unroute('**/radar/data/eligibility.json');await p.getByRole('button',{name:'데이터 다시 읽기',exact:true}).click();await p.waitForFunction(()=>document.querySelector('#kr-rows')?.textContent.includes('16개 표시'));
  }finally{await ctx.close();}
 });
 await check('stage4 interrupted portfolio restore is recovered before app load',async()=>{
  const ctx=await context(390);try{const p=await ctx.newPage();await p.goto(origin+'/portfolio_v5.html');const original=await p.evaluate(()=>localStorage.getItem('v5_gen'));await p.evaluate(()=>{KSTPortfolioBackup.apply(localStorage,KSTPortfolioBackup.parse(JSON.stringify({version:'v5',genStocks:[]})));const j=KSTPortfolioBackup.readJournal(localStorage);j.status='prepared';localStorage.setItem(KSTPortfolioBackup.JOURNAL,JSON.stringify(j));});await p.reload();assert.equal(await p.evaluate(()=>localStorage.getItem('v5_gen')),original);assert.equal(await p.evaluate(()=>genStocks.length),1);assert.equal(await p.evaluate(()=>KSTPortfolioBackup.readJournal(localStorage).status),'undone');await p.evaluate(()=>switchTab('settings'));await shot(p,'backup-interrupted-recovery-390');
  }finally{await ctx.close();}
 });
 for(const width of [360,390,430])await check('stage5 isolated sell synthetic views, history, reload, offline and preservation '+width+'px',async()=>{
  const ctx=await context(width);try{const p=await ctx.newPage(),errors=[],external=[];p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(!r.url().startsWith(origin+'/'))external.push(r.url());});
   await p.goto(origin+'/sell/index.html');const before=await storage(p);assert.equal(await p.locator('article').count(),5);assert.match(await p.locator('aside').innerText(),/설계 \/ 합성 데모/);
   const measure=async()=>{const g=await p.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,small:[...document.querySelectorAll('button,a')].filter(e=>e.getBoundingClientRect().height<44).map(e=>e.textContent)}));assert.equal(g.width,g.scroll);assert.deepEqual(g.small,[]);};
   await measure();await shot(p,'sell-list-'+width);
   await p.getByRole('link',{name:'합성 상세 · SELL-DEMO-C',exact:true}).click();await p.waitForFunction(()=>document.querySelectorAll('article').length===1);assert.match(await p.locator('#content').innerText(),/일부 매도 검토/);assert.match(await p.locator('#content').innerText(),/반대 근거/);await measure();await shot(p,'sell-detail-'+width);
   await p.reload();assert.equal(await p.locator('article').count(),1);await p.goBack();await p.waitForFunction(()=>document.querySelectorAll('article').length===5);
   await p.evaluate(()=>document.fonts.load("16px 'Noto Sans KR'",'밸류에이션·3년 이상 과거범위·성장·현금흐름·전망 근거'));await ctx.setOffline(true);await p.getByRole('link',{name:'합성 상세 · SELL-DEMO-E',exact:true}).click();await p.waitForFunction(()=>document.querySelectorAll('article').length===1);assert.match(await p.locator('#content').innerText(),/평가 불가/);await shot(p,'sell-missing-'+width);await p.getByRole('button',{name:'합성 목록',exact:true}).click();await ctx.setOffline(false);
   await p.goto(origin+'/sell/index.html#invalid');assert.match(await p.locator('#message').innerText(),/알 수 없는 합성 사례/);await p.getByRole('button',{name:'합성 목록',exact:true}).click();await p.waitForFunction(()=>document.querySelectorAll('article').length===5);
   assert.deepEqual(await storage(p),before);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  }finally{await ctx.close();}
 });
 await check('stage5 sell module load failure and retry, XSS and CSP',async()=>{
  const ctx=await context(390);try{const p=await ctx.newPage();await ctx.route('**/sell/fixtures.js',r=>r.abort());await p.goto(origin+'/sell/index.html');assert.match(await p.locator('#message').innerText(),/로드 실패/);await shot(p,'sell-load-error-390');await ctx.unroute('**/sell/fixtures.js');await p.reload();assert.equal(await p.locator('article').count(),5);
   await p.evaluate(()=>{const original=KSTSellFixtures.cases;KSTSellFixtures.cases=()=>{const x=original();x[0].valuation.evidence.counterEvidence='<img src=x onerror="window.sellXss=1">';return x;};location.hash='SELL-DEMO-A';});await p.waitForFunction(()=>document.querySelector('#content').textContent.includes('<img'));assert.equal(await p.locator('#content img').count(),0);assert.equal(await p.evaluate(()=>window.sellXss),undefined);
   const policy=await p.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');assert.ok(policy.includes("connect-src 'none'"));
  }finally{await ctx.close();}
 });
 await check('PWA worker local network-first and offline cached HTML',async()=>{
  const ctx=await context(390,{sw:true});try{const p=await ctx.newPage();await p.goto(origin+'/portfolio_v5.html');await p.evaluate(()=>Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('Service worker readiness timeout')),10000))]));await p.reload();await p.waitForFunction(()=>navigator.serviceWorker.controller!==null);const data=await p.evaluate(async()=>{const keys=await caches.keys();const match=await caches.match('./portfolio_v5.html');return {keys,cached:!!match,html:match?await match.text():''};});assert.ok(data.cached);assert.match(data.html,/panel-radar/);await ctx.setOffline(true);await p.reload();assert.ok(await p.locator('#gtab-invest').count());await ctx.setOffline(false);return {cacheKey:data.keys.find(k=>k.startsWith('portfolio-v5-')),cachedHTML:true,offlineNavigation:true,note:'fresh local worker only; installed Android cache not modified'};
  }finally{await ctx.close();}
 });
})().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(async()=>{
 fs.writeFileSync(path.join(out,'mobile-results.json'),JSON.stringify({baseRef,checks,passed:checks.filter(c=>c.status==='pass').length,failed:checks.filter(c=>c.status==='fail').length},null,2));
 if(browser)await browser.close();server.close();
});
